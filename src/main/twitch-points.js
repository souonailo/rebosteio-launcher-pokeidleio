'use strict';

const { BrowserWindow, session, net } = require('electron');
const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const { POINTS_CATALOG_QUERY, catalog } = require('../domain/twitch-reward-catalog');
const slug = value => /^[a-z0-9_]{1,40}$/.test(String(value || '').toLowerCase()) ? String(value).toLowerCase() : '';
const empty = () => ({ status: 'disconnected', username: '', balances: {}, refreshing: false, error: '', attempts: {} });
const validIndex = i => Number.isInteger(i) && i >= 0 && i < 4;

function createTwitchPoints({ prepareSession, getProxy, onChange }) {
  let config = { masterEnabled: false, accounts: [] }, revision = 0, disposed = false;
  let channels = Array.from({ length: 4 }, () => []), lives = [];
  const states = Array.from({ length: 4 }, empty), windows = new Map(), jobs = new Set();
  const lastRefresh = Array(4).fill(0), lastWatch = Array(4).fill(0), endpointCache = new Map(), listeners = [];
  const snapshot = () => JSON.parse(JSON.stringify({ masterEnabled: !!config.masterEnabled, accounts: states }));
  const emit = () => { if (!disposed) onChange?.(snapshot()); };
  const enabled = i => config.masterEnabled && config.accounts?.[i]?.enabled !== false;
  const getSession = async i => { await prepareSession(i); return session.fromPartition('persist:conta' + (i + 1)); };
  function allowed(url) {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && (
      (u.hostname === 'gql.twitch.tv' && u.pathname === '/gql') ||
      (u.hostname === 'www.twitch.tv' && /^\/[a-z0-9_]{1,40}$/.test(u.pathname)) ||
      (['assets.twitch.tv', 'static.twitchcdn.net'].includes(u.hostname) && /^\/config\/settings[^/]*\.js$/.test(u.pathname)) ||
      (u.hostname === 'spade.twitch.tv' && u.pathname === '/track')
    );
  }
  async function request(i, url, { body, token = '', json = true } = {}) {
    if (!allowed(url)) throw new Error('Destino Twitch não permitido.');
    const ses = await getSession(i);
    return new Promise((resolve, reject) => {
      const req = net.request({ url, method: body === undefined ? 'GET' : 'POST', session: ses, useSessionCookies: true, redirect: 'manual' });
      let settled = false, size = 0; const chunks = [];
      const finish = (error, result) => {
        if (settled) return; settled = true; clearTimeout(timer);
        error ? reject(error) : resolve(result);
      };
      const timer = setTimeout(() => { finish(new Error('Consulta Twitch excedeu o tempo limite.')); req.abort(); }, 12000);
      if (new URL(url).hostname === 'gql.twitch.tv') {
        req.setHeader('Client-Id', CLIENT_ID);
        req.setHeader('Content-Type', 'application/json');
        if (token) req.setHeader('Authorization', 'OAuth ' + token);
      } else if (body !== undefined) req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
      req.on('login', (info, callback) => {
        const proxy = getProxy(i);
        if (info.isProxy && proxy?.type === 'http' && proxy.username && info.host.toLowerCase() === proxy.host && Number(info.port) === proxy.port) callback(proxy.username, proxy.password);
        else callback();
      });
      req.on('redirect', () => { finish(new Error('Redirecionamento Twitch recusado.')); req.abort(); });
      req.on('error', () => finish(new Error('Falha de rede na consulta Twitch.')));
      req.on('response', response => {
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) { finish(new Error('Resposta Twitch excedeu o limite.')); req.abort(); return; }
          chunks.push(chunk);
        });
        response.on('error', () => finish(new Error('Resposta Twitch interrompida.')));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data = text;
          if (json) { try { data = JSON.parse(text); } catch { data = null; } }
          finish(null, { status: response.statusCode, body: data });
        });
      });
      req.end(body);
    });
  }
  async function gql(i, token, payload) {
    const response = await request(i, 'https://gql.twitch.tv/gql', { body: JSON.stringify(payload), token });
    if (response.status !== 200 || !response.body?.data || response.body.errors?.length) {
      const error = new Error(response.body?.errors?.length ? 'A Twitch recusou a consulta de pontos.' : `Twitch respondeu HTTP ${response.status}.`);
      error.status = ({401:'login_required',403:'blocked',429:'rate_limited'})[response.status] || 'error';
      throw error;
    }
    return response.body.data;
  }
  async function watch(i, token, userId, channel, generation) {
    const data = await gql(i, token, { query: 'query($login: String!) { user(login: $login) { id stream { id } } }', variables: { login: channel } });
    if (!data.user?.id || !data.user.stream?.id) return { status: 'offline', at: Date.now() };
    let cached = endpointCache.get(i);
    if (!cached || Date.now() - cached.at > 900000) {
      const page = await request(i, 'https://www.twitch.tv/' + channel, { json: false });
      const settings = typeof page.body === 'string' && page.body.match(/https:\/\/(?:assets\.twitch\.tv|static\.twitchcdn\.net)\/config\/settings[^"'<>\s]*?\.js/);
      if (page.status !== 200 || !settings) throw new Error('Endpoint de acúmulo não encontrado na Twitch.');
      const file = await request(i, settings[0], { json: false });
      const endpoint = typeof file.body === 'string' && file.body.match(/"spade_url"\s*:\s*"([^"]+)"/);
      if (file.status !== 200 || !endpoint || !allowed(endpoint[1]) || new URL(endpoint[1]).hostname !== 'spade.twitch.tv') throw new Error('Endpoint de acúmulo indisponível.');
      cached = { url: endpoint[1], at: Date.now() }; endpointCache.set(i, cached);
    }
    if (disposed || revision !== generation || !enabled(i)) return { status: 'cancelled', at: Date.now() };
    const payload = [{ event: 'minute-watched', properties: {
      channel_id: data.user.id, broadcast_id: data.user.stream.id, user_id: userId,
      channel, live: true, player: 'site'
    } }];
    const body = new URLSearchParams({ data: Buffer.from(JSON.stringify(payload)).toString('base64') }).toString();
    const response = await request(i, cached.url, { body, json: false });
    return { status: response.status >= 200 && response.status < 300 ? 'sent' : 'rejected', httpStatus: response.status, at: Date.now() };
  }
  async function refresh(i, force = false) {
    if (!validIndex(i)) throw new Error('Conta Twitch inválida.');
    if (disposed || jobs.has(i) || (!force && !enabled(i)) || Date.now() - lastRefresh[i] < (force ? 5000 : 55000)) return snapshot();
    lastRefresh[i] = Date.now(); jobs.add(i);
    const generation = revision;
    const next = JSON.parse(JSON.stringify(states[i])); next.refreshing = true;
    states[i].refreshing = true; emit();
    try {
      const ses = await getSession(i);
      const cookies = await ses.cookies.get({ url: 'https://www.twitch.tv', name: 'auth-token' });
      const token = cookies[0]?.value;
      if (!token) throw Object.assign(new Error('Entre na Twitch nesta conta.'), {status:'login_required'});
      const identity = await gql(i, token, { query: 'query { currentUser { id login } }' });
      const user = identity.currentUser;
      if (!user?.id || !slug(user.login)) throw Object.assign(new Error('Sessão Twitch não confirmada.'), {status:'login_required'});
      const expected = slug(config.accounts?.[i]?.username);
      if (!expected || expected !== user.login.toLowerCase()) throw Object.assign(new Error('Confira a Twitch vinculada no jogo e salve a configuração.'), {status:'account_mismatch'});
      if (next.username !== expected) next.balances = {};
      next.username = expected; next.status = 'authenticated'; next.error = '';
      const balances = {};
      for (const channel of channels[i]) {
        if (revision !== generation || disposed) break;
        const data = await gql(i, token, { query: POINTS_CATALOG_QUERY, variables: {login:channel} });
        const amount = data.user?.channel?.self?.communityPoints?.balance;
        if (Number.isSafeInteger(amount) && amount >= 0) {
          const previous = next.balances[channel];
          balances[channel] = {status:'verified',points:amount,checkedAt:Date.now(),earnedPoints:
            (previous?.earnedPoints || 0) + (previous?.status === 'verified' ? Math.max(0, amount - previous.points) : 0)};
        } else balances[channel] = {status:'unavailable',checkedAt:Date.now()};
        const rewards = data.user?.channel?.communityPointsSettings?.customRewards;
        Object.assign(balances[channel], {channelId:data.user?.id, catalogStatus:Array.isArray(rewards) ? 'verified' : 'unavailable', rewards:catalog(rewards)});
      }
      next.balances = balances;
      // Experimental submission is never treated as earned points or a game bonus.
      if (enabled(i) && revision === generation && Date.now() - lastWatch[i] >= 55000) {
        lastWatch[i] = Date.now();
        next.attempts = {};
        for (const channel of channels[i].filter(c => lives.includes(c)).slice(0, 2)) {
          try { next.attempts[channel] = await watch(i, token, user.id, channel, generation); }
          catch { next.attempts[channel] = {status:'error',at:Date.now()}; }
        }
      }
    } catch (error) {
      next.status = error.status || 'error'; next.error = error.message;
      for (const balance of Object.values(next.balances)) balance.status = 'stale';
    } finally {
      jobs.delete(i);
      if (!disposed && revision === generation) { next.refreshing = false; states[i] = next; }
      else if (!disposed) states[i].refreshing = false;
      emit();
    }
    return snapshot();
  }
  const timer = setInterval(() => { for (let i=0;i<4;i++) refresh(i).catch(()=>{}); }, 60000);
  timer.unref?.();
  return {
    getStatus: snapshot,
    configure(value) {
      const next = JSON.parse(JSON.stringify(value || {}));
      if (JSON.stringify(config) === JSON.stringify(next)) return;
      revision++; config = next;
      for (let i=0;i<4;i++) { states[i] = empty(); lastRefresh[i] = 0; }
      emit();
    },
    setChannels(value) {
      const next = Array.from({length:4},(_,i)=>[...new Set((Array.isArray(value?.[i])?value[i]:[]).map(slug).filter(Boolean))].slice(0,40));
      if (JSON.stringify(next) !== JSON.stringify(channels)) { channels=next; revision++; lastRefresh.fill(0); }
      return true;
    },
    syncLives(value) { const next=[...new Set((Array.isArray(value)?value:[]).map(slug).filter(Boolean))]; if(JSON.stringify(next)!==JSON.stringify(lives)){lives=next;revision++;} return true; },
    refresh,
    async open(i, channel='') {
      if (!validIndex(i) || (channel && !slug(channel))) throw new Error('Conta ou canal Twitch inválido.');
      const url='https://www.twitch.tv/'+slug(channel);
      let win=windows.get(i);
      if (!win || win.isDestroyed()) {
        const ses=await getSession(i);
        win=new BrowserWindow({width:1100,height:780,title:`Twitch — Conta ${i+1}`,autoHideMenuBar:true,
          webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true}});
        windows.set(i,win); win.webContents.setAudioMuted(true);
        win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
        win.webContents.on('will-navigate',(event,target)=>{if(!target.startsWith('https://'))event.preventDefault();});
        win.on('closed',()=>{windows.delete(i);lastRefresh[i]=0;refresh(i,true).catch(()=>{});});
        const cookieChanged=(_event,cookie)=>{
          if(cookie.name==='auth-token' && /(^|\.)twitch\.tv$/.test(cookie.domain)){revision++;states[i]=empty();lastRefresh[i]=0;emit();refresh(i,true).catch(()=>{});}
        };
        if (!listeners.some(entry=>entry[0]===ses)){ses.cookies.on('changed',cookieChanged);listeners.push([ses,cookieChanged]);}
      }
      await win.loadURL(url); win.show();win.focus();return true;
    },
    close(i) {if(!validIndex(i))throw new Error('Conta inválida.');windows.get(i)?.close();return true;},
    dispose(){disposed=true;revision++;clearInterval(timer);for(const [ses,listener] of listeners)ses.cookies.removeListener('changed',listener);for(const win of windows.values())if(!win.isDestroyed())win.destroy();windows.clear();}
  };
}
module.exports={createTwitchPoints};
