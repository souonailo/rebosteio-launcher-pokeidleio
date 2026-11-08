'use strict';
// Actual Electron sessions and net.request, with local protocol responses only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, session } = require('electron');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pio-kick-points-')));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const { createKickBrowser } = require('../src/main/kick-browser');
  const calls = [];
  let points = 456;
  let blocked = false;
  for (let i = 0; i < 4; i++) {
    const ses = session.fromPartition('persist:conta' + (i + 1));
    ses.protocol.handle('https', request => {
      const url = new URL(request.url);
      calls.push({ account: i, path: url.pathname });
      assert.equal(url.hostname, 'kick.com');
      assert.equal(request.headers.get('Authorization'), 'Bearer isolated-fixture-' + i);
      if (url.pathname === '/api/v1/user') return Response.json({ id: i + 1, username: 'viewer' + i });
      if (blocked) return new Response('', { status: 403 });
      return Response.json({ data: { points } });
    });
    await ses.cookies.set({ url: 'https://kick.com', name: 'session_token', value: 'isolated-fixture-' + i });
  }
  const manager = createKickBrowser({ prepareSession: async () => {}, getProxy: () => null, onChange: () => {} });
  manager.configure({ masterEnabled: false, accounts: Array.from({ length: 4 }, (_, i) => ({ username: 'viewer' + i })) });
  manager.setChannels(['biscoitao']);
  for (let i = 0; i < 4; i++) await manager.refresh(i, true);
  assert.equal(calls.length, 16);
  assert.ok(manager.getStatus().accounts.every(a => a.balances.biscoitao.points === 456));
  points = 0;
  await manager.invalidate(0);
  assert.equal(manager.getStatus().accounts[0].balances.biscoitao.points, 0);
  assert.equal(manager.getStatus().accounts[1].balances.biscoitao.points, 456);
  blocked = true;
  await manager.invalidate(0);
  assert.equal(manager.getStatus().accounts[0].status, 'blocked');
  assert.deepEqual(manager.getStatus().accounts[0].balances, {});
  assert.ok(!JSON.stringify(manager.getStatus()).includes('isolated-fixture'));
  manager.dispose();
  console.log('PASS: real Electron session + cookie + net transport, four account partitions, points and blocked-state handling; all HTTP intercepted locally');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
