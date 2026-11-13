const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('launcher IPC commands are allowed only on their local webviews', () => {
  const cap = JSON.parse(read('rust-migration/src-tauri/capabilities/default.json'));
  assert.deepEqual(cap.webviews, ['main']);
  assert.ok(!cap.windows?.length, 'window-scoped permissions also include remote child webviews');
  assert.equal(cap.remote, undefined);
  const permission = read('rust-migration/src-tauri/permissions/launcher.toml');
  const allowed = new Set([...permission.split('commands.allow =')[1].matchAll(/"([a-z_]+)"/g)].map(m => m[1]));
  const depotPermission = read('rust-migration/src-tauri/permissions/auto-depot.toml');
  const depotAllowed = new Set([...depotPermission.split('commands.allow =')[1].matchAll(/"([a-z_]+)"/g)].map(m => m[1]));
  const rmtCapabilityPath = path.join(root, 'rust-migration/src-tauri/capabilities/rmt.json');
  const rmtPermissionPath = path.join(root, 'rust-migration/src-tauri/permissions/rmt.toml');
  const rmtAllowed = new Set();
  if (fs.existsSync(rmtCapabilityPath) && fs.existsSync(rmtPermissionPath)) {
    const rmtCapability = JSON.parse(fs.readFileSync(rmtCapabilityPath, 'utf8'));
    assert.deepEqual(rmtCapability.webviews, ['rmt']);
    assert.equal(rmtCapability.remote, undefined);
    const rmtPermission = fs.readFileSync(rmtPermissionPath, 'utf8');
    for (const match of rmtPermission.matchAll(/"([a-z_]+)"/g)) rmtAllowed.add(match[1]);
  }
  assert.ok(cap.permissions.includes('allow-auto-depot'));
  const uiRoot = path.join(root, 'rust-migration/ui');
  const files = [path.join(uiRoot, 'tauri-bridge.js'), path.join(uiRoot, 'index.html')];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(path.join(uiRoot, 'src/ui'));
  const commands = files.flatMap(file => {
    const source = fs.readFileSync(file, 'utf8');
    return [...source.matchAll(/\b(?:invoke|inv|callNative|native)\s*\(\s*['"]([a-z_]+)['"]/g)].map(match => ({ command: match[1], file }));
  });
  for (const { command, file } of commands) {
    assert.ok(allowed.has(command) || depotAllowed.has(command) || rmtAllowed.has(command), `Missing launcher ACL: ${command} in ${path.relative(root, file)}`);
  }
  for (const command of ['report_gameplay', 'webview_eval_result', 'game_console_message']) assert.ok(!allowed.has(command));
  const game = JSON.parse(read('rust-migration/src-tauri/capabilities/gameplay.json'));
  assert.equal(game.local, false);
  assert.deepEqual(game.remote.urls, ['https://pokeidle.io/*']);
  assert.ok(!game.permissions.includes('allow-launcher'));
});

test('the launcher update version agrees with its lock file', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[''].version);
  assert.equal(pkg.version, JSON.parse(read('rust-migration/src-tauri/tauri.conf.json')).version);
  assert.equal(pkg.version, read('rust-migration/src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)[1]);
  assert.equal(pkg.version, read('rust-migration/src-tauri/Cargo.lock').match(/name = "pio-nailo-rust"\r?\nversion = "([^"]+)"/)[1]);
  assert.equal(pkg.version, read('rust-migration/ui/tauri-bridge.js').match(/appVersion: '([^']+)'/)[1]);
});
