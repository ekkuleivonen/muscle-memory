/**
 * CodeMirror 6 setup for practice. Every feature is listed in editorFeatures() and recorded
 * with the session; there is no autocompletion, bracket auto-closing, linting or AI
 * assistance. The editor owns its document, so typing never re-renders React.
 */
import { EditorState, type Extension, Prec, Transaction } from "@codemirror/state";
import {
  activateHover,
  closeHoverTooltips,
  hasHoverTooltips,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import {
  forEachDiagnostic,
  linter,
  nextDiagnostic,
  previousDiagnostic,
  openLintPanel,
} from "@codemirror/lint";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlight } from "./highlight";
import type { FileLanguage } from "../../lib/languages";
import { TYPE_CHECK_FEATURES, type TypeChecker } from "./type-checker";

export type Keymap = "standard" | "vim";

/**
 * Language data only (highlighting, indentation), never the completion sources. Loaded on
 * demand, so a challenge downloads its own language's grammar and not every other one.
 */
async function languageSupport(
  language: Exclude<FileLanguage, "text">,
): Promise<LanguageSupport> {
  switch (language) {
    case "python":
      return new LanguageSupport((await import("@codemirror/lang-python")).pythonLanguage);
    case "javascript":
      return new LanguageSupport(
        (await import("@codemirror/lang-javascript")).javascriptLanguage,
      );
    case "typescript":
      return new LanguageSupport(
        (await import("@codemirror/lang-javascript")).typescriptLanguage,
      );
    case "go":
      return new LanguageSupport((await import("@codemirror/lang-go")).goLanguage);
    case "rust":
      return new LanguageSupport((await import("@codemirror/lang-rust")).rustLanguage);
    case "c":
    case "cpp":
      return new LanguageSupport((await import("@codemirror/lang-cpp")).cppLanguage);
    case "php":
      return new LanguageSupport((await import("@codemirror/lang-php")).phpLanguage);
    case "sql":
      return new LanguageSupport((await import("@codemirror/lang-sql")).StandardSQL.language);
    case "html":
      return new LanguageSupport((await import("@codemirror/lang-html")).htmlLanguage);
    case "markdown":
      return new LanguageSupport(
        (await import("@codemirror/lang-markdown")).markdownLanguage,
      );
    case "java":
      return new LanguageSupport((await import("@codemirror/lang-java")).javaLanguage);
    case "csharp":
      return new LanguageSupport(
        StreamLanguage.define((await import("@codemirror/legacy-modes/mode/clike")).csharp),
      );
    case "ruby":
      return new LanguageSupport(
        StreamLanguage.define((await import("@codemirror/legacy-modes/mode/ruby")).ruby),
      );
  }
}

/** What createEditor needs that is loaded on demand: the language's grammar and Vim. */
export interface EditorModes {
  language: LanguageSupport | null;
  vim: typeof import("@replit/codemirror-vim") | null;
}

/**
 * Loads the language and keymap an editor needs. Safe to call early to start the downloads;
 * repeated calls share the same modules.
 */
