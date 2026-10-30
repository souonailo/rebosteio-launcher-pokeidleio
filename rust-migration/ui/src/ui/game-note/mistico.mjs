/**
 * O MYSTICTICKET e a ARENA MÍSTICA — as regras puras, sem sim nem banco.
 *
 * ### O que é
 *
 * O ticket cai na VITÓRIA contra um boss (a luta que se paga com Bronze Boss Token). É raríssimo
 * de propósito, e negociável no Mercado da Comunidade: quem não quer arriscar a tentativa vende.
 * Usado, ele abre uma arena pequena e roxa com UM Pokemon Lendário ou Mítico de nível 100, sorteado
 * entre todos os que têm sprite. Derrotado, ele cai no chão como qualquer selvagem, e o jogador tem
 * UMA bola para tentar a captura — um ticket, uma luta, uma tentativa.
 *
 * ### A chance do ticket sobe com o NÍVEL do boss
 *
 * A mesma escada da peça de TM e dos fragmentos de Mega (`chanceTmDoPar` em
 * `shared/bosses-lendarios.mjs`): um degrau por PAR de bosses, na ordem da galeria.
 *
 *   par 0 (nv 300)  →  0,0005%   (1 em 200 mil)
 *   par 1 (nv 650)  →  0,0010%
 *   par 2           →  0,0015%   … +0,0005% a cada par acima
 *
 * É um drop comum da tabela do boss, sorteado a cada vitória como a peça de TM — sem contador de
 * azar: quem quer a chance maior sobe de boss, que é a mesma pergunta que o TM e a Mega já fazem
 * ("vale a pena subir?"), com uma escada que o jogador já conhece.
 *
 * ### A captura é a mesma para todo lendário
 *
 * Fora da fórmula de raridade das hunts (`chanceCaptura` no sim, que sai do preço da espécie): na
 * arena a chance é uma TABELA por bola, igual para o Articuno e para o Arceus, que é o que foi
 * pedido — o lendário mais caro não pode ser mais difícil que o mais barato, porque o ticket é o
 * mesmo. O Capture Boost dobra, como em toda captura do jogo.
 */
import { LENDARIO_DEX, MITICO_DEX } from './spawns-filtro.mjs';
import { temSpriteJogo } from './sprite-jogo.mjs';
import { isMegaPokeId, megaPorPokeId, MEGA_POKE_BASE } from './megas.mjs';
import { dexBaseDaForma } from './formas.mjs';

/** O item. Faixa 70000–70099 dos itens nossos (ver `game/itens-nossos.mjs`). */
export const MYSTIC_TICKET_ID = 70090;

/** A chance do primeiro par de bosses, e o quanto ela sobe a cada par acima. */
export const CHANCE_TICKET_PASSO = 0.000005; // 0,0005%

/**
 * A chance de o boss do par `par` (0 = o primeiro, nv 300) dar o ticket numa vitória:
 * 0,0005% × (par + 1). Par torto (negativo, texto) vale como o primeiro.
 */
export function chanceTicketDoPar(par) {
  const n = Math.max(0, Math.floor(Number(par) || 0));
  return Math.min(1, (n + 1) * CHANCE_TICKET_PASSO);
}

/**
 * O nível em que o lendário CAPTURADO nasce (o teto de captura é 100 — ver `teto-captura`).
 *
 * Até 12/10/2026 era também o nível da LUTA; a luta passou para o nível do treinador
 * (`nivelDaLutaMistica`) e o capturado ficou aqui: a arena ficou mais dura, o prêmio não mudou.
 */
export const NIVEL_LENDARIO_MISTICO = 100;

/**
 * O nível da LUTA na Arena Mística: o do treinador que entrou — o de nível 2.000 enfrenta o
 * lendário no 2.000 (pedido de 12/10/2026). Fixo no 100, ele caía com UM golpe de qualquer equipe
 * de nível alto. Na luta ele também traz o ×4 de lendário nos atributos (`MULT_LENDARIO_STATS`, o
 * mesmo do capturado), além do HP e do dano de selvagem.
 */
export function nivelDaLutaMistica(nivelTreinador) {
  return Math.max(1, Math.floor(Number(nivelTreinador) || 1));
}

