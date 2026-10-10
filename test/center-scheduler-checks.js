'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { webContents } = require('electron');
const scheduler = require('../src/ui/center-scheduler');

module.exports = async function ({ guest, read, pause, output, guestUrl }) {
  const fixtureUrl = pathToFileURL(path.join(__dirname, 'fixtures', 'center-hunt.html')).href;
  async function until(code, message) {
    for (let i=0; i<60; i++) {
      if (await guest(0, code)) return;
      await pause(30);
    }
    throw new Error(message);
  }
  const state = () => guest(0, `({clicks:centerFixture.clicks,phase:document.querySelector('#rb-center-schedule').dataset.phase,pressed:document.querySelector('#rb-center-schedule').getAttribute('aria-pressed')})`);
  const reset = async () => { await guest(0, 'centerFixture.reset()'); await pause(120); };
  const arm = () => guest(0, 'document.querySelector("#rb-center-schedule").click()');
  await read('eco=false;applyEco();cleanOn=false;applyClean();setGameHudLayout("original");document.querySelector("#leafDrawerClose").click()');
  await read('webviews[0].loadURL(' + JSON.stringify(fixtureUrl) + ')');
  await until('!!window.centerFixture && !!window.__rebosteioCenterScheduler', 'dom-ready installs scheduling in the real launcher');
  assert.equal(await guest(0, 'document.querySelector("#rb-center-schedule").disabled'), false, 'a locked native button still allows scheduling');
  await guest(0, scheduler.script());
  assert.equal(await guest(0, 'document.querySelectorAll("#rb-center-schedule").length'), 1, 'repeated installation creates no duplicate control');
  assert.equal(await guest(0, 'document.querySelector("#ir-centro")===centerFixture.original'), true, 'native button is never cloned/replaced');
  await arm();
  await guest(0, 'centerFixture.hit()'); await pause(140);
  assert.deepEqual(await state(), {clicks:0,phase:'waiting',pressed:'true'}, 'hits keep the scheduled exit waiting');
  const image = await webContents.fromId(await read('webviews[0].getWebContentsId()')).capturePage();
  fs.writeFileSync(path.join(output, 'center-schedule.png'), image.toPNG());
  await guest(0, 'centerFixture.unlock()');
  await until('centerFixture.clicks===1', 'native unlock triggers exit');
  await pause(1200);
  assert.deepEqual(await state(), {clicks:1,phase:'sending',pressed:'true'}, 'enabled button is not repeatedly clicked and arrival is not assumed');
  await guest(0, 'centerFixture.arrive()');
  await until('document.querySelector("#rb-center-schedule").dataset.phase==="idle"', 'server-painted center state confirms arrival');
  assert.match(await guest(0, 'document.querySelector("#rb-center-status").textContent'), /confirmada/);

  await reset(); await arm(); await arm();
  await guest(0, 'centerFixture.unlock()'); await pause(150);
  assert.equal((await state()).clicks, 0, 'cancel prevents the eventual exit');
  await reset(); await guest(0, 'centerFixture.unlock();centerFixture.behavior="success"'); await arm();
  await until('document.querySelector("#rb-center-schedule").dataset.phase==="idle" && centerFixture.clicks===1', 'already unlocked scheduling exits immediately and confirms');

  await reset(); await guest(0, 'centerFixture.behavior="relock"'); await arm();
  await guest(0, 'centerFixture.unlock()');
  await until('centerFixture.clicks===1', 'first attempt can encounter a renewed combat lock');
  await pause(250);
  assert.equal((await state()).clicks, 1, 'relocked combat is never bypassed');
  await guest(0, 'centerFixture.behavior="hold";centerFixture.unlock()');
  await until('centerFixture.clicks===2', 'a fresh unlock can retry with spacing between attempts');
  await pause(1100);
  assert.equal((await state()).clicks, 2, 'a retry does not become repeated requests while enabled');
  await guest(0, 'centerFixture.arrive()'); await pause(120);

  await reset(); await guest(0, 'centerFixture.unlock()'); await arm();
  await pause(10200);
  assert.deepEqual(await state(), {clicks:1,phase:'idle',pressed:'false'}, 'missing confirmation ends the pending request without retries');
  assert.match(await guest(0, 'document.querySelector("#rb-center-status").textContent'), /Sem confirmação/);

  await reset(); await arm();
  await guest(0, 'document.getElementById("hud-hunt").textContent="Ancient Pupitar · nível 150";centerFixture.unlock()'); await pause(140);
  assert.equal((await state()).clicks, 0, 'changing hunt cancels before a newly enabled button can send');

  // ----- Modo Economia: o MESMO agendamento, pintado pelo botao do painel de economia -----
  await reset();
  await guest(0, 'document.documentElement.classList.add("modo-economia");centerFixture.hit()'); await pause(160);
  assert.equal(await guest(0, 'document.getElementById("rb-center-schedule").parentElement.className'), 'eco-lugar', 'clock is mounted inside the eco exit row');
  assert.equal(await guest(0, 'document.getElementById("rb-center-schedule").className'), 'eco-saida-bt', 'clock adopts the eco panel button class');
  assert.equal(await guest(0, 'document.getElementById("rb-center-schedule").disabled'), false, 'scheduling stays enabled inside Modo Economia');
  const ecoImage = await webContents.fromId(await read('webviews[0].getWebContentsId()')).capturePage();
  fs.writeFileSync(path.join(output, 'center-schedule-eco.png'), ecoImage.toPNG());
  await arm();
  assert.equal((await state()).phase, 'waiting', 'a locked eco exit still accepts scheduling');
  await guest(0, 'centerFixture.unlock()');
  await until('centerFixture.ecoClicks===1', 'the unlocked eco exit triggers the scheduled leave');
  await pause(1250);
  assert.deepEqual(await state(), {clicks:1,phase:'sending',pressed:'true'}, 'exactly one leave, through the eco button');
  assert.equal(await guest(0, 'centerFixture.original.disabled'), true, 'the scene button is never touched from Eco');

  // Turning Eco on while already scheduled: the mode change must keep the pending leave.
  await guest(0, 'centerFixture.arrive()');
  await until('document.querySelector("#rb-center-schedule").dataset.phase==="idle"', 'arrival is confirmed inside Eco');
  await reset(); await arm();
  assert.equal((await state()).phase, 'waiting');
  await guest(0, 'document.documentElement.classList.add("modo-economia")'); await pause(160);
  assert.equal((await state()).phase, 'waiting', 'switching to Modo Economia preserves the schedule');
  assert.equal((await state()).pressed, 'true');
  assert.equal(await guest(0, 'document.getElementById("rb-center-schedule").parentElement.className'), 'eco-lugar', 'the clock follows the new button');
  await guest(0, 'centerFixture.unlock()');
  await until('centerFixture.ecoClicks===1', 'the preserved schedule leaves through the eco button');
  await pause(1250);
  assert.equal((await state()).clicks, 1, 'still a single leave');
  assert.equal(await guest(0, 'centerFixture.original.disabled'), true, 'the scene button stays untouched after the swap');

  // modo-imersivo is the user's clean interface, not an economy mode: scheduling still cancels there.
  await guest(0, 'centerFixture.arrive()');
  await until('document.querySelector("#rb-center-schedule").dataset.phase==="idle"');
  await reset(); await arm();
  await guest(0, 'document.documentElement.classList.add("modo-imersivo");centerFixture.unlock()'); await pause(140);
  assert.equal((await state()).clicks, 0, 'modo-imersivo cancels scheduling');
  assert.equal((await state()).phase, 'idle');
  await guest(0, 'document.documentElement.classList.remove("modo-imersivo")'); await pause(120);
  assert.equal((await state()).clicks, 0, 'returning to the scene does not resurrect scheduling');
  await reset(); await arm();
  await guest(0, 'document.getElementById("hunt-saida").classList.add("hidden");centerFixture.unlock()'); await pause(140);
  assert.equal((await state()).clicks, 0, 'leaving the hunt/entering an arena cancels');

  await reset(); await arm();
  await guest(0, 'window.__poke.sock={readyState:3};centerFixture.unlock()'); await pause(140);
  assert.equal((await state()).clicks, 0, 'known disconnected sockets never send');
  await guest(0, 'delete window.__poke.sock');

  await reset(); await arm();
  const contents = webContents.fromId(await read('webviews[0].getWebContentsId()'));
  // Trusted native manual exit, on the local fixture only.
  const manual = await guest(0, '(()=>{const r=document.querySelector("#desistir-combate").getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
  contents.sendInputEvent({type:'mouseDown',button:'left',...manual,clickCount:1});
  contents.sendInputEvent({type:'mouseUp',button:'left',...manual,clickCount:1});
  await pause(150);
  assert.equal((await state()).phase, 'idle', 'a trusted manual exit cancels the queue');

  await reset(); await arm();
  await guest(0, 'centerFixture.original.outerHTML=centerFixture.original.outerHTML'); await pause(140);
  assert.equal((await state()).phase, 'idle', 'replacing native controls cancels the old schedule');
  assert.equal(await guest(0, 'document.querySelectorAll("#rb-center-schedule").length'), 1);
  await guest(0, 'centerFixture.original=document.getElementById("ir-centro");centerFixture.hit()'); await arm();
  assert.equal((await state()).phase, 'waiting');
  await read('webviews[0].reload()');
  await until('!!window.centerFixture && !!document.querySelector("#rb-center-schedule") && centerFixture.original.isConnected', 'reload installs a fresh scheduler');
  assert.equal((await state()).phase, 'idle', 'no pending action survives reload');
  await read('webviews[0].loadURL(' + JSON.stringify(guestUrl) + ')');
  console.log('PASS: hunt center scheduling, unlocks, confirmation, cancellation, Modo Eco (same schedule through the eco exit button), modo-imersivo cancellation, disconnects, manual exit, native replacement and reload.');
};
