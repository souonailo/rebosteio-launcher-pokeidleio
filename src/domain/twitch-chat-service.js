/**
 * @file twitch-chat-service.js
 * Gerenciador headless de presena no chat da Twitch via WebSocket IRC.
 * Mantm conexes leves (<3MB RAM por conta) apenas para ingressar nos chats
 * de streamers parceiros oficiais do PokeIdle que estejam ao vivo.
 */

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const priority = value => ['exp', 'catch', 'lure', 'all'].includes(value) ? value : 'exp';
function preferences(data = {}) {
  return {
    autoClaim: data.autoClaim === true && data.autoClaimProtocol === 1,
    autoClaimProtocol: 1,
    claimPriority: priority(data.claimPriority),
    accounts: Array.from({length:4}, (_, i) => ({
      claimPriority: priority(data.accounts?.[i]?.claimPriority || data.claimPriority),
      gameLinked: data.accounts?.[i]?.gameLinked === true,
      linkedUsername: String(data.accounts?.[i]?.linkedUsername || '')
    }))
  };
}

class TwitchAccountClient {
  constructor(accountIndex, onStatusChange) {
    this.index = accountIndex;
    this.onStatusChange = onStatusChange || (() => {});
    this.ws = null;
    this.username = '';
    this.token = '';
    this.enabled = true;
    this.status = 'disconnected'; // 'connecting', 'connected', 'error', 'disconnected'
    this.lastError = '';
    this.joinedChannels = new Set();
    this.targetChannels = new Set();
    this.reconnectTimer = null;
    this.pingInterval = null;
    this.shouldReconnect = false;
  }

  setCredentials(username, token, enabled = true) {
    const cleanUser = String(username || '').trim().toLowerCase().replace(/^@/, '');
    const cleanToken = String(token || '').trim();
    const formattedToken = cleanToken ? (cleanToken.startsWith('oauth:') ? cleanToken : `oauth:${cleanToken}`) : '';

    const changed = this.username !== cleanUser || this.token !== formattedToken || this.enabled !== enabled;
    this.username = cleanUser;
    this.token = formattedToken;
    this.enabled = enabled;

    if (changed && this.ws) {
      this.disconnect();
    }
  }

  connect() {
    if (!this.enabled || !this.username || !this.token) {
      this.status = 'disconnected';
      this.onStatusChange(this.index, this.getStatus());
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.status = 'connecting';
    this.shouldReconnect = true;
    this.lastError = '';
    this.onStatusChange(this.index, this.getStatus());

    try {
      this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

      this.ws.onopen = () => {
        this.status = 'connecting';
        this.ws.send('CAP REQ :twitch.tv/membership');
        this.ws.send(`PASS ${this.token}`);
        this.ws.send(`NICK ${this.username}`);
      };

      this.ws.onmessage = (event) => {
        const raw = event.data.toString();
        const lines = raw.split('\r\n');

        for (const line of lines) {
          if (!line) continue;

          if (line.startsWith('PING')) {
            const server = line.slice(5).trim() || ':tmi.twitch.tv';
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(`PONG ${server}`);
            }
            continue;
          }

          const welcome = line.split(/\s+/);
          if (welcome[0] === ':tmi.twitch.tv' && welcome[1] === '001' && welcome[2]?.toLowerCase() === this.username) {
            this.status = 'connected';
            this.lastError = '';
            // Reingressa em canais pendentes
            this.syncWithTargets();
            this.onStatusChange(this.index, this.getStatus());
            continue;
          }

          if (line.includes(':tmi.twitch.tv NOTICE * :Login authentication failed') || line.includes(':tmi.twitch.tv NOTICE * :Improperly formatted auth')) {
            this.status = 'error';
            this.lastError = 'Autenticao falhou (verifique o token)';
            this.disconnect();
            this.onStatusChange(this.index, this.getStatus());
            return;
          }

          // Detecta confirmacao de JOIN
          // :user!user@user.tmi.twitch.tv JOIN #canal
          const joinMatch = line.match(/^:(\w+)!\w+@\w+\.tmi\.twitch\.tv JOIN #(\w+)/i);
          if (joinMatch && joinMatch[1].toLowerCase() === this.username) {
            const ch = joinMatch[2].toLowerCase();
            this.joinedChannels.add(ch);
            this.onStatusChange(this.index, this.getStatus());
          }

          // Detecta confirmacao de PART
          const partMatch = line.match(/^:(\w+)!\w+@\w+\.tmi\.twitch\.tv PART #(\w+)/i);
          if (partMatch && partMatch[1].toLowerCase() === this.username) {
            const ch = partMatch[2].toLowerCase();
            this.joinedChannels.delete(ch);
            this.onStatusChange(this.index, this.getStatus());
          }
        }
      };

      this.ws.onerror = (err) => {
        this.lastError = 'Erro na conexo com a Twitch';
        this.status = 'error';
        this.onStatusChange(this.index, this.getStatus());
      };

      this.ws.onclose = () => {
        this.joinedChannels.clear();
        if (this.status !== 'error') {
          this.status = 'disconnected';
        }
        this.onStatusChange(this.index, this.getStatus());

        if (this.shouldReconnect && this.enabled && this.username && this.token) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => this.connect(), 15000);
        }
      };
    } catch (e) {
      this.status = 'error';
      this.lastError = e.message;
      this.onStatusChange(this.index, this.getStatus());
    }
  }