/**
 * O PISO do lendário capturado. O ticket custa umas cem tentativas, e o lendário que saía com o
 * sorteio livre de qualquer captura podia nascer Qualidade 0,8, P1 e IVs no chão — o prêmio do
 * jogo virando lixo na mão (02/10/2026). Ele nasce acima do shiny, que só pede a soma dos IVs
 * acima de 110:
 *
 *   · qualidade ≥ 1,20: rerola até passar, então o que sai é a escada natural acima do piso, e
 *     não um monte de 1,200 cravado;
 *   · IV somado ≥ 120 (de 192): rerola também, cada IV de 1 a 32 como em toda captura;
 *   · potência ≥ 2: a roleta gira normal e o que sair abaixo de 2 vira 2 — P3, P4 e P5 ficam com
 *     a chance de sempre (5%, 0,5% e 0,005%).
 *
 * Os números de 12/10/2026 são do dono: o piso era 1,50 / 150 / P3 desde 02/10 e desceu para
 * 1,20 / 120 / P2 (a luta, no mesmo dia, ficou no nível do treinador e com o ×4).
 *
 * O shiny segue com a chance cheia do jogo (`rolarShinyForaDeHunt` no sim). O sorteio mora no
 * `content.mjs` (`rolarLendarioMistico`), ao lado do `rolarStarter`, porque as bandas de
 * qualidade vêm do `formulas.json`.
 */
export const MISTICO_QUALIDADE_MIN = 1.2;
export const MISTICO_IV_SOMA_MIN = 120;
export const MISTICO_POTENCIA_MIN = 2;

/**
 * A chance de captura por BOLA, na arena. 0,1% na Poke Ball e 0,5% na Beast Ball, subindo um
 * degrau por bola — os mesmos cinco ids do catálogo (`bolas` no content.mjs).
 */
export const CAPTURA_MISTICA_POR_BOLA = Object.freeze({
  1: 0.001, // Poke Ball
  2: 0.002, // Great Ball
  3: 0.003, // Super Ball
  4: 0.004, // Ultra Ball
  5: 0.005, // Beast Ball
});

/** A melhor bola primeiro — a ordem em que o servidor escolhe quando o jogador não escolhe. */
export const BOLAS_MISTICAS_DA_MELHOR = Object.freeze([5, 4, 3, 2, 1]);

/**
 * A chance de UM arremesso na arena. `multCaptura` é o do Capture Boost (1 sem, 2 com): a Beast
 * Ball com boost dá 1%. Bola fora da tabela dá 0 — não há o que arremessar.
 */
export function chanceCapturaMistica(ballId, multCaptura = 1) {
  const base = CAPTURA_MISTICA_POR_BOLA[Number(ballId)] ?? 0;
  return Math.min(1, base * Math.max(1, Number(multCaptura) || 1));
}

/**
 * Quanto tempo o jogador tem para escolher a bola depois de derrubar o lendário. Passado isso o
 * servidor arremessa a MELHOR que ele tiver: a tentativa é uma só, e perdê-la para um AFK — ou
 * para uma aba em segundo plano — seria perder o ticket inteiro por um motivo que não é jogo.
 * Fica abaixo do tempo de corpo no chão (`CORPO_MS`, 30 s), para o arremesso sempre achar o corpo.
 */
export const MISTICO_ESCOLHA_MS = 25_000;

/**
 * Os Lendários de Kanto e Johto. `LENDARIO_DEX` começa em Hoenn (é a lista das hunts e dos
 * bosses, e os de Kanto/Johto nunca tiveram hunt), mas na arena eles entram: "algum Lendário ou
 * Mítico" é todo lendário, e o Mewtwo é o primeiro em que alguém pensa.
 */
export const LENDARIOS_KANTO_JOHTO = Object.freeze([144, 145, 146, 150, 243, 244, 245, 249, 250]);

/** Os Míticos de Kanto e Johto, pelo mesmo motivo. */
export const MITICOS_KANTO_JOHTO = Object.freeze([151, 251]);

/**
 * Míticos que faltam em `MITICO_DEX` — ela é a lista do EDITOR DE SPAWNS, e responde outra
 * pergunta ("quem pode ser posto num spawn?"). O Victini nunca precisou entrar lá, e por tabela
 * ficava de fora do sorteio: era o único dos dezoito bosses que a Pokedex anuncia que a arena
 * jamais sortearia, com a ficha prometendo um encontro que não existia.
 */
export const MITICOS_FORA_DO_FILTRO = Object.freeze([494]); // Victini

/** Todo dex lendário ou mítico, de Kanto a Paldea. */
export const DEX_LENDARIO_OU_MITICO = new Set([
  ...LENDARIOS_KANTO_JOHTO, ...MITICOS_KANTO_JOHTO, ...MITICOS_FORA_DO_FILTRO,
  ...LENDARIO_DEX, ...MITICO_DEX,
]);

