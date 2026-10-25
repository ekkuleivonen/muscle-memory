import type { ReactNode } from "react";

/** Published, visible examples only. Requirements are shown literally, never inferred. */
export function ChallengeExamples({
  examples,
  heading = "Examples",
}: {
  examples: readonly {
    name?: string;
    input: unknown;
    expected: unknown;
    visible?: boolean;
  }[];
  heading?: ReactNode;
}) {
  const published = examples.filter((example) => example.visible !== false);
  if (!published.length) return null;
  return (
    <section className="challenge-examples" aria-label="Examples">
      <h2>{heading}</h2>
      <ol>
        {published.map((example, index) => (
          <li key={index}>
            <h3>
              Example {index + 1}
              {example.name ? `: ${example.name}` : ""}
            </h3>
            <dl>
              <dt>Input</dt>
              <dd>
                <pre>{JSON.stringify(example.input, null, 2)}</pre>
              </dd>
              <dt>Expected output</dt>
              <dd>
                <pre>{JSON.stringify(example.expected, null, 2)}</pre>
              </dd>
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
