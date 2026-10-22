// Observe server state; backend-authorized purchases use the existing game socket.
(() => {
  if (window.top !== window || window.__idleioGameplayBridge) return;
  window.__idleioGameplayBridge = true;
  const NativeWebSocket = window.WebSocket;
  let latestSocket, activeSession, pending = [], pendingBytes = 0, inFlight = false, timer;
  let awaitingSnapshot = false;
  // Invoked only by the native executor. Never changes inventory or gold locally.
  window.__idleioSupplySend = (session, command) => {
    if (session !== activeSession || awaitingSnapshot || latestSocket?.readyState !== NativeWebSocket.OPEN) return;
    const gameId = id => typeof id === 'string' || (Number.isSafeInteger(id) && id > 0);
    const valid = command && (
      (command.t === 'ball.throw' && Number.isSafeInteger(command.ballId) && command.ballId >= 1 && command.ballId <= 4 && Number.isSafeInteger(command.slot) && command.slot >= 0) ||
      command.t === 'centro.ir' || command.t === 'centro.curar' || command.t === 'centro.desistir' || command.t === 'market.meus' ||
      (command.t === 'market.cancelar' && (gameId(command.id) || typeof command.id === 'object')) ||
      (command.t === 'market.especies' && typeof command.tipo === 'string') ||
      (command.t === 'market.listar' && typeof command.tipo === 'string') ||
      command.t === 'market.itens' ||
      (command.t === 'market.item' && gameId(command.itemId)) ||
      (command.t === 'market.comprar' && (gameId(command.id) || typeof command.id === 'object') && Number.isSafeInteger(command.qtd) && command.qtd > 0 && Number.isSafeInteger(command.preco) && command.preco > 0 && ['gold','orb'].includes(command.moeda)) ||
      (command.t === 'outland.tier' && Number.isInteger(command.tier) && command.tier > 0 && command.tier <= 100) ||
      (command.t === 'hunt.select' && typeof command.slug === 'string') ||
      (command.t === 'pokemon.evoluir' && gameId(command.pokemonId) && Number.isSafeInteger(command.alvoId)) ||
      (command.t === 'market.criar' && command.tipo === 'item' && gameId(command.itemId) && Number.isSafeInteger(command.qtd) && command.qtd > 0 && Number.isSafeInteger(command.preco) && command.preco > 0 && ['gold','orb'].includes(command.moeda)) ||
      (command.t === 'auto.set' && command.autoVoltarHunt === false)
    );
    if (!valid) return;
    latestSocket.send(JSON.stringify(command));
  };
  const MAX_EVENTS = 256, MAX_BYTES = 1024 * 1024, BATCH_EVENTS = 64;
  const metrics = { depth: 0, bytes: 0, highWater: 0, batches: 0, events: 0, gaps: 0, failures: 0, lastLatencyMs: 0 };
  // Numeric diagnostics only; no game payloads or credentials are retained here.
  window.__idleioBridgeMetrics = metrics;
  const playerKeys = ['id','cheio','nick','nome','level','trainerLevel','gold','orbs','gemas','gems','diamantes','diamonds','activeId','activePokemonId','pokemons','pkMud','pkFora','balls','items','inventory','huntSlug','outlandTier','noCentro','mapId','zoneId','zoneName'];
  const pokemonKeys = ['id','speciesId','nome','name','level','shiny','slot','quality','potencia','looktype','lookShiny','skin'];
  const pick = (value, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(value ?? {}, k)).map(k => [k, value[k]]));
  function player(value) {
    value = value?.estado ?? value;
    const result = pick(value, playerKeys);
    for (const platform of ['twitch', 'kick']) {
      if (Object.hasOwn(value ?? {}, platform)) {
        result[platform] = value[platform] === null ? null : pick(value[platform], ['login','vinculado','assistindo','pctAtual','emLives','pontos','pontosPorCanal','bonusExp','bonusCatch','bonusLure','bonusTime','bonusQty','bonusExpiresAt','bonus','pct']);
        if (result[platform]) {
          for (const key of ['lives','oficiais','offline']) if (Array.isArray(value[platform]?.[key])) result[platform][key] = value[platform][key].slice(0,40).map(c => typeof c === 'string' ? c : pick(c,['login','slug','aoVivo','ativo','bonus','espectadores']));
          if (Array.isArray(value[platform]?.assistindoEm)) result[platform].assistindoEm = value[platform].assistindoEm.slice(0,20);
        }
      }
    }
    if (value?.automation && typeof value.automation === 'object') result.automation = value.automation;
    for (const key of ['pokemons','pkMud']) if (Array.isArray(result[key])) result[key] = result[key].map(p => pick(p, pokemonKeys));
    return result;
  }
  function updateMetrics() { metrics.depth = pending.length; metrics.bytes = pendingBytes; metrics.highWater = Math.max(metrics.highWater, pending.length); }
  function schedule() {
    if (timer === undefined && !inFlight && pending.length) timer = setTimeout(() => { timer = undefined; void flush(); }, 16);
  }
  function invalidate(session, reason) {
    pending = []; pendingBytes = 0; awaitingSnapshot = true; metrics.gaps++;
    const event = { t: 'telemetry_gap', data: { reason } };
    pending.push({ session, event, bytes: JSON.stringify(event).length * 2 });
    pendingBytes = pending[0].bytes;
    updateMetrics(); schedule();
  }
  async function flush() {
    if (inFlight || !pending.length) return;
    const batch = pending.splice(0, BATCH_EVENTS);
    const session = batch[0].session;
    pendingBytes -= batch.reduce((n, item) => n + item.bytes, 0);
    updateMetrics(); inFlight = true;
    const started = performance.now();
    try {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (!invoke) throw new Error('Bridge unavailable');
      await invoke('report_gameplay_batch', { session, events: batch.map(item => item.event), metrics: { ...metrics } });
      metrics.batches++; metrics.events += batch.length;
    } catch {
      metrics.failures++;
      // Do not retry forever or silently apply a partial stream. A new full
      // welcome/reset can restore the observation; the game socket is untouched.
      if (session === activeSession) {
        pending = []; pendingBytes = 0; awaitingSnapshot = true; metrics.gaps++;
        if (window.__TAURI_INTERNALS__?.invoke) {
          pending.push({ session, event: { t: 'telemetry_gap', data: { reason: 'delivery_failed' } }, bytes: 128 });
          pendingBytes = 128;
        }
      }
      // A failing gap report cannot create an endless retry chain.
      if (session === activeSession && batch.some(item => item.event.t === 'telemetry_gap')) { pending = []; pendingBytes = 0; }
    } finally {
      metrics.lastLatencyMs = Math.round(performance.now() - started);
      inFlight = false; updateMetrics(); schedule();
    }
  }
  function report(session, event) {
    if (event.t === 'reset') {
      activeSession = session; pending = []; pendingBytes = 0; awaitingSnapshot = false;
    }
    if (session !== activeSession) return;
    if (awaitingSnapshot && !['welcome', 'reset', 'disconnected', 'session_token'].includes(event.t)) return;
    if (event.t === 'welcome') awaitingSnapshot = false;
    const bytes = JSON.stringify(event).length * 2;
    if (pending.length >= MAX_EVENTS || pendingBytes + bytes > MAX_BYTES) {
      invalidate(session, 'buffer_limit'); return;
    }
    pending.push({ session, event, bytes }); pendingBytes += bytes;
    updateMetrics(); schedule();
  }
  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(target, args) {
      const socket = Reflect.construct(target, args);
      let url;
      try { url = new URL(args[0], window.location.href); } catch { return socket; }
      if (url.hostname !== 'pokeidle.io') return socket;
      latestSocket = socket;
      const session = crypto.randomUUID();
      const origSend = socket.send;
      socket.send = function(data) {
        try {
          if (typeof data === 'string') {
            const raw = JSON.parse(data);
            if (raw.t === 'hello' && raw.token) {
              report(session, { t: 'session_token', data: { token: raw.token, nick: raw.nick || '' } });
            }
          }
        } catch (_) {}
        return origSend.apply(this, arguments);
      };
      socket.addEventListener('open', () => { if (socket === latestSocket) report(session, { t: 'reset' }); });
      socket.addEventListener('close', () => { if (socket === latestSocket) report(session, { t: 'disconnected' }); });
      socket.addEventListener('message', message => {
        if (socket !== latestSocket || typeof message.data !== 'string') return;
        try {
          const raw = JSON.parse(message.data), t = raw.t ?? raw.type, data = raw.data ?? raw;
          if (t === 'welcome') {
            try {
              const sessToken = localStorage.getItem('sessao');
              const sessNick = localStorage.getItem('nick');
              if (sessToken) {
                report(session, { t: 'session_token', data: { token: sessToken, nick: sessNick || '' } });
              }
            } catch (_) {}
            report(session, { t, data: { outlandTiers: (data.outlandTiers ?? []).map(r => pick(r,["tier","rotulo","nivel","mult"])), pedrasEvolucao: data.pedrasEvolucao, shinyStone: data.shinyStone, mercado: data.mercado, catalogoBolas: (data.catalogoBolas ?? []).map(b => pick(b,["id","nome","name","priceGold","infinite","infinito","catchRate"])), estado: player(data.estado), hunts: (data.hunts ?? []).map(h => ({...pick(h, ['slug','name','nome','regiao','area','nivel']), especies: (h.especies ?? []).map(s => pick(s, ['pokeId','pontos','nome','looktype']))})), shinyLooks: data.shinyLooks, shinyLooksOutland: data.shinyLooksOutland } });
            queueMicrotask(() => window.__idleioBackgroundEconomy?.ready());
          }
          else if (t === 'campo' || t === 'campo.init') report(session, { t, data: { ...pick(data, ['slug','centro','pvp','casa','fora']), mobs: (data.mobs ?? []).map(m => pick(m,['s','x','xr'])) } });
          else if (t === 'batalha') report(session, { t, data: { ev: (data.ev ?? []).filter(e => ['bola','morte','capturado'].includes(e.k ?? e.t)).map(e => ({...pick(e,['k','t','ballId','slot','sucesso','quem','nome','ouro','xp']), ...(Array.isArray(e.drops) ? {drops:e.drops.map(d => pick(d,['nome','qtd']))} : {}), ...(e.pokemon ? {pokemon:{...pick(e.pokemon,[...pokemonKeys,'pokeId','potency','grade','nota','iv_hp','iv_atk','iv_def','iv_spa','iv_spd','iv_spe']),ivs:pick(e.pokemon.ivs,['hp','atk','def','spAtk','spa','spDef','spd','speed','spe'])}} : {})})) } });
          else if (t === 'estado') report(session, { t, data: player(data.estado ?? data) });
          else if (t === 'market') report(session, { t, data: { aba: data.aba, itemId: data.itemId, moeda: data.moeda, total: data.total, pagina: data.pagina, resumo: data.resumo, linhas: data.linhas, anuncio: data.anuncio } });
          else if (t === 'erro') report(session, { t, data: pick(data, ['chave','msg']) });
          else if (t === 'capturado') {
            const p = data.pokemon ?? data;
            const name = p.nome ?? p.name;
            if (typeof name === 'string') report(session, { t: 'activity', data: { kind: 'capture', name, qty: 1, shiny: typeof p.shiny === 'boolean' ? p.shiny : null, pokemon: {...pick(p,['speciesId','pokeId','level','quality','potencia','potency','grade','nota','skin','iv_hp','iv_atk','iv_def','iv_spa','iv_spd','iv_spe']), ivs: pick(p.ivs,['hp','atk','def','spAtk','spa','spDef','spd','speed','spe'])} } });
          } else if (t === 'morte' && data.quem === 'selvagem') {
            report(session, { t: 'activity', data: { kind: 'battle', name: data.nome ?? 'Selvagem derrotado', qty: 1, gold: data.ouro, xp: data.xp } });
            for (const item of data.drops ?? []) if (typeof item.nome === 'string' && item.qtd > 0) report(session, { t: 'activity', data: { kind: 'drop', name: item.nome, qty: item.qtd } });
          } else if (t === 'loot.received') {
            for (const item of data.items ?? []) if (typeof item.item_id === 'string' && item.qty > 0) report(session, { t: 'activity', data: { kind: 'drop', name: item.item_id, qty: item.qty } });
          }
        } catch { /* Non-game messages do not enter the bridge. */ }
      });
      return socket;
    }
  });
})();
