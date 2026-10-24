/** Shared rules for recorded data: opaque identifiers and bounded text. */

/** Code and outputs are kept up to this many bytes of UTF-8. */
export const CAPTURE_LIMIT_BYTES = 65536;

export function safeIdentifier(value: string): void {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)
  ) {
    throw new Error(
      "Use an opaque safe identifier, not a name or email address.",
    );
  }
}

/**
 * Keeps at most `limitBytes` of UTF-8, cut at a character boundary so the result is
 * deterministic for the same input and limit. Untruncated text is kept as given.
 */
export function boundText(text: string, limitBytes = CAPTURE_LIMIT_BYTES) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= limitBytes)
    return {
      text,
      originalBytes: bytes.length,
      capturedBytes: bytes.length,
      truncated: false,
    };
  let end = limitBytes;
  // Step back over UTF-8 continuation bytes rather than split a character.
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return {
    // ignoreBOM keeps a leading U+FEFF: the prefix must match the counted bytes exactly.
    text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      bytes.subarray(0, end),
    ),
    originalBytes: bytes.length,
    capturedBytes: end,
    truncated: true,
  };
}
