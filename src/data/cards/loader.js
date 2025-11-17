// Loader for card JSON files.
// In production and on the public site, we fetch live JSON from the server API
// to ensure edits are reflected without rebuilding. In dev, fall back to Vite
// eager import if the API is unavailable.

export async function loadAllCards() {
  try {
    const resp = await fetch(`/api/cards/data?v=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) throw new Error('failed');
    const { cards } = await resp.json();
    return buildIndexes(cards || []);
  } catch {
    // Fallback to bundled JSON (useful in dev environments)
    const modules = import.meta?.glob?.('./**/*.json', { eager: true }) || {};
    const cards = [];
    for (const key of Object.keys(modules)) {
      const mod = modules[key];
      const card = mod?.default || mod;
      if (card && card.id) cards.push(card);
    }
    return buildIndexes(cards);
  }
}

function buildIndexes(cards) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const bySet = cards.reduce((acc, c) => {
    acc[c.set] = acc[c.set] || [];
    acc[c.set].push(c);
    return acc;
  }, {});
  Object.keys(bySet).forEach((k) => bySet[k].sort((a, b) => (a.number ?? 0) - (b.number ?? 0)));
  return { cards, byId, bySet };
}

export function cardImageUrl(card) {
  const art = card?.art;
  if (!art) return null;
  // Normalize to server static mount at /api/cards/assets -> public/cards
  // Accept art like "/cards/SET/FILE.png" or "/SET/FILE.png"
  if (art.startsWith('/cards/')) {
    return `/api/cards/assets${art.replace(/^\/cards\//, '/')}`;
  }
  if (art.startsWith('/')) {
    return `/api/cards/assets${art}`;
  }
  return art; // absolute URL or data URI
}

export function formatDeckText(items) {
  const lines = [];
  for (const { id, count } of items) {
    lines.push(`${count}x${id}`);
  }
  return lines.join('\n');
}

export function parseDeckText(text) {
  const map = new Map();
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line) => {
      const m = line.match(/^(\d+)x\s*([A-Z0-9-]+)/i);
      if (!m) return;
      const count = Math.max(1, Math.min(4, parseInt(m[1], 10)));
      const id = m[2].toUpperCase();
      map.set(id, (map.get(id) || 0) + count);
    });
  return Array.from(map.entries()).map(([id, count]) => ({ id, count }));
}

export function validateDeck({ leaderId, items }, { byId }) {
  const issues = [];
  if (!leaderId) issues.push('Select exactly 1 Leader.');
  const counts = items.reduce((a, b) => a + (b.count || 0), 0);
  if (counts !== 50) issues.push(`Deck must contain 50 cards (has ${counts}).`);
  // Max 4 copies rule
  for (const it of items) {
    if (it.count > 4) issues.push(`Too many copies of ${it.id} (max 4).`);
  }
  // Color restriction based on leader
  if (leaderId && byId.has(leaderId)) {
    const leader = byId.get(leaderId);
    const allowed = new Set(leader.colors || []);
    for (const it of items) {
      const card = byId.get(it.id);
      if (!card) continue;
      const ok = (card.colors || []).every((c) => allowed.has(c));
      if (!ok) issues.push(`Color mismatch: ${it.id} not allowed for leader ${leaderId}.`);
    }
  }
  return issues;
}
