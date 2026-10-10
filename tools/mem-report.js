#!/usr/bin/env node
'use strict';
// Resumo das amostras de memoria (userData/mem/*.jsonl, gravadas com --mem-probe).
// Uso:
//   node tools/mem-report.js                  -> todos os arquivos de %APPDATA%\pionailo\mem
//   node tools/mem-report.js a.jsonl b.jsonl  -> arquivos especificos
//   node tools/mem-report.js --skip=120       -> ignora os primeiros 120 s de cada fase (aquecimento)
//   node tools/mem-report.js --md             -> tabela markdown (para MEMORY-CASE-STUDY.md)
// Metrica principal: soma de Private Bytes de todos os processos do app (MB).

const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const md = args.includes('--md');
const skipArg = args.find((a) => a.startsWith('--skip='));
const skipS = skipArg ? Number(skipArg.slice(7)) || 0 : 60;
let files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  const dir = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'pionailo', 'mem');
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().map((f) => path.join(dir, f)); }
  catch { console.error('Nenhum arquivo em ' + dir + '. Rode o app com --mem-probe.'); process.exit(1); }
}

const stats = (xs) => {
  if (!xs.length) return { n: 0, avg: 0, p95: 0, max: 0, last: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const r = (v) => Math.round(v);
  return { n: xs.length, avg: r(xs.reduce((a, b) => a + b, 0) / xs.length), p95: r(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]), max: r(s[s.length - 1]), last: r(xs[xs.length - 1]) };
};

function analyze(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const meta = lines.find((l) => l.meta) || {};
  const rows = lines.filter((l) => !l.meta && !l.erro && Array.isArray(l.procs));
  const phases = { visivel: rows.filter((r) => r.vis === 1), bandeja: rows.filter((r) => r.vis === 0) };
  const out = { file: path.basename(file), exp: meta.exp || '?', phases: {} };
  for (const [name, rs] of Object.entries(phases)) {
    if (!rs.length) continue;
    const t0 = rs[0].s;
    const use = rs.filter((r) => r.s - t0 >= skipS);
    const base = use.length ? use : rs;
    const byLabel = {};
    for (const r of base) {
      const agg = {};
      for (const p of r.procs) {
        const isIframe = p.label.includes(':iframe:');
        const k = isIframe ? 'iframes(soma)' : (p.label.startsWith('conta') ? 'contas(soma)' : p.label);
        agg[k] = (agg[k] || 0) + p.priv;
        if (p.label.startsWith('conta')) agg[p.label] = (agg[p.label] || 0) + p.priv;
      }
      for (const [k, v] of Object.entries(agg)) (byLabel[k] = byLabel[k] || []).push(v);
    }
    const lastPages = [...base].reverse().find((r) => r.pages && Object.keys(r.pages).length);
    out.phases[name] = {
      pages: lastPages ? lastPages.pages : null,
      total: stats(base.map((r) => r.totalPriv)),
      ws: stats(base.map((r) => r.totalWs)),
      procs: stats(base.map((r) => r.n)),
      labels: Object.fromEntries(Object.entries(byLabel).map(([k, v]) => [k, stats(v)]).sort((a, b) => b[1].avg - a[1].avg))
    };
  }
  return out;
}

const results = files.map(analyze);
if (md) {
  console.log('| arquivo | exp | fase | total avg | p95 | max | procs | contas(soma) | iframes | host | GPU | Browser |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) for (const [ph, d] of Object.entries(r.phases)) {
    const L = d.labels, g = (k) => (L[k] || {}).avg || 0;
    console.log(`| ${r.file} | ${r.exp} | ${ph} | ${d.total.avg} | ${d.total.p95} | ${d.total.max} | ${d.procs.max} | ${g('contas(soma)')} | ${g('iframes(soma)')} | ${g('host')} | ${g('GPU')} | ${g('Browser')} |`);
  }
} else {
  for (const r of results) {
    console.log(`\n== ${r.file}  [exp=${r.exp}]`);
    for (const [ph, d] of Object.entries(r.phases)) {
      console.log(`  ${ph}: total privado avg=${d.total.avg} MB p95=${d.total.p95} max=${d.total.max} (working set avg=${d.ws.avg}) · ${d.total.n} amostras · ate ${d.procs.max} processos`);
      for (const [k, s] of Object.entries(d.labels)) console.log(`    ${k.padEnd(16)} avg=${String(s.avg).padStart(5)}  p95=${String(s.p95).padStart(5)}  max=${String(s.max).padStart(5)}`);
      if (d.pages) for (const [k, p] of Object.entries(d.pages)) console.log(`    [pagina ${k}] ${JSON.stringify(p)}`);
    }
  }
}
