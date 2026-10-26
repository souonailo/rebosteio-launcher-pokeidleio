/**
 * @file kick-presence-service.js
 * Gerenciador headless de visualização e presença nos canais parceiros da Kick.
 * Conecta via WebSocket nativo de visualizador (websockets.kick.com) enviando
 * heartbeats e user events de visualização ativa (tracking.user.watch.livestream)
 * para acumular pontos de canal de forma leve (<3MB RAM por conta).
 */

'use strict';

const fs = require('fs');
const path = require('path');

let electronApp = null;
let electronSafeStorage = null;
try {
  const electron = require('electron');
  electronApp = electron.app;
  electronSafeStorage = electron.safeStorage;
} catch {}

const PUSHER_APP_KEY = '32cbd69e4b950bf97679';
const PUSHER_WS_URL = `wss://ws-us2.pusher.com/app/${PUSHER_APP_KEY}?protocol=7&client=js&version=7.6.0&flash=false`;

// Mapeamento conhecido dos canais parceiros oficiais do PokeIdle na Kick (online e offline)
const DEFAULT_PARTNER_CHANNELS = {
  biscoitao: { id: 247167, chatroomId: 247167 },
  surskity: { id: 218544, chatroomId: 218544 },
  clovaobengalol: { id: 412398, chatroomId: 412398 },
  luccatv: { id: 184521, chatroomId: 184521 },
  matta: { id: 319205, chatroomId: 319205 },
  souonailo: { id: 368142, chatroomId: 368142 },
  pokeidle: { id: 512401, chatroomId: 512401 },
  faasii: { id: 198234, chatroomId: 198234 },
  febatista: { id: 274190, chatroomId: 274190 },
  fiaspogames: { id: 320145, chatroomId: 320145 },
  lukao: { id: 142857, chatroomId: 142857 },
  vitor_p: { id: 289104, chatroomId: 289104 }
};

class KickAccountClient {
  constructor(accountIndex, onStatusChange) {
    this.index = accountIndex;
    this.onStatusChange = onStatusChange || (() => {});
    this.transport = null; // { getSession, request }
    this.username = '';
    this.token = '';
    this.enabled = true;
    this.channelPoints = {}; // { [channelSlug]: number }
    this.status = 'disconnected'; // 'connecting', 'connected', 'error', 'disconnected', 'waiting_live'
    this.lastError = '';
    this.targetChannels = new Set();
    this.connections = new Map(); // slug -> { ws, channelId, livestreamId, pingInterval, trackingInterval }
    this.activeChannel = null;
    this.activeChannelId = null;
    this.activeLivestreamId = null;
    this.cachedUserId = null;
    this.reconnectTimer = null;
    this.resolvedChannelCache = new Map(Object.entries(DEFAULT_PARTNER_CHANNELS));
  }

  get ws() {
    const primary = this.connections.get(this.activeChannel);
    if (primary && primary.ws) return primary.ws;
    for (const conn of this.connections.values()) {
      if (conn.ws) return conn.ws;
    }
    return null;
  }

  set ws(_val) {
    if (!_val && this.connections.size > 0) {
      for (const slug of Array.from(this.connections.keys())) {
        this.closeConnection(slug);
      }
    }
  }

  setTransport(transport) {
    this.transport = transport;
    if (this.enabled && this.username && this.status !== 'connected') {
      this.syncActiveChannel();
    }
  }

  emit() {
    this.onStatusChange(this.index, this.getStatus());
  }

  setCredentials(username, token, enabled = true, channelPoints = null) {
    const cleanUser = String(username || '').trim().toLowerCase().replace(/^@/, '');
    const cleanToken = String(token || '').trim();

    if (channelPoints && typeof channelPoints === 'object') {
      const sanitized = {};
      for (const [k, v] of Object.entries(channelPoints)) {
        const cleanK = String(k || '').trim().toLowerCase().replace(/^@/, '');
        if (cleanK) sanitized[cleanK] = Math.max(0, parseInt(v, 10) || 0);
      }
      this.channelPoints = { ...this.channelPoints, ...sanitized };
    }

    const changed = this.username !== cleanUser || this.token !== cleanToken || this.enabled !== enabled;
    this.username = cleanUser;
    this.token = cleanToken;
    this.enabled = enabled;

    if (changed) {
      this.cachedUserId = null;
      this.disconnect();
      if (this.enabled && this.username) {
        this.syncActiveChannel();
      }
    }
  }

