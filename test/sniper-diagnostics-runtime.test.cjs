// Test suite verifying sniper diagnostics for unrecognized buy replies,
// dotted error codes, sorteio progress/terminal events, divergent marketComprado,
// and Rule.excludedItemIds (e.g. Water Stone ID 142 exclusion).

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.SNIPER_ENGINE_ROOT || path.resolve(__dirname, '..');

function harness(relativePath, config = {}, rules = []) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const catalogStart = source.indexOf('const POKEIDLE_ITEMS_DB');
  const catalogEnd = source.indexOf('// PokéIdle Rotom Sniper - Content Script', catalogStart);
  const engineMarker = source.indexOf('// PokéIdle Rotom Sniper - Injected Script');
  const engineStart = source.indexOf('(function()', engineMarker);
  const engineEnd = source.indexOf('const cockpitHTML', engineStart);
  assert.ok(catalogStart >= 0 && catalogEnd > catalogStart && engineStart > catalogEnd && engineEnd > engineStart);
  const engine = source.slice(engineStart, engineEnd).replace(/\}\)\(\);\s*$/, 'globalThis.__engine = {sniperState, handleMarketPacket, processMarketAnuncios};\n})();');
  let now = 1_000_000, nextId = 0;
  const timers = new Map(), sent = [], events = [], listeners = new Map(), storage = new Map();
  const schedule = (fn, delay, interval) => {
    const id = ++nextId; timers.set(id, {fn, at: now + Number(delay), interval}); return id;
  };
  class Socket {
    static OPEN = 1;
    constructor() { this.readyState = 1; this.listeners = new Map(); }
    addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }
    send(data) { sent.push({at: now, ...JSON.parse(data)}); }
    close() { this.readyState = 3; for (const fn of this.listeners.get('close') || []) fn({}); }
  }
  class Clock extends Date { static now() { return now; } }
  const element = () => ({style: {}, appendChild() {}, remove() {}, setAttribute() {}, textContent: '', innerHTML: ''});
  let pageWindow;
  const ctx = {
    Date: Clock, WebSocket: Socket, console: {log() {}, warn() {}, error() {}},
    location: {origin: 'https://pokeidle.io'},
    document: {getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: element, body: element(), head: element()},
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
    setTimeout: (fn, ms) => schedule(fn, ms, 0), clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => schedule(fn, ms, Number(ms)), clearInterval: id => timers.delete(id),
    fetch: async () => ({json: async () => ({items: []})}),
    estado: {gold: 1_000_000, orbs: 1000, diamonds: 1000},
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
    postMessage(data) { events.push(data); for (const fn of listeners.get('message') || []) fn({source: pageWindow, data}); }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  pageWindow = vm.runInContext('window', ctx);
  vm.runInContext(source.slice(catalogStart, catalogEnd) + '\n' + engine, ctx, {timeout: 2000});
  const socket = new ctx.WebSocket('wss://fixture.invalid');
  ctx.__activeGameWs = socket;
  const control = data => ctx.postMessage({source: 'ROTOM_POPUP', ...data});
  control({type: 'INIT_SNIPER', enabled: true, rules: structuredClone(rules), globalConfig: config});
  assert.equal(ctx.__engine.sniperState.enabled, true, 'Actual popup message initializes engine');
  return {
    sent, events, ctx, control, socket,
    receive: packet => ctx.__engine.handleMarketPacket(packet),
    offers: offers => ctx.__engine.processMarketAnuncios(offers),
    logs: () => events.filter(e => e.source === 'ROTOM_SNIPER' && e.type === 'SNIPER_LOG').map(e => e.log),
    advance(ms) {
      const end = now + ms;
      for (let count = 0; ; count++) {
        assert.ok(count < 20000, 'Timer callbacks stay bounded');
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a,b) => a[1].at-b[1].at || a[0]-b[0])[0];
        if (!next) break;
        const [id, timer] = next; now = timer.at;
        if (timer.interval) timer.at += timer.interval; else timers.delete(id);
        timer.fn();
      }
      now = end;
    }
  };
}

