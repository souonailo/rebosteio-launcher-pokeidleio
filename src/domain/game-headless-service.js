/**
 * @file game-headless-service.js
 * Gerenciador headless nativo do PokeIdle via WebSocket puro (wss://pokeidle.io/).
 * Emula o protocolo oficial do cliente do jogo sem instanciar Chromium WebViews,
 * reduzindo o consumo de memória RAM para <150MB no total do sistema.
 */

'use strict';

const EventEmitter = require('events');

const HEADLESS_ITEMS_DICTIONARY = {
  2: 'Ancient Stone', 5: 'Beast Ball', 23: 'Cocoon Stone', 28: 'Crystal Stone', 31: 'Darkness Stone',
  40: 'Earth Stone', 45: 'Enigma Stone', 49: 'Feather Stone', 53: 'Fire Stone', 66: 'Heart Stone',
  71: 'Ice Stone', 76: 'Leaf Stone', 87: 'Metal Stone', 106: 'Punch Stone', 109: 'Rock Stone',
  133: 'Thunder Stone', 139: 'Venom Stone', 142: 'Water Stone', 209: 'Sun Stone',
  40530: 'AoE TM Disk Piece', 40575: 'AoE TM Disk', 59194: 'TM Disk Piece',
  59200: 'Normal-Type TM Disk', 59201: 'Fire-Type TM Disk', 59202: 'Water-Type TM Disk',
  59203: 'Grass-Type TM Disk', 59204: 'Electric-Type TM Disk', 59205: 'Ice-Type TM Disk',
  59206: 'Fighting-Type TM Disk', 59207: 'Poison-Type TM Disk', 59208: 'Ground-Type TM Disk',
  59209: 'Flying-Type TM Disk', 59210: 'Psychic-Type TM Disk', 59211: 'Bug-Type TM Disk',
  59212: 'Rock-Type TM Disk', 59213: 'Ghost-Type TM Disk', 59214: 'Dragon-Type TM Disk',
  59215: 'Dark-Type TM Disk', 59216: 'Steel-Type TM Disk', 59247: 'Fairy-Type TM Disk',
  70000: 'Bronze Boss Token', 70011: 'Key Fragment', 70012: 'Shiny Stone Fragment', 70013: 'Bicycle Fragment',
  70020: 'Normal Shiny Stone', 70021: 'Fire Shiny Stone', 70022: 'Water Shiny Stone',
  70023: 'Grass Shiny Stone', 70024: 'Electric Shiny Stone', 70025: 'Ice Shiny Stone',
  70026: 'Fighting Shiny Stone', 70027: 'Poison Shiny Stone', 70028: 'Ground Shiny Stone',
  70029: 'Flying Shiny Stone', 70030: 'Psychic Shiny Stone', 70031: 'Bug Shiny Stone',
  70032: 'Rock Shiny Stone', 70033: 'Ghost Shiny Stone', 70034: 'Dragon Shiny Stone',
  70035: 'Dark Shiny Stone', 70036: 'Steel Shiny Stone', 70037: 'Fairy Shiny Stone',
  70080: 'Common Bicycle', 70081: 'Uncommon Bicycle', 70082: 'Rare Bicycle',
  70083: 'Mythic Bicycle', 70084: 'Legendary Bicycle', 999999: 'Diamantes'
};

function resolveHeadlessItemName(id) {
  if (id == null) return '';
  return HEADLESS_ITEMS_DICTIONARY[id] || '';
}

class PokeIdleHeadlessClient extends EventEmitter {
  constructor(accountIndex, options = {}) {
    super();
    this.index = accountIndex;
    this.wsUrl = options.wsUrl || 'wss://pokeidle.io/ws';
    this.token = options.token || '';
    this.nick = options.nick || ('Conta ' + (accountIndex + 1));
    this.auth = options.auth || '';
    this.ws = null;
    this.pingInterval = null;
    this.huntInterval = null;
    this.status = 'disconnected'; // 'connecting', 'connected', 'error', 'disconnected'
    this.lastError = '';

    // Snapshot unificado de telemetria compatível com o launcher
    this.state = {
      ok: true,
      i: accountIndex,
      name: this.nick,
      hunt: options.hunt || '',
      balls: options.balls || 0,
      equippedBall: options.equippedBall || { name: 'Pokeball', infinite: false },
      team: options.team || [],
      gold: options.gold || 0,
      diamonds: options.diamonds || 0,
      gemas: options.gemas || 0,
      level: options.level || 0,
      xp: options.xp || 0,
      activeId: options.activeId || null,
      twitch: options.twitch || null,
      kick: options.kick || null,
      invMap: options.invMap || {},
      rawDrops: options.rawDrops || {},
      drops: options.drops || {},
      catchLog: options.catchLog || [],
      shinyLog: options.shinyLog || [],
      vipAte: options.vipAte || null,
      passeVipAte: options.passeVipAte || null,
      vipDias: options.vipDias || null,
      passeDias: options.passeDias || null,
      boostXp: options.boostXp || null,
      a: {
        seconds: 0,
        xph: 0,
        shinyCap: 0,
        shinyFound: 0,
        kills: 0,
        balls: 0,
        captures: 0,
        ...(options.a || {})
      }
    };

    this.sessionStartTime = Date.now() - (this.state.a.seconds * 1000);
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return;
    }

