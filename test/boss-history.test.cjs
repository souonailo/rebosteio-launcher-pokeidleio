const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'rust-migration/ui/src/ui/boss-history.js'), 'utf8');

function harness(saved = new Map(), session = new Map(), invoke = null) {
  const localStorage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value)
  };
  const sessionStorage = {
    getItem: key => session.get(key) ?? null,
    setItem: (key, value) => session.set(key, value)
  };
  const context = { module: { exports: {} }, localStorage, sessionStorage, Date, Math, Map, Number, String, JSON,
    __TAURI_INTERNALS__: invoke ? { invoke } : undefined };
  vm.runInNewContext(source, context);
  return { api: context.module.exports, saved, session };
}

test('registra cada resultado uma vez e separa três bosses da mesma conta', () => {
  const { api, saved, session } = harness();
  const state = (key, name, live) => ({ cid: 'cid-A', name: 'Treinador A', bossLive: { bossKey: key, bossName: name, ...live } });
  for (const [key, name, result, drops] of [
    ['articuno', 'Articuno', 'victory', [{ id: '70014', name: 'Fragmento', qty: 2 }]],
    ['zapdos', 'Zapdos', 'victory', [{ id: '70014', name: 'Fragmento', qty: 1 }]],
    ['moltres', 'Moltres', 'defeat', null]
  ]) {
    api.observe(0, state(key, name, { inArena: true, status: 'fighting' }));
    assert.equal(api.observe(0, state(key, name, { inArena: false, winner: result, lastBattleDrops: drops, turn: 5 })), true);
    assert.equal(api.observe(0, state(key, name, { inArena: false, winner: result, lastBattleDrops: drops, turn: 5 })), false);
  }
  const entries = api.read(0, 'cid-A');
  assert.equal(entries.length, 3);
  assert.equal(api.read(1).length, 0);
  const groups = api.summarize(entries);
  assert.equal(groups.length, 3);
  assert.equal(groups.find(group => group.key === 'articuno').items[0].qty, 2);
  assert.equal(groups.find(group => group.key === 'zapdos').items[0].qty, 1);
  assert.equal(groups.find(group => group.key === 'moltres').defeats, 1);
  assert.equal(groups.find(group => group.key === 'moltres').items.length, 0);
  const reloaded = harness(saved, session).api;
  assert.equal(reloaded.read(0, 'cid-A').length, 3, 'registros sobrevivem à nova instância da interface');
  assert.equal(reloaded.observe(0, state('moltres', 'Moltres', { inArena: false, winner: 'defeat', lastBattleDrops: null })), false,
    'reload da interface não duplica o último resultado');
});

test('recompensa fora dos quatro itens rastreados entra no histórico', () => {
  const { api } = harness();
  const state = { cid: 'cid-B', name: 'Treinador B', bossLive: { bossKey: 'suicune', bossName: 'Suicune', winner: 'victory', lastBattleDrops: [{ id: '777777', name: 'TM rara', qty: 1 }] } };
  assert.equal(api.observe(2, state), true);
  assert.equal(api.read(2, 'cid-B')[0].drops[0].name, 'TM rara');
  assert.equal(api.read(2, 'cid-A').length, 0);
});

test('vitória sem drop explícito permanece no histórico e entra no denominador da média', () => {
  const { api } = harness();
  const base = { cid: 'cid-C', name: 'C', bossLive: { bossKey: 'suicune', bossName: 'Suicune' } };
  api.observe(0, { ...base, bossLive: { ...base.bossLive, inArena: true, status: 'fighting' } });
  assert.equal(api.observe(0, { ...base, bossLive: { ...base.bossLive, winner: 'victory', lastBattleDrops: [] } }), true);
  const rows = api.read(0, 'cid-C');
  assert.equal(rows.length, 1);
  assert.deepEqual(Array.from(rows[0].drops), []);
  assert.equal(api.summarize(rows)[0].knownVictoryRewards, 1);
});

test('não trunca o histórico em 400 combates e combina registros nativos com legado', async () => {
  const native = [{ id: 'native:0:1', at: Date.now(), index: 0, accountId: 'cid-D', accountName: 'D',
    bossKey: 'suicune', bossName: 'Suicune', result: 'victory', drops: [] }];
  const { api } = harness(new Map(), new Map(), async (command, args) => {
    assert.equal(command, 'blaster_boss_history');
    assert.equal(args.accountId, 'cid-D');
    return native;
  });
  const base = { cid: 'cid-D', name: 'D', bossLive: { bossKey: 'suicune', bossName: 'Suicune' } };
  for (let i = 0; i < 401; i++) {
    api.observe(0, { ...base, bossLive: { ...base.bossLive, inArena: true, status: 'fighting' } });
    assert.equal(api.observe(0, { ...base, bossLive: { ...base.bossLive, winner: 'victory', lastBattleDrops: [] } }), true);
  }
  assert.equal(api.read(0, 'cid-D').length, 401);
  await api.loadNative(0, 'cid-D');
  assert.equal(api.read(0, 'cid-D').length, 401, 'registro nativo da última batalha substitui a cópia local');
});
