const { app, BrowserWindow, ipcMain, safeStorage, Tray, Menu, powerSaveBlocker, shell, session, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { coalesceScriptLoading, blockMetaPixel } = require('./src/main/guest-runtime');

// Isola este launcher do Absol Launcher original para poderem rodar simultaneamente sem conflito
app.name = 'pionailo';
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'pionailo'));
} catch (e) {}

// Mantém a composição fora da GPU, conforme solicitado.
app.commandLine.appendSwitch('disable-gpu-compositing');
const https = require('https');
const { twitchChatManager } = require('./src/domain/twitch-chat-service');

// Silencia o spam do Chromium no terminal (ex.: STUN/WebRTC do jogo que a rede nao resolve).
// E so log, nao afeta o app. Mantem so erros fatais.
app.commandLine.appendSwitch('log-level', '3');

// Otimização de memória RAM para multi-contas: limita heap por processo renderer para evitar acúmulo de lixo
try {
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256 --optimize_for_size');
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-breakpad');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('disable-domain-reliability');
  app.commandLine.appendSwitch('disable-sync');
  app.commandLine.appendSwitch('no-pings');
  app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,TranslateUI,MediaRouter');
  app.commandLine.appendSwitch('renderer-process-limit', '20');
} catch (e) {}

// GC forçado removido: com 156 renderers, forçar GC sincronizado a cada 45s causava
// picos de CPU e pausas. O V8 gerencia GC sozinho de forma mais eficiente.

// ===== Relatorio de erros: qualquer crash/travamento cai num arquivo que o usuario pode enviar =====
const errFile = () => path.join(app.getPath('userData'), 'relatorio-de-erros.log');
let errCabecalho = false;
function logErro(origem, detalhe) {
  try {
    const f = errFile();
    try { if (fs.statSync(f).size > 512 * 1024) fs.renameSync(f, f.replace(/\.log$/, '.antigo.log')); } catch {}
    let txt = '';
    if (!errCabecalho) {
      errCabecalho = true;
      txt += `\n=== sessao de ${new Date().toLocaleString('pt-BR')} · PokeGrid v${app.getVersion()} · Electron ${process.versions.electron} · ${process.platform} ${require('os').release()} ===\n`;
    }
    txt += `[${new Date().toLocaleString('pt-BR')}] [${origem}] ${String(detalhe).slice(0, 4000)}\n`;
    fs.appendFileSync(f, txt);
  } catch {}
}
process.on('uncaughtException', (e) => {
  logErro('app', (e && e.stack) || e);
  // erro nao previsto nao pode deixar o usuario com processo vivo e nenhuma janela
  try { const w = BrowserWindow.getAllWindows()[0]; if (w && !w.isDestroyed() && !w.isVisible()) { w.show(); w.maximize(); } } catch {}
});
process.on('unhandledRejection', (e) => logErro('app-promise', (e && e.stack) || e));
app.on('child-process-gone', (_e, d) => { if (d && d.reason !== 'clean-exit') logErro('processo-' + (d.type || '?'), d.reason + (d.exitCode != null ? ' (exit ' + d.exitCode + ')' : '')); });
// erros vindos da interface (window.onerror do index.html)
ipcMain.handle('errlog:write', (_e, origem, msg) => { if (typeof origem === 'string' && typeof msg === 'string') logErro(origem.slice(0, 40), msg); });
// abre a pasta com o arquivo selecionado, pro usuario mandar pro suporte
ipcMain.handle('errlog:open', () => {
  try {
    if (!fs.existsSync(errFile())) fs.writeFileSync(errFile(), 'Nenhum erro registrado ate agora. / No errors recorded yet.\n');
    shell.showItemInFolder(errFile());
  } catch {}
});


// Backups automaticos (config semanal e hunts que sairiam do limite de 150): grava em
// userData/backups sem dialogo. Nome vem do renderer, entao e tratado como hostil: so o
// basename, charset restrito, teto de 2MB, e no maximo 12 arquivos por prefixo.
ipcMain.handle('backup:save', (_e, nome, conteudo, cabecalho) => {
  try {
    if (typeof nome !== 'string' || typeof conteudo !== 'string') return false;
    nome = path.basename(nome);
    if (!/^[\w.-]{1,60}$/.test(nome) || conteudo.length + (typeof cabecalho === 'string' ? cabecalho.length : 0) > 2e6) return false;
    const dir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const alvo = path.join(dir, nome);
    // anexar so faz sentido em log/csv; num .json anexado o arquivo deixa de ser JSON valido e o
    // backup nao volta mais na hora que o usuario precisa
    const anexavel = /\.(csv|log|txt)$/i.test(nome);
    if (anexavel && fs.existsSync(alvo)) fs.appendFileSync(alvo, conteudo);
    else fs.writeFileSync(alvo, (typeof cabecalho === 'string' ? cabecalho : '') + conteudo);
    const prefixo = nome.replace(/[\d-]+\.\w+$/, '');
    const irmaos = fs.readdirSync(dir).filter((f) => f.startsWith(prefixo)).sort();
    while (irmaos.length > 12) { try { fs.unlinkSync(path.join(dir, irmaos.shift())); } catch { break; } }
    return true;
  } catch (e) { try { logErro('backup', String(e && e.message).slice(0, 200)); } catch {} return false; }
});

const MAX_ACCOUNTS = 4; // Uma familia fixa de quatro contas

