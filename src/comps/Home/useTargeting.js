import { useState, useCallback, useEffect } from 'react';

// Initial targeting state factory so we can reset cleanly
const createInitialTargetingState = () => ({
  active: false,
  side: null,
  section: null,
  keyName: null,
  min: 1,
  max: 1,
  validator: null, // (card, ctx?) => boolean
  selectedIdx: [], // indices (single-section mode)
  multi: false, // allow clicks across multiple sections
  selected: [], // [{ side, section, keyName, index }]
  onComplete: null,
  suspended: false,
  sessionId: null,
  origin: null, // { side, section, keyName, index }
  abilityIndex: null, // number | null
  type: null // 'ability' | 'attack' | null
});

/**
 * useTargeting hook encapsulates the targeting lifecycle used by abilities & attacks.
 * Responsibilities:
 *  - Hold targeting state shape
 *  - Start / suspend / cancel / confirm targeting sessions
 *  - Auto-confirm when selection count meets constraints
 *
 * External dependencies passed in options:
 *  - areas: current board areas (for resolving selected cards during confirm)
 *  - battle: current battle object (used to preserve battle arrow when cancelling)
 *  - setBattleArrow: function to set arrow preview
 *  - setCurrentAttack: function to clear attack preview when cancelling outside battle
 */
export function useTargeting({ areas, battle, setBattleArrow, setCurrentAttack }) {
  const [targeting, setTargeting] = useState(createInitialTargetingState);

  const startTargeting = useCallback((descriptor, onComplete) => {
    const { side, section, keyName, min = 1, max = 1, validator = null, multi = false, origin = null, abilityIndex = null, type = 'ability' } = descriptor || {};
    const sessionId = Date.now() + Math.random();
    setTargeting({
      active: true,
      side: side || null,
      section: section || null,
      keyName: keyName || null,
      min, max, validator,
      selectedIdx: [],
      multi,
      selected: [],
      onComplete,
      suspended: false,
      sessionId,
      origin: origin || null,
      abilityIndex: (typeof abilityIndex === 'number' ? abilityIndex : null),
      type: type || 'ability'
    });
  }, []);

  const suspendTargeting = useCallback(() => {
    setTargeting(prev => {
      if (!prev.active || prev.suspended) return prev;
      return { ...prev, suspended: true };
    });
  }, []);

  const resumeTargeting = useCallback(() => {
    setTargeting(prev => {
      if (!prev.active || !prev.suspended) return prev;
      return { ...prev, suspended: false };
    });
  }, []);

  const cancelTargeting = useCallback(() => {
    // Preserve battle arrow if a battle exists with a target; else clear attack preview arrow
    if (battle && battle.target) {
      const fromKey = `${battle.attacker.side}:${battle.attacker.section}:${battle.attacker.keyName}:${battle.attacker.index}`;
      const toKey = `${battle.target.side}:${battle.target.section}:${battle.target.keyName}:${battle.target.index}`;
      setBattleArrow(prev => ({ fromKey, toKey, label: prev?.label || '' }));
    } else {
      setBattleArrow(null);
      setCurrentAttack(null);
    }
    setTargeting(createInitialTargetingState());
  }, [battle, setBattleArrow, setCurrentAttack]);

  const confirmTargeting = useCallback(() => {
    setTargeting(prev => {
      if (!prev.active) return prev; // ignore if inactive
      const { side, section, keyName, selectedIdx, selected, onComplete, multi } = prev;
      let resolved = [];
      try {
        if (multi) {
          resolved = (selected || []).map(({ side: s, section: sec, keyName: kn, index }) => {
            const isNested = !Array.isArray(areas[s]?.[sec]);
            const cardsArr = isNested ? areas[s][sec][kn] : areas[s][sec];
            return { side: s, section: sec, keyName: kn, index, card: cardsArr[index] };
          }).filter(x => x.card);
        } else {
          const isNested = !Array.isArray(areas[side]?.[section]);
            const cardsArr = isNested ? areas[side][section][keyName] : areas[side][section];
            resolved = selectedIdx.map(i => ({ index: i, card: cardsArr[i] })).filter(x => x.card);
        }
      } catch { /* swallow */ }

      // Cancel before invoking callback
      cancelTargeting();
      if (typeof onComplete === 'function') {
        try { onComplete(resolved); } catch { /* swallow */ }
      }
      return prev; // state already reset
    });
  }, [areas, cancelTargeting]);

  // Auto-confirm logic when selection meets min/max constraints.
  useEffect(() => {
    if (!targeting.active) return;
    const count = targeting.multi ? (targeting.selected?.length || 0) : (targeting.selectedIdx?.length || 0);
    const min = typeof targeting.min === 'number' ? targeting.min : 1;
    const max = typeof targeting.max === 'number' ? targeting.max : 1;

    const shouldAutoConfirm = (
      (min > 0 && count >= min) ||
      (min === 0 && !targeting.multi && count >= 1) ||
      (min === 0 && targeting.multi && count >= max)
    );
    if (!shouldAutoConfirm) return;

    const t = setTimeout(() => { try { confirmTargeting(); } catch { /* swallow */ } }, 0);
    return () => clearTimeout(t);
  }, [targeting.active, targeting.multi, targeting.min, targeting.max, targeting.selected?.length, targeting.selectedIdx?.length, confirmTargeting]);

  return {
    targeting,
    setTargeting,
    startTargeting,
    suspendTargeting,
    resumeTargeting,
    cancelTargeting,
    confirmTargeting
  };
}

export default useTargeting;
