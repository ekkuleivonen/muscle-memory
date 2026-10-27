import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Colours come from CSS variables (--syn-*), set with the rest of the palette. */
export const highlight = HighlightStyle.define([
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
