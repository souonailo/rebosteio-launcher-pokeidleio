// A NOTA de 0 a 10 — quão forte o pokemon é **dentro da espécie**, alinhada ao ⚔ do ranking.
//
// Usa o mesmo `score` do ⚔ (IV, qualidade, potência, shiny, refino + base da espécie), fixo
// em **nível 100** para todo mundo. A escala 0–10 é **por espécie**: 0 = pior nascimento
// possível daquela espécie; 10 = o melhor (P5 + shiny + IV máximo).
//
// Evoluir SOBE a nota, sempre, e isso é GARANTIDO e não consequência: a régua da espécie nova,
// por si só, podia medir o mesmo nascimento mais baixo que a antiga (o IV é somado à base e os
// outros três eixos multiplicam, então uma base maior dilui só o IV). O piso da linhagem em
// `shared/linhagem-nota.mjs` fecha isso, com um degrau mínimo por evolução — a explicação
// inteira do fenômeno está lá.
//
// Sem espécie (calculadora avulsa) usa bases de referência. TM elemental e held items ficam fora.
//
// O ×4 do LENDÁRIO (`MULT_LENDARIO_STATS`) é a exceção à "mesma conta": ele entra nos stats e no ⚔,
// e fica FORA da nota. A Calculadora não dá nota a lendário — mostra "inestimável" —, e assim a nota
// de nenhum pokemon mudou quando o ×4 nasceu (12/10/2026).
//
// As tabelas de qualidade/potência/shiny são cópias do servidor — rodam no navegador sem
// `formulas.json`. `tools/teste-topidle.mjs` compara e falha se divergirem.

import { basesComRefino } from './refino-stats.mjs';
import { ehLendarioOuMitico } from './mistico.mjs';

// ------------------------------------------------------------------------ IV

export const IV_POR_STAT = { min: 1, max: 32 };
export const IV_STATS = 6;
export const IV_MIN = IV_STATS * IV_POR_STAT.min; //   6
export const IV_MAX = IV_STATS * IV_POR_STAT.max; // 192

const STAT_KEYS = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];

// ------------------------------------------------------------------ qualidade

/** As bandas de `formulas.json → qualidade.bandas`. As chances somam exatamente 100. */
export const BANDAS_QUALIDADE = [
  { min: 0.8, max: 0.9, chance: 5 },
  { min: 0.9, max: 1.0, chance: 5 },
  { min: 1.0, max: 1.1, chance: 34.03846 },
  { min: 1.1, max: 1.2, chance: 20 },
  { min: 1.2, max: 1.3, chance: 10 },
  { min: 1.3, max: 1.4, chance: 10 },
  { min: 1.4, max: 1.5, chance: 10 },
  { min: 1.5, max: 1.6, chance: 5 },
  { min: 1.7, max: 1.8, chance: 0.67308 },
  { min: 1.8, max: 1.8, chance: 0.28846 },
];

export const QUALIDADE_MIN = BANDAS_QUALIDADE[0].min;
export const QUALIDADE_MAX = BANDAS_QUALIDADE.at(-1).max;

/** Expoentes de qualidade por stat — espelham `formulas.json → qualidade.expoentePorStat`. */
export const EXPO_QUALIDADE = {
  hp: 0.95, atk: 0.8, def: 0.8, spAtk: 0.8, spDef: 0.8, speed: 0.95,
};

// ------------------------------------------------------------------- potência

export const POTENCIA_MIN = 1;
export const POTENCIA_MAX = 5;

/** Bônus de potência — espelham `POTENCIAS` em `content.mjs`. */
export const BONUS_POTENCIA = [0, 0.05, 0.1, 0.25, 1];

/** Multiplicador real de stats (1 = neutro). */
export const multPotencia = (n) => 1 + (BONUS_POTENCIA[(Math.round(n) || 1) - 1] ?? 0);

export const MULT_SHINY_STATS = 3;

