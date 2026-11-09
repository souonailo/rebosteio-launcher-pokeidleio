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
      lives: ['live_from_lives', { login: 'partner', viewers: 120 }],
      oficiais: [
        { login: '@Partner', aoVivo: false, ativo: true },
        { login: 'live_from_lives' },
        { login: 'inactive', aoVivo: true, ativo: false },
        { login: 'bonus_disabled', aoVivo: false, bonus: false }
      ],
      token: 'must-not-cross'
    };
    const result = JSON.parse(JSON.stringify(context.stSane({ ok: true, twitch }).twitch));
    assert.equal(result.vinculado, true);
    assert.equal(result.pct, 15);
    assert.deepEqual(result.bonus, twitch.bonus);
    // Computed aoVivo by checking against tw.lives
    assert.equal(result.oficiais[0].login, 'partner', 'leading @ must be stripped and lowered');
    assert.equal(result.oficiais[0].aoVivo, true, 'partner is in tw.lives so aoVivo must be true');
    assert.equal(result.oficiais[0].ativo, true);
    assert.equal(result.oficiais[0].bonus, true);
    assert.equal(result.oficiais[1].aoVivo, true, 'live_from_lives is in tw.lives');
    assert.equal(result.oficiais[1].ativo, false, 'a channel without explicit server authorization stays inactive');
    assert.equal(result.oficiais[1].bonus, true, 'undefined bonus must default to true');
    assert.equal(result.oficiais[2].ativo, false);
    assert.equal(result.oficiais[3].bonus, false);
    assert.equal(result.oficiais[3].aoVivo, false);
    assert.equal(result.lives.length, 2);
    assert.equal(result.token, undefined);
    const partial = context.stSane({ok:true,twitch:{bonus:{xp:0}},kick:{pontos:10}});
    assert.equal(Object.hasOwn(partial.twitch,'oficiais'), false, 'partial telemetry must not clear a prior official roster');
    assert.equal(Object.hasOwn(partial.kick,'oficiais'), false, 'partial Kick telemetry must not clear a prior official roster');
  });

  test(`${file}: Twitch queries only game-authorized official channels, including offline`, () => {
    const html = fs.readFileSync(file, 'utf8');
    const funcStart = html.indexOf('function twitchOfficialChannels(');
    const funcEnd = html.indexOf('let twitchLastPartners =', funcStart);
    assert.ok(funcStart > 0 && funcEnd > funcStart);
    const context = vm.createContext({
      twitchCachedGameData: [
        // A live name alone is insufficient to designate an official partner.
        { login: 'player1', vinculado: true, lives: ['biscoitao'], oficiais: [] },
        // Account 1: linked with specific oficiais including offline and disabled
        {
          login: 'player2', vinculado: true, lives: ['live_channel'],
          oficiais: [
            { login: '@live_channel', ativo: true },
            { login: 'offline_channel', ativo: true, aoVivo: false },
            { login: 'disabled_channel', ativo: false, aoVivo: true },
            { login: 'no_bonus_channel', ativo: true, bonus: false, aoVivo: false },
            { login: 'missing_authorization', aoVivo: true }
          ]
        },
        // Account 2: unlinked, no username
        null,
        // Account 3: game data null but config username exists
        null
      ],
      twitchBonusConfig: {
        accounts: [
          { username: 'player1' },
          { username: 'player2' },
          { username: '' },
          { username: 'player4' }
        ]
      }
    });
    vm.runInContext(html.slice(funcStart, funcEnd), context);

    // A linked account with no official list does not query guessed channels.
    const acc0Channels = context.twitchOfficialChannels(0);
    assert.equal(acc0Channels.length, 0);

    // Inactive partners remain recognizable as official, but are not eligible for points.
    const acc1Channels = context.twitchOfficialChannels(1);
    assert.equal(acc1Channels.length, 5);
    assert.ok(acc1Channels.some(c => c.login === 'live_channel' && c.aoVivo === true));
    assert.ok(acc1Channels.some(c => c.login === 'offline_channel' && c.aoVivo === false));
    assert.ok(acc1Channels.some(c => c.login === 'disabled_channel' && c.ativo === false));
    assert.ok(acc1Channels.some(c => c.login === 'no_bonus_channel' && c.ativo === false));
    assert.ok(acc1Channels.some(c => c.login === 'missing_authorization' && c.ativo === false));

    // Account 2: unlinked, returns empty
    assert.equal(context.twitchOfficialChannels(2).length, 0);

    // Credentials alone never authorize a streamer's channel.
    assert.equal(context.twitchOfficialChannels(3).length, 0);
  });
}