/** Só os MÍTICOS — o anúncio da captura diz "Mítico" em vez de "Lendário" para eles. */
export const DEX_MITICO = new Set([
  ...MITICOS_KANTO_JOHTO, ...MITICOS_FORA_DO_FILTRO, ...MITICO_DEX,
]);

/**
 * O dex nacional por trás de um id do jogo: Orre (#13000+) pelos três últimos dígitos, Mega pela
 * ficha dela (a 2ª mega mora no #9000 + dex, ver `MEGAS_SEGUNDAS`) e a FORMA pela espécie base
 * (`formas.mjs`: o Articuno de Galar #5144 é o Articuno, o Deoxys Ataque #8386 é o Deoxys).
 */
export const dexNacional = (id) => {
  if (id >= 13000) return id % 1000;
  if (isMegaPokeId(id)) return megaPorPokeId(id)?.dex ?? id - MEGA_POKE_BASE;
  return dexBaseDaForma(id) ?? id;
};

/**
 * Esta espécie é Lendária ou Mítica? É a pergunta do ×4 nos stats (`MULT_LENDARIO_STATS`, 12/10/2026).
 *
 * Vale pela ESPÉCIE, e não pelo caminho até ela: o lendário da Arena Mística e o que alguém já tinha
 * antes do ticket são o mesmo bicho. A lista é a da arena (`DEX_LENDARIO_OU_MITICO`, com os míticos e
 * as Ultra Beasts); o clone de Orre de um lendário é lendário, como no ovo e no Showdown, a Mega de
 * lendário (Mega Mewtwo, Primal Kyogre…) também, e a FORMA de lendário (o trio de Galar, os Therians,
 * o Kyurem Branco…) também. Variante da Outland (#2001+) não cai em número de Pokedex nenhum.
 */
export function ehLendarioOuMitico(pokeId) {
  const id = Number(pokeId);
  return Number.isInteger(id) && id > 0 && DEX_LENDARIO_OU_MITICO.has(dexNacional(id));
}

/** Só o MÍTICO — a tela diz "Mítico" em vez de "Lendário" para ele. */
export function ehMitico(pokeId) {
  const id = Number(pokeId);
  return Number.isInteger(id) && id > 0 && DEX_MITICO.has(dexNacional(id));
}

/**
 * O sorteio da arena: as espécies Lendárias e Míticas que o jogo sabe desenhar.
 *
 * Só a espécie BASE: o `pokeId` tem de ser o próprio número da Pokedex (abaixo de 2000). Isso
 * deixa de fora as variantes Outland (#2001+), as Megas (#3000+), as FORMAS (#4000+: o Articuno de
 * Galar e o Zygarde Completo não saem do ticket) e as cópias de Orre (#13000+, cujo dex é `% 1000` e
 * daria um "Lugia" de Orre no lugar do Lugia). E só quem tem a PRÓPRIA
 * arte (`temSpriteJogo`): um lendário invisível — ou com a arte de outro — seria um ticket
 * jogado fora.
 *
 * `looktype > 1` não basta. Os de Paldea (#1001–#1025) vieram com o looktype da Gen 1
 * reciclado (60000 + dex % 1000): o Walking Wake (#1009) tem 60009, que é o Blastoise, e saiu
 * assim de um ticket em 02/10/2026. Eram 18 no sorteio, de Wo-Chien (Bulbasaur) a Pecharunt
 * (Pikachu); `temSpriteJogo` exige 60000 + o próprio número de quem passa de #1000.
 *
 * `especies` é o Map do catálogo (`content.mjs`); a lista sai ordenada pelo dex, para o sorteio
 * ser reproduzível num teste com o mesmo `aleatorio`.
 */
export function poolLendariosMisticos(especies) {
  const lista = [];
  for (const e of especies.values()) {
    const id = Number(e?.pokeId);
    if (!Number.isInteger(id) || id < 1 || id >= 2000) continue;
    if (!DEX_LENDARIO_OU_MITICO.has(id)) continue;
    if (!temSpriteJogo(e)) continue;
    lista.push(e);
  }
  return lista.sort((a, b) => a.pokeId - b.pokeId);
}

/** Um lendário do pool, com a MESMA chance para cada um. */
export function sortearLendarioMistico(pool, aleatorio = Math.random) {
  if (!pool?.length) return null;
  return pool[Math.floor(aleatorio() * pool.length)] ?? pool[pool.length - 1];
}

/** O slug da grade da arena (registrada no boot do sim — ver `game/mistico-arena.mjs`). */
export const ARENA_MISTICA = 'arena_mistica';
