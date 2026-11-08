'use strict';

const POINTS_CATALOG_QUERY = 'query($login: String!) { user(login: $login) { id channel { self { communityPoints { balance } } communityPointsSettings { customRewards { id title prompt cost isEnabled isPaused isInStock isUserInputRequired pricingType cooldownExpiresAt } } } } }';

function matchesPokeidle(text) {
  const normalized = String(text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, ' ');
  return normalized.includes('pokeidle') || normalized.includes('poke idle');
}

function catalog(raw) {
  return (Array.isArray(raw) ? raw : []).flatMap(reward => {
    if (!reward || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reward.id) || typeof reward.title !== 'string') return [];
    const text = `${reward.title} ${reward.prompt || ''} ${reward.description || ''}`.toLowerCase();
    if (!matchesPokeidle(text)) return [];
    const key = /15%/.test(text) && /xp|exp/.test(text) ? 'exp'
      : /capture|captura|catch/.test(text) ? 'catch' : /lure|secret|isca/.test(text) ? 'lure' : '';
    if (!key) return [];
    const durations = [...text.matchAll(/\b(\d+)\s*(?:h|horas?|hours?)\b/g)].map(match => Number(match[1]));
    const hours = durations[0] ?? 1;
    const durationHours = [1,3,5,10].includes(hours) && durations.every(value => value === hours) ? hours : null;
    const cost = reward.cost;
    return [{key, id:reward.id, title:reward.title, prompt:reward.prompt ?? null, cost, durationHours,
      available:durationHours !== null && Number.isSafeInteger(cost) && cost === {exp:300, catch:500, lure:1000}[key] * durationHours &&
      reward.isEnabled === true && reward.isPaused === false && reward.isInStock === true &&
      reward.isUserInputRequired === false && reward.pricingType === 'POINTS' && reward.cooldownExpiresAt === null}];
  });
}

module.exports = {POINTS_CATALOG_QUERY, catalog};
