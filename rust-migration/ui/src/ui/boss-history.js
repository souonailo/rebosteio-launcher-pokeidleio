/* Confirmed boss battles, kept by account in the launcher's local profile. */
(function (root) {
  'use strict';

  const KEY = 'pio-boss-history-v1';
  const GUARD_KEY = 'pio-boss-history-guards-v1';
  const guards = new Map();
  const nativeRows = new Map();
  const session = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  let sequence = 0;

  function records() {
    try {
      const parsed = JSON.parse(root.localStorage?.getItem(KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(row => row && typeof row === 'object') : [];
    } catch { return []; }
  }

  function read(index, accountId = '') {
    const key = String(accountId || '');
    const local = records().filter(row => row.index === index && (!key || row.accountId === key));
    const native = nativeRows.get(`${index}:${key}`) || [];
    const used = new Set();
    const legacy = local.filter(row => {
      const matching = native.find(nativeRow => !used.has(nativeRow.id) && nativeRow.bossKey === row.bossKey
        && nativeRow.result === row.result && Math.abs(Number(nativeRow.at) - Number(row.at)) < 5000);
      if (matching) { used.add(matching.id); return false; }
      return true;
    });
    return [...native, ...legacy]
      .sort((a, b) => b.at - a.at);
  }

  async function loadNative(index, accountId = '') {
    const invoke = root.__TAURI__?.core?.invoke || root.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') return false;
    const key = String(accountId || '');
    const rows = await invoke('blaster_boss_history', { index, accountId: key });
    if (!Array.isArray(rows)) throw Error('Histórico nativo inválido');
    nativeRows.set(`${index}:${key}`, rows);
    return true;
  }

  function observe(index, state) {
    if (!Number.isInteger(index) || index < 0 || index > 3 || !state?.bossLive) return false;
    const live = state.bossLive;
    const terminal = live.winner === 'victory' || live.status === 'victory' ? 'victory'
      : live.winner === 'defeat' || live.status === 'defeat' ? 'defeat' : '';
    const accountId = String(state.cid || state.name || '');
    let previous = guards.get(index);
    if (!previous) {
      try { previous = JSON.parse(root.sessionStorage?.getItem(`${GUARD_KEY}-${index}`) || 'null'); } catch {}
    }
    const guard = previous?.accountId === accountId ? previous : { terminal: false, accountId };
    if (!terminal) {
      if (live.inArena) guard.terminal = false;
      guards.set(index, guard);
      try { root.sessionStorage?.setItem(`${GUARD_KEY}-${index}`, JSON.stringify(guard)); } catch {}
      return false;
    }
    if (guard.terminal) return false;
    const bossKey = String(live.bossKey || '').trim();
    const bossName = String(live.bossName || bossKey).trim();
    if (!bossKey && !bossName) return false;
    const rawDrops = live.lastBattleDrops;
    const drops = Array.isArray(rawDrops) ? rawDrops.map(item => ({
      id: String(item?.id || ''), name: String(item?.name || item?.nome || item?.id || 'Item'),
      qty: Math.max(0, Number(item?.qty ?? item?.qtd) || 0)
    })).filter(item => item.qty > 0) : null;
    const record = {
      id: `${session}:${index}:${++sequence}`,
      at: Date.now(), index, accountId: String(state.cid || ''),
      accountName: String(state.name || `Conta ${index + 1}`),
      bossKey, bossName, result: terminal,
      durationMs: live.durationMs ?? null,
      attacks: Number.isSafeInteger(Number(live.turn)) ? Number(live.turn) : null,
      drops
    };
    try {
      root.localStorage.setItem(KEY, JSON.stringify([record, ...records()]));
    } catch { return false; }
    guard.terminal = true;
    guards.set(index, guard);
    try { root.sessionStorage?.setItem(`${GUARD_KEY}-${index}`, JSON.stringify(guard)); } catch {}
    if (typeof CustomEvent === 'function') root.dispatchEvent?.(new CustomEvent('pio:boss-history-updated', { detail: { index } }));
    return true;
  }

  function summarize(entries) {
    const groups = new Map();
    for (const row of entries) {
      const key = row.bossKey || row.bossName;
      const group = groups.get(key) || { key, name: row.bossName || key, battles: 0, victories: 0, defeats: 0, knownVictoryRewards: 0, items: new Map() };
      group.battles++;
      if (row.result === 'victory') group.victories++;
      if (row.result === 'defeat') group.defeats++;
      if (row.result === 'victory' && Array.isArray(row.drops)) group.knownVictoryRewards++;
      for (const item of Array.isArray(row.drops) ? row.drops : []) {
        const itemKey = item.id || item.name;
        const current = group.items.get(itemKey) || { ...item, qty: 0 };
        current.qty += item.qty;
        group.items.set(itemKey, current);
      }
      groups.set(key, group);
    }
    return [...groups.values()].map(group => ({ ...group, items: [...group.items.values()] }));
  }

  const api = { read, observe, summarize, loadNative, key: KEY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PioBossHistory = api;
})(typeof window !== 'undefined' ? window : globalThis);
