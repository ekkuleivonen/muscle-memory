/**
 * The workbench's CodeMirror editor: R2 SQL highlighting, completion from the live schema and
 * the documented functions, brackets, search, and error marks. Admin only; practice's editor
 * (with no completion, by design) is separate and shares only the colours.
 */
import {
  Compartment,
  EditorState,
  Prec,
  type Extension,
} from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  isolateHistory,
} from "@codemirror/commands";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type Completion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { sql, SQLDialect, type SQLNamespace } from "@codemirror/lang-sql";
import { highlight } from "../../practice/highlight";
import {
  FUNCTIONS,
  KEYWORDS,
  TYPES,
} from "../../../../../packages/workbench/dialect";
import { statementAt } from "../../../../../packages/workbench/sql";
import { NAMESPACE } from "../../../../../packages/workbench/check";
import type { Schema } from "../../../../../packages/workbench/read";

export const r2Sql = SQLDialect.define({
  keywords: KEYWORDS.join(" "),
  types: TYPES.join(" "),
  builtin: FUNCTIONS.map((f) => f.name).join(" "),
  backslashEscapes: false,
  doubleQuotedStrings: false,
  identifierQuotes: '"`',
  caseInsensitiveIdentifiers: true,
});

/** lang-sql tags documented functions as standard names. */
const builtins = HighlightStyle.define([
  { tag: tags.standard(tags.name), color: "var(--syn-function)" },
]);

const functions = new Map(FUNCTIONS.map((f) => [f.name, f]));

function word(label: string, type: string): Completion {
  const fn = functions.get(label.toLowerCase());
  if (fn)
    return {
      label: fn.name,
      type: "function",
      detail: fn.kind === "scalar" ? fn.group : fn.kind,
      apply: `${fn.name}(`,
      boost: -1,
    };
  return { label, type, boost: -2 };
}

/** The schema as lang-sql's completion namespace: `default.<table>` and bare table names. */
export function namespaceOf(schema: Schema | null): SQLNamespace {
  const tables: Record<string, Completion[]> = {};
  for (const t of schema?.tables ?? [])
    tables[t.name] = t.columns.map((c) => ({
      label: c.name,
      type: "property",
      detail: c.type,
      info: c.doc ?? undefined,
    }));
  return { [NAMESPACE]: tables };
}

