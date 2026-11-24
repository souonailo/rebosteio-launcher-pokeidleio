'use strict';

function matchesPokeidle(text) {
  const normalized = String(text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, ' ');
  return normalized.includes('pokeidle') || normalized.includes('poke idle');
}

function kickRewardCatalog(raw) {
  if (!Array.isArray(raw?.data)) return [];
  return raw.data.flatMap(r => {
    const title = String(r.title || '').toLowerCase();
    const description = String(r.description || '').toLowerCase();
    const prompt = String(r.prompt || '').toLowerCase();
    const fullText = `${title} ${description} ${prompt}`;
    const durations = [...fullText.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(horas?|hours?|hrs?|h|minutos?|minutes?|mins?)\b/g)];
    const lengths = durations.map(([, n, unit]) => Number(n) / (unit.startsWith('m') ? 60 : 1));
    const hours = lengths[0];
    if (![1, 3, 5, 10].includes(hours) || lengths.some(value => value !== hours)) return [];
    if (!matchesPokeidle(fullText) || !/^[A-Z0-9]{26}$/.test(r.id || '')) return [];
    const [key, hourlyCost] = (fullText.includes('xp') || fullText.includes('exp')) ? ['exp', r.cost === 200 * hours ? 200 : 300]
      : (fullText.includes('captura') || fullText.includes('capture') || fullText.includes('catch')) ? ['catch', 500]
      : (fullText.includes('lure') || fullText.includes('secret') || fullText.includes('isca')) ? ['lure', 1000] : [];
    const cost = hourlyCost * hours;
    return key ? [{ key, cost, hours, id: r.id, available: r.cost === cost && r.is_enabled === true &&
      r.is_paused === false && r.is_user_input_required === false }] : [];
  });
}

module.exports = { kickRewardCatalog };
