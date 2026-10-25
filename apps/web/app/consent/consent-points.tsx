import Link from "next/link";

/**
 * What accepting the Terms means, in four points and the storage note: the same words wherever
 * someone accepts them (/consent).
 */
export function ConsentPoints() {
  return (
    <>
      <ul className="home-promises consent-points">
        <li>
          <strong>We record what you do here, keystroke by keystroke:</strong>{" "}
          every key you press in the editor and when, your edits and pastes, the
          pages you open, your runs and their results, and when you switch away
          (never to what). It&apos;s sent to our servers without
          your name. That&apos;s the product.
        </li>
        <li>
          <strong>We may publish anonymised stats and datasets.</strong> Rather
          not? Go stealth any time in settings.
        </li>
        <li>
          <strong>Nobody else sees your results,</strong> and we don&apos;t sell
          your personal data.
        </li>
        <li>
          <strong>Code you write stays yours;</strong> you give us a licence to
          use and publish it.
        </li>
      </ul>
      <p className="home-fine">
        The full <Link href="/terms">Terms</Link> and{" "}
        <Link href="/privacy">Privacy Notice</Link> are short and written for
        humans.
      </p>
      <p className="home-fine">
        Your code and progress are saved in this browser. There
        is no device sync or recovery from uploads. Logging out keeps your local
        data; clearing browser storage does not.
      </p>
    </>
  );
}
