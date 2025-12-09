#!/usr/bin/env bash
set -euo pipefail

CARDS_DIR="src/data/cards"
OUT_DIR="reports"
OUT_FILE="$OUT_DIR/unique_traits.txt"

mkdir -p "$OUT_DIR"

aggregate_with_jq() {
  # Iterate files; for each trait output: "trait<TAB>cardId"
  # Later we will dedupe by trait and keep first cardId example
  find "$CARDS_DIR" -type f -name '*.json' -print0 | \
  while IFS= read -r -d '' file; do
    cardId=$(basename "$file" .json)
    # Extract traits and pair with cardId
    jq -r '.traits? // [] | .[]' "$file" 2>/dev/null | \
      grep -v '^$' | \
      while IFS= read -r trait; do
        printf "%s\t%s\n" "$trait" "$cardId"
      done
  done | \
  awk -F '\t' '!seen[$1]++ { print $1"\t"$2 }' | \
  sort -k1,1
}

aggregate_with_node() {
  node <<'NODE'
const fs = require('fs');
const path = require('path');
const CARDS_DIR = path.resolve(process.cwd(), 'src/data/cards');

/** Recursively collect JSON file paths */
function walk(dir, files=[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, files);
    else if (e.isFile() && e.name.endsWith('.json')) files.push(full);
  }
  return files;
}

const traitExample = new Map();
for (const file of walk(CARDS_DIR)) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(raw);
    const traits = Array.isArray(json.traits) ? json.traits : [];
    for (const t of traits) {
      if (typeof t !== 'string') continue;
      const trait = t.trim();
      if (!trait) continue;
      if (!traitExample.has(trait)) {
        const cardId = path.basename(file, '.json');
        traitExample.set(trait, cardId);
      }
    }
  } catch (e) {
    // Skip unreadable or invalid JSON files
  }
}
// Output sorted by trait name as "trait - CARD_ID"
const lines = Array.from(traitExample.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([trait, cardId]) => `${trait} - ${cardId}`);
console.log(lines.join('\n'));
NODE
}

if command -v jq >/dev/null 2>&1; then
  # Use jq path and format output lines as "trait - CARD_ID"
  aggregate_with_jq | awk -F '\t' '{ print $1" - "$2 }' > "$OUT_FILE"
else
  echo "jq not found; using Node.js fallback" >&2
  aggregate_with_node > "$OUT_FILE"
fi

COUNT=$(wc -l < "$OUT_FILE" | tr -d '[:space:]')
echo "Aggregated unique traits: $COUNT" >&2
echo "Output written to $OUT_FILE" >&2
