(() => {
  'use strict';

  const STORAGE_KEY = 'piw_theme';
  const POKEMON_LOCK_KEY = 'piw_pokemon_lock';
  const HEADER_ART = {
    'kuromi-xp': true,
    'kuromi-xp-light': true,
    'pkmn-corsola': true,
    'pkmn-alakazam': true,
    'pkmn-espeon': '<path d="M8 11C4 10 3 7 4 4c4 0 6 2 7 5M21 11c4-1 5-4 4-7-4 0-6 2-7 5"/><ellipse cx="14.5" cy="15" rx="5" ry="7"/><path d="M13 11l-1 3m8 8c3 2 5 1 6-1M9 22c-3 2-5 1-6-1"/>',
    'pkmn-umbreon': '<path d="M6 11L3 3l7 4M21 11l5-8-8 4"/><path d="M6 11c-3 9 1 14 8 14s12-5 8-14"/><ellipse cx="14" cy="10" rx="2.5" ry="4"/><path d="M8 17l3 1m9-1-3 1"/>',
    'pkmn-arcanine': '<path d="M15 2c2 6-2 7 0 11 2-1 4-4 4-7 6 7 7 12 3 17-4 5-13 4-16-2-3-6 1-10 4-13-1 5 1 7 3 7 3-4 0-7 2-13Z"/><path d="M14 17c-4 4-4 7 0 9 5-2 5-5 2-8"/>',
    'pkmn-meganium': '<path d="M14 13c-9-1-11-7-7-9 4-2 7 3 7 9 1-8 7-11 10-7 2 4-3 7-10 7 9 1 12 7 8 10-4 2-7-3-8-10-1 9-7 12-10 8-2-4 3-7 10-8Z"/><circle cx="14" cy="13" r="3"/><path d="M14 17v10m0-3c3-5 6-5 8-4-2 4-5 5-8 4"/>',
    'pkmn-banette': '<path d="M6 10L4 4l8 4 6-5 2 6 5 3-2 10-8 4-10-6Z"/><path d="M8 13l4 2m8-2-4 2M8 20h12m-10-2v4m3-4v4m3-4v4m3-4v4"/><path d="M21 20l3 3-2 3-3-3Z"/>',
    'pkmn-gengar': '<path d="M5 12L3 4l8 4 3-5 3 5 8-4-2 8c7 14-24 18-18 0Z"/><path d="M7 13l5 3m9-3-5 3M7 19c4 6 11 6 15-1-5 2-10 3-15 1Zm4 2v3m4-3v3m4-4v3"/>',
    'pkmn-mewtwo': '<path d="M8 11L6 4l5 3h6l5-3-2 7c6 8-2 13-6 13S2 19 8 11Z"/><path d="M8 15l4 2m8-2-4 2M11 22c-7 1-8-5-7-8m16 8c7 0 8-8 3-10"/>',
    'pkmn-flareon': true,
    'pkmn-mimikyu': true
  };
  function getLockedPokemonId() {
    try { return localStorage.getItem(POKEMON_LOCK_KEY) || ''; } catch { return ''; }
  }
  function setPokemonLocked(locked) {
    const id = locked ? (document.body.dataset.pokemon || getSavedThemeId()) : '';
    try { localStorage.setItem(POKEMON_LOCK_KEY, id); } catch {}
    return selectTheme(getSavedThemeId());
  }

  // 12 Temas Padrão de Estilo
  const STANDARD_THEMES = [
    {
      id: 'absol-night',
      name: 'Absol Midnight',
      tone: 'dark',
      toneLabel: 'Padrão',
      category: 'standard',
      glyph: '☾',
      brandTitle: 'ABSOL <span>LAUNCHER</span>',
      brandSub: 'MUITAS JORNADAS. UM MESMO CÉU.',
      quote: 'Mesmo nas noites mais escuras,<br>há um propósito.',
      pokemon: 'Absol (Original Padrão)',
      swatches: ['#081224', '#13253d', '#9fc3ef'],
      assets: {
        panorama: 'src/ui/assets/absol-panorama.png',
        cutout: 'src/ui/assets/absol-cutout.png'
      }
    },
    {
      id: 'creme-vanilla',
      name: 'Creme Baunilha',
      tone: 'light',
      toneLabel: 'Claro',
      category: 'standard',
      pokemon: 'Eevee, Togepi, Snorlax',
      swatches: ['#f5eedf', '#e2d5bd', '#b46927'],
      assets: {
        panorama: 'src/ui/themes/pokemon/eevee/panorama.jpg',
        cutout: 'src/ui/themes/pokemon/eevee/cutout.png'
      }
    },
    {
      id: 'pure-white',
      name: 'Branco Puro',
      tone: 'light',
      toneLabel: 'Claro',
      category: 'standard',
      pokemon: 'Arceus, Reshiram, Togekiss',
      swatches: ['#f6f8fb', '#edf2f7', '#2563eb']
    },
    {
      id: 'frost-ice',
      name: 'Branco Gelo',
      tone: 'light',
      toneLabel: 'Claro',
      category: 'standard',
      pokemon: 'Articuno, Glaceon, Vulpix-A',
      swatches: ['#e6f1f8', '#d8eaf5', '#0284c7']
    },
    {
      id: 'matcha-garden',
      name: 'Chá Verde',
      tone: 'mid',
      toneLabel: 'Interm.',
      category: 'standard',
      pokemon: 'Celebi, Bulbasaur, Leafeon',
      swatches: ['#17261d', '#284233', '#6ee7b7']
    },
    {
      id: 'slate-steel',
      name: 'Cinza Ardósia',
      tone: 'mid',
      toneLabel: 'Interm.',
      category: 'standard',
      pokemon: 'Lucario, Scizor, Metagross',
      swatches: ['#1a2027', '#2c3542', '#60a5fa']
    },
    {
      id: 'desert-amber',
      name: 'Âmbar Crepúsculo',
      tone: 'mid',
      toneLabel: 'Interm.',
      category: 'standard',
      pokemon: 'Dragonite, Arcanine, Flygon',
      swatches: ['#221914', '#3b2c23', '#f59e0b']
    },
    {
      id: 'deep-marine',
      name: 'Oceano Profundo',
      tone: 'mid',
      toneLabel: 'Interm.',
      category: 'standard',
      pokemon: 'Kyogre, Blastoise, Vaporeon',
      swatches: ['#0a1c2e', '#163352', '#38bdf8']
    },
    {
      id: 'lavender-ghost',
      name: 'Névoa Lavanda',
      tone: 'mid',
      toneLabel: 'Interm.',
      category: 'standard',
      pokemon: 'Mewtwo, Espeon, Chandelure',
      swatches: ['#1a1325', '#302344', '#c084fc']
    },
    {
      id: 'crimson-ember',
      name: 'Bruma Carmim',
      tone: 'dark',
      toneLabel: 'Escuro',
      category: 'standard',
      pokemon: 'Charizard, Groudon, Yveltal',
      swatches: ['#1a0c10', '#32181f', '#fb7185']
    },
    {
      id: 'emerald-dragon',
      name: 'Floresta Esmeralda',
      tone: 'dark',
      toneLabel: 'Escuro',
      category: 'standard',
      pokemon: 'Rayquaza, Tyranitar, Sceptile',
      swatches: ['#0b1a13', '#163225', '#34d399']
    },
    {
      id: 'onyx-eclipse',
      name: 'Eclipse Ônix',
      tone: 'dark',
      toneLabel: 'Escuro',
      category: 'standard',
      pokemon: 'Umbreon, Darkrai, Giratina',
      swatches: ['#09090c', '#1a1a21', '#fbbf24']
    },
    // Temas webcore Kuromi XP: estilos em src/ui/kuromi-xp.css (+ cursor nos painéis via kuromi-xp.js)
    {
      id: 'kuromi-xp',
      name: 'Kuromi XP Noite',
      tone: 'dark',
      toneLabel: 'Webcore',
      category: 'standard',
      glyph: '☠',
      brandTitle: 'KUROMI <span>XP</span>',
      brandSub: '｡･:*:･ﾟ★ WEBCORE ★･ﾟ:*:･｡',
      quote: '☆ bem-vinde ao meu<br>cantinho sombrio ☆',
      pokemon: 'Kuromi · Win XP · modo escuro',
      sideKicker: '☠ KUROMI.EXE ☠',
      sideQuote: 'fofa, sombria\ne sempre online ♡',
      footerQuote: '｡･:*:･ﾟ★ FEITO COM ♡ E PIXELS ★･ﾟ:*:･｡',
      swatches: ['#150c1f', '#6d44a0', '#ff8fd2'],
      assets: {
        cutout: 'src/ui/assets/kuromi-xp/kuromi.gif'
      }
    },
    {
      id: 'kuromi-xp-light',
      name: 'Kuromi XP Dia',
      tone: 'light',
      toneLabel: 'Webcore',
      category: 'standard',
      glyph: '♡',
      brandTitle: 'KUROMI <span>XP</span>',
      brandSub: '｡･:*:･ﾟ☆ WEBCORE ☆･ﾟ:*:･｡',
      quote: '♡ bem-vinde ao meu<br>cantinho fofinho ♡',
      pokemon: 'Kuromi · Win XP · modo claro',
      sideKicker: '♡ KUROMI.EXE ♡',
      sideQuote: 'fofa de dia,\nsombria de noite ☆',
      footerQuote: '｡･:*:･ﾟ☆ FEITO COM ♡ E PIXELS ☆･ﾟ:*:･｡',
      swatches: ['#f3e6fb', '#b48ae0', '#ff7ac8'],
      assets: {
        cutout: 'src/ui/assets/kuromi-xp/kuromi.gif'
      }
    }
  ];

  // Carrega os 802 Pokémon disponíveis do jogo
  function getAllThemes() {
    const pkmnList = Array.isArray(window.PIW_ALL_POKEMON_THEMES) ? window.PIW_ALL_POKEMON_THEMES : [];
    return [...STANDARD_THEMES, ...pkmnList];
  }

  function getSavedThemeId() {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'absol-night';
    } catch {
      return 'absol-night';
    }
  }

  function getTheme(id) {
    const all = getAllThemes();
    return all.find(t => t.id === id) || all.find(t => t.id === 'absol-night') || all[0];
  }

  let selectionGeneration = 0;
  async function selectTheme(id) {
    const generation = ++selectionGeneration;
    const theme = getTheme(id);
    if (theme.exclusive) {
      try {
        await Promise.all(Object.values(theme.assets).map(src => new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = reject;
          img.src = src;
        })));
      } catch {
        if (generation === selectionGeneration) return applyTheme('absol-night');
        return;
      }
    }
    if (generation === selectionGeneration) return applyTheme(id);
  }

  function applyTheme(id, notify = true) {
    const palette = getTheme(id);
    const character = getTheme(getLockedPokemonId() || id);
    const theme = { ...character, id: palette.id, tone: palette.tone, colors: palette.colors,
      assets: { ...character.assets, panorama: palette.assets?.panorama } };
    const root = document.documentElement;
    const body = document.body;

    if (root) {
      root.dataset.theme = theme.id;
      root.dataset.themeTone = theme.tone;

      // Injeta variáveis de cores customizadas se o tema trouxer palette
      if (theme.colors) {
        const c = theme.colors;
        if (c.bgBase) root.style.setProperty('--color-bg-base', c.bgBase);
        if (c.bgElevated) root.style.setProperty('--color-bg-elevated', c.bgElevated);
        if (c.surface1) root.style.setProperty('--color-surface-1', c.surface1);
        if (c.surface2) root.style.setProperty('--color-surface-2', c.surface2);
        if (c.surfaceHover) root.style.setProperty('--color-surface-hover', c.surfaceHover);
        if (c.surfaceSelected) root.style.setProperty('--color-surface-selected', c.surfaceSelected);
        if (c.textPrimary) root.style.setProperty('--color-text-primary', c.textPrimary);
        if (c.textSecondary) root.style.setProperty('--color-text-secondary', c.textSecondary);
        if (c.textMuted) root.style.setProperty('--color-text-muted', c.textMuted);
        if (c.accent) root.style.setProperty('--color-accent', c.accent);
        if (c.accentSoft) root.style.setProperty('--color-accent-soft', c.accentSoft);
        if (c.actionPrimary) root.style.setProperty('--color-action-primary', c.actionPrimary);
        if (c.actionPrimaryHover) root.style.setProperty('--color-action-primary-hover', c.actionPrimaryHover);
        if (c.borderSubtle) root.style.setProperty('--border-subtle', c.borderSubtle);
        if (c.borderStrong) root.style.setProperty('--border-strong', c.borderStrong);
      } else {
        // Remove overrides para temas padrão com regras próprias em CSS
        [
          '--color-bg-base', '--color-bg-elevated', '--color-surface-1', '--color-surface-2',
          '--color-surface-hover', '--color-surface-selected', '--color-text-primary',
          '--color-text-secondary', '--color-text-muted', '--color-accent', '--color-accent-soft',
          '--color-action-primary', '--color-action-primary-hover', '--border-subtle', '--border-strong'
        ].forEach(k => root.style.removeProperty(k));
      }

      // Panorama e Cutout dinâmicos por Pokémon
      if (theme.assets && theme.assets.panorama) {
        root.style.setProperty('--theme-panorama-url', `url('${new URL(theme.assets.panorama, document.baseURI).href}')`);
      } else {
        root.style.removeProperty('--theme-panorama-url');
      }

      if (theme.assets && theme.assets.cutout) {
        root.style.setProperty('--theme-cutout-url', `url('${new URL(theme.assets.cutout, document.baseURI).href}')`);
      } else {
        root.style.removeProperty('--theme-cutout-url');
      }
    }

    if (body) {
      body.dataset.theme = theme.id;
      body.dataset.pokemon = character.id;
      body.dataset.themeTone = theme.tone;
    }

    // Atualiza marca, glifos e provérbio do header
    const brandTitle = document.querySelector('.leaf-brand-title');
    if (brandTitle && !brandTitle.classList.contains('leaf-brand-logos')) {
      brandTitle.innerHTML = theme.brandTitle || 'ABSOL <span>LAUNCHER</span>';
    }
    const brandSub = document.querySelector('.leaf-brand-sub');
    if (brandSub) {
      brandSub.textContent = theme.brandSub || 'MUITAS JORNADAS. UM MESMO CÉU.';
    }
    const logoMark = document.querySelector('.leaf-logo-mark');
    if (logoMark) {
      logoMark.textContent = theme.glyph || '☾';
      logoMark.style.backgroundImage = theme.assets?.emblem ? `url('${theme.assets.emblem}')` : '';
      if (theme.assets?.emblem) logoMark.textContent = '';
    }
    const topNote = document.querySelector('.leaf-top-note');
    if (topNote) {
      topNote.innerHTML = theme.quote || 'Mesmo nas noites mais escuras,<br>há um propósito.';
    }
    const headerMoon = document.querySelector('.leaf-header-moon');
    if (headerMoon) {
      const art = HEADER_ART[character.id];
      headerMoon.classList.toggle('leaf-pokemon-header-icon', !!art);
      if (art) {
        const portrait = document.createElement('img');
        portrait.src = character.assets.cutout;
        portrait.alt = '';
        headerMoon.replaceChildren(portrait);
      }
      else headerMoon.textContent = theme.glyph || '☾';
    }

    if (body) body.classList.toggle('theme-exclusive', !!theme.exclusive);
    const footer = document.querySelector('.leaf-landscape-footer span');
    if (footer) footer.textContent = theme.footerQuote || 'ALÉM DA ESCURIDÃO, SEMPRE MAIS JORNADAS.';
    const epilogue = document.querySelector('.leaf-aside-epilogue strong');
    if (epilogue) epilogue.textContent = theme.sideQuote || 'Entre a névoa e a próxima jornada.';
    const epilogueKicker = document.querySelector('.leaf-epilogue-kicker');
    if (epilogueKicker) epilogueKicker.textContent = theme.sideKicker || (character.id === 'pkmn-meganium' ? 'O JARDIM DOS RECOMEÇOS' : character.id === 'pkmn-banette' ? 'FIOS DOURADOS NA NOITE' : character.id === 'pkmn-gengar' ? 'O SORRISO DAS SOMBRAS' : 'O GUARDIÃO');
    const companions = document.querySelector('.leaf-companions');
    if (companions) {
      companions.replaceChildren();
      if (theme.exclusive) {
        if (theme.assets.companions) {
          const img = document.createElement('img');
          img.src = theme.assets.companions;
          img.alt = '';
          companions.appendChild(img);
        } else {
          const emblem = document.createElement('span');
          emblem.className = 'theme-solitary-emblem';
          emblem.textContent = theme.glyph;
          companions.appendChild(emblem);
        }
      } else {
        const img = document.createElement('img');
        img.src = 'src/ui/assets/companions.png';
        img.alt = '';
        companions.appendChild(img);
      }
    }
    let ornament = document.querySelector('.theme-header-ornament');
    if (!ornament) {
      ornament = document.createElement('div');
      ornament.className = 'theme-header-ornament';
      ornament.setAttribute('aria-hidden', 'true');
      document.querySelector('.leaf-topbar')?.appendChild(ornament);
    }
    ornament.replaceChildren();
    if (theme.exclusive) {
      if (theme.assets.companions) {
        const img = document.createElement('img');
        img.src = theme.assets.companions;
        img.alt = '';
        ornament.appendChild(img);
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {}

    // Atualiza cards selecionados se o seletor estiver aberto
    document.querySelectorAll('.leaf-theme-card').forEach(card => {
      const isCur = card.dataset.themeId === theme.id;
      card.classList.toggle('is-active', isCur);
      card.setAttribute('aria-pressed', String(isCur));
    });

    if (notify) {
      window.dispatchEvent(new CustomEvent('piw-theme-changed', { detail: { theme } }));
    }
    return theme;
  }

  function mountSelector(container) {
    if (!container) return;
    container.innerHTML = '';

    const allThemes = getAllThemes();
    const pkmnCount = allThemes.filter(t => t.category === 'pokemon' || t.category === 'mega').length;
    const megaCount = allThemes.filter(t => t.category === 'mega').length;

    const wrap = document.createElement('div');
    wrap.className = 'leaf-theme-section';
    const lockLabel = document.createElement('label');
    lockLabel.className = 'leaf-pokemon-lock';
    const lockInput = document.createElement('input');
    lockInput.type = 'checkbox';
    lockInput.checked = !!getLockedPokemonId();
    lockInput.addEventListener('change', () => setPokemonLocked(lockInput.checked));
    lockLabel.appendChild(lockInput);
    lockLabel.appendChild(document.createTextNode('Manter Pokémon ao mudar de tema'));
    wrap.appendChild(lockLabel);

    // Barra de busca
    const searchWrap = document.createElement('div');
    searchWrap.className = 'leaf-theme-search-wrap';
    searchWrap.innerHTML = `
      <span class="leaf-theme-search-icon" aria-hidden="true">🔍</span>
      <input type="search" class="leaf-theme-search" id="leafThemeSearchInput" placeholder="Buscar entre ${allThemes.length} temas (ex: Charizard, Gengar, Mega...)" autocomplete="off">
    `;
    wrap.appendChild(searchWrap);

    // Filtros rápidos
    const filtersWrap = document.createElement('div');
    filtersWrap.className = 'leaf-theme-filters';
    filtersWrap.style.overflowX = 'auto';
    filtersWrap.style.paddingBottom = '4px';
    filtersWrap.innerHTML = `
      <button type="button" class="leaf-theme-filter-btn is-active" data-filter="all">Todos (${allThemes.length})</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="mega">⚡ Megas (${megaCount})</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="pokemon">✨ Pokémons (${pkmnCount})</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="FIRE">♨ Fogo</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="WATER">🌊 Água</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="GRASS">☘ Grama</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="ELECTRIC">⚡ Elétrico</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="GHOST">✦ Fantasma</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="DRAGON">🐉 Dragão</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="ICE">Gelo</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="FIGHTING">Lutador</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="POISON">Veneno</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="GROUND">Terra</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="ROCK">Pedra</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="DARK">Sombrio</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="FLYING">Voador</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="PSYCHIC">Psíquico</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="BUG">Inseto</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="STEEL">Aço</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="FAIRY">Fada</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="NORMAL">Normal</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="exclusive">Artes exclusivas</button>
      <button type="button" class="leaf-theme-filter-btn" data-filter="standard">🎨 Paletas (${STANDARD_THEMES.length})</button>
    `;
    wrap.appendChild(filtersWrap);

    // Grade de temas
    const grid = document.createElement('div');
    grid.className = 'leaf-theme-grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Escolher tema de Pokémon');
    wrap.appendChild(grid);

    // Container de "Carregar Mais"
    const loadMoreWrap = document.createElement('div');
    loadMoreWrap.style.textAlign = 'center';
    loadMoreWrap.style.paddingTop = '6px';
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.type = 'button';
    loadMoreBtn.className = 'leaf-theme-filter-btn';
    loadMoreBtn.style.width = '100%';
    loadMoreBtn.style.padding = '6px 12px';
    loadMoreBtn.style.fontSize = '11px';
    loadMoreWrap.appendChild(loadMoreBtn);
    wrap.appendChild(loadMoreWrap);

    container.appendChild(wrap);

    let activeFilter = 'all';
    let searchQuery = '';
    let visibleCount = 40;
    const PAGE_SIZE = 40;

    function renderCards() {
      grid.innerHTML = '';
      const curId = getSavedThemeId();

      const filtered = allThemes.filter(t => {
        // Filtro de Categoria / Tipo
        if (activeFilter !== 'all') {
          if (activeFilter === 'mega' && t.category !== 'mega') return false;
          if (activeFilter === 'pokemon' && t.category !== 'pokemon' && t.category !== 'mega') return false;
          if (activeFilter === 'standard' && t.category !== 'standard') return false;
          if (activeFilter === 'exclusive' && !t.exclusive) return false;
          if (['FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'GHOST', 'DRAGON', 'ICE', 'FIGHTING', 'POISON', 'GROUND', 'ROCK', 'DARK', 'FLYING', 'PSYCHIC', 'BUG', 'STEEL', 'FAIRY', 'NORMAL'].includes(activeFilter)) {
            if (t.t1 !== activeFilter && t.t2 !== activeFilter) return false;
          }
        }

        // Filtro de Texto
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchName = t.name && t.name.toLowerCase().includes(q);
          const matchSub = t.pokemon && t.pokemon.toLowerCase().includes(q);
          const matchDex = t.dex && String(t.dex) === q;
          if (!matchName && !matchSub && !matchDex) return false;
        }

        return true;
      });

      if (filtered.length === 0) {
        grid.innerHTML = '<div class="leaf-theme-empty">Nenhum Pokémon encontrado para esta busca.</div>';
        loadMoreWrap.style.display = 'none';
        return;
      }

      const toRender = filtered.slice(0, visibleCount);

      toRender.forEach(t => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `leaf-theme-card ${t.id === curId ? 'is-active' : ''}`;
        card.dataset.themeId = t.id;
        card.dataset.themeTone = t.tone;
        card.setAttribute('aria-pressed', String(t.id === curId));

        card.innerHTML = `
          <div class="leaf-theme-card-top">
            <div class="leaf-theme-swatches">
              <span class="leaf-theme-swatch" style="background:${t.swatches[0]}"></span>
              <span class="leaf-theme-swatch" style="background:${t.swatches[1]}"></span>
              <span class="leaf-theme-swatch" style="background:${t.swatches[2]}"></span>
            </div>
            <span class="leaf-theme-badge">${t.glyph ? t.glyph + ' ' : ''}${t.toneLabel}</span>
          </div>
          <div class="leaf-theme-name">${t.name}</div>
          <div class="leaf-theme-desc">${t.pokemon}</div>
        `;

        card.onclick = () => selectTheme(t.id);
        grid.appendChild(card);
      });

      if (filtered.length > visibleCount) {
        loadMoreWrap.style.display = 'block';
        loadMoreBtn.textContent = `+ Carregar mais Pokémon (${filtered.length - visibleCount} restantes)`;
      } else {
        loadMoreWrap.style.display = 'none';
      }
    }

    loadMoreBtn.onclick = () => {
      visibleCount += PAGE_SIZE;
      renderCards();
    };

    // Evento de busca
    const searchInput = searchWrap.querySelector('#leafThemeSearchInput');
    let searchDebounce = null;
    searchInput.oninput = (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchQuery = e.target.value.trim();
        visibleCount = PAGE_SIZE;
        renderCards();
      }, 120);
    };

    // Eventos de filtro
    filtersWrap.querySelectorAll('.leaf-theme-filter-btn').forEach(btn => {
      btn.onclick = () => {
        filtersWrap.querySelectorAll('.leaf-theme-filter-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        activeFilter = btn.dataset.filter;
        visibleCount = PAGE_SIZE;
        renderCards();
      };
    });

    renderCards();
  }

  // Aplicação instantânea imediata
  const initialThemeId = getSavedThemeId();
  if (document.documentElement) {
    const t = getTheme(initialThemeId);
    document.documentElement.dataset.theme = t.id;
    document.documentElement.dataset.themeTone = t.tone;
  }
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(initialThemeId, false);
  });

  // API pública
  window.PIWThemeManager = {
    getThemes: getAllThemes,
    getTheme,
    getCurrentTheme: () => getTheme(getSavedThemeId()),
    setTheme: applyTheme,
    selectTheme,
    setPokemonLocked,
    getLockedPokemonId,
    mountSelector
  };
})();

