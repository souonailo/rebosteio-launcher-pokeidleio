// Full native UI with an isolated profile and a fake native bridge. No real accounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');

const root = path.resolve(__dirname, '..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pio-hud-memory-')));
app.commandLine.appendSwitch('log-level', '3');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((request, done) => done({cancel: /^https?:/.test(request.url)}));
  const win = new BrowserWindow({show: false, width: 1600, height: 950, webPreferences: {
    contextIsolation: false, nodeIntegration: false, backgroundThrottling: false,
    preload: path.join(__dirname, 'fixtures/hud-memory-preload.cjs')
  }});
  const read = script => win.webContents.executeJavaScript(script);
  await win.loadFile(path.join(root, 'rust-migration/ui/index.html'));
  await pause(1000);
  win.showInactive();
  await read(`__fixtureEmit('window:visibility',true); __fixtureStates.forEach((state,index)=>__fixtureEmit('blaster:update',{index,state}));`);
  await pause(150);
  assert.equal(await read(`document.querySelectorAll('.panel.is-blaster-active').length`), 4);

  await read(`window.__hudMutations=0; window.__hudObserver=new MutationObserver(records=>__hudMutations+=records.length);
    document.querySelectorAll('.battle-slot-hud').forEach(hud=>__hudObserver.observe(hud,{subtree:true,attributes:true,childList:true,characterData:true}));
    window.__chromeMutations=0; window.__chromeObserver=new MutationObserver(records=>__chromeMutations+=records.length);
    document.querySelectorAll('.panel-header .status,.panel-header .dot,#leafTwitchBonusBadge,#leafKickBonusBadge,#twitchGlobalBonusPill').forEach(el=>__chromeObserver.observe(el,{subtree:true,attributes:true,childList:true,characterData:true}));
    window.__beforeCalls={...__fixtureCalls}; __fixtureEmit('window:visibility',false);`);
  await pause(50);
  await read(`__hudMutations=0; __chromeMutations=0;
  __fixtureStates[0].sessStart=12345000; __fixtureStates[0].invMap[70000]=30;
  __fixtureEmit('blaster:update',{index:0,state:__fixtureStates[0]});
  __fixtureStates[0].invMap[70000]=40; __fixtureStates[0].rawDrops={70000:{id:70000,name:'Bronze Boss Token',qty:2}};
  for(let step=0;step<100;step++)__fixtureStates.forEach((state,index)=>{
    state.a.seconds=7000+step; state.a.kills=200+step;
    __fixtureEmit('blaster:update',{index,state});
  });
  for(const platform of ['twitch','kick'])__fixtureEmit(platform+':points',{accounts:__fixtureStates.map(()=>({balances:{partner:{status:'verified',points:876,checkedAt:Date.now()}}}))});`);
  await pause(150);
  assert.equal(await read('__hudMutations'), 0, 'native hidden event suppresses HUD DOM writes even if document.visible');
  assert.equal(await read('__chromeMutations'), 0, 'unchanged connection and bonus indicators do not rebuild hidden text');
  assert.deepEqual(await read(`__fixtureStates.map((_,i)=>window.stCache[i].d.a.seconds)`), [7099,7099,7099,7099], 'telemetry still reaches every account while hidden');
  assert.equal(await read(`['blaster_stop','account_clear','creds_save','kick_creds_save','twitch_creds_save'].some(k=>(__fixtureCalls[k]||0)!==(__beforeCalls[k]||0))`), false, 'render suppression does not change sessions or services');
  await read(`for(const platform of ['twitch','kick'])__fixtureEmit(platform+':status',{masterEnabled:true,accounts:__fixtureStates.map(()=>({status:'authenticated'}))})`);
  await pause(50);
  assert.equal(await read('__hudMutations'), 0, 'session status events are retained without painting the hidden HUD');

  await read(`__fixtureEmit('window:visibility',true)`);
  await pause(150);
  assert.deepEqual(await read(`[...document.querySelectorAll('.bsh-val-time')].map(el=>el.textContent)`), Array(4).fill('1h 58m 19s'));
  assert.equal(await read(`document.querySelector('.bsh-drop-boss_token .bsh-drop-qty').textContent`), 'x30', 'session baseline is captured while hidden, before later inventory updates');
  assert.ok((await read(`[...document.querySelectorAll('.bsh-twitch-points,.bsh-kick-points')].map(el=>el.textContent)`)).every(text=>text.includes('876')), 'both latest wallets appear on restore');
  assert.deepEqual(await read(`[...document.querySelectorAll('.bsh-social-status')].map(el=>el.textContent)`), Array(8).fill('Sessão confirmada'), 'latest confirmed session status restores for both platforms');

  // A new state must remain synchronous while visible; identical states must not churn the tree.
  await read(`__hudMutations=0; __fixtureStates.forEach((state,index)=>PioBattleHud.update(document.querySelectorAll('.panel')[index],index,state));`);
  await pause(50);
  assert.equal(await read('__hudMutations'), 0, 'unchanged HUD values produce no DOM writes');
  await read(`__fixtureStates[0].a.seconds=7200; __fixtureEmit('blaster:update',{index:0,state:__fixtureStates[0]})`);
  assert.equal(await read(`document.querySelector('.bsh-val-time').textContent`), '2h 00m 00s');
  await read(`__fixtureEmit('window:visibility',false); __fixtureStates[0].a.seconds=7300; __fixtureEmit('blaster:update',{index:0,state:__fixtureStates[0]}); __fixtureEmit('window:visibility',true)`);
  await pause(50);
  assert.equal(await read(`document.querySelector('.bsh-val-time').textContent`), '2h 01m 40s', 'repeated hide/restore never replays an old pending snapshot');
  assert.deepEqual(await read(`(()=>{
    const image=document.querySelector('.bsh-lead-sprite');
    const state={...__fixtureStates[0],team:[{sid:1,name:'Bulbasaur',ld:true}]};
    PioBattleHud.update(document.querySelector('.panel'),0,state);
    image.onerror(); const fallback=image.getAttribute('src'); image.onerror();
    const stopped=image.onerror===null;
    PioBattleHud.update(document.querySelector('.panel'),0,state);
    return {stopped,unchanged:image.getAttribute('src')===fallback,hidden:image.style.opacity==='0'};
  })()`), {stopped:true,unchanged:true,hidden:true}, 'failed sprite fallback stops after one retry and is not restarted by telemetry');
  console.log('PASS: hidden HUD writes stop, all four telemetry streams continue, latest bonuses/points restore, unchanged values stay untouched.');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
