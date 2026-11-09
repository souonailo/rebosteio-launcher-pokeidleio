'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pio-twitch-panel-')));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  for (const file of ['index.html', 'rust-migration/ui/index.html']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const modalStart = source.indexOf('  <!-- Modal Bônus Twitch por pontos do canal -->');
    const modalEnd = source.indexOf('  <!--', modalStart + 10);
    // Modal contains internal comments, so use the script section's DOM IDs from the real document.
    const start = source.indexOf('    // ===== Bônus Twitch por pontos do canal =====');
    const end = source.indexOf('    const kickCachedGameData', start);
    assert.ok(modalStart > 0 && modalEnd > modalStart && start > 0 && end > start);
    const modal = source.slice(modalStart, source.indexOf('<!-- Modal', modalStart + 10));
    const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n') +
      [...source.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => fs.readFileSync(path.join(__dirname, '..', path.dirname(file), match[1]), 'utf8')).join('\n');
    const fixture = `<!doctype html><html><head><base href="${require('node:url').pathToFileURL(path.resolve(__dirname, '..', file)).href}"><style>${styles}</style></head><body><button id="twitchBonusBtn"></button>${modal}<script>
      ${fs.readFileSync(path.join(__dirname, '../src/ui/runtime-performance.js'), 'utf8')}
      ${fs.readFileSync(path.join(__dirname, '../src/ui/kick-reward-status.js'), 'utf8')}
      ${fs.readFileSync(path.join(__dirname, '../src/ui/twitch-reward-status.js'), 'utf8')}
      window.__TAURI_INTERNALS__ = {};
      const accounts = [{name:'Conta 1'},{name:'Conta 2'},{name:'Conta 3'},{name:'Conta 4'}];
      const shownAccountName = (i, fallback) => fallback;
      const defName = i => 'Conta ' + (i+1);
      const webviews = [];
      const kickEscape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const calls = []; const listeners = {};
      window.pokeAPI = {
        twitchLoadCreds: async () => ({masterEnabled:false,accounts:[{username:'viewer',enabled:true}]}),
        twitchGetStatus: async () => ({masterEnabled:false,accounts:[]}),
        twitchGetPoints: async () => ({accounts:[]}),
        twitchSetPointChannels: async value => { calls.push(['channels',value]); },
        twitchSyncLives: async value => { calls.push(['lives',value]); },
        twitchSaveCreds: async value => { calls.push(['save',JSON.parse(JSON.stringify(value))]); return !window.failSave; },
        twitchSessionOpen: async (i,slug) => { calls.push(['open',i,slug]); return true; },
        twitchRefreshPoints: async () => ({accounts:[]}),
        onTwitchStatus: cb => listeners.status=cb,
        onTwitchChatStatus: cb => listeners.chat=cb,
        onTwitchPoints: cb => listeners.points=cb
      };
      ${source.slice(start, end)}
      window.fixture = {calls,listeners,openTwitchBonusModal,renderTwitchBonusUI};
    </script></body></html>`;
    const window = new BrowserWindow({ width:1280, height:800, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    const errors = [];
    window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
    const fixturePath = path.join(app.getPath('userData'), 'panel.html');
    fs.writeFileSync(fixturePath, fixture);
    await window.loadFile(fixturePath);
    const result = await window.webContents.executeJavaScript(`(async () => {
      await fixture.openTwitchBonusModal();
      handleTwitchGameTelemetry(0, {login:'viewer',vinculado:true,pct:15,bonus:{xp:Date.now()+3600000},oficiais:[
        {login:'partner',ativo:true,aoVivo:true},{login:'disabled',ativo:false,aoVivo:true}
      ]});
      handleTwitchGameTelemetry(1, {login:'second',vinculado:true,bonus:{},oficiais:[{login:'separate',ativo:true,aoVivo:true}]});
      fixture.listeners.points({accounts:[{status:'authenticated',username:'viewer',balances:{partner:{status:'verified',points:350,checkedAt:Date.now(),catalogStatus:'verified',rewards:[{key:'exp',cost:300,available:true}]}}}]});
      const initial = document.getElementById('twitchStreamersList').textContent;
      const bonus = document.getElementById('twitchAccountsGrid').textContent;
      const wait = () => new Promise(resolve => setTimeout(resolve, 30));
      const toggle = document.getElementById('twitchAutoClaimToggle');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));
      await wait();
      const priority = document.getElementById('twitchAutoClaimPriority');
      priority.value = 'catch'; priority.dispatchEvent(new Event('change')); await wait();
      document.querySelectorAll('#twitchAccountNav button')[1].click();
      const secondPriority = priority.value;
      priority.value = 'lure'; priority.dispatchEvent(new Event('change')); await wait();
      document.querySelectorAll('#twitchAccountNav button')[0].click();
      const firstPriority = priority.value;
      window.failSave = true; toggle.checked = false; toggle.dispatchEvent(new Event('change')); await wait();
      const rolledBack = toggle.checked;
      window.failSave = false;
      delete window.__TAURI_INTERNALS__; fixture.renderTwitchBonusUI();
      const electronDisabled = toggle.disabled;
      window.__TAURI_INTERNALS__ = {}; fixture.renderTwitchBonusUI();
      fixture.listeners.points({accounts:[{status:'authenticated',redemption:{message:'Resgate sem confirmação. Automático pausado.'},balances:{partner:{status:'verified',points:350,checkedAt:Date.now(),catalogStatus:'verified',rewards:[]}}}]});
      const noCatalogReward = document.getElementById('twitchStreamersList').textContent;
      const pending = document.getElementById('twitchRedemptionStatus').textContent;
      document.getElementById('twitchMasterToggle').checked = true;
      document.getElementById('twitchMasterToggle').dispatchEvent(new Event('change'));
      document.getElementById('twitchBonusSave').click();
      await new Promise(resolve=>setTimeout(resolve,20));
      document.getElementById('twitchSessionLogin').click();
      document.querySelector('[data-twitch-channel]').click();
      fixture.listeners.points({accounts:[{status:'error',balances:{partner:{status:'stale',points:350,checkedAt:Date.now()}}}]});
      fixture.listeners.chat({accounts:[{status:'connected',username:'viewer'}]});
      const connectedChat = document.getElementById('twitchAccountsGrid').textContent;
      const connectionSummary = document.getElementById('twitchGlobalStatusPill').textContent;
      const stale = document.getElementById('twitchStreamersList').textContent;
      handleTwitchGameTelemetry(0,null);
      const cleared = document.getElementById('twitchAccountsGrid').textContent;
      return {initial,bonus,stale,cleared,connectedChat,connectionSummary,secondPriority,firstPriority,rolledBack,electronDisabled,noCatalogReward,pending,
        text:document.getElementById('twitchBonusModal').textContent,calls:fixture.calls,nav:document.querySelectorAll('#twitchAccountNav button').length,
        hasToken:!!document.querySelector('[data-acc-token]'), hasGenerator:!!document.getElementById('twitchTokenHelpLink')};
    })()`);
    assert.equal(result.nav, 4);
    assert.equal(result.hasToken, false);
    assert.equal(result.hasGenerator, false);
    assert.match(result.initial, /350 pontos/);
    assert.match(result.initial, /1× EXP/);
    assert.equal(result.secondPriority, 'exp');
    assert.equal(result.firstPriority, 'catch');
    assert.equal(result.rolledBack, true);
    assert.equal(result.electronDisabled, true);
    assert.match(result.noCatalogReward, /Buff indisponível na Twitch/);
    assert.match(result.pending, /Automático pausado/);
    assert.doesNotMatch(result.text, /modo leve|experimental/i);
    assert.match(result.text, /Ativar acompanhamento da Twitch/);
    assert.ok(result.calls.some(c => c[0] === 'save' && c[1].autoClaim && c[1].autoClaimProtocol === 1 && c[1].accounts[0].gameLinked && c[1].accounts[0].linkedUsername === 'viewer'));
    assert.ok(result.calls.some(c => c[0] === 'save' && c[1].accounts[0].claimPriority === 'catch' && c[1].accounts[1].claimPriority === 'lure'));
    assert.match(result.initial, /disabled/);
    assert.match(result.initial, /Recompensas pendentes/);
    assert.doesNotMatch(result.initial, /separate/);
    assert.match(result.bonus, /XP: 1h/);
    assert.match(result.stale, /Saldo desatualizado/);
    assert.match(result.connectedChat, /Chat conectado com o acesso salvo/);
    assert.match(result.connectedChat, /Falha na consulta/);
    assert.doesNotMatch(result.connectionSummary, /login/i);
    assert.match(result.cleared, /Nenhum bônus ativo informado/);
    assert.ok(result.calls.some(c => c[0] === 'save' && c[1].masterEnabled && c[1].accounts[0].username === 'viewer'));
    assert.ok(result.calls.some(c => c[0] === 'open' && c[1] === 0 && c[2] === ''));
    assert.ok(result.calls.some(c => c[0] === 'open' && c[1] === 0 && c[2] === 'partner'));
    assert.ok(result.calls.some(c => c[0] === 'channels' && c[1][0].join() === 'partner' && c[1][1].join() === 'separate'));
    assert.deepEqual(errors, []);
    for (const [width, height] of [[1280, 800], [1024, 720]]) {
      window.setSize(width, height);
      const layout = await window.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => {
        const modal = document.getElementById('twitchBonusModal').getBoundingClientRect();
        const controls = ['twitchAutoClaimToggle', 'twitchAutoClaimPriority', 'twitchBonusSave'].map(id => {
          const rect = document.getElementById(id).getBoundingClientRect();
          return {id, visible:rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth};
        });
        const guideBody = document.querySelector('.twitch-guide-body').getBoundingClientRect();
        const guidePager = document.querySelector('.twitch-guide-pager').getBoundingClientRect();
        resolve({modalFits:modal.top >= 0 && modal.bottom <= innerHeight, guideFits:guideBody.bottom <= guidePager.top + 1, controls});
      }))`);
      assert.equal(layout.modalFits, true, JSON.stringify({width,height,layout}));
      assert.equal(layout.guideFits, true, JSON.stringify({width,height,layout}));
      assert.ok(layout.controls.every(control => control.visible), JSON.stringify({width,height,layout}));
    }
    if (file === 'index.html') fs.writeFileSync(path.join(os.tmpdir(), 'pio-twitch-parity-panel.png'), (await window.webContents.capturePage()).toPNG());
    window.destroy();
    console.log('PASS:', file, 'real DOM, four accounts, isolated partners, verified/stale balances, bonus expiry and login/redemption actions');
  }
  app.exit(0);
}).catch(error => { console.error(String(error.message || error).slice(0, 1000)); app.exit(1); });