// Limpa os dados do jogo de UMA conta (cookies, storage e cache da particao dela). Resolve conta
// "bugada" sem mexer nas outras; a senha salva do treinador nao mora ai e sobrevive.
ipcMain.handle('conta:limpar', async (_e, i) => {
  i = Math.trunc(+i);
  if (!(i >= 0 && i < MAX_ACCOUNTS)) return false;
  try {
    // os paineis usam persist:conta1..4 (i + 1); sem o +1 aqui limpava a conta do lado
    const ses = session.fromPartition('persist:conta' + (i + 1));
    await ses.clearStorageData();
    await ses.clearCache();
    return true;
  } catch (e) { try { logErro('conta', 'limpar conta' + i + ': ' + String(e && e.message).slice(0, 150)); } catch {} return false; }
});

// Baixa userscript do GitHub (base: PR #4 do JulianoCLI). Guardas: so https, so github.com e
// raw.githubusercontent.com, redirect revalidado pela mesma funcao, no maximo 3 saltos, 2MB e
// timeouts. Conserto proprio: link /blob/ (o que se copia do navegador) vira raw, senao o app
// instalava a PAGINA HTML como se fosse o script.
const US_HOSTS = new Set(['github.com', 'raw.githubusercontent.com']);
function urlRaw(u) {
  if (u.hostname === 'github.com') {
    const p = u.pathname.split('/').filter(Boolean); // owner/repo/blob/branch/caminho...
    const i = p.indexOf('blob');
    if (i >= 2 && p.length > i + 2) return new URL('https://raw.githubusercontent.com/' + p[0] + '/' + p[1] + '/' + p.slice(i + 1).join('/'));
  }
  return u;
}
function baixaUserScript(url, saltos = 0) {
  return new Promise((resolve) => {
    let u;
    try { u = urlRaw(new URL(String(url))); } catch { resolve({ ok: false, error: 'Link invalido.' }); return; }
    if (u.protocol !== 'https:' || !US_HOSTS.has(u.hostname) || !/\.js$/i.test(u.pathname)) {
      resolve({ ok: false, error: saltos ? 'O GitHub redirecionou para um endereco fora da lista (link de release?). Use o link do arquivo .js dentro do repositorio.' : 'Use um link https do GitHub para um arquivo .js' }); return;
    }
    const req = https.get(u, { headers: { 'User-Agent': 'PokeGrid/' + app.getVersion(), Accept: 'text/plain' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (saltos >= 3) { resolve({ ok: false, error: 'Redirecionamentos demais.' }); return; }
        let prox; try { prox = new URL(res.headers.location, u).toString(); } catch { resolve({ ok: false, error: 'Redirecionamento invalido.' }); return; }
        baixaUserScript(prox, saltos + 1).then(resolve); return;
      }
      if (res.statusCode !== 200) { res.resume(); resolve({ ok: false, error: 'GitHub respondeu HTTP ' + res.statusCode }); return; }
      let tam = 0, corpo = '', parou = false;
      res.setEncoding('utf8');
      res.on('data', (c) => {
        if (parou) return;
        tam += Buffer.byteLength(c);
        if (tam > 2 * 1024 * 1024) { parou = true; req.destroy(); resolve({ ok: false, error: 'O script passa de 2 MB.' }); }
        else corpo += c;
      });
      res.on('end', () => {
        if (parou) return;
        const c0 = corpo.trim(); // pagina de erro/HTML do GitHub nao e script: nenhum .js valido comeca com '<'
        if (!c0 || c0[0] === '<') { resolve({ ok: false, error: 'Esse link nao devolveu um arquivo .js. Abra o arquivo no GitHub e copie o link dele.' }); return; }
        resolve({ ok: true, url: u.toString(), code: corpo });
      });
      res.on('error', () => { if (!parou) { parou = true; resolve({ ok: false, error: 'Falha ao ler o script.' }); } });
    });
    req.setTimeout(12000, () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve({ ok: false, error: 'Nao foi possivel acessar o GitHub.' }));
  });
}
ipcMain.handle('userscript:fetch', (_e, url) => baixaUserScript(url));
// GM_xmlhttpRequest das extensoes: MESMO recinto de baixaUserScript (so https, so github.com e
// raw.githubusercontent.com, redirect revalidado pela mesma funcao, no maximo 3 saltos, 2 MB e
// 12 s) mas devolve status e corpo sem exigir terminacao .js nem rejeitar '<' - o script pede um
// arquivo do proprio GitHub, que pode ser json/md. Nenhum host novo entra na lista.
function pedeParaExtensao(url, saltos = 0) {
  return new Promise((resolve) => {
    let u;
    try { u = urlRaw(new URL(String(url))); } catch { resolve({ ok: false, error: 'Link invalido.' }); return; }
    if (u.protocol !== 'https:' || !US_HOSTS.has(u.hostname)) { resolve({ ok: false, error: 'So https do GitHub (github.com ou raw.githubusercontent.com).' }); return; }
    const req = https.get(u, { headers: { 'User-Agent': 'PokeGrid/' + app.getVersion(), Accept: '*/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (saltos >= 3) { resolve({ ok: false, error: 'Redirecionamentos demais.' }); return; }
        let prox; try { prox = new URL(res.headers.location, u).toString(); } catch { resolve({ ok: false, error: 'Redirecionamento invalido.' }); return; }
        pedeParaExtensao(prox, saltos + 1).then(resolve); return;
      }
      const status = res.statusCode;
      let tam = 0, corpo = '', parou = false;
      res.setEncoding('utf8');
      res.on('data', (c) => {
        if (parou) return;
        tam += Buffer.byteLength(c);
        if (tam > 2 * 1024 * 1024) { parou = true; req.destroy(); resolve({ ok: false, error: 'A resposta passa de 2 MB.' }); }
        else corpo += c;
      });
      res.on('end', () => {
        if (parou) return;
        if (status === 200) resolve({ ok: true, status, url: u.toString(), code: corpo });
        else { res.resume(); resolve({ ok: false, status, url: u.toString(), error: 'GitHub respondeu HTTP ' + status }); }
      });
      res.on('error', () => { if (!parou) { parou = true; resolve({ ok: false, error: 'Falha ao ler a resposta.' }); } });
    });
    req.setTimeout(12000, () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve({ ok: false, error: 'Nao foi possivel acessar o GitHub.' }));
  });
}
ipcMain.handle('userscript:request', (_e, url) => pedeParaExtensao(url));
// Instancia unica: abrir o app de novo so foca a janela ja aberta.
// segunda instancia: fecha e o 'second-instance' da primeira mostra a janela dela. Fica no relatorio, pra separar
// 'nem rodou' (antivirus, Controle inteligente de aplicativos) de 'ja tinha um aberto' quando alguem diz que nada abre
// O quit() antes do ready nao impede o ready: sem o lockOk o whenReady criava a janela e gravava 'janela criada' aqui tambem
const lockOk = app.requestSingleInstanceLock();
if (!lockOk) { logErro('boot', 'ja havia um PokeGrid aberto: esta instancia fechou e mostrou aquele'); app.quit(); }

