/**
 * Escada de huntLevel por região — cada estágio evolutivo = degrau fixo dentro do gate.
 *
 * Hoenn (500): 500 → 850
 * Sinnoh (1000): 1000, 1250, 1500, 2000, 2500, 3000
 * Unova (5000): 5000, 6000, 6500, 8000
 * Kalos (10000): 10000, 12500, 15000, 20000
 * Alola (25000): 25000 → 36800      (gen 7 — e as formas de Alola)
 * Galar (40000): 40000 → 69000      (gen 8 — e as formas de Galar e de Hisui)
 * Paldea (75000): 75000 → 174050    (gen 9 — e as formas de Paldea; a final de 3 estágios no 160300)
 *
 * ### Depois de Kalos: Alola → Galar → Paldea, a ordem das gerações (pedido do dono, 19/10/2026)
 *
 * Até a v1.304 as gerações 7, 8 e 9 moravam numa aba só do Mapa (Alola), em três escadas por geração
 * (gen 7 a partir de 25.000, gen 8 de 50.000, gen 9 de 100.000). Em 17/10/2026 o dono separou as três
 * regiões (as três no mapa de Alola por enquanto), e a primeira versão saiu na ordem Galar 25.000 →
 * Paldea 40.000 → Alola 75.000. Em 19/10 ele corrigiu para a ordem CRONOLÓGICA das gerações: Alola
 * 25.000, Galar 40.000, Paldea 75.000. Os pokemon não mudaram de região (o Fomantis segue em Alola):
 * só as portas — e as três escadas geradas trocaram de dono junto com elas, cada hunt no mesmo degrau
 * da sua região. O huntLevel da espécie segue a região onde ela mora (é dele que sai a ficha da
 * Pokedex; a captura, desde 17/10, sai do estágio), e o nível de cada hunt (`spawns-editor.json`) é o
 * mesmo número.
 *
 * Paldea, a última, tem `topo`: sem ele a escada pararia em 1,7 × 75.000 = 127.500 e a hunt mais alta
 * do jogo cairia de 160.300 para ~120 mil — quem já está lá em cima perderia XP e ouro por abate. Com
 * o topo de 174.050, a final de 3 estágios cai exatamente no 160.300 (o mesmo topo que Alola tinha).
 */
import { LENDARIOS_DEX } from './spawns-filtro.mjs';
import { isOutlandPokeId } from './outland.mjs';

/** Ordem do Mapa (e do nível): Hoenn → Sinnoh → Unova → Kalos → Alola → Galar → Paldea — a das gerações. */
export const REGIOES_GERACAO = [
  { min: 252, max: 386, gate: 500, next: 1000 },
  { min: 387, max: 493, gate: 1000, next: 5000 },
  { min: 494, max: 649, gate: 5000, next: 10000 },
  { min: 650, max: 721, gate: 10000, next: 25000 },
  { min: 722, max: 809, gate: 25000, next: 40000, regiao: 'alola' },
  { min: 810, max: 905, gate: 40000, next: 75000, regiao: 'galar' },
  { min: 906, max: 1025, gate: 75000, next: null, topo: 174_050, regiao: 'paldea' },
];

/** Escadas fixas calibradas à mão — não usar fórmula genérica nestes gates. */
const ESCADAS_FIXAS = {
  500: [500, 550, 600, 650, 700, 750, 800, 850],
  1000: [1000, 1250, 1500, 2000, 2500, 3000],
  5000: [5000, 6000, 6500, 8000],
  10000: [10000, 12500, 15000, 20000],
  // A de 25.000 ([25000, 30000, 50000]) era a de Alola até a v1.304, calibrada para ir até a porta de
  // 50.000 da gen 8. Com a próxima região no 40.000 a fixa passaria da porta seguinte, então quem abre no
  // 25.000 (Alola, desde 19/10/2026) usa a gerada (25.000 → 36.800), como as outras depois de Kalos.
};

