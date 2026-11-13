'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const catalogSource = fs.readFileSync(path.join(root, 'rust-migration/ui/src/ui/boss-item-catalog.js'), 'utf8');
const hudSource = fs.readFileSync(path.join(root, 'rust-migration/ui/src/ui/battle-hud.js'), 'utf8');

function hudHarness(storage = new Map()) {
  const ctx = {
    console,
    Map,
    Set,
    Date,
    window: {
      PioInventory: { project: state => state },
      PIW_ALL_POKEMON_THEMES: [
        { name: 'Articuno', dex: 144 }, { name: 'Zapdos', dex: 145 }
      ]
    },
    document: { hidden: false, addEventListener() {}, getElementById: () => null },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  };
  vm.runInNewContext(catalogSource, ctx, { filename: 'boss-item-catalog.js' });
  vm.runInNewContext(hudSource, ctx, { filename: 'battle-hud.js' });
  return ctx.window.PioBattleHud;
}

test('manifesto de sprites não define os itens exibidos como drops de boss', () => {
  const hud = hudHarness();
  assert.equal(hud.collectBossRewardTelemetry({}).length, 0);
  for (const [id, sprite] of Object.entries(hud.BOSS_ITEM_SPRITES)) {
    const file = path.join(root, 'rust-migration/ui/src/ui/assets/boss-drops', sprite);
    assert.equal(fs.existsSync(file), true, `sprite local ausente para item ${id}`);
    const buf = fs.readFileSync(file);
    if (sprite.endsWith('.png')) assert.deepEqual([...buf.subarray(0, 8)], [137,80,78,71,13,10,26,10], `${id}: asset não é PNG`);
    if (sprite.endsWith('.gif')) assert.equal(buf.toString('ascii', 0, 3), 'GIF', `${id}: asset não é GIF`);
  }
  const rootAssets = path.join(root, 'rust-migration/ui/src/ui/assets/boss-drops');
  const launcherHtml = fs.readFileSync(path.join(root, 'rust-migration/ui/index.html'), 'utf8');
  assert.ok(launcherHtml.indexOf('src/ui/boss-item-catalog.js') >= 0);
  assert.ok(launcherHtml.indexOf('src/ui/boss-item-catalog.js') < launcherHtml.indexOf('src/ui/battle-hud.js'));
  const manifest = JSON.parse(fs.readFileSync(path.join(rootAssets, 'catalog.json'), 'utf8'));
  assert.equal(Object.keys(manifest).length, Object.keys(hud.BOSS_ITEM_SPRITES).length);
  assert.ok(manifest['59200'], 'TMs dos drops de bosses precisam de sprite');
  for (const [id, filename] of Object.entries(manifest)) {
    assert.match(filename, /^\d+\.(png|gif|webp)$/);
    assert.ok(fs.existsSync(path.join(rootAssets, filename)), `Asset do item ${id} não foi copiado`);
    assert.equal(hud.BOSS_ITEM_SPRITES[id], filename);
  }
});

test('catálogo reúne itens de todos os bosses e soma apenas quantidades confirmadas', () => {
  const hud = hudHarness();
  const state = {
    bossLive: { bossKey: 'articuno', enabled: true, inArena: true },
    inventoryKnown: true,
    invMap: { 70014: 9, 70090: 1, 70095: 4 },
    bossesJogaveis: [
      { key: 'articuno', nome: 'Articuno', drops: [
        { itemId: 70014, nome: 'Mega Stone Fragment', chance: 0.02 },
        { itemId: 70090, nome: 'Mystic Ticket', chance: 0.01 }
      ] },
      { key: 'zapdos', nome: 'Zapdos', drops: [{ itemId: 70017, nome: 'Shiny Egg Fragment' }] }
    ],
    bossDrops: [
      { id: 70014, name: 'Mega Stone Fragment', qty: 2, bossKey: 'articuno' },
      { id: 70014, name: 'Mega Stone Fragment', qty: 1, bossKey: 'zapdos' },
      { id: 70095, name: 'Safari Ticket', qty: 1, bossKey: 'moltres' }
    ]
  };
  const rows = hud.collectBossRewardTelemetry(state);
  assert.equal(rows.find(r => r.id === 70014).qty, 3);
  assert.equal(rows.find(r => r.id === 70014).owned, 9, 'quantidade na bag é independente dos drops da sessão');
  assert.equal(rows.find(r => r.id === 70014).sprite, 'src/ui/assets/boss-drops/70014.png');
  assert.equal(rows.find(r => r.id === 70090).qty, 0);
  assert.equal(rows.find(r => r.id === 70095).qty, 1);
  assert.equal(rows.find(r => r.id === 70017).qty, 0);
  assert.equal(rows.find(r => r.id === 70017).owned, 0, 'item ausente do inventário conhecido tem total zero');
  assert.equal(rows.length, 4);
  assert.equal(rows.reduce((sum, r) => sum + r.qty, 0), 4);
  assert.ok(rows.find(r => r.id === 70014).bosses.includes('Articuno'));
  assert.ok(rows.find(r => r.id === 70014).bosses.includes('zapdos'));
});

