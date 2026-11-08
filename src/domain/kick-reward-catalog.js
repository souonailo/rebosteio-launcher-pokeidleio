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
    if (!matchesPokeidle(fullText) || !/^[A-Z0-9]{26}$/.test(r.id || '')) return [];
    const [key, cost] = (fullText.includes('xp') || fullText.includes('exp')) ? ['exp', 300]
      : (fullText.includes('capture') || fullText.includes('catch')) ? ['catch', 500]
      : (fullText.includes('lure') || fullText.includes('secret') || fullText.includes('isca')) ? ['lure', 1000] : [];
    return key ? [{ key, cost, id: r.id, available: r.cost === cost && r.is_enabled === true &&
      r.is_paused === false && r.is_user_input_required === false }] : [];
  });
}

module.exports = { kickRewardCatalog };
