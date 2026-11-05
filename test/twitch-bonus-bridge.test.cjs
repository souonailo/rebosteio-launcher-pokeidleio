const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Shape verified against pokeidle.io/app.js v1.401.2, montarTwitch/linhaTwitch.
test('game bridge preserves channel-point bonus expirations and partner eligibility', async () => {
  const batches = [], timers = [];
  class Socket {
    static OPEN = 1;
    constructor() { this.listeners = {}; this.readyState = 1; }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    send() {}
  }
  const window = {
    WebSocket: Socket, location: { href: 'https://pokeidle.io/app' },
    __TAURI_INTERNALS__: { invoke: async (command, args) => {
      assert.equal(command, 'report_gameplay_batch');
      batches.push(args);
    } }
  };
  window.top = window;
  vm.runInNewContext(fs.readFileSync('rust-migration/src-tauri/src/gameplay_bridge.js', 'utf8'), {
    window, URL, crypto: { randomUUID: () => 'twitch-fixture' }, performance: { now: () => 0 },
    localStorage: { getItem: () => null }, queueMicrotask() {},
    setTimeout: callback => { timers.push(callback); return timers.length; }
  });
  const socket = new window.WebSocket('wss://pokeidle.io/ws');
  socket.listeners.open();
  const twitch = {
    vinculado: true, login: 'fixture', pct: 15,
    bonus: { xp: 1793818800000, captura: 1793822400000, shiny: 0 },
    oficiais: [
      { login: 'partner', aoVivo: true, ativo: true },
      { login: 'disabled', aoVivo: true, ativo: false }
    ]
  };
  socket.listeners.message({ data: JSON.stringify({ t: 'welcome', data: { estado: {
    twitch: { ...twitch, token: 'must-not-cross' }
  } } }) });
  while (timers.length) {
    timers.shift()();
    await new Promise(resolve => setImmediate(resolve));
  }
  const events = JSON.parse(JSON.stringify(batches.flatMap(batch => batch.events)));
  const snapshot = events.find(event => event.t === 'welcome');
  assert.ok(snapshot, 'full server snapshot reaches native state');
  assert.deepEqual(snapshot.data.estado.twitch, twitch);
});

for (const file of ['index.html', 'rust-migration/ui/index.html']) {
  test(`${file}: launcher retains the new Twitch bonus schema`, () => {
    const html = fs.readFileSync(file, 'utf8');
    const start = html.indexOf('function stSane(d)');
    const end = html.indexOf('const ecoBtn =', start);
    assert.ok(start > 0 && end > start);
    const context = vm.createContext({ window: { PioInventory: { project: data => data } } });
    vm.runInContext(html.slice(start, end), context);
    const twitch = {
      login: 'fixture', vinculado: true, pct: 15,
      bonus: { xp: 1793818800000, captura: 1793822400000, shiny: 0 },
      oficiais: [{ login: 'partner', aoVivo: true, ativo: true },
        { login: 'inactive', aoVivo: true, ativo: false }], token: 'must-not-cross'
    };
    const result = JSON.parse(JSON.stringify(context.stSane({ ok: true, twitch }).twitch));
    assert.equal(result.vinculado, true);
    assert.equal(result.pct, 15);
    assert.deepEqual(result.bonus, twitch.bonus);
    assert.equal(result.oficiais[0].aoVivo, true);
    assert.equal(result.oficiais[1].ativo, false);
    assert.equal(result.token, undefined);
  });
}