// Paineis presos ao dominio do jogo: nada de popup, e navegar o painel
// (que carrega a sessao logada) para outro site abre no navegador de fora.
const GAME = 'https://pokeidle.io';
// Limite deslizante: a pagina do jogo (ou um XSS nela) pedia abrir link e o navegador do
// usuario abria sem limite. 3 por 10s cobre o uso real (clicar num link) e corta enxurrada.
let aberturas = [];
const abreFora = (url) => {
  if (!/^https?:\/\//i.test(url)) return;
  const agora = Date.now();
  aberturas = aberturas.filter((t) => agora - t < 10000);
  if (aberturas.length >= 3) { try { logErro('painel', 'link externo descartado (limite de 3 por 10s): ' + String(url).slice(0, 120)); } catch {} return; }
  aberturas.push(agora);
  shell.openExternal(url);
};
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  coalesceScriptLoading(contents);
  blockMetaPixel(contents.session);
  contents.setWindowOpenHandler(({ url }) => { abreFora(url); return { action: 'deny' }; });
  // compara a ORIGEM, nao o prefixo: 'https://pokeidle.io.evil.com' comeca igual e
  // passaria, levando a sessao logada pra um site clonado sem barra de endereco
  const mesmoJogo = (u) => { try { const o = new URL(u).origin; return o === new URL(GAME).origin || o === 'https://poke.idleworld.online'; } catch { return false; } };
  const guarda = (e, url) => {
    if (!mesmoJogo(url) && url !== 'about:blank') { e.preventDefault(); abreFora(url); }
  };
  contents.on('will-navigate', guarda);
  contents.on('will-redirect', guarda);
  // watchdog: se o processo do painel morrer (crash/OOM), recarrega sozinho
  contents.on('render-process-gone', (_ev, d) => {
    if (d.reason !== 'clean-exit') {
      logErro('painel', 'processo do painel caiu: ' + d.reason + (d.exitCode != null ? ' (exit ' + d.exitCode + ')' : ''));
      setTimeout(() => { try { contents.reload(); } catch {} }, 1500);
    }
  });
  // travou (processo vivo mas sem responder): 20s de tolerancia; se nao voltar,
  // derruba o processo de proposito, o watchdog acima recarrega o painel sozinho
  let hangTimer = null;
  contents.on('unresponsive', () => {
    logErro('painel', 'painel travou (sem responder)');
    clearTimeout(hangTimer);
    hangTimer = setTimeout(() => { try { if (!contents.isDestroyed()) contents.forcefullyCrashRenderer(); } catch {} }, 20000);
  });
  contents.on('responsive', () => { clearTimeout(hangTimer); logErro('painel', 'painel voltou a responder'); });
  contents.on('destroyed', () => clearTimeout(hangTimer));
  // Esc com o jogo focado: avisa a interface (fechar card de IV / desexpandir) SEM consumir a
  // tecla, o jogo usa Esc pra fechar dialogos. Por isso nao e um accelerator de menu, que engoliria.
  contents.on('before-input-event', (_ev, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && !input.isAutoRepeat) {
      try { contents.hostWebContents && contents.hostWebContents.send('hotkey', 'collapse'); } catch {}
    }
  });
  // clique direito no jogo: modo foco (expande/volta). Campo editavel fica de fora,
  // senao o clique de colar num input viraria tela cheia.
  contents.on('context-menu', (_ev, params) => {
    if (params && params.isEditable) return;
    try { contents.hostWebContents && contents.hostWebContents.send('hotkey', 'ctx' + contents.id); } catch {}
  });
});

