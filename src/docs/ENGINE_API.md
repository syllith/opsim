# Engine Adapter API (quick reference)

Exports:
- events - EventEmitter. Emits: areasChanged, log (string), phaseChanged.
- getCardMeta(cardId)
- getTotalPower(side, section, keyName, index, cardId)
- getKeywordsFor(cardId)
- hasDisabledKeyword(side, section, keyName, index, keyword)
- applyPowerMod(...)
- grantTempKeyword(...)
- disableKeyword(...)
- moveDonFromCostToCard(...)

Adapter must return Promises and emit areasChanged after state mutations.