/**
 * Gera degraus só para gates sem escada fixa (Galar em diante). `topo` é o degrau mais alto, para a
 * última região (sem `nextGate`); sem ele, 1,7 × o gate.
 */
export function escadaDe(gate, nextGate = null, topo = null) {
  if (ESCADAS_FIXAS[gate]) return ESCADAS_FIXAS[gate];
  const max = topo
    ? Math.round(topo / 50) * 50
    : nextGate
      ? Math.round((nextGate * 0.92) / 50) * 50
      : Math.round((gate * 1.7) / 50) * 50;
  const degraus = 8;
  const out = [];
  for (let i = 0; i <= degraus; i++) {
    const t = i / degraus;
    out.push(Math.round((gate + (max - gate) * t ** 1.12) / 50) * 50);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export function gateDoDex(dex) {
  return REGIOES_GERACAO.find((r) => dex >= r.min && dex <= r.max) ?? null;
}

export function dexDe(pokeId) {
  const id = Number(pokeId);
  if (!Number.isFinite(id) || id < 1) return id;
  if (id < 1000) return id;
  if (id >= 13000) return id % 1000; // Orre 13xxx → dex nacional
  if (isOutlandPokeId(id)) return id; // Outland #2001+ — chave própria, não % 1000
  return id; // nacional 1000+ (Wo-Chien #1001, etc.)
}

const RARIDADE_IDX = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, MYTHIC: 4, LEGENDARY: 5 };

/** Monta cadeias evolutivas por dex (ignora ramificações — pega o elo `evolvesToId` principal). */
export function montarCadeias(lista) {
  const porDex = new Map();
  for (const c of lista) {
    const dex = dexDe(c.pokeId);
    if (dex < 1 || dex > 1025 || LENDARIOS_DEX.has(dex)) continue;
    const hit = porDex.get(dex) ?? {
      dex,
      nome: c.name,
      evolvesTo: null,
      rarity: c.rarity ?? 'COMMON',
      type1: c.type1,
    };
    if (c.evolvesToId && c.evolvesToId > 0) {
      const alvo = dexDe(c.evolvesToId);
      if (alvo >= 252 && alvo <= 1025) hit.evolvesTo = alvo;
    }
    if (c.rarity) hit.rarity = c.rarity;
    if (c.type1) hit.type1 = c.type1;
    porDex.set(dex, hit);
  }

  const profundidade = new Map();
  const maxProf = new Map();

  function dfs(dex, visitado = new Set()) {
    if (profundidade.has(dex)) return profundidade.get(dex);
    if (visitado.has(dex)) return 0;
    visitado.add(dex);
    let depth = 0;
    for (const [d, n] of porDex) {
      if (n.evolvesTo === dex) {
        depth = Math.max(depth, dfs(d, visitado) + 1);
      }
    }
    profundidade.set(dex, depth);
    return depth;
  }

  for (const dex of porDex.keys()) dfs(dex);

  for (const [dex, depth] of profundidade) {
    let max = depth;
    let cur = dex;
    while (porDex.get(cur)?.evolvesTo) {
      max = Math.max(max, profundidade.get(porDex.get(cur).evolvesTo) ?? 0);
      cur = porDex.get(cur).evolvesTo;
    }
    // sobe max para toda a cadeia
    cur = dex;
    const chainMax = max;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      maxProf.set(cur, Math.max(maxProf.get(cur) ?? 0, chainMax));
      cur = porDex.get(cur)?.evolvesTo ?? null;
    }
  }

  return { porDex, profundidade, maxProf };
}

