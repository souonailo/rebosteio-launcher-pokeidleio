//! Client hunt history, using the counters and duration persisted by pokeidle.io.
use serde_json::{json, Value};
use std::time::Instant;

const COUNTERS: &[&str] = &["xpTreinador", "xpPokemon", "gold", "abates", "capturas", "shiniesVistos", "shinies", "bossTokens", "fragChave", "fragShiny", "fragBicicleta", "fragMega", "fragMegaShiny", "tmPeca", "tmPecaAoe", "ticketMistico", "ticketSafari", "fragOvoShiny"];
const MAPS: &[&str] = &["bolas", "pocoes", "revives", "tokens"];
const DROPS: &[(&str, u64, &str)] = &[
    ("bossTokens",70000,"Bronze Boss Token"), ("fragChave",70011,"Key Fragment"),
    ("fragShiny",70012,"Shiny Stone Fragment"), ("fragBicicleta",70013,"Bicycle Fragment"),
    ("fragMega",70014,"Mega Stone Fragment"), ("fragMegaShiny",70015,"Mega Shiny Stone Fragment"),
    ("tmPeca",59194,"TM Disk Piece"), ("tmPecaAoe",40530,"AoE TM Disk Piece"),
    ("ticketMistico",70090,"Mystic Ticket"), ("ticketSafari",70095,"Safari Ticket"),
    ("fragOvoShiny",70017,"Shiny Egg Fragment"),
];
fn number(v: &Value) -> f64 {
    v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())).filter(|n| n.is_finite()).unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixed(saved: Value) -> HuntSession {
        let mut session = HuntSession::import("Nailo", &saved).unwrap();
        session.clock = None;
        session
    }
    #[test]
    fn measured_game_history_uses_same_millisecond_rate() {
        let session = fixed(json!({"ms":1242987,"xpTreinador":32782822,"xpPokemon":32782822,"abates":406}));
        assert_eq!(session.rate("xpTreinador"), 94_947_219);
        assert_eq!(session.rate("xpPokemon"), session.rate("xpTreinador"));
    }
    #[test]
    fn handoffs_reconnects_and_reset_do_not_duplicate_history() {
        let mut session = fixed(json!({"ms":1206010,"xpTreinador":32426895,"xpPokemon":32426895,"abates":393}));
        let event = json!({"t":"batalha","ev":[{"k":"morte","quem":"selvagem","xp":13508,"xpTreinador":27379,"xpPokemon":27379} ]});
        for _ in 0..12 { session.observe(&event); }
        assert_eq!(session.count("xpTreinador"), 32_755_443);
        assert_eq!(session.count("abates"), 405);
        for _ in 0..4 {
            let snapshot = session.snapshot();
            session = fixed(snapshot.clone());
            session.observe(&json!({"t":"welcome","estado":{}}));
            session.observe(&json!({"t":"disconnected"}));
            assert_eq!(session.snapshot(), snapshot);
        }
        session = fixed(json!({"ms":0,"xpTreinador":0}));
        assert_eq!(session.rate("xpTreinador"), 0);
        session.observe(&event);
        assert_eq!(session.count("xpTreinador"), 27379);
        assert_eq!(session.rate("xpTreinador"), 1_642_740);
    }
    #[test]
    fn all_session_counters_survive_native_events_and_roundtrip() {
        let mut session = fixed(json!({"ms":60000,"xpTreinador":100,"xpPokemon":200,"gold":50,"bolas":{"1":3},"pocoes":{"200":2},"fragChave":4}));
        session.observe(&json!({"t":"batalha","data":{"ev":[
            {"k":"bossMorto","xp":10,"xpTreinador":0,"xpPokemon":20,"valor":5,"drops":[{"itemId":70011,"qtd":2}]},
            {"k":"bola","ballId":1,"shiny":true}, {"k":"capturado","pokemon":{"shiny":true}},
            {"k":"cura","itemId":200}, {"k":"revive","itemId":205}, {"k":"bossEntrou"}
        ]}}));
        let saved = session.snapshot();
        assert_eq!(session.count("xpTreinador"),100);
        assert_eq!(session.count("xpPokemon"),220);
        assert_eq!(session.count("gold"),55);
        assert_eq!(session.count("fragChave"),6);
        assert_eq!(session.count("shiniesVistos"),1);
        assert_eq!(session.count("shinies"),1);
        assert_eq!(number(&saved["bolas"]["1"]),4.0);
        assert_eq!(number(&saved["pocoes"]["200"]),3.0);
        assert_eq!(number(&saved["tokens"]["70000"]),1.0);
        assert_eq!(fixed(saved.clone()).snapshot(), saved);
    }
    #[test]
    fn restore_accepts_only_numeric_history_fields() {
        let session = fixed(json!({"ms":1000,"xpTreinador":"123.5","token":"secret","pocoes":{"__proto__":9,"200":2},"gold":-1}));
        assert!(session.snapshot().get("token").is_none());
        assert_eq!(session.rate("xpTreinador"),7410);
        assert_eq!(session.count("gold"),0);
        assert_eq!(session.snapshot()["pocoes"].as_object().unwrap().len(),1);
    }
}
fn id(v: &Value) -> Option<u64> {
    let n = number(v);
    (n > 0.0 && n < 1e9 && n.fract() == 0.0).then_some(n as u64)
}
#[derive(Debug, Clone)]
pub struct HuntSession {
    pub nick: String,
    data: Value,
    clock: Option<Instant>,
}
impl HuntSession {
    fn path(index: usize) -> std::path::PathBuf {
        crate::credentials::get_app_data_dir().join(format!("hunt-session-{}.json", index))
    }
    pub fn checkpoint(&self, index: usize) -> std::io::Result<()> {
        let path = Self::path(index);
        if let Some(parent) = path.parent() { std::fs::create_dir_all(parent)?; }
        let temp = path.with_extension("tmp");
        std::fs::write(&temp, json!({"nick":self.nick,"saved":self.snapshot()}).to_string())?;
        std::fs::rename(temp, path)
    }
    pub fn load(index: usize, nick: &str) -> Option<Self> {
        let data: Value = serde_json::from_slice(&std::fs::read(Self::path(index)).ok()?).ok()?;
        if !data["nick"].as_str()?.eq_ignore_ascii_case(nick) { return None; }
        let mut session = Self::import(nick, &data["saved"]).ok()?;
        session.clock = None;
        Some(session)
    }
    pub fn release_checkpoint(index: usize) {
        // Only our own recoverable handoff file; the game's history is untouched.
        let _ = std::fs::remove_file(Self::path(index));
    }
    pub fn import(nick: &str, saved: &Value) -> Result<Self, String> {
        if nick.is_empty() || !saved.is_object() { return Err("Histórico de hunt inválido".into()); }
        let mut data = json!({"ms": number(&saved["ms"]).max(0.0)});
        for key in COUNTERS { data[*key] = json!(number(&saved[*key]).max(0.0)); }
        for key in MAPS {
            let mut map = serde_json::Map::new();
            if let Some(source) = saved[*key].as_object() {
                for (k,v) in source {
                    if let Some(i) = id(&json!(k)) {
                        let qty = number(v).floor();
                        if qty > 0.0 { map.insert(i.to_string(), json!(qty)); }
                        if map.len() == 64 { break; }
                    }
                }
            }
            data[*key] = Value::Object(map);
        }
        Ok(Self { nick: nick.to_lowercase(), data, clock: Some(Instant::now()) })
    }
    pub fn elapsed_ms(&self) -> f64 {
        number(&self.data["ms"]) + self.clock.map(|c| c.elapsed().as_secs_f64() * 1000.0).unwrap_or(0.0)
    }
    pub fn resume(&mut self) { if self.clock.is_none() { self.clock = Some(Instant::now()); } }
    pub fn pause(&mut self) { self.data["ms"] = json!(self.elapsed_ms()); self.clock = None; }
    pub fn snapshot(&self) -> Value { let mut data = self.data.clone(); data["ms"] = json!(self.elapsed_ms()); data }
    pub fn count(&self, key: &str) -> u64 { number(&self.data[key]).max(0.0) as u64 }
    pub fn rate(&self, key: &str) -> u64 { (number(&self.data[key]) * 3_600_000.0 / self.elapsed_ms().max(60_000.0)).round().max(0.0) as u64 }
    pub fn balls(&self) -> u32 { self.data["bolas"].as_object().map(|m| m.values().map(number).sum::<f64>() as u32).unwrap_or(0) }
    fn add(&mut self, key: &str, qty: f64) { self.data[key] = json!(number(&self.data[key]) + qty); }
    fn spend(&mut self, key: &str, item: &Value, qty: f64) {
        if qty.fract() != 0.0 || !(1.0..=1000.0).contains(&qty) { return; }
        if let Some(i) = id(item) {
            let map = self.data[key].as_object_mut().unwrap();
            let k = i.to_string();
            if map.len() < 64 || map.contains_key(&k) {
                let old = map.get(&k).map(number).unwrap_or(0.0);
                map.insert(k, json!(old + qty));
            }
        }
    }
    pub fn observe(&mut self, message: &Value) {
        let data = message.get("data").unwrap_or(message);
        if message["t"] != "batalha" { return; }
        let Some(events) = data["ev"].as_array() else { return; };
        for e in events {
            match e["k"].as_str().unwrap_or("") {
                "morte" if e["quem"] != "selvagem" => {},
                "morte" | "bossMorto" => {
                    let boss = e["k"] == "bossMorto";
                    if !boss { self.add("abates", 1.0); }
                    for key in ["xpTreinador", "xpPokemon"] {
                        self.add(key, number(if e[key].is_null() { &e["xp"] } else { &e[key] }));
                    }
                    self.add("gold", number(&e[if boss { "valor" } else { "ouro" }]));
                    if let Some(drops) = e["drops"].as_array() {
                        for (key, item, name) in DROPS {
                            for d in drops {
                                if d["itemId"].as_u64() == Some(*item) || d["nome"].as_str() == Some(name) {
                                    let qty = number(&d["qtd"]);
                                    self.add(key, if qty == 0.0 { 1.0 } else { qty });
                                }
                            }
                        }
                    }
                },
                "bola" => { if e["shiny"] == true { self.add("shiniesVistos",1.0); } self.spend("bolas", &e["ballId"], 1.0); },
                "capturado" => { self.add("capturas",1.0); if e["pokemon"]["shiny"] == true { self.add("shinies",1.0); } },
                "cura" => self.spend("pocoes", &e["itemId"], 1.0),
                "revive" => self.spend("revives", &e["itemId"], 1.0),
                "bossEntrou" => {
                    let fallback = json!({"itemId":70000,"qtd":1});
                    let entry = e.get("entrada").filter(|v| !v.is_null()).unwrap_or(&fallback);
                    self.spend("tokens", &entry["itemId"], entry.get("qtd").map(number).unwrap_or(1.0));
                },
                _ => {},
            }
        }
    }
}