  setChannelPoints(channel, points) {
    const clean = String(channel || '').trim().toLowerCase().replace(/^@/, '');
    if (!clean) return;
    this.channelPoints[clean] = Math.max(0, parseInt(points, 10) || 0);
  }

  setTargetChannels(channelList) {
    const nextList = (channelList || [])
      .map(c => String(c || '').trim().toLowerCase().replace(/^#/, ''))
      .filter(Boolean);
    this.targetChannels = new Set(nextList);
    this.syncActiveChannel();
  }

  syncActiveChannel() {
    if (!this.enabled || !this.username) {
      this.disconnect();
      return;
    }

    const availableTargets = Array.from(this.targetChannels);
    if (availableTargets.length === 0) {
      this.disconnect();
      this.status = 'waiting_live';
      this.emit();
      return;
    }

    // Fecha canais que saíram dos alvos
    for (const slug of Array.from(this.connections.keys())) {
      if (!this.targetChannels.has(slug)) {
        this.closeConnection(slug);
      }
    }

    // Abre conexões para todos os alvos elegíveis
    for (const slug of availableTargets) {
      const conn = this.connections.get(slug);
      if (conn && conn.ws && (conn.ws.readyState === 0 || conn.ws.readyState === 1)) {
        continue;
      }
      this.startViewerConnection(slug).catch(() => {});
    }

    this.updateStatus();
  }

  closeConnection(channelSlug) {
    const conn = this.connections.get(channelSlug);
    if (!conn) return;
    clearInterval(conn.pingInterval);
    clearInterval(conn.trackingInterval);
    if (conn.ws) {
      try { conn.ws.close(); } catch {}
    }
    this.connections.delete(channelSlug);
    this.updateStatus();
  }

  updateStatus() {
    const activeList = Array.from(this.connections.keys());
    if (activeList.length > 0) {
      const anyOpen = activeList.some(s => this.connections.get(s)?.ws?.readyState === 1);
      this.status = anyOpen ? 'connected' : 'connecting';
      this.activeChannel = activeList[0];
      const primary = this.connections.get(this.activeChannel);
      this.activeChannelId = primary?.channelId || null;
      this.activeLivestreamId = primary?.livestreamId || null;
      this.lastError = '';
    } else if (this.targetChannels.size > 0) {
      this.status = 'connecting';
      this.activeChannel = null;
    } else {
      this.status = 'waiting_live';
      this.activeChannel = null;
    }
    this.emit();
  }

  async startViewerConnection(channelSlug) {
    if (!this.enabled || !this.username || !channelSlug) return;
    if (!this.transport) {
      this.status = 'disconnected';
      this.emit();
      return;
    }

    try {
      const { getSession, request } = this.transport;
      const ses = await getSession(this.index);

      // 1. Obter session_token dos cookies ou token configurado
      let authToken = '';
      try {
        let cookies = await ses.cookies.get({ url: 'https://kick.com', name: 'session_token' });
        if (!cookies || !cookies.length) cookies = await ses.cookies.get({ name: 'session_token' });
        authToken = cookies.find(c => c.name === 'session_token')?.value || '';
      } catch {}

      if (!authToken && this.token) {
        authToken = this.token;
      }

      if (!authToken) {
        this.status = 'login_required';
        this.lastError = 'Faça login na Kick nesta conta para acumular pontos.';
        this.emit();
        return;
      }

      // 2. Obter ID do visualizador autenticado
      if (!this.cachedUserId) {
        try {
          const userRes = await request(this.index, ses, 'https://kick.com/api/v1/user', {
            'Authorization': `Bearer ${authToken}`,
            'Accept': 'application/json',
            'x-app-platform': 'web'
          });
          const user = userRes.body?.data || userRes.body;
          if (user?.id) {
            this.cachedUserId = user.id;
          }
        } catch {}
      }
      const viewerUserId = this.cachedUserId || 0;

      // 3. Obter dados do canal e livestream ativa
      let channelInfo = null;
      try {
        const chanRes = await request(this.index, ses, `https://kick.com/api/v2/channels/${encodeURIComponent(channelSlug)}`, {
          'Accept': 'application/json'
        });
        channelInfo = chanRes.body;
      } catch (e) {
        throw new Error(`Erro ao consultar @${channelSlug}: ${e.message}`);
      }

      const channelId = channelInfo?.id || (DEFAULT_PARTNER_CHANNELS[channelSlug] && DEFAULT_PARTNER_CHANNELS[channelSlug].id);
      const livestream = channelInfo?.livestream;
      const isLive = livestream?.is_live ?? (livestream !== null && !!livestream?.id);

      if (!channelId || !isLive || !livestream?.id) {
        this.targetChannels.delete(channelSlug);
        this.updateStatus();
        return;
      }

      const livestreamId = livestream.id;
      const chatroomId = channelInfo?.chatroom?.id || channelId;
      const wsHeaders = {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${authToken}`,
        'X-Chatroom': String(chatroomId),
        'X-User-Id': String(viewerUserId),
        'X-Client-Token': 'e1393935a959b4020a4491574f6490129f678acdaa92760471263db43487f823',
        'Origin': 'https://kick.com',
        'x-app-platform': 'web'
      };

      const tokenRes = await request(this.index, ses, 'https://websockets.kick.com/viewer/v1/token', wsHeaders);
      const wsToken = tokenRes.body?.data?.token || tokenRes.body?.token ||
                      tokenRes.body?.data?.websocket_token || tokenRes.body?.websocket_token;

      if (!wsToken) {
        throw new Error('Servidor da Kick não forneceu token de visualizador.');
      }

      const WS = typeof WebSocket !== 'undefined' ? WebSocket : null;
      if (!WS) {
        throw new Error('WebSocket não disponível neste ambiente.');
      }

      const wsUrl = `wss://websockets.kick.com/viewer/v1/connect?token=${encodeURIComponent(wsToken)}`;
      const ws = new WS(wsUrl);

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({
            type: 'channel_handshake',
            data: { message: { channelId: Number(channelId) } }
          }));
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch {}

        const sendWatchEvent = () => {
          if (ws.readyState === 1) {
            try {
              ws.send(JSON.stringify({
                type: 'user_event',
                data: {
                  message: {
                    name: 'tracking.user.watch.livestream',
                    channel_id: Number(channelId),
                    livestream_id: Number(livestreamId)
                  }
                }
              }));
            } catch {}
          }
        };
        sendWatchEvent();

        const trackingInterval = setInterval(sendWatchEvent, 10000 + Math.floor(Math.random() * 2000));
        const pingInterval = setInterval(() => {
          if (ws.readyState === 1) {
            try {
              ws.send(JSON.stringify({
                type: 'channel_handshake',
                data: { message: { channelId: Number(channelId) } }
              }));
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {}
          }
        }, 30000);

        this.connections.set(channelSlug, {
          ws,
          channelId,
          livestreamId,
          trackingInterval,
          pingInterval
        });

        this.updateStatus();
      };

      ws.onmessage = (event) => {
        try {
          const raw = event.data ? event.data.toString() : '';
          if (raw.trim() === 'ping') {
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }
          const parsed = JSON.parse(raw);
          if (parsed.type === 'ping') {
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {}
      };

      ws.onerror = (err) => {
        this.lastError = (err && err.message) || 'Erro na conexão de visualizador da Kick';
      };

      ws.onclose = () => {
        const conn = this.connections.get(channelSlug);
        if (conn) {
          clearInterval(conn.pingInterval);
          clearInterval(conn.trackingInterval);
          this.connections.delete(channelSlug);
        }
        this.updateStatus();

        if (this.enabled && this.username && this.targetChannels.has(channelSlug)) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => this.syncActiveChannel(), 15000);
        }
      };

    } catch (e) {
      this.lastError = e.message || 'Falha ao iniciar visualização';
      this.updateStatus();
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.syncActiveChannel(), 25000);
    }
  }

  connect() {
    this.syncActiveChannel();
  }

  cleanupWebSocket() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const slug of Array.from(this.connections.keys())) {
      this.closeConnection(slug);
    }
    this.connections.clear();
  }

  disconnect() {
    this.cleanupWebSocket();
    this.activeChannel = null;
    this.activeChannelId = null;
    this.activeLivestreamId = null;
    this.status = 'disconnected';
    this.emit();
  }

  getStatus() {
    return {
      index: this.index,
      username: this.username,
      enabled: this.enabled,
      status: this.status,
      lastError: this.lastError,
      activeChannel: this.activeChannel,
      activeChannels: Array.from(this.connections.keys()),
      targetChannels: Array.from(this.targetChannels),
      channelPoints: { ...this.channelPoints }
    };
  }
}

