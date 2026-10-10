const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = path.resolve(__dirname, '..');
const mimikyuDir = path.join(root, 'src/ui/themes/pokemon/mimikyu');

// 1. Files exist
assert.ok(fs.existsSync(path.join(mimikyuDir, 'exclusive-theme.json')), 'exclusive-theme.json exists');
assert.ok(fs.existsSync(path.join(mimikyuDir, 'cutout-exclusive.png')), 'cutout-exclusive.png exists');
assert.ok(fs.existsSync(path.join(mimikyuDir, 'cutout-crate-alt.png')), 'cutout-crate-alt.png exists');
assert.ok(fs.existsSync(path.join(mimikyuDir, 'panorama-exclusive.png')), 'panorama-exclusive.png exists');
assert.ok(fs.existsSync(path.join(mimikyuDir, 'ARTWORK.md')), 'ARTWORK.md exists');

// 2. Catalog check
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/ui/themes/pokemon/all-pokemon.json'), 'utf8'));
const theme = catalog.find(t => t.id === 'pkmn-mimikyu');
assert.ok(theme, 'Mimikyu found in catalog');
assert.strictEqual(theme.exclusive, true, 'Mimikyu is marked exclusive');
assert.strictEqual(theme.assets.cutout, 'src/ui/themes/pokemon/mimikyu/cutout-exclusive.png');
assert.strictEqual(theme.assets.panorama, 'src/ui/themes/pokemon/mimikyu/panorama-exclusive.png');

// 3. JS catalog sync
const jsSource = fs.readFileSync(path.join(root, 'src/ui/themes/pokemon/all-pokemon.js'), 'utf8');
assert.ok(jsSource.includes('"id": "pkmn-mimikyu"'), 'JS has pkmn-mimikyu');
assert.ok(jsSource.includes('src/ui/themes/pokemon/mimikyu/cutout-exclusive.png'), 'JS has cutout path');

// 4. CSS check
const cssSource = fs.readFileSync(path.join(root, 'src/ui/themes.css'), 'utf8');
assert.ok(cssSource.includes('body[data-theme="pkmn-mimikyu"]'), 'CSS has body[data-theme="pkmn-mimikyu"]');
assert.ok(cssSource.includes('body[data-pokemon="pkmn-mimikyu"]'), 'CSS has body[data-pokemon="pkmn-mimikyu"]');

// 5. Theme manager check
const tmSource = fs.readFileSync(path.join(root, 'src/ui/theme-manager.js'), 'utf8');
assert.ok(tmSource.includes("'pkmn-mimikyu': true"), 'theme-manager has pkmn-mimikyu in HEADER_ART');

console.log('ALL MIMIKYU CHECKS PASSED!');