/** O ×4 do lendário e do mítico — cópia de `MULT_LENDARIO_STATS` em `content.mjs` (ver lá). */
export const MULT_LENDARIO_STATS = 4;

export const multDeNascenca = (potencia, shiny, lendario = false) =>
  multPotencia(potencia) * (shiny ? MULT_SHINY_STATS : 1) * (lendario ? MULT_LENDARIO_STATS : 1);

// ---------------------------------------------------------------------- força

/** Bases neutras quando a calculadora não tem espécie (média do catálogo). */
export const REF_BASE = { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, speed: 80 };

/** Multiplicador de nível no ⚔: poder ≈ nível × 10 × score (0–1). */
export const PODER_ESCALA_NIVEL = 10;

/** Sobe quando a fórmula do ⚔ muda — o boot recalcula todo `power` gravado uma vez. */
export const PODER_FORMULA_VERSAO = 5;

/** Sobe quando a fórmula do N= muda — o boot recalcula anúncios do Mercado. */
// v2 (21/09/2026): o piso da linhagem, com o degrau mínimo por evolução. Nota nenhuma desce, e
// por isso o recálculo no boot não tira ninguém da vitrine (`devolverPokemonAbaixoDoMinimo`
// roda logo depois dele) — 52 nascimentos passam a ALCANÇAR o piso de 3,5 em vez de perdê-lo.
export const NOTA_FORMULA_VERSAO = 2;

/**
 * Quanto o N= sobe, no mínimo, a cada evolução.
 *
 * Existe para a nota não EMPATAR nas cadeias em que a régua nova media o mesmo nascimento igual
 * ou mais baixo. Um empate mente tanto quanto uma queda: os stats-base da forma nova são
 * maiores, e o número tem de dizer isso. É um piso, não um acréscimo — onde a evolução já ganha
 * mais que isto por conta própria (a maioria esmagadora), nada muda.
 */
export const GANHO_MIN_EVOLUCAO = 0.1;

/** Faixa mínima para pokemon na vitrine do Mercado (nível + nota). Shiny e P5 bypass (e o shiny só em Gemas). */
// A nota VOLTOU para 3,5 em 21/09/2026 — o piso que a vitrine tinha antes de 15/09, quando foi
// baixada para 3,0 para abrir a curadoria.
//
// Mexer nesta constante não muda só o que PODE entrar: o que já está na vitrine abaixo dela é
// fechado no boot seguinte (`devolverPokemonAbaixoDoMinimo`) e devolvido ao dono. E a devolução
// cai na COLEÇÃO, não no Depot solto — é o servidor desfazendo um anúncio que o jogador fez
// dentro da regra antiga, e largar o bicho na aba que a venda ao NPC varre transformaria uma
// mudança de regra em perda de pokemon para quem nem soube dela.
export const MERCADO_POKEMON_MIN = { level: 50, nota: 3.5 };

// A MOEDA não depende da nota: todo pokemon que passa na faixa acima se anuncia em Coins ou em
// Gemas, à escolha do vendedor — menos o SHINY, que desde 10/10/2026 só se anuncia em Gemas (ver
// `pokemonSoEmGemas`, logo abaixo). De 29/09 a 30/09/2026 valeu "nota acima de 4 só em Gemas"
// (contra a negociação por fora entregue por Coins); o dono do jogo a desfez em 30/09/2026.

