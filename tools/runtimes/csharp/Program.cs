// The C# runner's harness. Roslyn compiles the solution in memory against embedded reference
// assemblies; the assembly is loaded and the entry point (a public static method of that name)
// is called once per case, each JSON input decoded into the parameter's type.
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;
using Microsoft.CodeAnalysis.Text;
using System.Text;

public static class Runner
{
    static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        IncludeFields = true,
        NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.Strict,
        // Results are compared as data, so keep text readable rather than HTML-safe.
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    static readonly Lazy<MetadataReference[]> References = new(() =>
    {
        var self = typeof(Runner).Assembly;
        return self.GetManifestResourceNames()
            .Where(name => name.StartsWith("ref/"))
            .Select(name =>
            {
                using var stream = self.GetManifestResourceStream(name)!;
                using var copy = new MemoryStream();
                stream.CopyTo(copy);
                return (MetadataReference)MetadataReference.CreateFromImage(copy.ToArray());
            })
            .ToArray();
    });

    /// <summary>
    /// One call per run: the worker writes /mm/request.json and calls Main, then reads
    /// /mm/result.json. ("warm" compiles something small, so the first run is not slow.)
    /// A file, not [JSExport]: its generated wrappers have random names, and these builds must
    /// come out byte for byte the same.
    /// </summary>
    public static void Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "warm")
        {
            Compile("public static class Warm { public static int F() => 1; }", "warm.cs");
            return;
        }
        File.WriteAllText("/mm/result.json", Run(File.ReadAllText("/mm/request.json")));
    }

    static (Assembly? assembly, string? error) Compile(string code, string file)
    {
        var parse = new CSharpParseOptions(LanguageVersion.Latest);
        var tree = CSharpSyntaxTree.ParseText(SourceText.From(code, Encoding.UTF8), parse, path: file);
        var usings = CSharpSyntaxTree.ParseText(
            SourceText.From("global using System; global using System.Collections.Generic; global using System.Linq;", Encoding.UTF8),
            parse, path: "usings.cs");
        var compilation = CSharpCompilation.Create(
            "Solution", new[] { usings, tree }, References.Value,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary,
                nullableContextOptions: NullableContextOptions.Enable,
                optimizationLevel: OptimizationLevel.Debug,
                // One thread in the browser: a concurrent build would wait on locks forever.
                concurrentBuild: false));
        // No PDB: Roslyn computes its checksums on a background task and blocks on the result,
        // which one browser thread cannot do. Compile errors still carry lines; exceptions
        // name their methods.
        using var pe = new MemoryStream();
        var emitted = compilation.Emit(pe);
        if (!emitted.Success)
        {
            var errors = emitted.Diagnostics
                .Where(d => d.Severity == DiagnosticSeverity.Error)
                .Select(d => d.ToString());
            return (null, string.Join("\n", errors) + "\n");
        }
        return (Assembly.Load(pe.ToArray()), null);
    }

    static JsonObject Error(string type, string message, string traceback) => new()
    {
        ["type"] = type,
        ["message"] = message.Length > 2000 ? message[..2000] : message,
        ["traceback"] = traceback,
    };

    static string Trace(Exception error, string file)
    {
        // The solution's own frames: everything before reflection took over.
        var lines = (error.StackTrace ?? "").Split('\n')
            .Select(line => line.Trim())
            .TakeWhile(line => !line.Contains("System.Reflection") && !line.Contains("System.RuntimeMethodHandle") && !line.Contains("InvokeStub"))
            .Where(line => line.Length > 0)
            .Select(line => "  " + line);
        return $"{error.GetType().FullName}: {error.Message}\n{string.Join("\n", lines)}\n";
    }

    static string Run(string requestJson)
    {
        var request = JsonNode.Parse(requestJson)!.AsObject();
        var code = (string)request["code"]!;
        var file = (string)request["file"]!;
        var entrypoint = (string)request["entrypoint"]!;
        var spread = (bool)request["spread"]!;
        var inputs = request["inputs"]!.AsArray();

        var (assembly, compileError) = Compile(code, file);
        if (assembly is null)
            return new JsonObject
            {
                ["phase"] = "compile",
                ["error"] = Error("CompileError", "The code did not compile.", compileError!),
                ["tests"] = new JsonArray(),
            }.ToJsonString();

        var method = assembly.GetTypes()
            .SelectMany(type => type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly))
            .FirstOrDefault(m => m.Name == entrypoint);
        if (method is null)
            return new JsonObject
            {
                ["phase"] = "execute",
                ["error"] = Error("MissingMethodException", $"Define a public static method named {entrypoint}.", ""),
                ["tests"] = new JsonArray(),
            }.ToJsonString();

        var parameters = method.GetParameters();
        var tests = new JsonArray();
        for (var index = 0; index < inputs.Count; index++)
        {
            var input = inputs[index];
            var args = spread ? input!.AsArray().ToArray() : new[] { input };
            var test = new JsonObject { ["index"] = index };
            tests.Add(test);
            if (args.Length != parameters.Length)
            {
                test["error"] = Error("ArgumentException", $"{entrypoint} takes {parameters.Length} arguments; the case has {args.Length}.", "");
                continue;
            }
            object?[] values;
            try
            {
                values = parameters
                    .Select((parameter, i) => args[i]?.Deserialize(parameter.ParameterType, Json))
                    .ToArray();
            }
            catch (JsonException error)
            {
                test["error"] = Error("ArgumentException", "An argument does not fit its parameter: " + error.Message, "");
                continue;
            }
            object? result;
            try
            {
                result = method.Invoke(null, values);
            }
            catch (TargetInvocationException wrapped) when (wrapped.InnerException is { } error)
            {
                test["error"] = Error(error.GetType().Name, error.Message, Trace(error, file));
                continue;
            }
            test["repr"] = result?.ToString() ?? "null";
            try
            {
                test["json"] = JsonSerializer.Serialize(result, Json);
            }
            catch (Exception error) when (error is NotSupportedException or ArgumentException or JsonException)
            {
                test["unserializable"] = error.Message;
            }
        }
        return new JsonObject { ["phase"] = "tests", ["tests"] = tests }.ToJsonString();
    }
}
