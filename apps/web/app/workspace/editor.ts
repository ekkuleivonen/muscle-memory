/**
 * CodeMirror 6 setup for the IDE. Every feature is listed in editorFeatures() and recorded
 * with the session; there is no autocompletion, bracket auto-closing, linting or AI
 * assistance. The editor owns its document, so typing never re-renders React.
 */
import { EditorState, type Extension, Transaction } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { linter } from "@codemirror/lint";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { pythonLanguage } from "@codemirror/lang-python";
import {
  javascriptLanguage,
  typescriptLanguage,
} from "@codemirror/lang-javascript";
import { goLanguage } from "@codemirror/lang-go";
import { rustLanguage } from "@codemirror/lang-rust";
import { cppLanguage } from "@codemirror/lang-cpp";
import { phpLanguage } from "@codemirror/lang-php";
import { StandardSQL } from "@codemirror/lang-sql";
import { htmlLanguage } from "@codemirror/lang-html";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { javaLanguage } from "@codemirror/lang-java";
import { csharp } from "@codemirror/legacy-modes/mode/clike";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { getCM, vim } from "@replit/codemirror-vim";
import type { FileLanguage } from "../../lib/repo";
import { TYPE_CHECK_FEATURES, type TypeChecker } from "./type-checker";

export type Keymap = "standard" | "vim";

/** Language data only (highlighting, indentation), never the completion sources. */
function languageSupport(language: Exclude<FileLanguage, "text">): LanguageSupport {
  switch (language) {
    case "python":
      return new LanguageSupport(pythonLanguage);
    case "javascript":
      return new LanguageSupport(javascriptLanguage);
    case "typescript":
      return new LanguageSupport(typescriptLanguage);
    case "go":
      return new LanguageSupport(goLanguage);
    case "rust":
      return new LanguageSupport(rustLanguage);
    case "c":
    case "cpp":
      return new LanguageSupport(cppLanguage);
    case "php":
      return new LanguageSupport(phpLanguage);
    case "sql":
      return new LanguageSupport(StandardSQL.language);
    case "html":
      return new LanguageSupport(htmlLanguage);
    case "markdown":
      return new LanguageSupport(markdownLanguage);
    case "java":
      return new LanguageSupport(javaLanguage);
    case "csharp":
      return new LanguageSupport(StreamLanguage.define(csharp));
    case "ruby":
      return new LanguageSupport(StreamLanguage.define(ruby));
  }
}

/** Indentation people expect per language: Go uses tabs, the rest spaces. */
function indent(language: FileLanguage): string {
  if (language === "go") return "\t";
  if (
    language === "python" ||
    language === "rust" ||
    language === "php" ||
    language === "java" ||
    language === "csharp"
  )
    return "    ";
  if (language === "c" || language === "cpp") return "    ";
  return "  ";
}

/** Colours come from CSS variables (--syn-*), set with the rest of the palette. */
const highlight = HighlightStyle.define([
  {
    tag: [
      tags.keyword,
      tags.operatorKeyword,
      tags.modifier,
      tags.controlKeyword,
    ],
    color: "var(--syn-keyword)",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    color: "var(--syn-string)",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: "var(--syn-number)",
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    color: "var(--syn-comment)",
    fontStyle: "italic",
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.definition(tags.function(tags.variableName)),
    ],
    color: "var(--syn-function)",
  },
  {
    tag: [
      tags.typeName,
      tags.className,
      tags.namespace,
      tags.standard(tags.typeName),
    ],
    color: "var(--syn-type)",
  },
  {
    tag: [tags.propertyName, tags.attributeName],
    color: "var(--syn-property)",
  },
  { tag: [tags.tagName, tags.angleBracket], color: "var(--syn-tag)" },
  {
    tag: [tags.definition(tags.variableName), tags.variableName],
    color: "var(--syn-variable)",
  },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket],
    color: "var(--syn-punctuation)",
  },
  { tag: [tags.heading], color: "var(--syn-keyword)", fontWeight: "600" },
  {
    tag: [tags.link, tags.url],
    color: "var(--syn-string)",
    textDecoration: "underline",
  },
  { tag: [tags.emphasis], fontStyle: "italic" },
  { tag: [tags.strong], fontWeight: "600" },
  { tag: tags.meta, color: "var(--syn-comment)" },
  { tag: tags.invalid, color: "var(--syn-invalid)" },
]);

