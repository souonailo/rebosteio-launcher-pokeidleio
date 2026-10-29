(() => {
  'use strict';

  // Cache para mapeamento rápido de nome de Pokémon para dex ID
  let pokemonNameToDex = null;

  function initPokemonNameMap() {
    if (pokemonNameToDex) return;
    pokemonNameToDex = new Map();
    if (window.PIW_ALL_POKEMON_THEMES && Array.isArray(window.PIW_ALL_POKEMON_THEMES)) {
      for (const p of window.PIW_ALL_POKEMON_THEMES) {
        if (p && p.name && p.dex) {
          const clean = String(p.name).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!pokemonNameToDex.has(clean)) {
            pokemonNameToDex.set(clean, p.dex);
          }
        }
      }
    }
  }

  function resolveDexFromHunt(huntName) {
    if (!huntName) return 0;
    initPokemonNameMap();
    // Match complete species names first, then whole-word suffixes of variant names.
    // Slugs and display names must follow the same path (hard_golem / Hard Golem).
    const words = String(huntName).toLowerCase()
      .replace(/[_-]+/g, ' ').trim().split(/\s+/);
    if (['hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'].includes(words[words.length - 1])) words.pop();
    const aliases = { nidoranfe: 'nidoranfemale', nidoranma: 'nidoranmale' };
    for (let i = 0; i < words.length; i++) {
      const key = words.slice(i).join('').replace(/[^a-z0-9]/g, '');
      const dex = pokemonNameToDex.get(aliases[key] || key);
      if (dex) return dex;
    }
    return 0;
  }

  function safeDex(sid) {
    try {
      return typeof dexId === 'function' ? dexId(+sid || 0) : (+sid || 0);
    } catch {
      return +sid || 0;
    }
  }

  function getSpriteUrl(dex, isShiny, isPaused, name) {
    if (!dex || dex <= 0) return '';
    const shinyPart = isShiny ? 'shiny/' : '';

    if (isPaused) {
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shinyPart}${dex}.png`;
    }

    // Geração 1 a 5 (Black/White Animated)
    if (dex <= 649) {
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${shinyPart}${dex}.gif`;
    }

    // Gen 6+ via Showdown GIF com fallback
    const clean = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean) {
      return `https://play.pokemonshowdown.com/sprites/gen5${isShiny ? '-shiny' : ''}/${clean}.gif`;
    }

    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shinyPart}${dex}.png`;
  }

  function formatHuntTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }

  function fmtNumber(n) {
    n = +n || 0;
    return Math.round(n).toLocaleString('pt-BR');
  }

  function formatCompact(n) {
    n = +n || 0;
    const a = Math.abs(n), sg = n < 0 ? '-' : '';
    if (a >= 1e9) return sg + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.0', '') + 'bi';
    if (a >= 1e6) return sg + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.0', '') + 'M';
    if (a >= 1e3) return sg + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.0', '') + 'k';
    return Math.round(a).toLocaleString('pt-BR');
  }

  function setSocialText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }
  const social = { twitch: null, kick: null, points: null };
  const gameSocial = new Map();
  function refreshSocial() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    Array.from(grid.children).forEach((panel, i) => PioBattleHud.updateSocial(panel, i));
  }

  const pausedPanels = new Set();
  try {
    const raw = localStorage.getItem('bsh_paused');
    if (raw) JSON.parse(raw).forEach(i => pausedPanels.add(+i));
  } catch {}

  function savePaused() {
    try {
      localStorage.setItem('bsh_paused', JSON.stringify(Array.from(pausedPanels)));
    } catch {}
  }

  const IMPORTANT_DROPS = [
    {
      key: 'boss_token',
      name: 'Boss Token',
      title: 'Bronze Boss Token',
      ids: [70000],
      names: ['boss token', 'bronze boss token', 'token boss'],
      icon: 'src/ui/assets/markitems/boss_token.png',
      remoteFallback: 'https://pokeidle.io/assets/site/assets/items/bronze_boss_token.png'
    },
    {
      key: 'frag_chave',
      name: 'Frag. Chave',
      title: 'Fragmento de Chave',
      ids: [70011],
      names: ['fragmento de chave', 'frag de chave', 'key fragment', 'fragmento chave'],
      icon: 'src/ui/assets/markitems/frag_chave.png',
      remoteFallback: 'https://pokeidle.io/img/itens/fragmento-chave.png'
    },
    {
      key: 'frag_bike',
      name: 'Frag. Bike',
      title: 'Fragmento de Bicicleta',
      ids: [70013],
      names: ['fragmento de bicicleta', 'frag de bike', 'bicycle fragment', 'fragmento bicicleta', 'bike fragment'],
      icon: 'src/ui/assets/markitems/frag_bike.png',
      remoteFallback: 'https://pokeidle.io/img/itens/fragmento-bicicleta.png'
    },
    {
      key: 'shiny_stone',
      name: 'Shiny Stone',
      title: 'Shiny Stone / Fragmento',
      ids: [70012, 60598, 60607, 60609, 60612, 60613, 60614, 60617, 60618, 60619, 60620, 60624, 60625],
      names: ['shiny stone', 'fragmento de shiny stone', 'pedra shiny', 'shiny stone fragment'],
      icon: 'src/ui/assets/markitems/shiny_stone.png',
      remoteFallback: 'https://pokeidle.io/img/itens/shiny-stone.png'
    }
  ];

  const dropBaselines = new Map();

  function resolveItemTelemetry(def, state, panelIndex) {
    if (!state) return { initial: 0, runDrops: 0, current: 0 };

    const invMap = state.invMap || {};
    const rawDrops = state.rawDrops || {};
    const dropsList = Array.isArray(state.drops) ? state.drops : (Array.isArray(state.a?.drops) ? state.a.drops : []);

    // 1. Total atual na bag
    let currentInBag = 0;
    let foundInInv = false;
    for (const id of def.ids) {
      const v = invMap[id] != null ? invMap[id] : invMap[String(id)];
      if (v != null) {
        currentInBag += Math.max(0, +v || 0);
        foundInInv = true;
      }
    }

    if (!foundInInv && Array.isArray(state.bag)) {
      for (const group of state.bag) {
        if (!group || !Array.isArray(group.items)) continue;
        for (const it of group.items) {
          const itId = +(String(it.id || '').replace(/^b/, '')) || 0;
          if (def.ids.includes(itId) || def.names.some(n => String(it.name || '').toLowerCase().includes(n))) {
            currentInBag += Math.max(0, +it.qty || 0);
            foundInInv = true;
          }
        }
      }
    }

    // 2. Coletados na run atual
    let runDrops = 0;
    for (const id of def.ids) {
      const entry = rawDrops[id] || rawDrops[String(id)];
      if (entry != null) {
        runDrops += typeof entry === 'object' ? (+entry.qty || 0) : (+entry || 0);
      }
    }
    for (const k in rawDrops) {
      if (def.ids.map(String).includes(String(k))) continue;
      const entry = rawDrops[k];
      const entryName = (typeof entry === 'object' && entry.name) ? String(entry.name).toLowerCase() : String(k).toLowerCase();
      if (def.names.some(n => entryName.includes(n))) {
        runDrops += typeof entry === 'object' ? (+entry.qty || 0) : (+entry || 0);
      }
    }
    if (runDrops === 0 && dropsList.length > 0) {
      for (const d of dropsList) {
        if (!d) continue;
        const dId = +d.id || 0;
        const dName = String(d.name || d.n || '').toLowerCase();
        if ((dId && def.ids.includes(dId)) || def.names.some(n => dName.includes(n))) {
          runDrops += (+d.qty || +d.q || 0);
        }
      }
    }

    // 3. Baseline da sessão
    const sessStart = state.sessStart || (state.a?.seconds ? Date.now() - state.a.seconds * 1000 : 0);
    let baselineRecord = dropBaselines.get(panelIndex);
    if (!baselineRecord || (sessStart && Math.abs(baselineRecord.sessStart - sessStart) > 5000)) {
      baselineRecord = { sessStart, base: {} };
      dropBaselines.set(panelIndex, baselineRecord);
    }

    if (baselineRecord.base[def.key] == null) {
      const calculatedBase = foundInInv ? Math.max(0, currentInBag - runDrops) : 0;
      baselineRecord.base[def.key] = calculatedBase;
    } else if (foundInInv && baselineRecord.base[def.key] === 0 && currentInBag > runDrops) {
      baselineRecord.base[def.key] = Math.max(0, currentInBag - runDrops);
    }

    const initial = baselineRecord.base[def.key] || 0;
    const finalCurrent = foundInInv ? currentInBag : (initial + runDrops);

    return { initial, runDrops, current: finalCurrent };
  }

  function formatKickBonus(telemetry, account) {
    const redemption = account?.activeRedemption || account?.redemption;
    let redemptionActive = false;
    let redemptionKey = '';
    let redemptionTimeLeft = '';

    const isEligible = redemption && (
      redemption === account?.activeRedemption ||
      redemption.status === 'confirmed' ||
      redemption.status === 'success' ||
      redemption.status === 'pending' ||
      Boolean(redemption.reward && !redemption.status)
    );

    if (isEligible) {
      const now = Date.now();
      const expiresAt = Number(redemption.expiresAt || redemption.expireAt) || 0;
      const at = Number(redemption.at || redemption.timestamp) || 0;
      const qty = Math.max(1, Number(redemption.qty || redemption.bonusQty || 1));
      const durationMs = ((Number(redemption.duration) || 3600) * qty) * 1000;

      if (expiresAt > now) {
        redemptionActive = true;
        const diffMs = expiresAt - now;
        const totalMins = Math.max(1, Math.floor(diffMs / 60000));
        const hours = Math.floor(totalMins / 60);
        const remMins = totalMins % 60;
        redemptionTimeLeft = hours > 0
          ? `${hours}h ${remMins < 10 ? '0' : ''}${remMins}m`
          : `${totalMins}m`;
        redemptionKey = String(redemption.reward?.key || redemption.reward?.id || 'exp').toLowerCase();
      } else if (at > 0 && now >= at) {
        const elapsed = now - at;
        if (elapsed < durationMs) {
          redemptionActive = true;
          const remainingSecs = Math.max(1, Math.floor((durationMs - elapsed) / 1000));
          const mins = Math.floor(remainingSecs / 60);
          const hours = Math.floor(mins / 60);
          const remMins = mins % 60;
          redemptionTimeLeft = hours > 0
            ? `${hours}h ${remMins < 10 ? '0' : ''}${remMins}m`
            : `${mins}m`;
          redemptionKey = String(redemption.reward?.key || redemption.reward?.id || 'exp').toLowerCase();
        }
      } else if (redemption.status === 'pending') {
        redemptionActive = true;
        redemptionTimeLeft = 'confirmando...';
        redemptionKey = String(redemption.reward?.key || redemption.reward?.id || 'exp').toLowerCase();
      }
    }

    const telExp = Number(telemetry?.bonusExp) || 0;
    const telCatch = Number(telemetry?.bonusCatch) || 0;
    const telLure = Number(telemetry?.bonusLure) || 0;
    const telQty = Math.max(1, Number(telemetry?.bonusQty) || 1);
    let telTime = String(telemetry?.bonusTime || telemetry?.tempo || telemetry?.time || '').trim();

    if (telTime && /^\d+\s*m(?:in)?$/i.test(telTime)) {
      const mNum = parseInt(telTime, 10);
      if (mNum >= 60) {
        const h = Math.floor(mNum / 60);
        const rem = mNum % 60;
        telTime = `${h}h ${rem < 10 ? '0' : ''}${rem}m`;
      }
    }

    const types = [];

    if (telExp > 0 || (redemptionActive && redemptionKey.includes('exp'))) {
      types.push('EXP +15%');
    }

    if (telCatch > 0 || (redemptionActive && redemptionKey.includes('catch'))) {
      types.push('Catch +15%');
    }

    if (telLure > 0 || (redemptionActive && redemptionKey.includes('lure'))) {
      types.push('Lure +15%');
    }

    if (types.length === 0) {
      return { text: 'Sem bônus', active: false, details: '' };
    }

    let timeStr = redemptionTimeLeft || telTime;

    const telExpMs = Number(telemetry?.bonusExpiresAt || (telExp > 1000000000 ? telExp : 0));
    if (!timeStr && telExpMs > 0) {
      const expireMs = telExpMs > 1e11 ? telExpMs : telExpMs * 1000;
      const diff = expireMs - Date.now();
      if (diff > 0) {
        const totalMins = Math.max(1, Math.floor(diff / 60000));
        const hours = Math.floor(totalMins / 60);
        const remM = totalMins % 60;
        timeStr = hours > 0 ? `${hours}h ${remM < 10 ? '0' : ''}${remM}m` : `${totalMins}m`;
      }
    }

    if (telQty > 1 && !redemptionTimeLeft && timeStr) {
      const singleMatch = timeStr.match(/^1\s*h(?:r|rs)?$/i) || timeStr.match(/^60\s*m(?:in)?$/i);
      if (singleMatch) {
        timeStr = `${telQty}h 00m`;
      }
    }

    // O buff acumula tempo e nunca o multiplicador percentual (+15% permanece +15%)
    const label = types.join(' · ');
    const fullText = timeStr ? `${label} · ${timeStr}` : label;
    let details = '';
    if (redemptionActive && redemption?.channel) {
      details = `Bônus Kick: ${label}\nCanal: @${redemption.channel}\nTempo restante: ${timeStr || 'Ativo'}`;
    }

    return { text: fullText, active: true, details };
  }

  const PioBattleHud = {
    updateSocial(panel, i) {
      const box = panel.querySelector('.battle-slot-hud');
      if (!box) return;
      const game = gameSocial.get(i) || {};
      const labels = { checking: 'Verificando sessão', authenticated: 'Sessão confirmada', blocked: 'Consulta bloqueada', rate_limited: 'Aguarde', account_mismatch: 'Outra conta', connected: 'Conectada', connecting: 'Conectando', waiting_live: 'Sem live', error: 'Erro', login_required: 'Entrar', disconnected: 'Desconectada' };
      const account = social.points?.accounts?.[i];
      for (const platform of ['twitch', 'kick']) {
        const row = box.querySelector('.bsh-social-' + platform);
        const status = social[platform]?.accounts?.[i]?.status;
        const telemetry = game[platform];
        const connected = status === 'connected' || status === 'authenticated';
        row.classList.toggle('is-connected', connected);
        const statusEl = box.querySelector('.bsh-' + platform + '-status');
        // Routine balance polls do not replace an already confirmed session label.
        setSocialText(statusEl, (platform === 'kick' && account?.refreshing && !connected ? 'Consultando saldo' : labels[status]) || (platform === 'twitch' && telemetry?.assistindo ? 'Assistindo' : telemetry?.login ? 'Vinculada' : 'Aguardando'));
        statusEl.title = platform === 'kick' && account?.refreshing ? 'Atualizando saldo em segundo plano' : '';
        const bonusEl = box.querySelector('.bsh-' + platform + '-bonus');
        if (platform === 'twitch') {
          let twBonus = 'Bônus —';
          if (telemetry) {
            twBonus = telemetry.assistindo && telemetry.pctAtual > 0 ? '+' + telemetry.pctAtual + '% XP' : 'Sem bônus';
          }
          setSocialText(bonusEl, twBonus);
          bonusEl.classList.toggle('is-bonus-active', twBonus.startsWith('+'));
        } else {
          let kickBonusText = 'Bônus —';
          if (telemetry || account?.activeRedemption || account?.redemption) {
            const kb = formatKickBonus(telemetry, account);
            kickBonusText = kb.text;
            bonusEl.classList.toggle('is-bonus-active', kb.active);
            if (kb.details) bonusEl.title = kb.details;
          } else {
            bonusEl.classList.remove('is-bonus-active');
          }
          setSocialText(bonusEl, kickBonusText);
        }
      }
      const balances = Object.entries(account?.balances || {});
      const verified = balances.filter(([, b]) => b.status === 'verified' && Number.isSafeInteger(b.points));
      const total = verified.reduce((n, [, b]) => n + b.points, 0);
      const points = box.querySelector('.bsh-social-points');
      const gamePoints = game.kick?.pontos;
      setSocialText(points, !verified.length && Number.isFinite(gamePoints) ? fmtNumber(gamePoints) + ' pts no jogo' : verified.length ? fmtNumber(total) + ' pts' : 'Pontos —');
      points.title = balances.length ? balances.map(([channel, b]) => channel + ': ' + (b.status === 'verified' ? fmtNumber(b.points) : 'indisponível')).join('\n') : 'Aguardando saldo confirmado pela Kick';
      setSocialText(box.querySelector('.bsh-social-channels'), verified.length ? verified.length + (verified.length === 1 ? ' canal' : ' canais') + (verified.length < balances.length ? ' · parcial' : '') : Number.isFinite(gamePoints) ? 'Saldo informado pelo jogo' : 'Sem saldo confirmado');
    },

    isHudActive(i) {
      try {
        return localStorage.getItem('bsh_mode_' + i) === '1' || this.isBlasterActive(i);
      } catch {
        return false;
      }
    },

    isBlasterActive(i) {
      try {
        return localStorage.getItem('bsh_blaster_' + i) === '1';
      } catch {
        return false;
      }
    },

    setHudActive(i, active) {
      try {
        localStorage.setItem('bsh_mode_' + i, active ? '1' : '0');
      } catch {}

      const grid = document.getElementById('grid');
      const panel = grid && grid.children[i];
      if (!panel) return;

      if (!active && this.isBlasterActive(i)) {
        this.setBlasterActive(i, false);
      }

      panel.classList.toggle('is-hud-active', active);

      // Atualiza o botão no cabeçalho do painel
      const btn = panel.querySelector('.btn-eco-hud');
      if (btn) {
        btn.classList.toggle('is-on', active);
        btn.setAttribute('aria-pressed', String(active));
      }

      const hud = panel.querySelector('.battle-slot-hud');
      if (hud) {
        this.updateBanner(hud, this.isBlasterActive(i));
      }

      // No Tauri: Garante que o Webview nativo seja ocultado quando o HUD estiver ativo
      if (window.pokeAPI && typeof window.pokeAPI.webviewSetVisible === 'function') {
        window.pokeAPI.webviewSetVisible(i, !active);
      }

      // Tauri has one owner for transient Economy: background_economy.js.
      // Never turn that temporary setting into a permanent manual preference.
      if (window.__TAURI__) {
        if (active && !this.isBlasterActive(i) && window.READ_STATE) {
          window.pokeAPI.webviewEval(i, window.READ_STATE).then(state => {
            if (state?.ok && this.isHudActive(i)) {
              if (window.stCache) window.stCache[i] = {t: Date.now(), d: state};
              this.update(panel, i, state);
            }
          }).catch(() => {});
        }
        return;
      }

      // Aplica suspensão do Webview (quando não estiver no modo Blaster)
      if (!this.isBlasterActive(i) && typeof webviews !== 'undefined' && webviews[i] && !(typeof off !== 'undefined' && off[i])) {
        const wv = webviews[i];
        try {
          if (active) {
            wv.setAudioMuted(true);
            if (typeof ultraScript === 'function') wv.executeJavaScript(ultraScript(true)).catch(() => {});
            if (typeof inGameEcoScript === 'function') wv.executeJavaScript(inGameEcoScript(true)).catch(() => {});
            if (typeof ecoScript === 'function') wv.executeJavaScript(ecoScript(1)).catch(() => {});
          } else {
            const isMuted = typeof muted !== 'undefined' ? muted : false;
            wv.setAudioMuted(isMuted);
            if (typeof ultraScript === 'function') wv.executeJavaScript(ultraScript(false)).catch(() => {});
            const fps = typeof ecoFps === 'function' ? ecoFps() : 0;
            if (typeof ecoScript === 'function') wv.executeJavaScript(ecoScript(fps)).catch(() => {});
          }
        } catch {}
      }
    },

    setBlasterActive(i, active) {
      this._blasterGeneration ||= {};
      const generation = this._blasterGeneration[i] = (this._blasterGeneration[i] || 0) + 1;

      try {
        localStorage.setItem('bsh_blaster_' + i, active ? '1' : '0');
      } catch {}

      const grid = document.getElementById('grid');
      const panel = grid && grid.children[i];
      if (!panel) return;

      panel.classList.toggle('is-blaster-active', active);
      if (active) {
        panel.classList.add('is-hud-active');
        try { localStorage.setItem('bsh_mode_' + i, '1'); } catch {}
      }

      const blasterBtn = panel.querySelector('.btn-blaster-hud');
      if (blasterBtn) {
        blasterBtn.classList.toggle('is-on', active);
        blasterBtn.setAttribute('aria-pressed', String(active));
      }

      const ecoBtn = panel.querySelector('.btn-eco-hud');
      if (ecoBtn && active) {
        ecoBtn.classList.remove('is-on');
        ecoBtn.setAttribute('aria-pressed', 'false');
      }

      const hud = panel.querySelector('.battle-slot-hud');
      if (hud) {
        this.updateBanner(hud, active);
      }

      if (active) {
        if (window.pokeAPI && typeof window.pokeAPI.webviewSetVisible === 'function') {
          window.pokeAPI.webviewSetVisible(i, false);
        }
        // Coleta o estado mais recente para handoff contínuo
        const st = window.stCache?.[i]?.d || (typeof states !== 'undefined' && states.get(i)) || null;
        const p = window.__poke || {};
        const c = (typeof accounts !== 'undefined' && accounts[i]) || {};
        const config = {
          wsUrl: p.wsUrl || 'wss://pokeidle.io/ws',
          token: p.token || '',
          nick: p.nick || (c && c.name) || ('Conta ' + (i + 1)),
          auth: p.auth || '',
          // welcome restores the active hunt; the HUD text is a display name, not a protocol slug.
          balls: (st && st.balls) || 0,
          team: (st && st.team) || [],
          a: (st && st.a) || {}
        };

        const banner = hud && hud.querySelector('.bsh-mode-banner');
        if (banner) {
          banner.className = 'bsh-mode-banner is-blaster';
          banner.textContent = 'Conectando Headless...';
        }

        const handleSuccess = () => {
          if (this._blasterGeneration[i] !== generation || !this.isBlasterActive(i)) return;
          if (banner) {
            banner.textContent = 'Headless';
          }
        };

        const handleFail = (err) => {
          if (this._blasterGeneration[i] !== generation) return;
          if (banner) {
            banner.textContent = '⚠️ ' + String(err || 'Faça login na conta').slice(0, 160);
            panel.classList.remove('is-blaster-active');
            try { localStorage.setItem('bsh_blaster_' + i, '0'); } catch {}
            window.pokeAPI.blasterStop(i).catch(() => {});
          }
        };

        if (window.pokeAPI && typeof window.pokeAPI.blasterStartWithLogin === 'function') {
          window.pokeAPI.blasterStartWithLogin(i, config)
            .then(res => {
              if (res && res.ok) handleSuccess();
              else handleFail(res?.error);
            })
            .catch(handleFail);
        } else if (window.pokeAPI && typeof window.pokeAPI.blasterStart === 'function') {
          window.pokeAPI.blasterStart(i, config)
            .then(handleSuccess)
            .catch(handleFail);
        }

        const wv = panel.querySelector('webview');
        if (wv) {
          try { wv.setAudioMuted(true); } catch {}
        }
      } else {
        if (window.pokeAPI && typeof window.pokeAPI.blasterStop === 'function') {
          window.pokeAPI.blasterStop(i).catch(() => {});
        }
        if (!this.isHudActive(i) && window.pokeAPI && typeof window.pokeAPI.webviewSetVisible === 'function') {
          window.pokeAPI.webviewSetVisible(i, true);
        }
      }
    },

    toggleHud(i) {
      if (this.isBlasterActive(i)) {
        this.setBlasterActive(i, false);
        this.setHudActive(i, true);
        return;
      }
      const current = this.isHudActive(i);
      this.setHudActive(i, !current);
    },

    toggleBlaster(i) {
      const current = this.isBlasterActive(i);
      this.setBlasterActive(i, !current);
    },

    updateBanner(hud, isBlaster) {
      const banner = hud.querySelector('.bsh-mode-banner');
      const switchBtn = hud.querySelector('.bsh-switch-mode-btn');
      if (banner) {
        banner.className = 'bsh-mode-banner ' + (isBlaster ? 'is-blaster' : 'is-eco');
        banner.textContent = isBlaster
          ? 'Headless'
          : 'Painel de batalha';
      }
      if (switchBtn) {
        switchBtn.textContent = isBlaster
          ? 'Usar painel de batalha'
          : 'Ativar Headless';
      }
    },

    togglePause(i) {
      if (pausedPanels.has(i)) pausedPanels.delete(i);
      else pausedPanels.add(i);
      savePaused();
    },

    isPaused(i) {
      return pausedPanels.has(i);
    },

    mount(panel, i) {
      if (!panel || panel.querySelector('.battle-slot-hud')) return;

      const isBlaster = this.isBlasterActive(i);

      // 1. Cria a casca do HUD
      const hud = document.createElement('div');
      hud.className = 'battle-slot-hud';
      hud.setAttribute('data-panel', String(i));
      hud.innerHTML = `
        <div class="bsh-mode-banner ${isBlaster ? 'is-blaster' : 'is-eco'}">
          ${isBlaster ? 'Headless' : 'Painel de batalha'}
        </div>
        <aside class="bsh-social" aria-label="Twitch, Kick e pontos desta conta">
          <div class="bsh-social-twitch"><span class="bsh-social-brand">Twitch</span><span class="bsh-social-status bsh-twitch-status">Aguardando</span><span class="bsh-social-bonus bsh-twitch-bonus">Bônus —</span></div>
          <div class="bsh-social-kick"><span class="bsh-social-brand">Kick</span><span class="bsh-social-status bsh-kick-status">Aguardando</span><span class="bsh-social-bonus bsh-kick-bonus">Bônus —</span></div>
          <div class="bsh-social-wallet"><span class="bsh-social-points">Pontos —</span><span class="bsh-social-channels">Sem saldo confirmado</span></div>
        </aside>
        <div class="bsh-arena">
          <div class="bsh-fighter bsh-fighter-lead">
            <span class="bsh-fighter-tag">SEU POKÉMON</span>
            <div class="bsh-sprite-stage">
              <div class="bsh-stage-shadow"></div>
              <img class="bsh-sprite bsh-lead-sprite" alt="Seu Pokémon" onerror="this.style.opacity='0'">
            </div>
            <div class="bsh-fighter-name bsh-lead-name">—</div>
          </div>
          <div class="bsh-vs-badge">VS</div>
          <div class="bsh-fighter bsh-fighter-hunt">
            <span class="bsh-fighter-tag">CAÇA ATUAL</span>
            <div class="bsh-sprite-stage">
              <div class="bsh-stage-shadow"></div>
              <img class="bsh-sprite bsh-hunt-sprite" alt="Caça Atual" onerror="this.style.opacity='0'">
            </div>
            <div class="bsh-fighter-name bsh-hunt-name">—</div>
          </div>
        </div>
        <div class="bsh-controls-row">
          <button type="button" class="bsh-pause-btn">Pausar animação</button>
          <button type="button" class="bsh-switch-mode-btn">
            ${isBlaster ? 'Usar painel de batalha' : 'Ativar Headless'}
          </button>
        </div>
        <div class="bsh-divider"></div>
        <div class="bsh-stats-grid">
          <div class="bsh-stat-col">
            <span class="bsh-stat-label">Tempo de caça</span>
            <span class="bsh-stat-value bsh-val-time">0h 00m 00s</span>
          </div>
          <div class="bsh-stat-col">
            <span class="bsh-stat-label">Pokébolas</span>
            <span class="bsh-stat-value bsh-val-balls">—</span>
          </div>
          <div class="bsh-stat-col"><span class="bsh-stat-label">Poções</span><span class="bsh-stat-value bsh-val-potions">—</span></div>
          <div class="bsh-stat-col"><span class="bsh-stat-label">Revives</span><span class="bsh-stat-value bsh-val-revives">—</span></div>
          <div class="bsh-stat-col">
            <span class="bsh-stat-label">EXP / hora</span>
            <span class="bsh-stat-value bsh-val-xph">0</span>
          </div>
          <div class="bsh-stat-col">
            <span class="bsh-stat-label">Shinies</span>
            <span class="bsh-stat-value bsh-val-shinies">0</span>
          </div>
        </div>
        <div class="bsh-important-drops" aria-label="Drops Importantes">
          ${IMPORTANT_DROPS.map(item => `
            <div class="bsh-drop-card bsh-drop-${item.key}" data-key="${item.key}" title="${item.title}">
              <span class="bsh-drop-badge" style="display: none;">+0</span>
              <div class="bsh-drop-icon-wrap">
                <img class="bsh-drop-icon" src="${item.icon}" alt="${item.name}" onerror="this.src='${item.remoteFallback}'">
              </div>
              <span class="bsh-drop-qty">x0</span>
            </div>
          `).join('')}
        </div>
        <button type="button" class="bsh-open-game-btn">
          Abrir jogo
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
            <path d="M7 17L17 7M17 7H7M17 7V17"/>
          </svg>
        </button>
      `;

      // Eventos internos do HUD
      const pauseBtn = hud.querySelector('.bsh-pause-btn');
      pauseBtn.onclick = () => {
        this.togglePause(i);
        pauseBtn.textContent = this.isPaused(i) ? 'Retomar animação' : 'Pausar animação';
        const st = window.stCache?.[i]?.d || (typeof states !== 'undefined' && states.get(i)) || null;
        if (st) this.update(panel, i, st);
      };

      const switchBtn = hud.querySelector('.bsh-switch-mode-btn');
      switchBtn.onclick = () => {
        const currentlyBlaster = this.isBlasterActive(i);
        if (currentlyBlaster) {
          this.setBlasterActive(i, false);
          this.setHudActive(i, true);
        } else {
          this.setBlasterActive(i, true);
        }
      };

      const openBtn = hud.querySelector('.bsh-open-game-btn');
      openBtn.onclick = () => {
        if (this.isBlasterActive(i)) {
          this.setBlasterActive(i, false);
        }
        this.setHudActive(i, false);
      };

      // Insere o HUD no painel
      panel.appendChild(hud);
      this.updateSocial(panel, i);

      // 2. Adiciona botões no cabeçalho do painel (.panel-header)
      const header = panel.querySelector('.panel-header');
      if (header) {
        const reloadBtn = header.querySelector('.reload') || header.querySelector('.expand');

        if (!header.querySelector('.btn-eco-hud')) {
          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'btn-eco-hud';
          toggleBtn.type = 'button';
          toggleBtn.title = 'Mostrar painel de batalha';
          toggleBtn.setAttribute('aria-label', `Painel de batalha da conta ${i + 1}`);
          toggleBtn.setAttribute('aria-pressed', 'false');
          toggleBtn.textContent = 'Batalha';
          toggleBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleHud(i);
          };
          if (reloadBtn) header.insertBefore(toggleBtn, reloadBtn);
          else header.appendChild(toggleBtn);
        }

        if (!header.querySelector('.btn-blaster-hud')) {
          const blasterBtn = document.createElement('button');
          blasterBtn.className = 'btn-blaster-hud';
          blasterBtn.type = 'button';
          blasterBtn.title = 'Headless — jogo sem WebView';
          blasterBtn.setAttribute('aria-label', `Headless da conta ${i + 1}`);
          blasterBtn.setAttribute('aria-pressed', 'false');
          blasterBtn.textContent = 'Headless';
          blasterBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleBlaster(i);
          };
          if (reloadBtn) header.insertBefore(blasterBtn, reloadBtn);
          else header.appendChild(blasterBtn);
        }
      }

      // Restaura o estado salvo
      if (this.isBlasterActive(i)) {
        this.setBlasterActive(i, true);
      } else if (this.isHudActive(i)) {
        this.setHudActive(i, true);
      }
    },

    update(panel, i, state) {
      if (!panel) return;
      const hud = panel.querySelector('.battle-slot-hud');
      if (!hud) return;

      gameSocial.set(i, { twitch: state?.twitch, kick: state?.kick });
      this.updateSocial(panel, i);
      const isPaused = this.isPaused(i);
      const pauseBtn = hud.querySelector('.bsh-pause-btn');
      if (pauseBtn) {
        pauseBtn.textContent = isPaused ? 'Retomar animação' : 'Pausar animação';
      }

      state = window.PioInventory.project(state);
      const a = (state && state.a) || {};

      // 1. Líder do Jogador
      const lead = (state && state.team && state.team.length)
        ? (state.team.find(p => p.ld) || (state.activeId ? state.team.find(p => String(p.id) === String(state.activeId)) : null) || state.team[0])
        : null;

      const leadDex = lead ? safeDex(lead.sid) : 0;
      const leadSpriteEl = hud.querySelector('.bsh-lead-sprite');
      const leadNameEl = hud.querySelector('.bsh-lead-name');

      if (lead && leadDex > 0) {
        if (leadSpriteEl) leadSpriteEl.style.opacity = '1';
        const leadSrc = getSpriteUrl(leadDex, !!lead.shiny, isPaused, lead.name);
        if (leadSpriteEl && leadSpriteEl.getAttribute('data-src') !== leadSrc) {
          leadSpriteEl.setAttribute('data-src', leadSrc);
          leadSpriteEl.style.opacity = '1';
          leadSpriteEl.src = leadSrc;
          leadSpriteEl.onerror = () => {
            leadSpriteEl.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${lead.shiny ? 'shiny/' : ''}${leadDex}.png`;
          };
        }
        if (leadNameEl) {
          const leadTitle = (lead.shiny ? '✨ ' : '') + (lead.name || 'Líder') + (lead.level ? ` Lv ${lead.level}` : '');
          if (leadNameEl.textContent !== leadTitle) leadNameEl.textContent = leadTitle;
        }
      } else {
        if (leadSpriteEl) leadSpriteEl.style.opacity = '0';
        if (leadNameEl) leadNameEl.textContent = 'Sem Pokémon';
      }

      // 2. Caça Atual
      const huntRaw = (state && state.hunt) || '';
      const huntDex = resolveDexFromHunt(huntRaw);
      const huntSpriteEl = hud.querySelector('.bsh-hunt-sprite');
      const huntNameEl = hud.querySelector('.bsh-hunt-name');

      const prettyHunt = huntRaw ? huntRaw.replace(/[_-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : 'Aguardando caça';

      if (huntDex > 0) {
        if (huntSpriteEl) huntSpriteEl.style.opacity = '1';
        const huntSrc = getSpriteUrl(huntDex, false, isPaused, huntRaw);
        if (huntSpriteEl && huntSpriteEl.getAttribute('data-src') !== huntSrc) {
          huntSpriteEl.setAttribute('data-src', huntSrc);
          huntSpriteEl.style.opacity = '1';
          huntSpriteEl.src = huntSrc;
          huntSpriteEl.onerror = () => {
            huntSpriteEl.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${huntDex}.png`;
          };
        }
      } else if (huntRaw) {
        if (huntSpriteEl) {
          huntSpriteEl.removeAttribute('data-src');
          huntSpriteEl.style.opacity = '0.6';
          huntSpriteEl.src = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
        }
      } else {
        if (huntSpriteEl) huntSpriteEl.style.opacity = '0';
      }

      if (huntNameEl && huntNameEl.textContent !== prettyHunt) {
        huntNameEl.textContent = prettyHunt;
      }

      // 3. KPIs
      const timeValEl = hud.querySelector('.bsh-val-time');
      if (timeValEl) {
        const timeFormatted = formatHuntTime(a.seconds || 0);
        if (timeValEl.textContent !== timeFormatted) timeValEl.textContent = timeFormatted;
      }

      const ballsValEl = hud.querySelector('.bsh-val-balls');
      if (ballsValEl) {
        const bInf = Boolean((state.equippedBall && state.equippedBall.infinite) || (+state.balls >= 999999));
        const ballsFormatted = state.ballsKnown === false ? '—' : (bInf ? '∞' : fmtNumber(state.balls || 0));
        if (ballsValEl.textContent !== ballsFormatted) ballsValEl.textContent = ballsFormatted;
      }

      for (const key of ['potions', 'revives']) {
        const el = hud.querySelector('.bsh-val-' + key);
        if (el) el.textContent = state.inventoryKnown === false || state[key] == null ? '—' : fmtNumber(state[key]);
      }

      const xphValEl = hud.querySelector('.bsh-val-xph');
      if (xphValEl) {
        const xphFormatted = formatCompact(a.xph || 0);
        if (xphValEl.textContent !== xphFormatted) xphValEl.textContent = xphFormatted;
        const xphFull = `${fmtNumber(a.xph || 0)}/h`;
        if (xphValEl.getAttribute('title') !== xphFull) xphValEl.setAttribute('title', xphFull);
      }

      const shiniesValEl = hud.querySelector('.bsh-val-shinies');
      if (shiniesValEl) {
        const shiniesCount = a.shinyCap != null ? a.shinyCap : (a.shinyFound || 0);
        const shiniesFormatted = fmtNumber(shiniesCount);
        if (shiniesValEl.textContent !== shiniesFormatted) shiniesValEl.textContent = shiniesFormatted;
      }

      // 4. Drops Importantes (Boss Token, Frag Chave, Frag Bike, Shiny Stone)
      for (const item of IMPORTANT_DROPS) {
        const card = hud.querySelector(`.bsh-drop-${item.key}`);
        if (!card) continue;
        const { initial, runDrops, current } = resolveItemTelemetry(item, state, i);

        const badgeEl = card.querySelector('.bsh-drop-badge');
        if (badgeEl) {
          if (runDrops > 0) {
            const badgeText = `+${runDrops}`;
            if (badgeEl.textContent !== badgeText) badgeEl.textContent = badgeText;
            badgeEl.style.display = 'inline-flex';
          } else {
            badgeEl.style.display = 'none';
          }
        }

        const qtyEl = card.querySelector('.bsh-drop-qty');
        if (qtyEl) {
          const qtyText = `x${initial}`;
          if (qtyEl.textContent !== qtyText) qtyEl.textContent = qtyText;
        }

        const tip = `${item.title || item.name}\nInício: ${initial}\nNa run: +${runDrops}\nTotal na bag: ${current}`;
        if (card.title !== tip) card.title = tip;
      }
    }
  };

  PioBattleHud.IMPORTANT_DROPS = IMPORTANT_DROPS;
  PioBattleHud.resolveItemTelemetry = resolveItemTelemetry;
  PioBattleHud.formatKickBonus = formatKickBonus;

  window.PioBattleHud = PioBattleHud;
  for (const [key, getter, event] of [
    ['twitch', 'twitchGetStatus', 'onTwitchStatus'],
    ['kick', 'kickGetStatus', 'onKickStatus'],
    ['points', 'kickGetPoints', 'onKickPoints']
  ]) {
    const receive = value => { social[key] = value; refreshSocial(); };
    if (typeof window.pokeAPI?.[event] === 'function') window.pokeAPI[event](receive);
    if (typeof window.pokeAPI?.[getter] === 'function') Promise.resolve(window.pokeAPI[getter]()).then(receive).catch(() => {});
  }

  if (typeof setInterval !== 'undefined') {
    setInterval(() => {
      refreshSocial();
    }, 10000);
  }

  if (window.__TAURI__ && window.pokeAPI?.onBlasterStatus) {
    window.pokeAPI.onBlasterStatus(({index, status, error}) => {
      if (!PioBattleHud.isBlasterActive(index)) return;
      const banner = document.querySelectorAll('.panel')[index]?.querySelector('.bsh-mode-banner');
      if (banner) banner.textContent = status === 'connected' ? 'Headless'
        : status === 'connecting' ? 'Conectando Headless...'
        : 'Headless: ' + String(error || 'conexão encerrada').slice(0, 160);
    });
  }

  if (!window.__TAURI__ && window.pokeAPI && typeof window.pokeAPI.onBlasterUpdate === 'function') {
    window.pokeAPI.onBlasterUpdate(({ index, state }) => {
      const grid = document.getElementById('grid');
      const panel = grid && grid.children[index];
      if (panel) {
        PioBattleHud.update(panel, index, state);
      }
      state = window.PioInventory ? window.PioInventory.project(state) : state;
      if (typeof window.stCache !== 'undefined') {
        window.stCache[index] = { t: Date.now() + 15000, d: state };
      }
      const targetWv = (panel && panel.querySelector('webview')) ||
                       (typeof webviews !== 'undefined' && webviews[index]);
      if (targetWv) {
        const msgStr = '__PGST__' + JSON.stringify(state);
        const evt = new CustomEvent('console-message', { detail: { message: msgStr } });
        evt.message = msgStr;
        targetWv.dispatchEvent(evt);
      }
    });
  }
})();
