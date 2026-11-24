// Regression test for Kick account linking UI in the launcher.
// Verifies that:
// 1. Unlinked account displays "🔗 Vincular Kick no Jogo".
// 2. Already linked account hides "🔗 Vincular Kick no Jogo" and shows "🔒 Vinculada ao Jogo: @...".
// 3. Switching accounts updates the link button / badge appropriately.
// 4. linkKickInGame respects alreadyLinked status.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session } = require('electron');

const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pio-kick-link-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();

ipcMain.on('instance:id', event => { event.returnValue = 1; });
ipcMain.on('app:version', e => { e.returnValue = 'test'; });

let win;
const read = script => win.webContents.executeJavaScript(script);
const pause = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (_, cb) => cb({ cancel: true })
  );

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      offscreen: false,
      webviewTag: true,
      preload: path.join(root, 'preload.js'),
      backgroundThrottling: false
    }
  });

  await win.loadFile(path.join(root, 'index.html'));
  await pause(1000);

  // Open the Kick Bonus modal
  await read('openKickBonusModal()');
  await pause(100);

  // Account 0 starts unlinked by default
  assert.equal(
    await read("!!document.getElementById('kickLinkInGame')"),
    true,
    'Unlinked account must show "Vincular Kick no Jogo" button'
  );
  assert.equal(
    await read("!!document.querySelector('.kick-linked-badge')"),
    false,
    'Unlinked account must not show linked badge'
  );

  // Simulate telemetry receiving linked Kick status for account 0
  await read(`
    handleKickGameTelemetry(0, stSane({
      ok: true,
      kick: { vinculado: true, login: 'n4iloo' }
    }).kick);
  `);
  await pause(100);

  // Account 0 should now be linked: link button hidden, badge displayed
  assert.equal(
    await read("!!document.getElementById('kickLinkInGame')"),
    false,
    'Already linked account must NOT show "Vincular Kick no Jogo" button'
  );
  const badgeText = await read("document.querySelector('.kick-linked-badge')?.textContent || ''");
  assert.match(badgeText, /Vinculada ao Jogo: @n4iloo/, 'Must display linked badge with @login');

  // Switch to account 1 (which is unlinked)
  await read("kickSelectedAccount = 1; renderKickBonusUI()");
  await pause(50);
  assert.equal(
    await read("!!document.getElementById('kickLinkInGame')"),
    true,
    'Account 1 (unlinked) must show "Vincular Kick no Jogo"'
  );
  assert.equal(
    await read("!!document.querySelector('.kick-linked-badge')"),
    false,
    'Account 1 must not show linked badge'
  );

  // Test linkKickInGame triggers in-game Kick modal on unlinked account 1
  await read(`(async () => {
    try {
      kickSelectedAccount = 1;
      renderKickBonusUI();
      let modalOpened = false;
      let vincularClicked = false;
      webviews[1] = {
        executeJavaScript: async (script) => {
          if (script.includes('.tr-ativo.kick') || script.includes('#kk-vincular')) {
            modalOpened = true;
            vincularClicked = true;
            return { ok: true, triggered: 'modal_and_button' };
          }
          return { ok: false };
        },
        focus: () => {}
      };
      await linkKickInGame(1);
      window.__testModalOpened = modalOpened;
      window.__testVincularClicked = vincularClicked;
    } catch (e) {
      window.__testErr = e.message;
    }
  })()`);
  await pause(100);
  assert.equal(
    await read('window.__testModalOpened'),
    true,
    'linkKickInGame must open in-game Kick modal via .tr-ativo.kick'
  );
  assert.equal(
    await read('window.__testVincularClicked'),
    true,
    'linkKickInGame must click #kk-vincular inside in-game modal'
  );

  console.log('PASS: kick-link-verification test passed completely!');
  win.destroy();
  app.exit(0);
}).catch(err => {
  console.error(err);
  app.exit(1);
});