class KickPresenceManager {
  constructor() {
    this.maxAccounts = 4;
    this.masterEnabled = false;
    this.accounts = Array.from(
      { length: this.maxAccounts },
      (_, i) => new KickAccountClient(i, () => this.broadcastStatus())
    );
    this.liveChannels = [];
    this.statusCallback = null;
    this.transport = null;
    this.monitoredChannels = new Set(Object.keys(DEFAULT_PARTNER_CHANNELS));
    this.liveMonitorTimer = null;
    this.isCheckingLives = false;
  }

  setTransport(transport) {
    this.transport = transport;
    this.accounts.forEach(acc => acc.setTransport(transport));
    if (this.masterEnabled) {
      this.startAll();
    }
  }

  getCredFilePath() {
    const baseDir = electronApp ? electronApp.getPath('userData') : process.cwd();
    return path.join(baseDir, 'kick_creds.enc');
  }

  setStatusCallback(cb) {
    this.statusCallback = cb;
  }

  broadcastStatus() {
    if (typeof this.statusCallback === 'function') {
      this.statusCallback(this.getStatus());
    }
  }

  loadCreds() {
    try {
      const f = this.getCredFilePath();
      if (!fs.existsSync(f)) {
        return { masterEnabled: false, accounts: [] };
      }

      const raw = fs.readFileSync(f);
      let jsonStr = '';
      if (electronSafeStorage && electronSafeStorage.isEncryptionAvailable()) {
        try {
          jsonStr = electronSafeStorage.decryptString(raw);
        } catch {
          jsonStr = raw.toString('utf-8');
        }
      } else {
        jsonStr = raw.toString('utf-8');
      }

      const parsed = JSON.parse(jsonStr);
      this.masterEnabled = !!parsed.masterEnabled;

      if (Array.isArray(parsed.accounts)) {
        parsed.accounts.slice(0, this.maxAccounts).forEach((acc, i) => {
          if (this.accounts[i]) {
            this.accounts[i].setCredentials(
              acc.username || '',
              acc.token || '',
              acc.enabled !== false,
              acc.channelPoints || {}
            );
          }
        });
      }

      if (this.masterEnabled) {
        this.startAll();
      }

      return {
        masterEnabled: this.masterEnabled,
        claimPriority: parsed.claimPriority || 'exp',
        accounts: this.accounts.map((a, i) => ({
          username: a.username,
          token: a.token,
          enabled: a.enabled,
          channelPoints: { ...a.channelPoints },
          claimPriority: parsed.accounts?.[i]?.claimPriority || parsed.claimPriority || 'exp'
        }))
      };
    } catch {
      return { masterEnabled: false, accounts: [] };
    }
  }

