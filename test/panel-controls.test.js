// Integration check in Electron with blank guests, fake accounts and an isolated profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, session, webContents } = require('electron');
const { coalesceScriptLoading } = require('../src/main/guest-runtime');

const root = path.resolve(__dirname, '..');
const guestUrl = pathToFileURL(path.join(__dirname, 'fixtures', 'panel.html')).href;
const output = path.join(root, 'scratch', 'panel-controls-' + Date.now());
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
app.commandLine.appendSwitch('log-level', '3');
const errors = [];
const listenerWarnings = [];
process.on('warning', warning => { if (warning.name === 'MaxListenersExceededWarning') listenerWarnings.push(warning); });
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') coalesceScriptLoading(contents);
});
const fakeAccounts = Array.from({ length: 4 }, (_, i) => ({ name: 'Conta ' + (i + 1), email: 'test' + i, senha: 'test' }));
ipcMain.on('app:version', event => { event.returnValue = 'test'; });
ipcMain.handle('creds:load', () => fakeAccounts);
ipcMain.handle('creds:save', () => true);
ipcMain.handle('errlog:write', (_event, origin, message) => errors.push(origin + ': ' + message));
for (const name of ['awake:set', 'mintray:set', 'notify', 'backup:save', 'proxy:apply', 'auth:cancel-login']) ipcMain.handle(name, () => true);
ipcMain.handle('autostart:get', () => ({ on: false, suportado: false }));
ipcMain.handle('window:control', () => ({ maximized: false }));
ipcMain.handle('auth:camoufox-check', () => ({ available: false }));
ipcMain.handle('auth:camoufox-login', () => ({ success: false }));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
const read = code => win.webContents.executeJavaScript(code);
const guest = (i, code) => read('webviews[' + i + '].executeJavaScript(' + JSON.stringify(code) + ')');
async function chooseHud(mode) {
  await read('document.querySelector("#leafGameHudLayout").value=' + JSON.stringify(mode) + ';document.querySelector("#leafGameHudLayout").dispatchEvent(new Event("change"))');
  for (let i = 0; i < 30; i++) {
    if (await read('!document.querySelector("#leafGameHudLayout").disabled')) return;
    await pause(20);
  }
  throw new Error('HUD selection did not complete');
}
async function settle() { await read('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'); }
async function ready() {
  for (let i = 0; i < 80; i++) {
    if (await read('webviews.length === 4 && !!document.getElementById("leafShell") && webviews.every(w => { try { return w.getURL() === ' + JSON.stringify(guestUrl) + '; } catch { return false; } })')) return;
    await pause(100);
  }
  throw new Error('Launcher did not initialize: ' + errors.join('\n'));
}
async function rectangles() {
  await settle();
  return read('[...grid.children].map(p => { const r=p.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; })');
}
async function checkLayout(n, selected) {
  await read(`setCount(${n});updateFeatureRatio(68);toggleFeature(${selected})`);
  const rects = await rectangles();
  assert.equal(rects.length, n);
  const main = rects[selected], rest = rects.filter((_, i) => i !== selected);
  assert.ok(main.width > rest[0].width, 'highlighted account is wider: ' + JSON.stringify({n,selected,rects,state:await read('({featuredIndex,featureRatio,classes:grid.className,columns:getComputedStyle(grid).gridTemplateColumns})')}));
  assert.ok(rest.every(r => r.x > main.right && r.width > 0 && r.height > 0), 'remaining accounts stay visible on the right');
  for (let i = 1; i < rest.length; i++) assert.ok(rest[i].y >= rest[i - 1].bottom, 'secondary accounts do not overlap');
  assert.equal(await read('featureSplit.classList.contains("show")'), true);
  assert.equal(await read('document.querySelectorAll(".feature[aria-pressed=true]").length'), 1);
  await read(`toggleFeature(${selected})`);
}