const credFile = () => path.join(app.getPath('userData'), 'accounts.enc');
const proxySessions = Array.from({ length: MAX_ACCOUNTS }, (_, i) => 'persist:conta' + (i + 1));
const activeProxyKeys = Array(MAX_ACCOUNTS).fill(undefined);
const activeProxies = Array(MAX_ACCOUNTS).fill(null);
async function blockAccountProxy(i) {
  const ses = session.fromPartition(proxySessions[i]);
  await ses.setProxy({ mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:9' });
  await ses.closeAllConnections();
  activeProxyKeys[i] = 'blocked';
  activeProxies[i] = null;
}

function normalizeAccountProxy(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Configuração de proxy inválida.');
  const type = String(raw.type || '').toLowerCase();
  const host = String(raw.host || '').trim().toLowerCase();
  const port = Number(raw.port);
  const username = String(raw.username || '');
  const password = String(raw.password || '');
  if (!['http', 'socks5'].includes(type)) throw new Error('Escolha HTTP ou SOCKS5.');
  if (!/^[a-z0-9.-]{1,253}$/.test(host) || host.startsWith('.') || host.endsWith('.') || host.includes('..')) throw new Error('Endereço do proxy inválido.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta do proxy inválida.');
  if (username.length > 128 || password.length > 256 || /[\r\n]/.test(username + password)) throw new Error('Credenciais do proxy inválidas.');
  if (type === 'socks5' && (username || password)) throw new Error('SOCKS5 com usuário e senha não é suportado; use HTTP autenticado.');
  if (type === 'http' && Boolean(username) !== Boolean(password)) throw new Error('Preencha usuário e senha do proxy juntos.');
  return { type, host, port, username, password };
}

function setupAccountSession(num) {
  try {
    const ses = session.fromPartition('persist:conta' + num);
    if (ses && typeof ses.setPermissionRequestHandler === 'function') {
      ses.setPermissionRequestHandler((_wc, p, cb) => cb(p === 'clipboard-sanitized-write'));
    }
  } catch (e) {
    if (typeof logErro === 'function') logErro('boot', 'sessao conta' + num + ': ' + e.message);
  }
}

async function applyAccountProxy(i, raw) {
  setupAccountSession(i + 1);
  const proxy = normalizeAccountProxy(raw);
  const key = JSON.stringify(proxy);
  if (activeProxyKeys[i] === key) return false;
  const ses = session.fromPartition(proxySessions[i]);
  try {
    await ses.setProxy(proxy
      ? { mode: 'fixed_servers', proxyRules: `${proxy.type}://${proxy.host}:${proxy.port}` }
      : { mode: 'system' });
    await ses.closeAllConnections();
    await ses.clearAuthCache();
    activeProxyKeys[i] = key;
    activeProxies[i] = proxy;
    return true;
  } catch (e) {
    // Um proxy configurado nunca deve deixar a conta sair pela conexão direta.
    if (proxy) {
      try { await blockAccountProxy(i); } catch {}
    }
    throw new Error('Não foi possível aplicar o proxy da conta ' + (i + 1) + '.');
  }
}

app.on('login', (event, contents, details, authInfo, callback) => {
  if (!authInfo || !authInfo.isProxy || !contents || details?.firstAuthAttempt === false) return;
  const i = proxySessions.findIndex(partition => contents.session === session.fromPartition(partition));
  const proxy = activeProxies[i];
  if (!proxy || proxy.type !== 'http' || !proxy.username) return;
  if (String(authInfo.host).toLowerCase() !== proxy.host || Number(authInfo.port) !== proxy.port) return;
  event.preventDefault();
  callback(proxy.username, proxy.password);
});

function readAccounts() {
  let buf;
  try { buf = fs.readFileSync(credFile()); } catch { return []; }
  try {
    if (safeStorage.isEncryptionAvailable()) return JSON.parse(safeStorage.decryptString(buf));
    return JSON.parse(buf.toString('utf8'));
  } catch {
    try { fs.copyFileSync(credFile(), credFile() + '.bak-' + Date.now()); } catch {}
    return [];
  }
}

// Contas salvas: criptografadas em disco via DPAPI/keychain do SO (safeStorage).
ipcMain.handle('creds:load', async () => {
  const accounts = readAccounts();
  for (let i = 0; i < Math.min(MAX_ACCOUNTS, accounts.length); i++) {
    try { await applyAccountProxy(i, accounts[i]?.proxy); }
    catch (e) { if (accounts[i]?.proxy) try { await blockAccountProxy(i); } catch {} logErro('proxy', String(e.message)); }
  }
  return accounts.slice(0, MAX_ACCOUNTS);
});

ipcMain.handle('creds:save', (_e, accounts) => {
  try {
    if (!Array.isArray(accounts) || accounts.length > MAX_ACCOUNTS) return false;
    accounts.forEach(account => normalizeAccountProxy(account && account.proxy));
    // Preserva contas antigas excedentes no disco, fora da operacao do launcher.
    const archived = readAccounts().slice(MAX_ACCOUNTS);
    const json = JSON.stringify(accounts.concat(archived));
    // sem cripto do sistema, gravar em texto puro seria quebrar a promessa do app calado:
    // melhor recusar e dizer, que o renderer avisa e o relatorio de erros guarda o motivo
    if (!safeStorage.isEncryptionAvailable()) { logErro('creds', 'sistema sem cripto (safeStorage indisponivel): as senhas NAO foram salvas'); return false; }
    const data = safeStorage.encryptString(json);
    const f = credFile();
    fs.writeFileSync(f + '.tmp', data);
    fs.renameSync(f + '.tmp', f); // troca atomica: fechar o app no meio nao corrompe
    return true;
  } catch (e) {
    // disco cheio, antivirus segurando o .tmp (EPERM), pasta sem permissao: quem chamou precisa saber,
    // senao o modal fecha como se tivesse salvo e a senha some no proximo boot
    logErro('creds', 'falha ao salvar contas: ' + e.message);
    return false;
  }
});
ipcMain.handle('proxy:apply', async (_e) => {
  const accounts = readAccounts();
  const changed = [], errors = [];
  for (let i = 0; i < Math.min(MAX_ACCOUNTS, accounts.length); i++) {
    try { if (await applyAccountProxy(i, accounts[i]?.proxy)) changed.push(i); }
    catch (e) { if (accounts[i]?.proxy) try { await blockAccountProxy(i); } catch {} errors.push({ i, message: String(e.message) }); changed.push(i); logErro('proxy', String(e.message)); }
  }
  return { changed, errors };
});

ipcMain.handle('twitch:creds:load', () => twitchChatManager.loadCreds());
ipcMain.handle('twitch:creds:save', (_e, data) => twitchChatManager.saveCreds(data));
ipcMain.handle('twitch:test', (_e, username, token) => twitchChatManager.testConnection(username, token));
ipcMain.handle('twitch:sync-lives', (_e, lives) => {
  twitchChatManager.syncLives(lives);
  return true;
});
ipcMain.handle('twitch:status:get', () => twitchChatManager.getStatus());

// UA consistente pra passar na Cloudflare: remove o token "Electron/..." e
// congela a versão do Chrome em .0.0.0, casando com os client hints (navigator.userAgentData).
// Deriva da versão real do Chromium, então acompanha upgrades do Electron sozinho.
app.userAgentFallback = app.userAgentFallback
  .replace(/ Electron\/[\d.]+/, '')
  // tira tambem o token do proprio app (pokegrid/1.5.x): a UA nao precisa entregar quem usa o
  // PokeGrid pro servidor do jogo
  .replace(/ [\w.-]+\/[\d.]+ (?=Chrome\/)/i, ' ')
  .replace(/(Chrome\/\d+)[\d.]+/, '$1.0.0.0');

// Notificacao do SO (alertas de queda e de sem pokebola).
// versao do app pro badge do topo (sendSync: disponivel no load, mesmo com o preload em sandbox)
ipcMain.on('app:version', (e) => { e.returnValue = app.getVersion(); });
ipcMain.handle('notify', (_e, title, body) => {
  try { if (Notification.isSupported()) new Notification({ title, body }).show(); } catch {}
});

// Le um preset de userscript da pasta presets/ (nome saneado, sem path traversal).
ipcMain.handle('preset:read', (_e, name) => {
  if (typeof name !== 'string' || !/^[\w.-]+\.js$/.test(name)) return '';
  try { return fs.readFileSync(path.join(__dirname, 'presets', name), 'utf8'); } catch { return ''; }
});

// Anti-sono: impede o PC de dormir enquanto farma (a tela ainda pode desligar).
let awakeId = null;
ipcMain.handle('awake:set', (_e, on) => {
  if (on && awakeId === null) awakeId = powerSaveBlocker.start('prevent-app-suspension');
  if (!on && awakeId !== null) { powerSaveBlocker.stop(awakeId); awakeId = null; }
  return awakeId !== null;
});

// Minimizar: pra bandeja (padrao) ou normal, na barra de tarefas. A interface persiste a escolha.
let minToTray = true;
ipcMain.handle('mintray:set', (_e, on) => { minToTray = !!on; return minToTray; });

// ===== Abrir com o Windows (desligado por padrao) =====
// Feito com um atalho na pasta Inicializar do usuario, e nao escrevendo na chave Run do registro
// (que e o metodo do setLoginItemSettings). Motivo: gravar em Run e abrir invisivel sao os dois
// comportamentos que antivirus tratam como persistencia suspeita. O atalho fica num lugar que o
// usuario ve e pode apagar sozinho (Win+R > shell:startup), e o app abre com a janela visivel.
const startupDir = () => path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const startupLnk = () => path.join(startupDir(), 'PokeGrid.lnk');
const autoStartOn = () => { try { return process.platform === 'win32' && fs.existsSync(startupLnk()); } catch { return false; } };
// A portatil se extrai numa pasta temporaria e roda de la: process.execPath e %TEMP%\<id>\PokeGrid.exe,
// que e apagada ao fechar. O .exe que o usuario abriu vem nesta variavel, que o electron-builder exporta.
const exeReal = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
function setAutoStart(on) {
  if (process.platform !== 'win32') return false;
  try {
    if (on) {
      const opts = { target: exeReal(), description: 'PokeGrid', appUserModelId: 'online.idleworld.pokegrid' };
      if (!app.isPackaged) opts.args = `"${app.getAppPath()}"`; // rodando pelo codigo: electron + a pasta do app
      shell.writeShortcutLink(startupLnk(), 'create', opts);
    } else {
      try { fs.unlinkSync(startupLnk()); } catch {}
    }
  } catch (e) { logErro('autostart', String((e && e.message) || e)); }
  return autoStartOn();
}
ipcMain.handle('autostart:get', () => ({ on: autoStartOn(), suportado: process.platform === 'win32' }));
let itemAuto = null; // o item "Abrir com o Windows" da bandeja, pra acompanhar o botao da janela
ipcMain.handle('autostart:set', (_e, on) => { const r = setAutoStart(!!on); if (itemAuto) itemAuto.checked = r; return r; });

// Webhook do Discord (opcional): o usuario cola a URL do proprio servidor. So aceita o dominio
// oficial de webhooks; o envio sai daqui porque a CSP do renderer bloqueia rede externa.
ipcMain.handle('webhook:send', (_e, url, text) => {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' || !/^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/.test(u.hostname) || !u.pathname.startsWith('/api/webhooks/')) return false; // ptb. e canary.: a URL que o Discord PTB/Canary copia
    // Mencao: so os IDs de usuario que JA estao no texto (o app so poe o que voce configurou).
    // parse: [] segue barrando @everyone/@here e cargos, mesmo se o nome de uma conta tentar.
    const ids = (String(text).match(/<@(\d{5,20})>/g) || []).map(x => x.replace(/\D/g, '')).slice(0, 5);
    const body = JSON.stringify({ content: String(text).slice(0, 1900), allowed_mentions: { parse: [], users: ids } });
    // resolve com o status de verdade: sem isso o botao Testar dava OK ate com webhook apagado
    return new Promise((pronto) => {
      const req = https.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { res.resume(); pronto(res.statusCode < 300); });
      req.on('error', () => pronto(false));
      req.setTimeout(8000, () => { req.destroy(); pronto(false); });
      req.end(body);
    });
  } catch { return false; }
});

