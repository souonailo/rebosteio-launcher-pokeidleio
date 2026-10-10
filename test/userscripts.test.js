// Fase 1 das extensoes: o modal #scOverlay voltou a existir, a shell o alcanca e o motor
// de userscripts (guarda de login, dedupe, teto de 4 MB) continua correto.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, session } = require('electron');
const { coalesceScriptLoading } = require('../src/main/guest-runtime');

const root = path.resolve(__dirname, '..');
const guestUrl = pathToFileURL(path.join(__dirname, 'fixtures', 'panel.html')).href;
const output = path.join(root, 'scratch', 'userscripts-' + Date.now());
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
app.commandLine.appendSwitch('log-level', '3');

const errors = [];
let xhrCalls = [];
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') coalesceScriptLoading(contents);
});

const fakeAccounts = Array.from({ length: 4 }, (_, i) => ({ name: 'Conta ' + (i + 1), email: 'test' + i, senha: 'test' }));
ipcMain.on('app:version', event => { event.returnValue = 'test'; });
ipcMain.handle('creds:load', () => fakeAccounts);
ipcMain.handle('creds:save', () => true);
ipcMain.handle('errlog:write', (_event, origin, message) => errors.push(origin + ': ' + message));
for (const name of ['awake:set', 'mintray:set', 'notify', 'backup:save', 'proxy:apply', 'auth:cancel-login', 'twitch:creds:save']) ipcMain.handle(name, () => true);
ipcMain.handle('preset:read', () => '');
// main.js nao roda neste teste: o canal de GM_xmlhttpRequest e mockado aqui para exercitar a
// ida e volta inteira (painel -> renderer -> IPC -> renderer -> painel) sem tocar a rede.
ipcMain.handle('userscript:request', (_event, url) => { xhrCalls.push(url); return { ok: true, status: 200, url, code: '{"a":1}' }; });
ipcMain.handle('twitch:creds:load', () => ({ masterEnabled: false, accounts: [] }));
ipcMain.handle('twitch:status:get', () => ({ masterEnabled: false, liveChannels: [], accounts: [] }));
ipcMain.handle('autostart:get', () => ({ on: false, suportado: false }));
ipcMain.handle('window:control', () => ({ maximized: false }));
ipcMain.handle('auth:camoufox-check', () => ({ available: false }));
ipcMain.handle('auth:camoufox-login', () => ({ success: false }));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
const read = async code => {
  try { return await win.webContents.executeJavaScript(code); }
  catch (e) { console.error('READ FALHOU: ' + String(code).slice(0, 240) + '\n  -> ' + e.message); throw e; }
};
const guest = (i, code) => read('webviews[' + i + '].executeJavaScript(' + JSON.stringify(code) + ')');
async function ready() {
  for (let i = 0; i < 80; i++) {
    if (await read('webviews.length === 4 && !!document.getElementById("leafShell")')) return;
    await pause(100);
  }
  throw new Error('Launcher did not initialize: ' + errors.join('\n'));
}
async function until(fn, tries = 60, gap = 50) {
  for (let i = 0; i < tries; i++) { if (await fn()) return; await pause(gap); }
  throw new Error('condition never became true');
}

