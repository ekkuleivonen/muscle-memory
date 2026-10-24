"use client";
import "./legacy.css";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import catalogData from "../../../../content/catalog/reference.v1.json";
import type { Catalog } from "../../../../packages/catalog/catalog";
import { selectChallenge } from "./select";
import { Workspace } from "./workspace";

function Selected() {
  const selected = selectChallenge(
    catalogData as unknown as Catalog,
    useSearchParams().get("challenge"),
  );
  if (!selected.ok)
    return (
      <div className="workspace-page">
        <main className="workspace">
          <p role="alert" className="error">
            {selected.message}
          </p>
          <p>
            <a href="/issues">Back to the issues</a> to pick another one.
          </p>
        </main>
      </div>
    );
  const { ref, challenge } = selected;
  return (
    <Workspace
      key={`${ref.id}@${ref.version}`}
      challenge={challenge}
      challengeRef={ref}
    />
  );
}

export function SelectedWorkspace() {
  // The challenge comes from the URL, which is only known in the browser.
  return (
    <Suspense>
      <Selected />
    </Suspense>
  );
}
