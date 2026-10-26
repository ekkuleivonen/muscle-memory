/** Real local D1/R2 and operator-browser integration. No production content or uploads. */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { localAuthoring, repositorySeed } from "./authoring-local";
import { localOperatorBrowser } from "./browser/authoring-runtime";
import { seedCatalog } from "../packages/authoring/seed";
import { AuthoringService } from "../packages/authoring/service";
import { CatalogStorage, type Statement } from "../packages/authoring/storage";
const root = fileURLToPath(new URL("../", import.meta.url));
const local = await localAuthoring(root);
let sandbox: Awaited<ReturnType<typeof localOperatorBrowser>> | undefined;
const receipts: string[] = [];
const mutation = (expectedGeneration: number) => ({
  requestId: crypto.randomUUID(),
  expectedGeneration,
});
try {
  const input = await repositorySeed(root);
  await seedCatalog(local.storage, input);
  const service = new AuthoringService(local.storage);
  assert.equal((await service.publicCatalog()).challenges.length, 69);
  receipts.push("Real D1/R2 seed: 69 active, 117 immutable versions");
  const source = structuredClone(
    input.sources.find((s) => s.metadata.key === "JS-001")!,
  );
  source.metadata.key = source.revision.challenge = "JS-999";
  source.metadata.title = "Isolated authoring QA";
  let detail = await service.save("JS-999", mutation(0), source, true);
  assert.equal(await service.publicRevision("JS-999"), null);
  await assert.rejects(
    service.publish("JS-999", mutation(detail.head.generation)),
  );
  receipts.push(
    "Private draft absent from public revision; publish without QA denied",
  );
  const concurrent = await Promise.allSettled([
    service.save("JS-999", mutation(detail.head.generation), source),
    service.save("JS-999", mutation(detail.head.generation), source),
  ]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  detail = await service.detail("JS-999");
  receipts.push("Concurrent D1 draft saves: exactly one winner");
  const before = await local.storage.head("JS-999");
  const failingDB = {
    prepare: local.db.prepare.bind(local.db),
    batch: async (statements: Statement[]) =>
      local.db.batch([
        ...(statements as any[]),
        local.db.prepare(
          "INSERT INTO catalog_state(singleton,generation) VALUES(1,0)",
        ),
      ]),
  };
  const changed = structuredClone(source);
  changed.metadata.title += " changed";
  await assert.rejects(
    new AuthoringService(new CatalogStorage(failingDB, local.bucket)).save(
      "JS-999",
      mutation(detail.head.generation),
      changed,
    ),
  );
  assert.deepEqual(await local.storage.head("JS-999"), before);
  receipts.push(
    "R2 write then actual D1 constraint failure: atomic rollback leaves head unchanged",
  );
  const unavailableBucket = {
    get: local.bucket.get.bind(local.bucket),
    put: async () => {
      throw new Error("Injected R2 outage");
    },
  };
  await assert.rejects(
    new AuthoringService(new CatalogStorage(local.db, unavailableBucket)).save(
      "JS-999",
      mutation(detail.head.generation),
      changed,
    ),
  );
  assert.deepEqual(await local.storage.head("JS-999"), before);
  receipts.push("R2 failure prevents all D1 mutation");
  const lostReplyDB = {
    prepare: local.db.prepare.bind(local.db),
    batch: async (statements: Statement[]) => {
      await local.db.batch(statements as any[]);
      throw new Error("Injected lost committed reply");
    },
  };
  const lostRequest = mutation(detail.head.generation);
  detail = await new AuthoringService(
    new CatalogStorage(lostReplyDB, local.bucket),
  ).save("JS-999", lostRequest, changed);
  const recovered = await service.save("JS-999", lostRequest, changed);
  assert.equal(detail.head.generation, recovered.head.generation);
  receipts.push(
    "D1 commit with lost reply reconciles; identical retry does not write twice",
  );
  const plan = await service.beginValidation(
    "JS-999",
    mutation(detail.head.generation),
  );
  await assert.rejects(service.publish("JS-999", mutation(plan.generation)));
  sandbox = await localOperatorBrowser(root);
  const browserRuns = await sandbox.run(plan);
  await assert.rejects(
    service.finishValidation(
      "JS-999",
      plan.token,
      mutation(plan.generation),
      [],
    ),
  );
  detail = await service.finishValidation(
    "JS-999",
    plan.token,
    mutation(plan.generation),
    browserRuns,
  );
  assert.equal(detail.head.validation, "passed");
  const proof = await local.db
    .prepare("SELECT evidence_object FROM qa_receipts WHERE receipt_id=?")
    .bind(plan.token)
    .first<{ evidence_object: string }>();
  assert.equal(
    JSON.parse(await (await local.bucket.get(proof!.evidence_object))!.text())
      .provenance,
    "operator-browser-submitted",
  );
  const staleSource = structuredClone(source);
  staleSource.metadata.key = staleSource.revision.challenge = "JS-995";
  let stale = await service.save("JS-995", mutation(0), staleSource, true);
  const stalePlan = await service.beginValidation(
    "JS-995",
    mutation(stale.head.generation),
  );
  staleSource.metadata.title += " edited";
  stale = await service.save(
    "JS-995",
    mutation(stalePlan.generation),
    staleSource,
  );
  await assert.rejects(
    service.finishValidation(
      "JS-995",
      stalePlan.token,
      mutation(stalePlan.generation),
      browserRuns,
    ),
  );
  const expiryPlan = await service.beginValidation(
    "JS-995",
    mutation(stale.head.generation),
  );
  const future = new AuthoringService(local.storage, () =>
    new Date(Date.now() + 86400000).toISOString(),
  );
  await assert.rejects(
    future.finishValidation(
      "JS-995",
      expiryPlan.token,
      mutation(expiryPlan.generation),
      browserRuns,
    ),
  );
  receipts.push(
    "Operator provenance recorded; stale edits and expired browser submissions rejected",
  );

  receipts.push(
    "Operator browser: solution twice, alternatives, starter and wrongs graded against exact source",
  );
  const otherSource = structuredClone(source);
  otherSource.metadata.key = otherSource.revision.challenge = "JS-996";
  let other = await service.save("JS-996", mutation(0), otherSource, true);
  const otherPlan = await service.beginValidation(
    "JS-996",
    mutation(other.head.generation),
  );
  other = await service.finishValidation(
    "JS-996",
    otherPlan.token,
    mutation(otherPlan.generation),
    await sandbox.run(otherPlan),
  );
  const publish = mutation(detail.head.generation);
  const publishOther = mutation(other.head.generation);
  const publications = await Promise.allSettled([
    service.publish("JS-999", publish),
    service.publish("JS-996", publishOther),
  ]);
  assert.equal(publications.filter((r) => r.status === "fulfilled").length, 1);
  await service.publish("JS-996", publishOther);
  detail = await service.publish("JS-999", publish);
  other = await service.detail("JS-996");
  assert.equal((await service.publicCatalog()).challenges.length, 71);
  await service.archive("JS-996", mutation(other.head.generation));
  receipts.push(
    "Concurrent publications CAS the shared manifest; retry preserves both updates without lost catalog entries",
  );
  const version = detail.head.publishedRevision;
  assert.ok(version);
  assert.equal((await service.publicCatalog()).challenges.length, 70);
  assert.equal(
    JSON.stringify(await service.publicRevision("JS-999")).includes(
      '"private"',
    ),
    false,
  );
  await service.publish("JS-999", publish);
  assert.equal(
    (await local.db
      .prepare(
        "SELECT COUNT(*) n FROM publication_intents WHERE challenge_key='JS-999'",
      )
      .first<{ n: number }>())!.n,
    1,
  );
  receipts.push(
    "Publish and identical retry: one immutable version and one blocked benchmark intent",
  );
  detail = await service.archive("JS-999", mutation(detail.head.generation));
  assert.equal((await service.publicCatalog()).challenges.length, 69);
  assert.equal((await service.publicRevision("JS-999"))?.archived, true);
  assert.ok(await service.publicRevision("JS-999", version));
  receipts.push(
    "Archive removes discovery/new start; exact historical version remains available",
  );
  detail = await service.publish("JS-999", mutation(detail.head.generation));
  assert.equal(detail.head.publishedRevision, version);
  assert.equal(
    (await local.db
      .prepare(
        "SELECT COUNT(*) n FROM publication_intents WHERE challenge_key='JS-999'",
      )
      .first<{ n: number }>())!.n,
    1,
  );
  detail = await service.archive("JS-999", mutation(detail.head.generation));
  receipts.push(
    "Unchanged restore reuses the immutable revision and benchmark intent",
  );

  const slow = structuredClone(source);
  slow.metadata.key = slow.revision.challenge = "JS-997";
  slow.private.solution =
    "const started=Date.now(); while(Date.now()-started<6000){}\n" +
    slow.private.solution;
  let slowDetail = await service.save("JS-997", mutation(0), slow, true);
  const slowPlan = await service.beginValidation(
    "JS-997",
    mutation(slowDetail.head.generation),
  );
  await assert.rejects(sandbox.run(slowPlan), /same limit players/);
  slowDetail = await service.detail("JS-997");
  assert.equal(slowDetail.head.validation, "unvalidated");
  await assert.rejects(
    service.publish("JS-997", mutation(slowDetail.head.generation)),
  );
  receipts.push(
    "Reference exceeding the shared player timeout fails browser checks and cannot publish",
  );
  console.log(JSON.stringify({ passed: receipts.length, receipts }, null, 2));
} finally {
  await sandbox?.dispose();
  await local.dispose();
}
