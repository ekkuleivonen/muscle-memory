import { requireAdmin } from "../../../lib/admin-server";
import { HARNESS_VERSION } from "../../../../../packages/model-runs/tools";
import { Benchmarks } from "./benchmarks";

export default async function BenchmarksPage() {
  await requireAdmin();
  return <Benchmarks harnessVersion={HARNESS_VERSION} />;
}
