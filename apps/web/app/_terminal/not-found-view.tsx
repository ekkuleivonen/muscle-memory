"use client";
import { usePathname } from "next/navigation";
import { Oops } from "./oops";

/** The 404 page's body: the path someone tried, as a `cd` that didn't work out. */
export function NotFoundView() {
  const path = usePathname() || "/";
  return (
    <Oops
      code="404"
      command={`cd ${path}`}
      output={[`cd: no such file or directory: ${path}`]}
      explain="There's nothing at this address. The link may be mistyped, or what it pointed to is gone."
      quip="we checked git log. nobody admits to deleting it."
    />
  );
}
