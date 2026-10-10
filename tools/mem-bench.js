#!/usr/bin/env node
'use strict';
// Roda o cenario do estudo de RAM para cada experimento, um depois do outro.
// Cenario: --visible s visivel, depois bandeja ate --show s, restaura e fecha em --duration s.
// Uso: node tools/mem-bench.js [--runs=base,E1,E2] [--visible=300] [--show=660] [--duration=720]
// Combinacao: --runs=base,E1+E3+E6 (o '+' vira lista em --exp).
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const runs = arg('runs', 'base,E1,E2,E3,E4,E5,E6,E7,E8,E9,E10').split(',').filter(Boolean);
const visible = +arg('visible', 300), show = +arg('show', 660), duration = +arg('duration', 720);
const root = path.join(__dirname, '..');
const electron = path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const log = path.join(root, 'scratch', 'mem-bench.log');
fs.mkdirSync(path.dirname(log), { recursive: true });
const say = (s) => { const l = `[${new Date().toISOString()}] ${s}`; console.log(l); fs.appendFileSync(log, l + '\n'); };

function run(name) {
  return new Promise((resolve) => {
    const exp = name === 'base' ? '' : name.replace(/\+/g, ',');
    const args = ['.', '--mem-probe', '--mem-interval=10', `--mem-tray-after=${visible}`, `--mem-show-after=${show}`, `--mem-duration=${duration}`, `--mem-tag=${name.replace(/\+/g, '_')}`];
    if (exp) args.push('--exp=' + exp);
    say('inicio ' + name + ' :: ' + args.join(' '));
    const env = { ...process.env }; delete env.PIO_EXP; delete env.ELECTRON_RUN_AS_NODE;
    const p = spawn(electron, args, { cwd: root, env, stdio: 'ignore', windowsHide: false });
    const hard = setTimeout(() => { say('timeout duro em ' + name + ', matando'); try { p.kill(); } catch {} }, (duration + 120) * 1000);
    p.on('exit', (code) => { clearTimeout(hard); say('fim ' + name + ' (exit ' + code + ')'); setTimeout(resolve, 15000); });
    p.on('error', (e) => { clearTimeout(hard); say('erro ' + name + ': ' + e.message); resolve(); });
  });
}

(async () => {
  say('bench: ' + runs.join(', ') + ` · visivel ${visible}s · bandeja ate ${show}s · fim ${duration}s`);
  for (const r of runs) await run(r);
  say('bench concluido');
})();
