// Real preload/IPC/persistence regression, isolated from accounts and network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session } = require('electron');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pio-kick-save-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
ipcMain.on('instance:id', event => { event.returnValue = 1; });
ipcMain.on('app:version', e => { e.returnValue = 'test'; });
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (_details, cb) => cb({ cancel: true })
  );
  const { KickPresenceManager } = require('../src/domain/kick-presence-service');
  const manager = new KickPresenceManager();
  // Persist the enabled state without opening any live connection.
  manager.startAll = () => {};
  ipcMain.handle('kick:creds:save', (_e, data) => manager.saveCreds(data));
  const win = new BrowserWindow({ show: false, webPreferences: {
    preload: path.resolve(__dirname, '../preload.js'), contextIsolation: true
  } });
  await win.loadURL('about:blank');
  const config = { masterEnabled: true, accounts: Array.from({ length: 4 }, (_, i) => ({
    username: 'testaccount' + i, token: '', enabled: i !== 2, claimPriority: 'exp',
    channelPoints: { biscoitao: 100 + i }
  })) };
  assert.equal(await win.webContents.executeJavaScript(
    `window.pokeAPI.kickSaveCreds(${JSON.stringify(config)})`
  ), true, 'Save through the actual preload must succeed');
  const restored = new KickPresenceManager();
  restored.startAll = () => {};
  const loaded = restored.loadCreds();
  assert.equal(loaded.masterEnabled, true);
  assert.deepEqual(loaded.accounts, config.accounts);
  assert.equal(fs.existsSync(path.join(profile, 'kick_creds.enc')), true);
  assert.equal(fs.existsSync(path.join(profile, 'kick_creds.enc.tmp')), false);
  win.destroy();
  console.log('PASS: real Kick preload -> IPC -> disk -> reload, four accounts, isolated profile');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
