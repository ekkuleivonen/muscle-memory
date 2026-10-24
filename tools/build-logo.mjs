#!/usr/bin/env node
/**
 * Draws the logo: the "M" of the terminal wordmark (figlet's ANSI Shadow font) as SVG, so the
 * favicon and the sidebar mark match the header. Each character is a 1×2 cell: █ becomes a
 * block, the box-drawing shadow becomes strokes. Writes apps/web/app/icon.svg (the favicon)
 * and apps/web/public/logo.svg.
 *
 *   node tools/build-logo.mjs
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const M = [
  "███╗   ███╗",
  "████╗ ████║",
  "██╔████╔██║",
  "██║╚██╔╝██║",
  "██║ ╚═╝ ██║",
  "╚═╝     ╚═╝",
];

const BACKGROUND = "#0f1012";
const BLOCK = "#7d86f1"; // the terminal accent
const SHADOW = "#454b9c";
const PAD_X = 2.5;
const PAD_Y = 2;

/** Stroke paths per box-drawing character, from the cell's edges through its centre. */
function stroke(char, x, y) {
  const cx = x + 0.5;
  const cy = y + 1;
  const paths = {
    "═": `M${x} ${cy}H${x + 1}`,
    "║": `M${cx} ${y}V${y + 2}`,
    "╗": `M${x} ${cy}H${cx}V${y + 2}`,
    "╔": `M${x + 1} ${cy}H${cx}V${y + 2}`,
    "╚": `M${cx} ${y}V${cy}H${x + 1}`,
    "╝": `M${cx} ${y}V${cy}H${x}`,
  };
  return paths[char];
}

const blocks = [];
const shadows = [];
M.forEach((line, row) => {
  [...line].forEach((char, col) => {
    const x = PAD_X + col;
    const y = PAD_Y + row * 2;
    // A hair of overlap so neighbouring blocks don't show seams when scaled.
    if (char === "█")
      blocks.push(`<rect x="${x}" y="${y}" width="1.04" height="2.04"/>`);
    else if (stroke(char, x, y)) shadows.push(stroke(char, x, y));
  });
});

const width = M[0].length + PAD_X * 2;
const height = M.length * 2 + PAD_Y * 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" rx="3" fill="${BACKGROUND}"/>
<path d="${shadows.join("")}" fill="none" stroke="${SHADOW}" stroke-width="0.24" stroke-linecap="square"/>
<g fill="${BLOCK}">${blocks.join("")}</g>
</svg>
`;

for (const path of ["apps/web/app/icon.svg", "apps/web/public/logo.svg"])
  await writeFile(resolve(path), svg);
console.log(`Logo: ${width}×${height}, ${blocks.length} blocks.`);
