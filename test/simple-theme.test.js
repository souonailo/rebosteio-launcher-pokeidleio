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
 await read('document.getElementById("leafSimple").click()');
 await pause(100);
 const ids=await read('webviews.map(w=>w.getWebContentsId())');
 const themes=await read('PIWThemeManager.getThemes().map(t=>t.id).filter(id=>!id.startsWith("pkmn-")||["pkmn-psyduck","pkmn-magnezone","pkmn-flareon","pkmn-gengar","pkmn-meganium"].includes(id))');
 const results=[];
 for(const id of themes){
  await read('PIWThemeManager.selectTheme('+JSON.stringify(id)+')');await pause(60);
  const state=await read(`(()=>{const c=document.getElementById('cards'),probe=document.createElement('div');c.appendChild(probe);const expected=prop=>{probe.style.backgroundColor='var('+prop+')';return getComputedStyle(probe).backgroundColor};const css=e=>getComputedStyle(e);const k=c.querySelector('.cd-kpi'),b=c.querySelector('button'),label=k.querySelector('.l');const result={id:document.body.dataset.theme,on:document.body.classList.contains('cards-on'),base:css(c).backgroundColor,surface:css(k).backgroundColor,label:css(label).color,button:css(b).backgroundColor,expectedBase:expected('--color-bg-base'),expectedSurface:expected('--color-surface-1'),expectedButton:expected('--color-bg-elevated'),gridOpacity:css(document.getElementById('grid')).opacity,guestIds:webviews.map(w=>w.getWebContentsId())};probe.remove();return result})()`);
  assert.equal(state.id,id);assert.equal(state.on,true);assert.equal(state.gridOpacity,'0');assert.deepEqual(state.guestIds,ids);
  if(!id.startsWith('kuromi-xp')){assert.equal(state.base,state.expectedBase,id+' background');assert.equal(state.surface,state.expectedSurface,id+' card');assert.equal(state.button,state.expectedButton,id+' button');}
  results.push(state);
 }
 for(const id of ['pkmn-flareon','pure-white','absol-night','kuromi-xp-light']){
  await read('PIWThemeManager.selectTheme('+JSON.stringify(id)+')');
  for(const [width,height]of [[1920,1032],[1600,950],[820,720]]){
   win.setContentSize(width,height);await pause(150);
   fs.writeFileSync(path.join(output,id+'-'+width+'.png'),(await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  }
 }
 // Simples e uma aba do grupo exclusivo Janelas/Lista/Simples: sai dele escolhendo outra vista.
 await read('document.querySelector(\'#leafViewTabs [data-view="windows"]\').click()');assert.equal(await read('document.body.classList.contains("cards-on")'),false);
 fs.writeFileSync(path.join(output,'theme-results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({output,themes:results.length,checks:'palette, live theme switch, simple toggle, preserved guests',screenshots:12}));win.destroy();app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});
