import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = {
  title: "Muscle Memory — keep your craft",
  description:
    "Friendly coding Adventures to practice the craft of writing code.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
