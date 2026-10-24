"use client";
import { useEffect } from "react";
import { noteArrival } from "../../(browse)/_components/board-log";

/** Remembers that a shared result brought this visitor, until they accept the Terms. */
export function Arrived({ referral }: { referral: string }) {
  useEffect(() => noteArrival(referral), [referral]);
  return null;
}
