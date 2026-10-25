import { test } from "node:test";
import assert from "node:assert/strict";
import { entryPath, kebab, mediaTypeOf, snake } from "./entry";

test("names convert between styles", () => {
  assert.equal(kebab("frequency_map"), "frequency-map");
  assert.equal(kebab("parsePage"), "parse-page");
  assert.equal(snake("ParseLine"), "parse_line");
  assert.equal(snake("debounceTimes"), "debounce_times");
});

test("each language keeps its file where a project in it would", () => {
  const at = (language: Parameters<typeof entryPath>[0]["language"], entrypoint: string, starter = "") =>
    entryPath({ slug: "late-fees", language, entrypoint, starter });
  assert.equal(at("python", "frequency_map"), "frequency_map.py");
  assert.equal(at("javascript", "formatPrice"), "src/format-price.js");
  assert.equal(at("typescript", "rateLimit"), "src/rate-limit.ts");
  assert.equal(at("go", "ParseDuration"), "parse_duration.go");
  assert.equal(at("sql", "query"), "queries/late-fees.sql");
  assert.equal(at("java", "check", "package com.acme.auth;\nclass PasswordPolicy {}"), "src/main/java/com/acme/auth/PasswordPolicy.java");
  assert.equal(at("csharp", "Fee", "public class LateFees {}"), "src/LateFees.cs");
  assert.equal(entryPath({ slug: "x", language: "python", entrypoint: "f", starter: "", entry: "pipeline/dedupe.py" }), "pipeline/dedupe.py");
  assert.equal(mediaTypeOf("html"), "text/html; charset=utf-8");
  assert.equal(mediaTypeOf("go"), "text/x-go; charset=utf-8");
});
