import { PRELUDE } from "./shared";

/**
 * Ruby on ruby.wasm (CRuby compiled to WASI) with its standard library, so require "set",
 * "json" or "date" work as they do at work. Inputs go in as Ruby literals and results come
 * back through a small JSON encoder in the harness. The solution is evaluated at top level
 * under its repo path, so errors name the right file and line; puts goes to stdout.
 */
export const RUBY_WORKER =
  PRELUDE +
  String.raw`
let vm = null;

async function boot(assets) {
  // ruby.wasm prints through console.log/warn (captured when the VM starts), each chunk
  // already ending in its own newline.
  console.log = (text) => output && write("stdout", String(text));
  console.warn = (text) => output && write("stderr", String(text));
  console.error = console.warn;
  const url = URL.createObjectURL(new Blob([assets["ruby.js"]], { type: "text/javascript" }));
  const { DefaultRubyVM } = await import(url);
  ({ vm } = await DefaultRubyVM(await WebAssembly.compile(assets["ruby.wasm"]), {
    consolePrint: true,
  }));
  vm.eval(HARNESS);
}

/** A JSON value as a Ruby literal. "#" is escaped so strings never interpolate. */
function literal(value) {
  if (value === null) return "nil";
  if (Array.isArray(value)) return "[" + value.map(literal).join(", ") + "]";
  if (typeof value === "object")
    return "{" + Object.entries(value).map(([k, v]) => literal(k) + " => " + literal(v)).join(", ") + "}";
  if (typeof value === "string") return JSON.stringify(value).replace(/#/g, "\\#");
  return JSON.stringify(value);
}

const HARNESS = ${JSON.stringify(String.raw`
module MuscleMemory
  class Unserializable < StandardError; end

  def self.string(text)
    out = +'"'
    text.each_char do |char|
      code = char.ord
      out << if char == '"' || char == "\\"
        "\\" + char
      elsif code < 32
        format("\\u%04x", code)
      else
        char
      end
    end
    out << '"'
  end

  def self.json(value)
    case value
    when nil then "null"
    when true then "true"
    when false then "false"
    when Integer then value.to_s
    when Float
      raise Unserializable, "#{value} is not valid JSON" unless value.finite?
      value.to_s
    when String, Symbol then string(value.to_s)
    when Array then "[" + value.map { |item| json(item) }.join(",") + "]"
    when Hash then "{" + value.map { |key, item| string(key.to_s) + ":" + json(item) }.join(",") + "}"
    else raise Unserializable, "#{value.class} is not valid JSON"
    end
  end

  def self.error(e, file)
    message = e.respond_to?(:detailed_message) ? e.detailed_message(highlight: false) : e.message
    message = message.gsub(/\e\[[\d;]*m/, "")
    lines = (e.backtrace || []).select { |line| line.start_with?(file) }
    # A syntax error has no backtrace into the file; its message already names the line.
    head = lines.empty? ? message : lines.first + ": " + message
    trace = ([head] + lines.drop(1).map { |line| "\tfrom " + line }).join("\n")
    { "type" => e.class.name, "message" => message[0, 2000], "traceback" => trace + "\n" }
  end

  def self.result(phase, error, tests)
    json({ "phase" => phase, "error" => error, "tests" => tests })
  end

  def self.run(code, file, entrypoint, inputs, spread)
    begin
      TOPLEVEL_BINDING.eval(code, file, 1)
    rescue ScriptError => e
      return result("compile", error(e, file), [])
    rescue Exception => e
      return result("execute", error(e, file), [])
    end
    me = TOPLEVEL_BINDING.receiver
    unless me.respond_to?(entrypoint, true)
      missing = { "type" => "NoMethodError", "message" => "Define a method named #{entrypoint}.", "traceback" => "" }
      return result("execute", missing, [])
    end
    tests = inputs.each_with_index.map do |input, index|
      begin
        actual = spread ? me.send(entrypoint, *input) : me.send(entrypoint, input)
      rescue Exception => e
        next { "index" => index, "error" => error(e, file) }
      end
      repr = (actual.inspect rescue "<uninspectable>")[0, 2000]
      begin
        { "index" => index, "json" => json(actual), "repr" => repr }
      rescue Unserializable => e
        { "index" => index, "unserializable" => e.message, "repr" => repr }
      end
    end
    result("tests", nil, tests)
  end
end
`)};

async function execute({ code, entrypoint, parameters, inputs, filename }) {
  const call =
    "MuscleMemory.run(" +
    [literal(code), literal(filename), literal(entrypoint), literal(inputs), Array.isArray(parameters) ? "true" : "false"].join(", ") +
    ")";
  const result = JSON.parse(vm.eval(call).toString());
  const fix = (error) => error && { ...error, traceback: bounded(error.traceback) };
  return {
    phase: result.phase,
    ...(result.error ? { error: fix(result.error) } : {}),
    tests: result.tests.map(({ json, repr, error, ...rest }) => ({
      ...rest,
      ...(json !== undefined ? { output: bounded(json) } : {}),
      ...(repr !== undefined ? { repr: bounded(repr, 2000) } : {}),
      ...(error ? { error: fix(error) } : {}),
    })),
  };
}
`;
