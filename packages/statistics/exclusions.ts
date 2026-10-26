/** Reuse existing immutable public metadata, not a new player provenance taxonomy.
 * A challenge explicitly published as synthetic QA is not a player challenge.
 */
export function syntheticRevisions(
  rows: { challenge_key: string; revision: string; metadata_json: string }[],
) {
  if (rows.length > 10000)
    throw new Error("Published registry exceeds this view's limit.");
  return rows
    .filter((row) => {
      const metadata = JSON.parse(row.metadata_json);
      return (
        Array.isArray(metadata.tags) && metadata.tags.includes("synthetic-qa")
      );
    })
    .map((row) => {
      if (
        !/^[A-Z][A-Z0-9]{0,4}-\d{3}$/.test(row.challenge_key) ||
        !/^sha256:[0-9a-f]{64}$/.test(row.revision)
      )
        throw new Error("Invalid synthetic revision metadata.");
      return { challenge: row.challenge_key, revision: row.revision };
    });
}
