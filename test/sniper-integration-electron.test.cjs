const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow, session} = require('electron');
const root = path.resolve(__dirname, '..');
const source = process.env.SNIPER_TEST_ROOT || root;
const output = path.join(root, '.runtime', 'sniper-validation');
fs.mkdirSync(output, {recursive: true});
app.setPath('userData', path.join(output, 'profile-' + process.pid));
app.commandLine.appendSwitch('log-level', '3');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((details, done) => done({cancel: /^https?:/.test(details.url)}));
  const win = new BrowserWindow({width: 1600, height: 950, show: false, webPreferences: {
    contextIsolation: false, nodeIntegration: false, sandbox: false, preload: path.join(__dirname, 'fixtures', 'sniper-preload.cjs')
  }});
  win.webContents.on('console-message', event => { if (event.level >= 2) console.error('Renderer:', event.message); });
  const read = code => win.webContents.executeJavaScript(code).catch(error => { console.error('Failed fixture:', code.slice(0, 250)); throw error; });
  await win.loadFile(path.join(source, 'rust-migration', 'ui', 'index.html'));
  await pause(600);
  assert.equal(await read('typeof PioSniperPanel'), 'object', 'Real launcher loads the panel');
  await read(`(() => {
    off.fill(true);
    __nativeCalls.length = 0;
    __sniperState.accounts.forEach((account, index) => {
      account.configured = true;
      account.config = {scanIntervalMs: 45000, fastScanIntervalMs: 3000};
      account.rules = [{id:'shared',targetType:'item',targetId:142,targetName:'Water Stone',maxPriceGold:25000,maxPriceGems:0,maxQty:20,infinite:false,active:true,totalBought:index+2}];
      account.logs = [
        {id:'noise-ag-'+index,timestamp:1793340000100+index,status:'AGENDADO',targetName:'Cocoon Stone',price:9999,currency:'gold',qty:71,offerId:200+index,details:'Cooldown ativo'},
        {id:'noise-rec-'+index,timestamp:1793340000200+index,status:'RECUSADO',targetName:'Cocoon Stone',offerId:201+index,details:'market.sorteioPerdeu'},
        {id:'noise-perd-'+index,timestamp:1793340000300+index,status:'PERDIDO',targetName:'Cocoon Stone',offerId:201+index,details:'Sem confirmação em 5 s'},
        {id:'fixture-'+index,timestamp:1793340000000+index,status:'CONFIRMADO',targetName:index === 0 ? '<img src=x onerror="window.__injected=true">' : 'Water Stone',seller:'exed',price:20000,currency:'gold',qty:2,offerId:100+index,details:'Registro simulado',accountIndex:index}
      ];
    });
  })()`);
  await read('PioSniperPanel.open({accountIndex:0})');
  await pause(150);
  assert.equal(await read('__nativeCalls.some(c=>c.name==="sniper_save")'), false, 'Opening is read-only');
  assert.equal(await read('Boolean(window.__injected)'), false, 'History content is escaped');
  assert.equal(await read('document.querySelector("#sniperOverlay").classList.contains("show")'), true);
  assert.equal(await read('__nativeCalls.some(c=>c.name==="webview_set_visible"&&c.args.visible===false)'), true, 'Dialog hides native WebViews');

  // A failed write must preserve the editable draft and report failure.
  await read(`(() => { const d=PioSniperPanel.getState().drafts[0]; d.rules[0].maxPriceGold=26000; d.isDirty=true; window.__sniperFailure='sniper_save'; })()`);
  assert.equal(await read('PioSniperPanel.saveAccount(0).then(()=>false,()=>true)'), true);
  assert.equal(await read('PioSniperPanel.getState().drafts[0].isDirty'), true);
  assert.equal(await read('__sniperState.accounts[0].rules[0].maxPriceGold'), 25000);
  await read('window.__sniperFailure=null; PioSniperPanel.saveAccount(0)');
  assert.deepEqual(await read('__nativeCalls.filter(c=>c.name==="sniper_save").at(-1).args.indices'), [0]);
  assert.equal(await read('__sniperState.accounts[0].config.scanIntervalMs'), 45000, 'Individual edit preserves config');
  assert.equal(await read('__sniperState.accounts[1].rules[0].maxPriceGold'), 25000, 'Other account is untouched');

  await read('PioSniperPanel.applyAll(PioSniperPanel.getState().drafts[0].rules, false)');
  assert.deepEqual(await read('__nativeCalls.filter(c=>c.name==="sniper_save").at(-1).args.indices'), [0,1,2,3]);
  assert.deepEqual(await read('__sniperState.accounts.map(a=>a.rules[0].totalBought)'), [2,3,4,5], 'Universal save preserves each account budget');
  assert.deepEqual(await read('__sniperState.accounts.map(a=>a.rules[0].id)'), ['shared','shared','shared','shared']);
  // A live history event must not replace the form while a user is typing.
  await read(`(() => {
    const input=document.querySelector('#ruleTargetSearch');
    input.focus(); input.value='Water Stone'; input.dispatchEvent(new Event('input',{bubbles:true}));
    __emitNative('sniper:updated', structuredClone(__sniperState));
  })()`);
  assert.equal(await read('document.activeElement.id'), 'ruleTargetSearch');
  assert.equal(await read('document.activeElement.value'), 'Water Stone');
  // Exercise real rule editor and retain a paused rule on edit.
  await read(`(() => {
    document.activeElement.blur();
    const st=PioSniperPanel.getState(); st.drafts[0].rules[0].active=false;
    document.querySelector('[data-action="edit-rule"]').click();
    const price=document.querySelector('#ruleMaxPriceGold'); price.value='27000'; price.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#sniperSaveRuleBtn').click();
  })()`);
  assert.equal(await read('PioSniperPanel.getState().drafts[0].rules[0].active'), false);
  assert.equal(await read('PioSniperPanel.getState().drafts[0].rules[0].maxPriceGold'), 27000);
  // Run the actual injected storage scripts in an isolated game-like context.
  await read(`(() => {
    window.__originalSniperHost=__PIO_SNIPER_INTEGRATION__;
    window.__PIO_SNIPER_INTEGRATION__={
      getWebview:()=>({executeJavaScript:__evalSniperVisual,getURL:()=> 'https://pokeidle.io/'}),
      isAccountOff:()=>false,isLoginUrl:()=>false,ensurePresetLoaded:async()=>{}
    };
    __sniperVisualSet({rotom_sniper_enabled:true,rotom_sniper_rules:[{...__sniperState.accounts[0].rules[0],totalBought:7}],rotom_sniper_logs:[]});
  })()`);
  assert.equal((await read('PioSniperPanel.syncVisualWebview(0,__sniperState.accounts[0])')).ok, true);
  assert.equal(await read('__sniperVisualGet("rotom_sniper_rules")[0].totalBought'), 7);
  await read('window.__sniperFailure="sniper_ingest"; __nativeCalls.length=0');
  assert.equal((await read('pokeAPI.blasterStart(0,{})')).ok, false);
  assert.equal(await read('__nativeCalls.some(c=>c.name==="blaster_start")'), false, 'Failed progress persistence prevents headless start');
  await read('window.__sniperFailure=null; PioSniperPanel.flush(0)');
  assert.equal(await read('__sniperState.accounts[0].rules[0].totalBought'), 7);
  assert.equal(await read('__sniperVisualGet("rotom_sniper_enabled")'), false);
  await read('void(window.__PIO_SNIPER_INTEGRATION__=window.__originalSniperHost)');
  await read('PioSniperPanel.loadBackendState(); PioSniperPanel.close()');
  await read('PioSniperPanel.open({accountIndex:0})');
  // Exercise the original options through the real controls, without a game connection.
  assert.equal(await read('document.querySelector("#cfgScanMode").value'), 'original');
  assert.equal(await read('PioSniperPanel.getState().itemsCatalog.length'), 80);
  await read(`(() => {
    const change=(id,value)=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
    change('ruleMaxPriceGold','1234'); change('ruleMaxQty','4');
    change('ruleTargetType','category'); change('ruleTargetCategory','stone');
  })()`);
  assert.equal(await read('document.querySelector("#ruleMaxPriceGold").value'), '1234', 'Changing target type keeps typed prices');
  assert.equal(await read('document.querySelector("#ruleMaxQty").value'), '4');
  assert.equal(await read('document.querySelectorAll("[data-exclude-id]").length'), 36, 'Classic and shiny stones are individually selectable');
  await read(`(() => {
    for (const id of [142,70031]) {
      const input=document.querySelector('[data-exclude-id="'+id+'"]');
      input.checked=true; input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    const search=document.querySelector('#ruleExclusionsSearch'); search.value='Water'; search.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  assert.equal(await read(`document.querySelector('[data-exclude-id="142"]').checked`), true, 'Search retains blocked selection');
  assert.deepEqual(await read('PioSniperPanel.getState().ruleDraft.excludedItemIds.slice().sort((a,b)=>a-b)'), [142,70031]);
  await read('document.querySelector("#sniperSaveRuleBtn").click()');
  const category = await read('PioSniperPanel.getState().drafts[0].rules.find(r=>r.targetType==="category")');
  assert.equal(category.targetCategory, 'stone');
  assert.equal(category.targetId, null);
  assert.equal(category.maxQty, 4);
  assert.deepEqual(category.excludedItemIds.slice().sort((a,b)=>a-b),[142,70031]);
  await read(`(() => {
    const change=(id,value)=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
    change('radarMaxPriceShinyGold','15000'); change('radarMaxPriceP5Gems','2');
    change('radarMaxPriceNoteGold','20000'); change('radarMinNote','8.5');
    for(const id of ['radarSnipeAnyShiny','radarSnipeAnyP5','radarSnipeByNote']) {
      const el=document.getElementById(id); el.checked=true; el.dispatchEvent(new Event('change',{bubbles:true}));
    }
    change('cfgScanMode','adaptive'); change('cfgScanInterval','60'); change('cfgFastScanInterval','2.5');
    change('cfgScanMode','original');
  })()`);
  await read('PioSniperPanel.saveAccount(0)');
  const radarConfig = await read('__sniperState.accounts[0].config');
  assert.equal(radarConfig.snipeAnyShiny, true);
  assert.equal(radarConfig.snipeAnyP5, true);
  assert.equal(radarConfig.snipeByNote, true);
  assert.equal(radarConfig.minNote, 8.5);
  assert.equal(radarConfig.maxPriceP5Gems, 2);
  assert.equal(radarConfig.scanMode, 'original');
  assert.equal(radarConfig.scanIntervalMs, 60000);
  assert.equal(radarConfig.fastScanIntervalMs, 2500);
  await read(`(() => {const mode=document.querySelector('#cfgScanMode'); mode.value='adaptive'; mode.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await read('document.querySelector("#cfgFastScanInterval").value'), '2.5', 'Fractional intervals remain visible after switching modes');
  await read(`(() => {const value=document.querySelector('#cfgScanInterval');value.value='-5';value.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  assert.equal((await read('PioSniperPanel.saveAccount(0)')).ok, false, 'Invalid interval is rejected instead of clamped');
  assert.equal(await read('__sniperState.accounts[0].config.scanIntervalMs'), 60000);
  await read(`(() => {
    const value=document.querySelector('#cfgScanInterval');value.value='60';value.dispatchEvent(new Event('input',{bubbles:true}));
    const mode=document.querySelector('#cfgScanMode');mode.value='original';mode.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await read('PioSniperPanel.saveAccount(0)');
  assert.equal(await read('__sniperState.accounts[0].enabled'), false, 'New filters never activate the account');
  assert.notEqual(await read('__sniperState.accounts[1].config.snipeByNote'), true, 'Radar changes stay account-scoped');
  await read('PioSniperPanel.applyAll(PioSniperPanel.getState().drafts[0].rules, false, PioSniperPanel.getState().drafts[0].config)');
  assert.deepEqual(await read('__sniperState.accounts.map(a=>a.config.minNote)'), [8.5,8.5,8.5,8.5]);
  assert.deepEqual(await read('__sniperState.accounts.map(a=>a.rules.find(r=>r.targetType==="category").targetCategory)'), ['stone','stone','stone','stone']);
  assert.deepEqual(await read('__sniperState.accounts.map(a=>a.rules.find(r=>r.targetType==="category").excludedItemIds.slice().sort((a,b)=>a-b))'), [[142,70031],[142,70031],[142,70031],[142,70031]], 'Universal settings retain every exclusion');
  assert.deepEqual(await read('__sniperState.accounts.map(a=>a.enabled)'), [false,false,false,false]);
  await read('PioSniperPanel.close(); PioSniperPanel.open({accountIndex:0})');
  await read(`(() => {const type=document.querySelector('#ruleTargetType'); type.value='category'; type.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  for (const [width,height] of [[1920,1032],[1600,950],[820,720]]) {
    win.setContentSize(width,height);
    await pause(120);
    const geometry = await read(`(() => { const r=document.querySelector('#sniperModal').getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}; })()`);
    assert.ok(geometry.left >= 0 && geometry.right <= geometry.width && geometry.top >= 0 && geometry.bottom <= geometry.height, 'Panel fits '+width+'x'+height);
    fs.writeFileSync(path.join(output, 'sniper-'+width+'x'+height+'.png'), (await win.webContents.capturePage()).toPNG());
    await read('document.querySelector("#sniperRuleForm").scrollIntoView({block:"center"})');
    await pause(150);
    fs.writeFileSync(path.join(output, 'sniper-rule-'+width+'x'+height+'.png'), (await win.webContents.capturePage()).toPNG());
    await read('document.querySelector(".sniper-radar-section").scrollIntoView({block:"start"})');
    await pause(150);
    fs.writeFileSync(path.join(output, 'sniper-radar-'+width+'x'+height+'.png'), (await win.webContents.capturePage()).toPNG());
  }
  await read(`(() => {
    const filter=document.querySelector('#sniperHistoryFilter');
    filter.value='1'; filter.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('.sniper-history-list').scrollIntoView({block:'center'});
  })()`);
  assert.equal(await read('document.querySelectorAll(".sniper-history-entry").length'), 1, 'History shows strictly CONFIRMADO entry and hides non-success logs');
  assert.match(await read('document.querySelector(".sniper-history-entry .sniper-history-desc").textContent'), /2x Water Stone de @exed.*20\.000 Coins.*#101/, 'Confirmed entry displays qty, item, seller, price and offerId');
  await read('PioSniperPanel.clearHistory(1)');
  assert.equal(await read('__sniperState.accounts[1].logs.length'), 0);
  assert.equal(await read('__sniperState.accounts[0].logs.length'), 4, 'Clear history is account-scoped');
  await read('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  assert.equal(await read('PioSniperPanel.isOpen()'), false);
  console.log('PASS: real launcher integration, read-only open, account isolation, failure preservation, universal budgets, escaping, native airspace and three viewports.');
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
