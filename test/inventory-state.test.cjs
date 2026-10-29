const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync('rust-migration/ui/src/ui/inventory-state.js','utf8'),context);
const project = s => JSON.parse(JSON.stringify(context.window.PioInventory.project(s)));
test('selected ball falls back in configured order and infinite stock stays infinite',()=>{
  const s = {ballsKnown:true,inventoryKnown:true,ballMap:{1:30,4:0,5:1},invMap:{200:8,203:2,205:4,206:1,999:900},automation:{ballIds:[4,1]},ballCatalog:[{id:5,infinite:true}]};
  let d = project(s);
  assert.equal(d.balls,30); assert.equal(d.equippedBall.id,'1'); assert.equal(d.potions,10); assert.equal(d.revives,5);
  d=project({...s,automation:{ballIds:[5]}});
  assert.equal(d.equippedBall.infinite,true); assert.equal(d.ballMap[5],'∞');
});
test('unknown inventory never inherits cached totals or creates zero stock',()=>{
  const d=project({ballsKnown:false,inventoryKnown:false,balls:100,potions:20,revives:9,ballMap:{1:100},invMap:{200:20}});
  assert.equal(d.balls,null); assert.equal(d.potions,null); assert.equal(d.revives,null);
  assert.deepEqual(d.invMap,{}); assert.deepEqual(d.ballMap,{}); assert.equal(d.equippedBall,null);
});
test('received empty stock is zero, and switching maps removes old items',()=>{
  const d=project({ballsKnown:true,inventoryKnown:true,ballMap:{1:0},invMap:{},potions:90,revives:30});
  assert.equal(d.balls,0); assert.equal(d.potions,0); assert.equal(d.revives,0);
});

test('a new snapshot does not inherit the previous equipped ball',()=>{
  const d=project({ballsKnown:true,inventoryKnown:true,ballMap:{1:40,4:12},invMap:{},automation:{},equippedBall:{id:1,name:'old'}});
  assert.equal(d.equippedBall.id,'4'); assert.equal(d.balls,12);
});

test('synthesizes bag, drops and session metrics for headless telemetry',()=>{
  const s = {
    ballsKnown: true,
    inventoryKnown: true,
    ballMap: { 1: 50, 4: 10 },
    invMap: { 205: 12, 206: 3, 200: 5 },
    rawDrops: { 100: { id: 100, name: 'Thunder Stone', qty: 2 } },
    sessStart: 1234567,
    a: { kills: 15, captures: 4, shinyFound: 1, shinyCap: 1, supplyGold: 100 },
    catchLog: [{ n: 'Pikachu', t: 100 }],
    shinyLog: [{ n: 'Pikachu', t: 100, def: 1 }]
  };
  const d = project(s);
  assert.equal(d.bag.find(g => g.label === 'Pokébolas').total, 60);
  assert.equal(d.bag.find(g => g.label === 'Revive').total, 15);
  assert.equal(d.drops['100'].qty, 2);
  assert.equal(d.sess.st, 1234567);
  assert.equal(d.sess.k, 15);
  assert.equal(d.sess.c, 4);
  assert.equal(d.sess.sf, 1);
  assert.equal(d.sess.sc, 1);
  assert.equal(d.catchLog.length, 1);
  assert.equal(d.shinyLog.length, 1);
});
