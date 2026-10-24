import Link from "next/link";

/** Terms and Privacy: readable before signing up, so outside the consent gate. */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="legal">
      <header className="legal-head">
        <Link href="/" className="workspace-name">
          <img
            className="logo-mark"
            src="/logo.svg"
            alt=""
            width={22}
            height={22}
          />
          muscle memory
        </Link>
        <nav>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </header>
      <main className="legal-body">{children}</main>
    </div>
  );
}