/**
 * Este pokemon só se anuncia em GEMAS no Mercado da Comunidade (o "RMT" do menu)? Desde
 * 10/10/2026, o SHINY — pedido do dono do jogo.
 *
 * Quatro portas fazem a mesma pergunta, e todas têm de concordar:
 *
 *   · a TELA do anúncio e a da edição travam o botão de Coins, com o aviso por extenso;
 *   · o SIM (`market.criar`) recusa o pacote montado na mão antes de tirar o bicho da memória;
 *   · a TRANSAÇÃO do banco (`criarAnuncio`, `editarAnuncio`) confere com a linha de
 *     `player_pokemon`, que é o que o comprador recebe — publicar em Gemas e trocar para Coins
 *     depois era o outro caminho até o anúncio que a regra proíbe;
 *   · o BOOT devolve o anúncio de shiny em Coins que já estava aberto (`devolverShinyEmCoins` em
 *     `market-db.mjs`) para a Coleção do dono.
 *
 * Só o shiny de verdade: `shiny` é sorteado na captura e nunca muda depois (`lookShiny` é só a
 * arte que sai dele). Se um dia outra coisa tiver de ser só em Gemas (o P5, uma nota), é aqui
 * que se acrescenta — e na consulta da devolução de boot, que faz a mesma pergunta em SQL.
 */
export const pokemonSoEmGemas = (pk) => !!pk?.shiny;

/**
 * Auto-lock na aba Venda do Market — a nota PADRÃO do cadeado. Cada jogador escolhe a dele
 * (`automation.autoLockNotaMin`); esta só vale para quem nunca mexeu no campo.
 */
export const AUTO_LOCK_NOTA_MIN = 3.5;

/**
 * A nota do Auto Lock escolhida pelo jogador, saneada — ou `null` quando não presta.
 *
 * Passa por aqui o que vem do cliente (`shop.autoLockNota9`) e o que volta do jsonb gravado.
 * Só `number` de verdade dentro da escala da nota (0 a 10), arredondado às 3 casas do N=.
 * `typeof` antes de tudo: `"3,2"`, `[3.2]` e `true` não viram número no caminho. Quem chama
 * decide o que fazer com o `null` — a mensagem é recusada; a carga cai no padrão.
 */
export function notaAutoLockValida(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < 0 || v > 10) return null;
  return Math.round(v * 1000) / 1000;
}

export const FAIXAS_NOTA = [
  { id: 'extremamente-fraco', ate: 1 },
  { id: 'fraco', ate: 2 },
  { id: 'mediano', ate: 3 },
  { id: 'razoavel', ate: 4 },
  { id: 'bom', ate: 5 },
  { id: 'forte', ate: 6 },
  { id: 'poderoso', ate: 7 },
  { id: 'mitico', ate: 8 },
  { id: 'legendario', ate: 9 },
  { id: 'divino', ate: 10 },
];

/** Faixa visual da calculadora — degraus de 1 em 1 ponto (0–1, 1–2, …, 9–10). */
export const faixaDaNota = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return FAIXAS_NOTA[0].id;
  return FAIXAS_NOTA.find((f) => v <= f.ate)?.id ?? 'divino';
};

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

/** IVs com soma fixa — reparte o resto nos seis stats (calculadora só tem a soma). */
export function ivsDeSoma(soma) {
  const s = limitar(Math.round(Number(soma) || IV_MIN), IV_MIN, IV_MAX);
  const med = Math.floor(s / IV_STATS);
  const rest = s - med * IV_STATS;
  const ivs = Object.fromEntries(STAT_KEYS.map((k) => [k, med]));
  for (let i = 0; i < rest; i++) ivs[STAT_KEYS[i % IV_STATS]]++;
  return ivs;
}

/** Normaliza bases de espécie ou referência. */
function basesDe(bases) {
  const b = bases ?? REF_BASE;
  return {
    hp: b.hp ?? b.baseHp ?? REF_BASE.hp,
    atk: b.atk ?? b.baseAtk ?? REF_BASE.atk,
    def: b.def ?? b.baseDef ?? REF_BASE.def,
    spAtk: b.spAtk ?? b.baseSpAtk ?? REF_BASE.spAtk,
    spDef: b.spDef ?? b.baseSpDef ?? REF_BASE.spDef,
    speed: b.speed ?? b.baseSpeed ?? REF_BASE.speed,
  };
}

/**
 * Soma dos seis stats de NASCIMENTO — `calcularStats` sem o `nível/100`. `lendario` só chega aqui pelo
 * ⚔ (`poderDePokemon`); a nota nunca o passa.
 */
