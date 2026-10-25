"use client";
import Link from "next/link";
import { practiceHref } from "../../../lib/paths";
import { noteStart } from "../../../lib/start";

/**
 * The shared result's invitation: practice on the same challenge, recorded as started from a
 * link. Someone new accepts the Terms at /consent on the way, which keeps the note.
 */
export function YourTurn({ challengeKey, label }: { challengeKey: string; label: string }) {
  return (
    <Link
      className="home-cta"
      href={practiceHref(challengeKey)}
      onClick={() => noteStart({ key: challengeKey, from: "link", query: null, position: null })}
    >
      {label}
    </Link>
  );
}
