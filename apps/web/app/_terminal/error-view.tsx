"use client";
import { useEffect } from "react";
import { Oops } from "./oops";

/**
 * Something broke while showing a page: our fault, said so, with a way to try again. Code
 * typed in practice is saved as it is typed, so a crash here loses none of it.
 */
export function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <Oops
      code="500"
      command="./render --this-page"
      output={[
        "Segmentation fault (core dumped)",
        ...(error.digest ? [`trace: ${error.digest}`] : []),
      ]}
      explain="This page broke on our side, not because of anything you did. Code you typed in practice is saved as you go, so none of it is lost."
      quip="no AI wrote this bug. we did it all by hand."
      actions={[{ label: "try again", kind: "primary", run: reset }]}
    />
  );
}