  syncWithTargets() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Join nos canais que faltam
    for (const ch of this.targetChannels) {
      if (!this.joinedChannels.has(ch)) {
        try {
          this.ws.send(`JOIN #${ch}`);
        } catch {}
      }
    }

    // Part nos canais que no esto mais no alvo
    for (const ch of this.joinedChannels) {
      if (!this.targetChannels.has(ch)) {
        try {
          this.ws.send(`PART #${ch}`);
        } catch {}
      }
    }
  }

  setTargetChannels(channelList) {
    const nextSet = new Set((channelList || []).map(c => String(c || '').trim().toLowerCase().replace(/^#/, '')).filter(Boolean));
    this.targetChannels = nextSet;
    this.syncWithTargets();
  }

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.joinedChannels.clear();
    this.status = 'disconnected';
  }

  getStatus() {
    return {
      index: this.index,
      username: this.username,
      enabled: this.enabled,
      status: this.status,
      lastError: this.lastError,
      joinedChannels: Array.from(this.joinedChannels),
      targetChannels: Array.from(this.targetChannels)
    };
  }
}

class TwitchChatManager {
  constructor() {
    this.maxAccounts = 4;
    this.masterEnabled = false;
    this.preferences = preferences();
    this.accounts = Array.from({ length: this.maxAccounts }, (_, i) => new TwitchAccountClient(i, (idx, st) => this.broadcastStatus()));
    this.liveChannels = [];
    this.statusCallback = null;
  }

  getCredFilePath() {
    return path.join(app.getPath('userData'), 'twitch_creds.enc');
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
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          jsonStr = safeStorage.decryptString(raw);
        } catch {
          jsonStr = raw.toString('utf-8');
        }
      } else {
        jsonStr = raw.toString('utf-8');
      }

      const parsed = JSON.parse(jsonStr);
      this.masterEnabled = !!parsed.masterEnabled;
      this.preferences = preferences(parsed);

      if (Array.isArray(parsed.accounts)) {
        parsed.accounts.slice(0, this.maxAccounts).forEach((acc, i) => {
          if (this.accounts[i]) {
            this.accounts[i].setCredentials(acc.username || '', acc.token || '', acc.enabled !== false);
          }
        });
      }

      if (this.masterEnabled) {
        this.startAll();
      }

      return {
        ...this.preferences,
        masterEnabled: this.masterEnabled,
        accounts: this.accounts.map((a, i) => ({
          ...this.preferences.accounts[i],
          username: a.username,
          token: a.token,
          enabled: a.enabled
        }))
      };
    } catch (e) {
      return { masterEnabled: false, accounts: [] };
    }
  }

  saveCreds(data) {
    try {
      if (!data || typeof data !== 'object') return false;

      this.masterEnabled = !!data.masterEnabled;
      this.preferences = preferences(data);

      if (Array.isArray(data.accounts)) {
        data.accounts.slice(0, this.maxAccounts).forEach((acc, i) => {
          if (this.accounts[i]) {
            this.accounts[i].setCredentials(acc.username || '', acc.token || '', acc.enabled !== false);
          }
        });
      }

      const toSave = {
        ...this.preferences,
        masterEnabled: this.masterEnabled,
        accounts: this.accounts.map((a, i) => ({
          ...this.preferences.accounts[i],
          username: a.username,
          token: a.token,
          enabled: a.enabled
        }))
      };

      const jsonStr = JSON.stringify(toSave);
      const f = this.getCredFilePath();

      let buffer;
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        buffer = safeStorage.encryptString(jsonStr);
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
    } catch (e) {
      return false;
    }
  }

  startAll() {
    if (!this.masterEnabled) return;
    this.accounts.forEach(acc => {
      acc.setTargetChannels(this.liveChannels);
      if (acc.enabled) acc.connect();
    });
  }

  stopAll() {
    this.accounts.forEach(acc => acc.disconnect());
  }

  syncLives(liveChannels) {
    const list = Array.isArray(liveChannels)
      ? liveChannels.map(c => String(c || '').trim().toLowerCase().replace(/^#/, '')).filter(Boolean)
      : [];

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
    const cleanToken = String(token || '').trim();
    const formattedToken = cleanToken ? (cleanToken.startsWith('oauth:') ? cleanToken : `oauth:${cleanToken}`) : '';

    if (!cleanUser || !formattedToken) {
      return { ok: false, error: 'Usurio e Token so obrigatrios.' };
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
        finish({ ok: false, error: 'Tempo limite esgotado ao conectar na Twitch (timeout).' });
      }, 7000);

      let ws;
      try {
        ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

        ws.onopen = () => {
          ws.send('CAP REQ :twitch.tv/membership');
          ws.send(`PASS ${formattedToken}`);
          ws.send(`NICK ${cleanUser}`);
        };

        ws.onmessage = (event) => {
          const raw = event.data.toString();
          if (raw.includes(':tmi.twitch.tv 001 ') || raw.includes('GLHF')) {
            finish({ ok: true, message: `Conectado com sucesso como @${cleanUser}!` });
          } else if (raw.includes('Login authentication failed') || raw.includes('Improperly formatted auth')) {
            finish({ ok: false, error: 'Token invlido ou sem permisso de chat.' });
          }
        };

        ws.onerror = (err) => {
          finish({ ok: false, error: 'Erro de conexo de rede com a Twitch.' });
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

const twitchChatManager = new TwitchChatManager();
module.exports = { twitchChatManager };
