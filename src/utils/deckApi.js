export async function listDecks() {
  const res = await fetch('/api/decks', { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to list decks');
  return data.decks || [];
}

export async function getDeck(name) {
  const res = await fetch(`/api/decks/${encodeURIComponent(name)}`, { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load deck');
  return data;
}

export async function saveDeck({ name, leaderId, items, text }) {
  const res = await fetch('/api/decks/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, leaderId, items, text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save deck');
  return data;
}

export async function deleteDeck(name) {
  const res = await fetch(`/api/decks/${encodeURIComponent(name)}`, { method: 'DELETE', credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete deck');
  return data;
}
