# Contributing

Start with README setup and the Foundation reference. Keep changes small and run the focused contract tests. New Challenges need a pinned version, a clear task, fixtures including edge cases, hints, skill tags and an explicit assessment version. Adventures reference those versions and own their story and sequence separately.

Do not edit published versions in place. Add a new version, retain old content, and include a focused test proving the changed behavior. Do not put real participant records, credentials, private organization notes or generated exports in this repository.

Open a focused PR describing the behavior, a runnable check and any limitation. Foundation work precedes player progression, launch features and observatory research. Keep issue status, meaningful progress, blockers and PR links current. Avoid speculative infrastructure and repeated checks without a concrete reason.

Before proposing content, use Node.js 22+ to run `node tools/content-check.mjs` and `node --test tools/tests/content-check.test.mjs`. These dependency-free authoring checks reject missing references, unpinned versions, duplicate identities and mismatched fixtures. They validate source manifests; they do not publish content or implement the runtime lifecycle.
