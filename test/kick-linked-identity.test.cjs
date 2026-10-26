const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const file of ['index.html', 'rust-migration/ui/index.html']) {
  test(`${file}: game status persists the verified identity for all four accounts`, async () => {
    const html = fs.readFileSync(file, 'utf8');
    const start = html.indexOf('async function syncKickGameStatus(');
    const end = html.indexOf('async function linkKickInGame(', start);
    const saved = [];
    const context = {
      webviews: Array.from({ length: 4 }, (_, i) => ({ executeJavaScript: async () => ({ linked: true, login: `@Account${i}` }) })),
      kickCachedGameData: [],
      kickBonusConfig: { accounts: Array.from({ length: 4 }, () => ({ gameLinked: true, linkedUsername: '' })) },
      kickBonusOverlay: null,
      window: { pokeAPI: { kickSaveCreds: async config => { saved.push(JSON.parse(JSON.stringify(config))); } } }
    };
    vm.createContext(context);
    vm.runInContext(html.slice(start, end), context);
    for (let i = 0; i < 4; i++) await context.syncKickGameStatus(i);
    assert.equal(saved.length, 4);
    for (let i = 0; i < 4; i++) assert.equal(saved.at(-1).accounts[i].linkedUsername, `account${i}`);
    context.webviews[1].executeJavaScript = async () => ({ linked: true, login: '' });
    await context.syncKickGameStatus(1);
    assert.equal(saved.at(-1).accounts[1].linkedUsername, 'account1');
  });
  test(`${file}: headless linking reads each account's state without a WebView`, async () => {
    const html = fs.readFileSync(file, 'utf8');
    const start = html.indexOf('async function syncKickGameStatus(');
    const end = html.indexOf('async function linkKickInGame(', start);
    const received = [];
    const context = {
      handleKickGameTelemetry: async (index, kick) => received.push({ index, login: kick.login }),
      window: {
        PioBattleHud: { isBlasterActive: () => true },
        stCache: Object.fromEntries(Array.from({ length: 4 }, (_, i) => [i, { d: { kick: { login: `account${i}` } } }]))
      }
    };
    vm.createContext(context);
    vm.runInContext(html.slice(start, end), context);
    for (let i = 0; i < 4; i++) await context.syncKickGameStatus(i);
    assert.deepEqual(received, Array.from({ length: 4 }, (_, i) => ({ index: i, login: `account${i}` })));
    delete context.window.stCache[2];
    await context.syncKickGameStatus(2);
    assert.equal(received.length, 4);
  });
}
