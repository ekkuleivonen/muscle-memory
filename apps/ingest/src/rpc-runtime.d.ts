/** Minimal runtime surface from @cloudflare/workers-types; avoid installing its globals
 * over the DOM Request/Response types used by the other ingest modules and Node tests. */
declare module "cloudflare:workers" {
  export class WorkerEntrypoint<Env> {
    protected env: Env;
  }
}
