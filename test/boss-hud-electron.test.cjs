'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'rust-migration/ui/src/ui/battle-hud.css'), 'utf8');
const catalogJs = fs.readFileSync(path.join(root, 'rust-migration/ui/src/ui/boss-item-catalog.js'), 'utf8');
const js = fs.readFileSync(path.join(root, 'rust-migration/ui/src/ui/battle-hud.js'), 'utf8');
const scratch = path.join(root, 'scratch');
fs.mkdirSync(scratch, { recursive: true });
app.setPath('userData', path.join(scratch, 'boss-hud-profile-' + process.pid));

function pageHtml() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <base href="${pathToFileURL(path.join(root, 'rust-migration', 'ui') + path.sep).href}">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #081124; }
      #grid { height: 100vh; width: 100vw; padding: 3px; display: grid; gap: 4px;
        grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
      .panel { min-width: 0; min-height: 0; display: grid; overflow: hidden; grid-template-rows: 26px minmax(0, 1fr); border: 1px solid #273856; }
      .panel-header { height: 26px; display: flex; align-items: center; gap: 8px; background: #12223c; color: white; }
      ${css}
    </style></head><body><div id="grid">
      ${[1, 2, 3, 4].map(i => `<section class="panel is-hud-active is-blaster-active"><div class="panel-header"><span>Conta ${i}</span><span>Headless</span></div></section>`).join('')}
      </div></body></html>`;
}

const state = {
  live: true, hunt: 'vulpix', inventoryKnown: true, ballsKnown: true,
  team: [{ sid: 7, name: 'Squirtle', level: 36, ld: true, shiny: false }],
  invMap: { 70000: 6, 70014: 7, 70090: 1 },
  rawDrops: {},
  a: { seconds: 125, xph: 85000, shinyCap: 1, shinyFound: 1 },
  bossLive: { enabled: true, inArena: true, status: 'in_battle', bossKey: 'articuno',
    bossName: 'Articuno', currentHp: 430, maxHp: 1000, turn: 6, playerHp: 78, playerMaxHp: 120,
    completed: 2, limit: 4, mode: 'quantity', tokenBalance: 5, lastBattleDrops: null },
  bossesJogaveis: [{ key: 'articuno', nome: 'Articuno', drops: [
    { itemId: 70014, nome: 'Mega Stone Fragment' },
    { itemId: 70090, nome: 'Mystic Ticket' },
    { itemId: 70015, nome: 'Mega Shiny Stone Fragment' },
    { itemId: 59200, nome: 'Normal-Type TM Disk' }
  ] }],
  bossDrops: [{ id: 70014, name: 'Mega Stone Fragment', qty: 2, bossKey: 'articuno' }]
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 900, useContentSize: true, show: false,
    webPreferences: { backgroundThrottling: false } });
  try {
    const file = path.join(scratch, 'boss-hud-fixture-' + process.pid + '.html');
    fs.writeFileSync(file, pageHtml());
    await win.loadFile(file);
    await win.webContents.executeJavaScript(`window.PioInventory = {project: s => s};\nwindow.PIW_ALL_POKEMON_THEMES = [{name:'Articuno',dex:144}];\n${catalogJs}\n${js}`);
    await win.webContents.executeJavaScript(`(() => {
      document.querySelectorAll('.panel').forEach((panel, i) => PioBattleHud.mount(panel, i));
      PioBattleHud.isBlasterActive = () => true;
      const state = ${JSON.stringify(state)};
      document.querySelectorAll('.panel').forEach((panel, i) => PioBattleHud.update(panel, i, state));
    })()`);
    const metrics = await win.webContents.executeJavaScript(`(() => {
      const cards = [...document.querySelectorAll('.panel')];
      return cards.map(panel => {
        const hud = panel.querySelector('.battle-slot-hud');
        const arena = hud.querySelector('.bsh-boss-live');
        const drop = hud.querySelector('.bsh-boss-drop-tracker');
        const button = hud.querySelector('.bsh-open-game-btn');
        return { hudHeight: hud.getBoundingClientRect().height,
          arenaHidden: arena.hidden, dropHidden: drop.hidden,
          live: arena.querySelector('.bsh-boss-status').textContent,
          percent: arena.querySelector('.bsh-boss-hp-fill').style.transform,
          hp: arena.querySelector('.bsh-boss-hp-value').textContent,
          tokens: arena.querySelector('.bsh-boss-details').textContent,
          headingAbsent: drop.querySelector('.bsh-boss-drops-header')===null,
          cards: drop.querySelectorAll('.bsh-boss-drop-entry').length,
          names: [...drop.querySelectorAll('.bsh-boss-drop-name')].map(item => item.textContent),
          owned: [...drop.querySelectorAll('.bsh-boss-drop-entry')]
            .find(card=>card.querySelector('.bsh-boss-drop-name')?.textContent==='Mega Stone Fragment')
            ?.querySelector('.bsh-boss-drop-number')?.textContent,
          badge: [...drop.querySelectorAll('.bsh-boss-drop-entry')]
            .find(card=>card.querySelector('.bsh-boss-drop-name')?.textContent==='Mega Stone Fragment')
            ?.querySelector('.bsh-boss-drop-badge')?.textContent,
          buttonBottom: button.getBoundingClientRect().bottom,
          hudBottom: hud.getBoundingClientRect().bottom };
      });
    })()`);
    assert.equal(metrics.length, 4);
    for (const m of metrics) {
      assert.equal(m.arenaHidden, false);
      assert.equal(m.dropHidden, false);
      assert.equal(m.live, 'Batalha ao vivo');
      assert.equal(m.percent, 'scaleX(0.43)');
      assert.equal(m.hp, '430 / 1.000 HP');
      assert.match(m.tokens, /Ataques 6.*Feitos 2\/4.*5 tokens/);
      assert.doesNotMatch(m.tokens, /Seu HP/);
      assert.equal(m.headingAbsent, true);
      assert.equal(m.owned, 'x7');
      assert.equal(m.badge, '+2');
      assert.equal(m.cards, 4);
      assert.ok(m.names.includes('Normal-Type TM Disk'));
      assert.ok(m.buttonBottom <= m.hudBottom + 2, `HUD escondeu botão: ${JSON.stringify(m)}`);
    }
    const demandProgress = await win.webContents.executeJavaScript(`(() => {
      const panel = document.querySelector('.panel');
      PioBattleHud.update(panel, 0, {...${JSON.stringify(state)}, bossLive: {
        ...${JSON.stringify(state.bossLive)}, mode:'demand', completed:2, limit:7
      }});
      return panel.querySelector('.bsh-boss-details').textContent;
    })()`);
    assert.match(demandProgress, /Feitos 2\/7/);
    const infiniteProgress = await win.webContents.executeJavaScript(`(() => {
      const panel = document.querySelector('.panel');
      PioBattleHud.update(panel, 0, {...${JSON.stringify(state)}, bossLive: {
        ...${JSON.stringify(state.bossLive)}, mode:'infinite'
      }});
      return panel.querySelector('.bsh-boss-details').textContent;
    })()`);
    assert.match(infiniteProgress, /Feitos 2/);
    assert.doesNotMatch(infiniteProgress, /Feitos 2\//);
    const refreshedStock = await win.webContents.executeJavaScript(`(() => {
      const panel=document.querySelector('.panel');
      PioBattleHud.update(panel,0,{...${JSON.stringify(state)},invMap:{...${JSON.stringify(state.invMap)},70014:10}});
      const card=[...panel.querySelectorAll('.bsh-boss-drop-entry')]
        .find(el=>el.querySelector('.bsh-boss-drop-name')?.textContent==='Mega Stone Fragment');
      return {owned:card?.querySelector('.bsh-boss-drop-number')?.textContent,
        badge:card?.querySelector('.bsh-boss-drop-badge')?.textContent};
    })()`);
    assert.deepEqual(refreshedStock,{owned:'x10',badge:'+2'});
    const unknownHp = await win.webContents.executeJavaScript(`(() => {
      const missing = {...${JSON.stringify(state)}, bossLive: {...${JSON.stringify(state.bossLive)}, currentHp:null, maxHp:null}};
      const panel = document.querySelector('.panel');
      PioBattleHud.update(panel, 0, missing);
      const arena = panel.querySelector('.bsh-boss-live');
      return { hp: arena.querySelector('.bsh-boss-hp-value').textContent,
        barHidden: arena.querySelector('.bsh-boss-hp').hidden,
        details: arena.querySelector('.bsh-boss-details').textContent };
    })()`);
    assert.equal(unknownHp.hp, 'Aguardando dados');
    assert.equal(unknownHp.barHidden, true);
    assert.doesNotMatch(unknownHp.details, /Seu HP/);
    const resultStates = await win.webContents.executeJavaScript(`(() => {
      const victory = {...${JSON.stringify(state)}, bossLive: {...${JSON.stringify(state.bossLive)},
        enabled:false, inArena:false, status:'victory', winner:'victory', lastBattleDrops:[]}};
      document.querySelectorAll('.panel').forEach((panel, i) => PioBattleHud.update(panel, i, victory));
      const none = [...document.querySelectorAll('.bsh-boss-live')].map(el => el.hidden);
      victory.bossLive.lastBattleDrops = [{id:'70014',name:'Mega Stone Fragment',qty:2}];
      document.querySelectorAll('.panel').forEach((panel, i) => PioBattleHud.update(panel, i, victory));
      const won = [...document.querySelectorAll('.bsh-boss-live')].map(el => el.hidden);
      victory.bossLive.inArena = false; victory.bossLive.status = 'defeat'; victory.bossLive.winner = 'defeat';
      victory.bossLive.lastBattleDrops = null;
      document.querySelectorAll('.panel').forEach((panel, i) => PioBattleHud.update(panel, i, victory));
      const lost = [...document.querySelectorAll('.bsh-boss-live')].map(el => el.hidden);
      return {none,won,lost};
    })()`);
    assert.ok(resultStates.none.every(Boolean), 'Vitória encerrada sai do HUD');
    assert.ok(resultStates.won.every(Boolean), 'Recompensas encerradas ficam no histórico');
    assert.ok(resultStates.lost.every(Boolean), 'Derrota encerrada sai do HUD');
    const outsideArena = await win.webContents.executeJavaScript(`(() => {
      const panel = document.querySelector('.panel');
      const state = {...${JSON.stringify(state)}, bossLive: {enabled:false,inArena:false,bossKey:'articuno'},
        bossesJogaveis:[...${JSON.stringify(state.bossesJogaveis)},
          {key:'zapdos',nome:'Zapdos',drops:[{itemId:70017,nome:'Shiny Egg Fragment'}]},
          {key:'moltres',nome:'Moltres',drops:[{itemId:70095,nome:'Safari Ticket'}]}],
        bossDrops:[...${JSON.stringify(state.bossDrops)}, {id:70017,name:'Shiny Egg Fragment',qty:3,bossKey:'zapdos'}]};
      PioBattleHud.update(panel,0,state);
      const hud=panel.querySelector('.battle-slot-hud');
      const initial={battleHidden:hud.querySelector('.bsh-boss-live').hidden,
        catalogHidden:hud.querySelector('.bsh-boss-drop-tracker').hidden,
        selectorAbsent:hud.querySelector('.bsh-boss-catalog-select')===null,
        names:[...hud.querySelectorAll('.bsh-boss-drop-name')].map(el=>el.textContent),
        obtained:[...hud.querySelectorAll('.bsh-boss-drop-entry')]
          .find(card=>card.querySelector('.bsh-boss-drop-name')?.textContent==='Shiny Egg Fragment')
          ?.querySelector('.bsh-boss-drop-badge')?.textContent};
      PioBattleHud.update(panel,0,{...state,bossesJogaveis:[],bossDrops:[],bossLive:null});
      const unavailable={catalogHidden:hud.querySelector('.bsh-boss-drop-tracker').hidden,
        count:hud.querySelectorAll('.bsh-boss-drop-entry').length,
        emptyHidden:hud.querySelector('.bsh-boss-drops-empty').hidden,
        badgesVisible:[...hud.querySelectorAll('.bsh-boss-drop-badge')]
          .filter(el=>getComputedStyle(el).display!=='none').length};
      return {initial,unavailable};
    })()`);
    assert.equal(outsideArena.initial.battleHidden, true);
    assert.equal(outsideArena.initial.catalogHidden, false);
    assert.equal(outsideArena.initial.selectorAbsent, true);
    assert.ok(outsideArena.initial.names.includes('Normal-Type TM Disk'));
    assert.ok(outsideArena.initial.names.includes('Shiny Egg Fragment'));
    assert.ok(outsideArena.initial.names.includes('Safari Ticket'));
    assert.equal(outsideArena.initial.obtained, '+3');
    assert.equal(outsideArena.unavailable.catalogHidden, false);
    assert.equal(outsideArena.unavailable.count,6);
    assert.equal(outsideArena.unavailable.emptyHidden,true);
    assert.equal(outsideArena.unavailable.badgesVisible,0);
    await win.webContents.executeJavaScript(`document.querySelectorAll('.panel').forEach((panel,i)=>PioBattleHud.update(panel,i,${JSON.stringify(state)}))`);
    // For comparison with the real launcher size constraints.
    win.setContentSize(1920, 1032);
    await new Promise(resolve => setTimeout(resolve, 120));
    if (process.env.BOSS_HUD_CAPTURE === '1') {
      fs.writeFileSync(path.join(scratch, 'boss-hud-1920.png'), (await win.webContents.capturePage()).toPNG());
    }
    win.setContentSize(1600, 950);
    await new Promise(resolve => setTimeout(resolve, 120));
    if (process.env.BOSS_HUD_CAPTURE === '1') {
      fs.writeFileSync(path.join(scratch, 'boss-hud-1600.png'), (await win.webContents.capturePage()).toPNG());
    }
    win.setContentSize(820, 720);
    await new Promise(resolve => setTimeout(resolve, 120));
    if (process.env.BOSS_HUD_CAPTURE === '1') {
      fs.writeFileSync(path.join(scratch, 'boss-hud-820.png'), (await win.webContents.capturePage()).toPNG());
    }
    const compact = await win.webContents.executeJavaScript(`[...document.querySelectorAll('.panel')].map(panel => {
      const hud = panel.querySelector('.battle-slot-hud');
      return {
        buttonBottom: hud.querySelector('.bsh-open-game-btn').getBoundingClientRect().bottom,
        hudBottom: hud.getBoundingClientRect().bottom,
        scrollHeight: hud.scrollHeight,
        clientHeight: hud.clientHeight,
        dropBottom: hud.querySelector('.bsh-boss-drop-tracker').getBoundingClientRect().bottom,
        bossVisible: !hud.querySelector('.bsh-boss-live').hidden,
        heights: [...hud.children].map(el => [el.className, Math.round(el.getBoundingClientRect().height), Math.round(el.getBoundingClientRect().top), getComputedStyle(el).marginTop])
      };
    })`);
    for (const m of compact) {
      assert.equal(m.bossVisible, true);
      assert.ok(m.scrollHeight <= m.clientHeight + 1, `HUD com rolagem em 820x720: ${JSON.stringify(m)}`);
      assert.ok(m.buttonBottom <= m.hudBottom + 2, `Botão inacessível em 820x720: ${JSON.stringify(m)}`);
      assert.ok(m.dropBottom <= m.hudBottom + 2, `Drops invisíveis em 820x720: ${JSON.stringify(m)}`);
    }
    // Reproduz a janela Headless isolada da captura original (834×481).
    await win.webContents.executeJavaScript(`document.querySelector('#grid').style.gridTemplateColumns = '1fr';
      document.querySelector('#grid').style.gridTemplateRows = '1fr';
      document.querySelectorAll('.panel').forEach((panel, i) => panel.style.display = i ? 'none' : 'grid');
      PioBattleHud.update(document.querySelector('.panel'), 0, ${JSON.stringify(state)});`);
    win.setContentSize(834, 481);
    await new Promise(resolve => setTimeout(resolve, 120));
    const originalSize = await win.webContents.executeJavaScript(`(() => {
      const hud = document.querySelector('.battle-slot-hud');
      const rect = el => { const r = el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height}; };
      return { hud:rect(hud), scrollHeight:hud.scrollHeight, clientHeight:hud.clientHeight,
        overflow:getComputedStyle(hud).overflowY,
        children:[...hud.children].filter(el => getComputedStyle(el).display !== 'none').map(el => ({name:el.className, ...rect(el)})),
        bannerHidden:getComputedStyle(document.querySelector('.bsh-mode-banner')).display==='none',
        header:document.querySelector('.panel-header').textContent,
        switchMode:document.querySelector('.bsh-switch-mode-btn').textContent,
        tier:document.querySelector('.bsh-outland-tier').textContent,
        tierHidden:document.querySelector('.bsh-outland-tier').hidden,
        result:document.querySelector('.bsh-boss-result').textContent };
    })()`);
    if (process.env.BOSS_HUD_CAPTURE === '1') {
      fs.writeFileSync(path.join(scratch, 'boss-hud-834x481.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`(() => {
        const tmState = {...${JSON.stringify(state)}, bossesJogaveis:[{key:'articuno',nome:'Articuno',drops:[
          {itemId:59194,nome:'TM Disk Piece'}, {itemId:40530,nome:'AoE TM Disk Piece'}
        ]}], bossDrops:[]};
        PioBattleHud.update(document.querySelector('.panel'), 0, tmState);
      })()`);
      await new Promise(resolve => setTimeout(resolve, 120));
      fs.writeFileSync(path.join(scratch, 'boss-hud-834x481-tms.png'), (await win.webContents.capturePage()).toPNG());
    }
    assert.equal(originalSize.overflow, 'hidden');
    assert.ok(originalSize.scrollHeight <= originalSize.clientHeight + 1, 'Headless não deve rolar em 834×481');
    assert.equal(originalSize.bannerHidden, true, 'Selo interno redundante fica oculto no boss');
    assert.match(originalSize.header, /Headless/, 'Modo Headless continua identificável no cabeçalho');
    assert.equal(originalSize.switchMode, 'Usar painel de batalha');
    assert.equal(originalSize.tier.trim(), '', 'Tier de Outland não aparece em outra caça');
    assert.equal(originalSize.tierHidden, true, 'Indicador de Outland fica oculto fora da região');
    assert.ok(originalSize.children.every(el => el.top >= originalSize.hud.top - 1 && el.bottom <= originalSize.hud.bottom + 1),
      `Conteúdo cortado em 834×481: ${JSON.stringify(originalSize)}`);
    const normalHunt = await win.webContents.executeJavaScript(`(() => {
      const panel=document.querySelector('.panel');
      PioBattleHud.update(panel,0,{...${JSON.stringify(state)},bossLive:{inArena:false,bossKey:'articuno'}});
      const hud=panel.querySelector('.battle-slot-hud');
      PioBattleHud.updateBanner(hud,true);
      const catalog=hud.querySelector('.bsh-boss-drop-tracker');
      return {battleHidden:hud.querySelector('.bsh-boss-live').hidden,
        catalogHidden:catalog.hidden,scrollHeight:hud.scrollHeight,clientHeight:hud.clientHeight,
        catalogBottom:catalog.getBoundingClientRect().bottom,hudBottom:hud.getBoundingClientRect().bottom};
    })()`);
    if (process.env.BOSS_HUD_CAPTURE === '1') {
      fs.writeFileSync(path.join(scratch, 'boss-hud-834x481-fora-arena.png'), (await win.webContents.capturePage()).toPNG());
    }
    assert.equal(normalHunt.battleHidden,true);
    assert.equal(normalHunt.catalogHidden,false);
    assert.ok(normalHunt.scrollHeight<=normalHunt.clientHeight+1,'Headless fora da arena não deve rolar');
    assert.ok(normalHunt.catalogBottom<=normalHunt.hudBottom+2,'Catálogo fora da arena deve caber na janela');
    const multiBoss = await win.webContents.executeJavaScript(`(() => {
      const state={...${JSON.stringify(state)},bossLive:{inArena:false},bossesJogaveis:[...${JSON.stringify(state.bossesJogaveis)},
        {key:'zapdos',nome:'Zapdos',drops:[{itemId:70017,nome:'Shiny Egg Fragment'}]},
        {key:'moltres',nome:'Moltres',drops:[{itemId:70095,nome:'Safari Ticket'}]}],
        bossDrops:[...${JSON.stringify(state.bossDrops)},{id:70017,name:'Shiny Egg Fragment',qty:3,bossKey:'zapdos'}]};
      const panel=document.querySelector('.panel');
      PioBattleHud.update(panel,0,state);
      const hud=panel.querySelector('.battle-slot-hud');
      return {count:hud.querySelectorAll('.bsh-boss-drop-entry').length,
        selectorAbsent:!hud.querySelector('.bsh-boss-catalog-select'),
        outerScroll:hud.scrollHeight>hud.clientHeight+1};
    })()`);
    if (process.env.BOSS_HUD_CAPTURE === '1') {
      win.setContentSize(835, 481);
      win.setContentSize(834, 481);
      win.webContents.invalidate();
      await new Promise(resolve => setTimeout(resolve, 120));
      fs.writeFileSync(path.join(scratch, 'boss-hud-834x481-todos-bosses.png'), (await win.webContents.capturePage()).toPNG());
    }
    assert.equal(multiBoss.count,6);
    assert.equal(multiBoss.selectorAbsent,true);
    assert.equal(multiBoss.outerScroll,false);
    const manyItems = await win.webContents.executeJavaScript(`(() => {
      const crowded = {...${JSON.stringify(state)},bossesJogaveis:[{key:'articuno',nome:'Articuno',drops:
        Array.from({length:30},(_,i)=>({itemId:81000+i,nome:'Recompensa '+(i+1)}))}]};
      const panel=document.querySelector('.panel');
      PioBattleHud.update(panel,0,crowded);
      const hud=panel.querySelector('.battle-slot-hud');
      const list=hud.querySelector('.bsh-boss-drop-items');
      list.scrollTop=list.scrollHeight;
      const rail=hud.querySelector('.bsh-boss-drop-tracker');
      return {visible:hud.querySelectorAll('.bsh-boss-drop-entry').length,
        more:hud.querySelector('.bsh-boss-drops-more').textContent,
        scrollHeight:hud.scrollHeight,clientHeight:hud.clientHeight,
        listScrollHeight:list.scrollHeight,listClientHeight:list.clientHeight,listScrollTop:list.scrollTop,
        railHeight:rail.clientHeight,railScrollHeight:rail.scrollHeight,
        listHeight:list.getBoundingClientRect().height,railBottom:rail.getBoundingClientRect().bottom,
        hudBottom:hud.getBoundingClientRect().bottom};
    })()`);
    assert.equal(manyItems.visible,31);
    assert.equal(manyItems.more,'Ver histórico');
    assert.ok(manyItems.scrollHeight<=manyItems.clientHeight+1,`janela Headless permanece fixa: ${JSON.stringify(manyItems)}`);
    assert.ok(manyItems.listScrollHeight>manyItems.listClientHeight,'todos os itens ficam na lista vertical');
    assert.ok(manyItems.listScrollTop>0,'itens finais são acessíveis pela lista');
    await win.webContents.executeJavaScript(`(() => {
      const grid=document.querySelector('#grid');
      grid.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';
      grid.style.gridTemplateRows='repeat(2,minmax(0,1fr))';
      const crowded={...${JSON.stringify(state)},bossesJogaveis:[{key:'articuno',nome:'Articuno',drops:
        Array.from({length:30},(_,i)=>({itemId:81000+i,nome:'Recompensa '+(i+1)}))}]};
      document.querySelectorAll('.panel').forEach((panel,i)=>{
        panel.style.display='grid'; PioBattleHud.update(panel,i,crowded);
      });
    })()`);
    win.setContentSize(820,720);
    for (let attempt=0;attempt<25;attempt++) {
      const size=await win.webContents.executeJavaScript('({width:innerWidth,height:innerHeight})');
      if (size.width===820 && size.height===720) break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const compactCatalog=await win.webContents.executeJavaScript(`[...document.querySelectorAll('.panel')].map(panel=>{
      const hud=panel.querySelector('.battle-slot-hud');
      const rail=hud.querySelector('.bsh-boss-drop-tracker');
      const list=hud.querySelector('.bsh-boss-drop-items');
      return {count:list.querySelectorAll('.bsh-boss-drop-entry').length,outerScroll:hud.scrollHeight>hud.clientHeight+1,
        hudScrollHeight:hud.scrollHeight,hudClientHeight:hud.clientHeight,
        railScrollHeight:rail.scrollHeight,railClientHeight:rail.clientHeight,
        listScrollHeight:list.scrollHeight,listClientHeight:list.clientHeight,
        innerScroll:list.scrollHeight>list.clientHeight,
        railBottom:rail.getBoundingClientRect().bottom,hudBottom:hud.getBoundingClientRect().bottom};
    })`);
    if (process.env.BOSS_HUD_CAPTURE === '1') {
      win.webContents.invalidate();
      await new Promise(resolve => setTimeout(resolve,120));
      fs.writeFileSync(path.join(scratch,'boss-hud-820-todos-itens.png'),(await win.webContents.capturePage()).toPNG());
    }
    for (const m of compactCatalog) {
      assert.equal(m.count,31);
      assert.equal(m.outerScroll,false,JSON.stringify(m));
      assert.equal(m.innerScroll,true);
      assert.ok(m.railBottom<=m.hudBottom+2);
    }
    const fullBossCatalog = await win.webContents.executeJavaScript(`(() => {
      const panel=document.querySelector('.panel');
      PioBattleHud.update(panel,0,{...${JSON.stringify(state)},bossLive:{inArena:false},
        bossesCatalogo:[
          {key:'articuno',drops:['Nome resumido que não substitui a ficha']},
          {key:'locked',nome:'Boss bloqueado',drops:['TM Disk Piece']}
        ]});
      const hud=panel.querySelector('.battle-slot-hud');
      return {names:[...hud.querySelectorAll('.bsh-boss-drop-name')].map(el=>el.textContent),
        tmSprite:[...hud.querySelectorAll('.bsh-boss-drop-entry')]
          .find(el=>el.querySelector('.bsh-boss-drop-name')?.textContent==='TM Disk Piece')
          ?.querySelector('img')?.getAttribute('src')};
    })()`);
    assert.ok(fullBossCatalog.names.includes('TM Disk Piece'));
    assert.ok(!fullBossCatalog.names.includes('Nome resumido que não substitui a ficha'));
    assert.match(fullBossCatalog.tmSprite,/59194\.png$/);
    const pairedFamilies = await win.webContents.executeJavaScript(`(() => {
      const panel=document.querySelector('.panel');
      PioBattleHud.update(panel,0,{...${JSON.stringify(state)},bossesJogaveis:[{key:'boss',nome:'Boss',drops:[
        {itemId:70095,nome:'Safari Ticket'}, {itemId:70014,nome:'Mega Stone Fragment'},
        {itemId:59200,nome:'Normal-Type TM Disk'}, {itemId:70090,nome:'Mystic Ticket'},
        {itemId:59194,nome:'TM Disk Piece'}, {itemId:40530,nome:'AoE TM Disk Piece'},
        {itemId:70015,nome:'Mega Shiny Stone Fragment'}]}]});
      return [...panel.querySelectorAll('.bsh-boss-drop-group')].map(group=>({
        family:group.dataset.family,
        names:[...group.querySelectorAll('.bsh-boss-drop-name')].map(el=>el.textContent)
      }));
    })()`);
    assert.deepEqual(pairedFamilies.map(group=>[group.family,group.names.length]),
      [['tm',3],['ticket',2],['stone',2]]);
    assert.ok(pairedFamilies[0].names.every(name=>/TM|Disk/.test(name)));
    assert.ok(pairedFamilies[1].names.every(name=>/Ticket/.test(name)));
    assert.ok(pairedFamilies[2].names.every(name=>/Stone/.test(name)));
    if (process.env.BOSS_HUD_CAPTURE === '1') {
      await win.webContents.executeJavaScript(`(() => {
        document.querySelector('#grid').style.gridTemplateColumns='1fr';
        document.querySelector('#grid').style.gridTemplateRows='1fr';
        document.querySelectorAll('.panel').forEach((panel,i)=>panel.style.display=i?'none':'grid');
      })()`);
      win.setContentSize(834,481);
      await new Promise(resolve=>setTimeout(resolve,160));
      fs.writeFileSync(path.join(scratch,'boss-hud-834x481-paired-items.png'),
        (await win.webContents.capturePage()).toPNG());
    }
    console.log('PASS: boss live e drops rastreados renderizados nas quatro contas');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    win.destroy();
    app.exit(process.exitCode || 0);
  }
}).catch(error => { console.error(error); process.exit(1); });
