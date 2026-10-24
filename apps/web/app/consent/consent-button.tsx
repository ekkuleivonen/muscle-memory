"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { acceptConsent, readProfile } from "../../lib/account";
import { acceptsCurrent } from "../../lib/legal";
import { logArrival, noteArrival } from "../(browse)/_components/board-log";

/**
 * Accepts the current Terms and goes on; says so when the Terms changed since the last
 * acceptance, skips the click when this browser already accepted these ones (the cookie was
 * only missing), and offers to sign back in after logging out.
 */
export function ConsentButton({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [renewal, setRenewal] = useState(false);
  const [returning, setReturning] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = readProfile();
      const accepted = stored?.accepted;
      if (accepted && acceptsCurrent(accepted)) {
        // Logged out on purpose: ask, rather than signing them straight back in.
        if (stored?.signedOut) return setReturning(stored.handle ?? null);
        // Already accepted these Terms in this browser (the cookie was only missing): go on.
        acceptConsent();
        router.replace(next);
        return;
      }
      // The page they were heading for is where they landed; /consent is only on the way.
      noteArrival(null, next);
      setRenewal(Boolean(accepted));
    } catch {
      setError(
        "Could not read browser storage. Allow storage for this site, then reload.",
      );
    }
  }, [next, router]);
  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      acceptConsent();
      await logArrival().catch(() => undefined);
      router.replace(next);
    } catch {
      setBusy(false);
      setError(
        "Could not save your session. Allow browser storage and try again.",
      );
    }
  };
  return (
    <div className="home-actions">
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="home-cta"
        disabled={busy}
        onClick={() => void accept()}
      >
        {busy
          ? "Opening…"
          : returning
            ? `Sign back in as ${returning}`
            : "I'm 16 or older and accept"}
      </button>
      <span className="home-note">
        {returning
          ? "Everything you did is still in this browser."
          : renewal
            ? "The Terms changed since you last accepted them."
            : "No email needed. Saved in this browser."}
      </span>
    </div>
  );
}