export function somaStatsNascimento({
  iv,
  ivs: ivsRaw,
  qualidade,
  potencia,
  shiny = false,
  lendario = false,
  bases,
}) {
  const b = basesDe(bases);
  const ivs = ivsRaw ?? ivsDeSoma(iv);
  const q = limitar(Number(qualidade) || 1, QUALIDADE_MIN, QUALIDADE_MAX);
  const p = limitar(Math.round(Number(potencia) || POTENCIA_MIN), POTENCIA_MIN, POTENCIA_MAX);
  const mult = multDeNascenca(p, shiny, lendario);
  let soma = 0;
  for (const k of STAT_KEYS) {
    soma += Math.round(
      (b[k] + 2 * (Number(ivs[k]) || IV_POR_STAT.min))
      * (q ** EXPO_QUALIDADE[k])
      * mult,
    );
  }
  return soma;
}

/**
 * Quanto cada stat de combate pesa na soma de nascimento (antes da escala log da nota).
 * Ordenado do maior para o menor `pct` (0–1). Usado na calculadora ao escolher a espécie.
 */
export function fatiasNascimentoPorStat({
  iv,
  ivs: ivsRaw,
  qualidade,
  potencia,
  shiny = false,
  bases,
}) {
  const b = basesDe(bases);
  const ivs = ivsRaw ?? ivsDeSoma(iv);
  const q = limitar(Number(qualidade) || 1, QUALIDADE_MIN, QUALIDADE_MAX);
  const p = limitar(Math.round(Number(potencia) || POTENCIA_MIN), POTENCIA_MIN, POTENCIA_MAX);
  const mult = multDeNascenca(p, shiny);
  const partes = [];
  let soma = 0;
  for (const k of STAT_KEYS) {
    const valor = Math.round(
      (b[k] + 2 * (Number(ivs[k]) || IV_POR_STAT.min))
      * (q ** EXPO_QUALIDADE[k])
      * mult,
    );
    partes.push({ key: k, valor });
    soma += valor;
  }
  const div = soma > 0 ? soma : 1;
  return partes
    .map((x) => ({ ...x, pct: x.valor / div }))
    .sort((a, b) => b.pct - a.pct || b.valor - a.valor);
}

function limitesForca({ bases } = {}) {
  const min = somaStatsNascimento({
    iv: IV_MIN, qualidade: QUALIDADE_MIN, potencia: POTENCIA_MIN, shiny: false, bases,
  });
  const max = somaStatsNascimento({
    iv: IV_MAX, qualidade: QUALIDADE_MAX, potencia: POTENCIA_MAX, shiny: true, bases,
  });
  return { min: Math.max(1, min), max: Math.max(min + 1, max) };
}

/** Converte soma de stats (força) em nota 0–10 — escala log comprime o teto absurdo (P5+shiny). */
export function notaDeForca(soma, limites = null) {
  const { min, max } = limites ?? limitesForca();
  const s = limitar(Number(soma) || min, min, max);
  if (max <= min) return 0;
  const lo = Math.log(min);
  const hi = Math.log(max);
  const bruta = 10 * (Math.log(Math.max(1, s)) - lo) / (hi - lo);
  return Math.round(limitar(bruta, 0, 10) * 1000) / 1000;
}

/**
 * Quanto cada eixo pesa na força total (barras da calculadora).
 * Mede o ganho em log(força) ao tirar aquele eixo do piso — reflete P5/shiny de verdade.
 */
