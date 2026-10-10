'use strict';

// Telemetria de memoria (estudo de caso de RAM). Desligada por padrao: so liga com
// --mem-probe ou PIO_MEM_PROBE=1. Grava uma linha JSON por amostra em userData/mem-*.jsonl.
// Unidades: app.getAppMetrics() devolve KB; aqui tudo vira MB com 1 casa.

const path = require('path');
const fs = require('fs');

const mb = (kb) => Math.round((Number(kb) || 0) / 102.4) / 10;

function parseArgs(argv, env) {
  const get = (name) => {
    const hit = argv.find((a) => a.startsWith('--' + name + '='));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  const enabled = argv.includes('--mem-probe') || env.PIO_MEM_PROBE === '1';
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
  return {
    enabled,
    intervalMs: num(get('mem-interval') || env.PIO_MEM_INTERVAL, 10) * 1000,
    trayAfterMs: num(get('mem-tray-after') || env.PIO_MEM_TRAY_AFTER, 0) * 1000,
    showAfterMs: num(get('mem-show-after') || env.PIO_MEM_SHOW_AFTER, 0) * 1000,
    durationMs: num(get('mem-duration') || env.PIO_MEM_DURATION, 0) * 1000,
    tag: String(get('mem-tag') || env.PIO_MEM_TAG || '').replace(/[^\w.-]/g, '').slice(0, 40)
  };
}

// Experimentos de memoria: lista separada por virgula em PIO_EXP ou --exp=E1,E3
function parseExperiments(argv, env) {
  const hit = argv.find((a) => a.startsWith('--exp='));
  const raw = (hit ? hit.slice(6) : env.PIO_EXP) || '';
  return new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^E\d{1,2}$/.test(s)));
}

// Rotula cada PID: browser/gpu/utility pelo tipo; renderers pelo webContents dono
// (janela principal = host, webview = conta N pela pasta da particao persist:contaN).
function labelProcesses(webContentsList) {
  const byPid = new Map();
  for (const wc of webContentsList) {
    try {
      if (wc.isDestroyed()) continue;
      const pid = wc.getOSProcessId();
      if (!pid) continue;
      let label;
      if (wc.getType() === 'webview') {
        const sp = (wc.session && wc.session.storagePath) || '';
        const m = /conta(\d+)/i.exec(path.basename(sp));
        label = m ? 'conta' + m[1] : 'webview';
      } else if (wc.getType() === 'window') label = 'host';
      else label = wc.getType();
      const prev = byPid.get(pid);
      byPid.set(pid, prev && prev !== label ? prev + '+' + label : label);
      // iframes de outra origem (site isolation) rodam em processo proprio: rotula pelo host
      try {
        for (const f of (wc.mainFrame && wc.mainFrame.framesInSubtree) || []) {
          const fp = f.osProcessId;
          if (!fp || fp === pid || byPid.has(fp)) continue;
          let host = '?'; try { host = new URL(f.url || f.origin).hostname || f.origin; } catch {}
          byPid.set(fp, label + ':iframe:' + host);
        }
      } catch {}
    } catch {}
  }
  return byPid;
}

function sample(metrics, labels, extra) {
  const procs = metrics.map((m) => {
    const mem = m.memory || {};
    return {
      pid: m.pid,
      type: m.type,
      label: labels.get(m.pid) || (m.type === 'Tab' ? 'renderer-orfao' : m.type),
      priv: mb(mem.privateBytes != null ? mem.privateBytes : mem.workingSetSize),
      ws: mb(mem.workingSetSize),
      cpu: Math.round(((m.cpu && m.cpu.percentCPUUsage) || 0) * 10) / 10
    };
  });
  const totalPriv = Math.round(procs.reduce((s, p) => s + p.priv, 0) * 10) / 10;
  const totalWs = Math.round(procs.reduce((s, p) => s + p.ws, 0) * 10) / 10;
  return { t: Date.now(), ...extra, totalPriv, totalWs, n: procs.length, procs };
}

