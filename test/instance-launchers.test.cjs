const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const windows = process.platform === 'win32';

function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}

test('source launcher passes application arguments after the Cargo separator', { skip: !windows }, () => {
  // Execute the real invocation with a recorder, without running setup/install/build.
  const source = fs.readFileSync(path.join(root, 'tools/start-rust.ps1'), 'utf8');
  const invocation = source.split(/\r?\n/).find(line => line.includes("Invoke-Checked 'cargo.exe'") && line.includes("'dev'"));
  assert.ok(invocation);
  const script = `function Invoke-Checked { param($Program, $Arguments) ConvertTo-Json -Compress -InputObject @($Program, $Arguments) }
& { ${invocation} } '--instance=2' '--example=with space'`;
  const output = run('powershell.exe', ['-NoProfile', '-Command', script]);
  assert.deepEqual(JSON.parse(output), ['cargo.exe', [
    'tauri', 'dev', '--no-watch', '--', '--locked', '--', '--instance=2', '--example=with space'
  ]]);
});

test('new-instance batch uses root release, build fallbacks and source fallback', { skip: !windows }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pio instance launch '));
  try {
    const recorderSource = path.join(temp, 'Recorder.cs');
    fs.writeFileSync(recorderSource, `using System; using System.IO;
class Recorder { static void Main(string[] args) {
 File.WriteAllLines(Environment.GetEnvironmentVariable("PIO_TEST_RESULT"), new [] {
  Environment.GetEnvironmentVariable("PIO_INSTANCE"), Environment.CurrentDirectory,
  Environment.GetCommandLineArgs()[0], String.Join("|", args) });
} }`);
    const recorder = path.join(temp, 'recorder.exe');
    run(path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), [
      '/nologo', '/target:winexe', `/out:${recorder}`, recorderSource
    ]);
    for (const scenario of ['root', 'release', 'debug', 'source']) {
      const dir = path.join(temp, scenario);
      fs.mkdirSync(dir);
      fs.copyFileSync(path.join(root, 'Abrir Nova Instancia.bat'), path.join(dir, 'open.bat'));
      const candidates = ['pio-nailo-rust.exe', 'rust-migration/src-tauri/target/release/pio-nailo-rust.exe', 'rust-migration/src-tauri/target/debug/pio-nailo-rust.exe'];
      const first = ['root', 'release', 'debug', 'source'].indexOf(scenario);
      for (const relative of candidates.slice(first)) {
        const target = path.join(dir, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(recorder, target);
      }
      // Intercept WScript only in this temporary test environment.
      fs.copyFileSync(recorder, path.join(dir, 'wscript.exe'));
      const output = path.join(dir, 'result.txt');
      run('cmd.exe', ['/d', '/c', path.join(dir, 'open.bat')], {
        cwd: temp, env: { ...process.env, PIO_INSTANCE: '17', PIO_TEST_RESULT: output, PATH: `${dir};${process.env.PATH}` }
      });
      for (let i = 0; i < 100 && !fs.existsSync(output); i++) await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(fs.existsSync(output), `${scenario}: child did not run`);
      const [id, cwd, exe, args] = fs.readFileSync(output, 'utf8').trim().split(/\r?\n/);
      assert.equal(id, '2', scenario);
      if (scenario !== 'source') {
        assert.equal(path.resolve(exe), path.join(dir, candidates[first]), scenario);
        assert.equal(path.resolve(cwd), dir, scenario);
        assert.equal(args, '--instance=2', scenario);
      } else {
        assert.equal(args, `//nologo|${dir}\\tools\\launch-rust.vbs|--instance=2`);
      }
    }
  } finally {
    // Only this test's verified temporary directory is removed.
    assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
