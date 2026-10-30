// Executes the shipped engines, not a second implementation of their predicates.
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
    installStorageBridge() {
      const data = {rotom_sniper_rules:structuredClone(rules),rotom_sniper_enabled:true,rotom_sniper_config:structuredClone(config)};
      const onChange = [];
      ctx.chrome = {
        runtime: {id:'fixture', onMessage:{addListener() {}}, sendMessage:async () => ({})},
        storage: {onChanged:{addListener:fn=>onChange.push(fn)},local:{
          get(keys,callback) { callback(Object.fromEntries(keys.filter(key=>key in data).map(key=>[key,structuredClone(data[key])]))); },
          set(values,callback) {
            const changes = {};
            for (const [key,value] of Object.entries(values)) {
              changes[key]={oldValue:structuredClone(data[key]),newValue:structuredClone(value)};
              data[key]=structuredClone(value);
            }
            for (const fn of onChange) fn(changes,'local');
            callback?.();
          }
        }}
      };
      // Browser message events are separate tasks; finish the storage microtask
      // of each event before delivering the next one.
      const add = ctx.addEventListener;
      ctx.addEventListener = (type,fn) => add.call(ctx,type,event=>schedule(()=>fn(event),0,0));
      vm.runInContext(source.slice(catalogEnd,engineMarker),ctx,{timeout:2000});
      ctx.addEventListener = add;
      return data;
    },
    receive: packet => ctx.__engine.handleMarketPacket(packet),
    offers: offers => ctx.__engine.processMarketAnuncios(offers),
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