export async function loadEditorModes(
  language: FileLanguage,
  keys: Keymap,
): Promise<EditorModes> {
  const [support, vim] = await Promise.all([
    language === "text" ? null : languageSupport(language),
    keys === "vim" ? import("@replit/codemirror-vim") : null,
  ]);
  return { language: support, vim };
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

const shared = (language: FileLanguage, modes: EditorModes): Extension[] => [
  lineNumbers(),
  highlightActiveLineGutter(),
  // A steady cursor, as in a terminal; the block shape is the stylesheet's.
  drawSelection({ cursorBlinkRate: 0 }),
  indentUnit.of(indent(language)),
  EditorState.tabSize.of(4),
  modes.language ?? [],
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
      "mod-enter-submits",
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
  /** `key` is what the key typed ("ä"); `code` the physical key ("Quote"). */
  onKey(
    kind: "down" | "up" | "compose-start" | "compose-end",
    key: string,
    code: string,
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
    (e) => hooks.onKey("down", e.key, e.code, modifiers(e), e.repeat),
    true,
  );
  view.dom.addEventListener(
    "keyup",
    (e) => hooks.onKey("up", e.key, e.code, modifiers(e), false),
    true,
  );
  view.dom.addEventListener(
    "compositionstart",
    (e) => hooks.onKey("compose-start", e.data ?? "", "", "", false),
    true,
  );
  view.dom.addEventListener(
    "compositionend",
    (e) => hooks.onKey("compose-end", e.data ?? "", "", "", false),
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
  /** Mod-Enter: Submit. */
  onSubmit(): void;
  /** Vim mode changes: normal, insert, visual, replace. */
  onVimMode?(mode: string): void;
}

export function createEditor(
  parent: HTMLElement,
  doc: string,
  hooks: EditorHooks,
  options: {
    language: FileLanguage;
    label: string;
    /** From loadEditorModes: the language's grammar, and Vim when that is the keymap. */
    modes: EditorModes;
    /** Squiggles and hover types, for languages that have them. */
    types?: TypeChecker;
    activity?: ActivityHooks;
  },
): EditorView {
  const { vim } = options.modes;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        // Preserve the escape route even when Vim or a tooltip handles Escape.
        Prec.highest(
          EditorView.domEventHandlers({
            keydown(event, view) {
              if (event.key === "Escape") view.setTabFocusMode(2000);
              return false;
            },
          }),
        ),
        // Vim goes first so its keys win over the defaults.
        vim ? vim.vim() : [],
        ...shared(options.language, options.modes),
        highlightActiveLine(),
        history(),
        indentOnInput(),
        bracketMatching(),
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              hooks.onSubmit();
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
  if (vim && hooks.onVimMode) {
    hooks.onVimMode("normal");
    vim.getCM(view)?.on("vim-mode-change", (event: { mode: string }) =>
      hooks.onVimMode?.(event.mode),
    );
  }
  return view;
}

/** Errors as squiggles (after a pause in typing) and the type under the pointer. */
function typeHints(types: TypeChecker, activity?: ActivityHooks): Extension {
  let shown = "";
  let keyboardRequest = false;
  const tooltip = hoverTooltip(async (view, position) => {
    const keyboard = keyboardRequest;
    keyboardRequest = false;
    const doc = view.state.doc;
    const hint = await types.hover(doc.toString(), position).catch(() => null);
    if (!view.dom.isConnected || view.state.doc !== doc) return null;
    if (keyboard) {
      if (view.state.selection.main.head !== position) return null;
      if (!hint)
        view.dispatch({
          effects: EditorView.announce.of("No type information at the cursor."),
        });
    }
    if (!hint) return null;
    activity?.onAssist?.("hover", {
      from: hint.from,
      to: hint.to,
      type: hint.type,
    });
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
          const documentation = dom.appendChild(document.createElement("p"));
          documentation.textContent = hint.documentation;
        }
        // Announce after the tooltip mounts: dispatching in its async source would
        // cancel CodeMirror's pending tooltip request.
        if (keyboard)
          queueMicrotask(() => {
            if (
              dom.isConnected &&
              view.state.doc === doc &&
              view.state.selection.main.head === position
            )
              view.dispatch({
                effects: EditorView.announce.of(
                  `${hint.type}${hint.documentation ? `. ${hint.documentation}` : ""}`,
                ),
              });
          });
        return { dom };
      },
    };
  });
  const diagnostic = (view: EditorView, backwards: boolean) => {
    (backwards ? previousDiagnostic : nextDiagnostic)(view);
    const selection = view.state.selection.main;
    let message = "No other diagnostics.";
    forEachDiagnostic(view.state, (item, from, to) => {
      if (from === selection.from && to === selection.to)
        message = item.message;
    });
    view.dispatch({ effects: EditorView.announce.of(message) });
    return true;
  };
  return [
    // These commands also work in Vim mode and never change the document.
    Prec.highest(
      keymap.of([
        {
          key: "F1",
          run: (view) => {
            keyboardRequest = true;
            activateHover(view, view.state.selection.main.head, 1, {
              tooltip,
              until: (transaction) =>
                transaction.docChanged || !!transaction.selection,
            });
            keyboardRequest = false;
            return true;
          },
        },
        { key: "F8", run: (view) => diagnostic(view, false) },
        { key: "Shift-F8", run: (view) => diagnostic(view, true) },
        { key: "Mod-Shift-m", run: openLintPanel },
        {
          key: "Escape",
          run: (view) => {
            if (!hasHoverTooltips(view.state)) return false;
            view.dispatch({ effects: closeHoverTooltips });
            return true;
          },
        },
      ]),
    ),
    linter(
      async (view) => {
        const length = view.state.doc.length;
        try {
          const found = (await types.check(view.state.doc.toString())).map(
            (d) => ({
              from: Math.min(d.from, length),
              to: Math.min(Math.max(d.to, d.from), length),
              severity: d.severity,
              message: d.message,
            }),
          );
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
    tooltip,
  ];
}
