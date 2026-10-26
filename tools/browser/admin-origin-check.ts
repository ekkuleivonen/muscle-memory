/** Local regression: admin keeps no-referrer while browser sends a real CSRF Origin. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium, webkit } from "playwright";
const server = createServer((req, res) => {
  if (req.url === "/probe")
    return res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ origin: req.headers.origin ?? null }));
  res
    .writeHead(200, {
      "content-type": "text/html",
      "referrer-policy": "no-referrer",
    })
    .end("<!doctype html><title>Local admin origin check</title>");
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
if (!address || typeof address === "string") throw Error("No fixture listener");
const origin = `http://127.0.0.1:${address.port}`;
const browserType = process.env.ADMIN_BROWSER === "webkit" ? webkit : chromium;
const browser = await browserType.launch();
try {
  const page = await browser.newPage();
  const response = await page.goto(origin);
  const policy = response!.headers()["referrer-policy"];
  const result = await page.evaluate(async () => ({
    sameOrigin: await (
      await fetch("/probe", {
        method: "POST",
        mode: "same-origin",
        redirect: "error",
      })
    ).json(),
    cors: await (
      await fetch("/probe", {
        method: "POST",
        mode: "cors",
        credentials: "same-origin",
        redirect: "error",
      })
    ).json(),
  }));
  assert.equal(policy, "no-referrer");
  assert.equal(result.cors.origin, origin);
  if (process.env.ADMIN_BROWSER === "webkit")
    assert.equal(result.sameOrigin.origin, "null");
  console.log(
    JSON.stringify({
      browser: browserType.name(),
      referrerPolicy: policy,
      sameOriginHeader: result.sameOrigin.origin,
      corsRetainsExactOrigin: result.cors.origin === origin,
    }),
  );
} finally {
  await browser.close();
  await new Promise<void>((done) => server.close(() => done()));
}