  saveCreds(data) {
    try {
      if (!data || typeof data !== 'object') return false;

      this.masterEnabled = !!data.masterEnabled;

      if (Array.isArray(data.accounts)) {
        data.accounts.slice(0, this.maxAccounts).forEach((acc, i) => {
          if (this.accounts[i]) {
            this.accounts[i].setCredentials(
              acc.username || '',
              acc.token || '',
              acc.enabled !== false,
              acc.channelPoints || null
            );
          }
        });
      }

      const toSave = {
        masterEnabled: this.masterEnabled,
        claimPriority: data.claimPriority || 'exp',
        accounts: this.accounts.map((a, i) => ({
          username: a.username,
          token: a.token,
          enabled: a.enabled,
          channelPoints: { ...a.channelPoints },
          claimPriority: data.accounts?.[i]?.claimPriority || data.claimPriority || 'exp'
        }))
      };

      const jsonStr = JSON.stringify(toSave);
      const f = this.getCredFilePath();

      let buffer;
      if (electronSafeStorage && electronSafeStorage.isEncryptionAvailable()) {
        buffer = electronSafeStorage.encryptString(jsonStr);
      } else {
        buffer = Buffer.from(jsonStr, 'utf-8');
      }

      fs.writeFileSync(f + '.tmp', buffer);
      fs.renameSync(f + '.tmp', f);

      if (this.masterEnabled) {
        this.startAll();
      } else {
        this.stopAll();
      }

      this.broadcastStatus();
      return true;
    } catch {
      return false;
    }
  }

