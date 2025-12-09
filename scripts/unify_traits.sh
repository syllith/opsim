#!/usr/bin/env bash
set -euo pipefail

CARDS_DIR="src/data/cards"
OUT_DIR="reports"
CHANGES_TXT="$OUT_DIR/traits_unify_changes.txt"
PROPOSED_JSON="$OUT_DIR/traits_unify_proposed.json"
APPLY=${1:-}

mkdir -p "$OUT_DIR"

run_node() {
node <<'NODE'
const fs = require('fs');
const path = require('path');
const CARDS_DIR = path.resolve(process.cwd(), 'src/data/cards');
const OUT_DIR = path.resolve(process.cwd(), 'reports');
const CHANGES_TXT = path.join(OUT_DIR, 'traits_unify_changes.txt');
const PROPOSED_JSON = path.join(OUT_DIR, 'traits_unify_proposed.json');

function walk(dir, files=[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, files);
    else if (e.isFile() && e.name.endsWith('.json')) files.push(full);
  }
  return files;
}

function titleCaseWord(w) {
  if (!w) return w;
  return w[0].toUpperCase() + w.slice(1);
}

// Special mappings to match existing canonical trait style derived from types
const SPECIAL = new Map([
  ['straw hat crew', 'strawHatCrew'],
  ['world government', 'worldGovernment'],
  ['fish man', 'fishMan'],
  ['fish man island', 'fishManIsland'],
  ['water 7', 'waterSeven'],
  ['germa 66', 'germa66'],
  ['cp0', 'cp0'],
  ['cp-0', 'cp0'],
  ['cp9', 'cp9'],
  ['cp-9', 'cp9'],
  ['seven warlords of the sea', 'theSevenWarlordsOfTheSea'],
  ['the seven warlords of the sea', 'theSevenWarlordsOfTheSea'],
  ['four emperors', 'theFourEmperors'],
  ['red-haired pirates', 'redHairedPirates'],
  ['red hair pirates', 'redHairedPirates'],
]);

// Canonicalization map to unify existing trait variants and typos
const DEFAULT_CANONICAL = {
  // Common variant fixes
  'redHairPirates': 'redHairedPirates',
  'strawhatCrew': 'strawHatCrew',
  'water7': 'waterSeven',
  'grantesoro': 'granTesoro',
  'the7WarlordsOfTheSea': 'theSevenWarlordsOfTheSea',
  'theSevenWarlords': 'theSevenWarlordsOfTheSea',
  'fishman': 'fishMan',
  'fishmanIsland': 'fishManIsland',
  'w7': 'waterSeven',
  'kingdomOfGerma': 'germaKingdom',
};

// Load user-provided canonical overrides if present
let USER_CANONICAL = {};
try {
  const mapPath = path.resolve(process.cwd(), 'reports/trait_canonical_map.json');
  if (fs.existsSync(mapPath)) {
    USER_CANONICAL = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  }
} catch (e) {
  USER_CANONICAL = {};
}
const CANONICAL = new Map(Object.entries({ ...DEFAULT_CANONICAL, ...USER_CANONICAL }));

function canonicalize(trait) {
  if (!trait || typeof trait !== 'string') return trait;
  const t = trait.trim();
  return CANONICAL.get(t) || t;
}

function normalizeTraitFromType(typeStr) {
  if (typeof typeStr !== 'string') return null;
  let s = typeStr.trim();
  if (!s) return null;
  // Lowercase and remove punctuation except spaces and digits
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Special mapping overrides
  if (SPECIAL.has(s)) return canonicalize(SPECIAL.get(s));
  // Convert to camelCase tokens
  const tokens = s.split(' ');
  const first = tokens[0];
  const rest = tokens.slice(1).map(titleCaseWord);
  const camel = [first, ...rest].join('');
  return canonicalize(camel);
}

function normalizeExistingTrait(t) {
  if (typeof t !== 'string') return null;
  const s = t.trim();
  if (!s) return null;
  // Keep as-is if already machine readable; just collapse whitespace
  return canonicalize(s.replace(/\s+/g, ''));
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const files = walk(CARDS_DIR);
const proposals = [];
let changedCount = 0;
let examined = 0;

for (const file of files) {
  examined++;
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    continue;
  }
  const types = Array.isArray(json.types) ? json.types : [];
  const traits = Array.isArray(json.traits) ? json.traits : [];

  const normalizedFromTypes = Array.from(new Set(types.map(normalizeTraitFromType).filter(Boolean)));
  const normalizedExisting = Array.from(new Set(traits.map(normalizeExistingTrait).filter(Boolean)));

  // Remove suspicious single-letter traits
  const filteredExisting = normalizedExisting.filter(x => x.length > 1);

  // If existing already matches types-based, skip
  const sortedTypesNorm = [...normalizedFromTypes].sort();
  const sortedExisting = [...filteredExisting].sort();

  // Decide new traits: prefer types-derived to fix mistakes like single letters
  let newTraits = normalizedFromTypes;
  const sameSets = arraysEqual(sortedTypesNorm, sortedExisting);
  const sameExact = arraysEqual(Array.isArray(traits) ? traits.map(t => t) : [], newTraits);

  if (!sameSets || !sameExact) {
    proposals.push({
      file,
      cardId: json.cardId || path.basename(file, '.json'),
      before: traits,
      beforeNormalized: filteredExisting,
      types,
      typesNormalized: normalizedFromTypes,
      after: newTraits,
    });
    changedCount++;
  }
}

// Write proposed changes JSON
fs.writeFileSync(PROPOSED_JSON, JSON.stringify({ examined, changedCount, proposals }, null, 2));

// Write readable text summary
const lines = [];
lines.push(`Examined: ${examined}`);
lines.push(`Proposed changes: ${changedCount}`);
for (const p of proposals.slice(0, 500)) { // cap summary for readability
  lines.push(`\n${p.cardId} (${p.file})`);
  lines.push(`  types: ${JSON.stringify(p.types)}`);
  lines.push(`  typesNormalized: ${JSON.stringify(p.typesNormalized)}`);
  lines.push(`  traits(before): ${JSON.stringify(p.before)}`);
  lines.push(`  traitsNormalized(before): ${JSON.stringify(p.beforeNormalized)}`);
  lines.push(`  traits(after): ${JSON.stringify(p.after)}`);
}
fs.writeFileSync(CHANGES_TXT, lines.join('\n'));

// If apply requested via env, modify files
if (process.env.APPLY === '1') {
  for (const p of proposals) {
    try {
      const raw = fs.readFileSync(p.file, 'utf8');
      const obj = JSON.parse(raw);
      obj.traits = p.after;
      fs.writeFileSync(p.file, JSON.stringify(obj, null, 2) + '\n');
    } catch (e) {
      // skip
    }
  }
  console.log(`Applied ${proposals.length} trait updates.`);
} else {
  console.log('Dry run complete. See reports for proposed changes.');
}
NODE
}

if [[ "${APPLY}" == "--apply" ]]; then
  APPLY=1 APPLY=1 node -e "" >/dev/null 2>&1 || true # no-op to set env for child
  APPLY=1 run_node
else
  run_node
fi

echo "Output written to: $CHANGES_TXT and $PROPOSED_JSON" >&2
