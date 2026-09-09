/**
 * Shared page-geometry primitives for the Office of the City Mayor printables.
 *
 * Extracted from generateJobOrderMemo.ts when the Special Order printable
 * needed the same measurements. Only the parts that are genuinely template
 * independent live here — unit conversion, Times New Roman advance widths, and
 * greedy line breaking. Everything that models a *particular* document's boxes
 * (which paragraphs exist, how tall a table row is, where the page breaks)
 * stays in that document's generator, because those numbers are read off its
 * own stylesheet.
 *
 * Why measure at all: Chrome offers no way to bottom-align a box on the LAST
 * printed page only — position:fixed and a repeating <tfoot> both print on
 * every page. So the generators model the printed flow themselves to work out
 * how tall the closing group must be, and decline to pin when the model is not
 * sure of itself.
 *
 * No `@/` alias and .ts extensions on the relative imports that reach this
 * file, so it stays loadable from supabase/tests/*.test.mts under Node's plain
 * ESM loader.
 */

/** The stylesheets are written in px and inches; the geometry works in points. */
export const fromPx = (n: number) => n * 0.75;
export const fromIn = (n: number) => n * 72;

/** A line box. Both templates inherit body line-height 1.35 unless overridden. */
export const lineBox = (fontPt: number, lineHeight = 1.35) => fontPt * lineHeight;

/** Printable width inside the @page margins: 8.5in less 0.6in on each side. */
export const CONTENT_WIDTH_PT = fromIn(7.3);

/**
 * How much of a page the frame table's body cell gets before the repeating
 * validity footer claims the rest — measured off a Chrome print, where the
 * footer's band starts 841.5pt below the top of the content area.
 */
export const PAGE_CAPACITY_PT = 841.5;

/**
 * Where the closing group's bottom edge is aimed. A few points short of
 * PAGE_CAPACITY_PT so an estimate that runs slightly long still fits on the
 * page it was measured for instead of being bumped onto the next one.
 */
export const TAIL_BOTTOM_PT = 834;

/** A page break landing this close to a row edge is a coin toss — don't pin. */
export const BREAK_CONFIDENCE_PT = 1.5;

/**
 * How close a word may come to its column edge before the line it lands on is
 * called a coin toss too. The widths below reproduce Chrome's breaking of
 * these templates' text exactly, so the only slack this has to cover is
 * rounding.
 */
export const WRAP_CONFIDENCE_PT = 0.75;

/**
 * Times New Roman advance widths in 1/1000 em, which Monotype shares with
 * Adobe's Times. Enough to reproduce Chrome's line breaking for the plain
 * ASCII these templates print; anything outside the table (an accented letter,
 * a typographic dash) is charged the 500 that most glyphs carry.
 */
const TIMES_WIDTHS: Record<string, number> = {
  " ": 250, "!": 333, '"': 408, "#": 500, $: 500, "%": 833, "&": 778, "'": 333,
  "(": 333, ")": 333, "*": 500, "+": 564, ",": 250, "-": 333, ".": 250, "/": 278,
  "0": 500, "1": 500, "2": 500, "3": 500, "4": 500, "5": 500, "6": 500, "7": 500,
  "8": 500, "9": 500, ":": 278, ";": 278, "<": 564, "=": 564, ">": 444, "?": 444,
  "@": 921,
  A: 722, B: 667, C: 667, D: 722, E: 611, F: 556, G: 722, H: 722, I: 333,
  J: 389, K: 722, L: 611, M: 889, N: 722, O: 722, P: 556, Q: 722, R: 667,
  S: 556, T: 611, U: 722, V: 722, W: 944, X: 722, Y: 722, Z: 611,
  "[": 333, "\\": 278, "]": 333, "^": 469, _: 500, "`": 333,
  a: 444, b: 500, c: 444, d: 500, e: 444, f: 333, g: 500, h: 500, i: 278,
  j: 278, k: 500, l: 278, m: 778, n: 500, o: 500, p: 500, q: 500, r: 333,
  s: 389, t: 278, u: 500, v: 500, w: 722, x: 500, y: 500, z: 444,
  "{": 480, "|": 200, "}": 480, "~": 541,
};
const DEFAULT_GLYPH_WIDTH = 500;

export function textWidthPt(text: string, fontPt: number): number {
  let units = 0;
  for (const ch of text) units += TIMES_WIDTHS[ch] ?? DEFAULT_GLYPH_WIDTH;
  return (units / 1000) * fontPt;
}

export interface WrapResult {
  lines: number;
  /** A break decision fell within WRAP_CONFIDENCE_PT of the column edge. */
  tight: boolean;
}

/**
 * Greedy line breaking, the way a browser does it. `tight` reports that some
 * word landed within a whisker of the edge, i.e. that a font metric this
 * table only approximates could have put it on the other line.
 */
export function wrapLines(
  text: string,
  widthPt: number,
  fontPt: number,
  firstLineIndentPt = 0,
): WrapResult {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: 1, tight: false };

  const spacePt = textWidthPt(" ", fontPt);
  let lines = 1;
  let used = firstLineIndentPt;
  let atLineStart = true;
  let tight = false;

  for (const word of words) {
    const wordPt = textWidthPt(word, fontPt);
    const advance = atLineStart ? wordPt : spacePt + wordPt;
    if (Math.abs(widthPt - (used + advance)) < WRAP_CONFIDENCE_PT) tight = true;
    if (!atLineStart && used + advance > widthPt) {
      lines++;
      used = wordPt;
    } else {
      used += advance;
    }
    atLineStart = false;
    // word-wrap: break-word — a word wider than the column splits mid-word.
    while (used > widthPt) {
      lines++;
      used -= widthPt;
    }
  }
  return { lines, tight };
}

/** Escapes a value before it is interpolated into a printable's HTML. */
export function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "2026-07-22" -> "22 July 2026", the format both templates use. */
export function formatDocumentDate(iso: string): string {
  // `T00:00:00` keeps a date-only value on its own calendar day instead of
  // being parsed as UTC midnight and shifted back one day in PH time.
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.toLocaleString("en-US", { month: "long" });
  return `${d.getDate()} ${month} ${d.getFullYear()}`;
}
