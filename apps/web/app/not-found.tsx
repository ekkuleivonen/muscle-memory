import type { Metadata } from "next";
import { TermFooter } from "./_terminal/footer";
import { NotFoundView } from "./_terminal/not-found-view";
import "./_terminal/terminal.css";

export const metadata: Metadata = { title: "Not found · Muscle Memory" };

export default function NotFound() {
  return (
    <>
      <div className="term">
        <NotFoundView />
      </div>
      <TermFooter trail={[{ label: "404", href: "" }]} />
    </>
  );
}
