(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const escH = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const privacyKey = 'hideAccountNames';
  let namesHidden = false;
  try { namesHidden = localStorage.getItem(privacyKey) === '1'; } catch {}
  let sidebarCollapsed = false;
  try { sidebarCollapsed = localStorage.getItem('hubSidebarCollapsed') === '1'; } catch {}
  const accountLabel = i => `Conta ${String(i + 1).padStart(2, '0')}`;
  const displayName = r => namesHidden ? accountLabel(r.i) : (r.name || `Conta ${r.i + 1}`);
  const fmtCompact = (n) => {
    n = +n || 0; const a = Math.abs(n), sg = n < 0 ? '-' : '';
    if (a >= 1e9) return sg + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.0','') + 'bi';
    if (a >= 1e6) return sg + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.0','') + 'M';
    if (a >= 1e3) return sg + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.0','') + 'k';
    return Math.round(a).toLocaleString('pt-BR');
  };
  const prettyHunt = s => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  const safeDex = sid => { try { return typeof dexId === 'function' ? dexId(+sid || 0) : (+sid || 0); } catch { return +sid || 0; } };
  const pokeSprite = (p) => {
    if (!p || !p.sid) return '';
    const id = safeDex(p.sid); if (!id) return '';
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.shiny ? 'shiny/' : ''}${id}.png`;
  };
  const getLead = (r) => (r && r.team && r.team.length) ? ((r.team.find(p => p.ld)) || (r.activeId ? r.team.find(p => p.id === r.activeId) : null) || r.team[0]) : null;
  const ico = (name) => {
    const icons = {
      moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M18.6 15.8A8 8 0 0 1 8.2 5.4 8 8 0 1 0 18.6 15.8Z"/><path d="M17.5 3.5v4M15.5 5.5h4" stroke-width="1.2"/></svg>',
      grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
      list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></svg>',
      bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10 20h4"/></svg>',
      gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 14.8 6L14.5 3h-5l-.3 3a7 7 0 0 0-1.7 1.1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1A7 7 0 0 0 9.2 18l.3 3h5l.3-3a7 7 0 0 0 1.7-1.1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/></svg>',
      reload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6v5h-5"/><path d="M19 11a8 8 0 1 0-2 6"/></svg>',
      hunt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
      chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 19V9M12 19V5M19 19v-7"/></svg>',
      user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-4 3.2-6 7-6s6.3 2 7 6"/></svg>',
      bag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
      simple:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>',
      plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>'
    };
    return icons[name] || '';
  };

  function clickOld(id) { const el = document.getElementById(id); if (el) el.click(); }
  function oldOn(id) { const el = document.getElementById(id); return !!(el && el.classList.contains('on')); }

  const oldTop = document.getElementById('topbar');
  const grid = document.getElementById('grid');
  const cards = document.getElementById('cards');
  if (!oldTop || !grid) return;
  document.body.classList.toggle('absol-win', navigator.userAgent.includes('Windows'));

  // Controller vault: functionality stays, visible hierarchy is rebuilt from zero.
  const vault = document.createElement('div');
  vault.id = 'leafControlVault';
  oldTop.parentNode.insertBefore(vault, oldTop);
  vault.appendChild(oldTop);

  const shell = document.createElement('div');
  shell.id = 'leafShell';
  shell.innerHTML = `
    <a class="leaf-skip" href="#leafMain">Pular para conteúdo</a>
    <header class="leaf-topbar">
      <div class="leaf-brand">
        <div class="leaf-brand-copy"><div class="leaf-brand-title leaf-brand-logos" aria-label="PokeIdle by Reboste.io"><img class="leaf-pokeidle-logo" src="src/ui/assets/pokeidle-logo-smooth.png" alt="PokeIdle"><span class="leaf-brand-by">by</span><img class="leaf-rebosteio-logo" src="src/ui/assets/rebosteio-logo.png" alt="Reboste.io"></div></div>
      </div>
      <div class="leaf-top-center">
        <button type="button" class="leaf-icon-btn" id="leafSidebarToggle" aria-controls="leafSidebar" aria-expanded="true" title="Recolher menu lateral" aria-label="Recolher menu lateral"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path class="leaf-sidebar-arrow" d="m16 9-3 3 3 3"/></svg></button>
        <div class="leaf-segment" id="leafViewTabs">
          <button data-view="windows" class="is-active" aria-pressed="true"><span style="width:13px;height:13px">${ico('grid')}</span>Janelas</button>
          <button data-view="list" aria-pressed="false"><span style="width:13px;height:13px">${ico('list')}</span>Lista</button>
          <button data-view="simple" id="leafSimple" aria-pressed="false"><span style="width:13px;height:13px">${ico('simple')}</span><span class="txt-hide-sm">Simples</span></button>
        </div>
        <button class="leaf-chip" id="leafEco" aria-pressed="false"><span style="width:13px;height:13px">${ico('moon')}</span><span>Modo Eco</span><span class="switch" aria-hidden="true"></span></button>
        <button class="leaf-chip" id="leafHuntOnly"><span style="width:13px;height:13px">${ico('hunt')}</span><span class="txt-hide-sm">Só a caça</span></button>
        <button class="leaf-chip" id="leafMap" aria-pressed="false"><span class="leaf-map-icon" style="width:13px;height:13px">${ico('chart')}</span><span class="txt-hide-sm">Painel</span></button>
        <button class="leaf-chip" id="leafAlerts" title="Alternar alertas e todos os sons do jogo"><span style="width:13px;height:13px">${ico('bell')}</span><span class="txt-hide-sm">Alertas</span></button>
      </div>
      <div class="leaf-top-right">
        <div class="leaf-top-note">Mesmo nas noites mais escuras,<br>há um propósito.</div>
        <span class="leaf-header-moon" aria-hidden="true">☾</span>
        <div class="leaf-connected"><span class="dot"></span><span id="leafConnectedText">0/0 conectadas</span></div>
        <button class="leaf-chip leaf-chip-login-all" id="leafHeaderLoginAll" title="Logar as quatro contas da equipe"><span style="color:#7ee787">▶</span><span>Logar equipe</span></button>
        <button class="leaf-tools-btn" id="leafToolsBtn" title="Ferramentas" aria-label="Ferramentas" aria-expanded="false" aria-controls="leafToolsMenu"><span style="width:15px;height:15px">${ico('chart')}</span>Ferramentas</button>
        <button class="leaf-icon-btn" id="leafSettingsBtn" title="Configurações" aria-label="Configurações" aria-expanded="false" aria-controls="leafSettingsDrawer"><span style="width:14px;height:14px">${ico('gear')}</span></button>
        <button class="leaf-icon-btn" id="leafMoreBtn" title="Mais" aria-label="Mais opções"><span class="leaf-menu-dot" aria-hidden="true"></span></button>
      </div>
      <div class="leaf-window-controls" role="group" aria-label="Controles da janela">
        <button type="button" data-window-action="minimize" title="Minimizar" aria-label="Minimizar"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg></button>
        <button type="button" data-window-action="maximize" title="Restaurar" aria-label="Restaurar"><svg class="win-max-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx=".7"/></svg><svg class="win-restore-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4V2.5h8v8H12M3 5.5h8v8H3z"/></svg></button>
        <button type="button" data-window-action="close" title="Fechar" aria-label="Fechar"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9"/></svg></button>
      </div>
    </header>
    <div class="leaf-body">
      <aside class="leaf-sidebar" id="leafSidebar" aria-label="Equipe e resumo">
        <div class="leaf-summary">
          <div class="leaf-summary-item"><div class="k">No jardim</div><div class="v good" id="leafKpiOnline">0/0</div></div>
          <div class="leaf-summary-item"><div class="k">Bolas</div><div class="v" id="leafKpiBalls">—</div></div>
          <div class="leaf-summary-item"><div class="k">Atenção</div><div class="v" id="leafKpiAttention">0</div></div>
        </div>
        <div class="leaf-sidebar-title"><span>Equipe em campo</span><span class="leaf-sidebar-rule"></span><button class="leaf-add-account" id="leafAddAccount" title="Treinadores" aria-label="Editar treinadores">${ico('plus')}</button></div>
        <div id="leafAccountList"></div>
        <div class="leaf-aside-epilogue" aria-hidden="true"><span class="leaf-epilogue-kicker">O GUARDIÃO</span><strong>Entre a névoa<br>e a próxima jornada.</strong><span class="leaf-epilogue-line"></span></div>
        <div class="leaf-side-footer">
          <button class="leaf-login-all" id="leafLoginAll">⇥ &nbsp; Logar equipe</button>
          <button class="leaf-side-round" id="leafAccountsFooter" title="Treinadores" aria-label="Editar treinadores">${ico('user')}</button>
          <button class="leaf-side-round" id="leafReloadAll" title="Atualizar tudo" aria-label="Atualizar todas as contas">${ico('reload')}</button>
        </div>
        <div class="leaf-version" id="leafVersion">PokeGrid</div>
      </aside>
      <main class="leaf-main" id="leafMain" tabindex="-1">
        <section id="leafWindowView" class="leaf-view"><h1 class="leaf-sr-only">Janelas das contas</h1></section>
        <section id="leafListView" class="leaf-view" hidden>
          <div class="leaf-page-head"><div><h1>Suas contas</h1><p>Acompanhe o time e o rendimento sem abrir cada janela.</p></div><div class="leaf-page-count" id="leafListCount">0 contas</div></div>
          <div class="leaf-companions" aria-hidden="true"><img src="src/ui/assets/companions.png" width="1983" height="793" alt=""></div>
          <div id="leafListRows"></div>
        </section>
      </main>
    </div>
    <footer class="leaf-landscape-footer" aria-hidden="true"><span>ALÉM DA ESCURIDÃO, SEMPRE MAIS JORNADAS.</span></footer>`;
  document.body.insertBefore(shell, document.body.firstChild);
  $('#leafWindowView').appendChild(grid);
  if (cards) $('#leafWindowView').appendChild(cards);

  const maximizeButton = $('.leaf-window-controls [data-window-action="maximize"]');
  function showMaximized(maximized) {
    maximizeButton.classList.toggle('is-maximized', maximized);
    maximizeButton.title = maximized ? 'Restaurar' : 'Maximizar';
    maximizeButton.setAttribute('aria-label', maximized ? 'Restaurar' : 'Maximizar');
  }
  if (document.body.classList.contains('absol-win') && window.pokeAPI?.windowControl) {
    $$('.leaf-window-controls button').forEach(button => button.onclick = () =>
      window.pokeAPI.windowControl(button.dataset.windowAction).then(state => {
        if (state && button.dataset.windowAction === 'maximize') showMaximized(!!state.maximized);
      }).catch(() => {}));
    window.pokeAPI.onWindowMaximized?.(showMaximized);
    window.pokeAPI.windowControl('state').then(state => { if (state) showMaximized(!!state.maximized); }).catch(() => {});
  }

  const tools = document.createElement('div');
  tools.id = 'leafToolsMenu';
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-label', 'Ferramentas');
  tools.innerHTML = `<div class="leaf-tools-title">Ferramentas</div>
    <button class="leaf-tool-item" data-old="loginAll"><span class="ico">↗</span><span>Logar equipe</span></button>
    <button class="leaf-tool-item" data-old="reloadAll"><span class="ico">⟳</span><span>Atualizar tudo</span></button>
    <div class="leaf-tool-sep"></div>
    <button class="leaf-tool-item" data-old="hunt"><span class="ico">◎</span><span>Hunt Analyzer</span></button>
    <div class="leaf-tool-sep"></div>
    <button class="leaf-tool-item" id="leafToolsThemeBtn"><span class="ico">🎨</span><span>Temas & Cores (14)</span></button>
    <button class="leaf-tool-item" data-old="statsBtn"><span class="ico">↗</span><span>Resumo da conta</span></button>
    <button class="leaf-tool-item" data-old="accounts"><span class="ico">○</span><span>Treinadores</span></button>
    <div class="leaf-tool-sep"></div>
    <button class="leaf-tool-item" data-old="autoSellBtn"><span class="ico">💰</span><span>Venda Automática</span><span class="leaf-tool-badge" id="leafAutoSellBadge">OFF</span></button>
    <button class="leaf-tool-item" data-old="autoSupplyBtn"><span class="ico">📦</span><span>Auto Supply</span><span class="leaf-tool-badge" id="leafAutoSupplyBadge">OFF</span></button>
    <button class="leaf-tool-item" data-old="dispatchHuntBtn"><span class="ico">🎯</span><span>Despachar Contas</span></button>
    <button class="leaf-tool-item" data-old="scriptsBtn"><span class="ico">🧩</span><span>Scripts & Extensões</span></button>
    <button class="leaf-tool-item" data-old="twitchBonusBtn" id="leafTwitchBonusBtn"><span class="ico">🟣</span><span>Bônus Twitch</span><span class="leaf-tool-badge" id="leafTwitchBonusBadge">OFF</span></button>`;
  document.body.appendChild(tools);
  tools.inert = true;

  const drawer = document.createElement('aside');
  drawer.id = 'leafSettingsDrawer';
  drawer.setAttribute('aria-label', 'Configurações');
  drawer.innerHTML = `<div class="leaf-drawer-head"><div><h2>Configurações</h2><div class="leaf-drawer-subtitle">Ajustes de interface, temas e execução.</div></div><button class="leaf-drawer-close" id="leafDrawerClose" aria-label="Fechar configurações">×</button></div>
    <div class="leaf-setting-section"><div class="leaf-setting-title">Temas & Aparência (14 Paletas)</div><div id="leafThemeSelectorContainer"></div></div>
    <div class="leaf-setting-section"><div class="leaf-setting-title">Interface</div><div class="leaf-setting-grid">
      <button class="leaf-setting-btn leaf-privacy-setting" id="leafHideNames" type="button" aria-pressed="false">Ocultar nomes das contas</button>
      <div class="leaf-game-hud-setting">
        <label for="leafGameHudLayout">HUD do jogo</label>
        <select id="leafGameHudLayout" aria-describedby="leafGameHudHint">
          <option value="original">Original (padrão)</option>
          <option value="labels">Barra com rótulos</option>
          <option value="icons">Ícones compactos</option>
        </select>
        <small id="leafGameHudHint" aria-live="polite"></small>
      </div>
      <div class="leaf-window-count-setting"><span>Janelas abertas</span><div class="leaf-window-count-options" id="leafWindowCountOptions" role="group" aria-label="Quantidade de janelas abertas">
        <button type="button" data-window-count="1" aria-pressed="false">1</button>
        <button type="button" data-window-count="2" aria-pressed="false">2</button>
        <button type="button" data-window-count="3" aria-pressed="false">3</button>
        <button type="button" data-window-count="4" aria-pressed="false">4</button>
      </div></div>
      <div class="leaf-layout-setting"><span>Disposição</span><div class="leaf-layout-options" role="group" aria-label="Disposição das janelas">
        <button type="button" data-layout-mode="grid" aria-pressed="false">Grade</button><button type="button" data-layout-mode="col" aria-pressed="false">Coluna</button><button type="button" data-layout-mode="row" aria-pressed="false">Linha</button>
      </div></div>
      <button class="leaf-setting-btn" data-old="propNat">Proporção original</button>
      <button class="leaf-setting-btn" data-old="dock">Menu do jogo</button>
      <button class="leaf-setting-btn" data-old="cleanHud">Interface limpa</button>
    </div></div>
    <div class="leaf-setting-section"><div class="leaf-setting-title">Execução</div><div class="leaf-setting-grid">
      <button class="leaf-setting-btn" data-old="muteAll">Som</button>
      <button class="leaf-setting-btn" data-old="awake">Suspensão</button>
      <button class="leaf-setting-btn" data-old="minTray">Minimizar</button>
      <button class="leaf-setting-btn" data-old="voltaHunt">Voltar para hunt</button>
    </div></div>
    <div class="leaf-setting-section"><div class="leaf-setting-title">Segurança e dados</div><div class="leaf-setting-grid">
      <button class="leaf-setting-btn" data-old="sellguard">Venda protegida</button>
      <button class="leaf-setting-btn" data-old="alerts">Alertas</button>
      <button class="leaf-setting-btn" data-old="bkExp">Exportar config</button>
      <button class="leaf-setting-btn" data-old="bkImp">Importar config</button>
    </div></div>
    <div class="leaf-setting-section"><div class="leaf-setting-title">Suporte</div><div class="leaf-setting-grid">
      <button class="leaf-setting-btn" data-old="manBtn">Manual</button>
      <button class="leaf-setting-btn" data-old="faqBtn">FAQ</button>
      <button class="leaf-setting-btn" data-old="errlogBtn">Relatório de erros</button>
      <button class="leaf-setting-btn" data-old="refBtn">Referral</button>
    </div></div>`;
  document.body.appendChild(drawer);
  drawer.inert = true;

  function syncSidebar() {
    const sidebar = $('#leafSidebar');
    const toggle = $('#leafSidebarToggle');
    const label = sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral';
    if (sidebarCollapsed && sidebar.contains(document.activeElement)) toggle.focus();
    document.body.classList.toggle('leaf-sidebar-collapsed', sidebarCollapsed);
    sidebar.inert = sidebarCollapsed;
    sidebar.setAttribute('aria-hidden', String(sidebarCollapsed));
    toggle.setAttribute('aria-expanded', String(!sidebarCollapsed));
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }
  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    try { localStorage.setItem('hubSidebarCollapsed', sidebarCollapsed ? '1' : '0'); } catch {}
    syncSidebar();
  }
  $('#leafSidebarToggle').onclick = toggleSidebar;
  syncSidebar();

  const gameHudSelect = $('#leafGameHudLayout');
  gameHudSelect.value = gameHudLayout;
  function syncGameHudHint() {
    const text = cleanOn ? 'Interface limpa oculta o menu. Desligue-a para ver o layout.'
      : dockHidden ? 'Menu oculto. Escolha um modo compacto para exibi-lo.'
      : 'Aplica na hora. Original restaura o menu.';
    RebosteioPerformance.setText($('#leafGameHudHint'), text + ' Zoom recomendado: 80% sem lateral; 70% com lateral.');
  }
  syncGameHudHint();
  document.addEventListener('rebosteio-game-hud-layout', event => { gameHudSelect.value = event.detail.mode; syncGameHudHint(); });
  gameHudSelect.onchange = async () => {
    gameHudSelect.disabled = true;
    try { await setGameHudLayout(gameHudSelect.value); }
    finally { gameHudSelect.disabled = false; }
  };

  if (window.PIWThemeManager && window.PIWThemeManager.mountSelector) {
    window.PIWThemeManager.mountSelector($('#leafThemeSelectorContainer', drawer));
  }

  const toolsTheme = $('#leafToolsThemeBtn');
  if (toolsTheme) {
    toolsTheme.onclick = () => {
      closeSurfaces();
      $('#leafSettingsBtn')?.click();
      $('#leafThemeSelectorContainer')?.scrollIntoView({ behavior: 'smooth' });
    };
  }

  // buttons proxy the mature application logic instead of duplicating it.
  $('#leafEco').onclick = () => clickOld('eco');
  $('#leafHuntOnly').onclick = () => clickOld('cleanHud');
  $('#leafMap').onclick = () => clickOld('statsBtn');
  $('#leafAlerts').onclick = () => clickOld('alerts');
  const triggerLoginAll = () => clickOld('loginAll');
  $('#leafLoginAll').onclick = triggerLoginAll;
  const topLoginBtn = $('#leafLoginAllTop');
  if (topLoginBtn) topLoginBtn.onclick = triggerLoginAll;
  const headerLoginBtn = $('#leafHeaderLoginAll');
  if (headerLoginBtn) headerLoginBtn.onclick = triggerLoginAll;
  $('#leafReloadAll').onclick = () => clickOld('reloadAll');
  const handleOpenAccounts = () => {
    if (typeof openAccounts === 'function') openAccounts();
    else clickOld('accounts');
  };
  $('#leafAccountsFooter').onclick = $('#leafAddAccount').onclick = handleOpenAccounts;
  function syncNameSetting() {
    const button = $('#leafHideNames');
    button.classList.toggle('is-on', namesHidden);
    button.setAttribute('aria-pressed', String(namesHidden));
    button.textContent = namesHidden ? 'Mostrar nomes das contas' : 'Ocultar nomes das contas';
  }
  syncNameSetting();
  $('#leafHideNames').onclick = () => {
    namesHidden = !namesHidden;
    try { localStorage.setItem(privacyKey, namesHidden ? '1' : '0'); } catch {}
    syncNameSetting();
    const arr = Array.from(states.values()).sort((a,b) => a.i - b.i);
    renderSidebar(arr);
    decoratePanels(arr);
    if (!$('#leafListView').hidden) renderList(arr);
    document.dispatchEvent(new CustomEvent('piw-account-names-visibility'));
  };
  $$('#leafSettingsDrawer [data-window-count]').forEach(button => button.onclick = () => {
    const oldButton = $(`#countRow [data-n="${button.dataset.windowCount}"]`);
    if (oldButton) oldButton.click();
    else if (typeof setCount === 'function') setCount(+button.dataset.windowCount);
    if (+button.dataset.windowCount > 1) document.dispatchEvent(new CustomEvent('piw-layout-mode', {detail:{mode:'grid'}}));
    syncWindowCount();
    syncLayoutMode();
    setTimeout(collectAll, 0);
  });
  function syncWindowCount() {
    const activeCount = typeof count === 'number' ? count : grid.children.length;
    $$('#leafSettingsDrawer [data-window-count]').forEach(button => {
      const selected = +button.dataset.windowCount === activeCount;
      button.classList.toggle('is-on', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  syncWindowCount();
  $$('#leafSettingsDrawer [data-layout-mode]').forEach(button => button.onclick = () => {
    document.dispatchEvent(new CustomEvent('piw-layout-mode', {detail:{mode:button.dataset.layoutMode}}));
    syncLayoutMode();
  });
  function syncLayoutMode() {
    const mode = grid.classList.contains('one-col') ? 'col' : grid.classList.contains('one-row') ? 'row' : 'grid';
    $$('#leafSettingsDrawer [data-layout-mode]').forEach(button => {
      const selected = button.dataset.layoutMode === mode;
      button.classList.toggle('is-on', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  syncLayoutMode();
  function closeSurfaces(returnFocus = false) {
    const wasTools = document.body.classList.contains('leaf-tools-open');
    const wasSettings = document.body.classList.contains('leaf-settings-open');
    document.body.classList.remove('leaf-tools-open', 'leaf-settings-open');
    tools.inert = true;
    drawer.inert = true;
    $('#leafToolsBtn').setAttribute('aria-expanded', 'false');
    $('#leafSettingsBtn').setAttribute('aria-expanded', 'false');
    if (returnFocus && wasTools) $('#leafToolsBtn').focus();
    else if (returnFocus && wasSettings) $('#leafSettingsBtn').focus();
  }
  function syncAutoSellBadge() {
    const badge = $('#leafAutoSellBadge');
    if (!badge) return;
    const isOn = oldOn('autoSellBtn') || (typeof autoSellLootOn !== 'undefined' && Boolean(autoSellLootOn));
    badge.textContent = isOn ? 'ON' : 'OFF';
    badge.classList.toggle('is-on', isOn);
  }
  function syncAutoSupplyBadge() {
    const badge = $('#leafAutoSupplyBadge');
    if (!badge) return;
    const isOn = oldOn('autoSupplyBtn') || (typeof autoSupplyOn !== 'undefined' && Boolean(autoSupplyOn));
    badge.textContent = isOn ? 'ON' : 'OFF';
    badge.classList.toggle('is-on', isOn);
  }
  function syncTwitchBonusBadge() {
    const badge = $('#leafTwitchBonusBadge');
    if (!badge) return;
    const st = window.__twitchBonusStatus;
    const isOn = st && st.masterEnabled;
    const bonusTxt = window.__twitchBonusPctTxt || '';
    if (!isOn) {
      badge.textContent = 'OFF';
      badge.classList.remove('is-on');
    } else {
      badge.textContent = bonusTxt || 'ON';
      badge.classList.add('is-on');
    }
  }
  window.__syncTwitchBonusBadge = syncTwitchBonusBadge;
  syncAutoSellBadge();
  syncAutoSupplyBadge();
  syncTwitchBonusBadge();

  $('#leafToolsBtn').onclick = (e) => {
    e.stopPropagation();
    const opening = !document.body.classList.contains('leaf-tools-open');
    closeSurfaces();
    if (opening) { document.body.classList.add('leaf-tools-open'); tools.inert = false; $('#leafToolsBtn').setAttribute('aria-expanded', 'true'); syncAutoSellBadge(); syncAutoSupplyBadge(); syncTwitchBonusBadge(); tools.querySelector('button')?.focus(); }
  };
  $('#leafSettingsBtn').onclick = () => {
    const opening = !document.body.classList.contains('leaf-settings-open');
    closeSurfaces();
    if (opening) { document.body.classList.add('leaf-settings-open'); drawer.inert = false; $('#leafSettingsBtn').setAttribute('aria-expanded', 'true'); $('#leafDrawerClose').focus(); }
  };
  $('#leafMoreBtn').onclick = () => $('#leafSettingsBtn').click();
  $('#leafDrawerClose').onclick = () => closeSurfaces(true);
  $$('#leafToolsMenu [data-old],#leafSettingsDrawer [data-old]').forEach(b => b.onclick = () => { clickOld(b.dataset.old); closeSurfaces(); syncAutoSellBadge(); syncAutoSupplyBadge(); syncTwitchBonusBadge(); });
  document.addEventListener('click', e => { if (!tools.contains(e.target) && e.target !== $('#leafToolsBtn') && document.body.classList.contains('leaf-tools-open')) closeSurfaces(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSurfaces(true); });

  const lsPick = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsPut = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
  let lastPlainView = lsPick('leafViewLast') === 'list' ? 'list' : 'windows';
  let currentView = 'windows';
  // Simples é uma vista, então o estado real é cardsOn (index.html), não só a classe do botão.
  const simpleIsOn = () => oldOn('cardsBtn') || (typeof cardsOn !== 'undefined' && !!cardsOn);

  function paintTabs(view) {
    currentView = view;
    $$('#leafViewTabs button').forEach(b => { const selected = b.dataset.view === view; b.classList.toggle('is-active', selected); b.setAttribute('aria-pressed', String(selected)); });
    $('#leafWindowView').hidden = view === 'list';
    $('#leafListView').hidden = view !== 'list';
  }

  function setView(view, animate = false) {
    const plain = view === 'windows' || view === 'list';
    // Grupo exclusivo Janelas/Lista/Simples: entrar no Simples liga o cardsOn (o index força o Eco),
    // sair dele (para qualquer vista normal) desliga o cardsOn e mantém o Eco como estava.
    if (view === 'simple') { if (!simpleIsOn()) clickOld('cardsBtn'); }
    else if (simpleIsOn()) clickOld('cardsBtn');
    const wasVisible = !$('#leafListView').hidden;
    paintTabs(view);
    if (plain && view !== lastPlainView) { lastPlainView = view; lsPut('leafViewLast', view); }
    lsPut('leafView', view);
    document.dispatchEvent(new CustomEvent('piw-view-changed', { detail: { view } }));
    if (view === 'list') {
      renderList();
      if (!wasVisible && animate && !matchMedia('(prefers-reduced-motion: reduce)').matches)
        $('#leafListView').animate([{opacity:.78,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:170,easing:'cubic-bezier(.16,1,.3,1)'});
    }
  }
  $$('#leafViewTabs button').forEach(b => b.onclick = e => setView(b.dataset.view, e.detail !== 0));
  // index.html (clique em linha dos cards) usa isto pra abrir a vista Janelas ao expandir um painel.
  window.PIWView = { set: (view) => setView(view), current: () => currentView };

  const states = new Map();
  function baseState(i) {
    const hasCreds = Boolean(typeof accounts !== 'undefined' && accounts[i] && accounts[i].email && accounts[i].senha);
    const n = (typeof accounts !== 'undefined' && accounts[i] && accounts[i].name) || (typeof stName === 'function' ? stName(i) : `Conta ${i+1}`);
    return { i, name:n, st:(!hasCreds || (typeof off !== 'undefined' && off[i])) ? 'off' : 'wait', level:0, balls:0, gold:0, hunt:'', a:{}, team:[] };
  }
  function stateStatus(r) {
    const hasCreds = Boolean(typeof accounts !== 'undefined' && accounts[r?.i] && accounts[r.i].email && accounts[r.i].senha);
    if (!hasCreds || (typeof off !== 'undefined' && off[r?.i])) return ['off','Desligada'];
    if (!r || !r.ok || !r.live) {
      const dot = grid.children[r?.i]?.querySelector('.panel-header .dot');
      return dot?.classList.contains('err') ? ['err','Erro'] : ['wait','Conectando'];
    }
    return ['live','Online'];
  }
  function attention(r) {
    if (!r || !r.ok) return false;
    const bInf = Boolean((r.equippedBall && r.equippedBall.infinite) || (+r.balls >= 999999));
    if (!bInf && (+r.balls || 0) < 100) return true;
    const lead=getLead(r);
    return !!(lead && lead.hm > 0 && lead.hp <= 0);
  }
  async function collectOne(i) {
    let d = null;
    try {
      const pc = (typeof stCache !== 'undefined' ? stCache[i] : null) || (window.stCache ? window.stCache[i] : null);
      if (pc && pc.d && pc.d.ok && pc.d.live && (pc.d.team && pc.d.team.length > 0) && Date.now() - pc.t < 15000) {
        d = pc.d;
      } else if (typeof webviews !== 'undefined' && webviews[i] && !(typeof off !== 'undefined' && off[i])) {
        if (typeof readPanelState === 'function') {
          d = await readPanelState(i);
        } else {
          const rs = (typeof READ_STATE !== 'undefined' ? READ_STATE : null) || window.READ_STATE;
          if (rs) d = await webviews[i].executeJavaScript(rs);
        }
        if (d && d.ok) {
          const s = (typeof stSane === 'function' ? stSane(d) : null) || (window.stSane ? window.stSane(d) : null) || d;
          if (typeof stCache !== 'undefined') stCache[i] = { t: Date.now(), d: s };
          if (window.stCache) window.stCache[i] = { t: Date.now(), d: s };
          d = s;
        } else if (pc && pc.d && pc.d.ok) {
          d = pc.d;
        }
      } else if (pc && pc.d && pc.d.ok) {
        d = pc.d;
      }
    } catch {}
    if (!d || !d.ok) d = baseState(i); else d.i = i;
    if (d.name && typeof tabNames !== 'undefined') tabNames[i] = d.name;
    states.set(i,d);
    return d;
  }
  let collecting = false;
  async function collectAll() {
    if (collecting || document.hidden) return;
    collecting = true;
    try {
    const n = typeof count !== 'undefined' ? count : (typeof webviews !== 'undefined' ? webviews.length : 0);
    const arr = [];
    for (let i=0;i<n;i++) arr.push(await collectOne(i));
    if (typeof janelaOculta === 'undefined' || !janelaOculta) renderAll(arr);
    } finally { collecting = false; }
  }

  function renderAll(arr) {
    const online = arr.filter(x => x && x.ok).length;
    let balls = 0, inf = false, att = 0;
    arr.forEach(x => {
      const bInf = Boolean((x.equippedBall && x.equippedBall.infinite) || (+x.balls >= 999999));
      if (bInf) inf = true;
      else balls += +x.balls || 0;
      if (attention(x)) att++;
    });
    RebosteioPerformance.setText($('#leafKpiOnline'), `${online}/${arr.length || 0}`);
    RebosteioPerformance.setText($('#leafKpiBalls'), (inf && balls === 0) ? '∞' : (inf ? `${fmtCompact(balls)}+∞` : fmtCompact(balls)));
    RebosteioPerformance.setText($('#leafKpiAttention'), att);
    $('#leafKpiAttention').classList.toggle('warn',att>0);
    RebosteioPerformance.setText($('#leafConnectedText'), `${online}/${arr.length || 0} conectadas`);
    RebosteioPerformance.setText($('#leafListCount'), `${arr.length} conta${arr.length===1?'':'s'}`);
    renderSidebar(arr);
    decoratePanels(arr);
    if (!$('#leafListView').hidden) renderList(arr);
    syncToggles();
    syncWindowCount();
    syncLayoutMode();
  }

  let sidebarMarkup = '';
  // Reconcile the small account subtree so timed metrics do not recreate sprites,
  // buttons and their DOM every telemetry tick.
  function patchAccountNode(current, next) {
    if (!current || !next || current.nodeType !== next.nodeType || current.nodeName !== next.nodeName || (current.className || '') !== (next.className || '')) {
      current?.replaceWith(next.cloneNode(true)); return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      return;
    }
    if (current.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of Array.from(current.attributes)) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
    for (const attr of Array.from(next.attributes)) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
    const oldChildren = Array.from(current.childNodes), newChildren = Array.from(next.childNodes);
    for (let i = 0; i < newChildren.length; i++) {
      if (!oldChildren[i]) current.appendChild(newChildren[i].cloneNode(true));
      else patchAccountNode(oldChildren[i], newChildren[i]);
    }
    for (let i = newChildren.length; i < oldChildren.length; i++) oldChildren[i].remove();
  }
  function renderSidebar(arr) {
    const root = $('#leafAccountList');
    const filteredArr = arr.filter(r => r.i >= 0 && r.i < 4);
    const markup = filteredArr.map(r => {
        const dividerMarkup = '';
        const [sc,sl] = stateStatus(r); const a = r.a || {}; const lead=getLead(r); const spr=pokeSprite(lead); const hunt=prettyHunt(r.hunt)||'Aguardando dados da caça';
        const selected = !!grid.children[r.i]?.classList.contains('expanded');
        return `${dividerMarkup}<article class="leaf-account state-${sc} ${r.ok?'is-live':''} ${attention(r)?'is-attention':''} ${selected?'is-selected':''}" data-i="${r.i}">
          <div class="leaf-account-top">
            <span class="leaf-account-number">${String(r.i+1).padStart(2,'0')}</span>
            <div class="leaf-poke-avatar">${spr?`<img src="${spr}" width="42" height="42" alt="" onerror="this.remove()">`:ico('user')}</div>
            <div class="leaf-account-identity"><div class="leaf-account-name">${escH(displayName(r))}</div><div class="leaf-pokemon-line">${lead?`Nv ${escH(lead.level||'—')} <span>·</span> <b>${escH(lead.name||'Sem líder')}</b>`:'Time ainda não carregado'}</div></div>
            ${r.level?`<span class="leaf-lv">NV ${escH(r.level)}</span>`:''}
            <div class="leaf-account-state ${sc}">${sl}</div>
          </div>
          <div class="leaf-hunt-row"><span class="leaf-hunt-glyph">${ico('hunt')}</span><span class="leaf-hunt-name">Em caça <b>${escH(hunt)}</b></span><span class="leaf-hunt-time">${a.seconds?Math.floor(a.seconds/3600)+'h '+String(Math.floor(a.seconds%3600/60)).padStart(2,'0')+'m':'—'}</span></div>
          <div class="leaf-account-metrics">
            <div class="leaf-metric" title="${(r.equippedBall && r.equippedBall.name) ? `${escH(r.equippedBall.name)}: ${((r.equippedBall && r.equippedBall.infinite) || (+r.balls >= 999999)) ? '∞' : fmtCompact(r.balls)}` : `Bolas: ${((r.equippedBall && r.equippedBall.infinite) || (+r.balls >= 999999)) ? '∞' : fmtCompact(r.balls)}`}"><div class="mk">Bolas</div><div class="mv">${((r.equippedBall && r.equippedBall.infinite) || (+r.balls >= 999999)) ? '∞' : fmtCompact(r.balls)}</div></div>
            <div class="leaf-metric" title="Shiny"><div class="mk">Shiny</div><div class="mv">${a.shinyFound!=null?fmtCompact(a.shinyFound):'—'}</div></div>
            <div class="leaf-metric" title="EXP"><div class="mk">EXP</div><div class="mv">${a.xpg!=null?fmtCompact(a.xpg):'—'}</div></div>
            <div class="leaf-metric" title="Kills/h"><div class="mk">Kills/h</div><div class="mv">${a.kph!=null?fmtCompact(a.kph):'—'}</div></div>
          </div>
          <div class="leaf-account-actions"><button class="leaf-open-account" data-open="${r.i}" aria-pressed="${selected}"><span aria-hidden="true">${selected?'▦':'▶'}</span>${selected?'Voltar à grade':'Abrir janela'}</button><button class="leaf-reload-account" data-reload="${r.i}" title="Recarregar ${escH(displayName(r))}" aria-label="Recarregar ${escH(displayName(r))}">${ico('reload')}<span class="leaf-reload-label">Recarregar</span></button></div>
          <div class="leaf-account-footnote"><span>${a.gph!=null?'Gold/h '+fmtCompact(a.gph):'Aguardando rendimento'}</span><span>${a.xph!=null?'XP/h '+fmtCompact(a.xph):'Sessão em andamento'}</span></div>
        </article>`;
      }).join('');

    if (markup === sidebarMarkup) return;
    sidebarMarkup = markup;
    const next = document.createElement('template'); next.innerHTML = markup;
    const previous = Array.from(root.children), incoming = Array.from(next.content.children);
    const oldStates = previous.map(card => card.querySelector?.('.leaf-account-state')?.className || '');
    incoming.forEach((card, i) => {
      if (previous[i]) patchAccountNode(previous[i], card);
      else root.appendChild(card);
    });
    previous.slice(incoming.length).forEach(card => card.remove());
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Array.from(root.children).forEach((card,i) => {
        const status = card.querySelector?.('.leaf-account-state');
        if (oldStates[i] && status && oldStates[i] !== status.className)
          status.animate([{opacity:.45,transform:'translateY(2px)'},{opacity:1,transform:'translateY(0)'}],{duration:190,easing:'cubic-bezier(.16,1,.3,1)'});
      });
    }
  }
  $('#leafAccountList').addEventListener('click', e => {
    const open = e.target.closest('[data-open]');
    if (open) {
      const i=+open.dataset.open; setView('windows');
      try { toggleExpand(i); renderSidebar(Array.from(states.values()).sort((a,b)=>a.i-b.i)); } catch {}
      return;
    }
    const reload = e.target.closest('[data-reload]');
    if (reload) {
      const p=grid.children[+reload.dataset.reload];
      try { p?.querySelector('.reload')?.click(); } catch {}
    }
  });

  let listMarkup = '';
  function renderList(arr) {
    arr = arr || Array.from(states.values()).sort((a,b)=>a.i-b.i);
    const markup = arr.map(r => {
      const a=r.a||{}, lead=getLead(r), spr=pokeSprite(lead);
      return `<article class="leaf-list-card" data-i="${r.i}">
        <div class="leaf-list-identity"><span class="leaf-list-index">${String(r.i+1).padStart(2,'0')}</span><div class="avatar">${spr?`<img src="${spr}" width="48" height="48" alt="" loading="lazy" onerror="this.remove()">`:ico('user')}</div>
          <div class="leaf-list-person"><div class="name">${escH(displayName(r))}</div><div class="sub">${stateStatus(r)[1]}${r.level?' · Nv '+escH(r.level):''}${lead?' · '+escH(lead.name):''}</div></div><span class="leaf-list-state ${stateStatus(r)[0]}">${stateStatus(r)[1]}</span></div>
        <div class="leaf-list-hunt"><span>Caça atual</span><b>${escH(prettyHunt(r.hunt)||'Aguardando dados')}</b></div>
        <div class="leaf-list-stats"><div class="leaf-list-cell" title="${(r.equippedBall && r.equippedBall.name) ? `${escH(r.equippedBall.name)}: ${((r.equippedBall && r.equippedBall.infinite) || (+r.balls >= 999999)) ? '∞' : fmtCompact(r.balls)}` : `Bolas: ${((r.equippedBall && r.equippedBall.infinite) || (+r.balls >= 999999)) ? '∞' : fmtCompact(r.balls)}`}"><div class="label">Bolas</div><div class="value">${((r.equippedBall && r.equippedBall.infinite) || (+r.balls >= 999999)) ? '∞' : fmtCompact(r.balls)}</div></div>
          <div class="leaf-list-cell"><div class="label">Shiny</div><div class="value">${a.shinyFound!=null?fmtCompact(a.shinyFound):'—'}</div></div>
          <div class="leaf-list-cell"><div class="label">EXP</div><div class="value">${a.xpg!=null?fmtCompact(a.xpg):'—'}</div></div>
          <div class="leaf-list-cell"><div class="label">Kills/h</div><div class="value">${a.kph!=null?fmtCompact(a.kph):'—'}</div></div></div>
        <div class="leaf-list-actions"><span>${a.gph!=null?'Gold/h '+fmtCompact(a.gph):'Sem rendimento registrado'}</span><button class="leaf-list-open" data-list-open="${r.i}">Abrir janela</button></div>
      </article>`;
    }).join('');
    if (markup === listMarkup) return;
    listMarkup = markup;
    $('#leafListRows').innerHTML = markup;
    $$('[data-list-open]').forEach(b => b.onclick=()=>{const i=+b.dataset.listOpen;setView('windows');try{if(!grid.children[i]?.classList.contains('expanded'))toggleExpand(i);renderSidebar(Array.from(states.values()).sort((a,b)=>a.i-b.i))}catch{}});
  }

  function decoratePanels(arr) {
    $$('.panel',grid).forEach((p,i) => {
      const h=$('.panel-header',p); if(h) h.dataset.index=String(i+1).padStart(2,'0');
      const name = $('.panel-header .name',p);
      if (name && !name.querySelector('input')) {
        const label = namesHidden ? accountLabel(i) : ((typeof accounts !== 'undefined' && accounts[i]?.name) || (typeof defName === 'function' ? defName(i) : `Conta ${i+1}`));
        if (name.textContent !== label) name.textContent = label;
      }
      const reload = $('.panel-header .reload',p), expand = $('.panel-header .expand',p);
      if (reload) reload.setAttribute('aria-label',`Recarregar conta ${i+1}`);
      if (expand) expand.setAttribute('aria-label',p.classList.contains('expanded')?`Voltar conta ${i+1} à grade`:`Expandir conta ${i+1}`);
      let f=$('.leaf-panel-footer',p); if(!f){ f=document.createElement('div');f.className='leaf-panel-footer';p.appendChild(f); }
      const r=arr.find(x=>x.i===i)||baseState(i); const lead=getLead(r); const spr=pokeSprite(lead);
      if (f.__leafSprite !== spr) {
        f.innerHTML = `${spr?`<img class="pf-sprite" src="${spr}" width="25" height="25" alt="" onerror="this.remove()">`:'<span class="pf-orbit" aria-hidden="true">◎</span>'}<span class="pf-hunt"><small>CAÇA ATUAL</small><b></b></span><span class="pf-spacer"></span><span class="pf-balls"><small>BOLAS</small><b></b></span>`;
        f.__leafSprite = spr;
      }
      const huntText = prettyHunt(r.hunt)||'Aguardando dados';
      const bInf = Boolean((r.equippedBall && r.equippedBall.infinite) || (+r.balls >= 999999));
      const ballsText = bInf ? '∞' : fmtCompact(r.balls);
      const huntEl = $('.pf-hunt b',f), ballsEl = $('.pf-balls b',f);
      if (huntEl && huntEl.textContent !== huntText) huntEl.textContent = huntText;
      if (ballsEl && ballsEl.textContent !== ballsText) ballsEl.textContent = ballsText;
    });
    try{const value=String(arr.length||1);if(grid.style.getPropertyValue('--leaf-panels')!==value)grid.style.setProperty('--leaf-panels',value);}catch{}
  }

  function syncToggles(){
    syncGameHudHint();
    const pairs=[['leafEco','eco'],['leafHuntOnly','cleanHud'],['leafSimple','cardsBtn'],['leafAlerts','alerts']];
    pairs.forEach(([a,b])=>{const x=$('#'+a);if(x){const active=oldOn(b);x.classList.toggle('is-active',active);RebosteioPerformance.setAttribute(x,'aria-pressed',active);}});
    const stats = document.body.classList.contains('stats-open'); $('#leafMap')?.classList.toggle('is-active',stats); RebosteioPerformance.setAttribute($('#leafMap'),'aria-pressed',stats);
    $$('#leafSettingsDrawer [data-old]').forEach(b=>b.classList.toggle('is-on',oldOn(b.dataset.old)));
    // Vista exclusiva: mudanças de cardsOn fora do setView (atalho, clique na linha, Caça) repintam as abas.
    const simpleOn = simpleIsOn();
    if (simpleOn && currentView !== 'simple') setView('simple');
    else if (!simpleOn && currentView === 'simple') setView(lastPlainView);
    // Com o Simples ativo o Eco é obrigatório, então o chip não pode ser desligado.
    const ecoChip = $('#leafEco');
    if (ecoChip) {
      RebosteioPerformance.setAttribute(ecoChip, 'aria-disabled', String(simpleOn));
      ecoChip.title = simpleOn ? 'O Simples mantém o Modo Eco ligado. Desligue o Simples para alterar.' : '';
    }
  }

  const av = document.getElementById('appVer'); if(av) $('#leafVersion').textContent='PokeGrid '+av.textContent;
  const obs = new MutationObserver(()=>syncToggles()); obs.observe(document.body,{attributes:true,attributeFilter:['class'],subtree:false});
  ['eco','cleanHud','dock','cardsBtn','alerts','statsBtn'].forEach(id=>{const e=document.getElementById(id);if(e)new MutationObserver(syncToggles).observe(e,{attributes:true,attributeFilter:['class']});});

  // Original build/setCount can add/remove panels later. Decorate new panels and refresh immediately.
  let gridRefresh = 0;
  const gridObs = new MutationObserver(() => { clearTimeout(gridRefresh); gridRefresh = setTimeout(collectAll, 100); });
  gridObs.observe(grid,{childList:true});
  grid.addEventListener('click', e => { if (e.target.closest('.expand')) renderSidebar(Array.from(states.values()).sort((a,b)=>a.i-b.i)); });
  setTimeout(collectAll,250);
  setInterval(collectAll,3500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) collectAll(); });
  document.addEventListener('piw-account-removed', (e) => {
    const idx = e.detail?.index;
    if (typeof idx === 'number' && states.has(idx)) {
      states.set(idx, baseState(idx));
      const arr = Array.from(states.values()).sort((a,b) => a.i - b.i);
      renderSidebar(arr);
      decoratePanels(arr);
      if (!$('#leafListView').hidden) renderList(arr);
    }
  });
  document.addEventListener('piw-window-count-changed', () => {
    for (const i of states.keys()) if (i >= count) states.delete(i);
    syncWindowCount();
    collectAll();
  });
  window.pokeAPI?.onJanela?.(visible => { if (visible) collectAll(); });
  if (window.PIWThemeManager) {
    window.PIWThemeManager.setTheme(window.PIWThemeManager.getCurrentTheme().id, false);
  }
  // Restaura a vista persistida (Janelas/Lista/Simples). O cardsOn do index é a fonte de verdade
  // do Simples; se ele estiver ligado a vista é Simples, senão vale a última vista normal salva.
  const wantSimple = simpleIsOn();
  if (wantSimple && !oldOn('cardsBtn') && typeof applyCards === 'function') { try { applyCards(); } catch { } }
  setView(wantSimple ? 'simple' : (lsPick('leafView') === 'list' ? 'list' : 'windows'));
})();
