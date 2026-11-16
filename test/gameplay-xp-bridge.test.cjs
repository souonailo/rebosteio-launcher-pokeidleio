const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fixture = require('./fixtures/gameplay-xp.json');

async function throughBridge(message, handoff = false) {
  const batches = [], timers = [];
  class Socket {
    static OPEN = 1;
    constructor() { this.listeners = {}; this.readyState = 1; }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    send() {}
    close() { this.readyState = 3; }
    fire(type, value) { this.listeners[type]?.(value); }
  }
  const window = {
    WebSocket: Socket, location: { href: 'https://pokeidle.io/' },
    __TAURI_INTERNALS__: { invoke: async (command, args) => {
      assert.equal(command, 'report_gameplay_batch');
      batches.push(args);
    } }
  };
  window.top = window;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../rust-migration/src-tauri/src/gameplay_bridge.js'), 'utf8'), {
    window, URL, crypto: { randomUUID: () => 'xp-fixture' }, performance: { now: () => 0 },
    localStorage: { getItem: () => null }, queueMicrotask: () => {},
    setInterval: () => 0,
    setTimeout: callback => { timers.push(callback); return timers.length; }
  });
  const socket = new window.WebSocket('wss://pokeidle.io/ws');
  socket.fire('open');
  for (const packet of [].concat(message)) {
    socket.fire('message', { data: JSON.stringify(packet) });
  }
  if (handoff) return window.__idleioFreezeGameplay();
  while (timers.length) {
    timers.shift()();
    await new Promise(resolve => setImmediate(resolve));
  }
  return JSON.parse(JSON.stringify(batches.flatMap(batch => batch.events)));
}

test('handoff takes the latest confirmed Outland selection before queued telemetry flushes', async () => {
  const tier = await throughBridge([
    { t: 'welcome', estado: { outlandTier: 101 } },
    { t: 'estado', data: { outlandTier: 140 } },
    { t: 'estado', gold: 12 },
  ], true);
  assert.equal(tier, 140);
});

for (const wrapped of [false, true]) {
  test(`real bridge preserves boosted, zero and legacy XP, including bosses (wrapped=${wrapped})`, async () => {
    const events = fixture.data.ev.map(event => ({ ...event, untrustedExtra: 'must-not-cross' }));
    const message = wrapped ? { t: 'batalha', data: { ev: events } } : { t: 'batalha', ev: events };
    const output = (await throughBridge(message)).find(event => event.t === 'batalha');
    // This exact contract is also consumed by the native Rust parser regression.
    assert.deepEqual(output, fixture);
  });
}

test('legacy standalone kill forwards awarded trainer XP rather than base XP', async () => {
  for (const xpTreinador of [291, 0, undefined]) {
    const output = await throughBridge({ t: 'morte', quem: 'selvagem', xp: 100, xpTreinador, xpPokemon: xpTreinador });
    assert.equal(output.find(event => event.t === 'activity').data.xp, xpTreinador ?? 100);
  }
});
