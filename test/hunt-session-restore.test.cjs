const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const rust = fs.readFileSync('rust-migration/src-tauri/src/game_headless.rs','utf8');
const template = rust.match(/format!\(r#"([\s\S]*?const marker = 'pio:hunt-handoff:'[\s\S]*?)"#\)/)[1];
function restore(nick, saved) {
  return template.replaceAll('{{','{').replaceAll('}}','}')
    .replace('{nick}',JSON.stringify(nick)).replace('{saved}',JSON.stringify(saved))
    .replace('{nonce}',JSON.stringify(nick+':'+JSON.stringify(saved)));
}
test('native restore runs once and never overwrites a later game reset on reload', () => {
  const values = new Map([['nick','Nailo']]);
  const window = {}; window.top=window;
  const context = vm.createContext({window, location:{hostname:'pokeidle.io'},localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});
  const saved = {ms:1242987,xpTreinador:32782822,xpPokemon:32782822};
  const script = restore('nailo',saved);
  vm.runInContext(script,context);
  assert.deepEqual(JSON.parse(values.get('sessao-hunt:nailo')),saved);
  const reset = JSON.stringify({ms:0,xpTreinador:0});
  values.set('sessao-hunt:nailo',reset);
  vm.runInContext(script,context);
  assert.equal(values.get('sessao-hunt:nailo'),reset);
  vm.runInContext(restore('nailo',{ms:30000,xpTreinador:99}),context);
  assert.equal(JSON.parse(values.get('sessao-hunt:nailo')).xpTreinador,99);
});
test('native restore is isolated by account and game origin', () => {
  const values = new Map([['nick','Nailo2']]);
  const window = {}; window.top=window;
  const context=vm.createContext({window,location:{hostname:'pokeidle.io'},localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});
  vm.runInContext(restore('nailo',{ms:1,xpTreinador:1}),context);
  assert.equal(values.size,1);
  values.set('nick','Nailo'); context.location.hostname='other.example';
  vm.runInContext(restore('nailo',{ms:1,xpTreinador:1}),context);
  assert.equal(values.size,1);
});