// ===== Bridge Camoufox / Turnstile Stealth Solver =====
const camoufoxQueue = [];
let activeCamoufoxCount = 0;
const MAX_CAMOUFOX_CONCURRENCY = 2;
const activeCamoufoxMap = new Map();

function processCamoufoxQueue() {
  while (activeCamoufoxCount < MAX_CAMOUFOX_CONCURRENCY && camoufoxQueue.length > 0) {
    const item = camoufoxQueue.shift();
    activeCamoufoxCount++;
    const promise = runCamoufoxLogin(item.data);
    if (item.key) activeCamoufoxMap.set(item.key, promise);
    promise
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        if (item.key) activeCamoufoxMap.delete(item.key);
        activeCamoufoxCount--;
        processCamoufoxQueue();
      });
  }
}

function queueCamoufoxLogin(data) {
  const accountKey = data.email || ('idx_' + data.index);
  if (activeCamoufoxMap.has(accountKey)) {
    return activeCamoufoxMap.get(accountKey);
  }
  const existingInQueue = camoufoxQueue.find(item => (item.data.email && item.data.email === data.email) || item.data.index === data.index);
  if (existingInQueue) {
    return new Promise((resolve, reject) => {
      const origResolve = existingInQueue.resolve;
      const origReject = existingInQueue.reject;
      existingInQueue.resolve = (val) => { origResolve(val); resolve(val); };
      existingInQueue.reject = (err) => { origReject(err); reject(err); };
    });
  }

  return new Promise((resolve, reject) => {
    camoufoxQueue.push({ data, resolve, reject, key: accountKey });
    processCamoufoxQueue();
  });
}

