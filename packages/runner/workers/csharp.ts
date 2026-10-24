import { PRELUDE } from "./shared";

/**
 * C# on .NET 9 compiled to WebAssembly, with Roslyn compiling the solution in memory (built from
 * tools/runtimes/csharp). The runner's Main takes one request per call through .NET's in-memory
 * file system; Console output arrives through console.log.
 */
export const CSHARP_WORKER =
  PRELUDE +
  String.raw`
let runtime = null;

async function boot(assets) {
  const files = new Map(Object.entries(assets));
  const respond = (name) => {
    if (!files.has(name)) throw new TypeError("Network access is disabled.");
    const type = name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".json") ? "application/json" : "application/octet-stream";
    return new Response(files.get(name), { headers: { "content-type": type } });
  };
  // .NET's modules locate their files relative to import.meta.url, a blob URL here; give them
  // a dummy base and answer every request from memory.
  const module = (name) => {
    const text = new TextDecoder().decode(files.get(name)).split("import.meta.url").join(JSON.stringify("https://runtime.invalid/" + name));
    return URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
  };
  self.fetch = async (resource) => respond(new URL(String(resource), "https://runtime.invalid/").pathname.split("/").pop());
  // dotnet.js takes a worker that already handles messages for one of its own threads.
  const handler = self.onmessage;
  self.onmessage = null;
  const { dotnet } = await import(module("dotnet.js"));
  self.onmessage = handler;
  runtime = await dotnet
    .withConfigSrc("https://runtime.invalid/blazor.boot.json")
    .withResourceLoader((type, name) =>
      type === "dotnetjs" || type.startsWith("js-module") ? module(name) : Promise.resolve(respond(name)),
    )
    .create();
  runtime.Module.FS.mkdir("/mm");
  // Loads Roslyn by compiling something small, so the first run is not slow.
  await runtime.runMain("Runner", ["warm"]);
}

async function execute({ code, entrypoint, parameters, inputs, filename }) {
  const fs = runtime.Module.FS;
  fs.writeFile("/mm/request.json", JSON.stringify({ code, file: filename, entrypoint, inputs, spread: Array.isArray(parameters) }));
  try {
    fs.unlink("/mm/result.json");
  } catch {}
  await runtime.runMain("Runner", []);
  const result = JSON.parse(fs.readFile("/mm/result.json", { encoding: "utf8" }));
  const fix = (error) =>
    error && { type: error.type, message: String(error.message).slice(0, 2000), traceback: bounded(error.traceback || "") };
  return {
    phase: result.phase,
    ...(result.error ? { error: fix(result.error) } : {}),
    tests: (result.tests || []).map(({ json, repr, error, ...rest }) => ({
      ...rest,
      ...(json !== undefined ? { output: bounded(json) } : {}),
      ...(repr !== undefined ? { repr: bounded(repr, 2000) } : {}),
      ...(error ? { error: fix(error) } : {}),
    })),
  };
}
`;
