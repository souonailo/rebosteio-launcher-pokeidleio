const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {app,BrowserWindow,session} = require('electron');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'scratch','capture-stones-'+Date.now());
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(output,'profile'));
app.commandLine.appendSwitch('log-level','3');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url)}));
  const win=new BrowserWindow({width:1600,height:950,show:false,webPreferences:{contextIsolation:false,nodeIntegration:false,preload:path.join(__dirname,'fixtures','tauri-preload.cjs')}});
  const read=s=>win.webContents.executeJavaScript(s);
  await win.loadFile(path.join(root,'rust-migration/ui/index.html'));await pause(900);
  await read(`document.getElementById('leafSimple').click(); cdFC.nota=0;
    mergeLogs(0,{catchLog:[{id:'delayed',n:'Unknown',sid:999999,iv:100,q:1.5,t:1234}]});
    mergeLogs(0,{catchLog:[{id:'delayed',n:'Unknown',sid:999999,iv:100,q:1.5,t:1234,nt:4.75,pot:'P4'}]});`);
  const delayed=await read(`lifeCatch.find(c=>c.id==='delayed')`);
  assert.equal(delayed.nota,4.75);assert.equal(delayed.potencia,4);
  assert.equal(await read(`lifeCatch.filter(c=>c.id==='delayed').length`),1);
  assert.equal(await read(`JSON.parse(lsGet('lifeCatch')).find(c=>c.id==='delayed').nota`),4.75);
  await read(`mergeLogs(1,{catchLog:[{id:'native',n:'Annihilape',sid:979,iv:94,q:1.52,potencia:3,t:Date.now()}]});`);
  assert.ok(await read(`lifeCatch.find(c=>c.id==='native').nota > 0`),'native headless capture calculated');
  await read(`pioDrops = ['Fire Stone','Rock Stone','Earth Stone'].flatMap((item,j)=>[1,2,3,4].map(conta=>({item,conta,qtd:conta+j,t:Date.now(),tipo:'pedra',origem:'drop'})));
    pioRmt={at:Date.now(),taxGold:.15,items:{'fire stone':{gold:123.5},'rock stone':{gold:250},'earth stone':{gold:1000}}};
    refreshCards(true);`);
  for(const [width,height] of [[1920,1032],[1600,950],[820,720]]){
    win.setContentSize(width,height);await pause(200);
    await read(`document.querySelector('.pio-stones-table').scrollIntoView({block:'center'})`);await pause(100);
    const facts=await read(`(()=>{const table=document.querySelector('.pio-stones-table');return {rows:table.tBodies[0].rows.length,images:[...table.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0),order:[...table.tBodies[0].rows].map(r=>r.lastElementChild.tagName),overflow:document.documentElement.scrollWidth>innerWidth};})()`);
    assert.equal(facts.rows,4);assert.equal(facts.images,true);assert.deepEqual(facts.order,['TH','TH','TH','TH']);assert.equal(facts.overflow,false);
    fs.writeFileSync(path.join(output,'stones-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  console.log('PASS: delayed notes persisted, native notes calculated, four account rows, local sprites, 3 viewports. '+output);
  win.destroy();app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
setTimeout(()=>{console.error('Timeout');app.exit(1);},45000);
