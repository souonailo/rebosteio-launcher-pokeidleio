const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, session } = require('electron');
const { coalesceScriptLoading } = require('../src/main/guest-runtime');

const root = path.resolve(__dirname, '..');
const guestUrl = pathToFileURL(path.join(__dirname, 'fixtures', 'panel.html')).href;
const output = path.join(root, 'scratch', 'battle-hud-' + Date.now());
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
app.commandLine.appendSwitch('log-level', '3');

const errors = [];
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') coalesceScriptLoading(contents);
});

const fakeAccounts = Array.from({ length: 4 }, (_, i) => ({ name: 'Conta ' + (i + 1), email: 'test' + i, senha: 'test' }));
ipcMain.on('app:version', event => { event.returnValue = '1.5.64'; });
ipcMain.on('instance:id', event => { event.returnValue = 1; });
ipcMain.handle('creds:load', () => fakeAccounts);
ipcMain.handle('creds:save', () => true);
ipcMain.handle('errlog:write', (_event, origin, message) => errors.push(origin + ': ' + message));
for (const name of ['awake:set', 'mintray:set', 'notify', 'backup:save', 'proxy:apply', 'auth:cancel-login', 'kick:creds:load', 'twitch:creds:load', 'kick:status:get', 'twitch:status:get', 'blaster:start', 'blaster:stop']) {
  ipcMain.handle(name, () => true);
}
ipcMain.handle('kick:points:get', () => ({ accounts: [] }));
ipcMain.handle('blaster:status', () => ({ active: false }));
ipcMain.handle('autostart:get', () => ({ on: false, suportado: false }));
ipcMain.handle('window:control', () => ({ maximized: false }));

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
  win = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: { offscreen: true, webviewTag: true, preload: path.join(root, 'preload.js'), backgroundThrottling: false } });
  win.webContents.on('will-attach-webview', (_event, _preferences, params) => { params.src = guestUrl; });
  await win.loadFile(path.join(root, 'index.html'));
  await ready();

  // 1. Verify Battle HUD buttons are mounted on all panels
  const buttonCount = await read('document.querySelectorAll(".panel-header .btn-eco-hud").length');
  assert.equal(buttonCount, 4, 'All 4 panels must have the Eco toggle button mounted');

  const hudCount = await read('document.querySelectorAll(".panel .battle-slot-hud").length');
  assert.equal(hudCount, 4, 'All 4 panels must have the Battle Slot HUD element mounted');

  // 2. Click Eco button on panel 0
  await read('document.querySelectorAll(".panel-header .btn-eco-hud")[0].click()');
  const isHudActive = await read('document.querySelectorAll(".panel")[0].classList.contains("is-hud-active")');
  assert.equal(isHudActive, true, 'Panel 0 must be in is-hud-active state');

  const webviewDisplay = await read('getComputedStyle(document.querySelectorAll(".panel webview")[0]).display');
  assert.equal(webviewDisplay, 'none', 'Webview must be hidden via display:none');

  const hudDisplay = await read('getComputedStyle(document.querySelectorAll(".panel .battle-slot-hud")[0]).display');
  assert.equal(hudDisplay, 'flex', 'Battle Slot HUD must be visible via display:flex');

  // 3. Inject mock state update and verify HUD rendering
  await read(`(() => {
    const fakeState = {
      i: 0,
      hunt: 'vulpix',
      balls: 2063,
      equippedBall: { name: 'Pokeball', infinite: false },
      team: [{ sid: 7, name: 'Squirtle', level: 36, ld: true, shiny: false }],
      invMap: {
        70000: 5,
        70011: 0,
        70013: 10,
        70012: 1
      },
      rawDrops: {
        70000: { id: 70000, name: 'Bronze Boss Token', qty: 2 },
        70012: { id: 70012, name: 'Shiny Stone Fragment', qty: 1 }
      },
      a: { seconds: 125, xph: 85000, shinyCap: 1, shinyFound: 1 }
    };
    window.PioBattleHud.update(document.querySelectorAll(".panel")[0], 0, fakeState);
  })()`);

  const leadName = await read('document.querySelectorAll(".panel .bsh-lead-name")[0].textContent');
  assert.ok(leadName.includes('Squirtle'), 'Lead name must display Squirtle');

  const huntName = await read('document.querySelectorAll(".panel .bsh-hunt-name")[0].textContent');
  assert.equal(huntName, 'Vulpix', 'Hunt name must display Vulpix');

  const timeVal = await read('document.querySelectorAll(".panel .bsh-val-time")[0].textContent');
  assert.equal(timeVal, '0h 02m 05s', 'Hunt time must be formatted properly');

  // Verify Important Drops widget
  const bossTokenQty = await read('document.querySelectorAll(".panel .bsh-drop-boss_token .bsh-drop-qty")[0].textContent');
  assert.equal(bossTokenQty, 'x3', 'Boss Token initial count must be x3');

  const bossTokenBadge = await read('document.querySelectorAll(".panel .bsh-drop-boss_token .bsh-drop-badge")[0].textContent');
  assert.equal(bossTokenBadge, '+2', 'Boss Token badge must show +2');

  const fragChaveQty = await read('document.querySelectorAll(".panel .bsh-drop-frag_chave .bsh-drop-qty")[0].textContent');
  assert.equal(fragChaveQty, 'x0', 'Frag Chave initial count must be x0');

  const fragChaveBadgeDisplay = await read('getComputedStyle(document.querySelectorAll(".panel .bsh-drop-frag_chave .bsh-drop-badge")[0]).display');
  assert.equal(fragChaveBadgeDisplay, 'none', 'Frag Chave badge must be hidden');

  // 4. Capture screenshot of the HUD rendered inside the panel
  const previewPath = path.join(root, 'scratch', 'battle-hud-preview.png');
  win.showInactive();
  win.webContents.invalidate();
  await pause(600);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(previewPath, img.toPNG());

  // 5. Click "Abrir jogo" and verify restoration
  await read('document.querySelectorAll(".panel .bsh-open-game-btn")[0].click()');
  const isHudActiveAfter = await read('document.querySelectorAll(".panel")[0].classList.contains("is-hud-active")');
  assert.equal(isHudActiveAfter, false, 'Panel 0 must no longer be in is-hud-active state');

  // 6. Test Master Blaster mode
  const blasterBtnCount = await read('document.querySelectorAll(".panel-header .btn-blaster-hud").length');
  assert.equal(blasterBtnCount, 4, 'All 4 panels must have the Master Blaster toggle button mounted');

  await read('document.querySelectorAll(".panel-header .btn-blaster-hud")[0].click()');
  const isBlasterActive = await read('document.querySelectorAll(".panel")[0].classList.contains("is-blaster-active")');
  assert.equal(isBlasterActive, true, 'Panel 0 must have is-blaster-active class');

  const bannerText = await read('document.querySelectorAll(".panel .bsh-mode-banner")[0].textContent');
  assert.ok(bannerText.includes('Headless'), 'Banner must indicate Master Blaster mode');

  await read('document.querySelectorAll(".panel .bsh-open-game-btn")[0].click()');
  const isBlasterActiveAfter = await read('document.querySelectorAll(".panel")[0].classList.contains("is-blaster-active")');
  assert.equal(isBlasterActiveAfter, false, 'Panel 0 must exit is-blaster-active on open game');

  console.log('PASS: Battle HUD (Ultra Eco & Master Blaster) mounted, activated, rendered, screenshotted and restored cleanly.');
  console.log('Preview saved to:', previewPath);
  app.quit();
});