/** Names the statement defines with WITH name AS (…), offered where a table goes. */
function cteCompletions(context: CompletionContext) {
  const before = context.matchBefore(/[\w$]*/);
  if (!before || (before.from === before.to && !context.explicit)) return null;
  // Not after a dot: that is a table's or alias's column.
  if (context.state.sliceDoc(before.from - 1, before.from) === ".") return null;
  const text = context.state.doc.toString();
  const statement = statementAt(text, context.pos);
  if (!statement) return null;
  const names = new Set<string>();
  for (const m of statement.text.matchAll(
    /(?:\bWITH|,)\s+([A-Za-z_][\w]*)\s+AS\s*\(/gi,
  ))
    names.add(m[1]);
  if (!names.size) return null;
  return {
    from: before.from,
    options: [...names].map((label) => ({
      label,
      type: "class",
      detail: "CTE",
      boost: 1,
    })),
    validFor: /^[\w$]*$/,
  };
}

export interface SqlEditorHooks {
  onChange(view: EditorView): void;
  onSelection(view: EditorView): void;
  onRun(): void;
  onFormat(): void;
}

export class SqlEditor {
  readonly view: EditorView;
  private language = new Compartment();
  private extensions: Extension[];
  private schema: Schema | null;

  constructor(
    parent: HTMLElement,
    doc: string,
    hooks: SqlEditorHooks,
    schema: Schema | null,
  ) {
    const run = () => {
      hooks.onRun();
      return true;
    };
    const format = () => {
      hooks.onFormat();
      return true;
    };
    this.schema = schema;
    this.extensions = [
      Prec.highest(
        keymap.of([
          { key: "Mod-Enter", run },
          { key: "Shift-Alt-f", run: format },
        ]),
      ),
      // Escape, then Tab, leaves the editor (Tab indents otherwise).
      Prec.highest(
        EditorView.domEventHandlers({
          keydown(event, view) {
            if (event.key === "Escape") view.setTabFocusMode(2000);
            return false;
          },
        }),
      ),
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection({ cursorBlinkRate: 0 }),
      indentUnit.of("  "),
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightSelectionMatches(),
      lintGutter(),
      syntaxHighlighting(highlight),
      syntaxHighlighting(builtins),
      autocompletion({ activateOnTyping: true, maxRenderedOptions: 80 }),
      r2Sql.language.data.of({ autocomplete: cteCompletions }),
      placeholder("SELECT … — Ctrl/⌘-Enter runs the statement at the cursor"),
      keymap.of([
        ...closeBracketsKeymap,
        ...completionKeymap,
        ...searchKeymap,
        indentWithTab,
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      EditorView.contentAttributes.of({
        "aria-label": "SQL query",
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) hooks.onChange(update.view);
        if (update.selectionSet || update.docChanged)
          hooks.onSelection(update.view);
      }),
    ];
    this.view = new EditorView({ parent, state: this.fresh(doc) });
  }

  /** A new document with its own undo history, as each tab has. */
  fresh(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        ...this.extensions,
        this.language.of(this.languageFor(this.schema)),
      ],
    });
  }

  private languageFor(schema: Schema | null): Extension {
    return sql({
      dialect: r2Sql,
      schema: namespaceOf(schema),
      defaultSchema: NAMESPACE,
      upperCaseKeywords: true,
      keywordCompletion: word,
    });
  }

  setSchema(schema: Schema | null) {
    this.schema = schema;
    this.view.dispatch({
      effects: this.language.reconfigure(this.languageFor(schema)),
    });
  }

  /** Replaces the whole document as its own undo step. */
  replace(text: string) {
    this.replaceRange(0, this.view.state.doc.length, text, false);
  }

  /** Replaces a range as its own undo step (formatting), selecting the result when asked. */
  replaceRange(from: number, to: number, text: string, select: boolean) {
    this.view.dispatch({
      changes: { from, to, insert: text },
      selection: select
        ? { anchor: from, head: from + text.length }
        : { anchor: Math.min(this.view.state.selection.main.head, from + text.length) },
      annotations: isolateHistory.of("full"),
      userEvent: "format",
    });
  }

  insert(text: string) {
    const { from, to } = this.view.state.selection.main;
    this.view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: true,
    });
    this.view.focus();
  }

  /** The selection if there is one, else the statement at the cursor; with its offset. */
  target(): {
    text: string;
    from: number;
    to: number;
    selection: boolean;
  } | null {
    const { state } = this.view;
    const range = state.selection.main;
    if (!range.empty) {
      const text = state.sliceDoc(range.from, range.to);
      return text.trim()
        ? { text, from: range.from, to: range.to, selection: true }
        : null;
    }
    const statement = statementAt(state.doc.toString(), range.head);
    return statement ? { ...statement, selection: false } : null;
  }

  /** Marks an error at an offset (or a line and column) in the document. */
  mark(
    message: string,
    at: number | null,
    line: number | null = null,
    column: number | null = null,
    base = 0,
  ) {
    const { doc } = this.view.state;
    let from: number | null = null;
    if (at !== null) from = base + at;
    else if (line !== null) {
      const baseLine = doc.lineAt(base);
      const target = baseLine.number + line - 1;
      if (target <= doc.lines) {
        const l = doc.line(target);
        const col =
          Math.max(0, (column ?? 1) - 1) +
          (line === 1 ? base - baseLine.from : 0);
        from = Math.min(l.to, l.from + col);
      }
    }
    if (from === null || from > doc.length) return this.clearMarks();
    const wordEnd = /^[\w$]+|^./.exec(
      doc.sliceString(from, Math.min(doc.length, from + 80)),
    );
    const diagnostic: Diagnostic = {
      from,
      to: Math.min(doc.length, from + (wordEnd?.[0].length ?? 0)),
      severity: "error",
      message,
    };
    this.view.dispatch(setDiagnostics(this.view.state, [diagnostic]));
  }

  clearMarks() {
    this.view.dispatch(setDiagnostics(this.view.state, []));
  }

  destroy() {
    this.view.destroy();
  }
}
