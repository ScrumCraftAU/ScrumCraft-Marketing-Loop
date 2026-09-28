import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Brand guardrails (Confluence "ScrumCraft Brand Guide"):
 * - Never black: no black text, icons or colours.
 * - Only brand colours: use the tokens in globals.css (bg-primary, bg-cta, bg-good,
 *   text-muted-foreground, …), never Tailwind's default palette or ad-hoc hex values.
 */
const SRC = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const GLOBALS = join(SRC, "app", "globals.css");

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: "black utility class", pattern: /\b(?:text|bg|border|fill|stroke|ring|outline|from|via|to|shadow)-black\b/ },
  { name: "black colour value", pattern: /#000(?:000)?\b|rgba?\(\s*0\s*,\s*0\s*,\s*0\b|oklch\(\s*0(?:\.1\d*)?\s+0\s+0\b|\bcolor:\s*black\b/i },
  {
    name: "non-brand Tailwind palette colour",
    pattern: /\b(?:text|bg|border|fill|stroke|ring|outline|from|via|to|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
  },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(tsx?|css)$/.test(e.name) && !e.name.endsWith(".test.ts"))
    .map((e) => join(e.parentPath, e.name));
}

test("no black or off-palette colours anywhere in src", () => {
  const files = sourceFiles(SRC);
  assert.ok(files.length > 20, `expected to scan the app's source files, found ${files.length}`);
  assert.ok(files.includes(GLOBALS), "globals.css not scanned");
  const problems: string[] = [];
  for (const file of files) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      for (const { name, pattern } of FORBIDDEN) {
        if (pattern.test(line)) problems.push(`${relative(SRC, file)}:${i + 1} ${name}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(problems, []);
});

test("hex colours are only defined in globals.css brand tokens", () => {
  const stray = sourceFiles(SRC)
    .filter((f) => f !== GLOBALS)
    .flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.test(line) && !/^\s*(\/\/|\*)/.test(line) ? [`${relative(SRC, file)}:${i + 1}`] : [])),
    );
  assert.deepEqual(stray, []);
});

test("brand palette tokens are present", () => {
  const css = readFileSync(GLOBALS, "utf8");
  for (const hex of ["#3e225c", "#f47f48", "#ed174c", "#4ec1b8", "#00bcce", "#fee8db"]) {
    assert.ok(css.includes(hex), `missing brand colour ${hex}`);
  }
  assert.match(css, /--foreground:\s*var\(--brand-purple\)/);
});
