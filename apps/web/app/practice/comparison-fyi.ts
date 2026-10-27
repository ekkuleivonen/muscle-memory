import { defaultComparisons } from "../../../../packages/model-runs/comparison";
import {
  receiptMatch,
  type ModelReceipt,
} from "../../../../packages/model-runs/receipts";
/** A median of successful, matched default solutions; no outcome/length substitution. */
export function comparisonFyi(
  userLength: number | null,
  receipts: readonly ModelReceipt[],
  conditions: readonly string[],
  truncated = false,
): string | null {
  if (
    truncated ||
    userLength === null ||
    !Number.isSafeInteger(userLength) ||
    userLength < 0
  )
    return null;
  const lengths = defaultComparisons(receipts)
    .flatMap(({ receipt }) =>
      receipt?.state === "completed" &&
      receiptMatch(receipt, conditions) === "matched" &&
      Number.isSafeInteger(receipt.finalCodeLength) &&
      receipt.finalCodeLength! > 0
        ? [receipt.finalCodeLength!]
        : [],
    )
    .sort((a, b) => a - b);
  if (lengths.length < 3) return null;
  const middle = Math.floor(lengths.length / 2);
  const median =
    lengths.length % 2
      ? lengths[middle]
      : (lengths[middle - 1] + lengths[middle]) / 2;
  const delta = ((userLength - median) / median) * 100;
  if (Math.abs(delta) < 10) return null;
  return `Your code is ${Math.abs(Math.round(delta))}% ${delta < 0 ? "shorter" : "longer"} than the AI median (n=${lengths.length}).`;
}
