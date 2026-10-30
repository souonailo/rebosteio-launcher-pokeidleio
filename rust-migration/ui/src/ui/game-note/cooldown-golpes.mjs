/**
 * A curva de cooldown dos golpes — poder do golpe ⇒ segundos de recarga.
 *
 * Antes disso o cooldown era herdado do espelho, golpe a golpe, e não tinha relação nenhuma
 * com o dano: dava para achar um golpe de 12 de poder recarregando em 60s ao lado de um de
 * 300 recarregando em 10s. A planilha "Novos Cooldowns PokeIdle" trocou isso por DUAS retas, e
 * a "Buff Cooldowns" baixou as duas; é esta última que as funções reproduzem (as 43 linhas
 * batem no décimo):
 *
 *   poder  15 →  10,0s ┐ primeira reta: cada ponto de poder custa 20/85 s
 *   poder 100 →  30,0s ┘ (é o trecho onde vive quase todo o catálogo)
 *   poder 100 →  30,0s ┐ segunda reta, bem mais rasa: 30/500 s por ponto
 *   poder 600 →  60,0s ┘ (senão o golpe de assinatura recarregaria em 3 minutos)
 *
 * O buff manteve as duas pontas que já eram boas — poder 15 em 10s e a inclinação acima de
 * 100 — e desceu o joelho de 40s para 30s, o que puxa tudo de 16 a 600 junto.
 *
 * O joelho em 100 é de propósito: até ali o cooldown paga o dano quase na proporção, e daí
 * para cima o golpe caro fica progressivamente mais barato — é o que mantém o ultimate de
 * 600 valendo a pena em vez de virar enfeite.
 */

/**
 * Piso de poder do catálogo.
 *
 * Havia golpes com poder 0, 1, 9 — restos do gerador antigo, que na prática não faziam dano
 * nenhum e nas últimas evoluções eram até descartados por `limparGolpesQuebrados`. Todos
 * sobem para 15, o começo da curva.
 */
export const PODER_MINIMO = 15;

/** Onde uma reta vira a outra. */
const PODER_JOELHO = 100;

/** Cooldown do golpe de assinatura (poder 600) — a ponta da segunda reta. */
export const COOLDOWN_600_MS = 60_000;

/**
 * Cooldown do golpe de MEGA — o mesmo poder 600, na METADE do tempo.
 *
 * É a única coisa no catálogo que sai da curva de propósito, e é o que a mega ENTREGA: ela
 * não ganha um terceiro golpe só para ter mais uma linha na ficha, ganha o golpe que dispara
 * duas vezes no tempo em que os outros dois disparam uma. Quem pagou dez fragmentos de boss
 * está comprando ritmo, não variedade.
 *
 * Fora da curva, ele precisa de uma trava para não ser "consertado" de volta: o golpe carrega
 * `cdFixo: true` e `fixarCooldownGolpe600` pula quem tem essa marca. Ver `shared/megas.mjs`.
 */
export const COOLDOWN_MEGA_MS = 30_000;

/** O poder que a curva enxerga: nunca abaixo do piso. */
export function poderNormalizado(power) {
  const p = Number(power);
  return Number.isFinite(p) && p > PODER_MINIMO ? p : PODER_MINIMO;
}

/**
 * Cooldown em ms para um golpe daquele poder, arredondado ao décimo de segundo — a mesma
 * precisão da planilha, para a ficha do golpe ("15,9s") não mentir sobre o valor real.
 */
export function cooldownDoPoder(power) {
  const p = poderNormalizado(power);
  const seg = p <= PODER_JOELHO
    ? 10 + ((p - PODER_MINIMO) * 20) / (PODER_JOELHO - PODER_MINIMO)
    : 30 + ((p - PODER_JOELHO) * 30) / (600 - PODER_JOELHO);
  return Math.round(seg * 10) * 100;
}

/**
 * Põe um golpe na curva: sobe o poder até o piso e recalcula o cooldown.
 * Devolve true se mexeu — os scripts de catálogo usam isso para contar o que mudou.
 */
export function aplicarCurvaNoGolpe(a) {
  if (!a) return false;
  const poder = poderNormalizado(a.power);
  const cd = cooldownDoPoder(poder);
  if (a.power === poder && a.cooldownMs === cd) return false;
  a.power = poder;
  a.cooldownMs = cd;
  return true;
}

/**
 * O DESCONTO DO SPEED nos golpes (skills e ultimates) — em %, e não em segundos.
 *
 * Antes o Speed base da espécie não servia para nada: só o IV de Speed contava, tirando um valor
 * FIXO (10 ms por ponto, até −0,32 s) — o mesmo para um Jolteon e um Snorlax, e desigual entre os
 * golpes: −0,32 s são 2,7% de uma skill de 12 s e só 0,5% de um ultimate de 60 s. Agora a espécie dá
 * o POTENCIAL e o IV decide quanto dele o pokemon aproveita:
 *
 *   potencial = Speed ÷ 20                 até 120 (cada 20 de Speed, 1%: 6% no 120)
 *             = 6 + (Speed − 120) ÷ 40     acima de 120 (cada 40, mais 1%) — teto de 7%
 *   desconto  = potencial × IV ÷ 32        IV 32 aproveita tudo; IV 16, metade
 *   cooldown  = cooldown × (1 − desconto ÷ 100)
 *
 *   Jolteon (Speed 130), IV 24, ultimate de 60 s: 6,25% × 24/32 = 4,69% → 57,2 s
 *
 * O teto de 7% é o do Ninjask (160). Só o Regieleki (200) passaria dele, e fica nos mesmos 7%.
 *
 * A Investida e o intervalo entre ataques NÃO passam por aqui: seguem o desconto fixo do IV
 * (`cooldownComSpeed`, em server/game/combate.mjs). É neles que o IV pesa de verdade — a Investida
 * de 2 s vira 1,68 s com IV 32 —, e trocar aquilo por % derrubaria a cadência de quase todo pokemon.
 */
export const SPEED_POTENCIAL_TETO_PCT = 7;

/** Até aqui cada 20 de Speed vale 1%; daqui para cima, cada 40. */
const SPEED_JOELHO = 120;

/** O IV de Speed vai de 1 a 32 — fora disso (ou sem IV) conta como o do servidor (`ivSpeedDe`). */
const ivDoSpeed = (iv) => Math.min(32, Math.max(1, Math.round(Number(iv) || 1)));

/** O potencial (em %) que o Speed base da espécie dá aos golpes — o desconto de um IV 32. */
export function potencialDoSpeed(speedBase) {
  const s = Math.max(0, Number(speedBase) || 0);
  const pct = s <= SPEED_JOELHO ? s / 20 : 6 + (s - SPEED_JOELHO) / 40;
  return Math.min(SPEED_POTENCIAL_TETO_PCT, pct);
}

/** O desconto (em %) nos golpes deste pokemon: o potencial da espécie, na fração que o IV aproveita. */
export function descontoDoSpeedPct(speedBase, ivSpeed) {
  return potencialDoSpeed(speedBase) * (ivDoSpeed(ivSpeed) / 32);
}

/** O cooldown de um GOLPE (skill ou ultimate) depois do desconto do Speed, em ms inteiros. */
export function cooldownGolpeComSpeed(cooldownMs, speedBase, ivSpeed) {
  const base = Math.max(0, Number(cooldownMs) || 0);
  if (base <= 0) return base;
  return Math.round(base * (1 - descontoDoSpeedPct(speedBase, ivSpeed) / 100));
}