const shared = (language: FileLanguage): Extension[] => [
  lineNumbers(),
  highlightActiveLineGutter(),
  // A steady cursor, as in a terminal; the block shape is the stylesheet's.
  drawSelection({ cursorBlinkRate: 0 }),
  indentUnit.of(indent(language)),
  EditorState.tabSize.of(4),
  ...(language === "text" ? [] : [languageSupport(language)]),
  syntaxHighlighting(highlight),
  EditorView.contentAttributes.of({
    spellcheck: "false",
    autocorrect: "off",
    autocapitalize: "off",
  }),
];

/** What the opened observation records as the editor's features. */
export function editorFeatures(
  language: FileLanguage,
  keys: Keymap,
  typeChecked = false,
) {
  return {
    name: "codemirror-6",
    features: [
      `${language}-syntax-highlighting`,
      `${language}-auto-indent`,
      "tab-indents",
      "undo-redo-history",
      "bracket-match-highlight",
      "line-numbers",
      "mod-enter-runs",
      "mod-shift-enter-opens-pull-request",
      keys === "vim" ? "vim-keybindings" : "standard-keybindings",
      ...(typeChecked ? TYPE_CHECK_FEATURES : []),
    ],
  };
}

/**
 * What an editor reports besides text changes, so a session can record it: every key and IME
 * composition, cursor and selection moves, the lines in view, focus, copy and cut ranges, and
 * the help the editor showed. The clipboard itself is never read.
 */
export interface ActivityHooks {
  onKey(
    kind: "down" | "up" | "compose-start" | "compose-end",
    key: string,
    modifiers: string,
    repeat: boolean,
  ): void;
  onSelection(selection: unknown, userEvent: string | null): void;
  onScroll(fromLine: number, toLine: number): void;
  onFocus(focused: boolean): void;
  onClipboard(
    kind: "copy" | "cut",
    ranges: { from: number; to: number }[],
    wholeLines: boolean,
  ): void;
  onAssist?(kind: "diagnostics" | "hover", items: unknown): void;
}

/** Selection moves that change no text; text changes are reported with their transaction. */
function selections(hooks: ActivityHooks): Extension {
  return EditorView.updateListener.of((update) => {
    for (const transaction of update.transactions)
      if (!transaction.docChanged && transaction.selection)
        hooks.onSelection(
          transaction.newSelection.toJSON(),
          transaction.annotation(Transaction.userEvent) ?? null,
        );
  });
}

/**
 * Listens on the editor's own elements only. Keys are heard in the capture phase, so keys an
 * editor command consumes (Vim's normal mode, shortcuts) are heard too.
 */
function watch(view: EditorView, hooks: ActivityHooks): void {
  const modifiers = (e: KeyboardEvent) =>
    (e.ctrlKey ? "C" : "") + (e.altKey ? "A" : "") + (e.shiftKey ? "S" : "") + (e.metaKey ? "M" : "");
  // With nothing selected, CodeMirror copies or cuts the cursors' whole lines.
  const clipboard = (kind: "copy" | "cut") => {
    const { ranges } = view.state.selection;
    const wholeLines = ranges.every((r) => r.empty);
    hooks.onClipboard(
      kind,
      ranges.map((r) => {
        if (!wholeLines) return { from: r.from, to: r.to };
        const line = view.state.doc.lineAt(r.head);
        return { from: line.from, to: line.to };
      }).filter((r) => wholeLines || r.from !== r.to),
      wholeLines,
    );
  };
  const lines = (): [number, number] => {
    const visible = view.visibleRanges;
    if (!visible.length) return [1, 1];
    return [
      view.state.doc.lineAt(visible[0].from).number,
      view.state.doc.lineAt(visible[visible.length - 1].to).number,
    ];
  };
  view.dom.addEventListener(
    "keydown",
    (e) => hooks.onKey("down", e.key, modifiers(e), e.repeat),
    true,
  );
  view.dom.addEventListener("keyup", (e) => hooks.onKey("up", e.key, modifiers(e), false), true);
  view.dom.addEventListener(
    "compositionstart",
    (e) => hooks.onKey("compose-start", e.data ?? "", "", false),
    true,
  );
  view.dom.addEventListener(
    "compositionend",
    (e) => hooks.onKey("compose-end", e.data ?? "", "", false),
    true,
  );
  view.dom.addEventListener("copy", () => clipboard("copy"), true);
  view.dom.addEventListener("cut", () => clipboard("cut"), true);
  view.contentDOM.addEventListener("focus", () => hooks.onFocus(true));
  view.contentDOM.addEventListener("blur", () => hooks.onFocus(false));
  view.scrollDOM.addEventListener("scroll", () => hooks.onScroll(...lines()), {
    passive: true,
  });
}

