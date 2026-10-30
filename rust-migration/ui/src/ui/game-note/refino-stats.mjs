/**
 * REFINO — o "+1" que o jogador compra com pedras de evolução.
 *
 * ### O problema que ele resolve
 *
 * As pedras de evolução são o recurso mais inflacionado do jogo: caem de 1% a 3,5% por abate
 * (Water Stone de 63 espécies, Fire de 42, Heart de 57) e cada evolução consome UMA. Quem
 * passou de Kanto já tem centenas paradas na bolsa sem nada para fazer com elas. O refino é o
 * ralo: transforma a pedra num ganho PERMANENTE e minúsculo no stat-base do bicho, com custo
 * dobrando a cada degrau — o que mantém a pedra útil para sempre sem nunca virar atalho.
 *
 * ### O que ele mexe, e o que não mexe
 *
 * O refino soma direto na **base da espécie**, antes de tudo o mais:
 *
 * ```
 * stat = round( (base + refino + 2×IV) × nível/100 × qualidade^expo × mult )
 * ```
 *
 * Ou seja, ele passa pelos mesmos multiplicadores que o resto: +1 de base num shiny P5 nível
 * 100 vale ~4 pontos de stat; num nível 50 comum vale meio ponto. É de propósito — investir num
 * bicho ruim rende pouco, investir no melhor bicho rende muito, que é o que faz o sistema ser
 * endgame de verdade.
 *
 * **O SPD fica de fora.** Não é esquecimento: `stats.speed` não entra em combate nenhum. Quem
 * acelera os ataques é o Speed BASE DA ESPÉCIE (o potencial dos golpes, até 7% —
 * `cooldownGolpeComSpeed` em `cooldown-golpes.mjs`) com o **IV** de speed, fixo no nascimento, que
 * também encurta a Investida e o intervalo global (`cooldownComSpeed` em `game/combate.mjs`). O
 * refino não toca em nenhum dos dois: vender "+1 SPD" seria vender um número que não faz nada.
 *
 * **A nota N= sobe** com refino — usa base atual (espécie + refino) na soma, como o ⚔.
 * **O ⚔ poder sobe** com refino e com evolução: mesma base na conta de força.
 * A normalização do score usa REF_BASE como teto/piso, para evolução não penalizar quem
 *   sobe de espécie (Makuhita → Hariyama).
 *
 * ### O custo — uma cúbica, e sem teto
 *
 * Por stat, e não por pokemon: quem enfiou quatro degraus em HP continua pagando 500 no
 * primeiro de ATK. É o que transforma o sistema numa ESCOLHA em vez de numa barra que se
 * enche.
 *
 * O que é cúbico é o **acumulado**: ter `+N` num stat custou, somando tudo,
 * `CUSTO_BASE × N³` pedras. O preço de um degrau isolado sai da diferença entre dois cubos:
 *
 * ```
 * total(N)  = 500 × N³             ->  500 · 4.000 · 13.500 · 32.000 · 62.500 · 108.000 …
 * degrau(N) = 500 × (3N² - 3N + 1) ->  500 · 3.500 ·  9.500 · 18.500 · 30.500 ·  45.500 …
 * ```
 *
 * **Por que cúbica e não exponencial.** Dobrando (500 · 1.000 · 2.000 · 4.000 …) o número
 * fica bonito por seis degraus e depois vira piada: o décimo custaria 256.000 e o vigésimo,
 * 262 milhões — ou seja, existiria um teto de fato por volta do `+8`, escondido dentro da
 * fórmula. A cúbica sobe rápido o bastante para nunca inflacionar e devagar o bastante para
 * o degrau seguinte continuar sendo uma meta: o décimo custa 135.500 e o vigésimo, 570.500.
 * Por isso **não há teto** — quem quiser continuar, continua; o preço é que decide.
 *
 * **Calibrada contra o servidor de verdade**, não no chute: medindo `players.items`, um
 * jogador do topo acumula ~250 pedras/dia de UM tipo. Nesse ritmo o `+1` sai em dois dias, o
 * `+3` em dois meses e o `+5` em oito — e a renda ainda cresce muito conforme ele abre
 * regiões melhores. `REFINO_TETO_TECNICO` existe só para nenhum número virar infinito; não é
 * um limite de jogo e ninguém chega perto dele.
 */

/** Os cinco stats que aceitam refino, na ordem em que a tela os mostra. */
export const STATS_REFINAVEIS = ['hp', 'atk', 'def', 'spAtk', 'spDef'];

/** stat → campo da base no catálogo de espécies. */
export const CAMPO_BASE = {
  hp: 'baseHp',
  atk: 'baseAtk',
  def: 'baseDef',
  spAtk: 'baseSpAtk',
  spDef: 'baseSpDef',
  speed: 'baseSpeed',
};

/** Preço do PRIMEIRO degrau — e, por construção, o coeficiente da cúbica do acumulado. */
export const REFINO_CUSTO_BASE = 500;

/** O expoente da curva. Três: o acumulado de `+N` é `CUSTO_BASE × N³`. */
export const REFINO_EXPOENTE = 3;