const stoneCategoryRule = {
  id: 'stones_rule',
  targetType: 'category',
  targetCategory: 'stone',
  targetName: 'Pedras de Evolução',
  maxPriceGold: 500,
  maxPriceGems: 5,
  maxQty: 3,
  totalBought: 0,
  active: true,
  infinite: false,
  excludedItemIds: [142] // Exclude Water Stone (ID 142)
};

const presets = ['rust-migration/ui/presets/auto-sniper.js', 'rust-migration/presets/auto-sniper.js'];

for (const preset of presets) {
  test(`${preset}: excludedItemIds ignores Water Stone (ID 142) but purchases Fire Stone (ID 53)`, () => {
    const h = harness(preset, {}, [stoneCategoryRule]);
    // Water Stone (ID 142) offer - should be ignored
    h.offers([{id: 1001, tipo: 'item', itemId: 142, itemNome: 'Water Stone', preco: 100, moeda: 'gold', qtd: 1}]);
    assert.equal(h.sent.filter(x => x.t === 'market.comprar').length, 0, 'Water Stone offer is ignored due to excludedItemIds');

    // Fire Stone (ID 53) offer - should be bought
    h.offers([{id: 1002, tipo: 'item', itemId: 53, itemNome: 'Fire Stone', preco: 100, moeda: 'gold', qtd: 1}]);
    const buys = h.sent.filter(x => x.t === 'market.comprar');
    assert.equal(buys.length, 1, 'Fire Stone offer is bought');
    assert.equal(buys[0].id, 1002);
  });

  test(`${preset}: category market.itens summary expansion excludes items in excludedItemIds`, () => {
    const h = harness(preset, {}, [stoneCategoryRule]);
    // Market summary reports both Water Stone (142) and Fire Stone (53)
    h.receive({t: 'market', aba: 'itens', resumo: {142: {minGold: 100}, 53: {minGold: 100}}});
    const queries = h.sent.filter(x => x.t === 'market.item');
    assert.equal(queries.some(x => x.itemId === 142), false, 'Excluded item 142 is not queried in market.item');
    assert.equal(queries.some(x => x.itemId === 53), true, 'Non-excluded item 53 is queried in market.item');
  });

  test(`${preset}: scheduled purchase cancels/ignores excluded item upon release`, () => {
    const h = harness(preset, {}, [stoneCategoryRule]);
    // Scheduled Water Stone (142)
    h.offers([{id: 1003, tipo: 'item', itemId: 142, itemNome: 'Water Stone', preco: 100, moeda: 'gold', qtd: 1, compravelEm: 1_002_000}]);
    // Scheduled Fire Stone (53)
    h.offers([{id: 1004, tipo: 'item', itemId: 53, itemNome: 'Fire Stone', preco: 100, moeda: 'gold', qtd: 1, compravelEm: 1_002_000}]);
    assert.equal(h.sent.filter(x => x.t === 'market.comprar').length, 0, 'Before release time no purchase sent');

    // Advance clock past 1_002_000
    h.advance(3000);
    const buys = h.sent.filter(x => x.t === 'market.comprar');
    assert.equal(buys.some(x => x.id === 1003), false, 'Scheduled excluded Water Stone is not bought on release');
    assert.equal(buys.some(x => x.id === 1004), true, 'Scheduled non-excluded Fire Stone is bought on release');
  });

  test(`${preset}: unrecognized buy error preserves pending order & budget, emits DIAGNOSTICO log`, () => {
    const rule = {...stoneCategoryRule, excludedItemIds: []};
    const h = harness(preset, {}, [rule]);
    h.offers([{id: 1005, tipo: 'item', itemId: 53, itemNome: 'Fire Stone', preco: 100, moeda: 'gold', qtd: 1}]);
    assert.equal(h.sent.filter(x => x.t === 'market.comprar').length, 1);
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1005]);
    assert.equal(h.ctx.__engine.sniperState.rules[0].totalBought, 1);

    // Server sends unrecognized error packet while pending
    h.receive({t: 'erro', erro: 'market.algoDesconhecido', cod: 999});

    // Budget and pending state must NOT be released
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1005], 'Pending buy must not be cleared on unrecognized error');
    assert.equal(h.ctx.__engine.sniperState.rules[0].totalBought, 1, 'Rule quota must remain allocated on unrecognized error');

    // Diagnostic log must be emitted
    const diags = h.logs().filter(l => l.status === 'DIAGNOSTICO');
    assert.ok(diags.length >= 1, 'Diagnostic log emitted for unrecognized buy reply');
    assert.ok(diags.some(l => l.details && l.details.includes('market.algoDesconhecido')), 'Details include unknown key');
  });

  test(`${preset}: dotted terminal error market.sorteioPerdeu releases budget and emits RECUSADO`, () => {
    const rule = {...stoneCategoryRule, excludedItemIds: []};
    const h = harness(preset, {}, [rule]);
    h.offers([{id: 1006, tipo: 'item', itemId: 53, itemNome: 'Fire Stone', preco: 100, moeda: 'gold', qtd: 1}]);
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1006]);
    assert.equal(h.ctx.__engine.sniperState.rules[0].totalBought, 1);

    // Server sends terminal lottery failure
    h.receive({t: 'erro', erro: 'market.sorteioPerdeu'});

    assert.equal(h.ctx.__engine.sniperState.boughtOffers[1006], undefined, 'Pending buy cleared on terminal failure');
    assert.equal(h.ctx.__engine.sniperState.rules[0].totalBought, 0, 'Quota restored on terminal failure');

    const refused = h.logs().filter(l => l.status === 'RECUSADO');
    assert.ok(refused.length >= 1, 'Refused log emitted for market.sorteioPerdeu');
  });

  test(`${preset}: non-refusal progress code market.sorteio and market.sorteioEspera emit PROGRESSO and keep pending`, () => {
    const rule = {...stoneCategoryRule, excludedItemIds: []};
    const h = harness(preset, {}, [rule]);
    h.offers([{id: 1007, tipo: 'item', itemId: 53, itemNome: 'Fire Stone', preco: 100, moeda: 'gold', qtd: 1}]);
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1007]);

    // Progress 1: market.sorteio
    h.receive({t: 'erro', erro: 'market.sorteio'});
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1007], 'Pending buy stays active on market.sorteio');
    assert.equal(h.ctx.__engine.sniperState.rules[0].totalBought, 1, 'Quota remains held on market.sorteio');

    // Progress 2: market.sorteioEspera
    h.receive({t: 'erro', erro: 'market.sorteioEspera'});
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1007], 'Pending buy stays active on market.sorteioEspera');

    const progressLogs = h.logs().filter(l => l.status === 'PROGRESSO');
    assert.ok(progressLogs.length >= 2, 'Progress logs emitted for sorteio progress codes');
  });

  test(`${preset}: divergent marketComprado ID logs DIAGNOSTICO and keeps pending buy active`, () => {
    const rule = {...stoneCategoryRule, excludedItemIds: []};
    const h = harness(preset, {}, [rule]);
    h.offers([{id: 1008, tipo: 'item', itemId: 53, itemNome: 'Fire Stone', preco: 100, moeda: 'gold', qtd: 1}]);
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1008]);
    assert.equal(h.ctx.__engine.sniperState.confirmedOffers[1008], undefined);

    // Divergent marketComprado with id: 999
    h.receive({t: 'e', k: 'marketComprado', id: 999, descricao: 'Outro item'});
    assert.equal(h.ctx.__engine.sniperState.confirmedOffers[1008], undefined, 'Divergent ID does not confirm pending offer');
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1008], 'Pending buy remains active');

    const diags = h.logs().filter(l => l.status === 'DIAGNOSTICO');
    assert.ok(diags.some(l => l.details && l.details.includes('ID divergente')), 'Diagnostic log notes divergent ID');

    // Matching marketComprado with id: 1008
    h.receive({t: 'e', k: 'marketComprado', id: 1008, descricao: '1x Fire Stone'});
    assert.equal(h.ctx.__engine.sniperState.confirmedOffers[1008], true, 'Matching ID confirms pending offer');
    const confirms = h.logs().filter(l => l.status === 'CONFIRMADO');
    assert.ok(confirms.length >= 1, 'Confirmed log emitted on match');
  });

  test(`${preset}: mktSorteio event progress and terminal resolution`, () => {
    const rule = {...stoneCategoryRule, excludedItemIds: []};
    const h = harness(preset, {}, [rule]);
    h.offers([{id: 1009, tipo: 'item', itemId: 53, itemNome: 'Fire Stone', preco: 100, moeda: 'gold', qtd: 1}]);
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1009]);

    // Progress: fase 'entrou'
    h.receive({t: 'e', k: 'mktSorteio', id: 1009, fase: 'entrou'});
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1009]);
    assert.ok(h.logs().some(l => l.status === 'PROGRESSO' && l.details.includes('entrou')));

    // Progress: fase 'lista'
    h.receive({t: 'e', k: 'mktSorteio', id: 1009, fase: 'lista'});
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1009]);

    // Terminal: fase 'fim', perdeu: true
    h.receive({t: 'e', k: 'mktSorteio', id: 1009, fase: 'fim', perdeu: true, msg: 'Outro jogador venceu'});
    assert.equal(h.ctx.__engine.sniperState.boughtOffers[1009], undefined, 'Pending cleared on lottery loss');
    assert.equal(h.ctx.__engine.sniperState.rules[0].totalBought, 0, 'Quota restored on lottery loss');
    assert.ok(h.logs().some(l => l.status === 'RECUSADO' && l.offerId === 1009));
  });

  test(`${preset}: bounded diagnostic/progress logs, divergent error ID protection, single CONFIRMADO on lottery win, and fail-closed missing currency`, () => {
    const rule = {...stoneCategoryRule, excludedItemIds: []};
    const h = harness(preset, {}, [rule]);

    // 1. Missing currency in envelope and row must fail closed (never assume gold)
    h.receive({t: 'market', aba: 'item', itemId: 53, linhas: [{id: 1010, preco: 2, qtd: 1}]});
    h.offers([{id: 1011, tipo: 'item', itemId: 53, itemNome: 'Fire Stone', preco: 2, qtd: 1}]);
    assert.equal(h.sent.filter(x => x.t === 'market.comprar').length, 0, 'Missing currency must never default to gold');

    // 2. Valid purchase triggers pending state
    h.offers([{id: 1012, tipo: 'item', itemId: 53, itemNome: 'Fire Stone', preco: 100, moeda: 'gold', qtd: 1}]);
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1012]);

    // 3. Terminal rejection carrying a DIFFERENT explicit offer ID must NOT release pending buy
    h.receive({t: 'erro', id: 9999, chave: 'market.sorteioPerdeu'});
    assert.ok(h.ctx.__engine.sniperState.boughtOffers[1012], 'Divergent offer ID on terminal error must keep pending buy');
    assert.equal(h.ctx.__engine.sniperState.rules[0].totalBought, 1);

    // 4. Flood of repeated mktSorteio 'lista' ticks and distinct unrecognized errors stays capped at <= 5 aux logs
    for (let i = 0; i < 16; i++) {
      h.receive({t: 'e', k: 'mktSorteio', id: 1012, fase: 'lista'});
    }
    for (let i = 0; i < 10; i++) {
      h.receive({t: 'erro', chave: `unknown.err.${i}`});
    }
    const auxLogs = h.logs().filter(l => l.status === 'DIAGNOSTICO' || l.status === 'PROGRESSO');
    assert.equal(auxLogs.length, 5, 'Auxiliary diagnostic/progress logs per pending offer are strictly bounded to 5');

    // 5. Lottery win (mktSorteio fim ok:true) followed by marketComprado emits CONFIRMADO only once
    h.receive({t: 'e', k: 'mktSorteio', id: 1012, fase: 'fim', ok: true, descricao: '1x Fire Stone'});
    h.receive({t: 'batalha', ev: [{k: 'marketComprado', id: 1012, sorteio: true, descricao: '1x Fire Stone'}]});
    const confirmed = h.logs().filter(l => l.status === 'CONFIRMADO' && Number(l.offerId) === 1012);
    assert.equal(confirmed.length, 1, 'mktSorteio win + marketComprado must emit CONFIRMADO only once');
  });

  test(`${preset}: CONFIRMADO preserves canonical targetName & seller, pioRecusados suppresses 5s PERDIDO, and storage keeps only CONFIRMADO`, () => {
    const rule = {...stoneCategoryRule, excludedItemIds: []};
    const h = harness(preset, {}, [rule]);

    // 1. Purchase rejected by market.sorteioPerdeu must NOT emit spurious PERDIDO 5s later
    h.offers([{id: 2001, tipo: 'item', itemId: 53, itemNome: 'Fire Stone', vendedor: 'kellvinjk', preco: 100, moeda: 'gold', qtd: 3}]);
    h.receive({t: 'erro', erro: 'market.sorteioPerdeu'});
    h.advance(6000);
    assert.equal(h.logs().some(l => l.status === 'PERDIDO' && Number(l.offerId) === 2001), false, 'Rejected offer must never emit spurious PERDIDO after 5s');

    // 2. Purchase confirmed with generic/missing server descricao preserves canonical targetName, seller, qty, price, currency, offerId
    h.offers([{id: 2002, tipo: 'item', itemId: 53, itemNome: 'Fire Stone', vendedor: 'exed', preco: 250, moeda: 'gold', qtd: 2}]);
    h.receive({t: 'e', k: 'marketComprado', id: 2002});
    const winLog = h.logs().find(l => l.status === 'CONFIRMADO' && Number(l.offerId) === 2002);
    assert.ok(winLog, 'CONFIRMADO log emitted');
    assert.equal(winLog.targetName, 'Fire Stone', 'targetName must be canonical item name, not generic server delivery string');
    assert.equal(winLog.seller, 'exed', 'CONFIRMADO log preserves seller');
    assert.equal(winLog.qty, 2);
    assert.equal(winLog.price, 250);
    assert.equal(winLog.currency, 'gold');

    // 3. Verify content-script handleWindowMessage filters storage strictly to CONFIRMADO and never evicts purchases on noise flood
    const source = fs.readFileSync(path.join(root, preset), 'utf8');
    const csStart = source.indexOf('// PokéIdle Rotom Sniper - Content Script');
    const csEnd = source.indexOf('// PokéIdle Rotom Sniper - Injected Script', csStart);
    assert.ok(csStart >= 0 && csEnd > csStart);

    let storedLogs = [
      {id: 'stale_agendado', status: 'AGENDADO', targetName: 'Cocoon Stone'},
      {id: 'old_win', status: 'CONFIRMADO', targetName: 'Leaf Stone', qty: 1, price: 100, currency: 'gold', offerId: 1}
    ];
    let msgHandler = null;
    const csCtx = {
      console: {log() {}, warn() {}, error() {}},
      chrome: {
        runtime: {id: 'pio-test', getURL: s => s, onMessage: {addListener() {}}},
        storage: {
          local: {
            get(_keys, cb) { cb({rotom_sniper_logs: storedLogs}); },
            set(obj, cb) { if (obj.rotom_sniper_logs) storedLogs = obj.rotom_sniper_logs; if (cb) cb(); }
          }
        }
      },
      document: {createElement: () => ({}), head: {appendChild() {}}, documentElement: {appendChild() {}}},
      addEventListener(type, fn) { if (type === 'message') msgHandler = fn; },
      removeEventListener() {},
      postMessage() {}
    };
    csCtx.window = csCtx;
    vm.createContext(csCtx);
    const csWindow = vm.runInContext('window', csCtx);
    vm.runInContext(source.slice(csStart, csEnd), csCtx, {timeout: 2000});
    assert.equal(typeof msgHandler, 'function', 'Content script registered window message listener');

    // Flood 150 non-success logs: none should be stored and old_win must NOT be evicted
    for (let i = 0; i < 150; i++) {
      const st = ['AGENDADO', 'DISPARADO', 'PROGRESSO', 'RECUSADO', 'PERDIDO', 'DIAGNOSTICO'][i % 6];
      msgHandler({source: csWindow, data: {source: 'ROTOM_SNIPER', type: 'SNIPER_LOG', log: {id: 'n_' + i, status: st, targetName: 'Cocoon Stone'}}});
    }
    msgHandler({source: csWindow, data: {source: 'ROTOM_SNIPER', type: 'SNIPER_LOG', log: winLog}});

    assert.equal(storedLogs.every(l => l.status === 'CONFIRMADO'), true, 'rotom_sniper_logs contains strictly CONFIRMADO entries');
    assert.equal(storedLogs.length, 2, 'Stale AGENDADO purged while both old_win and new winLog remain intact');
    assert.equal(storedLogs[0].offerId, 2002);
    assert.equal(storedLogs[1].id, 'old_win');
  });
}
