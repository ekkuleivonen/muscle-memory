"use client";
import Link from "next/link";
import { profileCompletions } from "../../../lib/profile-completions";
import { useRecords } from "./records";

export function ProfileEvidence({
  issues,
}: {
  issues: { key: string; title: string }[];
}) {
  const records = useRecords();
  if (!records) return <p role="status">Reading your practice…</p>;
  const completed = profileCompletions(records);
  if (!completed.length)
    return (
      <p>
        No completed challenges yet.{" "}
        <Link href="/issues">Explore challenges</Link>.
      </p>
    );
  return (
    <ul className="rows standalone">
      {completed.map((item) => (
        <li key={`${item.issue}:${item.at}`}>
          <Link
            className="row"
            href={`/work/${item.key}?revision=${encodeURIComponent(item.revision)}`}
          >
            <span className="title">
              {issues.find((i) => i.key === item.key)?.title ?? item.key}
            </span>
            <span className="meta dim">
              {item.automatic ? "Verified completion" : "Historical completion"}{" "}
              · {new Date(item.at).toLocaleDateString()}
              {item.hints > 0 &&
                ` · ${item.hints} built-in ${item.hints === 1 ? "hint" : "hints"} used`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