const category = {id: 'stones', targetType: 'category', targetCategory: 'stone', targetName: 'Pedras', maxPriceGold: 500, maxPriceGems: 5, maxQty: 3, totalBought: 0, active: true, infinite: false};
const pokemon = (id, extra = {}) => ({id, tipo: 'pokemon', pokemonNome: 'Pikachu', preco: 100, moeda: 'gold', qtd: 1, ficha: {speciesId: 25, nome: 'Pikachu'}, ...extra});
const presets = ['rust-migration/ui/presets/auto-sniper.js', 'rust-migration/presets/auto-sniper.js'];
for (const preset of presets) {
  test(preset + ': item-detail envelope currency cannot be interpreted as Coins', () => {
    const rule={...category,targetType:'item',targetId:142,targetName:'Water Stone',maxPriceGold:100,maxPriceGems:0};
    const packet={t:'market',aba:'item',itemId:142,moeda:'orb',linhas:[{id:950,preco:2,qtd:1,ficha:{nome:'Water Stone'}}]};
    const denied=harness(preset,{},[rule]); denied.receive(packet);
    assert.equal(denied.sent.some(x=>x.t==='market.comprar'),false);
    const allowed=harness(preset,{},[{...rule,maxPriceGold:0,maxPriceGems:2}]); allowed.receive(packet);
    const buy=allowed.sent.find(x=>x.t==='market.comprar');
    assert.ok(buy);
    assert.equal(buy.moeda,'orb');
    assert.equal(buy.preco,2);
  });
  test(preset + ': excluded stones never query or buy while other category items remain eligible', () => {
    const h = harness(preset, {}, [{...category, excludedItemIds:[2,70031]}]);
    h.receive({t:'market',aba:'itens',resumo:{2:{minGold:100,minOrb:2},70031:{minGold:100,minOrb:2},142:{minGold:100,minOrb:2}}});
    assert.deepEqual(h.sent.filter(x=>x.t==='market.item').map(x=>`${x.itemId}:${x.moeda}`).sort(),['142:gold','142:orb']);
    h.offers([{id:951,tipo:'item',itemId:2,preco:100,moeda:'gold',qtd:1},{id:952,tipo:'item',itemId:70031,preco:100,moeda:'gold',qtd:1}]);
    assert.equal(h.sent.some(x=>x.t==='market.comprar'),false);
    h.offers([{id:953,tipo:'item',itemId:142,preco:100,moeda:'gold',qtd:1}]);
    assert.equal(h.sent.find(x=>x.t==='market.comprar')?.id,953);
  });
  test(preset + ': updating exclusions cancels scheduled stone purchases and their retries', () => {
    const h = harness(preset, {}, [category]);
    h.offers([{id:954,tipo:'item',itemId:2,preco:100,moeda:'gold',qtd:1,compravelEm:1_001_000}]);
    h.control({type:'UPDATE_SNIPER_RULES',rules:[{...category,excludedItemIds:[2]}]});
    h.advance(4000);
    assert.equal(h.sent.some(x=>x.t==='market.comprar'),false);
  });
  test(preset + ': verified new catalog categories cover screenshot items without expanding rare_loot', () => {
    const summary=Object.fromEntries([70014,70015,70017,70090,70095,70011,70012,70013,70000].map(id=>[id,{minGold:100}]));
    for(const [cat,expected] of [['fragment',[70014,70015,70017]],['ticket',[70090,70095]],['rare_loot',[70000,70011,70012,70013]]]) {
      const h=harness(preset,{},[{...category,targetCategory:cat}]);
      h.receive({t:'market',aba:'itens',resumo:summary});
      assert.deepEqual(h.sent.filter(x=>x.t==='market.item').map(x=>x.itemId).sort((a,b)=>a-b),expected);
    }
  });
  test(preset + ': actual scheduler uses 3 seconds, 700 ms offset and rotation', () => {
    const h = harness(preset, {scanMode: 'original', snipeAnyShiny: true}, [category]);
    h.advance(100);
    assert.equal(h.sent.filter(x => x.t === 'market.itens').length, 1);
    assert.equal(h.sent.filter(x => x.t === 'market.listar').length, 0);
    h.advance(699);
    assert.equal(h.sent.filter(x => x.t === 'market.listar').length, 0);
    h.advance(1);
    assert.equal(h.sent.find(x => x.t === 'market.listar').moeda, 'gold');
    h.advance(6000);
    const items = h.sent.filter(x => x.t === 'market.itens');
    const pokemonQueries = h.sent.filter(x => x.t === 'market.listar');
    assert.deepEqual(items.map(x => x.at-items[0].at), [0,3000,6000]);
    assert.deepEqual(pokemonQueries.map(x => x.moeda), ['gold','orb','']);
    assert.deepEqual(pokemonQueries.map((x,i) => x.at-items[i].at), [700,700,700]);
  });
  test(preset + ': pause, rule/config change and disconnect cancel queued queries', () => {
    for (const action of ['pause','rules','config','disconnect']) {
      const h = harness(preset, {snipeAnyShiny: true}, [category]);
      h.advance(100);
      if (action === 'pause') h.control({type:'SET_SNIPER_ENABLED', enabled:false});
      if (action === 'rules') h.control({type:'UPDATE_SNIPER_RULES', rules:[]});
      if (action === 'config') h.control({type:'UPDATE_SNIPER_CONFIG', config:{snipeAnyShiny:false}});
      if (action === 'disconnect') h.socket.close();
      h.advance(700);
      assert.equal(h.sent.filter(x => x.t === 'market.listar').length, 0, action);
    }
  });
  test(preset + ': adaptive mode staggers slow scans and keeps short hot cycles stable', () => {
    const slow = harness(preset,{scanMode:'adaptive',scanIntervalMs:5000,fastScanIntervalMs:500,snipeAnyShiny:true},[category]);
    slow.advance(2200);
    const queries = slow.sent.filter(x=>x.t==='market.listar');
    assert.deepEqual(queries.map(x=>x.moeda),['gold','orb','']);
    assert.deepEqual(queries.map(x=>x.at-slow.sent.find(x=>x.t==='market.itens').at),[700,1400,2100]);
    const hot = harness(preset,{scanMode:'adaptive',scanIntervalMs:5000,fastScanIntervalMs:500,snipeAnyShiny:true},[category]);
    hot.receive({t:'market',aba:'itens',resumo:{2:{minGold:100}}});
    hot.advance(1300);
    assert.deepEqual(hot.sent.filter(x=>x.t==='market.listar').map(x=>x.moeda),['gold','orb']);
    const times = hot.sent.filter(x=>x.t==='market.itens').map(x=>x.at);
    assert.deepEqual(times.map(t=>t-times[0]),[0,500,1000]);
  });
  test(preset + ': category expands canonical IDs and currencies, excluding learned items', () => {
    const h = harness(preset, {}, [category]);
    h.ctx.registerRotomItems([{id:999123, name:'Fake Stone', category:'stone'}]);
    h.receive({t:'market', aba:'itens', resumo:{2:{minGold:100,minOrb:2},70031:{minGold:100,minOrb:2},5:{minGold:100,minOrb:2},999123:{minGold:100,minOrb:2}}});
    const queries = h.sent.filter(x => x.t === 'market.item');
    assert.deepEqual(queries.map(x => `${x.itemId}:${x.moeda}`).sort(), ['2:gold','2:orb','70031:gold','70031:orb']);
  });
  test(preset + ': actual purchase path shares category quantity across items', () => {
    const h = harness(preset, {}, [{...category,totalBought:1}]);
    h.offers([{id:801,tipo:'item',itemId:2,itemNome:'Ancient Stone',preco:100,moeda:'gold',qtd:5}]);
    const buy = h.sent.find(x => x.t === 'market.comprar');
    assert.ok(buy, 'Matching canonical item reaches real buy sender');
    assert.equal(buy.qtd, 2);
    h.offers([{id:802,tipo:'item',itemId:70031,itemNome:'Shiny Stone Bug',preco:100,moeda:'gold',qtd:1}]);
    assert.equal(h.sent.filter(x => x.t === 'market.comprar').length, 1, 'Shared rule budget prevents another item purchase');
  });
  test(preset + ': real storage bridge persists category consumption without double counting', () => {
    const h = harness(preset, {}, [{...category,totalBought:1}]);
    const stored = h.installStorageBridge();
    h.offers([{id:811,tipo:'item',itemId:2,itemNome:'Ancient Stone',preco:100,moeda:'gold',qtd:2}]);
    h.advance(0);
    assert.equal(stored.rotom_sniper_rules[0].totalBought,3);
    assert.equal(h.ctx.__engine.sniperState.rules[0].totalBought,3);
    h.offers([{id:812,tipo:'item',itemId:70031,itemNome:'Shiny Stone Bug',preco:100,moeda:'gold',qtd:1}]);
    assert.equal(h.sent.filter(x=>x.t==='market.comprar').length,1);
  });
  test(preset + ': scheduled category purchases revalidate their shared remaining quantity', () => {
    const h = harness(preset,{},[category]);
    h.offers([
      {id:821,tipo:'item',itemId:2,itemNome:'Ancient Stone',preco:100,moeda:'gold',qtd:2,compravelEm:1_001_000},
      {id:822,tipo:'item',itemId:70031,itemNome:'Shiny Stone Bug',preco:100,moeda:'gold',qtd:2,compravelEm:1_001_000}
    ]);
    h.advance(3000);
    const firstOrders = new Map();
    h.sent.filter(x=>x.t==='market.comprar').forEach(x=>{if(!firstOrders.has(x.id)) firstOrders.set(x.id,x.qtd);});
    assert.equal([...firstOrders.values()].reduce((a,b)=>a+b,0),3);
    for (const buy of h.sent.filter(x=>x.t==='market.comprar')) {
      assert.equal(buy.qtd,firstOrders.get(buy.id),'Retries keep the authorized quantity');
    }
    const exhausted = harness(preset,{},[{...category,maxQty:2}]);
    exhausted.offers([
      {id:831,tipo:'item',itemId:2,itemNome:'Ancient Stone',preco:100,moeda:'gold',qtd:2,compravelEm:1_001_000},
      {id:832,tipo:'item',itemId:70031,itemNome:'Shiny Stone Bug',preco:100,moeda:'gold',qtd:2,compravelEm:1_001_000}
    ]);
    exhausted.advance(3000);
    assert.equal(exhausted.sent.some(x=>x.t==='market.comprar'&&x.id===832),false,'A quota-cancelled order cannot start through a retry');
  });
  test(preset + ': market note threshold and invalid notes use real offer matcher', () => {
    for (const [nota, expected] of [[8.5,true],['8.5',true],[8.4,false],[undefined,false],[null,false],['bad',false],[11,false],[[9],false],[true,false]]) {
      const h = harness(preset, {snipeByNote:true,minNote:8.5,maxPriceNoteGold:100,maxPriceNoteGems:0});
      h.offers([pokemon(901,{ficha:{speciesId:25,nome:'Pikachu',nota}})]);
      assert.equal(h.sent.some(x => x.t === 'market.comprar'), expected, String(nota));
    }
  });
  test(preset + ': shiny/P5 independent radar criteria and currency caps', () => {
    for (const [extra, config, expected] of [
      [{shiny:false,lookShiny:true},{snipeAnyShiny:true,maxPriceShinyGold:100},true],
      [{potencia:5},{snipeAnyP5:true,maxPriceP5Gold:100},true],
      [{potencia:4},{snipeAnyP5:true,maxPriceP5Gold:100},false],
      [{lookShiny:true,moeda:'orb',preco:3},{snipeAnyShiny:true,maxPriceShinyGold:100,maxPriceShinyGems:2},false],
      [{lookShiny:true,moeda:'orb',preco:2},{snipeAnyShiny:true,maxPriceShinyGold:0,maxPriceShinyGems:2},true]
    ]) {
      const h = harness(preset, config); h.offers([pokemon(902,extra)]);
      assert.equal(h.sent.some(x => x.t === 'market.comprar'), expected, JSON.stringify({extra,config}));
    }
  });
}
