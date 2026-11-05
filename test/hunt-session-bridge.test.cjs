const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('rust-migration/src-tauri/src/hunt_session_bridge.js', 'utf8');
test('handoff flushes unsaved official counters before freezing the socket', () => {
  const storage = new Map([['nick','Nailo'], ['sessao-hunt:nailo', JSON.stringify({ms:1000,xpTreinador:10})]]);
  const order = [];
  const window = {
    __poke: {estado: {outlandTier: 2}},
    dispatchEvent(event) {
      assert.equal(event.type, 'pagehide');
      order.push('save');
      storage.set('sessao-hunt:nailo', JSON.stringify({ms:1242987,xpTreinador:32782822,xpPokemon:32782822}));
    },
    __idleioFreezeGameplay() { order.push('freeze'); }
  };
  window.top = window;
  vm.runInNewContext(source, {window, Event, localStorage:{getItem:key => storage.get(key) ?? null}});
  const result = window.__idleioTakeHuntSession();
  assert.equal(result.saved.xpTreinador,32782822);
  assert.equal(result.saved.ms,1242987);
  assert.equal(result.nick,'Nailo');
  assert.equal(result.outlandTier,2);
  assert.deepEqual(order,['save','freeze']);
});
test('missing history fails without freezing gameplay', () => {
  let frozen = false;
  const window = {dispatchEvent(){}, __idleioFreezeGameplay(){frozen=true;}};
  window.top = window;
  vm.runInNewContext(source, {window, Event, localStorage:{getItem:key => key === 'nick' ? 'Nailo' : null}});
  assert.throws(() => window.__idleioTakeHuntSession(), /Histórico/);
  assert.equal(frozen,false);
});
