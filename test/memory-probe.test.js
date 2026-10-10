'use strict';
const assert = require('node:assert/strict');
const { parseArgs, parseExperiments, labelProcesses, sample, mb } = require('../src/main/memory-probe');

assert.equal(mb(1024), 1);
assert.equal(mb(1536), 1.5);

const off = parseArgs([], {});
assert.equal(off.enabled, false, 'telemetria desligada por padrao');
const on = parseArgs(['--mem-probe', '--mem-interval=5', '--mem-tray-after=300', '--mem-tag=base/../x'], {});
assert.deepEqual([on.enabled, on.intervalMs, on.trayAfterMs, on.tag], [true, 5000, 300000, 'base..x']);
assert.equal(parseArgs([], { PIO_MEM_PROBE: '1' }).enabled, true);
assert.equal(parseArgs(['--mem-probe', '--mem-interval=-3'], {}).intervalMs, 10000, 'intervalo invalido cai no padrao');

assert.deepEqual([...parseExperiments(['--exp=e1, E3,lixo,E10'], {})], ['E1', 'E3', 'E10']);
assert.deepEqual([...parseExperiments([], { PIO_EXP: 'E2' })], ['E2']);
assert.equal(parseExperiments([], {}).size, 0);

const wc = (pid, type, storagePath) => ({ isDestroyed: () => false, getOSProcessId: () => pid, getType: () => type, session: { storagePath } });
const labels = labelProcesses([wc(10, 'window', 'C:\\x\\pionailo'), wc(11, 'webview', 'C:\\x\\Partitions\\conta1'), wc(12, 'webview', 'C:\\x\\Partitions\\conta4'), wc(11, 'webview', 'C:\\x\\Partitions\\conta1')]);
assert.deepEqual(Object.fromEntries(labels), { 10: 'host', 11: 'conta1', 12: 'conta4' });

const row = sample([
  { pid: 1, type: 'Browser', memory: { workingSetSize: 204800, privateBytes: 102400 }, cpu: { percentCPUUsage: 1.23 } },
  { pid: 11, type: 'Tab', memory: { workingSetSize: 409600, privateBytes: 307200 } },
  { pid: 99, type: 'Tab', memory: { workingSetSize: 10240 } }
], labels, { vis: 0 });
assert.equal(row.totalPriv, 100 + 300 + 10);
assert.equal(row.procs[1].label, 'conta1');
assert.equal(row.procs[2].label, 'renderer-orfao', 'renderer sem webContents (iframe de outra origem) fica visivel');
assert.equal(row.vis, 0);
console.log('PASS: memory probe args, experiments, process labels and totals.');