const activeCamoufoxProcesses = new Map();

function runCamoufoxLogin({ index, email, password, proxy }) {
  return new Promise((resolve) => {
    try {
      const scriptPath = path.join(__dirname, 'tools', 'turnstile_solver.py');
      if (!fs.existsSync(scriptPath)) {
        return resolve({ success: false, error: 'Script turnstile_solver.py não encontrado.' });
      }

      const payload = {
        mode: 'login',
        email,
        password,
        proxy: proxy || null,
        timeout_s: 75,
        headless: true
      };

      const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
      const py = spawn('python', [scriptPath, '--json-b64', b64], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      activeCamoufoxProcesses.set(index, py);

      let stdout = '';
      let stderr = '';

      py.stdout.on('data', (d) => { stdout += d.toString(); });
      py.stderr.on('data', (d) => { stderr += d.toString(); });

      const timeout = setTimeout(() => {
        activeCamoufoxProcesses.delete(index);
        try { py.kill(); } catch {}
        resolve({ success: false, error: 'Timeout aguardando Camoufox (90s).' });
      }, 90000);

      py.on('close', async (code) => {
        activeCamoufoxProcesses.delete(index);
        clearTimeout(timeout);
        try {
          const lines = stdout.trim().split('\n');
          let parsed = null;
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              const obj = JSON.parse(lines[i].trim());
              if (obj && typeof obj === 'object') {
                parsed = obj;
                break;
              }
            } catch {}
          }

          if (!parsed) {
            logErro('camoufox', `Erro ao parsear saída (code ${code}): ${stderr || stdout}`);
            return resolve({ success: false, error: stderr || `Processo encerrou com código ${code}` });
          }

          if (parsed.success) {
            const partitionName = 'persist:conta' + (index + 1);
            const ses = session.fromPartition(partitionName);
            if (ses && ses.cookies && typeof ses.cookies.set === 'function' && Array.isArray(parsed.cookies)) {
              for (const c of parsed.cookies) {
                try {
                  await ses.cookies.set({
                    url: 'https://pokeidle.io',
                    name: c.name,
                    value: c.value,
                    domain: '.pokeidle.io',
                    path: '/',
                    secure: true
                  });
                } catch (e) {
                  logErro('camoufox-cookie', `Falha ao setar cookie ${c.name}: ${e.message}`);
                }
              }
            }
          }
          resolve(parsed);
        } catch (e) {
          logErro('camoufox', `Exceção ao processar login: ${e.message}`);
          resolve({ success: false, error: e.message });
        }
      });

      py.on('error', (err) => {
        activeCamoufoxProcesses.delete(index);
        clearTimeout(timeout);
        logErro('camoufox', `Erro ao iniciar python: ${err.message}`);
        resolve({ success: false, error: `Python não encontrado ou erro de execução: ${err.message}` });
      });
    } catch (e) {
      activeCamoufoxProcesses.delete(index);
      resolve({ success: false, error: e.message });
    }
  });
}

ipcMain.handle('auth:camoufox-login', async (_e, data) => {
  if (!data || !Number.isInteger(data.index) || data.index < 0 || data.index >= MAX_ACCOUNTS) return { success: false, error: 'Conta fora da familia unica de quatro contas.' };
  return await queueCamoufoxLogin(data);
});