export interface EditorHooks {
  /** Called once per document-changing transaction, after it is applied. */
  onChange(transaction: Transaction, view: EditorView): void;
  onRun(): void;
  onPullRequest?(): void;
  /** Vim mode changes: normal, insert, visual, replace. */
  onVimMode?(mode: string): void;
}

export function createEditor(
  parent: HTMLElement,
  doc: string,
  hooks: EditorHooks,
  options: {
    language: FileLanguage;
    keymap: Keymap;
    label: string;
    /** Squiggles and hover types, for languages that have them. */
    types?: TypeChecker;
    activity?: ActivityHooks;
  },
): EditorView {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        // Vim goes first so its keys win over the defaults.
        options.keymap === "vim" ? vim() : [],
        ...shared(options.language),
        highlightActiveLine(),
        history(),
        indentOnInput(),
        bracketMatching(),
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              hooks.onRun();
              return true;
            },
          },
          {
            key: "Mod-Shift-Enter",
            run: () => {
              hooks.onPullRequest?.();
              return true;
            },
          },
          // Tab indents; Escape then Tab (or Ctrl-M) moves focus out of the editor.
          indentWithTab,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.contentAttributes.of({ "aria-label": options.label }),
        options.types ? typeHints(options.types, options.activity) : [],
        options.activity ? selections(options.activity) : [],
        EditorView.updateListener.of((update) => {
          for (const transaction of update.transactions)
            if (transaction.docChanged)
              hooks.onChange(transaction, update.view);
        }),
      ],
    }),
  });
  if (options.activity) watch(view, options.activity);
  if (options.keymap === "vim" && hooks.onVimMode) {
    hooks.onVimMode("normal");
    getCM(view)?.on("vim-mode-change", (event: { mode: string }) =>
      hooks.onVimMode?.(event.mode),
    );
  }
  return view;
}

/** Errors as squiggles (after a pause in typing) and the type under the pointer. */
function typeHints(types: TypeChecker, activity?: ActivityHooks): Extension {
  let shown = "";
  return [
    linter(
      async (view) => {
        const length = view.state.doc.length;
        try {
          const found = (await types.check(view.state.doc.toString())).map((d) => ({
            from: Math.min(d.from, length),
            to: Math.min(Math.max(d.to, d.from), length),
            severity: d.severity,
            message: d.message,
          }));
          // Recorded when what the editor shows changes, not on every check.
          const key = JSON.stringify(found);
          if (key !== shown) {
            shown = key;
            activity?.onAssist?.("diagnostics", found);
          }
          return found;
        } catch {
          return []; // The checker failing never gets in the way of editing.
        }
      },
      { delay: 500 },
    ),
    hoverTooltip(async (view, position) => {
      const hint = await types
        .hover(view.state.doc.toString(), position)
        .catch(() => null);
      if (!hint) return null;
      activity?.onAssist?.("hover", { from: hint.from, to: hint.to, type: hint.type });
      return {
        pos: hint.from,
        end: hint.to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "cm-type-hint";
          const type = dom.appendChild(document.createElement("code"));
          type.textContent = hint.type;
          if (hint.documentation) {
            const doc = dom.appendChild(document.createElement("p"));
            doc.textContent = hint.documentation;
          }
          return { dom };
        },
      };
    }),
  ];
}
