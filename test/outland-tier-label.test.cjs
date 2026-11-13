const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
for (const base of ['.', 'rust-migration/ui']) {
  test(`${base}: shared Outland label requires the current Outland hunt`, () => {
    const source = fs.readFileSync(`${base}/src/ui/battle-hud.js`, 'utf8');
    const method = source.match(/outlandTierLabel\(state\) \{([\s\S]*?)\n    \},/);
    assert.ok(method);
    const label = vm.runInNewContext(`(state) => {${method[1]}}`);
    for (const hunt of ['vulpix', 'centro', '', undefined]) {
      assert.equal(label({hunt,live:true,outlandTier:2}), '');
    }
    assert.equal(label({hunt:'enraged_typhlosion',inCenter:true,live:true,outlandTier:2}), '');
    assert.equal(label({hunt:'enraged_typhlosion',bossLive:{inArena:true},live:true,outlandTier:2}), '');
    assert.equal(label({hunt:'enraged_typhlosion',live:true,outlandTier:2}), 'Outland · tier 2');
    assert.equal(label({hunt:'enraged_typhlosion',live:false,outlandTier:2}), 'Outland · aguardando confirmação');
    for (const tier of [undefined,null,0,'2',101,2.5]) {
      assert.equal(label({hunt:'enraged_typhlosion',live:true,outlandTier:tier}), 'Outland · aguardando confirmação');
    }
    assert.equal(label({hunt:'Brave Blastoise',live:true,outlandTier:3}), 'Outland · tier 3');
  });
}
