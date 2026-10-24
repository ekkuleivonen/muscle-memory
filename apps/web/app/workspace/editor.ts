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
  keymap,
  lineNumbers,
} from "@codemirror/view";
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

export type Keymap = "standard" | "vim";

/** Language data only (highlighting, indentation), never the completion sources. */
function languageSupport(language: FileLanguage): LanguageSupport {
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

/** Colours come from CSS variables, so the IDE follows light and dark mode. */
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
  drawSelection(),
  indentUnit.of(indent(language)),
  EditorState.tabSize.of(4),
  languageSupport(language),
  syntaxHighlighting(highlight),
  EditorView.contentAttributes.of({
    spellcheck: "false",
    autocorrect: "off",
    autocapitalize: "off",
  }),
];

/** What the opened observation records as the editor's features. */
export function editorFeatures(language: FileLanguage, keys: Keymap) {
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
    ],
  };
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
  options: { language: FileLanguage; keymap: Keymap; label: string },
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
        EditorView.updateListener.of((update) => {
          for (const transaction of update.transactions)
            if (transaction.docChanged)
              hooks.onChange(transaction, update.view);
        }),
      ],
    }),
  });
  if (options.keymap === "vim" && hooks.onVimMode) {
    hooks.onVimMode("normal");
    getCM(view)?.on("vim-mode-change", (event: { mode: string }) =>
      hooks.onVimMode?.(event.mode),
    );
  }
  return view;
}

/** Tests and README: highlighted and selectable, never editable or recorded. */
export function createViewer(
  parent: HTMLElement,
  doc: string,
  options: { language: FileLanguage; label: string },
): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        ...shared(options.language),
        EditorState.readOnly.of(true),
        EditorView.contentAttributes.of({ "aria-label": options.label }),
      ],
    }),
  });
}
