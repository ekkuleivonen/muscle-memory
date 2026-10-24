import Link from "next/link";
import { Nav } from "./_components/nav";

export default function BrowseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="shell-top">
        <Link className="logo" href="/">
          muscle<b>/</b>memory
        </Link>
        <Nav />
      </header>
      {children}
    </>
  );
}