export function eixosForca(params) {
  const { basesLimites, ...resto } = params;
  const args = {
    iv: IV_MIN,
    qualidade: QUALIDADE_MIN,
    potencia: POTENCIA_MIN,
    shiny: false,
    ...resto,
  };
  const limites = limitesForca({ bases: basesLimites ?? args.bases });
  const logAtual = Math.log(somaStatsNascimento(args));
  const ganho = (patch) => {
    const patched = { ...args, ...patch };
    const s = somaStatsNascimento(patched);
    return Math.max(0, logAtual - Math.log(Math.max(1, s)));
  };
  const deltas = {
    iv: ganho({ ivs: ivsDeSoma(IV_MIN) }),
    qualidade: ganho({ qualidade: QUALIDADE_MIN }),
    potencia: ganho({ potencia: POTENCIA_MIN }),
    shiny: ganho({ shiny: false }),
  };
  const total = Object.values(deltas).reduce((a, b) => a + b, 0);
  const div = total > 1e-9 ? total : 1;
  return {
    iv: deltas.iv / div,
    qualidade: deltas.qualidade / div,
    potencia: deltas.potencia / div,
    shiny: deltas.shiny / div,
    soma: somaStatsNascimento(args),
    limites,
  };
}

/** Score 0–1 para ranking ⚔ — mesma força da nota, sem escala 0–10 (e com o ×4 quando vem `lendario`). */
export function scoreForca(params, { limitesRef = false } = {}) {
  const args = {
    iv: IV_MIN,
    qualidade: QUALIDADE_MIN,
    potencia: POTENCIA_MIN,
    shiny: false,
    ...params,
  };
  const limites = limitesRef ? limitesForca() : limitesForca(args);
  return limitar(notaDeForca(somaStatsNascimento(args), limites) / 10, 0, 1);
}

/** Pior e melhor score possíveis da espécie — define a escala 0–10 do N=. */
export function limitesScoreEspecie(bases) {
  const b = bases ?? REF_BASE;
  const min = scoreForca({
    iv: IV_MIN, qualidade: QUALIDADE_MIN, potencia: POTENCIA_MIN, shiny: false, bases: b,
  }, { limitesRef: true });
  const max = scoreForca({
    iv: IV_MAX, qualidade: QUALIDADE_MAX, potencia: POTENCIA_MAX, shiny: true, bases: b,
  }, { limitesRef: true });
  return { min, max: Math.max(min, max) };
}

/** Converte score (mesma base do ⚔) em nota 0–10 dentro dos limites da espécie. */
export function notaDeScore(score, limites) {
  const { min, max } = limites;
  const s = limitar(Number(score) || min, min, max);
  if (max <= min) return 0;
  return Math.round(10 * (s - min) / (max - min) * 1000) / 1000;
}

// ------------------------------------------------------------------- a nota

/**
 * Nota 0–10 + eixos para barras. Aceita `ivs`, `bases` e `basesLimites` opcionais.
 * `basesLimites` fixa a escala 0–10 (espécie sem refino); `bases` inclui refino na soma.
 *
 * `basesAncestrais` é o PISO DA LINHAGEM: `[{ bases, passos }]` das formas anteriores da
 * cadeia. A nota devolvida é a maior entre a desta espécie e a que o mesmo nascimento tiraria
 * em cada uma delas MAIS `passos × GANHO_MIN_EVOLUCAO` — é o que faz evoluir sempre subir o N=
 * (ver `shared/linhagem-nota.mjs`). Sem ela a função se comporta exatamente como antes.
 */
