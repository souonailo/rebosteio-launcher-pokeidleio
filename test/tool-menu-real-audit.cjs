const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'scratch', 'tool-menu-audit');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pio-menu-audit-')));
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('log-level', '3');

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  const win = new BrowserWindow({ width: 1600, height: 950, show: false,
    webPreferences: { offscreen: true, webviewTag: true, backgroundThrottling: false } });
  try {
    await win.loadFile(path.join(root, 'rust-migration', 'ui', 'index.html'));
    await new Promise(resolve => setTimeout(resolve, 800));
    const state = await win.webContents.executeJavaScript(`({
      theme: document.body.dataset.theme,
      menus: ['leafToolsMenu','leafSettingsDrawer','modal','scModal','tlModal','dtModal','atModal','dispatchModal','autoSupplyModal','twitchBonusModal','kickBonusModal','depotSettingsDialog','sniperOverlay','pioAutoBossOverlay'].map(id => [id, !!document.getElementById(id)]),
      boss: typeof window.PioAutoBossPanel?.open,
      sniper: typeof window.PioSniperPanel?.open,
    })`);
    console.log(JSON.stringify(state));
    const menus = [
      ['tools', '#leafToolsMenu', `document.body.classList.add('leaf-tools-open')`],
      ['account-summary', '#stats', `document.querySelector('#statsBtn').click()`],
      ['account-summary-settings', '#stats', `document.querySelector('#statsBtn').click(); document.querySelector('#stats .st-gear').click()`],
      ['settings', '#leafSettingsDrawer', `document.body.classList.add('leaf-settings-open')`],
      ['accounts', '#modal', `document.querySelector('#overlay').classList.add('show')`],
      ['scripts', '#scModal', `document.querySelector('#scOverlay').classList.add('show')`],
      ['dispatch', '#dispatchModal', `document.querySelector('#dispatchOverlay').classList.add('show')`],
      ['supply', '#autoSupplyModal', `document.querySelector('#autoSupplyOverlay').classList.add('show')`],
      ['twitch', '#twitchBonusModal', `document.querySelector('#twitchBonusOverlay').classList.add('show')`],
      ['kick', '#kickBonusModal', `document.querySelector('#kickBonusOverlay').classList.add('show')`],
      ['depot', '#depotSettingsDialog .depot-panel', `document.querySelector('#autoSellBtn').click()`],
      ['sniper', '#sniperModal', `void window.PioSniperPanel.open()`],
      ['boss', '.pio-boss-dialog', `void window.PioAutoBossPanel.open()`],
      ['boss-history', '.pio-boss-dialog', `void window.PioAutoBossPanel.openHistory(0)`],
    ];
    const report = [];
    const targeted = process.env.PIO_AUDIT_TARGETED === '1';
    const viewports = targeted ? [[820, 720]] : [[1600, 950], [1920, 1032], [820, 720]];
    for (const [width, height] of viewports) {
      win.setSize(width, height);
      for (const theme of ['pure-white', 'kuromi-xp-light', 'absol-night', 'matcha-garden']) {
        await win.webContents.executeJavaScript(`window.PIWThemeManager.setTheme(${JSON.stringify(theme)})`);
        for (const [name, selector, opening] of targeted ? menus.filter(([name]) => name === 'kick' || name === 'boss-history' || name === 'account-summary' || name === 'account-summary-settings') : menus) {
        await win.webContents.executeJavaScript(`(() => {
          document.body.classList.remove('leaf-tools-open','leaf-settings-open');
          if (document.querySelector('#stats')?.classList.contains('show')) document.querySelector('#statsBtn')?.click();
          for (const id of ['overlay','scOverlay','dispatchOverlay','autoSupplyOverlay','twitchBonusOverlay','kickBonusOverlay']) document.getElementById(id)?.classList.remove('show');
          document.getElementById('depotSettingsDialog')?.remove();
          window.PioSniperPanel?.close?.(); window.PioAutoBossPanel?.close?.();
          ${opening}
        })()`);
        await new Promise(resolve => setTimeout(resolve, 250));
        const info = await win.webContents.executeJavaScript(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return {missing:true};
          const rect = el.getBoundingClientRect(), cs = getComputedStyle(el);
          const body = getComputedStyle(document.body);
          return {visible:rect.width>0 && rect.height>0 && cs.display!=='none',
            rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
            bg:cs.backgroundColor, color:cs.color,
            themeBg:body.getPropertyValue('--color-bg-elevated').trim(),
            themeText:body.getPropertyValue('--color-text-primary').trim(),
            outsideViewport:rect.x < -1 || rect.y < -1 || rect.right > innerWidth+1 || rect.bottom > innerHeight+1,
            overflow:el.scrollWidth>el.clientWidth+2 || el.scrollHeight>el.clientHeight+2};
        })()`);
        report.push({width,height,theme,name,...info});
        if (info.visible) {
          const image = await win.webContents.capturePage(undefined, {stayHidden:true,stayAwake:true});
          fs.writeFileSync(path.join(output, `${width}x${height}-${theme}-${name}.png`), image.toPNG());
        }
      }
      }
    }
    fs.writeFileSync(path.join(output, targeted ? 'report-targeted.json' : 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({captures:report.filter(x=>x.visible).length,
      missing:report.filter(x=>x.missing||!x.visible), outside:report.filter(x=>x.outsideViewport), output}));
  } finally {
    win.destroy();
    app.quit();
  }
}).catch(error => { console.error(error); app.exit(1); });
