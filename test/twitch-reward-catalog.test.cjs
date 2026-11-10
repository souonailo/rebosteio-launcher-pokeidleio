'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {catalog} = require('../src/domain/twitch-reward-catalog');
const reward = {id:'12345678-1234-1234-1234-123456789abc',title:'+15% XP PokeIdle',prompt:'',cost:300,
  isEnabled:true,isPaused:false,isInStock:true,isUserInputRequired:false,pricingType:'POINTS',cooldownExpiresAt:null};
test('Twitch availability requires the real reward, exact price and complete availability flags', () => {
  assert.equal(catalog([reward])[0].available, true);
  for (const key of ['isEnabled','isPaused','isInStock','isUserInputRequired','pricingType','cooldownExpiresAt']) {
    const incomplete = {...reward};delete incomplete[key];
    assert.equal(catalog([incomplete])[0].available, false, key);
  }
  for (const changes of [{cost:500},{isPaused:true},{isInStock:false},{isUserInputRequired:true},{pricingType:'BITS'},{cooldownExpiresAt:'2030-01-01'}]) {
    assert.equal(catalog([{...reward,...changes}])[0].available,false);
  }
  assert.equal(catalog([{...reward,isPaused:true}])[0].trialPaused,true);
  assert.equal(catalog([{...reward,isPaused:true,isEnabled:false}])[0].trialPaused,false);
  assert.equal(catalog([{...reward,isPaused:true,isInStock:false}])[0].trialPaused,false);
  assert.deepEqual(catalog([{...reward,title:'Unrelated prize'},{...reward,id:'not-a-uuid'},null]),[]);
  assert.deepEqual(catalog(null),[]);
});

test('Twitch reports a pause but the UI distinguishes pending confirmation from confirmed availability', () => {
  const {forBalance} = require('../src/ui/twitch-reward-status');
  const paused = {...reward, id:'147118bf-b3fb-4b34-8666-4d673fb1a5c1', title:'Bônus de +15% Capture Boost',
    prompt:'1 hora de bônus PokeIdle',cost:500,isPaused:true};
  const balance={status:'verified',catalogStatus:'verified',checkedAt:1000,points:600,rewards:catalog([paused])};
  const view=forBalance(balance,'catch',1001);
  assert.equal(view.affordable.length,0);
  assert.equal(view.trials.length,1);
  assert.match(view.label,/pausa.*confirmar/i);
  assert.equal(forBalance(balance,'exp',1001).trials.length,0);
});

test('real catalog preserves all twelve duration/cost variants and exact redemption descriptions', () => {
  const raw = require('./fixtures/twitch-rewards-live.json');
  const items = catalog(raw);
  assert.equal(items.length, 12);
  for (const [key,base] of Object.entries({exp:300,catch:500,lure:1000})) {
    for (const hours of [1,3,5,10]) {
      const item = items.find(r => r.key===key && r.durationHours===hours);
      assert.ok(item); assert.equal(item.cost,base*hours); assert.equal(item.available,true);
      assert.equal(item.prompt,raw.find(r=>r.id===item.id).prompt);
    }
  }
});

test('duration UI never saves for a larger reward while a cheaper one is affordable', () => {
  const {forBalance} = require('../src/ui/twitch-reward-status');
  const rewards = catalog(require('./fixtures/twitch-rewards-live.json')).reverse();
  const balance={status:'verified',catalogStatus:'verified',checkedAt:1000,points:6000,rewards};
  let result=forBalance(balance,'catch',1001);
  assert.equal(result.affordable[0].cost,500);
  assert.equal(result.options.length,4);
  assert.match(result.label,/Capture.*1h/);
  balance.points=500; assert.equal(forBalance(balance,'catch',1001).affordable[0].cost,500);
  balance.points=499; assert.match(forBalance(balance,'catch',1001).label,/Faltam 1 pts/);
  balance.points=1500; balance.rewards=balance.rewards.map(r=>r.key==='catch'&&r.cost===500?{...r,available:false}:r);
  assert.equal(forBalance(balance,'catch',1001).affordable[0].durationHours,3);
  assert.equal(forBalance(balance,'catch',121000).known,false);
});
