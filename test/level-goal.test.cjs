const test = require('node:test');
const assert = require('node:assert/strict');

function pioXpAte(L) {
  const n = Math.max(0, L - 1);
  return 50 * n * (n + 1) * (2 * n + 1) / 6 - 150 * n * (n + 1) / 2 + 200 * n;
}

const pioFmtHoras = h => {
  if (!isFinite(h) || !(h > 0)) return '—';
  if (h < 1) {
    const min = Math.max(1, Math.round(h * 60));
    return min + ' min (~' + h.toFixed(1).replace('.', ',') + ' h)';
  }
  const hi = Math.floor(h), mr = Math.round((h - hi) * 60);
  if (h < 48) {
    return hi + 'h' + (mr > 0 ? String(mr).padStart(2, '0') + 'm' : '') + ' (~' + h.toFixed(1).replace('.', ',') + ' h)';
  }
  return (h / 24).toFixed(1).replace('.', ',') + ' dias (~' + Math.round(h) + ' h)';
};

function pioEta(falta, porHora) {
  if (!(falta > 0)) return 'atingida 🎉';
  if (!(porHora > 0)) return 'sem ritmo ainda';
  const horas = falta / porHora;
  return pioFmtHoras(horas);
}

test('pioXpAte matches exact PokeIdle level curve formula', () => {
  assert.equal(pioXpAte(1), 0);
  assert.equal(pioXpAte(2), 100);
  assert.equal(pioXpAte(3), 200);
  assert.equal(pioXpAte(4), 400);

  // Check differential: level L to L+1 equals 50L² - 150L + 200
  for (let L = 1; L <= 200; L++) {
    const diff = pioXpAte(L + 1) - pioXpAte(L);
    const expected = 50 * L * L - 150 * L + 200;
    assert.equal(diff, expected, `Mismatch at level ${L}`);
  }
});

test('pioFmtHoras formats hour estimates across all ranges', () => {
  // Under 1 hour
  assert.equal(pioFmtHoras(0.5), '30 min (~0,5 h)');
  assert.equal(pioFmtHoras(0.75), '45 min (~0,8 h)');
  assert.equal(pioFmtHoras(0.1), '6 min (~0,1 h)');

  // Between 1 and 48 hours
  assert.equal(pioFmtHoras(1.5), '1h30m (~1,5 h)');
  assert.equal(pioFmtHoras(5.0), '5h (~5,0 h)');
  assert.equal(pioFmtHoras(14.25), '14h15m (~14,3 h)');
  assert.equal(pioFmtHoras(24.0), '24h (~24,0 h)');

  // Over 48 hours
  assert.equal(pioFmtHoras(60.0), '2,5 dias (~60 h)');
  assert.equal(pioFmtHoras(120.0), '5,0 dias (~120 h)');

  // Non-positive / invalid
  assert.equal(pioFmtHoras(0), '—');
  assert.equal(pioFmtHoras(-5), '—');
  assert.equal(pioFmtHoras(NaN), '—');
});

test('pioEta handles target reached, zero pace and positive calculation', () => {
  // Target reached
  assert.equal(pioEta(0, 50000), 'atingida 🎉');
  assert.equal(pioEta(-1000, 50000), 'atingida 🎉');

  // No pace
  assert.equal(pioEta(500000, 0), 'sem ritmo ainda');
  assert.equal(pioEta(500000, -10), 'sem ritmo ainda');

  // Exact hours remaining: 500,000 XP at 100,000 XP/h = 5 hours
  assert.equal(pioEta(500000, 100000), '5h (~5,0 h)');

  // 150,000 XP at 100,000 XP/h = 1.5 hours
  assert.equal(pioEta(150000, 100000), '1h30m (~1,5 h)');
});

test('pace selection prioritizes active session over 6h historical average', () => {
  const selectPace = (sessionSeconds, sessionXph, r6) => {
    const ritmoSessao = (sessionSeconds >= 30 && sessionXph > 0) ? sessionXph : 0;
    return ritmoSessao > 0 ? ritmoSessao : ((r6 != null && r6 > 0) ? r6 : 0);
  };

  // Active session at 300M/h, 6h historical at 118M/h -> must pick 300M/h
  assert.equal(selectPace(600, 300_000_000, 118_000_000), 300_000_000);

  // Active session at 296M/h, 6h historical at 118M/h -> must pick 296M/h
  assert.equal(selectPace(1000, 296_381_103, 118_000_000), 296_381_103);

  // Session just started (< 30s) -> fallback to 6h historical
  assert.equal(selectPace(10, 300_000_000, 118_000_000), 118_000_000);

  // In town / zero session XP -> fallback to 6h historical
  assert.equal(selectPace(500, 0, 118_000_000), 118_000_000);

  // Neither available
  assert.equal(selectPace(0, 0, null), 0);

  // Exact math from user screenshot:
  const falta = 95_531_922_865;
  const etaSessao = pioEta(falta, 300_000_000);
  const etaHistorico = pioEta(falta, 118_000_000);

  // At 300M/h: ~318.4 h = 13.3 days
  assert.equal(etaSessao, '13,3 dias (~318 h)');
  // At 118M/h: ~809.6 h = 33.7 days
  assert.equal(etaHistorico, '33,7 dias (~810 h)');
});
