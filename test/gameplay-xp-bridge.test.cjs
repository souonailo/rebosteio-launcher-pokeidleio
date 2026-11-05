const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fixture = require('./fixtures/gameplay-xp.json');

async function throughBridge(message) {
  const batches = [], timers = [];
  class Socket {
    static OPEN = 1;
    constructor() { this.listeners = {}; this.readyState = 1; }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    send() {}
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
    setTimeout: callback => { timers.push(callback); return timers.length; }
  });
  const socket = new window.WebSocket('wss://pokeidle.io/ws');
  socket.fire('open');
  socket.fire('message', { data: JSON.stringify(message) });
  while (timers.length) {
    timers.shift()();
    await new Promise(resolve => setImmediate(resolve));
  }
  return JSON.parse(JSON.stringify(batches.flatMap(batch => batch.events)));
}

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
