// Integration check in Electron with blank guests, fake accounts and an isolated profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, session, webContents } = require('electron');
const { coalesceScriptLoading } = require('../src/main/guest-runtime');

const root = path.resolve(__dirname, '..');
const guestUrl = pathToFileURL(path.join(__dirname, 'fixtures', 'panel.html')).href;
const output = path.join(root, 'scratch', 'simple-theme-' + Date.now());
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
app.commandLine.appendSwitch('log-level', '3'); app.disableHardwareAcceleration();
const errors = [];
const listenerWarnings = [];
process.on('warning', warning => { if (warning.name === 'MaxListenersExceededWarning') listenerWarnings.push(warning); });
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') coalesceScriptLoading(contents);
});
const fakeAccounts = Array.from({ length: 4 }, (_, i) => ({ name: 'Conta ' + (i + 1), email: 'test' + i, senha: 'test' }));
ipcMain.on('app:version', event => { event.returnValue = 'test'; });
ipcMain.handle('creds:load', () => fakeAccounts);
ipcMain.handle('creds:save', () => true);
ipcMain.handle('twitch:creds:load', () => ({}));
ipcMain.handle('kick:creds:load', () => ({masterEnabled:true}));
ipcMain.handle('kick:status:get', () => ({accounts:[],liveChannels:[]}));
ipcMain.handle('kick:sync-lives', () => true);
ipcMain.handle('kick:points:get', () => ({accounts:[]}));
ipcMain.handle('kick:points:channels', () => true);
let openedSession = null;
ipcMain.handle('kick:creds:save', () => true);
ipcMain.handle('kick:session:open', (_event,index,slug) => { openedSession={index,slug};return {ok:true}; });
ipcMain.handle('twitch:status:get', () => ({}));
ipcMain.handle('errlog:write', (_event, origin, message) => errors.push(origin + ': ' + message));
for (const name of ['awake:set', 'mintray:set', 'notify', 'backup:save', 'proxy:apply', 'auth:cancel-login']) ipcMain.handle(name, () => true);
ipcMain.handle('autostart:get', () => ({ on: false, suportado: false }));
ipcMain.handle('window:control', () => ({ maximized: false }));
ipcMain.handle('auth:camoufox-check', () => ({ available: false }));
ipcMain.handle('auth:camoufox-login', () => ({ success: false }));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
const read = code => win.webContents.executeJavaScript(code);
async function ready() {
  for (let i = 0; i < 80; i++) {
    if (await read('webviews.length === 4 && !!document.getElementById("leafShell") && webviews.every(w => { try { return w.getURL() === ' + JSON.stringify(guestUrl) + '; } catch { return false; } })')) return;
    await pause(100);
  }
  throw new Error('Launcher did not initialize: ' + errors.join('\n'));
}
app.whenReady().then(async () => {
 const deny=s=>s.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_,cb)=>cb({cancel:true}));
 deny(session.defaultSession);for(let i=1;i<=4;i++)deny(session.fromPartition('persist:conta'+i));
 win=new BrowserWindow({width:1600,height:950,show:false,webPreferences:{offscreen:false,webviewTag:true,preload:path.join(root,'preload.js'),backgroundThrottling:false}});
 win.webContents.on('will-attach-webview',(_,p,params)=>{params.src=guestUrl});
 await win.loadFile(path.join(root,'index.html'));await ready();


 const badge=()=>read("document.getElementById('leafKickBonusBadge').textContent");
 assert.equal(await badge(),'ON','saved enabled setting at startup');
 for(const status of ['connecting','disconnected','connected']) {
  win.webContents.send('kick:status:update',{masterEnabled:true,accounts:[{status}],liveChannels:[]});
  await pause(60);
  assert.equal(await badge(),'ON','closed modal, '+status);
 }
 await read('openKickBonusModal()');
 assert.equal(await badge(),'ON','open modal');
 await read('kickMasterToggle.click()');
 assert.equal(await badge(),'OFF','disabled setting');
 await read('closeKickBonusModal()');
 win.webContents.send('kick:status:update',{masterEnabled:true,accounts:[{status:'connected'}],liveChannels:[]});
 await pause(60);
 assert.equal(await badge(),'OFF','connection cannot override disabled setting');
 await read('kickMasterToggle.click();openKickBonusModal()');
 assert.equal(await badge(),'ON','reenabled while disconnected');

 const fixture={oficiais:[{slug:'biscoitao',name:'Display Name',aoVivo:true,ativo:true,espectadores:450},{slug:'matta',aoVivo:false,ativo:true},{slug:'surskity',aoVivo:true,ativo:false,espectadores:20}]};
 const feed=async (index,k)=>read('handleKickGameTelemetry('+index+',stSane({ok:true,kick:'+JSON.stringify(k)+'}).kick)');
 const snapshot=()=>read(`(()=>({live:document.getElementById('kickCountLive').textContent,all:document.getElementById('kickCountAll').textContent,off:document.getElementById('kickCountOff').textContent,rows:[...document.querySelectorAll('#kickStreamersList .kick-streamer-name')].map(e=>e.textContent)}))()`);
 await feed(0,fixture);
 let state=await snapshot(); assert.equal(state.live,'2');assert.equal(state.all,'3');assert.equal(state.off,'1');assert.equal(state.rows[0],'@biscoitao');assert.ok(!state.rows.includes('@display name'));assert.ok(state.rows.includes('@surskity'));
 await read('kickBonusLiveState={liveChannels:["biscoitao"]}');
 await feed(1,{oficiais:fixture.oficiais.map(c=>({...c,aoVivo:false}))});
 state=await snapshot();assert.equal(state.live,'2');assert.equal(state.all,'3');assert.equal(state.off,'1');
 await feed(0,{lives:['biscoitao','not_an_official'],offline:['matta']});state=await snapshot();assert.equal(state.live,'2');assert.equal(state.all,'3');

 await read("kickBonusConfig.accounts[0].username='viewer0';kickBonusConfig.accounts[0].channelPoints={biscoitao:999999};renderKickBonusUI()");
 const pointsText=()=>read("document.querySelector('#kickStreamersList .kick-points-tag').textContent.trim()");
 assert.equal(await pointsText(),'Saldo indisponível','legacy/manual points cannot be displayed as real');
 assert.equal(await read("document.getElementById('kickAutoClaimToggle').disabled"),true);
 assert.equal(await read("document.querySelectorAll('.kick-edit-pen').length"),0);
 const publish=async state=>{win.webContents.send('kick:points:update',state);await pause(60)};
 await publish({accounts:[{status:'authenticated',username:'viewer0',balances:{biscoitao:{status:'verified',points:321,checkedAt:Date.now()}}}]});
 assert.equal(await pointsText(),'321 pts');
 await publish({accounts:[{status:'authenticated',username:'viewer0',balances:{biscoitao:{status:'verified',points:0,checkedAt:Date.now()}}}]});
 assert.equal(await pointsText(),'0 pts','only a confirmed server zero displays zero');
 await publish({accounts:[{status:'blocked',username:'viewer0',balances:{biscoitao:{status:'stale',points:321,checkedAt:Date.now()}}}]});
 assert.equal(await pointsText(),'Saldo indisponível');
 await publish({accounts:[{status:'authenticated',username:'wrongviewer',balances:{biscoitao:{status:'verified',points:999,checkedAt:Date.now()}}}]});
 assert.equal(await pointsText(),'Saldo indisponível','wrong identity must never display balance');
 await read("document.querySelector('.kick-open-channel').click()");await pause(80);
 assert.deepEqual(openedSession,{index:0,slug:'biscoitao'});
 await feed(0,fixture);
 await publish({accounts:[{status:'authenticated',username:'viewer0',balances:{biscoitao:{status:'verified',points:321,checkedAt:Date.now()},matta:{status:'verified',points:0,checkedAt:Date.now()}}}]});
 for(const theme of ['pkmn-gengar','pure-white']) {
  await read('PIWThemeManager.selectTheme('+JSON.stringify(theme)+')');
  for(const [w,h]of [[1920,1032],[1600,950],[820,720]]) {
   win.setContentSize(w,h);await pause(150);
   assert.equal(await read("(()=>{const m=document.getElementById('kickBonusModal');return m.scrollWidth>m.clientWidth})()"),false);
   fs.writeFileSync(path.join(output,theme+'-'+w+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  }
 }
 console.log('PASS: Kick badge, streamers, real/unknown/zero/stale/wrong-account balances, official channel action, disabled unsupported auto-claim; screenshots '+output);
 win.destroy();app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});
