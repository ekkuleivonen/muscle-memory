"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { readProfile } from "../../../lib/account";

const DISMISSED_KEY = "muscle-memory.setup-nudge-dismissed";

/**
 * For people who accepted the Terms without answering the setup questions: an offer to answer
 * them, never a requirement. "Not now" hides it on this device.
 */
export function SetupNudge() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(
      Boolean(readProfile()?.questionsPending) && !localStorage.getItem(DISMISSED_KEY),
    );
  }, []);
  if (!show) return null;
  return (
    <section className="setup-nudge" aria-label="Finish setting up">
      <div>
        <b>Finish setting up your desk.</b> Five quick questions (experience, how often you
        code with AI, your languages, why you&apos;re here, Vim or not), so your results mean
        something. About a minute.
      </div>
      <div className="setup-nudge-actions">
        <Link className="setup-nudge-go" href="/onboarding?next=%2Fdashboard">
          Set up
        </Link>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
            setShow(false);
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