/** Índices na escada por profundidade da cadeia evolutiva. */
function indicesPorProfundidade(escadaLen) {
  if (escadaLen >= 8) {
    return {
      0: null,
      1: [0, 4],
      2: [0, 3, 7],
      3: [0, 2, 5, 7],
    };
  }
  if (escadaLen === 6) {
    return {
      0: null,
      1: [0, 5],
      2: [0, 2, 5],
      3: [0, 1, 3, 5],
    };
  }
  if (escadaLen === 4) {
    return {
      0: null,
      1: [0, 3],
      2: [0, 1, 3],
      3: [0, 1, 2, 3],
    };
  }
  if (escadaLen === 3) {
    return {
      0: null,
      1: [0, 2],
      2: [0, 1, 2],
      3: [0, 1, 2],
    };
  }
  const L = escadaLen - 1;
  return {
    0: null,
    1: [0, L],
    2: [0, 1, L],
    3: [0, 1, 2, L],
  };
}

function indiceNaEscada(meta, profundidade, maxProf, escadaLen) {
  const max = maxProf.get(meta.dex) ?? 0;
  const depth = profundidade.get(meta.dex) ?? 0;
  if (max === 0) {
    const r = RARIDADE_IDX[meta.rarity] ?? 1;
    return Math.min(r, escadaLen - 1);
  }
  const preset = indicesPorProfundidade(escadaLen)[Math.min(max, 3)] ?? indicesPorProfundidade(escadaLen)[2];
  const idx = preset[Math.min(depth, preset.length - 1)];
  return Math.min(idx, escadaLen - 1);
}

export function huntLevelDoDex(dex, cadeias, regioes = REGIOES_GERACAO, gateForcado = null, nextForcado = null) {
  const reg = gateForcado
    ? { gate: gateForcado, next: nextForcado }
    : gateDoDex(dex);
  if (!reg || LENDARIOS_DEX.has(dex)) return null;
  if (!gateForcado && dex < 252) return null;
  const meta = cadeias.porDex.get(dex);
  if (!meta) return null;
  const escada = escadaDe(reg.gate, reg.next, reg.topo);
  const idx = indiceNaEscada(meta, cadeias.profundidade, cadeias.maxProf, escada.length);
  return escada[idx];
}

/**
 * Aplica huntLevel (e evolveLevel = próximo estágio) em todas as entradas da lista.
 *
 * O `evolveLevel` que sai daqui é PROVISÓRIO em Outland+: no boot, `aplicarTetoDeCaptura`
 * (`shared/teto-captura.mjs`) roda por último e troca esse degrau pelo teto do destino
 * (20/40/100). O número desta função continua valendo como "onde o alvo mora", que é o que a
 * escada de hunts precisa saber — só não é mais o que o botão Evoluir cobra.
 */
export function aplicarEscalaHuntLevel(lista, regioes = REGIOES_GERACAO, listaCompleta = null) {
  const cadeias = montarCadeias(listaCompleta ?? lista);
  const porDexNivel = new Map();
  for (const dex of cadeias.porDex.keys()) {
    if (dex < 252) continue;
    const n = huntLevelDoDex(dex, cadeias, regioes);
    if (n) porDexNivel.set(dex, n);
  }

  for (const c of lista) {
    const dex = dexDe(c.pokeId);
    const n = porDexNivel.get(dex);
    if (!n || dex < 252) continue;
    c.huntLevel = n;
    if (c.evolvesToId && c.evolvesToId > 0) {
      const prox = porDexNivel.get(dexDe(c.evolvesToId));
      if (prox) c.evolveLevel = prox;
    }
  }
  return { porDexNivel, cadeias };
}

/** Relatório de tipos por degrau — ajuda a balancear spawns no mapa. */
export function relatorioTiposPorNivel(porDexNivel, cadeias) {
  const porNivel = new Map();
  for (const [dex, nivel] of porDexNivel) {
    const meta = cadeias.porDex.get(dex);
    if (!meta?.type1) continue;
    const bag = porNivel.get(nivel) ?? {};
    bag[meta.type1] = (bag[meta.type1] ?? 0) + 1;
    porNivel.set(nivel, bag);
  }
  return [...porNivel.entries()].sort((a, b) => a[0] - b[0]);
}