// Leitura de dentro de cada pagina: heap JS (performance.memory, preciso com
// --enable-precise-memory-info), DOM, canvases, imagens e o tamanho do coletor window.__poke.
// So leitura; JSON.stringify das partes grandes roda no maximo 1x por minuto por painel.
const INNER_JS = `(()=>{const m=performance.memory||{};const P=window.__poke||{};
const sz=o=>{try{return o==null?0:JSON.stringify(o).length}catch(e){return -1}};
const X=window.PIXI;let tex=-1;try{const c=X&&((X.utils&&X.utils.TextureCache)||(X.Cache&&X.Cache._cache));tex=c?(c instanceof Map?c.size:Object.keys(c).length):-1}catch(e){}
return{heap:Math.round((m.usedJSHeapSize||0)/1048576),heapTot:Math.round((m.totalJSHeapSize||0)/1048576),
dom:document.getElementsByTagName('*').length,cv:document.getElementsByTagName('canvas').length,img:document.images.length,tex,
pApi:sz(P.api),pWs:sz(P.ws),pPm:Object.keys(P.pokemonsMap||{}).length,pKp:Object.keys(P.knownPokes||{}).length,
pCr:(P.creatures||[]).length,pEst:sz(P.estado),ultra:!!window.__pgUltraActive,eco:(window.__eco&&window.__eco.fps)||0,
kills:(P.sess&&P.sess.kills)||0,an:(P.ws&&P.ws.analyzer&&(P.ws.analyzer.kills!=null?P.ws.analyzer.kills:(P.ws.analyzer.a&&P.ws.analyzer.a.kills)))||0,
sk:!!(P.sock&&P.sock.readyState===1),glLost:[...document.getElementsByTagName('canvas')].filter(c=>{try{const g=c.getContext('webgl2')||c.getContext('webgl');return g&&g.isContextLost()}catch(e){return false}}).length,
ifr:document.getElementsByTagName('iframe').length,ts:!!window.turnstile,
push:typeof lastPush!=='undefined'?lastPush.map(t=>t?Math.round((Date.now()-t)/1000):-1):undefined,url:location.pathname}})()`;

function createMemoryProbe({ app, webContents, opts, experiments, getState, onTrayAfter, onShowAfter, onDuration }) {
  let timer = null, file = null, startedAt = 0, nTick = 0;
  const timers = [];
  async function inner(list) {
    const out = {};
    await Promise.all(list.map(async (wc) => {
      try {
        if (wc.isDestroyed()) return;
        const type = wc.getType();
        if (type !== 'webview' && type !== 'window') return;
        let key = 'host';
        if (type === 'webview') { const m = /conta(\d+)/i.exec(path.basename((wc.session && wc.session.storagePath) || '')); key = m ? 'conta' + m[1] : 'webview' + wc.id; }
        const url = wc.getURL() || '';
        if (!url || url === 'about:blank') return;
        out[key] = await Promise.race([wc.executeJavaScript(INNER_JS), new Promise((r) => setTimeout(() => r({ timeout: true }), 5000))]);
      } catch (e) { /* painel recarregando */ }
    }));
    return out;
  }
  function tick() {
    const deep = nTick++ % Math.max(1, Math.round(60000 / opts.intervalMs)) === 0;
    try {
      const all = webContents.getAllWebContents();
      const labels = labelProcesses(all);
      const st = (getState && getState()) || {};
      const row = sample(app.getAppMetrics(), labels, {
        s: Math.round((Date.now() - startedAt) / 1000),
        exp: [...experiments].sort().join(',') || 'base',
        ...st
      });
      if (!deep) { fs.appendFileSync(file, JSON.stringify(row) + '\n'); return; }
      inner(all).then((pages) => { row.pages = pages; }).catch(() => {}).finally(() => {
        try { fs.appendFileSync(file, JSON.stringify(row) + '\n'); } catch {}
      });
    } catch (e) { try { fs.appendFileSync(file, JSON.stringify({ t: Date.now(), erro: String(e && e.message) }) + '\n'); } catch {} }
  }
  return {
    start() {
      if (!opts.enabled || timer) return null;
      startedAt = Date.now();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const expTag = [...experiments].sort().join('_') || 'base';
      const dir = path.join(app.getPath('userData'), 'mem');
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, `mem-${stamp}-${opts.tag || expTag}.jsonl`);
      fs.writeFileSync(file, JSON.stringify({ meta: true, electron: process.versions.electron, chrome: process.versions.chrome, exp: expTag, tag: opts.tag, intervalMs: opts.intervalMs }) + '\n');
      timer = setInterval(tick, opts.intervalMs);
      setTimeout(tick, 2000);
      if (opts.trayAfterMs && onTrayAfter) timers.push(setTimeout(onTrayAfter, opts.trayAfterMs));
      if (opts.showAfterMs && onShowAfter) timers.push(setTimeout(onShowAfter, opts.showAfterMs));
      if (opts.durationMs && onDuration) timers.push(setTimeout(() => { tick(); onDuration(); }, opts.durationMs));
      return file;
    },
    stop() { clearInterval(timer); timer = null; timers.forEach(clearTimeout); },
    tick,
    get file() { return file; }
  };
}

module.exports = { createMemoryProbe, parseArgs, parseExperiments, labelProcesses, sample, mb, INNER_JS };
