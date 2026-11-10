'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pio-streamer-modal-'));
app.setPath('userData', path.join(temp, 'profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('log-level', '3');
app.on('window-all-closed', () => {});

const testModule = async relative => {
  const js = pathToFileURL(path.join(root, relative, 'streamer-points-modal.js')).href;
  const css = pathToFileURL(path.join(root, relative, 'streamer-points-modal.css')).href;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{--color-bg-elevated:#0b1930;--color-surface-1:#13253d;--color-surface-2:#1c3150;--color-surface-hover:#294565;--color-text-primary:#f3f6fc;--color-text-secondary:#c5d5ea;--color-text-muted:#8da4c4;--border-subtle:#3b5478;--border-strong:#688dbb}
    html,body{margin:0;min-height:100%;font-family:Segoe UI,sans-serif;background:#081224;color:#fff}
    #opener{position:absolute;left:40px;top:40px;padding:8px}
  </style><link rel="stylesheet" href="${css}"></head><body><button id="opener">Pontos Twitch</button>
    <script>
    const roster = Array.from({length:25},(_,i)=>({login:'partner_'+String(i+1).padStart(2,'0'),verified:true,eligible:true,status:'verified',points:(i+1)*10,hasBalance:true}));
    window.sample = {
      twitch: [roster, [{login:'second_account',eligible:true,verified:true,status:'verified',points:9,hasBalance:true}]],
      kick: [[{login:'kick_live',eligible:true,verified:true,status:'verified',points:500,hasBalance:true},{login:'kick_wait',eligible:true,verified:false,status:'unavailable',points:null,hasBalance:false}]]
    };
    window.PioBattleHud = {pointsSnapshot(index,platform){
      const channels = window.sample[platform]?.[index] || [];
      return {index,platform,hasOfficialList:true,channels,total:channels.reduce((sum,c)=>sum+(c.verified?c.points:0),0),verifiedCount:channels.filter(c=>c.verified).length,pendingCount:channels.filter(c=>!c.verified).length};
    }};
    </script><script src="${js}"></script></body></html>`;
  const file = path.join(temp, relative.includes('rust-migration') ? 'rust.html' : 'electron.html');
  fs.writeFileSync(file, html);
  const win = new BrowserWindow({show:false, width:1120, height:850, backgroundColor:'#081224', webPreferences:{sandbox:true,contextIsolation:true}});
  try {
    await win.loadFile(file);
    const exec = code => win.webContents.executeJavaScript(code);
    await exec("PioStreamerPoints.preview(0,'twitch',document.getElementById('opener'))");
    const initial = await exec(`(()=>({count:document.querySelectorAll('.spm-row').length, summary:document.querySelector('.spm-summary').textContent,first:document.querySelector('.spm-name').textContent,modal:document.querySelector('[role=dialog]').getAttribute('aria-modal'),visible:!document.querySelector('.spm-popover').hidden,width:document.querySelector('.spm-popover').getBoundingClientRect().width,backdrop:!!document.querySelector('.spm-backdrop'),toolbar:!!document.querySelector('.spm-toolbar')}))()`);
    assert.equal(initial.count,25,`${relative}: all 25 channels must be rendered`);
    assert.equal(initial.summary,'25 confirmados · 3.250 pts');
    assert.equal(initial.modal,'false');
    assert.equal(initial.visible,true);
    assert.ok(initial.width <= 320, `${relative}: popover must stay compact`);
    assert.equal(initial.backdrop,false,'no dark screen overlay');
    assert.equal(initial.toolbar,false,'no extra menus or account selectors');
    await exec("PioStreamerPoints.open(0,'kick',document.getElementById('opener'))");
    assert.equal(await exec("document.querySelectorAll('.spm-row').length"),2);
    assert.equal(await exec("document.querySelector('.spm-row:last-child .spm-value').textContent"),'indisponível');
    assert.equal(await exec("getComputedStyle(document.querySelector('.spm-popover')).getPropertyValue('--spm-accent').trim()"),'#78dba8');
    await exec("window.sample.kick[0][0].points=620;PioStreamerPoints.refresh()");
    assert.equal(await exec("document.querySelector('.spm-summary').textContent"),'1 confirmados · 620 pts');
    await exec("PioStreamerPoints.leave()");
    await new Promise(resolve=>setTimeout(resolve,280));
    assert.equal(await exec("document.querySelector('.spm-popover').hidden"),false,'click pins popover for scrolling');
    await exec("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    assert.equal(await exec("document.querySelector('.spm-popover').hidden"),true);
    await exec("PioStreamerPoints.preview(1,'twitch',document.getElementById('opener'))");
    assert.equal(await exec("document.querySelector('.spm-row .spm-name').textContent"),'second_account');
    await exec("PioStreamerPoints.leave()");
    await new Promise(resolve=>setTimeout(resolve,280));
    assert.equal(await exec("document.querySelector('.spm-popover').hidden"),true,'hover preview closes on leaving');
    await exec("PioStreamerPoints.open(0,'twitch',document.getElementById('opener'))");
    win.setContentSize(440,680);
    await exec('PioStreamerPoints.refresh()');
    const mobile = await exec(`(()=>{const box=document.querySelector('.spm-popover').getBoundingClientRect();const list=document.querySelector('.spm-list');return {fits:box.left>=0&&box.right<=innerWidth,scrollable:getComputedStyle(list).overflowY==='auto',maxHeight:box.height<=innerHeight,small:box.width<=320,left:box.left,right:box.right,viewport:innerWidth}})()`);
    assert.equal(mobile.fits,true,`${relative}: popover must not clip the window: ${JSON.stringify(mobile)}`);
    assert.equal(mobile.scrollable,true);
    assert.equal(mobile.maxHeight,true);
    assert.equal(mobile.small,true);
    win.setContentSize(1120,850);
    await exec("document.documentElement.style.setProperty('--color-bg-elevated','#ffffff');document.documentElement.style.setProperty('--color-text-primary','#0f172a')");
    assert.equal(await exec("getComputedStyle(document.querySelector('.spm-popover')).backgroundColor"),'rgb(255, 255, 255)',`${relative}: theme surface is respected`);
    await exec("document.documentElement.style.removeProperty('--color-bg-elevated');document.documentElement.style.removeProperty('--color-text-primary')");
    win.showInactive();
    await new Promise(resolve=>setTimeout(resolve,200));
    const screenshot = path.join(root,'scratch',relative.includes('rust-migration')?'streamer-points-rust.png':'streamer-points-electron.png');
    fs.mkdirSync(path.dirname(screenshot),{recursive:true});
    fs.writeFileSync(screenshot,(await win.webContents.capturePage()).toPNG());
    console.log(`PASS: ${relative} — compact hover/click popup, 25 channels, account isolation, refresh, scroll and Escape; preview ${screenshot}`);
  } finally {
    win.destroy();
  }
};

app.whenReady().then(async()=>{
  await testModule('src/ui');
  await testModule('rust-migration/ui/src/ui');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