test('sem catálogo ou eventos confirmados, não inventa recompensas da arena', () => {
  const hud = hudHarness();
  const baseline = hud.collectBossRewardTelemetry({});
  assert.equal(baseline.length, 0, 'sprites genéricos não são drops de boss');
  const rows = hud.collectBossRewardTelemetry({ bossLive: { bossKey: 'novo' }, bossDrops: [
    { id: 777777, name: 'Item do servidor', qty: 4, bossKey: 'novo' }
  ] });
  assert.equal(rows.length, 1);
  assert.equal(rows.find(row => row.id === 777777).qty, 4);
  assert.equal(rows.find(row => row.id === 777777).owned, null, 'estoque desconhecido não vira zero');
  assert.equal(rows.find(row => row.id === 777777).sprite, '', 'item novo sem sprite local tem placeholder');
});

test('ordena TMs, tickets e stones em famílias sem misturar um par incompleto', () => {
  const hud = hudHarness();
  const rows = hud.collectBossRewardTelemetry({ bossesJogaveis: [{ key: 'boss', drops: [
    { itemId: 70095, nome: 'Safari Ticket' },
    { itemId: 70014, nome: 'Mega Stone Fragment' },
    { itemId: 59200, nome: 'Normal-Type TM Disk' },
    { itemId: 70090, nome: 'Mystic Ticket' },
    { itemId: 59194, nome: 'TM Disk Piece' },
    { itemId: 40530, nome: 'AoE TM Disk Piece' },
    { itemId: 70015, nome: 'Mega Shiny Stone Fragment' }
  ] }] });
  assert.deepEqual(Array.from(rows, row => row.family),
    ['tm', 'tm', 'tm', 'ticket', 'ticket', 'stone', 'stone']);
  assert.deepEqual(Array.from(rows, row => row.id),
    [40530, 59194, 59200, 70090, 70095, 70014, 70015]);
});

test('catálogo completo recebido do servidor permanece fora da arena e após reinício', () => {
  const storage = new Map();
  const hud = hudHarness(storage);
  const bossesJogaveis = [
    { key: 'a', nome: 'Boss A', drops: [{ itemId: 70014, nome: 'Mega Stone Fragment' }] },
    { key: 'b', nome: 'Boss B', drops: [{ itemId: 59200, nome: 'TM de boss' }] },
    { key: 'c', nome: 'Boss C', drops: [{ itemId: 70095, nome: 'Safari Ticket' }] }
  ];
  const bossesCatalogo = [
    { key: 'a', drops: ['Outro nome simplificado do mesmo boss'] },
    { key: 'locked', nome: 'Boss Bloqueado', drops: ['TM Disk Piece'] }
  ];
  const rows = hud.collectBossRewardTelemetry({ bossesJogaveis, bossesCatalogo });
  assert.deepEqual(Array.from(rows, row => row.id).sort((a, b) => a - b), [59194, 59200, 70014, 70095]);
  assert.equal(rows.some(row => row.name === 'Outro nome simplificado do mesmo boss'), false);
  assert.ok(rows.find(row => row.id === 59194).bosses.includes('Boss Bloqueado'));
  assert.equal(rows.find(row => row.id === 59200).sprite, 'src/ui/assets/boss-drops/59200.png');
  assert.equal(hud.collectBossRewardTelemetry({ bossLive: { status: 'left' } }).length, 4);
  const restarted = hudHarness(storage);
  assert.equal(restarted.collectBossRewardTelemetry({}).length, 4);
  assert.equal(restarted.collectBossRewardTelemetry({})[0].qty, 0);
  assert.equal(restarted.collectBossRewardTelemetry({ bossesJogaveis: [
    { key: 'd', nome: 'Boss D', drops: [{ itemId: 70012, nome: 'Shiny Stone Fragment' }] }
  ] }).length, 1, 'nova tabela do servidor substitui catálogo antigo');
});
