"use client";
import { useEffect, useState } from "react";
import { codeFromHash, decodeCode, type SharedFile } from "../../../lib/share";

/**
 * The code a sharer chose to include, read from the link's fragment after mount (the server
 * never sees it). Closed until asked for, since it shows their fix. Shown as plain text.
 */
export function SharedCode() {
  const [files, setFiles] = useState<SharedFile[] | null | undefined>(
    undefined,
  );
  useEffect(() => {
    let request = 0;
    const read = () => {
      const current = ++request;
      const packed = codeFromHash(location.hash);
      if (!packed) {
        setFiles(location.hash.startsWith("#code=") ? null : undefined);
        return;
      }
      setFiles(undefined);
      decodeCode(packed).then(
        (value) => current === request && setFiles(value),
      );
    };
    read();
    window.addEventListener("hashchange", read);
    return () => {
      request++;
      window.removeEventListener("hashchange", read);
    };
  }, []);
  if (files === undefined) return null;
  if (files === null)
    return (
      <p className="faint shared-code-note" role="status">
        This link was meant to include their code, but that part is incomplete,
        so it isn&apos;t shown.
      </p>
    );
  return (
    <details className="shared-code">
      <summary>
        Their code ({files.length === 1 ? "1 file" : `${files.length} files`}),
        shared by choice. Opening it shows their fix.
      </summary>
      {files.map((file) => (
        <figure key={file.path}>
          <figcaption className="mono">{file.path}</figcaption>
          <pre>
            <code>{file.text}</code>
          </pre>
        </figure>
      ))}
    </details>
  );
}