export function notaPokemon({
  iv,
  ivs,
  qualidade,
  potencia,
  shiny = false,
  bases,
  basesLimites,
  basesAncestrais = null,
}) {
  const args = { iv, ivs, qualidade, potencia, shiny, bases, basesLimites: basesLimites ?? bases };
  const limitesScore = limitesScoreEspecie(args.basesLimites ?? args.bases);
  const score = scoreForca({
    iv: args.iv,
    ivs: args.ivs,
    qualidade: args.qualidade,
    potencia: args.potencia,
    shiny: args.shiny,
    bases: args.bases,
  }, { limitesRef: true });
  let nota = notaDeScore(score, limitesScore);
  // O piso da linhagem. A forma anterior é medida SEM refino — o "+N" foi comprado para esta
  // espécie e não existia lá atrás; e como ele só levanta a nota da forma atual, não há o que
  // perder. Os `eixos` ficam com a espécie de AGORA: eles dizem de onde vem a força deste
  // pokemon, não em que régua ele foi medido.
  //
  // O `Math.min(10, …)` é o teto da escala, e é ele que decide o que acontece com o nascimento
  // quase perfeito: quem já tira 9,96 na forma anterior vira 10 na nova, e não 10,06. Nessas
  // duas ou três amostras do catálogo o degrau encolhe — não há para onde subir, e um N= acima
  // de 10 seria pior do que o empate que o degrau existe para evitar.
  for (const { bases: b, passos } of basesAncestrais ?? []) {
    const scoreAnc = scoreForca({ iv, ivs, qualidade, potencia, shiny, bases: b }, { limitesRef: true });
    const notaAnc = notaDeScore(scoreAnc, limitesScoreEspecie(b));
    const piso = Math.min(10, notaAnc + (Number(passos) || 1) * GANHO_MIN_EVOLUCAO);
    if (piso > nota) nota = piso;
  }
  // Três casas, como `notaDeScore` já devolve: sem isto o degrau somado deixava o N= com a
  // sujeira de ponto flutuante (2,5949999999999998) e a tela mostrava um número diferente do
  // que o teste compara.
  nota = Math.round(nota * 1000) / 1000;
  const { soma, ...eixos } = eixosForca(args);
  return { nota, faixa: faixaDaNota(nota), eixos, soma, score, limites: limitesScore };
}

/** Nota pronta a guardar num pokemon ou numa ficha de anúncio — mesma conta da calculadora. */
export function notaDePokemon(pk, esp = null) {
  const iv = pk?.iv ?? pk?.ivTotal ?? (
    pk?.ivs ? Object.values(pk.ivs).reduce((s, v) => s + (Number(v) || 0), 0) : null
  );
  if (iv == null || !Number.isFinite(Number(iv))) return null;
  const basesLimites = esp
    ? basesDaEspecie(esp)
    : (pk?.bases ?? null);
  const bases = esp
    ? basesComRefino(esp, pk?.refino)
    : basesLimites;
  return notaPokemon({
    // O piso da linhagem vem anotado na espécie pelo catálogo (`anotarLinhagemDaNota`), e não
    // é procurado aqui: esta função é chamada por pokemon desenhado na tela, e resolver a
    // cadeia em cada uma seria refazer o mesmo caminho milhares de vezes por quadro.
    basesAncestrais: esp?.notaAncestrais ?? null,
    iv: Math.round(Number(iv)),
    ivs: pk?.ivs,
    qualidade: Number(pk?.quality ?? pk?.qualidade) || 1,
    potencia: Math.min(POTENCIA_MAX, Math.max(POTENCIA_MIN, Number(pk?.potencia) || 1)),
    shiny: !!pk?.shiny,
    bases,
    basesLimites,
  }).nota;
}

/** Stats-base da espécie no formato que `notaDePokemon` entende. */
export function basesDaEspecie(esp) {
  if (!esp) return null;
  return {
    hp: esp.baseHp, atk: esp.baseAtk, def: esp.baseDef,
    spAtk: esp.baseSpAtk, spDef: esp.baseSpDef, speed: esp.baseSpeed,
  };
}

/** Nota do Mercado — idêntica à calculadora e ao selo N= nos cards. */
export function notaMercadoDoPokemon(pk, especiesMap = null) {
  const esp = especiesMap?.get?.(pk?.speciesId) ?? null;
  return notaDePokemon(pk, esp);
}

export function atendeNotaMercado(nota) {
  return nota != null && Number(nota) >= MERCADO_POKEMON_MIN.nota - 1e-9;
}