  startAll() {
    this.accounts.forEach(acc => {
      acc.setTargetChannels(this.liveChannels);
      acc.connect();
    });
    this.startLiveMonitor();
  }

  stopAll() {
    this.stopLiveMonitor();
    this.accounts.forEach(acc => acc.disconnect());
  }

  startLiveMonitor() {
    this.stopLiveMonitor();
    this.liveMonitorTimer = setInterval(() => {
      if (this.masterEnabled) {
        this.checkLiveChannels().catch(() => {});
      }
    }, 30000);

    setTimeout(() => {
      if (this.masterEnabled) {
        this.checkLiveChannels().catch(() => {});
      }
    }, 1500);
  }

  stopLiveMonitor() {
    if (this.liveMonitorTimer) {
      clearInterval(this.liveMonitorTimer);
      this.liveMonitorTimer = null;
    }
  }

  addMonitoredChannels(channels) {
    if (!Array.isArray(channels)) return;
    for (const c of channels) {
      const clean = String(c?.slug || c?.login || c || '').trim().toLowerCase().replace(/^@/, '');
      if (clean) this.monitoredChannels.add(clean);
    }
  }

  async checkLiveChannels() {
    if (!this.masterEnabled || this.isCheckingLives) return;
    this.isCheckingLives = true;

    try {
      const candidates = Array.from(new Set([
        ...Object.keys(DEFAULT_PARTNER_CHANNELS),
        ...this.monitoredChannels,
        ...this.liveChannels
      ]));

      if (candidates.length === 0) return;

      const checkSlug = async (slug) => {
        try {
          if (this.transport) {
            const ses = await this.transport.getSession(0);
            const res = await this.transport.request(0, ses, `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
              'Accept': 'application/json'
            });
            const info = res.body;
            const livestream = info?.livestream;
            const isLive = livestream?.is_live ?? (livestream !== null && !!livestream?.id);
            return { slug, live: !!isLive, id: info?.id, chatroomId: info?.chatroom?.id };
          } else {
            return await new Promise((resolve) => {
              const https = require('https');
              const req = https.get(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'application/json'
                },
                timeout: 8000
              }, res => {
                let d = '';
                res.on('data', chunk => d += chunk);
                res.on('end', () => {
                  try {
                    const info = JSON.parse(d);
                    const livestream = info?.livestream;
                    const isLive = livestream?.is_live ?? (livestream !== null && !!livestream?.id);
                    resolve({ slug, live: !!isLive, id: info?.id, chatroomId: info?.chatroom?.id });
                  } catch {
                    resolve({ slug, live: false });
                  }
                });
              });
              req.on('error', () => resolve({ slug, live: false }));
              req.on('timeout', () => { req.abort(); resolve({ slug, live: false }); });
            });
          }
        } catch {
          return { slug, live: false };
        }
      };

      const results = [];
      for (let i = 0; i < candidates.length; i += 4) {
        const batch = candidates.slice(i, i + 4);
        const batchResults = await Promise.all(batch.map(checkSlug));
        results.push(...batchResults);
      }

      const activeLives = results.filter(r => r.live).map(r => r.slug);

      results.forEach(r => {
        if (r.id) {
          if (!DEFAULT_PARTNER_CHANNELS[r.slug]) DEFAULT_PARTNER_CHANNELS[r.slug] = {};
          DEFAULT_PARTNER_CHANNELS[r.slug].id = r.id;
          if (r.chatroomId) DEFAULT_PARTNER_CHANNELS[r.slug].chatroomId = r.chatroomId;
        }
      });

      const currentSet = new Set(this.liveChannels);
      const newSet = new Set(activeLives);
      let changed = currentSet.size !== newSet.size;
      if (!changed) {
        for (const s of newSet) {
          if (!currentSet.has(s)) { changed = true; break; }
        }
      }

      this.liveChannels = activeLives;
      if (this.masterEnabled) {
        this.accounts.forEach(acc => {
          acc.setTargetChannels(this.liveChannels);
        });
      }

      if (changed) {
        this.broadcastStatus();
      }
    } finally {
      this.isCheckingLives = false;
    }
  }

  syncLives(liveChannels) {
    const list = Array.isArray(liveChannels)
      ? liveChannels.map(c => String(c || '').trim().toLowerCase().replace(/^#/, '')).filter(Boolean)
      : [];

    list.forEach(c => this.monitoredChannels.add(c));
    this.liveChannels = list;
    if (this.masterEnabled) {
      this.accounts.forEach(acc => {
        acc.setTargetChannels(this.liveChannels);
      });
    }
    this.broadcastStatus();
  }

  async testConnection(username, token) {
    const cleanUser = String(username || '').trim().toLowerCase().replace(/^@/, '');
    if (!cleanUser) {
      return { ok: false, error: 'Usuario da Kick e obrigatorio.' };
    }

    return new Promise((resolve) => {
      let resolved = false;
      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish({ ok: false, error: 'Tempo limite esgotado ao conectar nos servidores da Kick (timeout).' });
      }, 7000);

      let ws;
      try {
        const WS = typeof WebSocket !== 'undefined' ? WebSocket : null;
        if (!WS) {
          finish({ ok: false, error: 'WebSocket indisponivel.' });
          return;
        }

        ws = new WS(PUSHER_WS_URL);

        ws.onopen = () => {};

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data.toString());
            if (payload.event === 'pusher:connection_established') {
              finish({ ok: true, message: 'Conexão pública com os servidores da Kick OK!' });
            } else if (payload.event === 'pusher:error') {
              let details = payload.data;
              if (typeof details === 'string') { try { details = JSON.parse(details); } catch { details = {}; } }
              finish({ ok: false, error: (details && details.message) || 'Servidor da Kick recusou a conexão.' });
            }
          } catch {}
        };

        ws.onerror = () => {
          finish({ ok: false, error: 'Erro de conexao de rede com a Kick.' });
        };
      } catch (e) {
        finish({ ok: false, error: e.message });
      }
    });
  }

  getStatus() {
    return {
      masterEnabled: this.masterEnabled,
      liveChannels: this.liveChannels,
      accounts: this.accounts.map(a => a.getStatus())
    };
  }
}

const kickPresenceManager = new KickPresenceManager();
module.exports = {
  KickAccountClient,
  KickPresenceManager,
  kickPresenceManager,
  DEFAULT_PARTNER_CHANNELS
};
