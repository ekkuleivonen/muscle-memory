import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = {
  title: "Muscle Memory — keep your craft",
  description:
    "A developer job from before AI: tickets, tests and pull requests, and nobody writing the code for you.",
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
