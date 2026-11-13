// Entirely local fixture. Never opens a game connection or spends tokens.
require('./tauri-preload.cjs');

const bosses = [
  { key:'articuno', nome:'Articuno', minNivelTreinador:70,
    entrada:{itemId:70000,qtd:1,nome:'Bronze Boss Token'},
    drops:[{itemId:70014,nome:'Mega Stone Fragment',chance:0.02,qtd:[1,2]},
      {itemId:70090,nome:'Mystic Ticket',chance:0.0005,qtd:[1,1]}] },
  { key:'zapdos', nome:'Zapdos', minNivelTreinador:90,
    entrada:{itemId:70000,qtd:1,nome:'Bronze Boss Token'},
    drops:[{itemId:70015,nome:'Mega Shiny Stone Fragment',chance:0.01,qtd:[1,1]}] }
];

window.__bossFixture = {
  catalog: bosses,
  configs: Array.from({length:4}, (_, index) => ({
    index, cid:`fixture-${index+1}`, alias:`Fixture ${index+1}`, online:index<2,
    enabled:false,bossKey:'',mode:'demand',quantity:null,distribution:[],completed:0,
    entryCounts:{},nextBossKey:'',initialTokens:null,
    inventoryKnown:index<2, inventory:index<2 ? {'70000':[3,5][index]} : null,
    team:index<2 ? [{id:100+index*10,sid:7,name:'Squirtle',level:50,ld:true},
      {id:101+index*10,sid:25,name:'Pikachu',level:70,shiny:true,ld:false},
      {id:102+index*10,sid:6,name:'Charizard',level:90,ld:false}] : [],
    activeId:100+index*10, pokemonProfiles:{}, pokemonReturnPending:false,
    live:{enabled:false,inArena:false,tokenBalance:null,status:'idle',entryCounts:{},nextBossKey:''}
  }))
};

const originalInvoke = window.__TAURI__.core.invoke;
window.__TAURI__.core.invoke = async (name, args={}) => {
  if (name === 'blaster_boss_history') return [];
  if (name === 'blaster_boss_catalog') {
    window.__nativeCalls.push({name,args});
    return args.index < 2 ? window.__bossFixture.catalog : [];
  }
  if (name === 'blaster_boss_status') {
    window.__nativeCalls.push({name,args});
    return structuredClone(window.__bossFixture.configs[args.index]);
  }
  if (name === 'blaster_boss_configure') {
    window.__nativeCalls.push({name,args});
    const config = window.__bossFixture.configs[args.index];
    if (!config) throw new Error('Conta inválida');
    const distribution = Array.isArray(args.distribution) ? args.distribution : [];
    if (args.enabled) {
      if (distribution.length > 0) {
        for (const item of distribution) {
          if (!bosses.some(b => b.key === item.bossKey)) throw new Error('Boss desconhecido');
        }
      } else if (!bosses.some(b => b.key === args.bossKey)) {
        throw new Error('Boss desconhecido');
      }
    }
    config.enabled=Boolean(args.enabled);
    config.bossKey=args.bossKey || config.bossKey;
    config.mode=args.mode;
    config.quantity=args.quantity;
    config.distribution=distribution;
    config.completed=0;
    config.live={...config.live,enabled:config.enabled,bossKey:config.bossKey,
      mode:config.mode,limit:config.quantity,distribution:config.distribution,
      completed:0,status:config.enabled?'waiting':'idle'};
    return structuredClone(config);
  }
  if (name === 'blaster_boss_select_pokemon') {
    window.__nativeCalls.push({name,args});
    const config = window.__bossFixture.configs[args.index];
    if (!config || config.enabled || config.live.inArena || !config.team.some(p=>p.id===args.pokemonId)) throw Error('Troca bloqueada');
    config.activeId=args.pokemonId;
    config.team.forEach(p=>{p.ld=p.id===args.pokemonId;});
    return true;
  }
  if (name === 'blaster_boss_pokemon_configure') {
    window.__nativeCalls.push({name,args});
    const config=window.__bossFixture.configs[args.index];
    if(!config || config.enabled || !config.team.some(p=>p.id===args.primaryId) || !config.team.some(p=>p.id===args.fighterId)) throw Error('Escalação bloqueada');
    config.pokemonProfiles[args.bossKey]={primaryId:args.primaryId,fighterId:args.fighterId};
    return structuredClone(config);
  }
  return originalInvoke(name,args);
};
