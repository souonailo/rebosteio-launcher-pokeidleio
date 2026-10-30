const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const notes = require('../rust-migration/ui/src/ui/capture-notes');
const {render} = require('../rust-migration/ui/src/ui/stones-panel');
const {install, mergeSnapshots} = require('../rust-migration/ui/src/ui/market-prices');

test('note fields reconcile delayed and legacy data without inventing missing power', () => {
  assert.deepEqual(notes.attributes({nt:4.25,pot:'P3'}),{nota:4.25,potencia:3});
  assert.deepEqual(notes.attributes({nota:0,potencia:1}),{nota:0,potencia:1});
  assert.deepEqual(notes.attributes({nota:null,potencia:null}),{nota:null,potencia:null});
  assert.deepEqual(notes.attributes({nota:Infinity,potencia:6}),{nota:null,potencia:null});
});

test('stone matrix keeps accounts on right; unknown prices cannot produce zero totals', () => {
  const args = {today:{'Fire Stone':{qtd:3,porConta:{1:3}}},week:{'Fire Stone':{qtd:10}},accounts:['One','Two','Three','Four'],prices:{},icons:{},at:0};
  const unknown = render(args);
  assert.match(unknown,/<td>3<\/td><td>—<\/td><th scope="row">One/);
  const known = render({...args,prices:{'fire stone':{gold:101.5}}});
  assert.match(known,/<td>3<\/td><td>258<\/td><th scope="row">One/);
  assert.match(known,/Média RMT/);
  assert.match(known,/Total 7 dias/);
  assert.equal((known.match(/scope="row">(?:One|Two|Three|Four)/g)||[]).length,4);
});

test('RMT collector requests read-only means on open and market, saves server mean not minimum', async () => {
  const sent=[], listeners={}, timers=[], stored={};
  const socket = {readyState:1,send(s){sent.push(JSON.parse(s));},addEventListener(t,fn){listeners[t]=fn;},removeEventListener(){}};
  let now=100000;
  const context = {document:{addEventListener(){}},window:{addEventListener(){},__poke:{sock:socket,ws:{welcome:{economia:{taxaMercadoGoldPct:15}}}}},
    Date:{now:()=>now},setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},setInterval(){},
    localStorage:{getItem(k){return stored[k] || null;},setItem(k,v){stored[k]=v;}},fetch:async()=>({ok:true,json:async()=>({items:[{id:53,name:'Fire Stone',icon:'fire.gif'}]})})};
  vm.runInNewContext('('+install.toString()+')()',context);
  assert.deepEqual(sent,[{t:'market.medias'}]);
  listeners.message({data:JSON.stringify({t:'market',aba:'medias',medias:{53:{gold:{media:123.5,unidades:10}}}})});
  await new Promise(r=>setImmediate(r));
  assert.equal(JSON.parse(stored['pio-rmt-means-v1']).items['fire stone'].gold,123.5);
  assert.equal(JSON.parse(stored['pio-rmt-means-v1']).taxGold,.15);
  now+=16000;socket.send(JSON.stringify({t:'market.favoritos'}));timers.pop()();
  assert.equal(sent.at(-1).t,'market.medias');
  assert.ok(sent.every(x=>!['market.comprar','market.criar'].includes(x.t)));
  listeners.message({data:JSON.stringify({t:'market',aba:'medias',medias:{}})});
  await new Promise(r=>setImmediate(r));
  assert.equal(JSON.parse(stored['pio-rmt-means-v1']).items['fire stone'].gold,123.5);
  assert.equal(JSON.parse(stored['pio-rmt-means-v1']).at,100000);
  delete context.window.__pioMarketPrices;
  vm.runInNewContext('('+install.toString()+')()',context);
  assert.equal(context.window.__pioMarketPrices.items['fire stone'].gold,123.5,'restored when webview reopens');
  now+=16000;
  listeners.message({data:JSON.stringify({t:'market',aba:'medias',medias:{53:{gold:{media:0},orb:{media:7}}}})});
  await new Promise(r=>setImmediate(r));
  const partial=JSON.parse(stored['pio-rmt-means-v1']);
  assert.equal(partial.items['fire stone'].gold,123.5);
  assert.equal(partial.items['fire stone'].goldAt,100000);
  assert.equal(partial.items['fire stone'].orb,7);
  now+=16000;
  listeners.message({data:JSON.stringify({t:'market',aba:'medias',medias:{53:{gold:{media:200}}}})});
  await new Promise(r=>setImmediate(r));
  assert.equal(JSON.parse(stored['pio-rmt-means-v1']).items['fire stone'].gold,200);
});

test('launcher cache retains prices across partial readings, another account and restart', () => {
  const before={at:100, taxGold:.15, items:{fire:{gold:123,at:100},rock:{gold:456,at:100}}};
  const merged=mergeSnapshots(before,{at:200,items:{fire:{gold:null,orb:3,at:200}}});
  assert.equal(merged.items.fire.gold,123);
  assert.equal(merged.items.rock.gold,456);
  assert.equal(merged.taxGold,.15);
  const restored=JSON.parse(JSON.stringify(merged));
  const refreshed=mergeSnapshots(restored,{at:300,items:{fire:{gold:789,goldAt:300,orb:2,orbAt:50,at:300}}});
  assert.equal(refreshed.items.fire.gold,789);
  assert.equal(refreshed.items.fire.orb,3,'older currency reading cannot overwrite newer value');
  assert.equal(refreshed.items.rock.gold,456);
  assert.deepEqual(mergeSnapshots(refreshed,{at:400,items:{}}).items,refreshed.items);
});

test('headless note uses the bundled game formula and refuses insufficient inputs', async () => {
  const oldFetch=global.fetch;
  global.fetch=async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('rust-migration/ui/src/ui/game-note/catalog.json','utf8'))});
  try { await notes.load(); } finally {global.fetch=oldFetch;}
  const {notaDePokemon}=await import('../rust-migration/ui/src/ui/game-note/nota-pokemon.mjs');
  const species=JSON.parse(fs.readFileSync('rust-migration/ui/src/ui/game-note/catalog.json','utf8')).find(x=>x.pokeId===979);
  const input={sid:979,iv:94,q:1.52,potencia:3,sh:false};
  assert.equal(notes.enrich({...input}).nota,notaDePokemon({iv:94,quality:1.52,potencia:3,shiny:false},species));
  assert.equal(notes.enrich({...input,potencia:null}).nota,null);
  assert.equal(notes.enrich({...input,sid:999999}).nota,null);
  assert.equal(notes.enrich({...input,sid:0,n:'Annihilape'}).sid,979);
});
