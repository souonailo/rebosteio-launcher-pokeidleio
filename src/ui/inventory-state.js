// One stock projection for gameplay reads, native telemetry and Blaster.
(() => {
  'use strict';
  const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
  const quantity = value => value === '∞' ? '∞' : (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);
  const cleanMap = input => Object.fromEntries(Object.entries(input || {}).filter(([id]) => /^\d+$/.test(id)).map(([id, value]) => [id, quantity(value)]));
  const names = {1:'Poké Ball',2:'Great Ball',3:'Super Ball',4:'Ultra Ball',5:'Beast Ball'};
  function project(state) {
    if (!state) return state;
    // Legacy fixture/readers may have only precomputed KPIs; native snapshots always declare known flags.
    if (!own(state, 'ballsKnown') && !own(state, 'inventoryKnown') && !own(state, 'ballMap') && !own(state, 'invMap')) return state;
    const ballsKnown = state.ballsKnown ?? (state.ballMap != null);
    const inventoryKnown = state.inventoryKnown ?? (state.invMap != null);
    const ballMap = ballsKnown ? cleanMap(state.ballMap) : {};
    const invMap = inventoryKnown ? cleanMap(state.invMap) : {};
    const catalog = Object.fromEntries((state.ballCatalog || []).filter(b => b && b.id != null).map(b => [String(b.id), b]));
    const infinite = id => ballMap[id] === '∞' || !!(catalog[id]?.infinite || catalog[id]?.infinito) || (Number(ballMap[id]) >= 999999 && !catalog[id]?.priceGold);
    for (const id of Object.keys(ballMap)) if (infinite(id)) ballMap[id] = '∞';
    const available = id => ballMap[id] === '∞' || Number(ballMap[id]) > 0;
    const selected = Array.isArray(state.automation?.ballIds) ? state.automation.ballIds.map(String) : [];
    let id = selected.find(available) ?? selected[0];
    if (id == null && state.lastBallId != null && own(ballMap, String(state.lastBallId))) id = String(state.lastBallId);
    if (id == null) id = Object.keys(ballMap).filter(available).sort((a,b) => Number(catalog[b]?.catchRate ?? b) - Number(catalog[a]?.catchRate ?? a))[0] ?? Object.keys(ballMap)[0];
    const equippedBall = ballsKnown && id != null ? {id, name:catalog[id]?.nome || catalog[id]?.name || names[id] || `Bola ${id}`, infinite:infinite(id), qty:infinite(id) ? 999999 : (ballMap[id] ?? 0)} : null;
    const total = ids => ids.reduce((sum, key) => sum + (Number(invMap[key]) || 0), 0);

    let bag = Array.isArray(state.bag) && state.bag.length ? state.bag : null;
    if (!bag) {
      bag = [];
      if (ballsKnown) {
        const ballItems = Object.keys(ballMap).map(bid => {
          const b = catalog[bid] || {};
          const isInf = infinite(bid);
          const q = isInf ? 999999 : (Number(ballMap[bid]) || 0);
          return {
            id: 'b' + bid,
            name: (b.nome || b.name || names[bid] || ('#' + bid)) + (isInf ? ' ∞' : ''),
            qty: q,
            inf: isInf
          };
        }).filter(x => x.qty > 0).sort((a, b) => b.qty - a.qty);
        if (ballItems.length) {
          bag.push({
            label: 'Pokébolas',
            total: ballItems.reduce((s, x) => s + x.qty, 0),
            items: ballItems
          });
        }
      }
      if (inventoryKnown) {
        const revTotal = total(['205', '206']);
        const revItems = [
          { id: 'i205', name: 'Revive', qty: Number(invMap['205']) || 0 },
          { id: 'i206', name: 'Max Revive', qty: Number(invMap['206']) || 0 }
        ].filter(x => x.qty > 0);
        if (revTotal > 0 || revItems.length) {
          bag.push({ label: 'Revive', total: revTotal, items: revItems });
        }
        const healTotal = total(['200', '201', '202', '203', '204']);
        if (healTotal > 0) {
          bag.push({ label: 'Heal', total: healTotal, items: [] });
        }
      }
    }

    const rawDrops = state.rawDrops || state.drops || {};
    const drops = state.drops || rawDrops;
    const a = state.a || {};
    const sess = state.sess || {
      st: state.sessStart || (state._sessStart || (state._sessStart = Date.now())),
      k: a.kills || 0,
      g: state.sessionGold != null ? state.sessionGold : (state.gold || 0),
      v: 0,
      s: a.supplyGold || 0,
      c: a.captures || 0,
      sf: a.shinyFound || 0,
      sc: a.shinyCap || 0
    };

    return {...state, ballsKnown, inventoryKnown, ballMap, invMap, equippedBall, bag, drops, rawDrops, sess,
      catchLog: Array.isArray(state.catchLog) ? state.catchLog : [],
      shinyLog: Array.isArray(state.shinyLog) ? state.shinyLog : [],
      balls: ballsKnown ? (equippedBall?.qty ?? 0) : null,
      potions: inventoryKnown ? total(['200','201','202','203','204']) : null,
      revives: inventoryKnown ? total(['205','206']) : null};
  }
  window.PioInventory = {project};
})();
