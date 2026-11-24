const { test } = require('node:test');
const assert = require('node:assert/strict');
const { forBalance } = require('../src/ui/kick-reward-status');
const now = 1000000;
const balance = points => ({ status: 'verified', points, checkedAt: now, catalogStatus: 'verified', rewards: [{ key:'exp',cost:300,available:true },{ key:'catch',cost:500,available:true },{ key:'lure',cost:1000,available:true }] });
test('each selected buff uses its own cost, including exact thresholds', () => {
  for (const [key, cost] of [['exp', 300], ['catch', 500], ['lure', 1000]]) {
    assert.equal(forBalance(balance(cost - 1), key, now).missing, 1);
    assert.equal(forBalance(balance(cost - 1), key, now).affordable.length, 0);
    assert.equal(forBalance(balance(cost), key, now).affordable[0].key, key);
    assert.match(forBalance(balance(cost * 2), key, now).label, /^2× /);
  }
});
test('all means alternative buffs, never promises their combined purchase', () => {
  assert.equal(forBalance(balance(500), 'all', now).label, '1× EXP ou 1× Capture');
});
test('unknown, failed, stale and malformed balances never signal an affordable buff', () => {
  for (const b of [null, { ...balance(9999), status: 'stale' }, { ...balance(9999), checkedAt: now - 120000 },
    { ...balance(9999), checkedAt: now + 1 }, balance(-1), balance('9999')]) {
    const s = forBalance(b, 'exp', now);
    assert.equal(s.known, false); assert.equal(s.affordable.length, 0);
  }
  assert.equal(forBalance(balance(0), 'exp', now).missing, 300);
});

test('unavailable and unverified catalogs cannot advertise redeemable buffs', () => {
  assert.equal(forBalance({...balance(9000),catalogStatus:'unavailable'},'exp',now).known,false);
  assert.equal(forBalance({...balance(9000),rewards:[]},'exp',now).affordable.length,0);
  assert.equal(forBalance({...balance(9000),rewards:[{key:'exp',cost:301,available:true}]},'exp',now).affordable.length,0);
});

test('a verified 200-point one-hour EXP reward uses its catalog price', () => {
  const discounted = { ...balance(199), rewards: [{ key: 'exp', cost: 200, available: true }] };
  assert.equal(forBalance(discounted, 'exp', now).missing, 1);
  assert.equal(forBalance({ ...discounted, points: 400 }, 'exp', now).label, '2× EXP');
});
