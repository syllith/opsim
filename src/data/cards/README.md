Card Data Schema (v1)

This folder contains structured JSON definitions for One Piece TCG cards.
All sets/cards should follow the schema below to keep the deck builder and simulator consistent.

Keep the text fields faithful to the printed card text. Use null when a field does not apply or is unknown from the scan.

Minimal JSON shape per card:

{
  "id": "ST01-001",
  "set": "ST01",
  "number": 1,
  "name": "Monkey. D. Luffy",
  "category": "Leader",
  "colors": ["Red"],
  "attribute": "Strike",
  "types": ["Supernovas", "Straw Hat Crew"],
  "rarity": null,
  "art": "/cards/ST01/ST01-001.png",
  "stats": {
    "cost": null,
    "power": 5000,
    "life": 5,
    "counter": { "present": false, "value": 0 }
  },
  "keywords": ["Once Per Turn"],
  "trigger": null,
  "text": "Activate: Main — Once Per Turn: ...",
  "abilities": [
    {
      "timing": "Activate: Main",
      "frequency": "Once Per Turn",
      "donReq": null,
      "cost": { "restDonFromCostArea": 0 },
      "effect": {
        "text": "Free-form rules text mirroring the card.",
        "grants": [],
        "powerMod": null,
        "targets": ["Leader", "Character"],
        "conditions": []
      }
    }
  ],
  "meta": { "notes": null }
}

Notes
- Use English printed text from the image.
- donReq means the DON!! requirement like “DON!! x2” attached to the card.
- If an effect moves or attaches DON!! from the cost area, use cost.restDonFromCostArea.
- Keep types in the printed slash-separated order.
- If a detail is not visible or certain, leave it null and add a short note in meta.notes.
