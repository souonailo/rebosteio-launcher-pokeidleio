(function (root) {
  'use strict';
  const labels = { exp: 'EXP', catch: 'Capture', lure: 'Lure' };
  function forBalance(balance, priority, now = Date.now()) {
    const selected = Object.hasOwn(labels, priority) || priority === 'all' ? priority : 'exp';
    if (!balance || balance.status !== 'verified' || !Number.isSafeInteger(balance.points) || balance.points < 0 ||
        !Number.isFinite(balance.checkedAt) || now < balance.checkedAt || now - balance.checkedAt >= 120000) {
      return { known: false, affordable: [], options: [], label: 'Atualize o saldo' };
    }
    if (balance.catalogStatus !== 'verified' || !Array.isArray(balance.rewards)) {
      return { known: false, affordable: [], options: [], label: 'Disponibilidade não confirmada' };
    }
    const options = balance.rewards.filter(r => Object.hasOwn(labels, r.key) && (selected === 'all' || r.key === selected) &&
      Number.isSafeInteger(r.cost) && r.cost > 0).slice().sort((a, b) => a.cost - b.cost);
    const available = options.filter(r => r.available === true);
    const affordable = available.filter(r => r.cost <= balance.points);
    const trials = options.filter(r => r.trialPaused === true && r.cost <= balance.points);
    const next = affordable[0];
    return { known: true, options, affordable, trials, label: next
      ? `${Math.floor(balance.points / next.cost)}× ${labels[next.key]} · ${next.durationHours || 1}h`
      : trials.length ? 'Twitch indica pausa · resgate a confirmar'
      : available.length ? `Faltam ${(available[0].cost - balance.points).toLocaleString('pt-BR')} pts`
      : 'Buff indisponível na Twitch' };
  }
  const api = { forBalance };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TwitchRewardStatus = api;
})(typeof globalThis === 'object' ? globalThis : this);
