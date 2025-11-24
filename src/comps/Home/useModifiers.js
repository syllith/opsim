import { useState, useCallback } from 'react';

// Hook to manage modifiers & temporary effect bookkeeping.
// Exposes read/apply helpers and a cleanup routine for Refresh Phase.
export function useModifiers({ modKey, appendLog }) {
  const [powerMods, setPowerMods] = useState({}); // { key: [{ delta, expireOnSide }] }
  const [costMods, setCostMods] = useState({});  // { key: [{ delta, expireOnSide }] }
  const [tempKeywords, setTempKeywords] = useState({}); // { key: [{ keyword, expireOnSide }] }
  const [disabledKeywords, setDisabledKeywords] = useState({}); // { key: [{ keyword, expireOnSide }] }
  const [untilNextTurnEffects, setUntilNextTurnEffects] = useState({ player: [], opponent: [] });

  // Generic accumulator reducer for arrays of modifier objects.
  const reduceList = (list, field = 'delta') => Array.isArray(list) ? list.reduce((s, m) => s + (m?.[field] || 0), 0) : 0;

  const getPowerMod = useCallback((side, section, keyName, index) => {
    const arr = powerMods[modKey(side, section, keyName, index)] || [];
    return reduceList(arr, 'delta');
  }, [powerMods, modKey]);

  const applyPowerMod = useCallback((side, section, keyName, index, delta, expireOnSide = null) => {
    setPowerMods(prev => {
      const k = modKey(side, section, keyName, index);
      const list = Array.isArray(prev[k]) ? [...prev[k]] : [];
      list.push({ delta, expireOnSide: expireOnSide || null });
      return { ...prev, [k]: list };
    });
  }, [modKey]);

  const getCostMod = useCallback((side, section, keyName, index) => {
    const arr = costMods[modKey(side, section, keyName, index)] || [];
    return reduceList(arr, 'delta');
  }, [costMods, modKey]);

  const applyCostMod = useCallback((side, section, keyName, index, delta, expireOnSide = null) => {
    setCostMods(prev => {
      const k = modKey(side, section, keyName, index);
      const list = Array.isArray(prev[k]) ? [...prev[k]] : [];
      list.push({ delta, expireOnSide: expireOnSide || null });
      return { ...prev, [k]: list };
    });
  }, [modKey]);

  const registerUntilNextTurnEffect = useCallback((side, description) => {
    setUntilNextTurnEffects(prev => ({
      ...prev,
      [side]: [...(prev[side] || []), { description, timestamp: Date.now() }]
    }));
  }, []);

  const addTempKeyword = useCallback((side, section, keyName, index, keyword, expireOnSide = null) => {
    setTempKeywords(prev => {
      const k = modKey(side, section, keyName, index);
      const list = Array.isArray(prev[k]) ? [...prev[k]] : [];
      list.push({ keyword, expireOnSide: expireOnSide || null });
      return { ...prev, [k]: list };
    });
  }, [modKey]);

  const hasTempKeyword = useCallback((side, section, keyName, index, keyword) => {
    const k = modKey(side, section, keyName, index);
    const arr = tempKeywords[k] || [];
    const target = String(keyword || '').toLowerCase();
    return Array.isArray(arr) && arr.some(e => String(e?.keyword || '').toLowerCase() === target);
  }, [tempKeywords, modKey]);

  const addDisabledKeyword = useCallback((side, section, keyName, index, keyword, expireOnSide = null) => {
    setDisabledKeywords(prev => {
      const k = modKey(side, section, keyName, index);
      const list = Array.isArray(prev[k]) ? [...prev[k]] : [];
      list.push({ keyword, expireOnSide: expireOnSide || null });
      return { ...prev, [k]: list };
    });
  }, [modKey]);

  const hasDisabledKeyword = useCallback((side, section, keyName, index, keyword) => {
    const k = modKey(side, section, keyName, index);
    const arr = disabledKeywords[k] || [];
    const target = String(keyword || '').toLowerCase();
    return Array.isArray(arr) && arr.some(e => String(e?.keyword || '').toLowerCase() === target);
  }, [disabledKeywords, modKey]);

  // Cleanup at Refresh Phase for the given side.
  const cleanupOnRefreshPhase = useCallback((side) => {
    // Expire until-next-turn effects
    setUntilNextTurnEffects(prev => {
      const effects = prev[side] || [];
      if (effects.length && appendLog) appendLog(`[Refresh] ${effects.length} \"until next turn\" effect(s) expired.`);
      return { ...prev, [side]: [] };
    });

    const filterMap = (prev) => {
      const next = {};
      for (const [k, v] of Object.entries(prev || {})) {
        const kept = Array.isArray(v) ? v.filter(m => m && m.expireOnSide !== side) : [];
        if (kept.length) next[k] = kept;
      }
      return next;
    };

    setPowerMods(filterMap);
    setCostMods(filterMap);
    setTempKeywords(filterMap);
    setDisabledKeywords(filterMap);
  }, [appendLog]);

  return {
    // State (exposed if needed by consumers)
    powerMods,
    costMods,
    tempKeywords,
    disabledKeywords,
    untilNextTurnEffects,
    // Read helpers
    getPowerMod,
    getCostMod,
    hasTempKeyword,
    hasDisabledKeyword,
    // Apply helpers
    applyPowerMod,
    applyCostMod,
    addTempKeyword,
    addDisabledKeyword,
    registerUntilNextTurnEffect,
    cleanupOnRefreshPhase
  };
}

export default useModifiers;
