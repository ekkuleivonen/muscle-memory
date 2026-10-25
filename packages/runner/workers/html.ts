import { PRELUDE } from "./shared";

/**
 * HTML, checked the way frontend tests check a page: the solution's markup is parsed into a
 * DOM (linkedom; no scripts run, nothing is fetched) and each case is a query against it.
 * A case's input is [selector, read]: "count" gives how many elements match; "text" their
 * text; "label" the accessible name of each form control; anything else is read as an
 * attribute (null when missing).
 */
export const HTML_WORKER =
  PRELUDE +
  String.raw`
let parseHTML = null;

async function boot(assets) {
  const url = URL.createObjectURL(new Blob([assets["dom.js"]], { type: "text/javascript" }));
  ({ parseHTML } = await import(url));
}

const squash = (text) => String(text || "").replace(/\s+/g, " ").trim();

/** The name a screen reader announces for a control: aria, then its label. */
function accessibleName(document, element) {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy)
    return squash(
      labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" "),
    );
  const aria = element.getAttribute("aria-label");
  if (aria) return squash(aria);
  const id = element.getAttribute("id");
  const byFor = id
    ? [...document.querySelectorAll("label")].find((label) => label.getAttribute("for") === id)
    : null;
  const label = byFor || element.closest("label");
  return label ? squash(label.textContent) : null;
}

function read(document, selector, how) {
  const elements = [...document.querySelectorAll(selector)];
  if (how === "count") return elements.length;
  if (how === "text") return elements.map((element) => squash(element.textContent));
  if (how === "label") return elements.map((element) => accessibleName(document, element));
  return elements.map((element) => element.getAttribute(how));
}

async function execute({ code, inputs, filename }) {
  let document;
  try {
    ({ document } = parseHTML(code));
  } catch (error) {
    return { phase: "compile", error: codeError(error, filename), tests: [] };
  }
  const tests = [];
  for (const [index, input] of inputs.entries()) {
    const [selector, how] = Array.isArray(input) ? input : [input, "count"];
    try {
      tests.push({ index, ...convert(read(document, String(selector), String(how))) });
    } catch (error) {
      // An invalid selector is the challenge's fault, not the person's markup.
      throw new Error("Check " + (index + 1) + " could not run: " + (error && error.message));
    }
  }
  return { phase: "tests", tests };
}
`;
