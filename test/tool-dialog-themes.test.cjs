const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pio-tool-theme-')));
app.commandLine.appendSwitch('disable-gpu');

const root = path.resolve(__dirname, '..');
const styles = [
  'rust-migration/ui/src/ui/absol-theme.css',
  'rust-migration/ui/src/ui/moon-garden-dark.css',
  'rust-migration/ui/src/ui/themes.css',
  'rust-migration/ui/src/ui/kuromi-xp.css',
  'rust-migration/ui/src/ui/twitch-bonus.css',
  'rust-migration/ui/src/ui/kick-bonus.css',
  'rust-migration/ui/src/ui/auto-supply-individual.css',
  'rust-migration/ui/src/ui/depot-settings.css',
  'rust-migration/ui/src/ui/sniper-panel.css',
  'rust-migration/ui/src/ui/auto-boss-panel.css',
  'rust-migration/ui/src/ui/tool-dialog-themes.css',
].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const themes = ['absol-night', ...new Set([...styles.matchAll(/body\[data-theme="([a-z-]+)"\]\s*\{\s*--color-bg-base:/g)].map(match => match[1]))]
  .concat(['kuromi-xp', 'kuromi-xp-light']);

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <style>${styles}</style><style>* { transition: none !important; animation: none !important; }</style>
      <div class="pio-boss-overlay"><div class="pio-boss-dialog"><div class="pio-boss-head"><h2>Boss</h2></div><button class="pio-boss-account is-selected">Conta</button></div></div>
      <div id="depotSettingsDialog"><div class="depot-panel"><h3>Depot</h3><div class="depot-account">Conta</div></div></div>
      <div id="sniperOverlay"><div id="sniperModal"><button class="sniper-btn primary">Sniper</button></div></div>
      <div id="leafToolsMenu">Ferramentas</div><div id="leafSettingsDrawer">Configurações</div>
      <div id="stats"><div class="st-head">Resumo</div><div class="st-tabs"><div class="st-tab on">Conta</div></div><div class="st-body">Painel</div></div>
      <div id="modal">Contas</div><div id="autoSupplyModal">Auto Supply</div>
      <div id="twitchBonusModal">Twitch</div><div id="kickBonusModal">Kick</div>
      <div id="scModal"><div class="sc-row"><input type="text" value="Script"></div></div>
      <div id="dispatchModal"><div class="dispatch-head"><h2>Despacho</h2></div><input class="dispatch-search-box" value="Hunt"><button class="dispatch-chip active">Todas</button><button class="primary">Enviar</button></div>`));
    for (const theme of themes) {
      await window.webContents.executeJavaScript(`document.body.dataset.theme = ${JSON.stringify(theme)}`);
      const actual = await window.webContents.executeJavaScript(`(() => {
        const value = (selector, property) => getComputedStyle(document.querySelector(selector)).getPropertyValue(property).trim();
        return {
          elevated: value('body', '--color-bg-elevated'),
          surface: value('body', '--color-surface-1'),
          selected: value('body', '--color-surface-selected'),
          action: value('body', '--color-action-primary'),
          boss: value('.pio-boss-dialog', 'background-color'),
          bossHead: value('.pio-boss-head', 'background-color'),
          bossSelected: value('.pio-boss-account.is-selected', 'background-color'),
          depot: value('.depot-panel', 'background-color'),
          sniper: value('.sniper-btn.primary', 'background-color'),
          scriptInput: value('#scModal input', 'background-color'),
          dispatch: value('#dispatchModal', 'background-color'),
          dispatchChip: value('#dispatchModal .dispatch-chip.active', 'background-color'),
          dispatchAction: value('#dispatchModal button.primary', 'background-color'),
          tools: value('#leafToolsMenu', 'background-color'),
          settings: value('#leafSettingsDrawer', 'background-color'),
          stats: value('#stats', 'background-color'),
          statsBody: value('#stats .st-body', 'background-color'),
          statsSelected: value('#stats .st-tab.on', 'background-color'),
          accounts: value('#modal', 'background-color'),
          scripts: value('#scModal', 'background-color'),
          supply: value('#autoSupplyModal', 'background-color'),
          twitch: value('#twitchBonusModal', 'background-color'),
          kick: value('#kickBonusModal', 'background-color'),
        };
      })()`);
      const colors = await window.webContents.executeJavaScript(`(() => {
        const names = ['--color-bg-elevated','--color-surface-1','--color-surface-selected','--color-action-primary'];
        const probe = document.createElement('div'); document.body.append(probe);
        const result = names.map(name => { probe.style.backgroundColor = getComputedStyle(document.body).getPropertyValue(name); return getComputedStyle(probe).backgroundColor; });
        probe.remove(); return result;
      })()`);
      assert.equal(actual.boss, colors[0], `${theme}: Auto Boss`);
      assert.equal(actual.bossHead, colors[1], `${theme}: cabeçalho`);
      assert.equal(actual.bossSelected, colors[2], `${theme}: conta selecionada`);
      assert.equal(actual.depot, colors[0], `${theme}: Depot`);
      assert.equal(actual.sniper, colors[3], `${theme}: Auto-Sniper`);
      assert.equal(actual.scriptInput, colors[1], `${theme}: campo de scripts`);
      assert.equal(actual.dispatch, colors[0], `${theme}: despacho`);
      assert.equal(actual.dispatchChip, colors[2], `${theme}: filtro de despacho`);
      assert.equal(actual.dispatchAction, colors[3], `${theme}: ação de despacho`);
      assert.equal(actual.stats, colors[0], `${theme}: resumo da conta`);
      assert.equal(actual.statsBody, colors[1], `${theme}: corpo do resumo`);
      assert.equal(actual.statsSelected, colors[2], `${theme}: aba do resumo`);
      for (const [name, surface] of Object.entries({ tools: actual.tools, settings: actual.settings,
        accounts: actual.accounts, scripts: actual.scripts, supply: actual.supply,
        twitch: actual.twitch, kick: actual.kick })) {
        const expected = theme.startsWith('kuromi-xp') ? [colors[0], colors[1]] : [colors[0]];
        assert.ok(expected.includes(surface), `${theme}: ${name} uses ${surface}, expected ${expected.join(' or ')}`);
      }
    }
    console.log(`Tool dialog themes: ${themes.length} palettes verified`);
  } finally {
    window.destroy();
    app.quit();
  }
}).catch(error => { console.error(error); app.exit(1); });
