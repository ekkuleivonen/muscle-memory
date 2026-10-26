/** Trusted operator CLI, local only in this draft. No new credentials, cloud calls or model runs. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { localAuthoring } from "./authoring-local";
import { localSandboxValidator } from "./authoring-sandbox";
import { AuthoringService } from "../packages/authoring/service";
const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && !/^[0-9a-f-]{36}$/.test(args[0])))
  throw new Error(
    "Usage: node --import tsx tools/validate-draft.ts [local-job-id]",
  );
const root = fileURLToPath(new URL("../", import.meta.url));
const local = await localAuthoring(root, resolve(root, ".local/catalog-seed"));
let sandbox: Awaited<ReturnType<typeof localSandboxValidator>> | undefined;
try {
  const jobs = (
    await local.db
      .prepare(
        `SELECT token,challenge_key,generation,expires_at FROM validation_sessions WHERE started_at IS NULL AND consumed_at IS NULL ORDER BY expires_at`,
      )
      .all()
  ).results;
  if (!args[0])
    console.log(JSON.stringify({ mode: "local-plan-only", pending: jobs }));
  else {
    sandbox = await localSandboxValidator(root);
    const detail = await new AuthoringService(local.storage).runValidationJob(
      args[0],
      sandbox.validator,
    );
    console.log(
      JSON.stringify({
        mode: "trusted-local-browser",
        key: detail.head.key,
        generation: detail.head.generation,
        validation: detail.head.validation,
      }),
    );
  }
} finally {
  await sandbox?.dispose();
  await local.dispose();
}
