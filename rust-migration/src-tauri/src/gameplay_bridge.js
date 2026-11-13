// Observe server state; backend-authorized purchases use the existing game socket.
(() => {
  if (window.top !== window || window.__idleioGameplayBridge) return;
  window.__idleioGameplayBridge = true;
  const NativeWebSocket = window.WebSocket;
  let latestSocket, latestOrigSend, activeSession, pending = [], pendingBytes = 0, inFlight = false, timer;
  let awaitingSnapshot = false, handedOff = false;
  let raidTokensKnown = false, raidTokens = 0, raidRequestAt = 0;
  let raidCharacter = null, raidAttemptEdition = null, raidConfirmedEdition = null, raidConfirmedUntil = 0;
  function observeRaidTokens(value) {
    if (!value) return;
    const identity = value.id ?? value.eu?.id ?? value.nick ?? value.eu?.nick;
    if (typeof identity === 'string' || Number.isSafeInteger(identity)) {
      const next = String(identity);
      if (raidCharacter !== next) {
        raidCharacter = next;
        raidAttemptEdition = null;
        raidConfirmedEdition = null;
        raidConfirmedUntil = 0;
      }
    }
    const owner = value.eu && Object.hasOwn(value.eu, 'items') ? value.eu : value;
    if (!Object.hasOwn(owner, 'items')) return;
    const items = owner.items;
    raidTokensKnown = !!items && typeof items === 'object';
    raidTokens = raidTokensKnown ? Number(items['70000'] ?? 0) : 0;
  }
  function requestWeeklyRaid() {
    if (handedOff || window.__idleioAutoRaidEnabled !== true || latestSocket?.readyState !== NativeWebSocket.OPEN) return;
    if (!raidTokensKnown || raidTokens < 1 || (raidConfirmedEdition && Date.now() < raidConfirmedUntil)) return;
    if (Date.now() - raidRequestAt < 60_000) return;
    raidRequestAt = Date.now();
    latestSocket.send(JSON.stringify({ t: 'raid.info' }));
  }
  function onWeeklyRaid(data) {
    if (handedOff || window.__idleioAutoRaidEnabled !== true || !data || data.recusa) return;
    const edition = data.edicao;
    const id = edition?.id;
    if (typeof id !== 'string' && !Number.isSafeInteger(id)) return;
    const key = String(id);
    if (data.eu?.inscrito === true) {
      raidConfirmedEdition = key;
      raidConfirmedUntil = Number(edition.fimEm) || 0;
      return;
    }
    if (data.acao === 'inscreveu') return;
    if (data.eu?.inscrito !== false || raidConfirmedEdition === key || !raidTokensKnown || raidTokens < 1) return;
    const now = Number(data.agora);
    if (!Number.isSafeInteger(now) || now <= 0) return;
    const opens = Number(edition.inscricoesDe), closes = Number(edition.inscricoesAte);
    if (!Number.isSafeInteger(opens) || !Number.isSafeInteger(closes)
      || closes <= opens || now < opens || now >= closes) return;
    if (!raidCharacter || raidAttemptEdition === key) return;
    if (latestSocket?.readyState !== NativeWebSocket.OPEN) return;
    // Keep the intent across a page reload before sending a token-spending command.
    const attemptKey = `pio:auto-raid:attempt:${raidCharacter}:${key}`;
    try {
      if (localStorage.getItem(attemptKey) === '1') return;
      localStorage.setItem(attemptKey, '1');
    } catch (_) { return; }
    raidAttemptEdition = key;
    latestSocket.send(JSON.stringify({ t: 'raid.inscrever' }));
  }
  if (typeof setInterval === 'function') setInterval(requestWeeklyRaid, 30_000);
  window.__idleioFreezeGameplay = () => {
    handedOff = true;
    pending = []; pendingBytes = 0;
    latestSocket?.close();
  };
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
      (command.t === 'market.anuncio' && (gameId(command.id) || Number.isSafeInteger(command.id))) ||
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
  const usedRmtNonces = new Map(); // nonce -> timestamp
  // Evaluated RMT manual purchase fence immediately before socket.send.
  // Performs synchronous verification of session, CID, nonce single-use, deadline, and socket state.
  // Returns faithful { ok: true, sent: true } or { ok: false, sent: false, status: 'not_sent'|'unknown', reason: string }.
  window.__idleioRmtBuy = (envelope) => {
    try {
      if (!envelope || envelope.t !== '__pio_rmt_buy') {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Envelope inválido' };
      }
      if (!envelope.expected_session || typeof envelope.expected_session !== 'string') {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Sessão esperada ausente no envelope' };
      }
      if (!envelope.expected_cid || typeof envelope.expected_cid !== 'string') {
        return { ok: false, sent: false, status: 'not_sent', reason: 'CID esperado ausente no envelope' };
      }
      if (!envelope.deadline_ms || typeof envelope.deadline_ms !== 'number') {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Prazo limite ausente no envelope' };
      }
      const now = Date.now();
      if (now > envelope.deadline_ms) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Prazo do envelope expirado antes do envio' };
      }
      if (handedOff || awaitingSnapshot) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Cliente em transição (handedOff ou aguardando snapshot)' };
      }
      // Prune expired nonces (> 60s)
      const cutoff = now - 60_000;
      for (const [n, ts] of usedRmtNonces) {
        if (ts < cutoff) usedRmtNonces.delete(n);
      }
      if (!envelope.nonce || usedRmtNonces.has(envelope.nonce)) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Nonce já utilizado ou ausente' };
      }
      if (usedRmtNonces.size >= 5000) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Capacidade máxima de nonces excedida' };
      }
      if (envelope.expected_session !== activeSession) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Sessão do WebSocket divergente (houve reconexão)' };
      }
      const curCid = raidCharacter || (window.__poke && window.__poke.cid) || (window.estado && (window.estado.id || (window.estado.eu && window.estado.eu.id)));
      if (!curCid) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'CID do personagem atual desconhecido' };
      }
      if (String(curCid).trim() !== String(envelope.expected_cid).trim()) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'CID da conta divergente' };
      }
      if (!latestSocket || latestSocket.readyState !== (NativeWebSocket?.OPEN ?? 1)) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Socket do jogo não está aberto' };
      }
      const cmd = envelope.command;
      if (!cmd || cmd.t !== 'market.comprar') {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Comando de compra inválido' };
      }
      const cmdId = Number(cmd.id);
      if (!Number.isSafeInteger(cmdId) || cmdId <= 0) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'ID do anúncio inválido no comando' };
      }
      const cmdQtd = Number(cmd.qtd);
      if (!Number.isSafeInteger(cmdQtd) || cmdQtd <= 0) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Quantidade inválida no comando' };
      }
      if (typeof cmd.preco !== 'number' || cmd.preco < 0) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Preço inválido no comando' };
      }
      if (cmd.moeda !== 'gold' && cmd.moeda !== 'orb') {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Moeda inválida no comando' };
      }
      if (typeof window.__rotomSniperHasInFlight === 'function' && window.__rotomSniperHasInFlight(cmdId)) {
        return { ok: false, sent: false, status: 'not_sent', reason: 'Sniper visual possui compra automática em andamento' };
      }

      window.__idleioRmtManualBusy = Infinity;
      window.__idleioRmtManualOffer = cmdId;
      window.__idleioRmtManualSession = activeSession;
      window.__idleioRmtManualNonce = envelope.nonce;
      usedRmtNonces.set(envelope.nonce, now);
      let sentAttempted = false;
      try {
        const sendFn = latestOrigSend || latestSocket.send;
        sentAttempted = true;
        sendFn.call(latestSocket, JSON.stringify(cmd));
        return { ok: true, sent: true };
      } catch (err) {
        if (!sentAttempted) {
          window.__idleioRmtManualBusy = 0;
          window.__idleioRmtManualOffer = null;
          window.__idleioRmtManualSession = null;
          window.__idleioRmtManualNonce = null;
        }
        return {
          ok: false,
          sent: false,
          status: sentAttempted ? 'unknown' : 'not_sent',
          reason: String(err && err.message ? err.message : err)
        };
      }
    } catch (err) {
      window.__idleioRmtManualBusy = 0;
      window.__idleioRmtManualOffer = null;
      window.__idleioRmtManualSession = null;
      window.__idleioRmtManualNonce = null;
      return { ok: false, sent: false, status: 'not_sent', reason: String(err && err.message ? err.message : err) };
    }
  };
  window.__idleioRmtQuote = (offerId) => {
    try {
      if (!latestSocket || latestSocket.readyState !== (NativeWebSocket?.OPEN ?? 1)) {
        return { ok: false, sent: false, reason: 'socket_not_open' };
      }
      const numId = Number(offerId);
      if (!Number.isSafeInteger(numId) || numId <= 0) {
        return { ok: false, sent: false, reason: 'invalid_offer_id' };
      }
      const sendFn = latestOrigSend || latestSocket.send;
      sendFn.call(latestSocket, JSON.stringify({ t: 'market.anuncio', id: numId }));
      return { ok: true, sent: true };
    } catch (err) {
      return { ok: false, sent: false, reason: String(err && err.message ? err.message : err) };
    }
  };
  window.__idleioRmtRelease = (offerId, session, nonce) => {
    if (offerId == null || session == null || nonce == null) return false;
    if (Number(offerId) !== window.__idleioRmtManualOffer) return false;
    if (session !== window.__idleioRmtManualSession) return false;
    if (nonce !== window.__idleioRmtManualNonce) return false;
    window.__idleioRmtManualBusy = 0;
    window.__idleioRmtManualOffer = null;
    window.__idleioRmtManualSession = null;
    window.__idleioRmtManualNonce = null;
    return true;
  };
  function isTerminalMarketAck(ev, expectedId) {
    if (!ev || !expectedId) return false;
    const k = ev.k ?? ev.t ?? '';
    const id = Number(ev.id ?? (ev.data && ev.data.id) ?? 0);
    if (id !== expectedId) return false;

    if (k === 'marketComprado' || k === 'marketCompradoLote') {
      return true;
    }
    if (k === 'mktSorteio') {
      const fase = ev.fase ?? '';
      const ok = ev.ok;
      const perdeu = ev.perdeu === true;
      if (fase === 'fim') {
        return (ok === true && !perdeu) || (ok === false || perdeu);
      }
      return false;
    }
    if (k === 'erro' || k === 'recusa' || k === 'aviso') {
      const op = ev.op ?? '';
      if (op && !op.startsWith('market') && op !== 'comprar') {
        return false;
      }
      return true;
    }
    return false;
  }
  // Temporary, opt-in capture for manual Centro/Boss protocol diagnosis.
  // Only explicit protocol fields are copied; arbitrary messages and credentials never enter the buffer.
  let bossDiagnostic = null;
  const diagKeys = new Set(['t','type','k','key','slug','centro','noCentro','huntSlug','arena','boss','auto','autoKey','ativo','hp','hpMax','maxHp','vida','vidaMax','slot','quem','chave','ev','estado','data']);
  function diagCopy(value, depth = 0) {
    if (depth > 7 || value == null) return null;
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
    if (typeof value === 'string') return /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : null;
    if (Array.isArray(value)) return value.slice(0, 40).map(v => diagCopy(v, depth + 1));
    if (typeof value !== 'object') return null;
    return Object.fromEntries(Object.entries(value).filter(([k]) => diagKeys.has(k)).map(([k,v]) => [k, diagCopy(v, depth + 1)]));
  }
  function diagRecord(direction, raw) {
    if (!bossDiagnostic || !raw || typeof raw !== 'object') return;
    const type = raw.t ?? raw.type;
    if (direction === 'out' ? !['centro.ir','centro.curar','centro.desistir','boss.entrar','boss.auto','boss.sair'].includes(type)
      : !['campo','campo.init','estado','batalha','erro'].includes(type)) return;
    if (bossDiagnostic.events.length >= 2000) { bossDiagnostic.truncated = true; return; }
    const safe = diagCopy(raw);
    if (type === 'campo' || type === 'campo.init') {
      const field = raw.data ?? raw;
      if (Array.isArray(field.mobs)) (safe.data ?? safe).mobs = field.mobs.slice(0, 40).map(mob =>
        Object.fromEntries(['s', 'n', 'hp', 'mhp', 'x'].filter(key => mob?.[key] != null)
          .map(key => [key, diagCopy(mob[key])])));
    }
    // Capture boss rewards separately: item IDs and quantities only, never arbitrary payloads.
    const sourceEvents = raw.data?.ev ?? raw.ev;
    const safeEvents = safe?.data?.ev ?? safe?.ev;
    if (Array.isArray(sourceEvents) && Array.isArray(safeEvents)) {
      sourceEvents.slice(0, 40).forEach((event, i) => {
        if (event?.k !== 'bossMorto' || !Array.isArray(event.drops)) return;
        safeEvents[i].drops = event.drops.slice(0, 40).map(drop => ({
          itemId: Number.isSafeInteger(Number(drop?.itemId ?? drop?.id)) ? Number(drop.itemId ?? drop.id) : null,
          qtd: Number.isSafeInteger(Number(drop?.qtd ?? drop?.qty)) ? Number(drop.qtd ?? drop.qty) : null
        }));
      });
    }
    bossDiagnostic.events.push({ at: new Date().toISOString(), direction, packet: safe });
  }
  window.__pioBossDiagnosticStart = () => {
    if (latestSocket?.readyState !== NativeWebSocket.OPEN || handedOff) throw Error('Abra o jogo visual e conecte a conta antes de iniciar.');
    if (bossDiagnostic) throw Error('Já existe uma captura em andamento.');
    bossDiagnostic = { version: 1, startedAt: new Date().toISOString(), truncated: false, events: [] };
    return true;
  };
  window.__pioBossDiagnosticStop = () => {
    if (!bossDiagnostic) throw Error('Nenhuma captura ativa nesta janela.');
    const result = { ...bossDiagnostic, endedAt: new Date().toISOString() };
    bossDiagnostic = null;
    return result;
  };
  const MAX_EVENTS = 256, MAX_BYTES = 1024 * 1024, BATCH_EVENTS = 64;
  const metrics = { depth: 0, bytes: 0, highWater: 0, batches: 0, events: 0, gaps: 0, failures: 0, lastLatencyMs: 0 };
  // Numeric diagnostics only; no game payloads or credentials are retained here.
  window.__idleioBridgeMetrics = metrics;
  const playerKeys = ['id','cheio','nick','nome','level','trainerLevel','gold','orbs','gemas','gems','diamantes','diamonds','activeId','activePokemonId','pokemons','pkMud','pkFora','balls','items','inventory','huntSlug','outlandTier','noCentro','mapId','zoneId','zoneName','servidorAgora'];
  const pokemonKeys = ['id','speciesId','nome','name','level','shiny','slot','quality','potencia','looktype','lookShiny','skin'];
  const pick = (value, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(value ?? {}, k)).map(k => [k, value[k]]));
  function player(value) {
    const rawVal = value;
    value = value?.estado ?? value;
    const result = pick(value, playerKeys);
    if (result.servidorAgora == null && rawVal?.servidorAgora != null) {
      result.servidorAgora = rawVal.servidorAgora;
    }
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
      raidTokensKnown = false; raidTokens = 0; raidRequestAt = 0;
      const session = crypto.randomUUID();
      const origSend = socket.send;
      latestOrigSend = origSend;
      const analyzer = window.PioRmtTransport?.attach(socket, session, origSend,
        (name, args) => window.__TAURI_INTERNALS__.invoke(name, args),
        () => socket !== latestSocket || handedOff || !!document.querySelector('#cm-lista')?.getClientRects().length);
      socket.send = function(data) {
        try {
          if (typeof data === 'string') {
            const raw = JSON.parse(data);
            if (analyzer?.outgoing(raw) === false) return;
            diagRecord('out', raw);
            if (raw.t === 'hello' && raw.token) {
              report(session, { t: 'session_token', session, data: { token: raw.token, nick: raw.nick || '', session } });
            }
          }
        } catch (_) {}
        return origSend.apply(this, arguments);
      };
      socket.addEventListener('open', () => {
        if (socket === latestSocket) {
          raidTokensKnown = false; raidTokens = 0; raidRequestAt = 0;
          raidCharacter = null; raidAttemptEdition = null;
          raidConfirmedEdition = null; raidConfirmedUntil = 0;
          report(session, { t: 'reset', session });
          setTimeout(requestWeeklyRaid, 4_000);
        }
      });
      socket.addEventListener('close', () => { analyzer?.stop(); if (socket === latestSocket) report(session, { t: 'disconnected', session }); });
      socket.addEventListener('message', message => {
        if (handedOff) { message.stopImmediatePropagation(); return; }
        if (socket !== latestSocket || typeof message.data !== 'string') return;
        try {
          const raw = JSON.parse(message.data), t = raw.t ?? raw.type, data = raw.data ?? raw;
          if (t === 'market' && analyzer?.message(raw)) { message.stopImmediatePropagation(); return; }
          if (t === 'welcome') analyzer?.start();
          diagRecord('in', raw);
          if (window.__idleioRmtManualOffer && isTerminalMarketAck(raw, window.__idleioRmtManualOffer)) {
            window.__idleioRmtManualBusy = 0;
            window.__idleioRmtManualOffer = null;
            window.__idleioRmtManualSession = null;
            window.__idleioRmtManualNonce = null;
          }
          if (t === 'welcome') {
            observeRaidTokens(data.estado);
            try {
              const sessToken = localStorage.getItem('sessao');
              const sessNick = localStorage.getItem('nick');
              if (sessToken) {
                report(session, { t: 'session_token', session, data: { token: sessToken, nick: sessNick || '', session } });
              }
            } catch (_) {}
            report(session, { t, session, data: { outlandTiers: (data.outlandTiers ?? []).map(r => pick(r,["tier","rotulo","nivel","mult"])), pedrasEvolucao: data.pedrasEvolucao, shinyStone: data.shinyStone, mercado: data.mercado, catalogoBolas: (data.catalogoBolas ?? []).map(b => pick(b,["id","nome","name","priceGold","infinite","infinito","catchRate"])), estado: player(data.estado), hunts: (data.hunts ?? []).map(h => ({...pick(h, ['slug','name','nome','regiao','area','nivel']), especies: (h.especies ?? []).map(s => pick(s, ['pokeId','pontos','nome','looktype']))})), shinyLooks: data.shinyLooks, shinyLooksOutland: data.shinyLooksOutland } });
            queueMicrotask(() => window.__idleioBackgroundEconomy?.ready());
          }
          else if (t === 'campo' || t === 'campo.init') report(session, { t, data: { ...pick(data, ['slug','centro','pvp','casa','fora']), mobs: (data.mobs ?? []).map(m => pick(m,['s','n','hp','mhp','x','xr'])) } });
          else if (t === 'batalha') {
            const rawEvs = Array.isArray(data.ev) ? data.ev : [];
            const mappedEvs = [];
            for (const e of rawEvs) {
              const k = e.k ?? e.t ?? '';
              if (['bola','morte','bossMorto','capturado'].includes(k)) {
                mappedEvs.push({
                  ...pick(e,['k','t','key','ballId','slot','sucesso','quem','nome','ouro','valor','xp','xpTreinador','xpPokemon']),
                  ...(Array.isArray(e.drops) ? {drops:e.drops.map(d => pick(d,['itemId','id','nome','qtd','qty']))} : {}),
                  ...(e.pokemon ? {pokemon:{...pick(e.pokemon,[...pokemonKeys,'pokeId','potency','grade','nota','skin','iv_hp','iv_atk','iv_def','iv_spa','iv_spd','iv_spe']),ivs:pick(e.pokemon.ivs,['hp','atk','def','spAtk','spa','spDef','spd','speed','spe'])}} : {})
                });
              } else if (['marketComprado','mktSorteio','marketCompradoLote','erro'].includes(k)) {
                mappedEvs.push(e);
                if (window.__idleioRmtManualOffer && isTerminalMarketAck(e, window.__idleioRmtManualOffer)) {
                  window.__idleioRmtManualBusy = 0;
                  window.__idleioRmtManualOffer = null;
                  window.__idleioRmtManualSession = null;
                  window.__idleioRmtManualNonce = null;
                }
              }
            }
            if (mappedEvs.length > 0) report(session, { t, data: { ev: mappedEvs } });
          }
          else if (t === 'estado') {
            observeRaidTokens(data.estado ?? data);
            report(session, { t, data: player(data.estado ?? data) });
          }
          else if (t === 'raid') onWeeklyRaid(data);
          else if (t === 'market') report(session, { t, data: { aba: data.aba, id: data.id ?? raw.id, itemId: data.itemId, moeda: data.moeda, total: data.total, pagina: data.pagina, resumo: data.resumo, linhas: data.linhas, anuncio: data.anuncio ?? raw.anuncio } });
          else if (t === 'mktSorteio' || t === 'marketComprado' || t === 'marketCompradoLote') report(session, { t, data: raw });
          else if (t === 'erro') report(session, { t, data: pick(data, ['chave','msg','id','op','erro']) });
          else if (t === 'capturado') {
            const p = data.pokemon ?? data;
            const name = p.nome ?? p.name;
            if (typeof name === 'string') report(session, { t: 'activity', data: { kind: 'capture', name, qty: 1, shiny: typeof p.shiny === 'boolean' ? p.shiny : null, pokemon: {...pick(p,['speciesId','pokeId','level','quality','potencia','potency','grade','nota','skin','iv_hp','iv_atk','iv_def','iv_spa','iv_spd','iv_spe']), ivs: pick(p.ivs,['hp','atk','def','spAtk','spa','spDef','spd','speed','spe'])} } });
          } else if (t === 'morte' && data.quem === 'selvagem') {
            report(session, { t: 'activity', data: { kind: 'battle', name: data.nome ?? 'Selvagem derrotado', qty: 1, gold: data.ouro, xp: data.xpTreinador ?? data.xp } });
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
