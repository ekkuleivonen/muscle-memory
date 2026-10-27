/** The erasure Worker's bindings (wrangler.jsonc); CATALOG_TOKEN is a secret, absent until set. */
interface Env {
  CONTROL: R2Bucket;
  JOB: DurableObjectNamespace<import("./index").EraseJob>;
  CATALOG_URI: string;
  WAREHOUSE: string;
  EVENTS_TABLE: string;
  CATALOG_TOKEN?: string;
}
