const listeners = new Map();
for(let i=0;i<4;i++){localStorage.setItem('bsh_blaster_'+i,'1');localStorage.setItem('bsh_mode_'+i,'1');}
const states = Array.from({length:4},(_,i)=>({ok:true,live:true,i,name:`Fixture ${i+1}`,hunt:'enraged_typhlosion',outlandTier:2,level:100,team:[{sid:9,name:'Blastoise',level:100,ld:true}],balls:1000,ballsKnown:true,inventoryKnown:true,ballMap:{1:1000},invMap:{70000:5},a:{seconds:100,kills:100,xph:1000,gph:300,kph:400},catchLog:[],shinyLog:[],twitch:{vinculado:true,pct:15,bonus:{captura:Date.now()+36000000}},kick:{bonusExp:1,bonusTime:'1h'}}));
window.__fixtureEmit=(name,payload)=>{for(const fn of listeners.get(name)||[])fn({payload});};
window.__fixtureStates=states;
window.__fixtureCalls={};
window.__TAURI__={core:{invoke:async(name,args)=>{
 window.__fixtureCalls[name]=(window.__fixtureCalls[name]||0)+1;
 if(name==='creds_load')return states.map(s=>({name:s.name,email:'fixture@example.invalid',senha:'fixture'}));
 if(name==='app_version')return '0.0.0-test';
 if(name==='instance_get')return {id:1};
 if(name==='blaster_status')return {active:true,state:states[args.index]};
 if(name==='webview_eval')return states[args.index];
 if(name==='proxy_apply')return {changed:[]};
 if(name.includes('points_get'))return {accounts:states.map(s=>({balances:{partner:{status:'verified',points:100,checkedAt:Date.now()}}}))};
 if(name.includes('status_get')||name.includes('creds_load'))return {accounts:[]};
 if(name==='autostart_get')return {on:false,suportado:true};
 if(name==='sniper_load'||name==='center_load')return {};
 return null;
}},event:{listen:async(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return()=>listeners.get(name).delete(fn);}}};
