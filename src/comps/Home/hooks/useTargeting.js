import { useState, useCallback, useEffect } from 'react';

const BASE_TARGETING_STATE = {
  active: false,
  side: null,
  section: null,
  keyName: null,
  min: 1,
  max: 1,
  validator: null,
  selectedIdx: [],
  multi: false,
  selected: [],
  onComplete: null,
  suspended: false,
  sessionId: null,
  origin: null,
  abilityIndex: null,
  type: null
};

//. Creates initial targeting state with optional overrides
const createInitialTargetingState = (overrides = {}) => ({
  ...BASE_TARGETING_STATE,
  ...overrides
});

//. Resolves selected targets into { side, section, keyName, index, card }
//. IMPORTANT: Both single-section and multi-section modes now return consistent shape
const resolveTargets = (state, areas) => {
  //* Extract targeting state
  const {
    side,
    section,
    keyName,
    selectedIdx = [],
    selected = [],
    multi
  } = state;

  try {
    if (multi) {
      //* Multi-section targeting mode
      return (selected || [])
        .map(({ side: s, section: sec, keyName: kn, index }) => {
          const isNested = !Array.isArray(areas[s]?.[sec]);
          const cardsArr = isNested ? areas[s]?.[sec]?.[kn] : areas[s]?.[sec];
          return cardsArr
            ? { side: s, section: sec, keyName: kn, index, card: cardsArr[index] }
            : null;
        })
        .filter(x => x && x.card);
    }

    //* Single-section targeting mode - NOW returns full context like multi-section
    const isNested = !Array.isArray(areas[side]?.[section]);
    const cardsArr = isNested ? areas[side]?.[section]?.[keyName] : areas[side]?.[section];
    return (selectedIdx || [])
      .map(i => (cardsArr ? { side, section, keyName, index: i, card: cardsArr[i] } : null))
      .filter(x => x && x.card);
  } catch {
    //* Silently handle resolution errors
    return [];
  }
};

//. Encapsulates targeting lifecycle for abilities and attacks
export function useTargeting({ areas, battle, setBattleArrow, setCurrentAttack }) {
  const [targeting, setTargeting] = useState(BASE_TARGETING_STATE);

  //. Resets targeting state to base configuration
  const resetTargetingState = useCallback(() => {
    setTargeting(BASE_TARGETING_STATE);
  }, []);

  //. Restores or clears battle arrow and attack preview
  const restoreBattleVisuals = useCallback(() => {
    //* Preserve battle arrow if battle exists with target
    if (battle && battle.target) {
      const fromKey = `${battle.attacker.side}:${battle.attacker.section}:${battle.attacker.keyName}:${battle.attacker.index}`;
      const toKey = `${battle.target.side}:${battle.target.section}:${battle.target.keyName}:${battle.target.index}`;
      setBattleArrow(prev => ({ fromKey, toKey, label: prev?.label || '' }));
    } else {
      //* Clear attack preview if no battle target
      setBattleArrow(null);
      setCurrentAttack(null);
    }
  }, [battle, setBattleArrow, setCurrentAttack]);

  //. Initiates new targeting session with specified constraints
  const startTargeting = useCallback((descriptor = {}, onComplete) => {
    //* Generate unique session identifier
    const sessionId = Date.now() + Math.random();

    //* Extract targeting parameters with defaults
    const {
      min = 1,
      max = 1,
      validator = null,
      multi = false,
      type = 'ability',
      abilityIndex
    } = descriptor;

    //* Initialize targeting state
    setTargeting(
      createInitialTargetingState({
        ...descriptor,
        min,
        max,
        validator,
        multi: !!multi,
        type,
        abilityIndex: typeof abilityIndex === 'number' ? abilityIndex : null,
        onComplete,
        sessionId,
        active: true
      })
    );
  }, []);

  //. Temporarily suspends active targeting session
  const suspendTargeting = useCallback(() => {
    setTargeting(prev => {
      //* Ignore if not active or already suspended
      if (!prev.active || prev.suspended) return prev;
      return { ...prev, suspended: true };
    });
  }, []);

  //. Resumes suspended targeting session
  const resumeTargeting = useCallback(() => {
    setTargeting(prev => {
      //* Ignore if not active or not suspended
      if (!prev.active || !prev.suspended) return prev;
      return { ...prev, suspended: false };
    });
  }, []);

  //. Cancels targeting session and restores battle state
  const cancelTargeting = useCallback(() => {
    restoreBattleVisuals();
    resetTargetingState();
  }, [restoreBattleVisuals, resetTargetingState]);

  //. Confirms targeting selection and invokes completion callback
  const confirmTargeting = useCallback(() => {
    //* Ignore if targeting not active
    if (!targeting.active) return;

    //* Resolve selected cards from board areas
    const resolved = resolveTargets(targeting, areas);
    const onComplete = targeting.onComplete;

    //* Reset state and restore visuals
    resetTargetingState();
    restoreBattleVisuals();

    //* Invoke completion callback with resolved cards
    if (typeof onComplete === 'function') {
      try {
        onComplete(resolved);
      } catch {
        //* Silently handle callback errors
      }
    }
  }, [targeting, areas, resetTargetingState, restoreBattleVisuals]);

  //. Auto-confirms targeting when selection meets min/max constraints
  useEffect(() => {
    //* Skip if targeting not active
    if (!targeting.active) return;

    //* Extract targeting constraints
    const {
      multi,
      selected = [],
      selectedIdx = [],
      min: rawMin,
      max: rawMax
    } = targeting;

    //* Calculate current selection count
    const count = multi ? selected.length : selectedIdx.length;
    const min = typeof rawMin === 'number' ? rawMin : 1;
    const max = typeof rawMax === 'number' ? rawMax : 1;

    //* Determine if auto-confirm should trigger
    const shouldAutoConfirm =
      (min > 0 && count >= min) ||
      (min === 0 && !multi && count >= 1) ||
      (min === 0 && multi && count >= max);

    if (!shouldAutoConfirm) return;

    //* Schedule confirmation on next tick
    const t = setTimeout(() => {
      try {
        confirmTargeting();
      } catch {
        //* Silently handle confirmation errors
      }
    }, 0);

    return () => clearTimeout(t);
  }, [targeting, confirmTargeting]);

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