'use strict';

const assert = require('node:assert/strict');
const {
  KickAccountClient,
  KickPresenceManager,
  DEFAULT_PARTNER_CHANNELS
} = require('../src/domain/kick-presence-service');

// 1. Testa sanitizacao de credenciais
const client = new KickAccountClient(0);
assert.equal(client.index, 0);
assert.equal(client.status, 'disconnected');

client.setCredentials('@Biscoitao ', ' token123 ', true);
assert.equal(client.username, 'biscoitao');
assert.equal(client.token, 'token123');
assert.equal(client.enabled, true);

// 2. Testa definicao de alvos de canais
client.setTargetChannels(['#biscoitao', 'surskity', ' ']);
assert.deepEqual(Array.from(client.targetChannels), ['biscoitao', 'surskity']);

// 3. Testa resolucao de canais parceiros padrao (12 parceiros oficiais)
assert.ok(DEFAULT_PARTNER_CHANNELS.biscoitao);
assert.equal(DEFAULT_PARTNER_CHANNELS.biscoitao.id, 247167);
assert.ok(DEFAULT_PARTNER_CHANNELS.souonailo);
assert.ok(DEFAULT_PARTNER_CHANNELS.pokeidle);
assert.ok(DEFAULT_PARTNER_CHANNELS.faasii);
assert.ok(DEFAULT_PARTNER_CHANNELS.febatista);
assert.equal(Object.keys(DEFAULT_PARTNER_CHANNELS).length, 12);

// 4. Testa tracking e snapshot de pontos por canal
client.setChannelPoints('biscoitao', 450);
client.setChannelPoints('souonailo', 1200);
assert.equal(client.channelPoints.biscoitao, 450);
assert.equal(client.channelPoints.souonailo, 1200);

const clientStatus = client.getStatus();
assert.equal(clientStatus.channelPoints.biscoitao, 450);
assert.equal(clientStatus.channelPoints.souonailo, 1200);

// 5. Testa KickPresenceManager
const manager = new KickPresenceManager();
assert.equal(manager.accounts.length, 4);
assert.equal(manager.masterEnabled, false);

manager.syncLives(['#Biscoitao', 'matta']);
assert.deepEqual(manager.liveChannels, ['biscoitao', 'matta']);

// Only a fresh verified one-hour reward admits a live, even at zero points.
manager.accounts[0].username = 'viewer';
manager.setPointAccounts([{ username: 'viewer', status: 'authenticated', balances: {
  biscoitao: { status: 'verified', catalogStatus: 'verified', checkedAt: Date.now(), points: 0, rewards: [{ hours: 1, available: true }] },
  matta: { status: 'verified', catalogStatus: 'verified', checkedAt: Date.now(), points: 5000, rewards: [{ hours: 5, available: true }] }
} }]);
assert.deepEqual(manager.watchTargets(manager.accounts[0]), ['biscoitao']);

// Status snapshot
const status = manager.getStatus();
assert.equal(status.masterEnabled, false);
assert.equal(status.accounts.length, 4);
assert.equal(status.liveChannels.length, 2);

// Desconexao limpa
client.disconnect();
assert.equal(client.status, 'disconnected');
assert.equal(client.activeChannel, null);

console.log('PASS: kick presence client & manager unit tests');
