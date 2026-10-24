/**
 * CodeMirror 6 setup for the Python workspace. Every feature is listed in EDITOR_FEATURES and
 * recorded with the session; there is no autocompletion, bracket auto-closing, linting or AI
 * assistance. The editor owns its document, so typing never re-renders React.
 */
import { EditorState, Transaction } from "@codemirror/state";
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
  defaultHighlightStyle,
  indentOnInput,
  indentUnit,
  LanguageSupport,
  syntaxHighlighting,
} from "@codemirror/language";
import { pythonLanguage } from "@codemirror/lang-python";

export const EDITOR = {
  name: "codemirror-6",
  features: [
    "python-syntax-highlighting",
    "python-auto-indent",
    "tab-indents-4-spaces",
    "undo-redo-history",
    "bracket-match-highlight",
    "line-numbers",
    "mod-enter-runs",
  ],
} as const;

export interface EditorHooks {
  /** Called once per document-changing transaction, after it is applied. */
  onChange(transaction: Transaction, view: EditorView): void;
  onRun(): void;
}

export function createEditor(
  parent: HTMLElement,
  doc: string,
  hooks: EditorHooks,
): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentUnit.of("    "),
        EditorState.tabSize.of(4),
        // Language data only, without the completion source `python()` would add.
        new LanguageSupport(pythonLanguage),
        indentOnInput(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              hooks.onRun();
              return true;
            },
          },
          // Tab indents; Escape then Tab (or Ctrl-M) moves focus out of the editor.
          indentWithTab,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.contentAttributes.of({
          "aria-label": "Python code editor",
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "off",
        }),
        EditorView.updateListener.of((update) => {
          for (const transaction of update.transactions)
            if (transaction.docChanged)
              hooks.onChange(transaction, update.view);
        }),
      ],
    }),
  });
}
