const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// 1. Verificar index.html e rust-migration/ui/index.html
for (const relPath of ['index.html', 'rust-migration/ui/index.html']) {
  const fullPath = path.join(root, relPath);
  assert.ok(fs.existsSync(fullPath), `Arquivo deve existir: ${relPath}`);
  const html = fs.readFileSync(fullPath, 'utf8');

  // Botão no menu
  assert.ok(html.includes('id="newInstanceBtn"'), `Botão newInstanceBtn deve existir em ${relPath}`);
  assert.ok(html.includes('➕ Nova instância'), `Texto do botão deve existir em ${relPath}`);

  // Traduções
  assert.ok(html.includes("newInstance: '➕ Nova instância'"), `Tradução PT deve existir em ${relPath}`);
  assert.ok(html.includes("newInstance: '➕ New instance'"), `Tradução EN deve existir em ${relPath}`);
  assert.ok(html.includes("newInstance: '➕ Nueva instancia'"), `Tradução ES deve existir em ${relPath}`);

  // Lógica de offset e badge de instância
  assert.ok(html.includes('appInstanceId'), `appInstanceId deve estar definido em ${relPath}`);
  assert.ok(html.includes('instanceOffset'), `instanceOffset deve ser calculado em ${relPath}`);
  assert.ok(html.includes('syncInstanceBadge'), `syncInstanceBadge deve existir em ${relPath}`);

  // Validação do loop da instância 2: os inputs precisam manter data-i de 0 a 3, com slot exibido de 5 a 8
  assert.ok(html.includes('data-i="${i}"'), `Os inputs devem mapear para índice local 0..3 em ${relPath}`);
  assert.ok(html.includes('slotNum = instanceOffset + i + 1'), `slotNum deve calcular offset para exibição em ${relPath}`);
  assert.ok(html.includes('const famProxy = (accounts[0] && accounts[0].proxy) || {};'), `famProxy deve usar índice local 0 em ${relPath}`);

  // Sintaxe JS de todos os scripts
  for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script[1], { filename: relPath });
  }
}

// 2. Verificar preload.js
const preloadContent = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
assert.ok(preloadContent.includes('instanceId:'), 'preload.js deve expor instanceId');
assert.ok(preloadContent.includes('getInstanceInfo:'), 'preload.js deve expor getInstanceInfo');
assert.ok(preloadContent.includes('openNewInstance:'), 'preload.js deve expor openNewInstance');

// 3. Verificar tauri-bridge.js
const tauriBridgeContent = fs.readFileSync(path.join(root, 'rust-migration/ui/tauri-bridge.js'), 'utf8');
assert.ok(tauriBridgeContent.includes('instanceId:'), 'tauri-bridge.js deve expor instanceId');
assert.ok(tauriBridgeContent.includes('getInstanceInfo:'), 'tauri-bridge.js deve expor getInstanceInfo');
assert.ok(tauriBridgeContent.includes('openNewInstance:'), 'tauri-bridge.js deve expor openNewInstance');

// 4. Verificar main.js
const mainContent = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
assert.ok(mainContent.includes('getInstanceId'), 'main.js deve conter getInstanceId');
assert.ok(mainContent.includes('pionailo-instancia-'), 'main.js deve conter isolamento pionailo-instancia-');
assert.ok(mainContent.includes('spawnNewInstance'), 'main.js deve conter spawnNewInstance');
assert.ok(mainContent.includes("'instance:new'"), 'main.js deve registrar handler instance:new');
assert.ok(mainContent.includes("'instance:get'"), 'main.js deve registrar handler instance:get');

// 5. Verificar rust-migration (Rust)
const credentialsRs = fs.readFileSync(path.join(root, 'rust-migration/src-tauri/src/credentials.rs'), 'utf8');
assert.ok(credentialsRs.includes('pub fn get_instance_id()'), 'credentials.rs deve expor get_instance_id');
assert.ok(credentialsRs.includes('pub fn get_app_data_dir()'), 'credentials.rs deve expor get_app_data_dir');
assert.ok(credentialsRs.includes('pionailo-instancia-'), 'credentials.rs deve isolar pasta pionailo-instancia-');

const libRs = fs.readFileSync(path.join(root, 'rust-migration/src-tauri/src/lib.rs'), 'utf8');
assert.ok(libRs.includes('instance_get'), 'lib.rs deve registrar instance_get');
assert.ok(libRs.includes('instance_new'), 'lib.rs deve registrar instance_new');
assert.ok(libRs.includes('spawn_new_instance'), 'lib.rs deve implementar spawn_new_instance');

// 6. Verificar scripts de inicialização (.bat e .vbs)
assert.ok(fs.existsSync(path.join(root, 'Abrir Nova Instancia.bat')), 'Abrir Nova Instancia.bat deve existir');
const batContent = fs.readFileSync(path.join(root, 'Abrir Nova Instancia.bat'), 'utf8');
assert.ok(batContent.includes('--instance=2') || batContent.includes('PIO_INSTANCE=2'), 'Abrir Nova Instancia.bat deve configurar a instância 2');

const vbsContent = fs.readFileSync(path.join(root, 'tools/launch-rust.vbs'), 'utf8');
assert.ok(vbsContent.includes('WScript.Arguments'), 'launch-rust.vbs deve encaminhar argumentos de linha de comando');

// 7. Verificar pokeleaf-shell.js (Settings Drawer & Tools Menu)
for (const shellPath of ['src/ui/pokeleaf-shell.js', 'rust-migration/ui/src/ui/pokeleaf-shell.js']) {
  const shellContent = fs.readFileSync(path.join(root, shellPath), 'utf8');
  assert.ok(shellContent.includes('data-old="newInstanceBtn"'), `pokeleaf-shell deve conter data-old="newInstanceBtn" em ${shellPath}`);
  assert.ok(shellContent.includes('accountOffset'), `pokeleaf-shell deve calcular accountOffset em ${shellPath}`);
}

console.log('PASS: multi-instance contract, UI elements, API bridges, Rust commands and batch launchers.');
