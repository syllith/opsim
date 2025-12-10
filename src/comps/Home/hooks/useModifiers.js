import { useState, useCallback, useEffect } from 'react';
import _ from 'lodash';

//. Sums numeric field over an array of modifier objects
const sumField = (list, field = 'delta') =>
  _.sumBy(list || [], entry => entry?.[field] || 0);

//. Appends entry to keyed array map immutably
const appendToMap = (prev, key, entry) => {
  const list = _.get(prev, key, []);
  return { ...prev, [key]: [...list, entry] };
};

//. Removes entries whose expireOnSide matches the given side
const filterExpiredBySide = (prev, side) =>
  _.transform(
    prev || {},
    (result, list, key) => {
      const kept = _.filter(list, entry => entry && entry.expireOnSide !== side);
      if (kept.length) {
        result[key] = kept;
      }
    },
    {}
  );

//. Checks if a keyword exists on a given key within a keyword map
const hasKeywordEntry = (map, key, keyword) => {
  const arr = _.get(map, key, []);
  const target = _.toLower(String(keyword || ''));
  return _.some(
    arr,
    entry => _.toLower(String(entry?.keyword || '')) === target
  );
};

//. Adds a keyword entry to the appropriate keyword map
const addKeywordEntry = (
  setMap,
  modKeyFn,
  side,
  section,
  keyName,
  index,
  keyword,
  expireOnSide
) => {
  const k = modKeyFn(side, section, keyName, index);
  setMap(prev =>
    appendToMap(prev, k, {
      keyword,
      expireOnSide: expireOnSide || null
    })
  );
};