/**
 * `null` se pode anunciar no Mercado; senão `nivel` | `nota` | `sumiu`. Shiny, P5 e lendário (ou mítico)
 * têm passe livre: entram em qualquer nível e nota. O lendário entrou na lista em 12/10/2026 (decisão do
 * dono) — a nota dele fica escondida atrás do GLITCH e não leva o ×4, então barrá-lo por ela seria recusar
 * o pokemon mais forte do jogo por um número que o jogador nem vê. Vale pela espécie (`ehLendarioOuMitico`,
 * a mesma lista do ×4), e a espécie vem do `speciesId` — do pokemon vivo ou da ficha do anúncio.
 */
export function motivoNaoAnunciavel(pk, especiesMap = null) {
  if (!pk) return 'sumiu';
  if (pk.shiny) return null;
  if (Number(pk.potencia) === POTENCIA_MAX) return null;
  if (ehLendarioOuMitico(pk.speciesId)) return null;
  if ((pk.level ?? 0) < MERCADO_POKEMON_MIN.level) return 'nivel';
  const nota = notaMercadoDoPokemon(pk, especiesMap);
  if (!atendeNotaMercado(nota)) return 'nota';
  return null;
}

/**
 * ⚔ Poder do ranking — reflete bases atuais (espécie + refino), sobe com evolução e refino. O ×4 do
 * lendário entra aqui, ao contrário da nota: o ⚔ é força, e o lendário bate como ×4. A espécie vem de
 * `esp` ou, sem ela, do `speciesId` do próprio pokemon.
 */
export function poderDePokemon(pk, esp = null) {
  const iv = pk?.iv ?? pk?.ivTotal ?? (
    pk?.ivs ? Object.values(pk.ivs).reduce((s, v) => s + (Number(v) || 0), 0) : null
  );
  if (iv == null || !Number.isFinite(Number(iv))) return 1;
  const level = Math.max(1, Number(pk?.level) || 1);
  const bases = esp
    ? basesComRefino(esp, pk?.refino)
    : (pk?.bases ?? null);
  const score = scoreForca({
    iv: Math.round(Number(iv)),
    ivs: pk?.ivs,
    qualidade: Number(pk?.quality ?? pk?.qualidade) || 1,
    potencia: Math.min(POTENCIA_MAX, Math.max(POTENCIA_MIN, Number(pk?.potencia) || 1)),
    shiny: !!pk?.shiny,
    lendario: ehLendarioOuMitico(esp?.pokeId ?? pk?.speciesId),
    bases,
  }, { limitesRef: true });
  return Math.max(1, Math.round(level * PODER_ESCALA_NIVEL * score));
}

// ---------------------------------------------------------------- compat tests

/**
 * Percentil da qualidade: que fatia dos nascimentos sai IGUAL OU PIOR que este `q`.
 *
 * Serve à auditoria das tabelas (`teste-topidle`) e, no cliente, à cor do selo de qualidade —
 * "quão raro é este número" é exatamente o que a cor precisa dizer, e é o que sobrevive a uma
 * mudança nas bandas sem ninguém ter de reajustar limiares na mão.
 */
export function percentilQualidade(q) {
  const v = limitar(Number(q) || QUALIDADE_MIN, QUALIDADE_MIN, QUALIDADE_MAX);
  let acumulado = 0;
  for (const b of BANDAS_QUALIDADE) {
    if (v < b.min) break;
    if (v >= b.max) {
      acumulado += b.chance;
      continue;
    }
    acumulado += b.chance * ((v - b.min) / (b.max - b.min));
    break;
  }
  return limitar(acumulado / 100, 0, 1);
}

/** @deprecated escala antiga da nota — mantida só para testes de ordem de potência. */
export const VALOR_POTENCIA = [0.3, 0.65, 0.85, 0.95, 1];

/** @deprecated */
export function percentilPotencia(n) {
  const p = Math.round(limitar(Number(n) || POTENCIA_MIN, POTENCIA_MIN, POTENCIA_MAX));
  return VALOR_POTENCIA[p - 1];
}