    this.status = 'connecting';
    this.emit('status', { index: this.index, status: this.status });

    try {
      const WS = typeof globalThis.WebSocket !== 'undefined' ? globalThis.WebSocket : null;
      if (!WS) {
        throw new Error('WebSocket não disponível no ambiente.');
      }

      this.ws = new WS(this.wsUrl);

      this.ws.onopen = () => {
        this.status = 'connected';
        this.lastError = '';
        this.emit('status', { index: this.index, status: this.status });

        // Handshake oficial inicial
        if (this.nick && this.token) {
          this.send({ t: 'hello', nick: this.nick, token: this.token });
        }

        // Heartbeat periódico (a cada 25s)
        clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          this.send({ t: 'ping' });
        }, 25000);

        // Atualizador de tempo de caça / segundos decorridos (a cada 1s)
        clearInterval(this.huntInterval);
        this.huntInterval = setInterval(() => {
          this.state.a.seconds = Math.max(0, Math.floor((Date.now() - this.sessionStartTime) / 1000));
          if (this.state.a.seconds > 0 && this.state.a.xp) {
            this.state.a.xph = Math.round((this.state.a.xp / Math.max(60, this.state.a.seconds)) * 3600);
          }
          this.emit('update', { index: this.index, state: this.getState() });
        }, 1000);
      };

      this.ws.onmessage = (event) => {
        try {
          this.handleMessage(event.data);
        } catch (err) {
          this.emit('error', { index: this.index, error: err });
        }
      };

      this.ws.onclose = () => {
        this.cleanup();
        this.status = 'disconnected';
        this.emit('status', { index: this.index, status: this.status });
      };

      this.ws.onerror = (err) => {
        this.status = 'error';
        this.lastError = (err && err.message) || 'Erro de conexão no WebSocket';
        this.emit('status', { index: this.index, status: this.status, error: this.lastError });
      };
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message;
      this.emit('status', { index: this.index, status: this.status, error: this.lastError });
    }
  }

  handleMessage(raw) {
    if (!raw) return;
    let m = null;
    try {
      m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return;
    }
    if (!m) return;

    let hasChange = false;

    // 1. Welcome / Handshake do servidor
    if (m.t === 'welcome') {
      const est = m.estado || {};
      const trainer = est.eu || est;
      if (trainer.nick || est.nick) this.state.name = trainer.nick || est.nick;
      if (trainer.activeId != null || est.activeId != null) this.state.activeId = trainer.activeId != null ? trainer.activeId : est.activeId;
      if (trainer.level != null || est.level != null) this.state.level = trainer.level != null ? trainer.level : est.level;
      if (trainer.gold != null || est.gold != null) this.state.gold = trainer.gold != null ? trainer.gold : est.gold;
      if (trainer.diamonds != null || est.diamonds != null) this.state.diamonds = trainer.diamonds != null ? trainer.diamonds : est.diamonds;
      if (trainer.orbs != null || trainer.gemas != null || est.orbs != null || est.gemas != null) {
        this.state.gemas = trainer.orbs != null ? trainer.orbs : (trainer.gemas != null ? trainer.gemas : (est.orbs != null ? est.orbs : est.gemas));
      }
      if (est.huntSlug) this.state.hunt = est.huntSlug;
      const xpVal = trainer.xp != null ? trainer.xp : (trainer.exp != null ? trainer.exp : est.xp);
      if (xpVal != null) {
        this.state.xp = xpVal;
      } else if (!this.state.xp && this.state.level) {
        const n = Math.max(0, this.state.level - 1);
        this.state.xp = 50 * n * (n + 1) * (2 * n + 1) / 6 - 150 * n * (n + 1) / 2 + 200 * n;
      }

      const pokes = trainer.pokemons || est.pokemons || est.pkMud;
      if (Array.isArray(pokes)) {
        this.state.team = pokes.map(pk => ({
          id: pk.id,
          sid: pk.speciesId || pk.pokeId,
          name: pk.nome || pk.name,
          level: pk.level,
          shiny: !!pk.shiny,
          ld: pk.slot != null || pk.id === this.state.activeId
        }));
      }

      if (est.balls && typeof est.balls === 'object') {
        const total = Object.values(est.balls).reduce((sum, v) => sum + (+v || 0), 0);
        this.state.balls = total;
      }

      if (est.items && typeof est.items === 'object') {
        this.state.invMap = Object.assign({}, this.state.invMap, est.items);
      }

      if (est.twitch && typeof est.twitch === 'object') {
        this.state.twitch = est.twitch;
      }

      if (est.kick && typeof est.kick === 'object') {
        this.state.kick = est.kick;
      }

      const nowMs = Date.now();
      const vipAte = trainer.vipAte || est.vipAte || (est.loja && est.loja.vipAte) || m.vipAte;
      if (vipAte != null) {
        this.state.vipAte = Number(vipAte) || 0;
        this.state.vipDias = this.state.vipAte > nowMs ? Math.max(1, Math.ceil((this.state.vipAte - nowMs) / 86400000)) : null;
      }
      const passeObj = trainer.passe || est.passe || m.passe;
      const passeAte = passeObj && passeObj.vipAte;
      if (passeAte != null) {
        this.state.passeVipAte = Number(passeAte) || 0;
        this.state.passeDias = this.state.passeVipAte > nowMs ? Math.max(1, Math.ceil((this.state.passeVipAte - nowMs) / 86400000)) : null;
      }
      const boostVal = trainer.boostXp || est.boostXp || (trainer.bonusXp && trainer.bonusXp.tr) || (est.bonusXp && est.bonusXp.tr);
      if (boostVal != null) {
        if (typeof boostVal === 'string') this.state.boostXp = boostVal;
        else if (typeof boostVal === 'number' && boostVal > 1) this.state.boostXp = '+' + Math.round((boostVal - 1) * 100) + '%';
      } else if (this.state.vipDias && !this.state.boostXp) {
        this.state.boostXp = '+50%';
      }

      hasChange = true;
    }

    // 2. Mudança de campo/hunt
    else if (m.t === 'campo.init' || m.type === 'field-init') {
      const slug = m.slug || '';
      if (slug && this.state.hunt !== slug) {
        this.state.hunt = slug;
        hasChange = true;
      }
    }

    // 3. Eventos de batalha (kills, exp, loot, shinies, bolas, capturas)
    else if (m.t === 'batalha' && Array.isArray(m.ev)) {
      for (const ev of m.ev) {
        if (!ev) continue;
        if (ev.k === 'spawn' && ev.shiny) {
          this.state.a.shinyFound = (this.state.a.shinyFound || 0) + 1;
          if (!this.state.shinyLog) this.state.shinyLog = [];
          this.state.shinyLog.push({
            n: ev.nome || ev.name || '',
            sid: ev.speciesId || ev.pokeId || 0,
            def: 0,
            t: Date.now()
          });
          if (this.state.shinyLog.length > 30) this.state.shinyLog.shift();
          hasChange = true;
        } else if (ev.k === 'morte' && ev.quem === 'selvagem') {
          this.state.a.kills = (this.state.a.kills || 0) + 1;
          const xp = Number(ev.xpTreinador != null ? ev.xpTreinador : ev.xp) || 0;
          this.state.a.xp = (this.state.a.xp || 0) + xp;
          if (xp > 0) this.state.xp = (this.state.xp || 0) + xp;
          if (ev.shiny) {
            this.state.a.shinyFound = (this.state.a.shinyFound || 0) + 1;
            if (!this.state.shinyLog) this.state.shinyLog = [];
            this.state.shinyLog.push({
              n: ev.nome || ev.name || '',
              sid: ev.speciesId || ev.pokeId || 0,
              def: 1,
              t: Date.now()
            });
            if (this.state.shinyLog.length > 30) this.state.shinyLog.shift();
          }
          if (Array.isArray(ev.drops)) {
            if (!this.state.rawDrops) this.state.rawDrops = {};
            if (!this.state.drops) this.state.drops = {};
            if (!this.state.invMap) this.state.invMap = {};
            for (const l of ev.drops) {
              const itemIdNum = l.itemId != null ? Number(l.itemId) : (l.id != null ? Number(l.id) : null);
              const resolvedName = (l.nome || l.name || resolveHeadlessItemName(itemIdNum)).trim();
              const k = resolvedName || l.itemId || l.id || 'item';
              const q = l.qtd || l.qty || 1;
              const d = this.state.rawDrops[k] || (this.state.rawDrops[k] = { id: l.itemId || l.id || 0, name: resolvedName, qty: 0 });
              d.qty += q;
              d.name = resolvedName;
              this.state.drops[k] = { id: l.itemId || l.id || 0, name: resolvedName, qty: d.qty };
              if (l.itemId != null && String(l.itemId) !== String(k)) {
                this.state.rawDrops[l.itemId] = this.state.drops[k];
                this.state.drops[l.itemId] = this.state.drops[k];
              }
              if (l.itemId != null) {
                const cur = Number(this.state.invMap[l.itemId]) || 0;
                this.state.invMap[l.itemId] = cur + q;
              }
            }
          }
          hasChange = true;
        } else if (ev.k === 'bossMorto') {
          const xp = Number(ev.xpTreinador != null ? ev.xpTreinador : ev.xp) || 0;
          this.state.a.xp = (this.state.a.xp || 0) + xp;
          if (xp > 0) this.state.xp = (this.state.xp || 0) + xp;
          if (Array.isArray(ev.drops)) {
            if (!this.state.rawDrops) this.state.rawDrops = {};
            if (!this.state.drops) this.state.drops = {};
            if (!this.state.invMap) this.state.invMap = {};
            for (const l of ev.drops) {
              const k = l.itemId || l.id || l.nome;
              const q = l.qtd || l.qty || 1;
              const d = this.state.rawDrops[k] || (this.state.rawDrops[k] = { id: l.itemId || l.id || 0, name: l.nome || '', qty: 0 });
              d.qty += q;
              this.state.drops[k] = { id: l.itemId || l.id || 0, name: l.nome || '', qty: d.qty };
              if (l.itemId != null) {
                const cur = Number(this.state.invMap[l.itemId]) || 0;
                this.state.invMap[l.itemId] = cur + q;
              }
            }
          }
          hasChange = true;
        } else if (ev.k === 'bola') {
          this.state.a.balls = (this.state.a.balls || 0) + 1;
          if (this.state.balls > 0) this.state.balls--;
          hasChange = true;
        } else if (ev.k === 'capturado') {
          this.state.a.captures = (this.state.a.captures || 0) + 1;
          const pk = ev.pokemon || {};
          const isShiny = !!pk.shiny;
          if (isShiny) {
            this.state.a.shinyCap = (this.state.a.shinyCap || 0) + 1;
            if (!this.state.shinyLog) this.state.shinyLog = [];
            this.state.shinyLog.push({
              n: pk.nome || pk.name || '',
              sid: pk.speciesId || pk.pokeId || 0,
              cap: 1,
              t: Date.now()
            });
            if (this.state.shinyLog.length > 30) this.state.shinyLog.shift();
          }
          const ivs = pk.ivs && typeof pk.ivs === 'object' ? pk.ivs : null;
          const iv = ivs
            ? ((+ivs.hp || 0) + (+ivs.atk || 0) + (+ivs.def || 0) + (+ivs.spAtk || +ivs.spa || 0) + (+ivs.spDef || +ivs.spd || 0) + (+ivs.speed || +ivs.spe || +ivs.vel || 0))
            : (+pk.ivTotal || +pk.iv || 0);
          if (!this.state.catchLog) this.state.catchLog = [];
          this.state.catchLog.push({
            id: pk.id || null,
            n: pk.nome || pk.name || '?',
            sid: pk.speciesId || pk.pokeId || 0,
            iv,
            ivs,
            q: Number(pk.quality || pk.q || 0),
            potencia: pk.potencia != null ? Number(pk.potencia) : null,
            sh: isShiny,
            fx: false,
            t: Date.now()
          });
          if (this.state.catchLog.length > 50) this.state.catchLog.shift();
          hasChange = true;
        }
      }
    }

    // 4. Estado contínuo
    else if (m.t === 'estado') {
      const est = m.estado || {};
      const trainer = est.eu || est;
      if (trainer.gold != null || est.gold != null) { this.state.gold = trainer.gold != null ? trainer.gold : est.gold; hasChange = true; }
      if (trainer.diamonds != null || est.diamonds != null) { this.state.diamonds = trainer.diamonds != null ? trainer.diamonds : est.diamonds; hasChange = true; }
      if (trainer.orbs != null || trainer.gemas != null || est.orbs != null || est.gemas != null) {
        this.state.gemas = trainer.orbs != null ? trainer.orbs : (trainer.gemas != null ? trainer.gemas : (est.orbs != null ? est.orbs : est.gemas));
        hasChange = true;
      }
      if (trainer.level != null || est.level != null) { this.state.level = trainer.level != null ? trainer.level : est.level; hasChange = true; }
      const xpVal = trainer.xp != null ? trainer.xp : (trainer.exp != null ? trainer.exp : est.xp);
      if (xpVal != null) { this.state.xp = xpVal; hasChange = true; }
      if (est.huntSlug && this.state.hunt !== est.huntSlug) { this.state.hunt = est.huntSlug; hasChange = true; }
      if (est.balls && typeof est.balls === 'object') {
        const total = Object.values(est.balls).reduce((sum, v) => sum + (+v || 0), 0);
        this.state.balls = total;
        hasChange = true;
      }
      if (est.items && typeof est.items === 'object') {
        this.state.invMap = Object.assign({}, this.state.invMap, est.items);
        hasChange = true;
      }
      if (est.twitch && typeof est.twitch === 'object') {
        this.state.twitch = Object.assign(this.state.twitch || {}, est.twitch);
        hasChange = true;
      }
      if (est.kick && typeof est.kick === 'object') {
        this.state.kick = Object.assign(this.state.kick || {}, est.kick);
        hasChange = true;
      }
      if (Array.isArray(est.pkMud) && Array.isArray(this.state.team)) {
        for (const pk of est.pkMud) {
          const match = this.state.team.find(p => p.id === pk.id);
          if (match) {
            if (pk.level != null) match.level = pk.level;
            if (pk.hp != null) match.hp = pk.hp;
          }
        }
        hasChange = true;
      }
    }

    // 5. Catch result
    else if (m.type === 'catch-result') {
      this.state.a.balls = (this.state.a.balls || 0) + 1;
      if (m.success) {
        this.state.a.captures = (this.state.a.captures || 0) + 1;
      }
      hasChange = true;
    }

    if (hasChange) {
      this.emit('update', { index: this.index, state: this.getState() });
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === 1) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(payload);
      return true;
    }
    return false;
  }

  changeHunt(slug) {
    return this.send({ type: 'enter-hunt', t: 'hunt.select', slug });
  }

  throwBall(ballId) {
    return this.send({ t: 'ball.throw', ballId });
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.huntInterval) {
      clearInterval(this.huntInterval);
      this.huntInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        if (this.ws.readyState === 0 || this.ws.readyState === 1) {
          this.ws.close();
        }
      } catch {}
      this.ws = null;
    }
  }

  disconnect() {
    this.cleanup();
    this.status = 'disconnected';
    this.emit('status', { index: this.index, status: this.status });
  }
}

class GameHeadlessManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // index -> PokeIdleHeadlessClient
  }

  start(accountIndex, options = {}) {
    this.stop(accountIndex);
    const client = new PokeIdleHeadlessClient(accountIndex, options);
    this.clients.set(accountIndex, client);

    client.on('update', data => this.emit('update', data));
    client.on('status', data => this.emit('status', data));
    client.on('error', data => this.emit('error', data));

    client.connect();
    return client;
  }

  stop(accountIndex) {
    const existing = this.clients.get(accountIndex);
    if (existing) {
      existing.disconnect();
      this.clients.delete(accountIndex);
      return true;
    }
    return false;
  }

  stopAll() {
    for (const [idx] of this.clients) {
      this.stop(idx);
    }
  }

  getClient(accountIndex) {
    return this.clients.get(accountIndex) || null;
  }

  getStatus(accountIndex) {
    const client = this.getClient(accountIndex);
    if (!client) {
      return { active: false, status: 'disconnected', state: null };
    }
    return {
      active: true,
      status: client.status,
      state: client.getState()
    };
  }

  isMasterBlasterActive(accountIndex) {
    const client = this.getClient(accountIndex);
    return !!(client && client.status === 'connected');
  }
}

const gameHeadlessManager = new GameHeadlessManager();

module.exports = {
  PokeIdleHeadlessClient,
  GameHeadlessManager,
  gameHeadlessManager
};