//. Hook to manage modifiers & temporary effect bookkeeping.
//. Exposes read/apply helpers and a cleanup routine for Refresh Phase.
//. 
//. For multiplayer: The host manages modifier state and syncs it via gameState.
//. Pass externalState to override internal state with synced values from host.
export function useModifiers({ modKey, appendLog, externalState = null, onStateChange = null }) {
  const [powerMods, setPowerMods] = useState({});               //. { key: [{ delta, expireOnSide }] }
  const [costMods, setCostMods] = useState({});                 //. { key: [{ delta, expireOnSide }] }
  const [tempKeywords, setTempKeywords] = useState({});         //. { key: [{ keyword, expireOnSide }] }
  const [disabledKeywords, setDisabledKeywords] = useState({}); //. { key: [{ keyword, expireOnSide }] }
  const [untilNextTurnEffects, setUntilNextTurnEffects] = useState({
    player: [],
    opponent: []
  });

  //. For multiplayer: sync external state when it changes
  useEffect(() => {
    if (externalState) {
      if (externalState.powerMods) setPowerMods(externalState.powerMods);
      if (externalState.costMods) setCostMods(externalState.costMods);
      if (externalState.tempKeywords) setTempKeywords(externalState.tempKeywords);
      if (externalState.disabledKeywords) setDisabledKeywords(externalState.disabledKeywords);
      if (externalState.untilNextTurnEffects) setUntilNextTurnEffects(externalState.untilNextTurnEffects);
    }
  }, [externalState]);

  //. Notify parent when state changes (for broadcasting in multiplayer)
  const notifyStateChange = useCallback(() => {
    if (onStateChange) {
      onStateChange({
        powerMods,
        costMods,
        tempKeywords,
        disabledKeywords,
        untilNextTurnEffects
      });
    }
  }, [onStateChange, powerMods, costMods, tempKeywords, disabledKeywords, untilNextTurnEffects]);

  //. Get the full modifier state for syncing
  const getModifierState = useCallback(() => ({
    powerMods,
    costMods,
    tempKeywords,
    disabledKeywords,
    untilNextTurnEffects
  }), [powerMods, costMods, tempKeywords, disabledKeywords, untilNextTurnEffects]);

  //. Set the full modifier state (used when receiving sync from host)
  const setModifierState = useCallback((state) => {
    if (state.powerMods !== undefined) setPowerMods(state.powerMods);
    if (state.costMods !== undefined) setCostMods(state.costMods);
    if (state.tempKeywords !== undefined) setTempKeywords(state.tempKeywords);
    if (state.disabledKeywords !== undefined) setDisabledKeywords(state.disabledKeywords);
    if (state.untilNextTurnEffects !== undefined) setUntilNextTurnEffects(state.untilNextTurnEffects);
  }, []);

  //. Returns total power modifier for the given card
  const getPowerMod = useCallback(
    (side, section, keyName, index) => {
      const k = modKey(side, section, keyName, index);
      const arr = powerMods[k] || [];
      return sumField(arr, 'delta');
    },
    [powerMods, modKey]
  );

  //. Applies a new power modifier entry
  const applyPowerMod = useCallback(
    (side, section, keyName, index, delta, expireOnSide = null) => {
      const k = modKey(side, section, keyName, index);
      setPowerMods(prev =>
        appendToMap(prev, k, {
          delta,
          expireOnSide: expireOnSide || null
        })
      );
    },
    [modKey]
  );

  //. Returns total cost modifier for the given card
  const getCostMod = useCallback(
    (side, section, keyName, index) => {
      const k = modKey(side, section, keyName, index);
      const arr = costMods[k] || [];
      return sumField(arr, 'delta');
    },
    [costMods, modKey]
  );

  //. Applies a new cost modifier entry
  const applyCostMod = useCallback(
    (side, section, keyName, index, delta, expireOnSide = null) => {
      const k = modKey(side, section, keyName, index);
      setCostMods(prev =>
        appendToMap(prev, k, {
          delta,
          expireOnSide: expireOnSide || null
        })
      );
    },
    [modKey]
  );

  //. Registers an "until next turn" effect for the given side
  const registerUntilNextTurnEffect = useCallback((side, description) => {
    setUntilNextTurnEffects(prev => ({
      ...prev,
      [side]: [
        ...(_.get(prev, side, [])),
        { description, timestamp: _.now() }
      ]
    }));
  }, []);

  //. Adds a temporary keyword to the given card
  const addTempKeyword = useCallback(
    (side, section, keyName, index, keyword, expireOnSide = null) => {
      addKeywordEntry(
        setTempKeywords,
        modKey,
        side,
        section,
        keyName,
        index,
        keyword,
        expireOnSide
      );
    },
    [modKey]
  );

  //. Checks if a temporary keyword is present on the given card
  const hasTempKeyword = useCallback(
    (side, section, keyName, index, keyword) => {
      const k = modKey(side, section, keyName, index);
      return hasKeywordEntry(tempKeywords, k, keyword);
    },
    [tempKeywords, modKey]
  );

  //. Adds a disabled keyword entry to the given card
  const addDisabledKeyword = useCallback(
    (side, section, keyName, index, keyword, expireOnSide = null) => {
      addKeywordEntry(
        setDisabledKeywords,
        modKey,
        side,
        section,
        keyName,
        index,
        keyword,
        expireOnSide
      );
    },
    [modKey]
  );

  //. Checks if a keyword is disabled on the given card
  const hasDisabledKeyword = useCallback(
    (side, section, keyName, index, keyword) => {
      const k = modKey(side, section, keyName, index);
      return hasKeywordEntry(disabledKeywords, k, keyword);
    },
    [disabledKeywords, modKey]
  );

  //. Cleanup at Refresh Phase for the given side.
  const cleanupOnRefreshPhase = useCallback(
    (side) => {
      //. Expire until-next-turn effects
      setUntilNextTurnEffects(prev => {
        const effects = _.get(prev, side, []);
        if (effects.length && appendLog) {
          appendLog(
            `[Refresh] ${effects.length} "until next turn" effect(s) expired.`
          );
        }
        return { ...prev, [side]: [] };
      });

      //. Remove expired modifier / keyword entries
      setPowerMods(prev => filterExpiredBySide(prev, side));
      setCostMods(prev => filterExpiredBySide(prev, side));
      setTempKeywords(prev => filterExpiredBySide(prev, side));
      setDisabledKeywords(prev => filterExpiredBySide(prev, side));
    },
    [appendLog]
  );

  return {
    //. State (exposed if needed)
    powerMods,
    costMods,
    tempKeywords,
    disabledKeywords,
    untilNextTurnEffects,

    //. State management for multiplayer sync
    getModifierState,
    setModifierState,

    //. Read helpers
    getPowerMod,
    getCostMod,
    hasTempKeyword,
    hasDisabledKeyword,

    //. Apply helpers
    applyPowerMod,
    applyCostMod,
    addTempKeyword,
    addDisabledKeyword,
    registerUntilNextTurnEffect,

    //. Cleanup
    cleanupOnRefreshPhase
  };
}

export default useModifiers;