app.whenReady().then(async () => {
  const denyNetwork = ses => ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  denyNetwork(session.defaultSession);
  for (let i = 1; i <= 4; i++) denyNetwork(session.fromPartition('persist:conta' + i));

  win = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: { offscreen: true, webviewTag: true, preload: path.join(root, 'preload.js'), backgroundThrottling: false } });
  win.webContents.on('will-attach-webview', (_event, _preferences, params) => { params.src = guestUrl; });
  await win.loadFile(path.join(root, 'index.html'));
  await ready();
  await pause(200); // applyLang roda depois do build da shell

  // 1. O markup existe e a shell nova alcanca o botao legado.
  assert.equal(await read('!!document.getElementById("scOverlay")'), true, 'markup do modal presente');
  assert.equal(await read('!!document.getElementById("scModal") && !!document.getElementById("scList")'), true, 'interior do modal presente');
  assert.equal(await read('!!document.querySelector("#leafToolsMenu [data-old=\'scriptsBtn\']")'), true, 'entrada no menu Ferramentas');

  // 2. Caminho real do usuario: item da shell -> clickOld -> modal abre e lista os presets.
  await read('document.querySelector("#leafToolsMenu [data-old=\'scriptsBtn\']").click()');
  assert.equal(await read('document.getElementById("scOverlay").classList.contains("show")'), true, 'o item da shell abre o modal');
  assert.equal(await read('document.body.classList.contains("leaf-tools-open")'), false, 'o menu de ferramentas fecha ao abrir o modal');
  assert.equal(await read('document.querySelectorAll("#scList .sc-row").length'), 1, 'a lista comeca com o preset justpokedex');
  assert.match(await read('document.querySelector("#scList .sc-row").textContent'), /JustP[oó]k[eé]dex/i);
  assert.equal(await read('document.querySelector("#scList .sc-row .sc-tag").textContent'), 'preset · guilherme-se', 'tag do preset');
  assert.equal(await read('!!document.querySelector("#scList .sc-chk input")'), true, 'linha vem com checkbox');
  assert.equal(await read('document.querySelector("#scList .sc-chk input").checked === !!scriptsOn["justpokedex"]'), true, 'checkbox reflete o estado salvo');

  // 3. i18n aplicada ao modal no boot.
  assert.equal(await read('document.getElementById("scAdd").textContent === t("scAddBtn")'), true, 'botao de adicionar no idioma atual');
  assert.equal(await read('document.getElementById("scClose").textContent === t("closeT")'), true, 'botao de fechar no idioma atual');
  assert.equal(await read('document.getElementById("scUrl").placeholder === t("scUrlPh")'), true, 'placeholder do link no idioma atual');
  assert.equal(await read('document.getElementById("scCode").placeholder === t("scCodePh")'), true, 'placeholder do codigo no idioma atual');
  assert.equal(await read('document.getElementById("scModal").querySelector(".hint").innerHTML === t("scHint")'), true, 'texto de aviso no idioma atual');
  assert.match(await read('document.getElementById("scModal").querySelector(".hint").innerHTML'), /<b>/, 'o aviso de confianca mantem o destaque');

  // 4. Esc e clique fora fecham.
  await read('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  assert.equal(await read('document.getElementById("scOverlay").classList.contains("show")'), false, 'Esc fecha o modal');
  await read('document.getElementById("scriptsBtn").click()');
  assert.equal(await read('document.getElementById("scOverlay").classList.contains("show")'), true);
  await read('document.getElementById("scOverlay").click()');
  assert.equal(await read('document.getElementById("scOverlay").classList.contains("show")'), false, 'clique no overlay fecha o modal');

  // 5. Enquanto o modal esta aberto, os atalhos de tecla ficam mudos.
  await read('document.getElementById("scriptsBtn").click()');
  assert.equal(await read('typeof TECLAS_ATALHO'), 'object', 'mapa de atalhos existe');
  const guard = await read(`(() => {
    const antes = document.getElementById('menu').classList.contains('show');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
    return { antes, depois: document.getElementById('menu').classList.contains('show') };
  })()`);
  assert.equal(guard.antes, guard.depois, 'atalho nao dispara com o modal aberto');
  await read('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  assert.equal(await read('document.getElementById("scOverlay").classList.contains("show")'), false);

  // 6. Regra de seguranca: nenhum userscript em rota de senha e fora dos dominios do jogo.
  const tabela = [
    ['https://pokeidle.io/login', true],
    ['https://pokeidle.io/login?next=/app', true],
    ['https://pokeidle.io/login/painel', true],
    ['https://pokeidle.io/register', true],
    ['https://pokeidle.io/forgot-password', true],
    ['https://pokeidle.io/verify-email', true],
    ['https://poke.idleworld.online/login', true],
    ['https://poke.idleworld.online/register#top', true],
    ['https://pokeidle.io/app', false],
    ['https://pokeidle.io/', false],
    ['https://poke.idleworld.online/app', false],
    ['about:blank', true],
    ['', true],
    ['https://evil.example/app', true],
    ['https://pokeidle.io.evil.tld/app', true]
  ];
  for (const [url, esperado] of tabela) {
    assert.equal(await read('usNoLoginUrl(' + JSON.stringify(url) + ')'), esperado, 'usNoLoginUrl(' + JSON.stringify(url) + ')');
  }

  // 7. injectScripts recusa painel que nao esta no jogo (fixture e file://) e marca para reinjectar depois.
  await read('delete webviews[0].__pgSemScripts; injectScripts(webviews[0])');
  await until(() => read('webviews[0].__pgSemScripts === true'));

  // 8. O executor roda o corpo uma unica vez por documento, por id de script.
  await guest(0, 'window.__usRuns = 0');
  await read('runUS(webviews[0], { id: "t-dedupe", name: "Dedupe" }, "window.__usRuns++");');
  await until(() => guest(0, 'window.__usRuns === 1'));
  await read('runUS(webviews[0], { id: "t-dedupe", name: "Dedupe" }, "window.__usRuns++");');
  await pause(300);
  assert.equal(await guest(0, 'window.__usRuns'), 1, 'segunda chamada com o mesmo id nao reexecuta');
  assert.equal(await guest(0, 'window.__pgUS["t-dedupe"]'), 1, 'marcador gravado na pagina do jogo');

  // 9. Instalacao pelo codigo colado: confirm stubado, script salvo, ligado e marcado para injecao.
  await read('window.__confirm = window.confirm; window.__alert = window.alert; window.confirm = () => true; window.alert = () => {}; 1;');
  await read('instalaCodigo("window.__extBody = 1;", "Script de teste")');
  assert.equal(await read('userScripts.length === 1 && userScripts[0].name === "Script de teste"'), true, 'script guardado');
  assert.equal(await read('scriptsOn[userScripts[0].id] === true'), true, 'script instalado ja vem ligado');
  assert.equal(await read('JSON.parse(lsGet("userScripts")).length'), 1, 'persistido no localStorage');
  assert.equal(await read('userScripts[0].id'), await read('JSON.parse(lsGet("userScripts"))[0].id'), 'id persistido bate');
  assert.match(await read('userScripts[0].id'), /^u\d+$/, 'id gerado no formato u<timestamp>');
  // A fixture e file://, entao o motor nao injeta: so marca o painel para reinjectar quando sair do login.
  for (let i = 0; i < 4; i++) assert.equal(await read('webviews[' + i + '].__pgSemScripts'), true, 'painel ' + i + ' marcado, nao injetado');
  assert.equal(await guest(0, 'window.__extBody === 1'), false, 'nada rodou fora do jogo');

  // 10. Teto de 4 MB: recusa sem perder o que ja esta no disco.
  await read('window.__alerts = 0; window.alert = () => { window.__alerts++; }; 1;');
  const recusou = await read('userScripts = [{ id: "u-big", name: "Gigante", code: "a".repeat(5 * 1024 * 1024) }]; saveScripts()');
  assert.equal(recusou, false, 'payload acima do teto e recusado');
  assert.equal(await read('window.__alerts'), 1, 'usuario avisado');
  assert.equal(await read('userScripts.some(s => s.id === "u-big")'), false, 'o script gigante nao entra na memoria');
  assert.equal(await read('userScripts.length'), 1, 'memoria volta ao que esta no disco');
  assert.match(await read('userScripts[0].id'), /^u\d+$/, 'o script anterior continua la');
  assert.equal(await read('JSON.parse(lsGet("userScripts")).some(s => s.id === "u-big")'), false, 'nada do gigante foi gravado');
  assert.equal(await read('JSON.parse(lsGet("userScripts")).length'), 1, 'o que existia no disco segue intacto');
  assert.equal(await read('(()=>{const on=JSON.parse(lsGet("scriptsOn")||"{}");return on[userScripts[0].id]})()'), true, 'chave de ligacao preservada');

  // 11. Historico de hunts sobrevive: o lsPoda destrutivo nao foi acionado.
  await read('localStorage.setItem("huntLog", JSON.stringify(Array.from({length:40},(_,i)=>({id:i,dados:"x".repeat(200)}))))');
  await read('userScripts = [{ id: "u-big", name: "Gigante", code: "b".repeat(5 * 1024 * 1024) }]; saveScripts()');
  assert.equal(await read('JSON.parse(localStorage.getItem("huntLog")).length'), 40, 'historico nao foi podado');

  // ===== Fase 2: API GM_* =====
  const cab = linhas => '// ==UserScript==\n' + linhas.map(l => '// ' + l).join('\n') + '\n// ==/UserScript==\n';
  const leGrants = codigo => read('scGrants(' + JSON.stringify(codigo) + ')');
  const fazShim = codigo => read('gmShim({id:"probe",name:"probe"}, ' + JSON.stringify(codigo) + ')');

  // 12. @grant: cabecalho padrao do Tampermonkey, repetido e ausente.
  assert.deepEqual(await leGrants(cab(['@name Qualquer', '@grant GM_setValue', '@grant GM_getValue', '@grant GM_setValue'])), ['GM_setValue', 'GM_getValue'], '@grant lidos e deduplicados');
  assert.deepEqual(await leGrants(cab(['@name Qualquer'])), [], 'sem @grant = nenhuma API');
  assert.deepEqual(await leGrants(cab(['@grant none'])), ['none']);
  assert.deepEqual(await leGrants('sem cabecalho aqui'), []);

  // 13. O shim so expoe o que foi concedido.
  assert.equal(await fazShim(cab(['@grant none'])), '', '@grant none continua injecao crua');
  assert.equal(await fazShim('sem cabecalho'), '', 'sem cabecalho continua injecao crua');
  const shimSoSet = await fazShim(cab(['@grant GM_setValue']));
  assert.ok(shimSoSet.includes('const GM_setValue='), 'GM_setValue presente quando concedido');
  assert.ok(!shimSoSet.includes('const GM_getValue='), 'GM_getValue fora quando nao concedido');
  assert.ok(!shimSoSet.includes('const GM_xmlhttpRequest='), 'GM_xmlhttpRequest fora quando nao concedido');
  assert.ok(!shimSoSet.includes('const GM_addStyle='), 'GM_addStyle fora quando nao concedido');
  const shimAddStyle = await fazShim(cab(['@grant GM_addStyle']));
  assert.ok(shimAddStyle.includes('const GM_addStyle=') && !shimAddStyle.includes('const GM_setValue='), 'grants sao independentes');

  // 14. Loja fim-a-fim: shim no painel -> console-message -> localStorage do app.
  const codigoGM = cab(['@name GM teste', '@version 1.0', '@grant GM_setValue', '@grant GM_getValue', '@grant GM_deleteValue', '@grant GM_info', '@grant GM_addStyle']);
  await read(`
    localStorage.removeItem('gmStore:t-gm');
    window.__codigoGM = ${JSON.stringify(codigoGM)};
    userScripts = [{ id: 't-gm', name: 'GM teste', code: window.__codigoGM, version: '1.0' }];
    scriptsOn = { 't-gm': true };
    saveScripts();
    window.__shimGM = gmShim(userScripts[0], window.__codigoGM);
    1;
  `);
  const shimGM = await read('window.__shimGM');
  const loja = await guest(0, '(function(){' + shimGM + `
    var ok1 = GM_setValue("nivel", 7);
    var ok2 = GM_setValue("nome", "ash");
    var apagou = (GM_deleteValue("nome") === undefined);
    return [ok1, ok2, apagou, GM_getValue("nivel", 0), GM_getValue("nome", "ausente"), typeof GM_addStyle, GM_info.script.id];
  })()`);
  assert.deepEqual(loja, [true, true, true, 7, 'ausente', 'function', 't-gm'], 'set/get/delete/info dentro do painel');
  await until(() => read('gmLoad("t-gm").nivel === 7 && !("nome" in gmLoad("t-gm"))'));
  assert.deepEqual(await read('gmLoad("t-gm")'), { nivel: 7 }, 'app gravou a alteracao na loja da extensao');
  assert.deepEqual(await read('JSON.parse(localStorage.getItem("gmStore:t-gm"))'), { nivel: 7 }, 'gravado no localStorage');

  // 15. Cota de 256 KB por extensao: recusa sem derrubar o historico.
  assert.equal(await guest(0, '(function(){' + shimGM + 'return GM_setValue("enxame", "a".repeat(300 * 1024));})()'), false, 'acima da cota o shim recusa');
  await pause(300);
  assert.equal(await read('"enxame" in gmLoad("t-gm")'), false, 'nada foi persistido');
  assert.equal(await read('(localStorage.getItem("gmStore:t-gm") || "").includes("enxame")'), false);
  assert.equal(await read('JSON.parse(localStorage.getItem("huntLog")).length'), 40, 'historico intacto apos estouro de cota da extensao');

  // 16. A pagina do jogo pode forjar console.log: todo pedido e validado aqui.
  assert.equal(await read('gmPersist(JSON.stringify({i:"nao-existe",k:"x",v:1})); localStorage.getItem("gmStore:nao-existe");'), null, 'id inexistente ignorado');
  await read(`userScripts.push({ id: 't-off', name: 'Desligado', code: window.__codigoGM, grants: ['GM_setValue'] }); saveScripts(); 1;`);
  assert.equal(await read('gmPersist(JSON.stringify({i:"t-off",k:"x",v:1})); localStorage.getItem("gmStore:t-off");'), null, 'script desligado ignorado');
  await read(`userScripts.push({ id: 't-nogrant', name: 'Sem grant', code: 'x', grants: ['GM_addStyle'] }); scriptsOn['t-nogrant'] = true; saveScripts(); 1;`);
  assert.equal(await read('gmPersist(JSON.stringify({i:"t-nogrant",k:"x",v:1})); localStorage.getItem("gmStore:t-nogrant");'), null, 'sem @grant de escrita ignorado');
  await read('gmPersist(JSON.stringify({i:"t-gm",k:"__proto__",v:{poluido:1}})); 1;');
  assert.equal(await read('(localStorage.getItem("gmStore:t-gm") || "").includes("__proto__")'), false, 'chave de prototipo rejeitada');

  // 17. A linha do modal mostra os grants pedidos.
  await read('document.getElementById("scriptsBtn").click()');
  await pause(80);
  assert.equal(await read('document.querySelectorAll("#scList .sc-row").length'), 4, 'preset + tres extensoes de teste');
  const linhaDe = nome => read('(()=>{const r=[...document.querySelectorAll("#scList .sc-row")].find(x=>x.textContent.includes(' + JSON.stringify(nome) + '));return r?r.textContent:""})()');
  assert.match(await linhaDe('GM teste'), /GM_setValue/, 'grants visiveis na linha');
  assert.match(await linhaDe('Sem grant'), /GM_addStyle/, 'mostra so o que foi concedido');
  assert.doesNotMatch(await linhaDe('Sem grant'), /GM_setValue/, 'nao anuncia API que o script nao pediu');
  assert.doesNotMatch(await linhaDe('JustP'), /GM_/, 'preset sem @grant nao ganha tag de API');
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }).then(image => fs.writeFileSync(path.join(output, 'scripts-grants.png'), image.toPNG()));
  await read('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  assert.equal(await read('document.getElementById("scOverlay").classList.contains("show")'), false);

  // 18. GM_xmlhttpRequest: so com grant, e a resposta volta para o painel.
  assert.equal(await read('typeof window.pokeAPI.fetchExtension'), 'function', 'canal exposto no preload');
  await read(`
    window.__codigoXhr = ${JSON.stringify(cab(['@grant GM_xmlhttpRequest']))};
    userScripts.push({ id: 't-xhr', name: 'XHR', code: window.__codigoXhr });
    scriptsOn['t-xhr'] = true; saveScripts();
    window.__shimXhr = gmShim(userScripts.find(x => x.id === 't-xhr'), window.__codigoXhr);
    1;
  `);
  const shimXhr = await read('window.__shimXhr');
  assert.ok(shimXhr.includes('const GM_xmlhttpRequest=') && !shimXhr.includes('const GM_setValue='));
  const antes = xhrCalls.length;
  await read('gmXhr(webviews[0], JSON.stringify({i:"t-gm",r:1,u:"https://raw.githubusercontent.com/a/b/main/c.json"})); 1;');
  assert.equal(xhrCalls.length, antes, 'script sem GM_xmlhttpRequest nao passa');
  await read('gmXhr(webviews[0], JSON.stringify({i:"nao-existe",r:1,u:"https://raw.githubusercontent.com/a/b/main/c.json"})); 1;');
  assert.equal(xhrCalls.length, antes, 'id forjado nao passa');
  await guest(0, '(function(){' + shimXhr + 'window.__x="pendente";GM_xmlhttpRequest({url:"https://raw.githubusercontent.com/a/b/main/c.json",onload:function(r){window.__x="ok:"+r.responseText},onerror:function(){window.__x="erro"}});1;})()');
  await until(() => guest(0, 'window.__x !== "pendente"'), 40, 100);
  assert.equal(await guest(0, 'window.__x'), 'ok:{"a":1}', 'resposta entregue ao painel');
  assert.equal(xhrCalls.length, antes + 1, 'pedido exatamente uma vez');

  // 19. Limpeza, captura com o modal aberto e fechamento final.
  await read('userScripts = []; scriptsOn = {}; saveScripts(); localStorage.removeItem("gmStore:t-gm"); window.confirm = window.__confirm; window.alert = window.__alert; delete window.__usRuns;');
  assert.equal(await read('JSON.parse(lsGet("userScripts")).length'), 0, 'perfil limpo');
  await read('document.querySelector("#leafToolsMenu [data-old=\'scriptsBtn\']").click()');
  await pause(120);
  assert.equal(await read('document.getElementById("scOverlay").classList.contains("show")'), true, 'modal reaberto para a captura');
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }).then(image => fs.writeFileSync(path.join(output, 'scripts-modal.png'), image.toPNG()));
  await read('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: modal acessivel pela shell, i18n, Esc/atalhos, guarda de login, dedupe, teto de 4 MB, API GM_* por @grant, cota de 256 KB e anti-forja.');
  console.log('Preview: ' + path.join(output, 'scripts-modal.png'));
  app.exit(0);
}).catch(error => { console.error(error.stack); console.error(errors.join('\n')); app.exit(1); });
setTimeout(() => { console.error('Userscripts test timed out'); app.exit(1); }, 60000);
