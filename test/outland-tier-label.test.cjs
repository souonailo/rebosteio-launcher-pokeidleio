const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
for (const base of ['.', 'rust-migration/ui']) {
  test(`${base}: shared Outland label requires a live server confirmation`, () => {
    const source = fs.readFileSync(`${base}/src/ui/battle-hud.js`, 'utf8');
    const method = source.match(/outlandTierLabel\(state\) \{([\s\S]*?)\n    \},/);
    assert.ok(method);
    const label = vm.runInNewContext(`(state) => {${method[1]}}`);
    assert.equal(label({live:true,outlandTier:2}), 'Outland · tier 2');
    assert.equal(label({live:false,outlandTier:2}), 'Outland · aguardando confirmação');
    for (const tier of [undefined,null,0,'2',101,2.5]) {
      assert.equal(label({live:true,outlandTier:tier}), 'Outland · aguardando confirmação');
    }
    assert.equal(label({live:true,outlandTier:3}), 'Outland · tier 3');
  });
}
