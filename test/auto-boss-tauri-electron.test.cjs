'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.runtime', 'auto-boss-tauri-tests');
fs.mkdirSync(output, {recursive:true});
app.setPath('userData', path.join(output, 'profile-'+process.pid));
app.commandLine.appendSwitch('log-level','3');
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));

app.whenReady().then(async () => {
  // Network isolation: server packets below are explicit fixtures.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => cb({cancel:/^https?:/.test(details.url)}));
  const win=new BrowserWindow({width:1600,height:950,show:false,
    webPreferences:{contextIsolation:false,nodeIntegration:false,sandbox:false,
      preload:path.join(__dirname,'fixtures','auto-boss-preload.cjs'),backgroundThrottling:false}});
  win.webContents.on('console-message',event=>{
    if(event.level>=2) console.error('Renderer:',String(event.message).slice(0,2000));
  });
  const read=script=>win.webContents.executeJavaScript(script).catch(error=>{
    console.error('Fixture read failure:',script.slice(0,500));throw error;
  });
  async function setViewport(width, height) {
    win.setContentSize(width, height);
    let measured;
    for (let attempt=0;attempt<80;attempt++) {
      measured=await read('({w:innerWidth,h:innerHeight})');
      if (Math.abs(measured.w-width)<=1 && Math.abs(measured.h-height)<=1) {
        // A stable layout frame is required before measuring overlay geometry.
        await read('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        return measured;
      }
      await pause(75);
    }
    throw new Error(`Electron viewport failed to resize to ${width}x${height}: ${JSON.stringify(measured)}`);
  }
  try {
    await win.loadFile(path.join(root,'rust-migration','ui','index.html'));
    // Stay hidden as requested: screenshots taken via webContents.capturePage without desktop capture border
    for(let i=0;i<45;i++) {
      if(await read('!!document.getElementById("leafAutoBossBtn") && !!window.PioAutoBossPanel && document.querySelectorAll(".panel").length===4')) break;
      await pause(100);
    }
    assert.equal(await read('document.querySelectorAll(".panel").length'),4);
    await read('document.getElementById("leafToolsBtn").click();document.getElementById("leafAutoBossBtn").click()');
    for(let i=0;i<45;i++) {
      if(await read('PioAutoBossPanel.getState().bosses.length === 2')) break;
      await pause(100);
    }
    assert.equal(await read('PioAutoBossPanel.getState().bosses.length'),2,'real game catalog forwarded');
    assert.equal(await read('document.querySelector("#pioAutoBossOverlay").hidden'),false);
    assert.equal(await read('document.querySelectorAll(".pio-boss-account").length'),4);
    assert.equal(await read('PioAutoBossPanel.getState().accounts[0].tokens'),3,'tokens known before any boss is saved');
    assert.ok(await read('Boolean(document.querySelector(".pio-boss-chart-page"))'), 'setup keeps the chart panel visible beside configuration');
    assert.equal(await read('document.querySelectorAll("[data-action=view-charts]").length'),0, 'charts are embedded in the screen, not a separate view');
    assert.ok(await read('(()=>{const c=document.querySelector(".pio-boss-chart-page");const p=c.parentElement.getBoundingClientRect();return c.getBoundingClientRect().left>=p.left+p.width/2})()'), 'setup chart occupies the right column');
    assert.equal(await read('document.querySelectorAll(".pio-boss-member").length'),3,'team comes from selected account');
    await read('document.querySelector(\'[data-team-index="1"]\').click()');
    for(let i=0;i<35;i++) {
      if(await read('!PioAutoBossPanel.getState().busy')) break;
      await pause(100);
    }
    assert.equal(await read('PioAutoBossPanel.getState().accounts[0].activeId'),101);
    assert.match(await read('document.querySelector(".pio-boss-member.is-selected").textContent'),/Pikachu.*Em campo/s);
    assert.deepEqual(await read('__nativeCalls.filter(x=>x.name==="blaster_boss_select_pokemon").map(x=>x.args)'),[{index:0,pokemonId:101}]);
    assert.ok(await read('document.querySelector(".pio-boss-list").textContent.includes("Articuno")'));
    await read('document.querySelector("[data-boss-key=articuno]").click()');
    assert.match(await read('document.querySelector(".pio-boss-drop-grid").textContent'),/MEGA Stone/i);
    assert.ok(await read('Array.from(document.querySelectorAll(".pio-boss-drop img")).some(img=>img.getAttribute("src").endsWith("/70014.png"))'));
    await read('(()=>{const select=document.querySelector("[data-field=pokemon-primary]");select.value="100";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await read('document.querySelector("[data-action=save-profile]").click()');
    for(let i=0;i<35;i++) {
      if(await read('__bossFixture.configs[0].pokemonProfiles.articuno?.primaryId===100')) break;
      await pause(100);
    }
    assert.deepEqual(await read('__bossFixture.configs[0].pokemonProfiles.articuno'),{primaryId:100,fighterId:101});
    if(process.env.BOSS_E2E_CAPTURE==='1') {
      await setViewport(820,720);
      const narrowLayout = await read('(()=>{const d=document.querySelector(".pio-boss-dialog").getBoundingClientRect();const c=document.querySelector(".pio-boss-chart-page").getBoundingClientRect();return {dialog:{left:d.left,right:d.right,top:d.top,bottom:d.bottom},chart:{left:c.left,right:c.right,top:c.top,bottom:c.bottom},viewport:{w:innerWidth,h:innerHeight}}})()');
      assert.ok(narrowLayout.chart.left>=narrowLayout.dialog.left-1 && narrowLayout.chart.right<=narrowLayout.dialog.right+1,
        `Chart remains inside the narrow setup dialog: ${JSON.stringify(narrowLayout)}`);
      await read('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(output,'boss-pokemon-profile-820x720.png'),(await win.webContents.capturePage()).toPNG());
      await setViewport(1600,1000);
    }

    // Each account configuration passes through the real Tauri compatibility bridge.
    // Account 0: Demand mode with Fixed Boss Articuno
    await read('document.querySelector("[data-field=enabled]").click()');
    await read('document.querySelector("input[name=pioBossMode][value=demand]").click()');
    await read('document.querySelector("[data-action=save]").click()');
    for(let i=0;i<35;i++) {
      if(await read('__bossFixture.configs[0].enabled === true')) break;
      await pause(100);
    }
    assert.deepEqual(await read('JSON.parse(JSON.stringify(__bossFixture.configs[0]))').then(x=>[x.enabled,x.bossKey,x.mode,x.quantity,x.distribution]),
      [true,'articuno','demand',null,[]]);

    // Account 1: Infinite mode with percentage distribution
    await read('document.querySelectorAll(".pio-boss-account")[1].click()');
    await read('document.querySelector("[data-boss-key=zapdos]").click()');
    await read('(()=>{const select=document.querySelector("[data-field=pokemon-primary]");select.value="110";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await read('document.querySelector("[data-action=save-profile]").click()');
    for(let i=0;i<35;i++) {
      if(await read('__bossFixture.configs[1].pokemonProfiles.zapdos?.fighterId===110')) break;
      await pause(100);
    }
    assert.deepEqual(await read('__bossFixture.configs[1].pokemonProfiles.zapdos'),{primaryId:110,fighterId:110});
    await read('document.querySelector("[data-field=enabled]").click()');
    await read('document.querySelector("input[name=pioBossMode][value=infinite]").click()');
    await read('document.querySelector("input[name=pioBossStrategy][value=percent]").click()');
    await read('(()=>{const z=document.querySelector(\'[data-distribution-boss="zapdos"]\');z.value="60";z.dispatchEvent(new Event("input",{bubbles:true}));z.dispatchEvent(new Event("change",{bubbles:true}));const a=document.querySelector(\'[data-distribution-boss="articuno"]\');a.value="40";a.dispatchEvent(new Event("input",{bubbles:true}));a.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await read('document.querySelector("[data-action=save]").click()');
    for(let i=0;i<35;i++) {
      if(await read('__bossFixture.configs[1].enabled === true && __bossFixture.configs[1].distribution?.length === 2')) break;
      await pause(100);
    }
    const nativeConfigs=await read('__nativeCalls.filter(x=>x.name==="blaster_boss_configure").map(x=>x.args)');
    assert.deepEqual(nativeConfigs[0],{index:0,enabled:true,bossKey:'articuno',mode:'demand',quantity:null,distribution:[]});
    assert.equal(nativeConfigs[1].index, 1);
    assert.equal(nativeConfigs[1].enabled, true);
    assert.equal(nativeConfigs[1].mode, 'infinite');
    assert.equal(nativeConfigs[1].quantity, null);
    assert.deepEqual(nativeConfigs[1].distribution.sort((a,b)=>a.bossKey.localeCompare(b.bossKey)),
      [{bossKey:'articuno',percent:40},{bossKey:'zapdos',percent:60}]);
    if (process.env.BOSS_E2E_CAPTURE === '1') {
      for (const [width, height] of [[1600,950], [820,720]]) {
        await setViewport(width, height);
        await read('document.querySelector(".pio-boss-configuration").scrollIntoView({block:"start"})');
        await read('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        fs.writeFileSync(path.join(output, `boss-modes-${width}x${height}.png`), (await win.webContents.capturePage()).toPNG());
      }
      await setViewport(1600,950);
    }
    assert.equal(await read('__nativeCalls.some(x=>x.name==="blaster_send" && /boss\./.test(x.args.data?.t||""))'),false,
      'Opening and configuring UI must not consume a token');

    await read(`(()=>{
      const states=[
        {i:0,ok:true,live:true,name:'Fixture 1',sessStart:1700000000000,inventoryKnown:true,ballsKnown:true,team:[{sid:7,name:'Squirtle',ld:true}],
          invMap:{70000:2,70014:2}, rawDrops:{'70014':{id:'70014',name:'Mega Stone Fragment',qty:2}},
          a:{seconds:120,xph:12000},bossesJogaveis:__bossFixture.catalog,
          bossLive:{enabled:true,bossKey:'articuno',bossName:'Articuno',inArena:true,currentHp:400,maxHp:1000,turn:4,
            playerHp:70,playerMaxHp:100,mode:'quantity',limit:2,completed:1,tokenBalance:2,status:'fighting'},
          bossDrops:[{id:'70014',name:'Mega Stone Fragment',qty:2,bossKey:'articuno',bossName:'Articuno'}]},
        {i:1,ok:true,live:true,name:'Fixture 2',sessStart:1700000000001,inventoryKnown:true,ballsKnown:true,team:[{sid:25,name:'Pikachu',ld:true}],
          invMap:{70000:4},a:{seconds:90,xph:6000},bossesJogaveis:__bossFixture.catalog,
          bossLive:{enabled:true,bossKey:'zapdos',bossName:'Zapdos',inArena:true,currentHp:500,maxHp:800,turn:2,
            mode:'all',completed:1,tokenBalance:4,status:'fighting'},bossDrops:[]}
      ];
      for(let i=0;i<2;i++){
        localStorage.setItem('bsh_blaster_'+i,'1');
        const panel=document.querySelectorAll('.panel')[i];
        panel.classList.add('is-hud-active','is-blaster-active');
        __emitNative('blaster:update',{index:i,state:states[i]});
      }
    })()`);
    assert.equal(await read('PioAutoBossPanel.getState().selectedAccount'),1,'second account remains selected for the live chart check');
    assert.ok(await read('Boolean(document.querySelector(".pio-boss-live-chart"))'), 'setup chart switches to live data while an arena is active');
    const liveChartBefore=await read('document.querySelector(".pio-boss-live-chart").innerHTML');
    await read(`(()=>{
      const next={...stCache[1].d,bossLive:{...stCache[1].d.bossLive,currentHp:275,turn:9}};
      __emitNative('blaster:update',{index:1,state:next});
    })()`);
    const liveChartAfter=await read('document.querySelector(".pio-boss-live-chart").innerHTML');
    assert.notEqual(liveChartAfter,liveChartBefore,'selected account blaster:update rerenders its live boss chart');
    assert.match(await read('document.querySelector(".pio-boss-live-chart").textContent'),/275|9/,'updated live HP or attack count is represented');
    assert.deepEqual(await read(`Array.from(document.querySelectorAll('.panel')).slice(0,2).map(p=>p.querySelector('.bsh-boss-name').textContent)`),
      ['Articuno','Zapdos']);
    assert.equal(await read('document.querySelector(".panel .bsh-boss-hp-fill").style.transform'),'scaleX(0.4)');
    assert.equal(await read('document.querySelector(".panel .bsh-boss-hp-value").textContent'),'400 / 1.000 HP');
    assert.match(await read('document.querySelector(".panel .bsh-boss-details").textContent'),/Ataques 4.*Feitos 1\/2.*2 tokens/);
    assert.doesNotMatch(await read('document.querySelector(".panel .bsh-boss-details").textContent'),/Seu HP/);
    assert.equal(await read('document.querySelector(".panel .bsh-boss-drop-items").querySelectorAll(".bsh-boss-drop-entry").length'),3);
    assert.equal(await read(`[...document.querySelectorAll('.panel .bsh-boss-drop-entry')]
      .find(card=>card.querySelector('.bsh-boss-drop-name')?.textContent==='Mega Stone Fragment')
      ?.querySelector('.bsh-boss-drop-number')?.textContent`),'x2');
    assert.equal(await read(`[...document.querySelectorAll('.panel .bsh-boss-drop-entry')]
      .find(card=>card.querySelector('.bsh-boss-drop-name')?.textContent==='Mega Stone Fragment')
      ?.querySelector('.bsh-boss-drop-badge')?.textContent`),'+2');
    const loaded=await read(`new Promise(resolve=>{
      const img=[...document.querySelectorAll('.panel .bsh-boss-drop-entry')]
        .find(card=>card.querySelector('.bsh-boss-drop-name')?.textContent==='Mega Stone Fragment')
        ?.querySelector('.bsh-boss-drop-sprite img');
      if(!img) return resolve(false);
      if(img.complete) return resolve(img.naturalWidth>0);
      img.addEventListener('load',()=>resolve(true),{once:true});
      img.addEventListener('error',()=>resolve(false),{once:true});
      setTimeout(()=>resolve(false),1500);
    })`);
    assert.equal(loaded,true,'sprite file must load locally');
    assert.equal(await read('stCache[0].d.bossDrops[0].qty'),2);
    assert.equal(await read('stCache[1].d.bossDrops.length'),0);
    assert.equal(await read('typeof window.__pgFeedState'),'function','real global tracker connected');
    await read('window.__pgFeedState(0,stCache[0].d)'); // Establish receipt baseline, not a new acquisition.

    // Three different bosses stay separate in the menu after their arenas close.
    await read(`(()=>{
      for(const [key,name,result,drops] of [
        ['articuno','Articuno','victory',[{id:'70014',name:'Mega Stone Fragment',qty:2}]],
        ['zapdos','Zapdos','victory',[{id:'70014',name:'Mega Stone Fragment',qty:1}]],
        ['moltres','Moltres','defeat',null],
        ['suicune','Suicune','victory',[]],
        ['suicune','Suicune','victory',[{id:'70014',name:'Mega Stone Fragment',qty:2}]]]){
        const base={cid:'fixture-1',name:'Fixture 1',bossLive:{bossKey:key,bossName:name,inArena:true,status:'fighting'}};
        PioBossHistory.observe(0,base);
        PioBossHistory.observe(0,{...base,bossLive:{...base.bossLive,inArena:false,winner:result,status:result,lastBattleDrops:drops,
          durationMs:key==='suicune' ? (drops.length ? 12_500 : 25_000) : null,turn:5}});
      }
    })()`);
    await read('PioAutoBossPanel.openHistory(0)');
    assert.equal(await read('document.querySelectorAll(".pio-boss-history-groups button").length'),5);
    assert.ok(await read('Boolean(document.querySelector(".pio-boss-chart-page"))'), 'history keeps the chart panel visible beside battle details');
    assert.equal(await read('document.querySelectorAll("[data-action=view-charts]").length'),0, 'history has no separate charts view');
    assert.ok(await read('(()=>{const c=document.querySelector(".pio-boss-chart-page");const p=c.parentElement.getBoundingClientRect();return c.getBoundingClientRect().left>=p.left+p.width/2})()'), 'history chart occupies the right column');
    assert.match(await read('document.querySelector(".pio-boss-history-detail").textContent'),/Articuno/);
    await read('document.querySelector("[data-history-boss=zapdos]").click()');
    assert.match(await read('document.querySelector(".pio-boss-history-detail").textContent'),/Zapdos/);
    assert.doesNotMatch(await read('document.querySelector(".pio-boss-history-detail").textContent'),/Articuno/);
    await read('document.querySelector("[data-history-boss=suicune]").click()');
    assert.match(await read('document.querySelector(".pio-boss-history-list").textContent'),/Sem itens nesta batalha/);
    await read('(()=>{const s=document.querySelector(".pio-boss-chart-page [data-chart-filter=boss]");s.value="suicune";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
    assert.equal(await read('[...document.querySelectorAll(".pio-boss-chart-heading span")].find(el=>el.textContent.includes("Média por vitória"))?.textContent'),'Média por vitória: 1 · 2 vitórias com drops conhecidos',
      'two Suicune wins, including one without a drop, average one item per win in the embedded chart');
    assert.match(await read('document.querySelector(".pio-boss-chart-page").textContent'),/Vitória sem itens/);
    assert.ok(await read('document.querySelector(".pio-boss-chart-page .pio-boss-temporal-svg .pio-boss-chart-y-label")?.textContent != null'));
    assert.match(await read('document.querySelector(".pio-boss-chart-page .pio-boss-temporal-svg").textContent'),/#1/);
    if(process.env.BOSS_E2E_CAPTURE==='1') {
      await setViewport(820,720);
      await read('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(output,'boss-charts-drops-820x720.png'),(await win.webContents.capturePage()).toPNG());
    }
    await read('(()=>{const s=document.querySelector(".pio-boss-chart-page [data-chart-filter=metric]");s.value="duration";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
    assert.match(await read('document.querySelector(".pio-boss-chart-page .pio-boss-temporal-svg").getAttribute("aria-label")'),/Duração/);
    if(process.env.BOSS_E2E_CAPTURE==='1') {
      await read('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(output,'boss-charts-duration-820x720.png'),(await win.webContents.capturePage()).toPNG());
      await setViewport(1600,950);
    }
    assert.equal(await read('PioBossHistory.read(0,"fixture-1").length'),5);
    await read('document.querySelector("[data-action=view-history]").click()');

    // Stale visual updates cannot replace the independent Headless state.
    await read('__emitNative("st:push",{index:0,state:{bossLive:{bossName:"WRONG",inArena:true},bossDrops:[]}})');
    assert.equal(await read('stCache[0].d.bossLive.bossName'),'Articuno');

    // The generic Avisos/Raros drop history must consume the actual Headless
    // receipt delta exactly once, not the catalog's potential rewards.
    await read(`(()=>{
      const changed=JSON.parse(JSON.stringify(stCache[0].d));
      const loot={id:'70014',name:'Mega Stone Fragment',qty:3};
      changed.rawDrops={'70014':loot,'Mega Stone Fragment':loot};
      changed.drops=changed.rawDrops; // The native parser increments both drop snapshots.
      changed.bossDrops=[{id:'70014',name:'Mega Stone Fragment',qty:3,bossKey:'articuno',bossName:'Articuno'}];
      __emitNative('blaster:update',{index:0,state:changed});
      __emitNative('blaster:update',{index:0,state:changed});
    })()`);
    const tracked=await read(`JSON.parse(localStorage.getItem('pio-drops-v1')||'[]')
      .filter(x=>x.conta===1 && /MEGA Stone/i.test(x.item))
      .map(x=>({qty:x.qtd,tipo:x.tipo,origem:x.origem}))`);
    assert.deepEqual(tracked,[{qty:1,tipo:'raro',origem:'drop'}],
      'one confirmed new boss drop increments Avisos/Raros once, even with ID/name aliases and repeat push');

    for(const [width,height] of [[1920,1032],[1600,950],[820,720],[800,600]]) {
      await setViewport(width,height);
      const bounds=await read(`(()=>{
        const overlay=document.getElementById('pioAutoBossOverlay');
        const dialog=overlay.querySelector('.pio-boss-dialog');
        const footer=overlay.querySelector('.pio-boss-footer');
        const r=dialog.getBoundingClientRect(),f=footer.getBoundingClientRect();
        return {dialog:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},footer:{left:f.left,right:f.right,top:f.top,bottom:f.bottom},viewport:{w:innerWidth,h:innerHeight}};
      })()`);
      assert.ok(bounds.dialog.left>=-1 && bounds.dialog.right<=bounds.viewport.w+1,`${width} dialog horizontal bounds ${JSON.stringify(bounds)}`);
      assert.ok(bounds.dialog.top>=-1 && bounds.dialog.bottom<=bounds.viewport.h+1,`${height} dialog vertical bounds ${JSON.stringify(bounds)}`);
      assert.ok(bounds.footer.top>=bounds.dialog.top && bounds.footer.bottom<=bounds.dialog.bottom+1,`${width} footer visible`);
      if(process.env.BOSS_E2E_CAPTURE==='1' && width===820){
        fs.writeFileSync(path.join(output,'boss-history-820x720.png'),(await win.webContents.capturePage()).toPNG());
      }
      await read('document.getElementById("pioAutoBossOverlay").style.setProperty("opacity","0","important")');
      const hudBounds=await read(`Array.from(document.querySelectorAll('.panel')).slice(0,2).map(panel=>{
        const hud=panel.querySelector('.battle-slot-hud');
        const button=hud.querySelector('.bsh-open-game-btn');
        const items=hud.querySelector('.bsh-boss-drop-items');
        const social=hud.querySelector('.bsh-social').getBoundingClientRect();
        const flags=hud.querySelector('.bsh-account-flags').getBoundingClientRect();
        const main=hud.querySelector('.bsh-main').getBoundingClientRect();
        const rail=hud.querySelector('.bsh-boss-drop-tracker').getBoundingClientRect();
        const b=button.getBoundingClientRect(),r=items.getBoundingClientRect(),h=hud.getBoundingClientRect();
        return {buttonBottom:b.bottom,itemsBottom:r.bottom,hudBottom:h.bottom,
          socialBottom:social.bottom,flagsTop:flags.top,mainRight:main.right,railLeft:rail.left,
          overlap:b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top,
          scrollHeight:hud.scrollHeight,clientHeight:hud.clientHeight,overflow:getComputedStyle(hud).overflowY};
      })`);
      assert.ok(hudBounds.every(value=>value.buttonBottom<=value.hudBottom+1),`${width} boss action visible ${JSON.stringify(hudBounds)}`);
      assert.ok(hudBounds.every(value=>!value.overlap && value.itemsBottom<=value.hudBottom+1),
        `${width} boss drops visible without action overlap ${JSON.stringify(hudBounds)}`);
      assert.ok(hudBounds.every(value=>value.overflow==='hidden' && value.scrollHeight<=value.clientHeight+1),
        `${width} Headless must fit without scrolling ${JSON.stringify(hudBounds)}`);
      if(width<=820) assert.ok(hudBounds.every(value=>value.socialBottom<=value.flagsTop+1 && value.mainRight<=value.railLeft+1),
        `${width} social, fight and boss rail must not overlap ${JSON.stringify(hudBounds)}`);
      if(process.env.BOSS_E2E_CAPTURE==='1'){
        await read('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        fs.writeFileSync(path.join(output,`boss-hud-${width}x${height}.png`),(await win.webContents.capturePage()).toPNG());
      }
      await read('document.getElementById("pioAutoBossOverlay").style.removeProperty("opacity")');
    }
    const previousHistory=await read('PioBossHistory.read(1).length');
    await read(`(()=>{
      const next={...stCache[1].d,hunt:'enraged_typhlosion',bossLive:{...stCache[1].d.bossLive,
        inArena:false,winner:'victory',status:'victory',lastBattleDrops:[{id:'777777',name:'TM rara',qty:1}]}};
      __emitNative('blaster:update',{index:1,state:next});
      __emitNative('blaster:update',{index:1,state:next});
    })()`);
    assert.equal(await read('PioBossHistory.read(1).length'),previousHistory+1,'bridge saves one confirmed result');
    assert.equal(await read('document.querySelectorAll(".panel")[1].querySelector(".bsh-boss-live").hidden'),true);
    assert.equal(await read('document.querySelectorAll(".panel")[1].querySelector(".bsh-boss-drop-tracker").hidden'),false);
    assert.equal(await read('document.querySelectorAll(".panel")[1].querySelector(".bsh-boss-drop-items").querySelectorAll(".bsh-boss-drop-entry").length'),3);
    assert.equal(await read('document.querySelectorAll(".panel")[1].querySelector(".bsh-fighter-hunt .bsh-fighter-tag").textContent'),'CAÇA ATUAL');
    assert.equal(await read('PioBossHistory.read(1)[0].drops[0].name'),'TM rara');
    console.log('PASS: real Tauri launcher UI / bridge / 4-account boss setup / live Headless / drops / layout; fixture only');
  } catch (error) {console.error(error);process.exitCode=1;}
  finally {win.destroy();app.exit(process.exitCode||0);}
}).catch(error=>{console.error(error);app.exit(1);});
