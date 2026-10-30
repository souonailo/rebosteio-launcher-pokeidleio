(function(root) {
  'use strict';
  function mergeSnapshots(previous, incoming) {
    const result = { ...previous, items: { ...previous?.items } };
    for (const [key, item] of Object.entries(incoming?.items || {})) {
      if (!item || typeof item !== 'object') continue;
      const old = result.items[key] || {};
      const next = { ...old };
      for (const currency of ['gold', 'orb']) if (old[currency] > 0) next[currency + 'At'] = Number(old[currency + 'At'] ?? old.at) || 0;
      for (const currency of ['gold', 'orb']) {
        const at = Number(item[currency + 'At'] ?? item.at ?? incoming.at) || 0;
        const oldAt = Number(old[currency + 'At'] ?? old.at) || 0;
        if (Number.isFinite(item[currency]) && item[currency] > 0 && at >= oldAt) {
          Object.assign(next, { name:item.name, icon:item.icon, [currency]:item[currency], [currency + 'At']:at });
          next.at = Math.max(next.at || 0, at);
        }
      }
      if (next.gold > 0 || next.orb > 0) result.items[key] = next;
    }
    result.at = Math.max(Number(previous?.at) || 0, ...Object.values(result.items).map(i => Number(i.at) || 0));
    if (Number.isFinite(incoming?.taxGold) && incoming.taxGold >= 0 && incoming.taxGold <= 1 && incoming.at >= (previous?.at || 0)) result.taxGold = incoming.taxGold;
    return result;
  }
  // Injected into the game origin; use the same read-only endpoint as its bag.
  function install() {
    if (window.__pioMarketPrices) { window.__pioMarketPrices.refresh?.(); return; }
    const key = 'pio-rmt-means-v1';
    const state = window.__pioMarketPrices = { at: 0, items: {}, taxGold: null };
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved && saved.items && typeof saved.items === 'object') {
        state.items = saved.items; state.at = Number(saved.at) || 0;
        if (Number.isFinite(saved.taxGold)) state.taxGold = saved.taxGold;
      }
    } catch {}
    let socket = null, catalog = null, requested = 0, pending = null;
    async function save(packet) {
      if (!packet.medias || typeof packet.medias !== 'object') return;
      const at = Date.now();
      if (!catalog) {
        try {
          const r = await fetch('/assets/items.json');
          if (!r.ok) return;
          catalog = new Map((await r.json()).items.map(i => [String(i.id),i]));
        } catch { return; }
      }
      if (at < state.at) return;
      const items = { ...state.items };
      let updated = false;
      for (const [id, m] of Object.entries(packet.medias)) {
        const item = catalog.get(id); if (!item || !m) continue;
        const mean = currency => Number.isFinite(+m[currency]?.media) && +m[currency].media > 0 ? +m[currency].media : null;
        const name = item.name.toLowerCase(), previous = items[name] || {};
        const entry = { ...previous, name:item.name, icon:item.icon };
        for (const currency of ['gold', 'orb']) if (previous[currency] > 0) entry[currency + 'At'] = previous[currency + 'At'] ?? previous.at ?? state.at;
        for (const currency of ['gold', 'orb']) {
          const value = mean(currency);
          if (value != null) { entry[currency] = value; entry[currency + 'At'] = at; entry.at = at; updated = true; }
        }
        if (entry.gold > 0 || entry.orb > 0) items[name] = entry;
      }
      if (!updated) return; // Empty/failed readings never erase the last valid price or its date.
      state.items = items; state.at = at; state.days = packet.dias ?? 7;
      const P = window.__poke || {};
      const welcome = P.ws?.welcome || {};
      const pct = welcome.economia?.taxaMercadoGoldPct ?? P.estado?.economia?.taxaMercadoGoldPct ?? welcome.mercado?.taxaGoldPct;
      if (Number.isFinite(pct) && pct >= 0 && pct <= 100) state.taxGold = pct / 100;
      try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
    }
    function request() {
      if (!socket || socket.readyState !== 1 || Date.now() - requested < 15000) return;
      requested = Date.now();
      socket.send(JSON.stringify({t:'market.medias'}));
    }
    function onMessage(event) {
      try {
        const raw = JSON.parse(event.data);
        const p = raw.data && typeof raw.data === 'object' ? {...raw,...raw.data} : raw;
        if (p.t === 'welcome') { clearTimeout(pending); pending = setTimeout(request, Math.max(0,15000-(Date.now()-requested))); }
        if (p.t === 'market' && (p.aba === 'medias' || p.aba === 'itens')) save(p);
      } catch {}
    }
    function attach() {
      const next = window.__poke?.sock;
      if (!next || next.readyState !== 1 || next === socket) return;
      if (socket) socket.removeEventListener('message', onMessage);
      socket = next; requested = 0;
      socket.addEventListener('message', onMessage);
      const send = socket.send;
      socket.send = function(data) {
        const result = send.apply(this, arguments);
        try {
          const p = JSON.parse(data);
          if (['market.itens','market.listar','market.meus','market.historico','market.especies','market.favoritos','market.atualizar'].includes(p.t)) {
            clearTimeout(pending); pending = setTimeout(request, Math.max(0,15000-(Date.now()-requested)));
          }
        } catch {}
        return result;
      };
      request();
    }
    state.refresh = request;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) request(); });
    window.addEventListener('focus', request);
    attach(); setInterval(attach, 2000);
  }
  if (typeof module === 'object' && module.exports) module.exports = { install, mergeSnapshots };
  else root.PioMarketPrices = { install, mergeSnapshots };
})(typeof window === 'object' ? window : globalThis);
