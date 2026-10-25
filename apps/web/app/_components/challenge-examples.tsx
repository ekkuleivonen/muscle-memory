import type { ReactNode } from "react";

/** A value on one line when it fits, indented JSON when it does not. */
function compactJson(value: unknown): string {
  const flat = JSON.stringify(value);
  return flat.length <= 40 ? flat : JSON.stringify(value, null, 2);
}

/**
 * Examples only, never hidden cases. Requirements are shown literally, never inferred.
 * `compact` lays them out as rows of input → expected, for the practice pane.
 */
export function ChallengeExamples({
  examples,
  heading = "Examples",
  compact = false,
}: {
  examples: readonly {
    name?: string;
    input: unknown;
    expected: unknown;
    hidden?: boolean;
  }[];
  heading?: ReactNode;
  compact?: boolean;
}) {
  const published = examples.filter((example) => example.hidden !== true);
  if (!published.length) return null;
  if (compact)
    return (
      <section className="challenge-examples compact" aria-label="Examples">
        <h2>
          {heading} <span className="faint">· input → expected</span>
        </h2>
        <ol>
          {published.map((example, index) => {
            const input = compactJson(example.input);
            const expected = compactJson(example.expected);
            const long = input.includes("\n") || expected.includes("\n");
            return (
              <li key={index} className={long ? "long" : undefined}>
                <span className="faint">{index + 1}</span>
                <div>
                  {example.name && (
                    <span className="faint">{example.name}</span>
                  )}
                  <pre>{input}</pre>
                  <pre>
                    <span className="faint" aria-label="expected">
                      →{" "}
                    </span>
                    {expected}
                  </pre>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    );
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
