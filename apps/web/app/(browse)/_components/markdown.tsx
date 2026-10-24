import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type Inline } from "../../../lib/markdown";

function inline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return <Fragment key={i}>{node.value}</Fragment>;
      case "code":
        return <code key={i}>{node.value}</code>;
      case "strong":
        return <strong key={i}>{inline(node.children)}</strong>;
      case "em":
        return <em key={i}>{inline(node.children)}</em>;
      case "link":
        return node.href.startsWith("http") ? (
          <a key={i} href={node.href} target="_blank" rel="noreferrer noopener">
            {inline(node.children)}
          </a>
        ) : (
          <Link key={i} href={node.href}>
            {inline(node.children)}
          </Link>
        );
    }
  });
}

/** Authored markdown as React elements; the page's own section titles stay above it. */
export function Markdown({
  source,
  className = "",
}: {
  source: string;
  className?: string;
}) {
  return (
    <div className={`markdown ${className}`.trim()}>
      {parseMarkdown(source).map((block, i) => {
        switch (block.type) {
          case "heading":
            return block.level <= 2 ? (
              <h3 key={i}>{inline(block.children)}</h3>
            ) : (
              <h4 key={i}>{inline(block.children)}</h4>
            );
          case "paragraph":
            return <p key={i}>{inline(block.children)}</p>;
          case "quote":
            return <blockquote key={i}>{inline(block.children)}</blockquote>;
          case "code":
            return (
              <pre key={i} data-lang={block.lang}>
                <code>{block.value}</code>
              </pre>
            );
          case "list": {
            const items = block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ));
            return block.ordered ? (
              <ol key={i}>{items}</ol>
            ) : (
              <ul key={i}>{items}</ul>
            );
          }
        }
      })}
    </div>
  );
}