/**
 * **Não é teto de jogo — é guarda de aritmética.** O refino é ilimitado por design (ver o
 * cabeçalho); este número existe para um pacote forjado com `{"hp": 1e308}` não virar `NaN`
 * dentro de `calcularStats` e derrubar o `power` inteiro no INSERT. No preço da curva, chegar
 * aqui custaria mais pedras do que o jogo inteiro já dropou.
 */
export const REFINO_TETO_TECNICO = 9999;

/** Quanto de base cada degrau soma. Um, e é o que dá nome ao sistema. */
export const REFINO_PASSO = 1;

const inteiro = (v) => {
  const n = Math.floor(Number(v) || 0);
  return n > 0 ? Math.min(REFINO_TETO_TECNICO, n) : 0;
};

/**
 * O refino de um pokemon, sempre com os cinco stats presentes.
 *
 * Aceita `null`, `'{}'` (jsonb que voltou como texto), objeto com chaves a mais e valores
 * absurdos — a entrada é o histórico inteiro da tabela e um `undefined` no meio da conta de
 * stats vira NaN, que o Postgres depois rejeita em `power`.
 */
export function normalizarRefino(bruto) {
  const cru = typeof bruto === 'string' ? seguroJson(bruto) : bruto;
  const out = {};
  for (const k of STATS_REFINAVEIS) out[k] = inteiro(cru?.[k]);
  return out;
}

function seguroJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/**
 * A forma COMPACTA para gravar: só os stats que têm degrau.
 *
 * `normalizarRefino` devolve os cinco sempre, o que é o certo para a conta — mas gravar
 * `{"hp":0,"atk":0,"def":0,"spAtk":0,"spDef":0}` em cada linha de `player_pokemon` são ~50
 * bytes por pokemon do mundo, reescritos a cada flush, para dizer "nada aqui". O pokemon que
 * nunca foi refinado — quase todos — grava `{}`.
 */
export function compactarRefino(bonus) {
  const b = normalizarRefino(bonus);
  const out = {};
  for (const k of STATS_REFINAVEIS) if (b[k] > 0) out[k] = b[k];
  return out;
}

/** `+N` do selo: a soma dos cinco degraus. Zero = o bicho nunca foi refinado. */
export const totalDoRefino = (bonus) =>
  STATS_REFINAVEIS.reduce((s, k) => s + inteiro(bonus?.[k]), 0);

/** O pokemon tem refino? Atalho de leitura para as telas e para o auto-lock da venda. */
export const temRefino = (bonus) => totalDoRefino(bonus) > 0;

/**
 * O que JÁ foi pago para um stat estar em `+N` — a cúbica, inteira.
 *
 * É ela que define o sistema; `custoDoRefino` é só a diferença entre dois pontos dela. Também
 * é o que a tela mostra como "investido": saber quantas pedras estão dentro de um pokemon é
 * metade do orgulho de ter um refinado.
 */
export const custoTotalDoRefino = (nivel) =>
  REFINO_CUSTO_BASE * inteiro(nivel) ** REFINO_EXPOENTE;

/**
 * Quanto custa SUBIR de `nivelAtual` para `nivelAtual + 1` naquele stat.
 *
 * `(n+1)³ - n³ = 3n² + 3n + 1` — a diferença entre dois cubos, resolvida à mão para a conta
 * não depender de duas exponenciações e continuar exata em nível alto.
 */
export const custoDoRefino = (nivelAtual) => {
  const n = inteiro(nivelAtual);
  return REFINO_CUSTO_BASE * (3 * n * n + 3 * n + 1);
};

/** Bateu na guarda de aritmética? Não é fim de progressão — ver `REFINO_TETO_TECNICO`. */
export const refinoNoTeto = (nivelAtual) => inteiro(nivelAtual) >= REFINO_TETO_TECNICO;

/** O total de pedras dentro de um pokemon, somando os cinco stats. */
export const investidoNoRefino = (bonus) => {
  const b = normalizarRefino(bonus);
  return STATS_REFINAVEIS.reduce((s, k) => s + custoTotalDoRefino(b[k]), 0);
};

/**
 * As seis bases da espécie com o refino somado — a forma que `calcularStats` consome.
 *
 * `speed` vai junto (sem refino, sempre) porque quem chama precisa das seis para a conta, e
 * devolver cinco obrigaria cada ponta a lembrar de completar a sexta.
 */
export function basesComRefino(especie, bonus) {
  const b = normalizarRefino(bonus);
  return {
    hp: (especie?.baseHp ?? 0) + b.hp * REFINO_PASSO,
    atk: (especie?.baseAtk ?? 0) + b.atk * REFINO_PASSO,
    def: (especie?.baseDef ?? 0) + b.def * REFINO_PASSO,
    spAtk: (especie?.baseSpAtk ?? 0) + b.spAtk * REFINO_PASSO,
    spDef: (especie?.baseSpDef ?? 0) + b.spDef * REFINO_PASSO,
    speed: especie?.baseSpeed ?? 0,
  };
}