app.whenReady().then(async () => {
  const denyNetwork = ses => ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  denyNetwork(session.defaultSession);
  for (let i = 1; i <= 4; i++) denyNetwork(session.fromPartition('persist:conta' + i));
  win = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: { offscreen: true, webviewTag: true, preload: path.join(root, 'preload.js'), backgroundThrottling: false } });
  win.webContents.on('will-attach-webview', (_event, _preferences, params) => { params.src = guestUrl; });
  await win.loadFile(path.join(root, 'index.html'));
  await ready();
  assert.equal(await read('gameHudLayout'), 'original', 'new HUD layouts are opt-in');
  assert.equal(await read('cleanOn'), false, 'fresh profiles keep the native HUD');
  assert.equal(await read('document.querySelector("#leafSettingsDrawer #leafGameHudLayout").value'), 'original');
  assert.equal(await read('!!document.querySelector(".leaf-topbar #leafGameHudLayout")'), false);
  assert.equal(await guest(0, '!!window.__rebosteioHudLayout'), false, 'disabled layout installs no guest observer');
  const ids = await read('webviews.map(w => w.getWebContentsId())');
  const expandedMainWidth = await read('document.querySelector("#leafMain").getBoundingClientRect().width');
  assert.equal(await read('document.querySelector("#leafSidebarToggle").getAttribute("aria-expanded")'), 'true', 'sidebar stays expanded by default');
  await read('document.querySelector("#leafSidebarToggle").click()'); await settle();
  assert.ok(await read('document.querySelector("#leafMain").getBoundingClientRect().width') > expandedMainWidth + 150, 'collapsing actually gives the sidebar area to the game');
  assert.equal(await read('getComputedStyle(document.querySelector("#leafSidebar")).display'), 'none');
  await read('document.querySelector("#leafSidebarToggle").click()'); await settle();
  assert.equal(await read('document.querySelector("#leafMain").getBoundingClientRect().width'), expandedMainWidth, 'topbar restores the original sidebar size');
  assert.deepEqual(await read('webviews.map(w => w.getWebContentsId())'), ids, 'sidebar changes preserve all game sessions');
  await checkLayout(4, 0);
  await checkLayout(4, 3);
  await read('toggleFeature(0);dragFeature(-1000)');
  assert.equal(await read('featureRatio'), 50);
  await read('dragFeature(10000)');
  assert.equal(await read('featureRatio'), 82);
  await read('featureSplit.ondblclick()');
  assert.equal(await read('featureRatio'), 68);
  await read('featureSplit.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))');
  assert.equal(await read('featureRatio'), 69);

  await read('featureSplit.dispatchEvent(new PointerEvent("pointerdown",{button:0,pointerId:7,clientX:800,bubbles:true}));window.dispatchEvent(new PointerEvent("pointermove",{pointerId:7,clientX:900}));window.dispatchEvent(new PointerEvent("pointercancel",{pointerId:7}))');
  assert.equal(await read('featureDragShield.classList.contains("show")'), false);
  assert.equal(await read('Number(lsGet("featureRatio")) === featureRatio'), true);

  await read('toggleExpand(1)'); await settle();
  assert.equal(await read('featureSplit.classList.contains("show")'), false);
  await read('toggleExpand(1)'); await settle();
  assert.equal(await read('featureSplit.classList.contains("show")'), true);
  await read('layoutMode="col";applyLayout()'); await settle();
  assert.equal(await read('featureSplit.classList.contains("show")'), false);
  await read('toggleFeature(2)'); await settle();
  assert.equal(await read('layoutMode'), 'grid');
  await read('document.querySelector("[data-view=list]").click()'); await settle();
  assert.equal(await read('featureSplit.classList.contains("show")'), false);
  await read('document.querySelector("[data-view=windows]").click()'); await settle();
  assert.equal(await read('featureSplit.classList.contains("show")'), true);
  await read('cardsOn=true;applyCards()'); await settle();
  assert.equal(await read('featureSplit.classList.contains("show")'), false);

  // A coluna "Melhor catch": Potencia, IV, Qualidade e Nota numa linha so, sem quebrar a tabela.
  const melhorCatch = async (...capturas) => {
    // Sem `force`: com ele o refreshCards rele o painel e sobrescreveria o stCache sintetico.
    await read('(async()=>{stCache[0]={t:Date.now(),d:{ok:true,live:true,name:"Conta",a:{},team:[],catchLog:'
      + JSON.stringify(capturas) + '}};cdHtmlAnt="";await refreshCards();})()');
    await settle();
    return read('(document.querySelector("#cards td.cd-best")||{}).textContent||""');
  };
  const completo = await melhorCatch({ n: 'Annihilape', sid: 979, iv: 94, q: 1.52, sh: false, pot: 3, nt: 3.14, t: Date.now() });
  assert.match(completo, /Annihilape/, 'o nome do pokemon continua na celula');
  assert.match(completo, /P3/, 'mostra a potencia');
  assert.match(completo, /94\/192/, 'mostra o IV');
  assert.match(completo, /×1\.52/, 'mostra a qualidade');
  assert.match(completo, /N3,1/, 'mostra a nota com virgula, como o jogo escreve');
  assert.equal(await read('getComputedStyle(document.querySelector("#cards td.cd-best")).whiteSpace'), 'nowrap',
    'a celula nao quebra linha');
  assert.equal(await read('document.querySelectorAll("#cards td.cd-best .cd-ivs-pills").length'), 0,
    'os pills de IV sairam da celula (ficaram no title)');
  const semPot = await melhorCatch({ n: 'Annihilape', sid: 979, iv: 94, q: 1.52, sh: false, t: Date.now() });
  assert.match(semPot, /94\/192/, 'sem potencia, IV e qualidade continuam');
  assert.doesNotMatch(semPot, /N\d/, 'sem potencia nao inventa nota');
  assert.doesNotMatch(semPot, /P\d/, 'sem potencia nao inventa o selo P');

  // O filtro "Melhor catch:" — a Nota entrou na lista e e o padrao.
  assert.deepEqual(
    await read('[...document.querySelectorAll("#cdBestCrit option")].map(o=>o.value)'),
    ['nota', 'ivq', 'iv', 'q'], 'o filtro oferece a Nota, em primeiro');
  assert.equal(await read('bestCrit'), 'nota', 'a Nota e o criterio padrao');

  // Um P5 de IV baixo nasce mais forte que um IV alto comum: so a Nota sabe disso, porque e a
  // unica que enxerga a potencia. O criterio precisa mudar a captura escolhida, nao so a ordem.
  const fraco = { n: 'Primeape', sid: 57, iv: 170, q: 1.5, sh: false, pot: 1, nt: 4.2, t: Date.now() };
  const forte = { n: 'Annihilape', sid: 979, iv: 90, q: 1.2, sh: false, pot: 5, nt: 6.8, t: Date.now() };
  assert.match(await melhorCatch(fraco, forte), /Annihilape/, 'por Nota, o P5 e o melhor catch');
  await read('bestCrit="ivq";lsSet("bestCrit",bestCrit)');
  assert.match(await melhorCatch(fraco, forte), /Primeape/, 'por IV × qualidade, o IV alto volta a ganhar');

  // Captura sem nota nao pode sumir do ranking por causa do criterio novo.
  await read('bestCrit="nota";lsSet("bestCrit",bestCrit)');
  const semNota = { n: 'Primeape', sid: 57, iv: 180, q: 1.7, sh: false, t: Date.now() };
  const comNota = { n: 'Annihilape', sid: 979, iv: 20, q: 0.9, sh: false, pot: 1, nt: 0.4, t: Date.now() };
  assert.match(await melhorCatch(semNota, comNota), /Primeape/,
    'sem nota ainda, a captura concorre por IV × qualidade em vez de ser tratada como a pior');

  await read('stCache.length=0;cdHtmlAnt=""');
  await read('cardsOn=false;applyCards();toggleFeature(2)');
  assert.deepEqual(await read('webviews.map(w => w.getWebContentsId())'), ids, 'feature, list, simple and expansion preserve all guests');
  await checkLayout(3, 2);
  await checkLayout(2, 1);
  await read('setCount(1)'); await settle();
  assert.equal(await read('featuredIndex'), -1);
  assert.equal(await read('grid.querySelector(".feature").disabled'), true);
  assert.equal(await read('zoomers.length'), 1);
  await read('setCount(4)'); await ready();
  await pause(200);

  // The optional layout must preserve real buttons/actions and restore native presentation.
  const hudIds = await read('webviews.map(w => w.getWebContentsId())');
  const menuFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'game-menu.html'), 'utf8');
  const nativeDock = 'document.body.insertAdjacentHTML("beforeend",' + JSON.stringify(menuFixture) + ');' + `
    document.querySelectorAll('nav.menu-topo button').forEach(button=>{const img=document.createElement('img');img.alt='';img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="white"/><path d="M2 10h16" stroke="purple"/></svg>');button.prepend(img)});
    document.querySelector('nav.menu-topo').addEventListener('click',e=>{const b=e.target.closest('button');if(b){window.hudClicks=(window.hudClicks||0)+1;window.hudModal=b.dataset.modal}});
    window.hudState={automation:true,economy:true,balls:123};`;
  for (let i = 0; i < 4; i++) await guest(i, nativeDock);
  const originalDock = await guest(0, 'document.querySelector("nav.menu-topo").outerHTML');
  const originalHeight = await guest(0, 'document.querySelector("nav.menu-topo").getBoundingClientRect().height');
  await read('dockHidden=true;applyDock()');
  await pause(20);
  assert.equal(await guest(0, 'getComputedStyle(document.querySelector("nav.menu-topo")).display'), 'none');
  assert.match(await read('document.querySelector("#leafGameHudHint").textContent'), /Menu oculto/);
  await chooseHud('icons');
  assert.equal(await read('dockHidden'), false, 'selecting a compact layout reveals its menu immediately');
  assert.equal(await read('lsGet("dockHidden")'), '0');
  assert.equal(await guest(0, 'getComputedStyle(document.querySelector("nav.menu-topo")).display'), 'flex');
  for (let i = 0; i < 4; i++) assert.equal(await guest(i, 'document.querySelector("nav.menu-topo").dataset.rbHud'), 'icons');
  assert.ok(await guest(0, 'document.querySelector("nav.menu-topo").getBoundingClientRect().height') < originalHeight, 'compact dock uses less height');
  assert.equal(await guest(0, 'document.querySelector("nav.menu-topo button").getBoundingClientRect().height'), 32, 'current game buttons shrink from 62px to 32px');
  assert.equal(await guest(0, 'getComputedStyle(document.querySelector("nav.menu-topo img")).display'), 'block', 'original game icons remain visible');
  assert.equal(await guest(0, 'getComputedStyle(document.querySelector("nav.menu-topo [data-i18n]")).display'), 'none', 'icon mode hides only labels');
  assert.equal(await guest(0, 'document.querySelector("nav.menu-topo button").getAttribute("aria-label")'), 'Pokédex');
  assert.equal(await guest(0, 'document.querySelectorAll("nav.menu-topo button")[1].title'), 'Abrir mapa', 'native tooltip survives');
  await guest(0, 'document.querySelector("nav.menu-topo button").click()');
  assert.equal(await guest(0, 'window.hudClicks'), 1, 'the original button still executes its handler');
  assert.equal(await guest(0, 'window.hudModal'), 'pokedex', 'the native modal route is preserved');
  assert.deepEqual(await guest(0, 'window.hudState'), {automation:true,economy:true,balls:123});
  assert.equal(await guest(0, 'document.getElementById("hud-team").textContent'), 'HP 82/100');
  const originalMenuActions = await guest(0, 'Array.from(document.querySelectorAll("nav.menu-topo button[data-modal]"),b=>b.dataset.modal)');
  await guest(0, 'window.nativeMenuButtons=Array.from(document.querySelectorAll("nav.menu-topo button[data-modal]"))');
  const menuTestBounds = win.getBounds();
  win.setSize(2160, 1000); await settle(); // About 950px per account at 100%, matching the reported layout.
  await chooseHud('labels');
  assert.equal(await guest(0, 'document.querySelector("nav.menu-topo").dataset.rbHud'), 'labels');
  assert.notEqual(await guest(0, 'getComputedStyle(document.querySelector("nav.menu-topo [data-i18n]")).display'), 'none', 'label mode shows native translated labels');
  assert.equal(await guest(0, 'document.querySelectorAll("#rb-hud-layout").length'), 1);
  const secondaryActions = ['ranking', 'pvp', 'ginasios', 'campeonato', 'casa'];
  assert.deepEqual(await guest(0, 'Array.from(document.querySelectorAll("#rb-hud-more-menu button"),b=>b.dataset.modal)'), secondaryActions, 'only the five requested actions move into More');
  assert.deepEqual(await guest(0, 'Array.from(document.querySelectorAll("nav.menu-topo > button[data-modal]"),b=>b.dataset.modal)'), originalMenuActions.filter(action => !secondaryActions.includes(action)));
  assert.equal(await guest(0, 'new Set(Array.from(document.querySelectorAll("nav.menu-topo > button"),b=>b.getBoundingClientRect().y)).size'), 1, 'the reduced label bar stays on one row at the reported account width');
  assert.equal(await guest(0, 'window.nativeMenuButtons.every(b=>document.querySelector("nav.menu-topo").contains(b))'), true, 'original buttons remain in the delegated dock');
  await guest(0, 'document.querySelector("[data-rb-hud-more]").click()'); await pause(30);
  assert.equal(await guest(0, 'window.hudClicks'), 1, 'opening More never asks the game to open an undefined modal');
  assert.equal(await guest(0, 'document.querySelector("#rb-hud-more-menu").matches(":popover-open")'), true);
  assert.equal(await guest(0, 'document.querySelector("[data-rb-hud-more]").getAttribute("aria-expanded")'), 'true');
  assert.equal(await guest(0, '(()=>{const r=document.querySelector("#rb-hud-more-menu").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()'), true, 'More fits inside the account viewport');
  await webContents.fromId(hudIds[0]).capturePage().then(image => fs.writeFileSync(path.join(output, 'hud-more.png'), image.toPNG()));
  webContents.fromId(hudIds[0]).sendInputEvent({type:'keyDown',keyCode:'Escape'}); await pause(40);
  assert.equal(await guest(0, 'document.querySelector("#rb-hud-more-menu").matches(":popover-open")'), false, 'Escape closes the popup');
  for (const action of secondaryActions) {
    await guest(0, 'document.querySelector("[data-rb-hud-more]").click();document.querySelector("#rb-hud-more-menu [data-modal=' + action + ']").click()');
    assert.equal(await guest(0, 'window.hudModal'), action, 'More invokes the native action: ' + action);
    assert.equal(await guest(0, 'document.querySelector("#rb-hud-more-menu").matches(":popover-open")'), false);
  }
  assert.equal(await guest(0, 'window.hudClicks'), 6, 'every More action fires once');
  win.setBounds(menuTestBounds); await settle();
  await guest(0, 'document.querySelector("[data-rb-hud-more]").click()');
  await guest(0, 'document.documentElement.classList.add("modo-imersivo");const s=document.createElement("style");s.id="test-clean";s.textContent="nav.menu-topo{display:none!important}";document.head.appendChild(s)');
  assert.equal(await guest(0, 'getComputedStyle(document.querySelector("nav.menu-topo")).display'), 'none', 'existing clean HUD remains authoritative');
  assert.equal(await guest(0, 'document.querySelector("#rb-hud-more-menu").matches(":popover-open")'), false, 'clean HUD closes the popup');
  await guest(0, 'document.documentElement.classList.remove("modo-imersivo");document.getElementById("test-clean").remove()');
  await read('dockHidden=true;applyDock()');
  assert.equal(await guest(0, 'getComputedStyle(document.querySelector("nav.menu-topo")).display'), 'none', 'hidden native menu stays hidden');
  await read('dockHidden=false;applyDock()');
  await chooseHud('original');
  assert.equal((await guest(0, 'document.querySelector("nav.menu-topo").outerHTML')).replace(/ style=""/g, ''), originalDock.replace(/ style=""/g, ''));
  assert.equal(await guest(0, '!!window.__rebosteioHudLayout || !!document.getElementById("rb-hud-layout")'), false, 'turning off releases styles and observer');
  assert.equal(await guest(0, 'document.querySelector("#rb-hud-more-menu, [data-rb-hud-more]")'), null, 'Original removes the More UI');
  assert.deepEqual(await guest(0, 'Array.from(document.querySelectorAll("nav.menu-topo > button[data-modal]"),b=>b.dataset.modal)'), originalMenuActions, 'Original restores every action in its exact order');
  assert.deepEqual(await read('webviews.map(w => w.getWebContentsId())'), hudIds, 'optional layouts preserve guest sessions');
  for (const mode of ['icons', 'labels', 'original', 'icons']) {
    await chooseHud(mode);
    for (let i = 0; i < 4; i++) {
      assert.equal(await guest(i, 'document.querySelector("nav.menu-topo").getAttribute("data-rb-hud")'), mode === 'original' ? null : mode, 'select changes every open guest immediately');
      assert.equal(await guest(i, '!!document.querySelector("[data-rb-hud-more]")'), mode === 'labels', 'More exists only in the existing label mode');
    }
  }
  // Compact menus must not flatten the game's automation/chat controls or cover the stage.
  const railFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'game-rail.html'), 'utf8');
  await read('webviews[0].setZoomFactor(0.5)');
  await guest(0, 'document.body.insertAdjacentHTML("beforeend",' + JSON.stringify(railFixture) + ');' + `
    const app=document.querySelector('#test-rail-app'),main=document.querySelector('#test-game-main');
    app.insertBefore(main,app.lastElementChild);
    main.insertAdjacentHTML('beforeend','<div class="palco-moldura">Área de batalha</div>');
    document.documentElement.classList.add('dir-min');
    const nav=document.querySelector('nav.menu-topo');
    new ResizeObserver(()=>document.documentElement.style.setProperty('--menu-alt',nav.getBoundingClientRect().height+'px')).observe(nav);
    document.querySelectorAll('#btn-auto-toggle,#btn-chat-toggle').forEach(b=>b.addEventListener('click',()=>{window.railClicks=(window.railClicks||0)+1}));`);
  for (const mode of ['icons', 'labels']) {
    await chooseHud(mode); await pause(50);
    const geometry = await guest(0, `(()=>{
      const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
      return {auto:rect('#p-auto'),chat:rect('#p-chat'),icon:rect('#btn-auto-toggle svg'),badge:rect('#auto-cnt-rail'),stage:rect('.palco-moldura')};
    })()`);
    assert.equal(geometry.auto.height, 44); assert.equal(geometry.chat.height, 44);
    assert.equal(geometry.auto.y, geometry.chat.y, 'collapsed controls share a readable horizontal row');
    assert.ok(geometry.chat.x >= geometry.auto.right + 10);
    assert.ok(geometry.badge.y >= geometry.icon.bottom, 'badge does not cover the automation icon');
    assert.ok(Math.max(geometry.auto.bottom, geometry.chat.bottom) + 6 <= geometry.stage.y, 'rail and its shadow stay above the battle area');
  }
  await guest(0, 'document.querySelector("#btn-auto-toggle").click();document.querySelector("#btn-chat-toggle").click();document.querySelector("#chat-cnt-rail").classList.add("hidden")');
  assert.equal(await guest(0, 'window.railClicks'), 2, 'native controls keep their original handlers');
  assert.equal(await guest(0, 'getComputedStyle(document.querySelector("#chat-cnt-rail")).display'), 'none', 'empty chat badges stay hidden');
  await guest(0, 'document.querySelector("#chat-cnt-rail").classList.remove("hidden")');
  await chooseHud('icons');
  await webContents.fromId(hudIds[0]).capturePage().then(image => fs.writeFileSync(path.join(output, 'hud-rail.png'), image.toPNG()));
  await chooseHud('original');
  assert.equal(await guest(0, 'getComputedStyle(document.querySelector("#test-rail-app .col.dir")).flexDirection'), 'column', 'Original restores the native vertical rail');
  await chooseHud('icons');
  await guest(0, 'document.documentElement.classList.add("mobile")');
  assert.equal(await guest(0, 'getComputedStyle(document.querySelector("#test-rail-app .col.dir")).flexDirection'), 'column', 'mobile layout remains native');
  await guest(0, 'document.documentElement.classList.remove("mobile");document.documentElement.classList.remove("dir-min")');
  assert.equal(await guest(0, 'getComputedStyle(document.querySelector("#test-rail-app .col.dir")).flexDirection'), 'column', 'opening either panel restores native column layout');
  await read('webviews[0].setZoomFactor(1)');
  await read('cleanOn=true;applyClean()');
  await chooseHud('labels');
  assert.equal(await read('cleanOn'), true, 'changing layout never switches off immersive mode');
  assert.equal(await guest(0, 'getComputedStyle(document.querySelector("nav.menu-topo")).display'), 'none');
  assert.match(await read('document.querySelector("#leafGameHudHint").textContent'), /Interface limpa oculta/);
  await read('cleanOn=false;applyClean()');
  await chooseHud('icons');
  await guest(0, 'document.querySelector("nav.menu-topo").insertAdjacentHTML("beforeend","<button>Wiki</button>")');
  assert.equal(await guest(0, 'document.querySelector("nav.menu-topo button:last-child").getAttribute("aria-label")'), 'Wiki', 'new native buttons are compacted');
  await guest(0, 'document.querySelector("#test-menu-container").outerHTML=' + JSON.stringify('<div id="test-menu-container"><nav class="menu-topo"><button data-modal="mapa"><span data-i18n="menu.mapa">Mapa</span></button></nav></div>'));
  assert.equal(await guest(0, 'document.querySelector("nav.menu-topo").dataset.rbHud'), 'icons', 'replacing the SPA menu container reapplies the optional layout');
  await chooseHud('labels');
  assert.equal(await guest(0, '!!document.querySelector("[data-rb-hud-more]")'), false, 'a dock without secondary actions needs no More');
  await guest(0, 'document.querySelector("nav.menu-topo").insertAdjacentHTML("beforeend","<button data-modal=casa><span data-i18n=menu.casa>Casa</span></button>")');
  assert.equal(await guest(0, 'document.querySelector("#rb-hud-more-menu button").dataset.modal'), 'casa', 'late native actions enter More');
  await guest(0, 'document.querySelector("[data-rb-hud-more]").click();document.querySelector("#test-menu-container").outerHTML=' + JSON.stringify('<div id="test-menu-container"><nav class="menu-topo"><button data-modal="ranking"><span data-i18n="menu.ranking">Ranks</span></button></nav></div>'));
  assert.equal(await guest(0, 'document.querySelectorAll("#rb-hud-more-menu").length'), 1, 'SPA replacement releases the old popup');
  assert.equal(await guest(0, 'document.querySelector("#rb-hud-more-menu button").dataset.modal'), 'ranking');
  await guest(0, 'document.querySelector("nav.menu-topo").innerHTML=' + JSON.stringify('<button data-modal="ginasios"><span data-i18n="menu.ginasios">Ginásio</span></button>'));
  assert.equal(await guest(0, 'document.querySelectorAll("#rb-hud-more-menu").length'), 1, 'rebuilding dock children also restores More');
  assert.equal(await guest(0, 'document.querySelector("#rb-hud-more-menu button").dataset.modal'), 'ginasios');
  await guest(0, 'document.querySelector("#rb-hud-more-menu button").remove()');
  assert.equal(await guest(0, '!!document.querySelector("[data-rb-hud-more]")'), false, 'removed native actions leave no empty popup or retained buttons');
  await chooseHud('icons');

  await read('zoomTodos("reset")');
  win.webContents.send('hotkey', 'zoomIn'); await pause(100);
  assert.deepEqual(await read('webviews.map(w => w.getZoomFactor())'), [1.1, 1.1, 1.1, 1.1]);
  await read('grid.children[1].querySelector(".zi").click()');
  assert.equal(await read('webviews[1].getZoomFactor()'), 1.2);
  await read('zoomTodos("in")');
  assert.deepEqual(await read('webviews.map(w => w.getZoomFactor())'), [1.2, 1.3, 1.2, 1.2]);
  win.webContents.send('hotkey', 'zoomOut'); await pause(100);
  assert.equal(await read('webviews[1].getZoomFactor()'), 1.2);
  win.webContents.send('hotkey', 'zoomReset'); await pause(100);
  assert.deepEqual(await read('webviews.map(w => w.getZoomFactor())'), [1, 1, 1, 1]);
  await read('window.dispatchEvent(new WheelEvent("wheel",{ctrlKey:true,deltaY:-100,cancelable:true}))');
  assert.equal(await read('webviews[0].getZoomFactor()'), 1.1);
  const guestWheel = "dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:100,cancelable:true}))";
  await read('webviews[0].executeJavaScript(' + JSON.stringify(guestWheel) + ')'); await pause(100);
  assert.equal(await read('webviews[0].getZoomFactor()'), 1);
  await read('off[3]=true;zoomTodos("in")');
  assert.equal(await read('webviews[3].getZoomFactor()'), 1, 'disabled accounts do not receive global zoom');
  await read('off[3]=false;for(let i=0;i<30;i++)zoomTodos("in")');
  assert.deepEqual(await read('webviews.map(w => w.getZoomFactor())'), [2, 2, 2, 2]);
  await read('for(let i=0;i<30;i++)zoomTodos("out")');
  assert.deepEqual(await read('webviews.map(w => w.getZoomFactor())'), [0.5, 0.5, 0.5, 0.5]);
  await read('zoomTodos("reset");grid.children[1].querySelector(".zi").click();toggleFeature(0)'); await settle();
  await pause(250);
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }).then(image => fs.writeFileSync(path.join(output, 'panels.png'), image.toPNG()));
  const sidebarGuestIds = await read('webviews.map(w => w.getWebContentsId())');
  await read('document.querySelector("#leafSidebarToggle").click()'); await settle();
  assert.equal(await read('featureSplit.classList.contains("show")'), true, 'featured panel keeps its divider when sidebar collapses');
  const splitOffset = await read('Math.abs(featureSplit.getBoundingClientRect().left + 6 - (grid.children[0].getBoundingClientRect().right + parseFloat(getComputedStyle(grid).columnGap) / 2))');
  assert.ok(splitOffset < 2, 'featured divider follows the wider game area');
  assert.deepEqual(await read('webviews.map(w => w.getWebContentsId())'), sidebarGuestIds);
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }).then(image => fs.writeFileSync(path.join(output, 'sidebar-collapsed.png'), image.toPNG()));
  await win.loadFile(path.join(root, 'index.html')); await ready(); await settle();
  assert.equal(await read('document.querySelector("#leafSidebarToggle").getAttribute("aria-expanded")'), 'false', 'collapsed sidebar survives reopening');
  assert.equal(await read('getComputedStyle(document.querySelector("#leafSidebar")).display'), 'none');
  await read('document.querySelector("#leafSidebarToggle").click()'); await settle();
  assert.equal(await read('featuredIndex'), 0, 'panel zero restores correctly');
  assert.equal(await read('webviews[1].getZoomFactor()'), 1.1, 'individual zoom survives reopening');
  assert.equal(await read('featureSplit.classList.contains("show")'), true);
  assert.equal(await read('gameHudLayout'), 'icons', 'opt-in choice survives reopening');
  assert.equal(await read('document.querySelector("#leafGameHudLayout").value'), 'icons');
  // Reloaded guest creates its dock later, as the game does after login.
  await guest(0, nativeDock);
  assert.equal(await guest(0, 'document.querySelector("nav.menu-topo").dataset.rbHud'), 'icons');
  await pause(100);
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }).then(image => fs.writeFileSync(path.join(output, 'hud-compact.png'), image.toPNG()));
  await read('setGameHudLayout("invalid")');
  assert.equal(await read('gameHudLayout'), 'original', 'unknown saved layout falls back to Original');
  assert.equal(await read('document.querySelector("#leafGameHudLayout").value'), 'original', 'Settings reflects the actual applied layout');
  assert.equal(await guest(0, '!!window.__rebosteioHudLayout'), false);
  await read('document.querySelector("#leafSettingsBtn").click();document.querySelector("#leafGameHudLayout").scrollIntoView({block:"center"})');
  await pause(400); // Let the settings drawer finish its slide-in transition.
  await settle();
  assert.equal(await read('document.body.classList.contains("leaf-settings-open") && document.querySelector("#leafGameHudLayout").getBoundingClientRect().right <= innerWidth'), true, 'HUD option is accessible in Settings');
  assert.equal(await read('document.querySelector("#leafGameHudLayout").getBoundingClientRect().height'), 31, 'HUD selector follows the compact settings field height');
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }).then(image => fs.writeFileSync(path.join(output, 'settings.png'), image.toPNG()));
  await require('./center-scheduler-checks')({ guest, read, pause, output, guestUrl });
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(listenerWarnings.length, 0, 'loading scripts never exceed the listener limit');
  console.log('PASS: layouts with 1–4 accounts, resizing, visibility, preserved sessions, zoom, optional HUD defaults/actions/restoration and persistence.');
  console.log('Preview: ' + path.join(output, 'panels.png'));
  console.log('Settings: ' + path.join(output, 'settings.png'));
  app.exit(0);
}).catch(error => { console.error(error.stack); console.error(errors.join('\n')); app.exit(1); });
setTimeout(() => { console.error('Integration test timed out'); app.exit(1); }, 60000);
