/** Quiet CI wrapper: private assertion/build details stay in an ephemeral ignored file. */
import { mkdir, open } from "node:fs/promises";
import { spawn } from "node:child_process";
const command = process.argv[2];
if (!["test", "typecheck", "build:cloudflare"].includes(command))
  throw Error("Unknown private check.");
await mkdir(".local/checks", { recursive: true, mode: 0o700 });
const file = await open(
  `.local/checks/${command.replace(":", "-")}.log`,
  "w",
  0o600,
);
try {
  const child = spawn("npm", ["run", command], {
    stdio: ["ignore", file.fd, file.fd],
    env: process.env,
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  console.log(
    `${command}: ${code === 0 ? "passed" : "failed; private details retained only in .local/checks (not uploaded)"}`,
  );
  process.exitCode = typeof code === "number" ? code : 1;
} finally {
  await file.close();
}