ipcMain.handle('auth:cancel-login', async (_e, index) => {
  try {
    const idx = Number(index);
    if (activeCamoufoxProcesses.has(idx)) {
      const py = activeCamoufoxProcesses.get(idx);
      try { py.kill(); } catch {}
      activeCamoufoxProcesses.delete(idx);
    }
    for (let i = camoufoxQueue.length - 1; i >= 0; i--) {
      if (camoufoxQueue[i].data.index === idx) {
        const item = camoufoxQueue.splice(i, 1)[0];
        try { item.resolve({ success: false, cancelled: true }); } catch {}
      }
    }
    activeCamoufoxMap.delete('idx_' + idx);
    for (const [key, _p] of activeCamoufoxMap.entries()) {
      if (key.includes('idx_' + idx)) activeCamoufoxMap.delete(key);
    }
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('auth:camoufox-check', async () => {
  return new Promise((resolve) => {
    try {
      const scriptPath = path.join(__dirname, 'tools', 'turnstile_solver.py');
      if (!fs.existsSync(scriptPath)) return resolve({ available: false, error: 'Script não encontrado' });
      const py = spawn('python', [scriptPath, '--self-test'], { windowsHide: true });
      py.on('close', (code) => resolve({ available: code === 0 }));
      py.on('error', () => resolve({ available: false }));
    } catch {
      resolve({ available: false });
    }
  });
});

let tray; // referencia viva para o icone nao sumir (GC)

app.whenReady().then(() => {
  if (!lockOk) return; // segunda instancia: ja esta saindo
  // Nada aqui pode derrubar a criacao da janela: se qualquer peca do sistema falhar (registro,
  // particao de sessao corrompida, bandeja), o app tem que abrir assim mesmo. Antes destas
  // guardas, uma excecao aqui deixava o processo vivo e SEM JANELA, que e o pior sintoma possivel.
  try { app.setAppUserModelId('io.pokeidle.pionailo'); } catch (e) { logErro('boot', 'appUserModelId: ' + e.message); } // notificacoes do Windows com o nome certo

  // Nega pedidos de permissao dos jogos (mic, camera, localizacao, notificacao...). So a escrita no clipboard passa:
  // sem ela os botoes Copiar do jogo (Recovery Key, codigos 2FA, Pix, link de indicacao) falhavam calados. O Chromium
  // ja exige foco e gesto do usuario pra essa escrita, e a leitura (clipboard-read) segue negada.
  for (let i = 1; i <= 4; i++) setupAccountSession(i);

  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#081224',
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    ...(process.platform === 'win32' ? {
      frame: false,
      thickFrame: true
    } : {}),
    webPreferences: { webviewTag: true, preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false }
  });
  ipcMain.handle('window:control', (event, action) => {
    if (event.sender !== win.webContents || win.isDestroyed()) return null;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') {
      if (win.isMaximized()) win.unmaximize(); else win.maximize();
    } else if (action === 'close') win.close();
    else if (action !== 'state') return null;
    return { maximized: !win.isDestroyed() && win.isMaximized() };
  });
  win.loadFile(path.join(__dirname, 'index.html')); // caminho absoluto: robusto no build empacotado (asar)
  twitchChatManager.setStatusCallback((st) => {
    if (!win.isDestroyed()) {
      try { win.webContents.send('twitch:status:update', st); } catch {}
    }
  });
  win.on('closed', () => twitchChatManager.setStatusCallback(null));
  // a janela principal so mostra index.html: bloqueia qualquer navegacao dela (canal de exfiltracao se houver XSS)
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); abreFora(url); } });
  win.webContents.setWindowOpenHandler(({ url }) => { abreFora(url); return { action: 'deny' }; });

  // registra travamento/queda da propria interface no relatorio de erros
  win.webContents.on('unresponsive', () => logErro('janela', 'interface travou (sem responder)'));
  win.webContents.on('responsive', () => logErro('janela', 'interface voltou a responder'));
  win.webContents.on('render-process-gone', (_e2, d) => { if (d.reason !== 'clean-exit') logErro('janela', 'interface caiu: ' + d.reason); });
  // Mostra a janela quando o conteudo esta pronto. Precisa do show() explicito: no Linux
  // varios gerenciadores de janela ignoram maximize() em janela ainda nao exibida, e o app
  // subia sem abrir nada. --hidden: nasce na bandeja, farmando.
  logErro('boot', 'janela criada');
  if (!process.argv.includes('--hidden')) {
    win.once('ready-to-show', () => { logErro('boot', 'conteudo pronto'); win.show(); win.maximize(); });
    setTimeout(() => { if (!win.isDestroyed() && !win.isVisible()) { logErro('boot', 'rede de seguranca: mostrando a janela'); win.show(); win.maximize(); } }, 8000); // rede de seguranca se o evento nao vier
  }

  // Atalhos (funcionam mesmo com o jogo focado): Ctrl+1..4 expande painel, Ctrl+M mudo.
  // O menu Edicao tem que existir: no macOS e ele que faz Cmd+C/V/X/A/Z funcionarem nos campos de
  // texto (login do jogo, chat, campos do app), e sem ele o Cmd+V nao colava nada. No Windows e no
  // Linux o Ctrl+V ja funcionava sem menu. No macOS o primeiro menu vira o menu do app (com o nome
  // PokeGrid), por isso o appMenu (Ocultar, Sair com Cmd+Q) vem antes, senao a Edicao sumia la dentro.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu', label: 'Edição' },
    {
      label: 'Atalhos',
      submenu: [
        ...[1, 2, 3, 4].map(n => ({
          label: `Expandir painel ${n}`, accelerator: `CmdOrCtrl+${n}`,
          click: () => win.webContents.send('hotkey', 'expand' + (n - 1))
        })),
        { label: 'Mudo', accelerator: 'CmdOrCtrl+M', click: () => win.webContents.send('hotkey', 'mute') },
        { type: 'separator' },
        { label: 'Aumentar zoom dos jogos', accelerator: 'CmdOrCtrl+Plus', click: () => win.webContents.send('hotkey', 'zoomIn') },
        { label: 'Diminuir zoom dos jogos', accelerator: 'CmdOrCtrl+-', click: () => win.webContents.send('hotkey', 'zoomOut') },
        { label: 'Restaurar zoom dos jogos', accelerator: 'CmdOrCtrl+0', click: () => win.webContents.send('hotkey', 'zoomReset') }
      ]
    }
  ]));

  // Bandeja: minimizar esconde da barra de tarefas; clique no icone alterna.
  // Ao voltar da bandeja, restaura o mesmo estado de antes: hide()+show() no
  // Windows perde o "maximizado", entao rastreamos e reaplicamos.
  let wasMax = true; // nasce maximizado (win.maximize() acima)
  win.on('maximize', () => { wasMax = true; win.webContents.send('window:maximized', true); });
  win.on('unmaximize', () => { wasMax = false; win.webContents.send('window:maximized', false); });
  const mostrar = () => { const m = wasMax; win.show(); if (m && !win.isMaximized()) win.maximize(); };
  // Bandeja, registro do Windows e pasta Inicializar entram DEPOIS que a janela aparece.
  // Sao chamadas sincronas ao sistema, e antivirus costumam interceptar justamente essas; se
  // travarem, o processo principal congela e a janela nunca abre (processo vivo, tela nenhuma).
  // Foi o que usuarios relataram na 1.5.5-1.5.7. Agora nada disso bloqueia a abertura.
  const prepararBandeja = () => {
    // versao portatil movida de pasta deixa o atalho da Inicializar apontando pra um exe que nao
    // existe mais, e o botao seguia dizendo "ligado": regrava quando o alvo mudou
    try { if (autoStartOn() && shell.readShortcutLink(startupLnk()).target !== exeReal()) setAutoStart(true); } catch {}
    // limpeza do autostart antigo (chave Run, que abria com --hidden): uma unica vez na vida.
    // Apaga pelo nome do valor, sem perguntar antes: o getLoginItemSettings() compara o caminho COM os
    // argumentos, e o antigo gravava '--hidden', entao a checagem dizia "desligado" e nada era apagado
    // (da 1.5.5 a 1.5.24 a marca 'runkey-limpo' foi gravada sem limpar nada). Da 1.1.3 a 1.5.4 o valor
    // tinha o AppUserModelId do app; antes, o nome padrao do Electron, 'electron.app.' + ProductName do
    // exe: PokeGrid nos builds 1.1.0 a 1.1.2, Electron no zip da 1.0.x e rodando pelo codigo.
    try {
      const marca = path.join(app.getPath('userData'), 'runkey-limpo-2');
      if (process.platform === 'win32' && !fs.existsSync(marca)) {
        for (const name of ['online.idleworld.pokegrid', 'electron.app.PokeGrid'])
          try { app.setLoginItemSettings({ openAtLogin: false, name }); } catch (e) { logErro('boot', 'runkey ' + name + ': ' + e.message); }
        // 'electron.app.Electron' e o nome de qualquer app Electron sem marca: nao da pra apagar as cegas.
        // Apaga so o que o proprio Electron casa com o NOSSO exe e que abria escondido (--hidden).
        try {
          for (const it of (app.getLoginItemSettings({ path: exeReal() }).launchItems || []))
            if (it && it.scope === 'user' && (it.args || []).includes('--hidden')) app.setLoginItemSettings({ openAtLogin: false, name: it.name });
        } catch (e) { logErro('boot', 'runkey itens: ' + e.message); }
        try { fs.writeFileSync(marca, '1'); } catch {}
      }
    } catch {}
  // Bandeja nao existe em todo ambiente (Linux sem indicador, por exemplo). Se falhar, o app
  // segue funcionando sem bandeja em vez de morrer no boot.
  try {
    tray = new Tray(path.join(__dirname, 'tray.png'));
    tray.setToolTip('PIO Nailo · Pokéidle.io');
    const menuBandeja = Menu.buildFromTemplate([
      { label: 'Mostrar', click: mostrar },
      { label: 'Abrir com o Windows', type: 'checkbox',
        checked: autoStartOn(), visible: process.platform === 'win32',
        click: (item) => { const r = setAutoStart(item.checked); item.checked = r; win.webContents.send('autostart', r); } },
      { label: 'Sair', click: () => app.quit() }
    ]);
    tray.setContextMenu(menuBandeja);
    itemAuto = (menuBandeja.items || []).find((it) => it.type === 'checkbox') || null;
    tray.on('click', () => win.isVisible() ? win.hide() : mostrar());
  } catch (e) {
    tray = null;
    logErro('bandeja', 'sem bandeja neste sistema: ' + e.message);
  }
    // nasceu escondido pra bandeja, mas nao ha bandeja: mostra, senao seria um processo invisivel
    if (!tray && process.argv.includes('--hidden')) mostrar();
    logErro('boot', 'bandeja pronta');
  };
  setTimeout(prepararBandeja, 1500); // a janela ja esta na tela quando isso roda
  // sem bandeja, esconder ao minimizar deixaria a janela inalcancavel: minimiza normal
  win.on('minimize', () => { if (minToTray && tray) win.hide(); });
  // A interface nao percebe sozinha que a janela sumiu: com backgroundThrottling desligado (o que segura o farm)
  // a pagina fica 'visible' ate na bandeja e os 4 jogos seguiam desenhando pra ninguem. Avisa, e ela poe os jogos
  // no modo leve do Simples. Some = false; qualquer sinal de volta (show, restore, focus) = true, pra nunca ficar preso.
  const avisaJanela = (v) => { try { if (!win.isDestroyed()) win.webContents.send('janela', v); } catch {} };
  win.on('hide', () => avisaJanela(false)); win.on('minimize', () => avisaJanela(false));
  win.on('show', () => avisaJanela(true)); win.on('restore', () => avisaJanela(true)); win.on('focus', () => avisaJanela(true));
  win.webContents.on('did-finish-load', () => avisaJanela(win.isVisible() && !win.isMinimized())); // nasceu na bandeja (--hidden)
  app.on('second-instance', () => mostrar());

  // checa atualizacao (nao incomoda quem abriu escondido na bandeja pra farmar)
});

app.on('window-all-closed', () => app.quit());
