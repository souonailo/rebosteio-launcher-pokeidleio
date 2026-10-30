use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

// =========================================================================
// 1. CONSTANTS, CONTRACTS & SCHEMAS
// =========================================================================

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_HISTORY_PER_ACCOUNT: usize = 500;
pub const MAX_RULES_PER_ACCOUNT: usize = 50;
pub const MAX_RULE_ID_LEN: usize = 64;
pub const MAX_RULE_NAME_LEN: usize = 128;
pub const DEFAULT_SLOW_SCAN_MS: u64 = 45000;
pub const DEFAULT_FAST_SCAN_MS: u64 = 3000;
pub const DEFAULT_MAX_SLOTS: u32 = 5;
pub const VIP_MAX_SLOTS: u32 = 15;
pub const BUY_TIMEOUT_SECS: u64 = 12;

fn default_scan_interval_ms() -> u64 { DEFAULT_SLOW_SCAN_MS }
fn default_fast_scan_interval_ms() -> u64 { DEFAULT_FAST_SCAN_MS }
fn default_max_active_slots() -> u32 { DEFAULT_MAX_SLOTS }
fn default_auto_max_affordable() -> bool { true }
fn default_shiny_gold() -> u64 { 50000 }
fn default_p5_gold() -> u64 { 100000 }
fn default_min_note() -> f64 { 7.0 }
fn default_note_gold() -> u64 { 50000 }
fn default_true() -> bool { true }
fn default_scan_mode() -> String { "original".to_string() }

// =========================================================================
// 1.1 CANONICAL CATALOG & CATEGORIES (EXACT 75-ITEM METADATA)
// =========================================================================

static CATALOG_JSON: &str = include_str!("../../ui/src/ui/sniper-catalog.json");

pub const ALLOWED_CATEGORIES: &[&str] = &[
    "stone",
    "tm",
    "rare_loot",
    "beast",
    "casa",
    "box",
    "bicicleta",
    "fragment",
    "ticket",
];

#[derive(Debug, Clone, Deserialize)]
pub struct CatalogItem {
    pub id: u64,
    pub name: String,
    pub category: String,
    #[serde(rename = "categoryLabel", default)]
    pub category_label: Option<String>,
    #[serde(rename = "type", default)]
    pub item_type: Option<String>,
    #[serde(rename = "npcPrice", default)]
    pub npc_price: Option<u64>,
    #[serde(default)]
    pub aliases: Vec<String>,
}

pub struct SniperCatalog {
    pub items_by_id: HashMap<u64, CatalogItem>,
    pub ids_by_category: HashMap<String, Vec<u64>>,
    pub items_by_name: HashMap<String, u64>,
}

impl SniperCatalog {
    pub fn get() -> &'static SniperCatalog {
        static CATALOG: OnceLock<SniperCatalog> = OnceLock::new();
        CATALOG.get_or_init(|| {
            let parsed: Vec<CatalogItem> = serde_json::from_str(CATALOG_JSON)
                .expect("sniper-catalog.json must be valid embedded JSON");
            assert!(
                parsed.len() >= 80,
                "sniper-catalog.json must contain at least 80 canonical items (found {})",
                parsed.len()
            );
            let mut items_by_id = HashMap::with_capacity(parsed.len());
            let mut ids_by_category: HashMap<String, Vec<u64>> = HashMap::new();
            let mut items_by_name: HashMap<String, u64> = HashMap::with_capacity(parsed.len() * 2);
            for item in parsed {
                let name_norm = item.name.trim().to_lowercase();
                if !name_norm.is_empty() {
                    items_by_name.insert(name_norm, item.id);
                }
                for alias in &item.aliases {
                    let alias_norm = alias.trim().to_lowercase();
                    if !alias_norm.is_empty() {
                        items_by_name.insert(alias_norm, item.id);
                    }
                }
                ids_by_category.entry(item.category.clone()).or_default().push(item.id);
                items_by_id.insert(item.id, item);
            }
            SniperCatalog {
                items_by_id,
                ids_by_category,
                items_by_name,
            }
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SniperConfig {
    #[serde(default = "default_scan_mode")]
    pub scan_mode: String,
    #[serde(default = "default_scan_interval_ms")]
    pub scan_interval_ms: u64,
    #[serde(default = "default_fast_scan_interval_ms")]
    pub fast_scan_interval_ms: u64,
    #[serde(default = "default_max_active_slots")]
    pub max_active_slots: u32,
    #[serde(default = "default_auto_max_affordable")]
    pub auto_max_affordable: bool,

    // Global Pokémon sniper settings
    #[serde(default)]
    pub snipe_any_shiny: bool,
    #[serde(default = "default_shiny_gold")]
    pub max_price_shiny_gold: u64,
    #[serde(default)]
    pub max_price_shiny_gems: u64,

    #[serde(default)]
    pub snipe_any_p5: bool,
    #[serde(default = "default_p5_gold")]
    pub max_price_p5_gold: u64,
    #[serde(default)]
    pub max_price_p5_gems: u64,

    #[serde(default)]
    pub snipe_by_note: bool,
    #[serde(default = "default_min_note")]
    pub min_note: f64,
    #[serde(default = "default_note_gold")]
    pub max_price_note_gold: u64,
    #[serde(default)]
    pub max_price_note_gems: u64,

    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

impl Default for SniperConfig {
    fn default() -> Self {
        Self {
            scan_mode: default_scan_mode(),
            scan_interval_ms: default_scan_interval_ms(),
            fast_scan_interval_ms: default_fast_scan_interval_ms(),
            max_active_slots: default_max_active_slots(),
            auto_max_affordable: default_auto_max_affordable(),
            snipe_any_shiny: false,
            max_price_shiny_gold: default_shiny_gold(),
            max_price_shiny_gems: 0,
            snipe_any_p5: false,
            max_price_p5_gold: default_p5_gold(),
            max_price_p5_gems: 0,
            snipe_by_note: false,
            min_note: default_min_note(),
            max_price_note_gold: default_note_gold(),
            max_price_note_gems: 0,
            extra: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub target_type: String, // "item", "pokemon", or "category"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_category: Option<String>,
    #[serde(default)]
    pub target_id: Option<Value>,
    pub target_name: String,
    #[serde(default)]
    pub max_price_gold: u64,
    #[serde(default)]
    pub max_price_gems: u64,
    #[serde(default)]
    pub max_qty: u64,
    #[serde(default)]
    pub infinite: bool,
    #[serde(default = "default_true")]
    pub active: bool,
    #[serde(default)]
    pub total_bought: u64,
    #[serde(default, alias = "excluded_item_ids", alias = "excludedItemIds")]
    pub excluded_item_ids: Vec<u64>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

impl Default for Rule {
    fn default() -> Self {
        Self {
            id: String::new(),
            target_type: "item".to_string(),
            target_category: None,
            target_id: None,
            target_name: String::new(),
            max_price_gold: 0,
            max_price_gems: 0,
            max_qty: 0,
            infinite: false,
            active: true,
            total_bought: 0,
            excluded_item_ids: Vec::new(),
            extra: HashMap::new(),
        }
    }
}

impl Rule {
    pub fn target_id_as_u64(&self) -> Option<u64> {
        match &self.target_id {
            Some(Value::Number(n)) => n.as_u64().filter(|&id| id > 0),
            Some(Value::String(s)) => s.trim().parse::<u64>().ok().filter(|&id| id > 0),
            _ => None,
        }
    }

    pub fn matches_item(&self, item_id: Option<u64>, item_name: &str) -> bool {
        if self.target_type != "item" && !self.target_type.is_empty() {
            return false;
        }
        // Strict ID match: if target_id is set, it MUST match item_id exactly.
        if let Some(tid) = self.target_id_as_u64() {
            return item_id == Some(tid);
        }
        // Exact normalized name matching only (NO substring contains)
        let t_norm = self.target_name.trim().to_lowercase();
        let i_norm = item_name.trim().to_lowercase();
        !t_norm.is_empty() && !i_norm.is_empty() && t_norm == i_norm
    }

    pub fn matches_pokemon(&self, species_id: Option<u64>, poke_name: &str) -> bool {
        if self.target_type != "pokemon" {
            return false;
        }
        // Strict ID match: if target_id is set, it MUST match species_id exactly.
        if let Some(tid) = self.target_id_as_u64() {
            return species_id == Some(tid);
        }
        // Exact normalized name matching only (NO substring contains)
        let t_norm = self.target_name.trim().to_lowercase();
        let p_norm = poke_name.trim().to_lowercase();
        !t_norm.is_empty() && !p_norm.is_empty() && t_norm == p_norm
    }

    pub fn matches_category(&self, item_id: Option<u64>) -> bool {
        if self.target_type != "category" {
            return false;
        }
        let target_cat = match &self.target_category {
            Some(c) if !c.is_empty() => c,
            _ => return false,
        };
        let id = match item_id {
            Some(i) => i,
            None => return false,
        };
        if self.excluded_item_ids.contains(&id) {
            return false;
        }
        let catalog = SniperCatalog::get();
        if let Some(cat_item) = catalog.items_by_id.get(&id) {
            cat_item.category == *target_cat
        } else {
            false
        }
    }

    pub fn remaining_qty(&self, is_vip: bool) -> u64 {
        if self.infinite || (self.max_qty == 0 && self.infinite) {
            if is_vip {
                u64::MAX
            } else {
                20u64.saturating_sub(self.total_bought)
            }
        } else if self.max_qty > 0 {
            let effective_max = if is_vip { self.max_qty } else { self.max_qty.min(20) };
            effective_max.saturating_sub(self.total_bought)
        } else {
            0
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SniperLogEntry {
    pub id: String,
    pub timestamp: u64,
    pub status: String,
    pub target_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qty: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offer_id: Option<u64>,
    pub details: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_index: Option<usize>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PendingBuyIntent {
    pub offer_id: u64,
    pub rule_id: Option<String>,
    pub target_name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub seller: String,
    pub qty: u64,
    pub price: u64,
    pub currency: String,
    pub timestamp: u64,
    pub accounted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AccountState {
    pub index: usize,
    pub enabled: bool,
    #[serde(default)]
    pub configured: bool,
    pub rules: Vec<Rule>,
    pub config: SniperConfig,
    pub logs: Vec<SniperLogEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_intent: Option<PendingBuyIntent>,
    #[serde(default)]
    pub history_cleared_at: u64,
}

impl AccountState {
    pub fn new(index: usize) -> Self {
        Self {
            index,
            enabled: false,
            configured: false,
            rules: Vec::new(),
            config: SniperConfig::default(),
            logs: Vec::new(),
            pending_intent: None,
            history_cleared_at: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SniperSnapshot {
    pub accounts: Vec<AccountState>,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SniperSettingsInput {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub rules: Vec<Rule>,
    #[serde(default)]
    pub config: SniperConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleProgress {
    pub id: String,
    pub total_bought: u64,
}

// =========================================================================
// 2. CANONICAL CATALOG RESOLUTION
// =========================================================================

pub fn resolve_canonical_item_id(name: &str) -> Option<u64> {
    let q = name.trim().to_lowercase();
    if let Some(&id) = SniperCatalog::get().items_by_name.get(&q) {
        return Some(id);
    }
    match q.as_str() {
        "diamantes" | "diamante" => Some(999999),
        "ancient stone" | "pedra antiga" => Some(2),
        "cocoon stone" | "pedra casulo" => Some(23),
        "crystal stone" | "pedra de cristal" => Some(28),
        "darkness stone" | "pedra da escuridão" | "pedra escuridao" => Some(31),
        "earth stone" | "pedra da terra" => Some(40),
        "enigma stone" | "pedra enigma" => Some(45),
        "feather stone" | "pedra da pena" => Some(49),
        "fire stone" | "pedra de fogo" | "pedra do fogo" => Some(53),
        "heart stone" | "pedra do coração" | "pedra coracao" => Some(66),
        "ice stone" | "pedra de gelo" | "pedra do gelo" => Some(71),
        "leaf stone" | "pedra da folha" => Some(76),
        "metal stone" | "pedra de metal" => Some(87),
        "punch stone" | "pedra do soco" => Some(106),
        "rock stone" | "pedra da rocha" => Some(109),
        "sun stone" | "pedra do sol" => Some(209),
        "thunder stone" | "pedra do trovão" | "pedra trovao" => Some(133),
        "venom stone" | "pedra do veneno" => Some(139),
        "water stone" | "pedra da água" | "pedra da agua" => Some(142),
        "bug shiny stone" => Some(70031),
        "dark shiny stone" => Some(70035),
        "dragon shiny stone" => Some(70034),
        "electric shiny stone" => Some(70024),
        "fairy shiny stone" => Some(70037),
        "fighting shiny stone" => Some(70026),
        "fire shiny stone" => Some(70021),
        "flying shiny stone" => Some(70029),
        "ghost shiny stone" => Some(70033),
        "grass shiny stone" => Some(70023),
        "ground shiny stone" => Some(70028),
        "ice shiny stone" => Some(70025),
        "normal shiny stone" => Some(70020),
        "poison shiny stone" => Some(70027),
        "psychic shiny stone" => Some(70030),
        "rock shiny stone" => Some(70032),
        "steel shiny stone" => Some(70036),
        "water shiny stone" => Some(70022),
        "aoe tm disk" => Some(40575),
        "aoe tm disk piece" => Some(40530),
        "tm disk piece" => Some(59194),
        "shiny stone fragment" => Some(70012),
        "key fragment" | "fragmento de chave" => Some(70011),
        "bronze boss token" => Some(70000),
        "bicycle fragment" | "fragmento de bicicleta" => Some(70013),
        "beast ball" => Some(5),
        "common house" | "casa comum" => Some(70040),
        "uncommon house" | "casa incomum" => Some(70041),
        "rare house" | "casa rara" => Some(70042),
        "mythic house" | "casa mitica" | "casa mítica" => Some(70043),
        "legendary house" | "casa lendaria" | "casa lendária" => Some(70044),
        "founder box" | "caixa fundador" => Some(70060),
        "co-founder box" | "caixa cofundador" => Some(70061),
        "common bicycle" | "bicicleta comum" => Some(70080),
        "uncommon bicycle" | "bicicleta incomum" => Some(70081),
        "rare bicycle" | "bicicleta rara" => Some(70082),
        "mythic bicycle" | "bicicleta mitica" | "bicicleta mítica" => Some(70083),
        "legendary bicycle" | "bicicleta lendaria" | "bicicleta lendária" => Some(70084),
        _ => None,
    }
}

pub fn resolve_pokemon_dex_id(name: &str) -> Option<u64> {
    let q = name.trim().to_lowercase();
    match q.as_str() {
        "bulbasaur" => Some(1), "ivysaur" => Some(2), "venusaur" => Some(3),
        "charmander" => Some(4), "charmeleon" => Some(5), "charizard" => Some(6),
        "squirtle" => Some(7), "wartortle" => Some(8), "blastoise" => Some(9),
        "caterpie" => Some(10), "metapod" => Some(11), "butterfree" => Some(12),
        "weedle" => Some(13), "kakuna" => Some(14), "beedrill" => Some(15),
        "pidgey" => Some(16), "pidgeotto" => Some(17), "pidgeot" => Some(18),
        "rattata" => Some(19), "raticate" => Some(20), "spearow" => Some(21),
        "pikachu" => Some(25), "raichu" => Some(26), "mewtwo" => Some(150),
        "mew" => Some(151), "ditto" => Some(132), "eevee" => Some(133),
        "snorlax" => Some(143), "articuno" => Some(144), "zapdos" => Some(145),
        "moltres" => Some(146), "dratini" => Some(147), "dragonite" => Some(149),
        "lugia" => Some(249), "ho-oh" | "ho oh" => Some(250), "celebi" => Some(251),
        "rayquaza" => Some(384), "kyogre" => Some(382), "groudon" => Some(383),
        _ => None,
    }
}

pub fn normalize_currency(moeda: &str) -> &'static str {
    let m = moeda.trim().to_lowercase();
    match m.as_str() {
        "gold" | "coins" | "coin" | "ouro" => "gold",
        "orb" | "orbs" | "gemas" | "gema" | "gems" | "pontos" => "orb",
        // Diamonds are separate; custom sniper rules do not permit diamonds
        _ => "unsupported",
    }
}

// =========================================================================
// 3. PERSISTENT STORE & RUNTIME TYPES
// =========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SniperStore {
    pub accounts: [AccountState; 4],
    pub version: u32,
}

impl Default for SniperStore {
    fn default() -> Self {
        Self {
            accounts: [
                AccountState::new(0),
                AccountState::new(1),
                AccountState::new(2),
                AccountState::new(3),
            ],
            version: PROTOCOL_VERSION,
        }
    }
}

impl SniperStore {
    pub fn to_snapshot(&self) -> SniperSnapshot {
        SniperSnapshot {
            accounts: self.accounts.to_vec(),
            version: PROTOCOL_VERSION,
        }
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, PartialEq)]
pub enum BuyState {
    PendingConfirmation,
    UncertainBlocked,
}

#[derive(Debug, Clone)]
pub struct OutstandingBuy {
    pub offer_id: u64,
    pub rule_id: Option<String>,
    pub target_name: String,
    pub seller: String,
    pub qty: u64,
    pub price: u64,
    pub currency: String,
    pub sent_at: Instant,
    pub retry_count: u32,
    pub reserved_amount: u64,
    pub state: BuyState,
    pub aux_log_keys: HashSet<String>,
}

impl OutstandingBuy {
    pub fn allow_aux_log(&mut self, dedup_key: String) -> bool {
        if self.aux_log_keys.len() >= 5 || self.aux_log_keys.contains(&dedup_key) {
            return false;
        }
        self.aux_log_keys.insert(dedup_key);
        true
    }
}

#[derive(Debug, Clone)]
pub struct ScheduledOffer {
    pub offer_id: u64,
    pub rule_id: Option<String>,
    pub target_name: String,
    pub buy_qty: u64,
    pub price: u64,
    pub currency: String,
    pub scheduled_at: Instant,
    pub release_at: Instant,
    pub attempts: u32,
    pub seller: String,
    pub item_id: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct ScheduledQuery {
    pub execute_at: Instant,
    pub payload: Value,
}

#[derive(Debug)]
pub struct AccountRuntime {
    pub gold: i64,
    pub diamonds: i64,
    pub orbs: i64,
    pub is_vip: bool,
    pub reserved_gold: u64,
    pub reserved_orbs: u64,
    pub server_offset_ms: i64,
    pub last_scan_instant: Option<Instant>,
    pub scan_cycle: usize,
    pub hot_until: Option<Instant>,
    pub bought_offers: HashMap<u64, Instant>,
    pub confirmed_offers: HashSet<u64>,
    pub scheduled_offers: HashMap<u64, ScheduledOffer>,
    pub scheduled_queries: Vec<ScheduledQuery>,
    pub outstanding_buy: Option<OutstandingBuy>,
}

impl Default for AccountRuntime {
    fn default() -> Self {
        Self {
            gold: -1,
            diamonds: -1,
            orbs: -1,
            is_vip: false,
            reserved_gold: 0,
            reserved_orbs: 0,
            server_offset_ms: 0,
            last_scan_instant: None,
            scan_cycle: 0,
            hot_until: None,
            bought_offers: HashMap::new(),
            confirmed_offers: HashSet::new(),
            scheduled_offers: HashMap::new(),
            scheduled_queries: Vec::new(),
            outstanding_buy: None,
        }
    }
}

impl AccountRuntime {
    pub fn server_now_ms(&self) -> u64 {
        let local = now_ms() as i64;
        (local - self.server_offset_ms).max(0) as u64
    }

    pub fn is_hot(&self) -> bool {
        if !self.scheduled_offers.is_empty() {
            return true;
        }
        if let Some(until) = self.hot_until {
            if Instant::now() < until {
                return true;
            }
        }
        false
    }

    pub fn available_balance(&self, currency: &str) -> Option<u64> {
        match normalize_currency(currency) {
            "gold" => {
                if self.gold < 0 { None } else { Some((self.gold as u64).saturating_sub(self.reserved_gold)) }
            }
            "orb" => {
                if self.orbs < 0 { None } else { Some((self.orbs as u64).saturating_sub(self.reserved_orbs)) }
            }
            _ => None,
        }
    }

    pub fn reserve(&mut self, currency: &str, amount: u64) {
        match normalize_currency(currency) {
            "gold" => self.reserved_gold = self.reserved_gold.saturating_add(amount),
            "orb" => self.reserved_orbs = self.reserved_orbs.saturating_add(amount),
            _ => {}
        }
    }

    pub fn release_reservation(&mut self, currency: &str, amount: u64) {
        match normalize_currency(currency) {
            "gold" => self.reserved_gold = self.reserved_gold.saturating_sub(amount),
            "orb" => self.reserved_orbs = self.reserved_orbs.saturating_sub(amount),
            _ => {}
        }
    }

    pub fn prune_old_records(&mut self) {
        let now = Instant::now();
        self.bought_offers.retain(|_, ts| now.duration_since(*ts) < Duration::from_secs(60));
        if self.confirmed_offers.len() > 3000 {
            self.confirmed_offers.clear();
        }
        if self.scheduled_offers.len() > 500 {
            self.scheduled_offers.clear();
        }
    }

    pub fn clear_scheduled_queries(&mut self) {
        self.scheduled_queries.clear();
    }
}

// =========================================================================
// 4. UNIFIED ENGINE (STORE + 4 RUNTIMES + PERSISTENCE)
// =========================================================================

pub struct SniperEngine {
    pub store: SniperStore,
    pub runtimes: [AccountRuntime; 4],
    pub storage_path: Option<PathBuf>,
}

impl SniperEngine {
    pub fn new(storage_path: Option<PathBuf>) -> Result<Self, String> {
        let store = if let Some(ref path) = storage_path {
            match std::fs::read(path) {
                Ok(bytes) => match serde_json::from_slice::<SniperStore>(&bytes) {
                    Ok(mut s) => {
                        if s.version > PROTOCOL_VERSION {
                            return Err(format!("Unsupported future sniper configuration version {} (expected <= {})", s.version, PROTOCOL_VERSION));
                        }
                        s.version = PROTOCOL_VERSION;
                        for i in 0..4 {
                            s.accounts[i].index = i;
                            validate_config(&s.accounts[i].config)?;
                            if s.accounts[i].rules.len() > MAX_RULES_PER_ACCOUNT {
                                return Err(format!("Account {} has {} rules, exceeding maximum {}", i, s.accounts[i].rules.len(), MAX_RULES_PER_ACCOUNT));
                            }
                            let mut seen_ids = HashSet::new();
                            for rule in &s.accounts[i].rules {
                                if rule.id.trim().is_empty() || rule.id.len() > MAX_RULE_ID_LEN {
                                    return Err(format!("Invalid rule ID in loaded store: '{}'", rule.id));
                                }
                                if !seen_ids.insert(rule.id.clone()) {
                                    return Err(format!("Duplicate rule ID '{}' in loaded store account {}", rule.id, i));
                                }
                                if rule.target_name.len() > MAX_RULE_NAME_LEN {
                                    return Err(format!("Target name too long in loaded store: '{}'", rule.target_name));
                                }
                                if rule.target_type != "item" && rule.target_type != "pokemon" && rule.target_type != "category" {
                                    return Err(format!("Unsupported targetType '{}' in loaded store", rule.target_type));
                                }
                                if rule.target_type == "category" {
                                    let cat = match &rule.target_category {
                                        Some(c) if !c.trim().is_empty() => c.trim().to_lowercase(),
                                        _ => return Err(format!("Category rule '{}' in loaded store requires valid targetCategory", rule.target_name)),
                                    };
                                    if !ALLOWED_CATEGORIES.contains(&cat.as_str()) {
                                        return Err(format!("Unsupported targetCategory '{}' in loaded store rule '{}'", cat, rule.target_name));
                                    }
                                    const JS_MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
                                    let catalog = SniperCatalog::get();
                                    for &eid in &rule.excluded_item_ids {
                                        if eid == 0 || eid > JS_MAX_SAFE_INTEGER {
                                            return Err(format!("Invalid nonpositive or unsafe excludedItemId ({}) in loaded store rule '{}'", eid, rule.target_name));
                                        }
                                        match catalog.items_by_id.get(&eid) {
                                            Some(cat_item) => {
                                                if cat_item.category != cat {
                                                    return Err(format!(
                                                        "Excluded item #{} does not belong to category '{}' in loaded store rule '{}'",
                                                        eid, cat, rule.target_name
                                                    ));
                                                }
                                            }
                                            None => {
                                                return Err(format!(
                                                    "Excluded item #{} not found in catalog for loaded store rule '{}'",
                                                    eid, rule.target_name
                                                ));
                                            }
                                        }
                                    }
                                } else {
                                    if !rule.excluded_item_ids.is_empty() {
                                        return Err(format!(
                                            "Loaded rule '{}' has non-empty excluded_item_ids for non-category target_type '{}'",
                                            rule.target_name, rule.target_type
                                        ));
                                    }
                                    if let Some(ref cat) = rule.target_category {
                                        if !cat.trim().is_empty() && !ALLOWED_CATEGORIES.contains(&cat.trim().to_lowercase().as_str()) {
                                            return Err(format!("Unsupported targetCategory '{}' in loaded store rule '{}'", cat, rule.target_name));
                                        }
                                    }
                                }
                                validate_rule_extra(&rule.extra, rule.max_price_gems, &rule.target_name)?;
                                if rule.target_type != "category" {
                                    if let Some(ref tid_val) = rule.target_id {
                                        let parsed_opt = match tid_val {
                                            Value::Number(n) => n.as_u64(),
                                            Value::String(str_val) => str_val.trim().parse::<u64>().ok(),
                                            _ => None,
                                        };
                                        if parsed_opt.unwrap_or(0) == 0 {
                                            return Err(format!("Invalid nonpositive targetId in loaded store rule '{}'", rule.target_name));
                                        }
                                    }
                                }
                                if rule.max_price_gold == 0 && rule.max_price_gems == 0 {
                                    return Err(format!("Rule '{}' has zero price limits in loaded store", rule.target_name));
                                }
                            }
                            if s.accounts[i].logs.len() > MAX_HISTORY_PER_ACCOUNT {
                                s.accounts[i].logs.truncate(MAX_HISTORY_PER_ACCOUNT);
                            }
                        }
                        s
                    }
                    Err(e) => return Err(format!("Corrupt sniper configuration file: {}", e)),
                },
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => SniperStore::default(),
                Err(e) => return Err(format!("Failed to read sniper configuration: {}", e)),
            }
        } else {
            SniperStore::default()
        };

        let mut runtimes = [
            AccountRuntime::default(),
            AccountRuntime::default(),
            AccountRuntime::default(),
            AccountRuntime::default(),
        ];

        // Restore pending intent into runtime if present on disk
        for i in 0..4 {
            if let Some(ref intent) = store.accounts[i].pending_intent {
                runtimes[i].outstanding_buy = Some(OutstandingBuy {
                    offer_id: intent.offer_id,
                    rule_id: intent.rule_id.clone(),
                    target_name: intent.target_name.clone(),
                    seller: intent.seller.clone(),
                    qty: intent.qty,
                    price: intent.price,
                    currency: intent.currency.clone(),
                    sent_at: Instant::now(),
                    retry_count: 1,
                    reserved_amount: intent.qty.saturating_mul(intent.price),
                    state: BuyState::UncertainBlocked,
                    aux_log_keys: HashSet::new(),
                });
            }
        }

        Ok(Self {
            store,
            runtimes,
            storage_path,
        })
    }

    pub fn persist_store_candidate(&self, candidate: &SniperStore) -> Result<(), String> {
        if let Some(ref file) = self.storage_path {
            if let Some(parent) = file.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let temporary = file.with_extension("json.tmp");
            let bytes = serde_json::to_vec_pretty(candidate).map_err(|e| e.to_string())?;
            std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
            std::fs::rename(&temporary, file).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn get_snapshot(&self) -> SniperSnapshot {
        self.store.to_snapshot()
    }

    pub fn save_settings(
        &mut self,
        indices: Vec<usize>,
        settings: SniperSettingsInput,
    ) -> Result<SniperSnapshot, String> {
        if indices.is_empty() {
            return Err("Nenhum índice de conta informado".into());
        }
        for &idx in &indices {
            if idx > 3 {
                return Err(format!("Índice de conta inválido: {} (deve ser 0..3)", idx));
            }
        }

        validate_config(&settings.config)?;

        if settings.rules.len() > MAX_RULES_PER_ACCOUNT {
            return Err(format!("Número de regras excede limite máximo de {}", MAX_RULES_PER_ACCOUNT));
        }

        let mut seen_ids = HashSet::new();
        let mut validated_rules = settings.rules.clone();
        for rule in &mut validated_rules {
            if rule.id.trim().is_empty() || rule.id.len() > MAX_RULE_ID_LEN {
                return Err(format!("ID de regra inválido ou longo demais (máx {} chars)", MAX_RULE_ID_LEN));
            }
            if !seen_ids.insert(rule.id.clone()) {
                return Err(format!("ID de regra duplicado no mesmo payload: '{}'", rule.id));
            }
            if rule.target_name.len() > MAX_RULE_NAME_LEN {
                return Err(format!("Nome de alvo longo demais (máx {} chars)", MAX_RULE_NAME_LEN));
            }
            if rule.target_type != "item" && rule.target_type != "pokemon" && rule.target_type != "category" {
                return Err(format!("targetType '{}' não suportado (apenas 'item', 'pokemon' ou 'category')", rule.target_type));
            }

            if rule.target_type == "category" {
                let cat = match &rule.target_category {
                    Some(c) if !c.trim().is_empty() => c.trim().to_lowercase(),
                    _ => return Err(format!("Regra de categoria '{}' requer targetCategory válido", rule.target_name)),
                };
                if !ALLOWED_CATEGORIES.contains(&cat.as_str()) {
                    return Err(format!("targetCategory '{}' desconhecido ou não suportado na regra '{}'. Categorias suportadas: {:?}", cat, rule.target_name, ALLOWED_CATEGORIES));
                }
                rule.target_category = Some(cat.clone());
                rule.target_id = None; // targetId=null for category

                // Validate excluded_item_ids: must be positive integers belonging to the rule's canonical category
                const JS_MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
                let catalog = SniperCatalog::get();
                let mut valid_excluded: Vec<u64> = Vec::new();
                for &eid in &rule.excluded_item_ids {
                    if eid == 0 || eid > JS_MAX_SAFE_INTEGER {
                        return Err(format!("Regra '{}': item excluído possui ID inválido ou fora dos limites ({})", rule.target_name, eid));
                    }
                    match catalog.items_by_id.get(&eid) {
                        Some(cat_item) => {
                            if cat_item.category != cat {
                                return Err(format!(
                                    "Regra '{}': item excluído #{} ('{}') pertence à categoria '{}', mas a regra é da categoria '{}'",
                                    rule.target_name, eid, cat_item.name, cat_item.category, cat
                                ));
                            }
                            if !valid_excluded.contains(&eid) {
                                valid_excluded.push(eid);
                            }
                        }
                        None => {
                            return Err(format!(
                                "Regra '{}': item excluído #{} não existe no catálogo canônico",
                                rule.target_name, eid
                            ));
                        }
                    }
                }
                rule.excluded_item_ids = valid_excluded;
            } else {
                if !rule.excluded_item_ids.is_empty() {
                    return Err(format!(
                        "Regra '{}': excluded_item_ids só é permitido em regras de categoria, mas o target_type é '{}'",
                        rule.target_name, rule.target_type
                    ));
                }
                if let Some(ref cat) = rule.target_category {
                    if !cat.trim().is_empty() && !ALLOWED_CATEGORIES.contains(&cat.trim().to_lowercase().as_str()) {
                        return Err(format!("targetCategory '{}' desconhecido na regra '{}'", cat, rule.target_name));
                    }
                }
            }

            // Check restrictive unknown filters and validate inert duplicate maxPriceDiamonds
            validate_rule_extra(&rule.extra, rule.max_price_gems, &rule.target_name)?;

            // Validate target_id if present: MUST be positive integer > 0
            if rule.target_type != "category" {
                if let Some(ref tid_val) = rule.target_id {
                    let parsed_opt = match tid_val {
                        Value::Number(n) => n.as_u64(),
                        Value::String(s) => s.trim().parse::<u64>().ok(),
                        _ => None,
                    };
                    match parsed_opt {
                        Some(n) if n > 0 => {
                            rule.target_id = Some(json!(n));
                        }
                        _ => {
                            return Err(format!("Regra '{}' possui targetId inválido ou não-positivo: {:?}", rule.target_name, tid_val));
                        }
                    }
                }
            }

            // Resolve catalog ID for items if target_id is absent
            if rule.target_type == "item" {
                if rule.target_id.is_none() {
                    if let Some(cid) = resolve_canonical_item_id(&rule.target_name) {
                        rule.target_id = Some(json!(cid));
                    } else {
                        return Err(format!("Item '{}' desconhecido no catálogo canônico; targetId numérico é obrigatório", rule.target_name));
                    }
                }
            } else if rule.target_type == "pokemon" {
                if rule.target_id.is_none() {
                    if let Some(did) = resolve_pokemon_dex_id(&rule.target_name) {
                        rule.target_id = Some(json!(did));
                    } else if rule.target_name.trim().is_empty() {
                        return Err("Regra de pokémon precisa de speciesId ou nome válido".into());
                    }
                }
            } else if rule.target_type == "category" {
                // targetId is null for category rules
                rule.target_id = None;
            }

            if rule.max_price_gold == 0 && rule.max_price_gems == 0 {
                return Err(format!("Regra '{}' sem teto de preço válido; rejeitada por segurança", rule.target_name));
            }
        }

        // Clone candidate store before mutating
        let mut candidate = self.store.clone();
        let is_universal_save = indices.len() > 1;

        for &idx in &indices {
            let current_account = &candidate.accounts[idx];
            let old_counters: HashMap<String, u64> = current_account
                .rules
                .iter()
                .map(|r| (r.id.clone(), r.total_bought))
                .collect();

            let mut updated_rules = validated_rules.clone();
            for rule in &mut updated_rules {
                if let Some(&saved_count) = old_counters.get(&rule.id) {
                    rule.total_bought = saved_count;
                } else if is_universal_save {
                    // Universal save zeros new rule counters
                    rule.total_bought = 0;
                }
            }

            candidate.accounts[idx].rules = updated_rules;
            candidate.accounts[idx].config = settings.config.clone();
            candidate.accounts[idx].enabled = settings.enabled;
            candidate.accounts[idx].configured = true;
        }

        // Persist candidate to disk FIRST. If disk write fails, memory is completely untouched!
        self.persist_store_candidate(&candidate)?;

        // Commit candidate to live in-memory store
        self.store = candidate;

        // Apply runtime adjustments
        for &idx in &indices {
            // Cancel all queued/scheduled offers and scheduled queries on settings modification
            self.runtimes[idx].scheduled_offers.clear();
            self.runtimes[idx].clear_scheduled_queries();
            // Retain outstanding_buy correlation even if disabled, but prevent new purchases
        }

        Ok(self.store.to_snapshot())
    }

    pub fn clear_history(&mut self, index: usize) -> Result<SniperSnapshot, String> {
        if index > 3 {
            return Err(format!("Índice inválido: {} (deve ser 0..3)", index));
        }
        let mut candidate = self.store.clone();
        candidate.accounts[index].logs.clear();
        candidate.accounts[index].history_cleared_at = now_ms();
        self.persist_store_candidate(&candidate)?;
        self.store = candidate;
        Ok(self.store.to_snapshot())
    }

    pub fn ingest_logs(
        &mut self,
        index: usize,
        incoming_logs: Vec<SniperLogEntry>,
        progress: Option<Vec<RuleProgress>>,
    ) -> Result<SniperSnapshot, String> {
        if index > 3 {
            return Err(format!("Índice inválido: {} (deve ser 0..3)", index));
        }

        let mut candidate = self.store.clone();
        let account = &mut candidate.accounts[index];
        let mut mutated = false;

        // Apply progress monotonically if supplied
        if let Some(prog_list) = progress {
            for p in prog_list {
                if let Some(r) = account.rules.iter_mut().find(|r| r.id == p.id) {
                    let next = r.total_bought.max(p.total_bought);
                    if next != r.total_bought {
                        r.total_bought = next;
                        mutated = true;
                    }
                }
            }
        }

        let cutoff = account.history_cleared_at;

        // Ingest logs deduped, skipping logs at or before history_cleared_at
        let mut existing_ids: HashSet<String> = account.logs.iter().map(|l| l.id.clone()).collect();
        for mut log in incoming_logs {
            if cutoff > 0 && log.timestamp <= cutoff {
                continue;
            }
            if log.id.is_empty() {
                log.id = format!("ingest_{}_{}", log.timestamp, now_ms());
            }
            if !existing_ids.contains(&log.id) {
                existing_ids.insert(log.id.clone());
                account.logs.insert(0, log);
                mutated = true;
            }
        }

        let before_len = account.logs.len();
        enforce_account_log_limits(&mut account.logs);
        if account.logs.len() != before_len {
            mutated = true;
        }

        if mutated {
            self.persist_store_candidate(&candidate)?;
            self.store = candidate;
        }

        Ok(self.store.to_snapshot())
    }

    pub fn feed_welcome(&mut self, index: usize, msg: &Value) {
        if index > 3 { return; }
        let rt = &mut self.runtimes[index];

        let data = msg.get("data").unwrap_or(msg);
        let est = data.get("estado")
            .or_else(|| msg.get("estado"))
            .or_else(|| data.get("payload").and_then(|p| p.get("estado")))
            .or_else(|| msg.get("payload").and_then(|p| p.get("estado")))
            .or_else(|| data.get("payload"))
            .or_else(|| msg.get("payload"))
            .or_else(|| data.get("jogador"))
            .or_else(|| msg.get("jogador"));

        let player = est.unwrap_or(data);
        let trainer = player.get("eu")
            .or_else(|| player.get("jogador"))
            .or_else(|| data.get("eu"))
            .or_else(|| msg.get("eu"))
            .unwrap_or(player);

        // 1. Server time offset
        let srv_agora = trainer.get("servidorAgora")
            .or_else(|| player.get("servidorAgora"))
            .or_else(|| data.get("servidorAgora"))
            .or_else(|| msg.get("servidorAgora"))
            .or_else(|| trainer.get("agora"))
            .or_else(|| player.get("agora"))
            .or_else(|| data.get("agora"))
            .or_else(|| msg.get("agora"))
            .and_then(|v| v.as_u64());
        if let Some(srv) = srv_agora {
            rt.server_offset_ms = (now_ms() as i64) - (srv as i64);
        }

        // 2. Gold
        let gold = trainer.get("gold")
            .or_else(|| trainer.get("ouro"))
            .or_else(|| player.get("gold"))
            .or_else(|| player.get("ouro"))
            .or_else(|| data.get("gold"))
            .or_else(|| data.get("ouro"))
            .or_else(|| msg.get("gold"))
            .or_else(|| msg.get("ouro"))
            .and_then(|v| v.as_i64());
        if let Some(g) = gold { rt.gold = g; }

        // 3. Diamonds
        let diamonds = trainer.get("diamonds")
            .or_else(|| trainer.get("diamantes"))
            .or_else(|| player.get("diamonds"))
            .or_else(|| player.get("diamantes"))
            .or_else(|| data.get("diamonds"))
            .or_else(|| data.get("diamantes"))
            .or_else(|| msg.get("diamonds"))
            .or_else(|| msg.get("diamantes"))
            .and_then(|v| v.as_i64());
        if let Some(d) = diamonds { rt.diamonds = d; }

        // 4. Orbs / Gemas
        let orbs = trainer.get("orbs")
            .or_else(|| trainer.get("gemas"))
            .or_else(|| trainer.get("gems"))
            .or_else(|| player.get("orbs"))
            .or_else(|| player.get("gemas"))
            .or_else(|| player.get("gems"))
            .or_else(|| data.get("orbs"))
            .or_else(|| data.get("gemas"))
            .or_else(|| data.get("gems"))
            .or_else(|| msg.get("orbs"))
            .or_else(|| msg.get("gemas"))
            .or_else(|| msg.get("gems"))
            .and_then(|v| v.as_i64());
        if let Some(o) = orbs { rt.orbs = o; }

        // 5. VIP status
        let vip_ate = trainer.get("vipAte")
            .or_else(|| player.get("vipAte"))
            .or_else(|| data.get("vipAte"))
            .or_else(|| msg.get("vipAte"))
            .and_then(|v| v.as_u64());
        if let Some(ate) = vip_ate {
            rt.is_vip = ate > now_ms();
        }
    }

    pub fn on_connect(&mut self, index: usize) -> Vec<Value> {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        self.on_connect_at(index, now_ms)
    }

    pub fn on_connect_at(&mut self, index: usize, now_ms_val: u64) -> Vec<Value> {
        if index > 3 { return Vec::new(); }
        let rt = &mut self.runtimes[index];
        rt.scheduled_offers.clear();
        rt.clear_scheduled_queries();
        rt.reserved_gold = 0;
        rt.reserved_orbs = 0;
        rt.last_scan_instant = None;
        rt.hot_until = None;
        rt.scan_cycle = 0;

        // Any pending intent from previous session is already accounted on disk!
        // Clear transient state without double-counting.
        let _ = rt.outstanding_buy.take();
        if self.store.accounts[index].pending_intent.is_some() {
            let mut candidate = self.store.clone();
            candidate.accounts[index].pending_intent = None;
            let _ = self.persist_store_candidate(&candidate);
            self.store = candidate;
        }

        if !self.store.accounts[index].enabled {
            return Vec::new();
        }

        // Single unified scheduler path on connect:
        // Trigger initial scan at t=0 through on_tick!
        // This emits market.itens immediately at t=0, schedules cycle 1 (gold) at +700ms,
        // sets last_scan_instant, and prevents premature queries or query duplication.
        self.on_tick(index, now_ms_val, None)
    }

    pub fn on_disconnect(&mut self, index: usize, app: Option<&AppHandle>) {
        if index > 3 { return; }
        let rt = &mut self.runtimes[index];
        rt.scheduled_offers.clear();
        rt.clear_scheduled_queries();
        // Clear wallet to unknown on disconnect before fresh handshake; do not preserve stale wallet
        rt.gold = -1;
        rt.diamonds = -1;
        rt.orbs = -1;

        if let Some(buy) = rt.outstanding_buy.take() {
            rt.release_reservation(&buy.currency, buy.reserved_amount);
            let mut candidate = self.store.clone();
            let acc = &mut candidate.accounts[index];
            // Quantity was ALREADY preconsumed in try_emit_buy! Do NOT add again!
            let entry = SniperLogEntry {
                id: format!("disc_{}_{}", now_ms(), buy.offer_id),
                timestamp: now_ms(),
                status: "INCERTO".into(),
                target_name: buy.target_name,
                price: Some(buy.price),
                currency: Some(buy.currency),
                qty: Some(buy.qty),
                offer_id: Some(buy.offer_id),
                details: "Desconectado com ordem em andamento; limite consumido preventivamente por segurança.".into(),
                account_index: Some(index),
                extra: HashMap::new(),
            };
            add_log_to_account(acc, entry);
            let _ = self.persist_store_candidate(&candidate);
            self.store = candidate;
            if let Some(a) = app {
                let _ = a.emit("sniper:updated", &self.store.to_snapshot());
            }
        }
    }

    pub fn on_send_failure(&mut self, index: usize, cmd: &Value) {
        if index > 3 { return; }
        let cmd_t = cmd.get("t").and_then(|v| v.as_str()).unwrap_or("");
        let offer_id = cmd.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
        if cmd_t != "market.comprar" || offer_id == 0 {
            return;
        }
        let rt = &mut self.runtimes[index];
        if let Some(buy) = &rt.outstanding_buy {
            if buy.offer_id != offer_id {
                return;
            }
        } else {
            return;
        }
        if let Some(buy) = rt.outstanding_buy.take() {
            rt.release_reservation(&buy.currency, buy.reserved_amount);

            let mut candidate = self.store.clone();
            let acc = &mut candidate.accounts[index];

            // Rollback preconsumed quantity on send failure
            if let Some(ref rid) = buy.rule_id {
                if let Some(r) = acc.rules.iter_mut().find(|r| &r.id == rid) {
                    r.total_bought = r.total_bought.saturating_sub(buy.qty);
                }
            }
            acc.pending_intent = None;

            let entry = SniperLogEntry {
                id: format!("fail_{}_{}", now_ms(), offer_id),
                timestamp: now_ms(),
                status: "FALHA_ENVIO".into(),
                target_name: buy.target_name,
                price: Some(buy.price),
                currency: Some(buy.currency),
                qty: Some(buy.qty),
                offer_id: Some(offer_id),
                details: "Falha de transporte de socket ao emitir ordem de compra.".into(),
                account_index: Some(index),
                extra: HashMap::new(),
            };
            add_log_to_account(acc, entry);
            let _ = self.persist_store_candidate(&candidate);
            self.store = candidate;
        }
    }

    pub fn try_emit_buy(
        &mut self,
        index: usize,
        offer_id: u64,
        rule_id: Option<String>,
        target_name: String,
        buy_qty: u64,
        price: u64,
        currency: String,
        now_ms_val: u64,
    ) -> Option<Value> {
        self.try_emit_buy_with_seller(
            index,
            offer_id,
            rule_id,
            target_name,
            buy_qty,
            price,
            currency,
            String::new(),
            now_ms_val,
        )
    }

    pub fn try_emit_buy_with_seller(
        &mut self,
        index: usize,
        offer_id: u64,
        rule_id: Option<String>,
        target_name: String,
        buy_qty: u64,
        price: u64,
        currency: String,
        seller: String,
        now_ms_val: u64,
    ) -> Option<Value> {
        let total_cost = buy_qty.checked_mul(price)?;
        let avail = self.runtimes[index].available_balance(&currency)?;
        if avail < total_cost {
            return None;
        }

        let clean_seller = seller.trim().trim_start_matches('@').to_string();
        let mut candidate = self.store.clone();
        let acc = &mut candidate.accounts[index];

        // Preconsume budget on rule
        if let Some(ref rid) = rule_id {
            let r = acc.rules.iter_mut().find(|r| &r.id == rid)?;
            r.total_bought = r.total_bought.saturating_add(buy_qty);
        }

        acc.pending_intent = Some(PendingBuyIntent {
            offer_id,
            rule_id: rule_id.clone(),
            target_name: target_name.clone(),
            seller: clean_seller.clone(),
            qty: buy_qty,
            price,
            currency: currency.clone(),
            timestamp: now_ms_val,
            accounted: true,
        });

        let mut send_extra = HashMap::new();
        if !clean_seller.is_empty() {
            send_extra.insert("seller".into(), json!(clean_seller));
        }

        let entry = SniperLogEntry {
            id: format!("send_{}_{}", now_ms_val, offer_id),
            timestamp: now_ms_val,
            status: "DISPARADO".into(),
            target_name: target_name.clone(),
            price: Some(price),
            currency: Some(currency.clone()),
            qty: Some(buy_qty),
            offer_id: Some(offer_id),
            details: "Ordem emitida ao servidor, aguardando confirmação.".into(),
            account_index: Some(index),
            extra: send_extra,
        };
        add_log_to_account(acc, entry);

        // PERSIST FIRST: If disk write fails, return None! No buy, no committed memory!
        if let Err(e) = self.persist_store_candidate(&candidate) {
            eprintln!("[Sniper]: Falha ao persistir intenção de compra: {}", e);
            return None;
        }

        // Commit candidate on success
        self.store = candidate;

        // Commit runtime reservation & tracking
        let rt = &mut self.runtimes[index];
        rt.reserve(&currency, total_cost);
        rt.outstanding_buy = Some(OutstandingBuy {
            offer_id,
            rule_id,
            target_name,
            seller: clean_seller,
            qty: buy_qty,
            price,
            currency: currency.clone(),
            sent_at: Instant::now(),
            retry_count: 1,
            reserved_amount: total_cost,
            state: BuyState::PendingConfirmation,
            aux_log_keys: HashSet::new(),
        });
        rt.bought_offers.insert(offer_id, Instant::now());

        Some(json!({
            "t": "market.comprar",
            "id": offer_id,
            "qtd": buy_qty,
            "preco": price,
            "moeda": currency
        }))
    }

    pub fn on_tick(&mut self, index: usize, now_ms_val: u64, app: Option<&AppHandle>) -> Vec<Value> {
        if index > 3 { return Vec::new(); }
        let mut out_commands = Vec::new();

        let acc_snapshot = self.store.accounts[index].clone();

        // 1. Drain ready scheduled queries (cadence / rotation delayed queries)
        let now_inst = Instant::now();
        let mut ready_queries = Vec::new();
        let mut remaining_queries = Vec::new();
        for q in self.runtimes[index].scheduled_queries.drain(..) {
            if now_inst >= q.execute_at {
                ready_queries.push(q.payload);
            } else {
                remaining_queries.push(q);
            }
        }
        self.runtimes[index].scheduled_queries = remaining_queries;
        if acc_snapshot.enabled {
            out_commands.extend(ready_queries);
        } else {
            self.runtimes[index].clear_scheduled_queries();
        }

        // 2. Timeout on outstanding buy
        let mut timed_out_buy = None;
        {
            let rt = &mut self.runtimes[index];
            rt.prune_old_records();
            if let Some(buy) = &mut rt.outstanding_buy {
                if buy.state == BuyState::PendingConfirmation && buy.sent_at.elapsed() > Duration::from_secs(BUY_TIMEOUT_SECS) {
                    buy.state = BuyState::UncertainBlocked;
                    timed_out_buy = Some(buy.clone());
                }
            }
        }

        if let Some(buy) = timed_out_buy {
            let mut candidate = self.store.clone();
            let acc = &mut candidate.accounts[index];
            // Quantity was ALREADY preconsumed in try_emit_buy! Do NOT add again!
            let entry = SniperLogEntry {
                id: format!("timeout_{}_{}", now_ms_val, buy.offer_id),
                timestamp: now_ms_val,
                status: "INCERTO".into(),
                target_name: buy.target_name.clone(),
                price: Some(buy.price),
                currency: Some(buy.currency.clone()),
                qty: Some(buy.qty),
                offer_id: Some(buy.offer_id),
                details: "Tempo limite sem confirmação/recusa. Novas compras bloqueadas até resolução ou reconexão segura.".into(),
                account_index: Some(index),
                extra: HashMap::new(),
            };
            add_log_to_account(acc, entry);
            let _ = self.persist_store_candidate(&candidate);
            self.store = candidate;
            if let Some(a) = app {
                let _ = a.emit("sniper:updated", &self.store.to_snapshot());
            }
        }

        // 3. Scheduled offers revalidation & emission (purchase intent)
        let ready_ids: Vec<u64> = {
            let rt = &self.runtimes[index];
            rt.scheduled_offers
                .iter()
                .filter(|(_, s)| Instant::now() >= s.release_at)
                .map(|(id, _)| *id)
                .collect()
        };

        for oid in ready_ids {
            let sched_opt = self.runtimes[index].scheduled_offers.remove(&oid);
            if let Some(sched) = sched_opt {
                if !acc_snapshot.enabled { continue; }

                // Revalidate against rule budget and exclusions
                let mut buy_qty = sched.buy_qty;
                if let Some(rid) = &sched.rule_id {
                    if let Some(r) = acc_snapshot.rules.iter().find(|r| &r.id == rid) {
                        if !r.active { continue; }
                        if r.target_type == "category" && !r.matches_category(sched.item_id) {
                            continue;
                        }
                        let rem = r.remaining_qty(self.runtimes[index].is_vip);
                        if rem == 0 { continue; }
                        buy_qty = buy_qty.min(rem);
                    } else {
                        continue;
                    }
                }

                if self.runtimes[index].outstanding_buy.is_some() {
                    continue;
                }

                if let Some(cmd) = self.try_emit_buy_with_seller(
                    index,
                    sched.offer_id,
                    sched.rule_id,
                    sched.target_name,
                    buy_qty,
                    sched.price,
                    sched.currency,
                    sched.seller,
                    now_ms_val,
                ) {
                    if let Some(a) = app {
                        let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                    }
                    out_commands.push(cmd);
                }
            }
        }

        // 4. Periodic scans
        if acc_snapshot.enabled {
            let rt = &mut self.runtimes[index];
            let is_original = acc_snapshot.config.scan_mode == "original";
            let effective_interval = if is_original {
                Duration::from_millis(3000)
            } else {
                let is_hot = rt.is_hot();
                Duration::from_millis(if is_hot { acc_snapshot.config.fast_scan_interval_ms } else { acc_snapshot.config.scan_interval_ms })
            };

            let should_scan = match rt.last_scan_instant {
                None => true,
                Some(inst) => inst.elapsed() >= effective_interval,
            };

            if should_scan {
                rt.last_scan_instant = Some(Instant::now());
                rt.scan_cycle = rt.scan_cycle.wrapping_add(1);
                let cycle = rt.scan_cycle;

                let has_items = acc_snapshot.rules.iter().any(|r| r.active && (r.target_type == "item" || r.target_type == "category" || r.target_type.is_empty()));
                let has_poke = acc_snapshot.config.snipe_any_shiny
                    || acc_snapshot.config.snipe_any_p5
                    || (acc_snapshot.config.snipe_by_note && acc_snapshot.config.min_note >= 1.0)
                    || acc_snapshot.rules.iter().any(|r| r.active && r.target_type == "pokemon");

                if has_items {
                    out_commands.push(json!({ "t": "market.itens" }));
                }

                if has_poke {
                    let make_poke_cmd = |k: usize| -> Value {
                        match k % 3 {
                            1 => json!({ "t": "market.listar", "tipo": "pokemon", "ordem": "menor_preco", "moeda": "gold", "busca": "", "criterios": [], "elemento": "" }),
                            2 => json!({ "t": "market.listar", "tipo": "pokemon", "ordem": "menor_preco", "moeda": "orb", "busca": "", "criterios": [], "elemento": "" }),
                            _ => json!({ "t": "market.listar", "tipo": "pokemon", "ordem": "recentes", "moeda": "", "busca": "", "criterios": [], "elemento": "" }),
                        }
                    };

                    if is_original {
                        // Original mode: single query delayed by 700ms, rotating cycle (1=gold, 2=orb, 0=recentes)
                        rt.scheduled_queries.push(ScheduledQuery {
                            execute_at: Instant::now() + Duration::from_millis(700),
                            payload: make_poke_cmd(cycle),
                        });
                    } else if rt.is_hot() {
                        // Adaptive mode hot round: rotates 1 query at 700ms
                        rt.scheduled_queries.push(ScheduledQuery {
                            execute_at: Instant::now() + Duration::from_millis(700),
                            payload: make_poke_cmd(cycle),
                        });
                    } else {
                        // Adaptive mode slow round: covers all 3 orders staggered 700ms (700ms, 1400ms, 2100ms)
                        rt.scheduled_queries.push(ScheduledQuery {
                            execute_at: Instant::now() + Duration::from_millis(700),
                            payload: make_poke_cmd(1),
                        });
                        rt.scheduled_queries.push(ScheduledQuery {
                            execute_at: Instant::now() + Duration::from_millis(1400),
                            payload: make_poke_cmd(2),
                        });
                        rt.scheduled_queries.push(ScheduledQuery {
                            execute_at: Instant::now() + Duration::from_millis(2100),
                            payload: make_poke_cmd(0),
                        });
                    }
                }
            }
        }

        out_commands
    }

    pub fn on_message(&mut self, index: usize, msg: &Value, app: Option<&AppHandle>) -> Vec<Value> {
        if index > 3 { return Vec::new(); }
        let t = msg.get("t").and_then(|v| v.as_str()).unwrap_or("");
        let mut out_commands = Vec::new();

        // 1. Clock and balance updates
        self.feed_welcome(index, msg);

        // 2. Battle confirmation & lottery events (batalha.ev marketComprado, mktSorteio)
        if t == "batalha" || t == "marketComprado" || t == "mktSorteio" {
            let events_vec: Vec<Value> = if t == "batalha" {
                msg.get("ev").and_then(|v| v.as_array()).cloned().unwrap_or_default()
            } else {
                vec![msg.clone()]
            };

            for ev in events_vec {
                let k = ev.get("k").or_else(|| ev.get("t")).and_then(|v| v.as_str()).unwrap_or("");
                if k == "marketComprado" {
                    let ev_id_opt = ev.get("id").and_then(|v| v.as_u64());
                    let rt = &mut self.runtimes[index];

                    // Check explicit ID if present: divergent ID must NOT confirm; keep pending and log bounded diagnostic!
                    if let Some(buy) = rt.outstanding_buy.as_mut() {
                        if let Some(ev_id) = ev_id_opt {
                            if ev_id != buy.offer_id {
                                if buy.allow_aux_log(format!("diag:comprado:{}", ev_id)) {
                                    let entry = SniperLogEntry {
                                        id: format!("diag_{}_{}", now_ms(), buy.offer_id),
                                        timestamp: now_ms(),
                                        status: "DIAGNOSTICO".into(),
                                        target_name: buy.target_name.clone(),
                                        price: Some(buy.price),
                                        currency: Some(buy.currency.clone()),
                                        qty: Some(buy.qty),
                                        offer_id: Some(buy.offer_id),
                                        details: format!("🔍 marketComprado com ID divergente (recebido #{}, pendente #{})", ev_id, buy.offer_id),
                                        account_index: Some(index),
                                        extra: HashMap::new(),
                                    };
                                    let mut candidate = self.store.clone();
                                    let acc = &mut candidate.accounts[index];
                                    add_log_to_account(acc, entry);
                                    let _ = self.persist_store_candidate(&candidate);
                                    self.store = candidate;
                                    if let Some(a) = app {
                                        let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                                    }
                                }
                                continue;
                            }
                        }
                    }

                    let desc = ev.get("descricao").and_then(|v| v.as_str()).unwrap_or("Item entregue no depot/mochila!");
                    if let Some(buy) = rt.outstanding_buy.take() {
                        rt.release_reservation(&buy.currency, buy.reserved_amount);
                        // Debit cached balance unless authoritative newer wallet already applied to avoid overspending
                        match normalize_currency(&buy.currency) {
                            "gold" => {
                                if rt.gold >= 0 {
                                    rt.gold = (rt.gold as u64).saturating_sub(buy.reserved_amount) as i64;
                                }
                            }
                            "orb" => {
                                if rt.orbs >= 0 {
                                    rt.orbs = (rt.orbs as u64).saturating_sub(buy.reserved_amount) as i64;
                                }
                            }
                            _ => {}
                        }
                        rt.confirmed_offers.insert(buy.offer_id);

                        let mut candidate = self.store.clone();
                        let acc = &mut candidate.accounts[index];
                        acc.pending_intent = None;

                        let mut ok_extra = HashMap::new();
                        if !buy.seller.is_empty() {
                            ok_extra.insert("seller".into(), json!(buy.seller));
                        }
                        let resolved_target = resolve_confirmed_target_name(&buy.target_name, desc);
                        let entry = SniperLogEntry {
                            id: format!("ok_{}_{}", now_ms(), buy.offer_id),
                            timestamp: now_ms(),
                            status: "CONFIRMADO".into(),
                            target_name: resolved_target,
                            price: Some(buy.price),
                            currency: Some(buy.currency),
                            qty: Some(buy.qty),
                            offer_id: Some(buy.offer_id),
                            details: format!("✅ Confirmado pelo servidor: {}", desc),
                            account_index: Some(index),
                            extra: ok_extra,
                        };
                        add_log_to_account(acc, entry);
                        let _ = self.persist_store_candidate(&candidate);
                        self.store = candidate;

                        if let Some(a) = app {
                            let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                        }
                    }
                } else if k == "mktSorteio" {
                    let ev_id_opt = extract_explicit_offer_id(&ev);
                    let fase = sanitize_text(ev.get("fase").and_then(|v| v.as_str()).unwrap_or(""), 24);
                    let rt = &mut self.runtimes[index];
                    if let Some(pending_offer_id) = rt.outstanding_buy.as_ref().map(|b| b.offer_id) {
                        if let Some(ev_id) = ev_id_opt {
                            if ev_id == pending_offer_id {
                                if fase == "fim" {
                                    let perdeu = ev.get("perdeu").and_then(|v| v.as_bool()).unwrap_or(false);
                                    let ok = ev.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                                    if perdeu || (!ok && ev.get("msg").is_some()) {
                                        // Lost lottery: terminal rejection!
                                        let buy_taken = rt.outstanding_buy.take().unwrap();
                                        rt.release_reservation(&buy_taken.currency, buy_taken.reserved_amount);
                                        let mut candidate = self.store.clone();
                                        let acc = &mut candidate.accounts[index];
                                        if let Some(ref rid) = buy_taken.rule_id {
                                            if let Some(r) = acc.rules.iter_mut().find(|r| &r.id == rid) {
                                                r.total_bought = r.total_bought.saturating_sub(buy_taken.qty);
                                            }
                                        }
                                        acc.pending_intent = None;
                                        let motivo = sanitize_text(
                                            ev.get("msg").and_then(|v| v.as_str()).unwrap_or("Outro jogador levou no sorteio de liberação"),
                                            120,
                                        );
                                        let entry = SniperLogEntry {
                                            id: format!("sorteio_perdeu_{}_{}", now_ms(), buy_taken.offer_id),
                                            timestamp: now_ms(),
                                            status: "RECUSADO".into(),
                                            target_name: buy_taken.target_name,
                                            price: Some(buy_taken.price),
                                            currency: Some(buy_taken.currency),
                                            qty: Some(buy_taken.qty),
                                            offer_id: Some(buy_taken.offer_id),
                                            details: format!("❌ Recusado pelo servidor: {}", motivo),
                                            account_index: Some(index),
                                            extra: HashMap::new(),
                                        };
                                        add_log_to_account(acc, entry);
                                        let _ = self.persist_store_candidate(&candidate);
                                        self.store = candidate;
                                        if let Some(a) = app {
                                            let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                                        }
                                    } else if ok {
                                        // Won lottery: confirm once (subsequent marketComprado for same offer_id sees outstanding_buy=None)
                                        let buy_taken = rt.outstanding_buy.take().unwrap();
                                        rt.release_reservation(&buy_taken.currency, buy_taken.reserved_amount);
                                        match normalize_currency(&buy_taken.currency) {
                                            "gold" => {
                                                if rt.gold >= 0 {
                                                    rt.gold = (rt.gold as u64).saturating_sub(buy_taken.reserved_amount) as i64;
                                                }
                                            }
                                            "orb" => {
                                                if rt.orbs >= 0 {
                                                    rt.orbs = (rt.orbs as u64).saturating_sub(buy_taken.reserved_amount) as i64;
                                                }
                                            }
                                            _ => {}
                                        }
                                        rt.confirmed_offers.insert(buy_taken.offer_id);
                                        let mut candidate = self.store.clone();
                                        let acc = &mut candidate.accounts[index];
                                        acc.pending_intent = None;
                                        let desc = ev.get("descricao").and_then(|v| v.as_str()).unwrap_or("Venceu o sorteio de liberação!");
                                        let mut ok_extra = HashMap::new();
                                        if !buy_taken.seller.is_empty() {
                                            ok_extra.insert("seller".into(), json!(buy_taken.seller));
                                        }
                                        let resolved_target = resolve_confirmed_target_name(&buy_taken.target_name, desc);
                                        let entry = SniperLogEntry {
                                            id: format!("ok_{}_{}", now_ms(), buy_taken.offer_id),
                                            timestamp: now_ms(),
                                            status: "CONFIRMADO".into(),
                                            target_name: resolved_target,
                                            price: Some(buy_taken.price),
                                            currency: Some(buy_taken.currency),
                                            qty: Some(buy_taken.qty),
                                            offer_id: Some(buy_taken.offer_id),
                                            details: format!("✅ Confirmado pelo servidor: {}", desc),
                                            account_index: Some(index),
                                            extra: ok_extra,
                                        };
                                        add_log_to_account(acc, entry);
                                        let _ = self.persist_store_candidate(&candidate);
                                        self.store = candidate;
                                        if let Some(a) = app {
                                            let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                                        }
                                    }
                                } else if let Some(buy) = rt.outstanding_buy.as_mut() {
                                    // Progress ("entrou" or "lista"): keep pending, deduplicate & cap disk logs
                                    if buy.allow_aux_log(format!("prog:sorteio:{}", fase)) {
                                        let entry = SniperLogEntry {
                                            id: format!("sorteio_prog_{}_{}", now_ms(), buy.offer_id),
                                            timestamp: now_ms(),
                                            status: "PROGRESSO".into(),
                                            target_name: buy.target_name.clone(),
                                            price: Some(buy.price),
                                            currency: Some(buy.currency.clone()),
                                            qty: Some(buy.qty),
                                            offer_id: Some(buy.offer_id),
                                            details: format!("⏳ Sorteio de liberação: fase '{}'", fase),
                                            account_index: Some(index),
                                            extra: HashMap::new(),
                                        };
                                        let mut candidate = self.store.clone();
                                        let acc = &mut candidate.accounts[index];
                                        add_log_to_account(acc, entry);
                                        let _ = self.persist_store_candidate(&candidate);
                                        self.store = candidate;
                                        if let Some(a) = app {
                                            let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                                        }
                                    }
                                }
                            } else if let Some(buy) = rt.outstanding_buy.as_mut() {
                                // Unassociated mktSorteio: bounded diagnostic log
                                if buy.allow_aux_log(format!("diag:sorteio:{}", ev_id)) {
                                    let entry = SniperLogEntry {
                                        id: format!("diag_mkt_{}_{}", now_ms(), buy.offer_id),
                                        timestamp: now_ms(),
                                        status: "DIAGNOSTICO".into(),
                                        target_name: buy.target_name.clone(),
                                        price: Some(buy.price),
                                        currency: Some(buy.currency.clone()),
                                        qty: Some(buy.qty),
                                        offer_id: Some(buy.offer_id),
                                        details: format!("🔍 mktSorteio para oferta não associada #{} (pendente #{})", ev_id, buy.offer_id),
                                        account_index: Some(index),
                                        extra: HashMap::new(),
                                    };
                                    let mut candidate = self.store.clone();
                                    let acc = &mut candidate.accounts[index];
                                    add_log_to_account(acc, entry);
                                    let _ = self.persist_store_candidate(&candidate);
                                    self.store = candidate;
                                    if let Some(a) = app {
                                        let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                                    }
                                }
                            }
                        }
                    }
                } else if k == "aviso" {
                    self.handle_pending_buy_reply(index, &ev, "aviso", app);
                }
            }
            if t == "marketComprado" || t == "mktSorteio" || t == "batalha" {
                return out_commands;
            }
        }

        // 3. Error rejection and diagnostic logging while buy is pending
        if t == "erro" {
            self.handle_pending_buy_reply(index, msg, "erro", app);
            return out_commands;
        }

        // 4. Market packet handling
        if t == "market" {
            let aba = msg.get("aba").and_then(|v| v.as_str()).unwrap_or("");
            if aba.starts_with("historico") || aba == "historico" {
                return out_commands;
            }

            // Summary of items catalog
            if aba == "itens" {
                if let Some(resumo) = msg.get("resumo").and_then(|v| v.as_object()) {
                    let acc_snapshot = self.store.accounts[index].clone();
                    if !acc_snapshot.enabled { return out_commands; }

                    let catalog = SniperCatalog::get();
                    let mut sent_queries: HashSet<(u64, &'static str)> = HashSet::new();

                    for rule in &acc_snapshot.rules {
                        if !rule.active {
                            continue;
                        }
                        if rule.max_qty > 0 && rule.total_bought >= rule.max_qty {
                            continue;
                        }
                        if rule.max_price_gold == 0 && rule.max_price_gems == 0 {
                            continue;
                        }

                        let mut items_to_check: Vec<u64> = Vec::new();
                        if rule.target_type == "item" || rule.target_type.is_empty() {
                            if let Some(item_id) = rule.target_id_as_u64() {
                                items_to_check.push(item_id);
                            }
                        } else if rule.target_type == "category" {
                            if let Some(cat) = &rule.target_category {
                                if let Some(cat_ids) = catalog.ids_by_category.get(cat.as_str()) {
                                    items_to_check.extend(
                                        cat_ids.iter().copied().filter(|id| !rule.excluded_item_ids.contains(id))
                                    );
                                }
                            }
                        }

                        for item_id in items_to_check {
                            let key = item_id.to_string();
                            if let Some(r_item) = resumo.get(&key) {
                                let min_gold = r_item.get("minGold").and_then(|v| v.as_u64()).unwrap_or(0);
                                let min_orb = r_item.get("minOrb").and_then(|v| v.as_u64()).unwrap_or(0);

                                let match_gold = rule.max_price_gold > 0 && min_gold > 0 && min_gold <= rule.max_price_gold;
                                let match_orb = rule.max_price_gems > 0 && min_orb > 0 && min_orb <= rule.max_price_gems;

                                if match_gold && !sent_queries.contains(&(item_id, "gold")) {
                                    sent_queries.insert((item_id, "gold"));
                                    self.runtimes[index].hot_until = Some(Instant::now() + Duration::from_secs(150));
                                    out_commands.push(json!({
                                        "t": "market.item",
                                        "itemId": item_id,
                                        "moeda": "gold"
                                    }));
                                }

                                if match_orb && !sent_queries.contains(&(item_id, "orb")) {
                                    sent_queries.insert((item_id, "orb"));
                                    self.runtimes[index].hot_until = Some(Instant::now() + Duration::from_secs(150));
                                    out_commands.push(json!({
                                        "t": "market.item",
                                        "itemId": item_id,
                                        "moeda": "orb"
                                    }));
                                }
                            }
                        }
                    }
                }
                return out_commands;
            }

            // Parse offers with strict envelope inheritance for itemId and moeda
            let env_item_id = msg.get("itemId").and_then(|v| v.as_u64().or_else(|| v.as_str()?.parse().ok()));
            let env_moeda = msg.get("moeda").and_then(|v| v.as_str()).map(|s| s.trim().to_lowercase());

            let mut raw_rows = Vec::new();
            let mut extract_rows = |arr: &[Value]| {
                for r in arr {
                    let mut enriched = r.clone();
                    if let Some(env_id) = env_item_id {
                        let line_id = enriched.get("itemId")
                            .or_else(|| enriched.get("ficha").and_then(|f| f.get("itemId")))
                            .and_then(|v| v.as_u64().or_else(|| v.as_str()?.parse().ok()));
                        if let Some(lid) = line_id {
                            if lid != env_id {
                                continue; // Conflict between envelope itemId and line itemId -> reject (fail-closed)
                            }
                        } else {
                            enriched["itemId"] = json!(env_id);
                        }
                    }
                    if let Some(ref env_m) = env_moeda {
                        let line_m = enriched.get("moeda").and_then(|v| v.as_str()).map(|s| s.trim().to_lowercase());
                        if let Some(lm) = line_m {
                            let lm_norm = match lm.as_str() {
                                "gold" | "coins" | "coin" => "gold",
                                "orb" | "orbs" | "gems" | "gem" => "orb",
                                "diamond" | "diamonds" | "diamante" | "diamantes" => "diamond",
                                _ => "",
                            };
                            let em_norm = match env_m.as_str() {
                                "gold" | "coins" | "coin" => "gold",
                                "orb" | "orbs" | "gems" | "gem" => "orb",
                                "diamond" | "diamonds" | "diamante" | "diamantes" => "diamond",
                                _ => "",
                            };
                            if lm_norm != em_norm || lm_norm.is_empty() {
                                continue; // Conflicting currency -> reject (fail-closed)
                            }
                        } else {
                            enriched["moeda"] = json!(env_m);
                        }
                    }
                    raw_rows.push(enriched);
                }
            };
            if let Some(linhas) = msg.get("linhas").and_then(|v| v.as_array()) { extract_rows(linhas); }
            if let Some(anuncios) = msg.get("anuncios").and_then(|v| v.as_array()) { extract_rows(anuncios); }
            if let Some(itens) = msg.get("itens").and_then(|v| v.as_array()) { extract_rows(itens); }
            if let Some(anuncio) = msg.get("anuncio").filter(|v| v.is_object()) { extract_rows(&[anuncio.clone()]); }

            if raw_rows.is_empty() { return out_commands; }

            // Clone account snapshot to avoid borrow conflicts when try_emit_buy is called
            let acc_snapshot = self.store.accounts[index].clone();
            if !acc_snapshot.enabled { return out_commands; }

            for row in raw_rows {
                if let Some(offer) = parse_offer(&row) {
                    let (decision, is_cooldown, delay_ms) = {
                        let rt = &self.runtimes[index];
                        if rt.confirmed_offers.contains(&offer.id) || rt.scheduled_offers.contains_key(&offer.id) {
                            continue;
                        }
                        if let Some(attempt_ts) = rt.bought_offers.get(&offer.id) {
                            if attempt_ts.elapsed() < Duration::from_secs(20) {
                                continue;
                            }
                        }

                        let dec = evaluate_offer(&offer, &acc_snapshot, rt);
                        if !dec.matched || dec.buy_qty == 0 {
                            continue;
                        }

                        let active_slots = acc_snapshot.rules.iter().filter(|r| r.active).count();
                        let max_slots = if rt.is_vip { VIP_MAX_SLOTS } else { acc_snapshot.config.max_active_slots };
                        if active_slots > (max_slots as usize) && dec.rule_id.is_some() {
                            continue;
                        }

                        let server_now = rt.server_now_ms();
                        let compravel_em = offer.compravel_em.unwrap_or(0);
                        let cooldown = compravel_em > (server_now + 50);
                        let delay = if cooldown { (compravel_em - server_now) + 100 } else { 0 };
                        (dec, cooldown, delay)
                    };

                    if is_cooldown {
                        self.runtimes[index].scheduled_offers.insert(offer.id, ScheduledOffer {
                            offer_id: offer.id,
                            rule_id: decision.rule_id.clone(),
                            target_name: decision.target_display_name.clone(),
                            buy_qty: decision.buy_qty,
                            price: offer.price,
                            currency: offer.currency.clone(),
                            scheduled_at: Instant::now(),
                            release_at: Instant::now() + Duration::from_millis(delay_ms),
                            attempts: 0,
                            seller: offer.seller.clone(),
                            item_id: offer.item_id,
                        });
                    } else if self.runtimes[index].outstanding_buy.is_none() {
                        // Immediate buy with persistent pre-consumption
                        if let Some(cmd) = self.try_emit_buy_with_seller(
                            index,
                            offer.id,
                            decision.rule_id,
                            decision.target_display_name,
                            decision.buy_qty,
                            offer.price,
                            offer.currency,
                            offer.seller,
                            now_ms(),
                        ) {
                            if let Some(a) = app {
                                let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                            }
                            out_commands.push(cmd);
                            break;
                        }
                    }
                }
            }
        }

        out_commands
    }
}

impl SniperEngine {
    fn handle_pending_buy_reply(&mut self, index: usize, pkt: &Value, default_op: &str, app: Option<&AppHandle>) {
        let explicit_id = extract_explicit_offer_id(pkt);
        let is_terminal = is_terminal_market_rejection(pkt);
        let is_prog = is_lottery_progress(pkt);
        let rt = &mut self.runtimes[index];

        let Some(pending_offer_id) = rt.outstanding_buy.as_ref().map(|b| b.offer_id) else {
            return;
        };

        // Explicit offer ID correlation: never release pending buy if packet references a different offer!
        if let Some(ev_id) = explicit_id {
            if ev_id != pending_offer_id {
                if let Some(buy) = rt.outstanding_buy.as_mut() {
                    if buy.allow_aux_log(format!("diag:reply_id:{}:{}", default_op, ev_id)) {
                        let chave = sanitize_text(get_str_field(pkt, &["chave", "key", "erro", "error"]), 60);
                        let entry = SniperLogEntry {
                            id: format!("diag_id_{}_{}", now_ms(), buy.offer_id),
                            timestamp: now_ms(),
                            status: "DIAGNOSTICO".into(),
                            target_name: buy.target_name.clone(),
                            price: Some(buy.price),
                            currency: Some(buy.currency.clone()),
                            qty: Some(buy.qty),
                            offer_id: Some(buy.offer_id),
                            details: format!(
                                "🔍 Resposta {} com ID divergente (recebido #{}, pendente #{}, chave='{}')",
                                default_op, ev_id, buy.offer_id, chave
                            ),
                            account_index: Some(index),
                            extra: HashMap::new(),
                        };
                        let mut candidate = self.store.clone();
                        let acc = &mut candidate.accounts[index];
                        add_log_to_account(acc, entry);
                        let _ = self.persist_store_candidate(&candidate);
                        self.store = candidate;
                        if let Some(a) = app {
                            let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                        }
                    }
                }
                return;
            }
        }

        if is_terminal {
            if let Some(buy) = rt.outstanding_buy.take() {
                rt.release_reservation(&buy.currency, buy.reserved_amount);

                let mut candidate = self.store.clone();
                let acc = &mut candidate.accounts[index];

                if let Some(ref rid) = buy.rule_id {
                    if let Some(r) = acc.rules.iter_mut().find(|r| &r.id == rid) {
                        r.total_bought = r.total_bought.saturating_sub(buy.qty);
                    }
                }
                acc.pending_intent = None;

                let raw_reason = get_str_field(pkt, &["msg", "mensagem", "message", "m", "chave", "key", "erro", "error"]);
                let clean_reason = sanitize_text(raw_reason, 120);
                let details_str = if !clean_reason.is_empty() {
                    format!("❌ Recusado pelo servidor: {}", clean_reason)
                } else {
                    "❌ Recusado pelo servidor: Operação de mercado recusada pelo servidor".to_string()
                };

                let entry = SniperLogEntry {
                    id: format!("err_{}_{}", now_ms(), buy.offer_id),
                    timestamp: now_ms(),
                    status: "RECUSADO".into(),
                    target_name: buy.target_name,
                    price: Some(buy.price),
                    currency: Some(buy.currency),
                    qty: Some(buy.qty),
                    offer_id: Some(buy.offer_id),
                    details: details_str,
                    account_index: Some(index),
                    extra: HashMap::new(),
                };
                add_log_to_account(acc, entry);
                let _ = self.persist_store_candidate(&candidate);
                self.store = candidate;

                if let Some(a) = app {
                    let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                }
            }
        } else if is_prog {
            if let Some(buy) = rt.outstanding_buy.as_mut() {
                let chave = sanitize_text(get_str_field(pkt, &["chave", "key", "erro", "error", "msg", "mensagem"]), 60);
                if buy.allow_aux_log(format!("prog:reply:{}", chave.to_lowercase())) {
                    let entry = SniperLogEntry {
                        id: format!("prog_{}_{}", now_ms(), buy.offer_id),
                        timestamp: now_ms(),
                        status: "PROGRESSO".into(),
                        target_name: buy.target_name.clone(),
                        price: Some(buy.price),
                        currency: Some(buy.currency.clone()),
                        qty: Some(buy.qty),
                        offer_id: Some(buy.offer_id),
                        details: format!("⏳ Pedido entrou no sorteio de liberação (aguardando desfecho - {})", chave),
                        account_index: Some(index),
                        extra: HashMap::new(),
                    };
                    let mut candidate = self.store.clone();
                    let acc = &mut candidate.accounts[index];
                    add_log_to_account(acc, entry);
                    let _ = self.persist_store_candidate(&candidate);
                    self.store = candidate;

                    if let Some(a) = app {
                        let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                    }
                }
            }
        } else if default_op == "erro" {
            // Unrecognized error while pending: MUST NOT release budget or unblock pending intents!
            if let Some(buy) = rt.outstanding_buy.as_mut() {
                let chave = sanitize_text(get_str_field(pkt, &["chave", "key", "erro", "error"]), 60);
                let raw_err = sanitize_text(get_str_field(pkt, &["msg", "mensagem", "message", "m"]), 120);
                let op = sanitize_text(get_str_field(pkt, &["op", "acao", "t", "tipo"]), 40);
                let op_display = if op.is_empty() { default_op } else { op.as_str() };
                let dedup = format!("diag:err:{}:{}:{}", chave, raw_err, op_display);
                if buy.allow_aux_log(dedup) {
                    let details = if !chave.is_empty() && !raw_err.is_empty() {
                        format!("🔍 Resposta de erro não reconhecida (chave='{}', msg='{}', op='{}') para compra pendente #{}", chave, raw_err, op_display, buy.offer_id)
                    } else if !chave.is_empty() {
                        format!("🔍 Resposta de erro não reconhecida (chave='{}', op='{}') para compra pendente #{}", chave, op_display, buy.offer_id)
                    } else if !raw_err.is_empty() {
                        format!("🔍 Resposta de erro não reconhecida (msg='{}', op='{}') para compra pendente #{}", raw_err, op_display, buy.offer_id)
                    } else {
                        format!("🔍 Resposta de erro sem detalhes para compra pendente #{}", buy.offer_id)
                    };

                    let entry = SniperLogEntry {
                        id: format!("diag_{}_{}", now_ms(), buy.offer_id),
                        timestamp: now_ms(),
                        status: "DIAGNOSTICO".into(),
                        target_name: buy.target_name.clone(),
                        price: Some(buy.price),
                        currency: Some(buy.currency.clone()),
                        qty: Some(buy.qty),
                        offer_id: Some(buy.offer_id),
                        details,
                        account_index: Some(index),
                        extra: HashMap::new(),
                    };
                    let mut candidate = self.store.clone();
                    let acc = &mut candidate.accounts[index];
                    add_log_to_account(acc, entry);
                    let _ = self.persist_store_candidate(&candidate);
                    self.store = candidate;

                    if let Some(a) = app {
                        let _ = a.emit("sniper:updated", &self.store.to_snapshot());
                    }
                }
            }
        }
    }
}

fn extract_explicit_offer_id(val: &Value) -> Option<u64> {
    for k in &["id", "anuncioId", "offerId"] {
        if let Some(id) = val.get(*k).and_then(|v| v.as_u64().or_else(|| v.as_str()?.parse().ok())) {
            if id > 0 {
                return Some(id);
            }
        }
    }
    None
}

pub fn sanitize_text(s: &str, max_len: usize) -> String {
    let cleaned: String = s
        .chars()
        .filter(|c| !c.is_control() || *c == ' ')
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.chars().count() > max_len {
        let mut truncated: String = trimmed.chars().take(max_len).collect();
        truncated.push_str("...");
        truncated
    } else {
        trimmed.to_string()
    }
}

fn get_str_field<'a>(val: &'a Value, fields: &[&str]) -> &'a str {
    for f in fields {
        if let Some(s) = val.get(*f).and_then(|v| v.as_str()) {
            return s;
        }
    }
    ""
}

pub fn is_lottery_progress(msg: &Value) -> bool {
    let key = get_str_field(msg, &["chave", "key", "erro", "error", "msg", "mensagem"]);
    let key_lower = key.to_lowercase();
    key_lower == "market.sorteio" || key_lower == "market.sorteioespera"
}

pub fn is_terminal_market_rejection(msg: &Value) -> bool {
    // 1. Explicit operation must be market.comprar
    let op = get_str_field(msg, &["op", "acao", "t", "tipo"]);
    if op == "market.comprar" {
        return true;
    }

    // 2. Known market-specific anuncio/oferta key or terminal dotted keys
    let key = get_str_field(msg, &["chave", "key", "erro", "error"]);
    let key_lower = key.to_lowercase();
    let err_msg = get_str_field(msg, &["msg", "mensagem", "message", "m"]);
    let msg_lower = err_msg.to_lowercase();

    if key_lower == "market.sorteioperdeu"
        || key_lower == "market.retencao"
        || key_lower == "market.loteinvalido"
        || key_lower == "market.estadiasaiu"
        || key_lower == "market.estadiavencida"
        || msg_lower == "market.sorteioperdeu"
        || msg_lower == "market.retencao"
        || msg_lower == "market.loteinvalido"
        || msg_lower == "market.estadiasaiu"
        || msg_lower == "market.estadiavencida"
        || key_lower.contains("market_anuncio")
        || key_lower.contains("market_oferta")
        || key_lower.contains("anuncio_expirado")
        || key_lower.contains("anuncio_cancelado")
        || key_lower.contains("anuncio_comprado")
        || key_lower.contains("oferta_expirada")
        || key_lower.contains("oferta_cancelada")
        || key_lower.contains("proprio_anuncio")
        || key_lower.contains("market_comprar")
    {
        return true;
    }

    // 3. Known market-specific message text
    (msg_lower.contains("anúncio") || msg_lower.contains("anuncio") || msg_lower.contains("oferta do mercado"))
        && (msg_lower.contains("expir") || msg_lower.contains("cancel") || msg_lower.contains("comprad") || msg_lower.contains("inválid") || msg_lower.contains("invalido") || msg_lower.contains("próprio") || msg_lower.contains("proprio"))
}

pub fn is_market_correlated_error(msg: &Value) -> bool {
    is_terminal_market_rejection(msg)
}

const MAX_NON_CONFIRMED_LOGS_PER_ACCOUNT: usize = 25;

fn is_confirmed_log(entry: &SniperLogEntry) -> bool {
    let st = entry.status.trim();
    st.eq_ignore_ascii_case("CONFIRMADO") || st.eq_ignore_ascii_case("OK")
}

fn enforce_account_log_limits(logs: &mut Vec<SniperLogEntry>) {
    let total_confirmed = logs.iter().filter(|e| is_confirmed_log(e)).count();
    let max_confirmed = MAX_HISTORY_PER_ACCOUNT;
    let kept_confirmed_budget = total_confirmed.min(max_confirmed);
    let max_non_confirmed = MAX_NON_CONFIRMED_LOGS_PER_ACCOUNT
        .min(MAX_HISTORY_PER_ACCOUNT.saturating_sub(kept_confirmed_budget));

    let mut seen_confirmed = 0usize;
    let mut seen_non_confirmed = 0usize;
    logs.retain(|entry| {
        if is_confirmed_log(entry) {
            if seen_confirmed < max_confirmed {
                seen_confirmed += 1;
                true
            } else {
                false
            }
        } else if seen_non_confirmed < max_non_confirmed {
            seen_non_confirmed += 1;
            true
        } else {
            false
        }
    });
}

fn add_log_to_account(account: &mut AccountState, entry: SniperLogEntry) {
    account.logs.insert(0, entry);
    enforce_account_log_limits(&mut account.logs);
}

// =========================================================================
// 5. VALIDATION HELPERS
// =========================================================================

pub fn validate_config(config: &SniperConfig) -> Result<(), String> {
    if config.scan_mode != "original" && config.scan_mode != "adaptive" {
        return Err(format!("scanMode inválido: '{}'. Use 'original' ou 'adaptive'", config.scan_mode));
    }
    if config.scan_interval_ms < 1000 || config.scan_interval_ms > 600000 {
        return Err("scanIntervalMs deve estar entre 1000 e 600000 ms".into());
    }
    if config.fast_scan_interval_ms < 500 || config.fast_scan_interval_ms > 60000 {
        return Err("fastScanIntervalMs deve estar entre 500 e 60000 ms".into());
    }
    if config.max_active_slots == 0 || config.max_active_slots > 50 {
        return Err("maxActiveSlots deve estar entre 1 e 50".into());
    }
    if !config.min_note.is_finite() || config.min_note < 0.0 || config.min_note > 10.0 {
        return Err("minNote deve ser um número finito entre 0.0 e 10.0".into());
    }
    if config.snipe_by_note && config.min_note < 1.0 {
        return Err("minNote deve ser no mínimo 1.0 quando snipeByNote estiver ativo".into());
    }
    if config.snipe_any_shiny && config.max_price_shiny_gold == 0 && config.max_price_shiny_gems == 0 {
        return Err("snipeAnyShiny ativo requer teto em gold ou gems maior que zero".into());
    }
    if config.snipe_any_p5 && config.max_price_p5_gold == 0 && config.max_price_p5_gems == 0 {
        return Err("snipeAnyP5 ativo requer teto em gold ou gems maior que zero".into());
    }
    if config.snipe_by_note && config.max_price_note_gold == 0 && config.max_price_note_gems == 0 {
        return Err("snipeByNote ativo requer teto em gold ou gems maior que zero".into());
    }
    validate_config_extra(config)?;
    Ok(())
}

pub fn validate_config_extra(config: &SniperConfig) -> Result<(), String> {
    let allowed: HashSet<&str> = [
        "icon", "icone", "category", "categoria", "categoryLabel", "created",
        "updated", "createdAt", "updatedAt", "targetLabel", "name", "nome",
        "npcPrice", "type", "autoMaxAffordable", "scanIntervalSec",
        "maxPriceShinyDiamonds", "maxPriceP5Diamonds", "maxPriceNoteDiamonds",
        "scanMode",
    ].into_iter().collect();

    for (key, val) in &config.extra {
        if !allowed.contains(key.as_str()) {
            return Err(format!("Campo desconhecido ou não suportado '{}' em config", key));
        }
        let num_opt = match val {
            Value::Number(n) => n.as_u64(),
            Value::String(s) => s.trim().parse::<u64>().ok(),
            _ => None,
        };
        match key.as_str() {
            "maxPriceShinyDiamonds" => {
                let n = num_opt.unwrap_or(0);
                if n != config.max_price_shiny_gems && (config.snipe_any_shiny || n != 0) {
                    return Err(format!("maxPriceShinyDiamonds ({}) difere de maxPriceShinyGems ({})", n, config.max_price_shiny_gems));
                }
            }
            "maxPriceP5Diamonds" => {
                let n = num_opt.unwrap_or(0);
                if n != config.max_price_p5_gems && (config.snipe_any_p5 || n != 0) {
                    return Err(format!("maxPriceP5Diamonds ({}) difere de maxPriceP5Gems ({})", n, config.max_price_p5_gems));
                }
            }
            "maxPriceNoteDiamonds" => {
                let n = num_opt.unwrap_or(0);
                if n != config.max_price_note_gems && (config.snipe_by_note || n != 0) {
                    return Err(format!("maxPriceNoteDiamonds ({}) difere de maxPriceNoteGems ({})", n, config.max_price_note_gems));
                }
            }
            _ => {}
        }
    }
    Ok(())
}

pub fn validate_rule_extra(extra: &HashMap<String, Value>, max_price_gems: u64, target_name: &str) -> Result<(), String> {
    let allowed: HashSet<&str> = [
        "icon", "icone", "category", "categoria", "categoryLabel", "created",
        "updated", "createdAt", "updatedAt", "targetLabel", "name", "nome",
        "npcPrice", "type", "autoMaxAffordable", "scanIntervalSec",
        "maxPriceDiamonds",
    ].into_iter().collect();

    for (key, val) in extra {
        if !allowed.contains(key.as_str()) {
            return Err(format!("Filtro restritivo desconhecido ou não suportado '{}' na regra '{}'", key, target_name));
        }
        if key == "maxPriceDiamonds" {
            let num_opt = match val {
                Value::Number(n) => n.as_u64(),
                Value::String(s) => s.trim().parse::<u64>().ok(),
                _ => None,
            };
            if let Some(n) = num_opt {
                if n != max_price_gems {
                    return Err(format!("Regra '{}': maxPriceDiamonds ({}) difere de maxPriceGems ({}); diamantes não são suportados como moeda separada", target_name, n, max_price_gems));
                }
            } else {
                return Err(format!("Regra '{}': maxPriceDiamonds com formato numérico inválido", target_name));
            }
        }
    }
    Ok(())
}

// =========================================================================
// 6. OFFER EVALUATION
// =========================================================================

#[derive(Debug, Clone)]
pub struct ParsedMarketOffer {
    pub id: u64,
    pub price: u64,
    pub qty: u64,
    pub currency: String,
    pub seller: String,
    pub compravel_em: Option<u64>,
    pub item_id: Option<u64>,
    pub item_name: String,
    pub species_id: Option<u64>,
    pub poke_name: String,
    pub is_pokemon: bool,
    pub is_shiny: bool,
    pub potencia: u32,
    pub nota: Option<f64>,
}

pub fn parse_offer(val: &Value) -> Option<ParsedMarketOffer> {
    let id = val.get("id").and_then(|v| v.as_u64().or_else(|| v.as_str()?.parse().ok()))?;
    if id == 0 { return None; }

    if val.get("comprador").is_some() && !val["comprador"].is_null() {
        return None;
    }
    if let Some(estado) = val.get("estado").and_then(|v| v.as_str()) {
        if estado != "aberto" { return None; }
    }

    let price = val.get("preco").or_else(|| val.get("unitPrice"))
        .and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|f| f as u64)))
        .unwrap_or(0);
    if price == 0 { return None; }

    let qty = val.get("qtd").or_else(|| val.get("quantidade"))
        .and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|f| f as u64)))
        .unwrap_or(1).max(1);

    let currency_raw = val.get("moeda").and_then(|v| v.as_str()).map(|s| s.trim().to_lowercase())?;
    let currency = match currency_raw.as_str() {
        "gold" | "coins" | "coin" => "gold".to_string(),
        "orb" | "orbs" | "gems" | "gem" => "orb".to_string(),
        "diamond" | "diamonds" | "diamante" | "diamantes" => "diamond".to_string(),
        _ => return None,
    };
    let seller = val.get("vendedor").or_else(|| val.get("seller")).or_else(|| val.get("dono"))
        .and_then(|v| v.as_str()).unwrap_or("").to_string();
    let compravel_em = val.get("compravelEm").or_else(|| val.get("compravelEmMs"))
        .and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|f| f as u64)));

    let ficha = val.get("ficha");
    let item_id = val.get("itemId")
        .or_else(|| ficha.and_then(|f| f.get("itemId")))
        .and_then(|v| v.as_u64().or_else(|| v.as_str()?.parse().ok()));

    let raw_item_name = val.get("itemNome").or_else(|| val.get("nome"))
        .or_else(|| ficha.and_then(|f| f.get("nome")))
        .and_then(|v| v.as_str()).unwrap_or("").to_string();

    let raw_poke_name = val.get("pokemonNome")
        .or_else(|| ficha.and_then(|f| f.get("nome")))
        .or_else(|| val.get("nome"))
        .and_then(|v| v.as_str()).unwrap_or("").to_string();

    let species_id = ficha.and_then(|f| f.get("speciesId"))
        .and_then(|v| v.as_u64().or_else(|| v.as_str()?.parse().ok()));

    let tipo = val.get("tipo").or_else(|| val.get("tipoItem")).and_then(|v| v.as_str()).unwrap_or("");
    let is_item = item_id.is_some() || tipo == "item" || (!raw_item_name.is_empty() && species_id.is_none() && tipo != "pokemon");
    let is_pokemon = !is_item && (tipo == "pokemon" || species_id.is_some() || !raw_poke_name.is_empty());

    let check_shiny_val = |v: &Value| -> bool {
        if let Some(b) = v.as_bool() {
            b
        } else if let Some(n) = v.as_i64() {
            n != 0
        } else if let Some(s) = v.as_str() {
            s == "true" || s == "1"
        } else {
            false
        }
    };

    let flag_keys = ["shiny", "isShiny", "lookShiny"];
    let mut is_shiny = flag_keys.iter().any(|&k| {
        val.get(k).map_or(false, check_shiny_val)
            || ficha.and_then(|f| f.get(k)).map_or(false, check_shiny_val)
    });

    if !is_shiny {
        if raw_poke_name.to_lowercase().contains("shiny")
            || ficha.and_then(|f| f.get("nome").or_else(|| f.get("name"))).and_then(|v| v.as_str()).map_or(false, |s| s.to_lowercase().contains("shiny"))
        {
            is_shiny = true;
        }
    }

    let potencia = ficha.and_then(|f| f.get("potencia"))
        .or_else(|| val.get("potencia"))
        .and_then(|v| {
            if let Some(u) = v.as_u64() {
                Some(u)
            } else if let Some(f) = v.as_f64() {
                Some(f as u64)
            } else if let Some(s) = v.as_str() {
                s.trim().parse::<u64>().ok()
            } else {
                None
            }
        })
        .unwrap_or(1) as u32;

    let parse_nota = |v: &Value| -> Option<f64> {
        let f = match v {
            Value::Number(n) => n.as_f64(),
            Value::String(s) => s.trim().parse::<f64>().ok(),
            _ => None,
        }?;
        if f.is_nan() || f.is_infinite() || f < 0.0 || f > 10.0 {
            None
        } else {
            Some(f)
        }
    };

    let nota = ficha.and_then(|f| f.get("nota")).and_then(parse_nota)
        .or_else(|| val.get("nota").and_then(parse_nota));

    Some(ParsedMarketOffer {
        id,
        price,
        qty,
        currency,
        seller,
        compravel_em,
        item_id,
        item_name: raw_item_name,
        species_id,
        poke_name: raw_poke_name,
        is_pokemon,
        is_shiny,
        potencia,
        nota,
    })
}

pub struct MatchDecision {
    pub matched: bool,
    pub rule_id: Option<String>,
    pub target_display_name: String,
    pub matched_desc: String,
    pub buy_qty: u64,
}

fn is_generic_category_label(label: &str) -> bool {
    let norm = label.trim().to_lowercase();
    matches!(
        norm.as_str(),
        "pedras" | "pedra" | "pedras de evolução" | "pedras de evolucao" | "pedras evolutivas" | "stone" | "stones"
        | "tms" | "tm"
        | "loots raros" | "loots raros (4 itens)" | "loot raro" | "itens raros" | "rare_loot" | "rare loot"
        | "beast balls" | "beast ball" | "beast"
        | "casas" | "casa"
        | "boxes" | "box" | "caixas" | "caixa"
        | "bicicletas" | "bicicleta" | "bikes" | "bike"
        | "fragmentos" | "fragmentos de mega e ovo shiny" | "fragmento" | "fragment"
        | "tickets" | "ticket"
    ) || norm.starts_with("loots raros (") || norm.starts_with("fragmentos de mega")
}

fn strip_leading_qty_prefix(raw: &str) -> &str {
    let trimmed = raw.trim();
    let digits_end = trimmed
        .char_indices()
        .take_while(|(_, c)| c.is_ascii_digit())
        .last()
        .map(|(idx, c)| idx + c.len_utf8())
        .unwrap_or(0);
    if digits_end == 0 {
        return trimmed;
    }
    let after_digits = trimmed[digits_end..].trim_start();
    if let Some(rest) = after_digits.strip_prefix('x').or_else(|| after_digits.strip_prefix('X')).or_else(|| after_digits.strip_prefix('×')) {
        // Ensure 'x' is a multiplier separator (followed by whitespace), not part of a word
        if rest.starts_with(char::is_whitespace) {
            return rest.trim();
        }
    }
    trimmed
}

fn resolve_confirmed_target_name(recorded_target: &str, server_desc: &str) -> String {
    let rec = recorded_target.trim();
    let cleaned_desc = strip_leading_qty_prefix(server_desc).trim();
    let desc_lower = cleaned_desc.to_lowercase();
    let is_generic_desc = cleaned_desc.is_empty()
        || desc_lower.contains("entregue na mochila")
        || desc_lower.contains("entregue no depot")
        || desc_lower.contains("venceu o sorteio");

    let needs_override = rec.is_empty()
        || rec.starts_with("Item #")
        || rec.starts_with("Offer #")
        || is_generic_category_label(rec);

    if needs_override && !is_generic_desc {
        return cleaned_desc.to_string();
    }
    if !rec.is_empty() {
        return rec.to_string();
    }
    if !is_generic_desc {
        return cleaned_desc.to_string();
    }
    "Item".to_string()
}

fn resolve_matched_offer_display_name(offer: &ParsedMarketOffer, rule: &Rule) -> String {
    if offer.is_pokemon {
        let p = offer.poke_name.trim();
        if !p.is_empty() {
            return p.to_string();
        }
        let r = rule.target_name.trim();
        if !r.is_empty() {
            return r.to_string();
        }
        return format!("Offer #{}", offer.id);
    }

    if let Some(id) = offer.item_id {
        if let Some(cat_item) = SniperCatalog::get().items_by_id.get(&id) {
            if !cat_item.name.trim().is_empty() {
                return cat_item.name.trim().to_string();
            }
        }
    }

    let raw_item = offer.item_name.trim();
    if !raw_item.is_empty() && !raw_item.starts_with("Item #") {
        return raw_item.to_string();
    }

    if rule.target_type != "category" {
        let r = rule.target_name.trim();
        if !r.is_empty() && !is_generic_category_label(r) {
            return r.to_string();
        }
    }

    if let Some(id) = offer.item_id {
        return format!("Item #{}", id);
    }

    let r = rule.target_name.trim();
    if !r.is_empty() {
        r.to_string()
    } else {
        format!("Offer #{}", offer.id)
    }
}

pub fn evaluate_offer(
    offer: &ParsedMarketOffer,
    account: &AccountState,
    runtime: &AccountRuntime,
) -> MatchDecision {
    let empty_decision = MatchDecision {
        matched: false,
        rule_id: None,
        target_display_name: String::new(),
        matched_desc: String::new(),
        buy_qty: 0,
    };

    if !account.enabled {
        return empty_decision;
    }

    let norm_curr = normalize_currency(&offer.currency);
    // Custom rules and native sniper reject diamonds or unsupported currencies
    if norm_curr != "gold" && norm_curr != "orb" {
        return empty_decision;
    }

    let avail_opt = runtime.available_balance(norm_curr);
    let avail = match avail_opt {
        Some(b) => b,
        None => return empty_decision, // Known balance required
    };

    // 1. Evaluate custom rules
    let active_rules: Vec<&Rule> = account.rules.iter().filter(|r| r.active).collect();
    for rule in &active_rules {
        if rule.max_qty > 0 && rule.total_bought >= rule.max_qty {
            continue;
        }

        let mut matches = false;
        if rule.target_type == "item" || rule.target_type.is_empty() {
            if offer.item_id.is_some() || !offer.is_pokemon {
                matches = rule.matches_item(offer.item_id, &offer.item_name);
            }
        } else if rule.target_type == "pokemon" && offer.is_pokemon {
            matches = rule.matches_pokemon(offer.species_id, &offer.poke_name);
        } else if rule.target_type == "category" && !offer.is_pokemon {
            matches = rule.matches_category(offer.item_id);
        }

        if matches {
            let price_ok = match norm_curr {
                "gold" => rule.max_price_gold > 0 && offer.price <= rule.max_price_gold,
                "orb" => rule.max_price_gems > 0 && offer.price <= rule.max_price_gems,
                _ => false,
            };

            if price_ok {
                let remaining = rule.remaining_qty(runtime.is_vip);
                if remaining == 0 { continue; }
                let mut buy_qty = offer.qty.min(remaining);
                let target_name = resolve_matched_offer_display_name(offer, rule);
                let rule_label = if !rule.target_name.trim().is_empty() {
                    rule.target_name.trim().to_string()
                } else {
                    target_name.clone()
                };

                let ceiling_str = match norm_curr {
                    "gold" => format!("{} Gold", rule.max_price_gold),
                    _ => format!("{} Gems", rule.max_price_gems),
                };

                let mut matched_desc = format!("Regra: {} (Teto: {})", rule_label, ceiling_str);

                if account.config.auto_max_affordable && offer.price > 0 {
                    let max_afford = avail / offer.price;
                    if buy_qty > max_afford {
                        buy_qty = max_afford;
                        matched_desc.push_str(&format!(" [Calibração saldo: {}x]", buy_qty));
                    }
                }

                return MatchDecision {
                    matched: true,
                    rule_id: Some(rule.id.clone()),
                    target_display_name: target_name,
                    matched_desc,
                    buy_qty,
                };
            }
        }
    }

    // 2. Global Pokémon filters
    if offer.is_pokemon && !offer.poke_name.is_empty() {
        let gcfg = &account.config;
        let mut matched = false;
        let mut target_name = offer.poke_name.clone();
        let mut matched_desc = String::new();

        if gcfg.snipe_any_shiny && offer.is_shiny {
            let price_ok = match norm_curr {
                "gold" => gcfg.max_price_shiny_gold > 0 && offer.price <= gcfg.max_price_shiny_gold,
                "orb" => gcfg.max_price_shiny_gems > 0 && offer.price <= gcfg.max_price_shiny_gems,
                _ => false,
            };
            if price_ok {
                matched = true;
                target_name = format!("✨ Shiny {}", offer.poke_name);
                matched_desc = format!("Global Shiny (Teto: {})", if norm_curr == "gold" { gcfg.max_price_shiny_gold } else { gcfg.max_price_shiny_gems });
            }
        }

        if !matched && gcfg.snipe_any_p5 && offer.potencia >= 5 {
            let price_ok = match norm_curr {
                "gold" => gcfg.max_price_p5_gold > 0 && offer.price <= gcfg.max_price_p5_gold,
                "orb" => gcfg.max_price_p5_gems > 0 && offer.price <= gcfg.max_price_p5_gems,
                _ => false,
            };
            if price_ok {
                matched = true;
                target_name = format!("⚡ P5 {}", offer.poke_name);
                matched_desc = format!("Global P5 (Teto: {})", if norm_curr == "gold" { gcfg.max_price_p5_gold } else { gcfg.max_price_p5_gems });
            }
        }

        if !matched && gcfg.snipe_by_note && gcfg.min_note >= 1.0 {
            if let Some(nota_val) = offer.nota {
                if nota_val >= gcfg.min_note {
                    let price_ok = match norm_curr {
                        "gold" => gcfg.max_price_note_gold > 0 && offer.price <= gcfg.max_price_note_gold,
                        "orb" => gcfg.max_price_note_gems > 0 && offer.price <= gcfg.max_price_note_gems,
                        _ => false,
                    };
                    if price_ok {
                        matched = true;
                        target_name = format!("★ Nota {:.1} {}", nota_val, offer.poke_name);
                        matched_desc = format!("Nota Oficial >= {:.1} (Teto: {})", gcfg.min_note, if norm_curr == "gold" { gcfg.max_price_note_gold } else { gcfg.max_price_note_gems });
                    }
                }
            }
        }

        if matched {
            let mut buy_qty = 1u64;
            if account.config.auto_max_affordable && offer.price > 0 {
                if avail < offer.price {
                    buy_qty = 0;
                }
            }
            return MatchDecision {
                matched: true,
                rule_id: None,
                target_display_name: target_name,
                matched_desc,
                buy_qty,
            };
        }
    }

    empty_decision
}

// =========================================================================
// 7. GLOBAL THREAD-SAFE ENGINE & TAURI COMMANDS
// =========================================================================

fn default_storage_path() -> PathBuf {
    crate::credentials::get_app_data_dir().join("sniper-native.json")
}

fn global_engine() -> &'static Mutex<Result<SniperEngine, String>> {
    static ENGINE: OnceLock<Mutex<Result<SniperEngine, String>>> = OnceLock::new();
    ENGINE.get_or_init(|| Mutex::new(SniperEngine::new(Some(default_storage_path()))))
}

pub fn global_get_state() -> Result<SniperSnapshot, String> {
    let mut guard = global_engine().lock().map_err(|e| e.to_string())?;
    let engine = guard.as_mut().map_err(|e| e.clone())?;
    Ok(engine.get_snapshot())
}

pub fn global_save_settings(indices: Vec<usize>, settings: SniperSettingsInput) -> Result<SniperSnapshot, String> {
    let mut guard = global_engine().lock().map_err(|e| e.to_string())?;
    let engine = guard.as_mut().map_err(|e| e.clone())?;
    engine.save_settings(indices, settings)
}

pub fn global_clear_history(index: usize) -> Result<SniperSnapshot, String> {
    let mut guard = global_engine().lock().map_err(|e| e.to_string())?;
    let engine = guard.as_mut().map_err(|e| e.clone())?;
    engine.clear_history(index)
}

pub fn global_ingest(index: usize, logs: Vec<SniperLogEntry>, progress: Option<Vec<RuleProgress>>) -> Result<SniperSnapshot, String> {
    let mut guard = global_engine().lock().map_err(|e| e.to_string())?;
    let engine = guard.as_mut().map_err(|e| e.clone())?;
    engine.ingest_logs(index, logs, progress)
}

pub fn feed_welcome(index: usize, msg: &Value) {
    if let Ok(mut guard) = global_engine().lock() {
        if let Ok(engine) = guard.as_mut() {
            engine.feed_welcome(index, msg);
        }
    }
}

pub fn on_connect(index: usize) -> Vec<Value> {
    if let Ok(mut guard) = global_engine().lock() {
        if let Ok(engine) = guard.as_mut() {
            return engine.on_connect(index);
        }
    }
    Vec::new()
}

pub fn on_tick(index: usize, now_ms_val: u64, app: Option<&AppHandle>) -> Vec<Value> {
    if let Ok(mut guard) = global_engine().lock() {
        if let Ok(engine) = guard.as_mut() {
            return engine.on_tick(index, now_ms_val, app);
        }
    }
    Vec::new()
}

pub fn on_message(index: usize, msg: &Value, app: Option<&AppHandle>) -> Vec<Value> {
    if let Ok(mut guard) = global_engine().lock() {
        if let Ok(engine) = guard.as_mut() {
            return engine.on_message(index, msg, app);
        }
    }
    Vec::new()
}

pub fn on_disconnect(index: usize, app: Option<&AppHandle>) {
    if let Ok(mut guard) = global_engine().lock() {
        if let Ok(engine) = guard.as_mut() {
            engine.on_disconnect(index, app);
        }
    }
}

pub fn on_send_failure(index: usize, cmd: &Value) {
    if let Ok(mut guard) = global_engine().lock() {
        if let Ok(engine) = guard.as_mut() {
            engine.on_send_failure(index, cmd);
        }
    }
}

pub fn update_vip(index: usize, is_vip: bool) {
    if let Ok(mut guard) = global_engine().lock() {
        if let Ok(engine) = guard.as_mut() {
            if index < 4 { engine.runtimes[index].is_vip = is_vip; }
        }
    }
}

pub fn update_balance(index: usize, gold: Option<i64>, diamonds: Option<i64>, orbs: Option<i64>) {
    if let Ok(mut guard) = global_engine().lock() {
        if let Ok(engine) = guard.as_mut() {
            if index < 4 {
                let rt = &mut engine.runtimes[index];
                if let Some(g) = gold { rt.gold = g; }
                if let Some(d) = diamonds { rt.diamonds = d; }
                if let Some(o) = orbs { rt.orbs = o; }
            }
        }
    }
}

// Tauri IPC Command wrappers
#[tauri::command]
pub fn sniper_get_state() -> Result<SniperSnapshot, String> {
    global_get_state()
}

#[tauri::command]
pub fn sniper_save(
    app: AppHandle,
    indices: Vec<usize>,
    settings: SniperSettingsInput,
) -> Result<SniperSnapshot, String> {
    let snapshot = global_save_settings(indices, settings)?;
    let _ = app.emit("sniper:updated", &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn sniper_clear_history(
    app: AppHandle,
    index: usize,
) -> Result<SniperSnapshot, String> {
    let snapshot = global_clear_history(index)?;
    let _ = app.emit("sniper:updated", &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn sniper_ingest(
    app: AppHandle,
    index: usize,
    logs: Vec<SniperLogEntry>,
    progress: Option<Vec<RuleProgress>>,
) -> Result<SniperSnapshot, String> {
    let snapshot = global_ingest(index, logs, progress)?;
    let _ = app.emit("sniper:updated", &snapshot);
    Ok(snapshot)
}

// =========================================================================
// 8. PURE FIXTURE & INTEGRATION TESTS (ISOLATED ENGINE ONLY)
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

    static TEST_ENGINE_COUNTER: AtomicU64 = AtomicU64::new(1);

    fn temp_test_engine() -> (SniperEngine, PathBuf) {
        let c = TEST_ENGINE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let tid = format!("{:?}", std::thread::current().id());
        let clean_tid = tid.replace(|ch: char| !ch.is_alphanumeric(), "_");
        let unique_name = format!("sniper_test_{}_{}_{}_{}.json", now_ms(), std::process::id(), clean_tid, c);
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join(unique_name);
        let engine = SniperEngine::new(Some(path.clone())).expect("failed to init temp engine");
        (engine, path)
    }

    #[test]
    fn test_end_to_end_welcome_and_handshake_balance() {
        let (mut engine, path) = temp_test_engine();
        let welcome_pkt = json!({
            "t": "welcome",
            "servidorAgora": 1700000000000u64,
            "estado": {
                "gold": 500000,
                "diamonds": 150,
                "orbs": 300,
                "servidorAgora": 1700000000000u64
            }
        });

        engine.feed_welcome(0, &welcome_pkt);
        assert_eq!(engine.runtimes[0].gold, 500000);
        assert_eq!(engine.runtimes[0].diamonds, 150);
        assert_eq!(engine.runtimes[0].orbs, 300);
        assert!(engine.runtimes[0].available_balance("gold") == Some(500000));
        assert!(engine.runtimes[0].available_balance("orb") == Some(300));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_end_to_end_market_scan_and_immediate_buy() {
        let (mut engine, path) = temp_test_engine();

        // 1. Save settings for account 0
        let save_res = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_stone".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 50000,
                max_price_gems: 0,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        assert!(save_res.is_ok(), "save_settings failed: {:?}", save_res.err());

        // 2. Set balance
        engine.runtimes[0].gold = 100000;

        // 3. Receive market listing
        let market_pkt = json!({
            "t": "market",
            "linhas": [{
                "id": 9001,
                "itemId": 2,
                "preco": 35000,
                "qtd": 2,
                "moeda": "gold",
                "vendedor": "Oak"
            }]
        });

        let cmds = engine.on_message(0, &market_pkt, None);
        assert_eq!(cmds.len(), 1);
        assert_eq!(cmds[0]["t"], "market.comprar");
        assert_eq!(cmds[0]["id"], 9001);
        assert_eq!(cmds[0]["qtd"], 2);
        assert_eq!(cmds[0]["preco"], 35000);

        // Verify balance reserved and single outstanding order set
        assert_eq!(engine.runtimes[0].reserved_gold, 70000);
        assert!(engine.runtimes[0].outstanding_buy.is_some());
        // Preconsumed quantity on rule
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 2);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_end_to_end_battle_confirmation_increments_once() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r1".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 50000,
                max_price_gems: 0,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        engine.runtimes[0].gold = 100000;
        let _ = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 1001, "itemId": 2, "preco": 20000, "qtd": 1, "moeda": "gold"}]
        }), None);

        assert!(engine.runtimes[0].outstanding_buy.is_some());

        // Send battle confirmation
        let battle_pkt = json!({
            "t": "batalha",
            "ev": [{"k": "marketComprado", "descricao": "Ancient Stone entregue ao depot"}]
        });
        let _ = engine.on_message(0, &battle_pkt, None);

        // Counter already preconsumed to 1, reservation released, confirmation does not double count
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);
        assert_eq!(engine.runtimes[0].reserved_gold, 0);
        assert!(engine.runtimes[0].outstanding_buy.is_none());
        // Cached balance debited by 20000 (100000 - 20000 = 80000)
        assert_eq!(engine.runtimes[0].gold, 80000);

        // Second battle packet does NOT double count or double debit
        let _ = engine.on_message(0, &battle_pkt, None);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);
        assert_eq!(engine.runtimes[0].gold, 80000);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_battle_confirmation_with_absent_wallet_followed_by_unrelated_hunt_cannot_restore_old_balance() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r1".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 50000,
                max_price_gems: 0,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        engine.runtimes[0].gold = 100000;
        let _ = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 1001, "itemId": 2, "preco": 30000, "qtd": 1, "moeda": "gold"}]
        }), None);

        assert!(engine.runtimes[0].outstanding_buy.is_some());

        // 1. Confirm buy: packet has NO wallet fields
        let battle_confirm = json!({
            "t": "batalha",
            "ev": [{"k": "marketComprado", "descricao": "Ancient Stone entregue!"}]
        });
        let _ = engine.on_message(0, &battle_confirm, None);

        assert_eq!(engine.runtimes[0].gold, 70000);
        assert_eq!(engine.runtimes[0].available_balance("gold"), Some(70000));

        // 2. Unrelated hunt battle update arrives (morte de selvagem, sem campos de carteira)
        let hunt_update = json!({
            "t": "batalha",
            "ev": [{"k": "morte", "quem": "selvagem", "xp": 40}]
        });
        let _ = engine.on_message(0, &hunt_update, None);

        // 3. Balance MUST remain 70000 (not restored to 100000)
        assert_eq!(engine.runtimes[0].gold, 70000);
        assert_eq!(engine.runtimes[0].available_balance("gold"), Some(70000));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_unrelated_error_leaves_pending_buy_intact_and_market_error_releases() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r1".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(53)),
                target_name: "Fire Stone".into(),
                max_price_gold: 25000,
                max_price_gems: 0,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        engine.runtimes[0].gold = 50000;
        let _ = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 2002, "itemId": 53, "preco": 20000, "qtd": 1, "moeda": "gold"}]
        }), None);

        assert_eq!(engine.runtimes[0].reserved_gold, 20000);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);
        assert!(engine.runtimes[0].outstanding_buy.is_some());

        // 1. Unrelated shop / auto-supply errors: MUST NOT release pending market buy!
        let _ = engine.on_message(0, &json!({ "t": "erro", "chave": "saldo_insuficiente", "msg": "Saldo insuficiente para comprar pokebolas" }), None);
        assert!(engine.runtimes[0].outstanding_buy.is_some(), "Generic saldo_insuficiente mistakenly released buy!");

        let _ = engine.on_message(0, &json!({ "t": "erro", "chave": "estoque_esgotado", "msg": "Estoque esgotado no shop" }), None);
        assert!(engine.runtimes[0].outstanding_buy.is_some(), "Shop estoque error mistakenly released buy!");

        assert_eq!(engine.runtimes[0].reserved_gold, 20000);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);

        // 2. Explicitly market-correlated error arrives: rolls back preconsumed quantity and reservation!
        let _ = engine.on_message(0, &json!({ "t": "erro", "chave": "anuncio_expirado", "msg": "Anúncio expirado ou cancelado" }), None);

        assert!(engine.runtimes[0].outstanding_buy.is_none());
        assert_eq!(engine.runtimes[0].reserved_gold, 0);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 0);
        assert_eq!(engine.store.accounts[0].logs[0].status, "RECUSADO");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_end_to_end_timeout_and_late_confirmation() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_time".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(28)),
                target_name: "Crystal Stone".into(),
                max_price_gold: 15000,
                max_price_gems: 0,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        engine.runtimes[0].gold = 50000;
        let _ = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 3003, "itemId": 28, "preco": 10000, "qtd": 1, "moeda": "gold"}]
        }), None);

        // Force timeout in runtime
        if let Some(buy) = &mut engine.runtimes[0].outstanding_buy {
            buy.sent_at = Instant::now() - Duration::from_secs(15);
        }

        let _ = engine.on_tick(0, now_ms(), None);
        assert_eq!(engine.runtimes[0].outstanding_buy.as_ref().unwrap().state, BuyState::UncertainBlocked);
        // Budget consumed conservatively on emission, retained on timeout
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);

        // Subsequent offer is blocked
        let blocked_cmds = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 3004, "itemId": 28, "preco": 5000, "qtd": 1, "moeda": "gold"}]
        }), None);
        assert!(blocked_cmds.is_empty());

        // Late confirmation arrives and reconciles without double-counting
        let _ = engine.on_message(0, &json!({
            "t": "batalha",
            "ev": [{"k": "marketComprado", "descricao": "Crystal Stone entregue!"}]
        }), None);

        assert!(engine.runtimes[0].outstanding_buy.is_none());
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1); // Not 2!
        assert_eq!(engine.runtimes[0].gold, 40000); // 50000 - 10000

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_reopen_same_file_after_emitted_buy_preserves_consumption() {
        let c = TEST_ENGINE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let unique_name = format!("sniper_reopen_{}_{}_{}.json", now_ms(), std::process::id(), c);
        let path = std::env::temp_dir().join(unique_name);

        {
            let mut engine = SniperEngine::new(Some(path.clone())).expect("init temp engine failed");
            let _ = engine.save_settings(vec![0], SniperSettingsInput {
                enabled: true,
                rules: vec![Rule {
                    id: "r_single".into(),
                    target_type: "item".into(),
                    target_category: None,
                    target_id: Some(json!(2)),
                    target_name: "Ancient Stone".into(),
                    max_price_gold: 50000,
                    max_price_gems: 0,
                    max_qty: 1,
                    infinite: false,
                    active: true,
                    total_bought: 0,
                    excluded_item_ids: Vec::new(),
                    extra: HashMap::new(),
                }],
                config: SniperConfig::default(),
            });

            engine.runtimes[0].gold = 100000;
            let cmds = engine.on_message(0, &json!({
                "t": "market",
                "linhas": [{"id": 7001, "itemId": 2, "preco": 30000, "qtd": 1, "moeda": "gold"}]
            }), None);
            assert_eq!(cmds.len(), 1);
            // Intent persisted, preconsumed
            assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);
            // Drop engine without receiving confirmation!
        }

        // Reopen same file in a brand new engine
        let mut engine2 = SniperEngine::new(Some(path.clone())).expect("reopen failed");
        assert_eq!(engine2.store.accounts[0].rules[0].total_bought, 1);
        engine2.runtimes[0].gold = 100000;

        // Try another buy offer -> maxQty 1 is already exhausted!
        let second_cmds = engine2.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 7002, "itemId": 2, "preco": 30000, "qtd": 1, "moeda": "gold"}]
        }), None);
        assert!(second_cmds.is_empty(), "Repeat buy was allowed beyond maxQty!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_disk_failure_on_immediate_and_scheduled_buy_returns_no_buy() {
        let temp_dir = std::env::temp_dir();
        let c = TEST_ENGINE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let blocking_file = temp_dir.join(format!("blocking_disk_fail_{}_{}_{}.tmp", now_ms(), std::process::id(), c));
        std::fs::write(&blocking_file, b"parent_file_cannot_be_directory").unwrap();
        let invalid_path = blocking_file.join("sub_invalid").join("sniper.json");

        let mut engine = SniperEngine::new(None).unwrap();

        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_fail".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 50000,
                max_price_gems: 0,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        engine.runtimes[0].gold = 100000;
        // Point storage to invalid path where parent directory creation fails
        engine.storage_path = Some(invalid_path);

        // Immediate buy with disk failure must return empty and mutate nothing
        let cmds = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 8001, "itemId": 2, "preco": 30000, "qtd": 1, "moeda": "gold"}]
        }), None);
        assert!(cmds.is_empty(), "Buy was emitted despite disk failure!");
        assert_eq!(engine.runtimes[0].reserved_gold, 0);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 0);

        let _ = std::fs::remove_file(blocking_file);
    }

    #[test]
    fn test_timeout_disconnect_reconnect_consumes_exactly_once() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_once".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 50000,
                max_price_gems: 0,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        engine.runtimes[0].gold = 100000;

        // 1. Emit buy
        let _ = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 9999, "itemId": 2, "preco": 30000, "qtd": 1, "moeda": "gold"}]
        }), None);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);

        // 2. Timeout
        if let Some(buy) = &mut engine.runtimes[0].outstanding_buy {
            buy.sent_at = Instant::now() - Duration::from_secs(15);
        }
        let _ = engine.on_tick(0, now_ms(), None);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);

        // 3. Disconnect: clears wallet to unknown (-1)
        engine.on_disconnect(0, None);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);
        assert_eq!(engine.runtimes[0].gold, -1);
        assert_eq!(engine.runtimes[0].available_balance("gold"), None);

        // 4. Reconnect
        let _ = engine.on_connect(0);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_end_to_end_currency_enforcement_rejects_diamonds_for_rules() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_gems".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(5)),
                target_name: "Beast Ball".into(),
                max_price_gold: 0,
                max_price_gems: 50,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        engine.runtimes[0].gold = 50000;
        engine.runtimes[0].orbs = 100;
        engine.runtimes[0].diamonds = 100;

        // Diamantes currency must be REJECTED for maxPriceGems ceiling
        let dia_cmds = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 4001, "itemId": 5, "preco": 10, "qtd": 1, "moeda": "diamantes"}]
        }), None);
        assert!(dia_cmds.is_empty());

        // Orb currency must be ACCEPTED
        let orb_cmds = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 4002, "itemId": 5, "preco": 10, "qtd": 1, "moeda": "orb"}]
        }), None);
        assert_eq!(orb_cmds.len(), 1);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_end_to_end_disabled_account_no_buys() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: false, // Disabled!
            rules: vec![Rule {
                id: "r_dis".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 50000,
                max_price_gems: 0,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        engine.runtimes[0].gold = 100000;
        let cmds = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 5001, "itemId": 2, "preco": 1000, "qtd": 1, "moeda": "gold"}]
        }), None);
        assert!(cmds.is_empty());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_end_to_end_universal_save_counter_isolation() {
        let (mut engine, path) = temp_test_engine();

        // Account 0 initially has rule "r_common" with total_bought = 7
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_common".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 50000,
                max_price_gems: 0,
                max_qty: 10,
                infinite: false,
                active: true,
                total_bought: 7,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 7);

        // Universal save across accounts [0, 1] with total_bought: 99 in payload
        let _ = engine.save_settings(vec![0, 1], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_common".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 60000,
                max_price_gems: 0,
                max_qty: 10,
                infinite: false,
                active: true,
                total_bought: 99,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        // Account 0 must preserve its existing 7
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 7);
        // Account 1 (new rule on this account) must be 0 (never copy from account 0 or payload)
        assert_eq!(engine.store.accounts[1].rules[0].total_bought, 0);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_end_to_end_failed_persist_leaves_memory_unchanged() {
        let temp_dir = std::env::temp_dir();
        let c = TEST_ENGINE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let blocking_file = temp_dir.join(format!("blocking_persist_{}_{}_{}.tmp", now_ms(), std::process::id(), c));
        std::fs::write(&blocking_file, b"existing_file_cannot_be_directory").unwrap();
        // Use blocking_file as parent directory -> creating a file inside a regular file MUST fail on all OSes
        let invalid_path = blocking_file.join("sub_invalid").join("test.json");

        let mut engine = SniperEngine::new(None).unwrap();
        engine.storage_path = Some(invalid_path);

        let initial_snapshot = engine.get_snapshot();
        let res = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_fail".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 10000,
                max_price_gems: 0,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        assert!(res.is_err());
        assert_eq!(engine.get_snapshot(), initial_snapshot);

        let _ = std::fs::remove_file(blocking_file);
    }

    #[test]
    fn test_end_to_end_ingest_progress_and_logs() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_prog".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 10000,
                max_price_gems: 0,
                max_qty: 10,
                infinite: false,
                active: true,
                total_bought: 2,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        let ingest_res = engine.ingest_logs(0, vec![
            SniperLogEntry {
                id: "log_v1".into(),
                timestamp: 1000,
                status: "CONFIRMADO".into(),
                target_name: "Ancient Stone".into(),
                price: Some(5000),
                currency: Some("gold".into()),
                qty: Some(1),
                offer_id: Some(101),
                details: "Visual engine log".into(),
                account_index: Some(0),
                extra: HashMap::new(),
            }
        ], Some(vec![RuleProgress { id: "r_prog".into(), total_bought: 5 }]));

        assert!(ingest_res.is_ok());
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 5);
        assert_eq!(engine.store.accounts[0].logs.len(), 1);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_clear_history_persists_cutoff_and_ignores_reingested_old_logs() {
        let c = TEST_ENGINE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let unique_name = format!("sniper_clear_reingest_{}_{}_{}.json", now_ms(), std::process::id(), c);
        let path = std::env::temp_dir().join(unique_name);

        {
            let mut engine = SniperEngine::new(Some(path.clone())).expect("init temp engine failed");
            // Ingest log at ts 1000
            let _ = engine.ingest_logs(0, vec![SniperLogEntry {
                id: "log_old".into(),
                timestamp: 1000,
                status: "CONFIRMADO".into(),
                target_name: "Ancient Stone".into(),
                price: Some(1000),
                currency: Some("gold".into()),
                qty: Some(1),
                offer_id: Some(1),
                details: "Old visual log".into(),
                account_index: Some(0),
                extra: HashMap::new(),
            }], None);

            assert_eq!(engine.store.accounts[0].logs.len(), 1);

            // Clear history: sets history_cleared_at cutoff to now_ms() >= 1000
            let clear_res = engine.clear_history(0);
            assert!(clear_res.is_ok());
            assert_eq!(engine.store.accounts[0].logs.len(), 0);
            assert!(engine.store.accounts[0].history_cleared_at >= 1000);
        }

        // Reopen same file in a brand new engine
        let mut engine2 = SniperEngine::new(Some(path.clone())).expect("reopen failed");
        assert_eq!(engine2.store.accounts[0].logs.len(), 0);
        let cutoff = engine2.store.accounts[0].history_cleared_at;
        assert!(cutoff >= 1000);

        // Reingest old log (ts 1000 <= cutoff) AND new log (ts > cutoff)
        let _ = engine2.ingest_logs(0, vec![
            SniperLogEntry {
                id: "log_old".into(),
                timestamp: 1000,
                status: "CONFIRMADO".into(),
                target_name: "Ancient Stone".into(),
                price: Some(1000),
                currency: Some("gold".into()),
                qty: Some(1),
                offer_id: Some(1),
                details: "Old visual log repeated".into(),
                account_index: Some(0),
                extra: HashMap::new(),
            },
            SniperLogEntry {
                id: "log_new".into(),
                timestamp: cutoff + 500,
                status: "CONFIRMADO".into(),
                target_name: "Ancient Stone".into(),
                price: Some(2000),
                currency: Some("gold".into()),
                qty: Some(1),
                offer_id: Some(2),
                details: "New log after clear".into(),
                account_index: Some(0),
                extra: HashMap::new(),
            }
        ], None);

        // Old log is ignored, only the new log is preserved!
        assert_eq!(engine2.store.accounts[0].logs.len(), 1);
        assert_eq!(engine2.store.accounts[0].logs[0].id, "log_new");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_representative_real_welcome_fixture_from_game_headless() {
        let (mut engine, path) = temp_test_engine();

        // Real fixture shape from game_headless::tests::headless_telemetry_extracts_trainer_eu_currencies
        let real_welcome = json!({
            "t": "welcome",
            "servidorAgora": 1700000000000u64,
            "data": {
                "estado": {
                    "eu": {
                        "nick": "AltMaster",
                        "gold": 45000,
                        "diamonds": 120,
                        "gemas": 350,
                        "vipAte": 2000000000000u64
                    }
                }
            }
        });

        engine.feed_welcome(0, &real_welcome);
        assert_eq!(engine.runtimes[0].gold, 45000);
        assert_eq!(engine.runtimes[0].diamonds, 120);
        assert_eq!(engine.runtimes[0].orbs, 350);
        assert_eq!(engine.runtimes[0].is_vip, true);
        assert_eq!(engine.runtimes[0].available_balance("gold"), Some(45000));
        assert_eq!(engine.runtimes[0].available_balance("orb"), Some(350));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_actual_userscript_preset_shapes_serde_compatibility() {
        let (mut engine, path) = temp_test_engine();

        // Actual newRule shape from ui/presets/auto-sniper.js lines 6147-6160
        let preset_rule_json = json!({
            "id": "rule_1730272000000_a1b2",
            "targetType": "item",
            "targetId": 2,
            "targetName": "Ancient Stone",
            "icon": "ancient_stone.png",
            "maxPriceGold": 45000,
            "maxPriceGems": 50,
            "maxPriceDiamonds": 50, // Inert duplicate compatibility field
            "infinite": false,
            "maxQty": 10,
            "totalBought": 0,
            "active": true,
            "createdAt": 1730272000000u64
        });

        let rule: Rule = serde_json::from_value(preset_rule_json).expect("Deserializing preset newRule failed");
        assert_eq!(rule.max_price_gems, 50);

        // Actual globalConfig shape from ui/presets/auto-sniper.js lines 1055-1070
        let preset_config_json = json!({
            "snipeAnyShiny": false,
            "maxPriceShinyGold": 50000,
            "maxPriceShinyGems": 0,
            "maxPriceShinyDiamonds": 0,
            "snipeAnyP5": false,
            "maxPriceP5Gold": 100000,
            "maxPriceP5Gems": 0,
            "maxPriceP5Diamonds": 0,
            "snipeByNote": false,
            "minNote": 7.0,
            "maxPriceNoteGold": 50000,
            "maxPriceNoteGems": 0,
            "maxPriceNoteDiamonds": 0,
            "maxActiveSlots": 5,
            "autoMaxAffordable": true
        });

        let config: SniperConfig = serde_json::from_value(preset_config_json).expect("Deserializing preset config failed");

        // Saving this exact shipped preset must SUCCEED
        let res = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![rule],
            config,
        });
        assert!(res.is_ok(), "Actual preset shape save failed: {:?}", res.err());

        // Mismatched maxPriceDiamonds must be REJECTED
        let mismatched_rule_json = json!({
            "id": "rule_bad_diamonds",
            "targetType": "item",
            "targetId": 2,
            "targetName": "Ancient Stone",
            "maxPriceGold": 10000,
            "maxPriceGems": 10,
            "maxPriceDiamonds": 999, // Mismatched!
            "active": true
        });
        let bad_rule: Rule = serde_json::from_value(mismatched_rule_json).unwrap();
        let bad_save = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![bad_rule],
            config: SniperConfig::default(),
        });
        assert!(bad_save.is_err(), "Mismatched maxPriceDiamonds was accepted!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_validation_rejects_unsupported_filters_and_note_snipe() {
        let (mut engine, path) = temp_test_engine();

        // 1. Unsupported seller/vendedor in extra must be REJECTED
        let mut bad_extra = HashMap::new();
        bad_extra.insert("seller".into(), json!("Gary"));
        let res_seller = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r1".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 1000,
                max_price_gems: 0,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: bad_extra,
            }],
            config: SniperConfig::default(),
        });
        assert!(res_seller.is_err(), "Unsupported seller filter was allowed!");

        // 2. Unsupported moeda in extra must be REJECTED
        let mut bad_extra_m = HashMap::new();
        bad_extra_m.insert("moeda".into(), json!("gold"));
        let res_moeda = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r2".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 1000,
                max_price_gems: 0,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: bad_extra_m,
            }],
            config: SniperConfig::default(),
        });
        assert!(res_moeda.is_err(), "Unsupported moeda filter was allowed!");

        // 3. snipeByNote: minNote < 1.0 must be REJECTED, but minNote >= 1.0 must SUCCEED
        let mut cfg_bad = SniperConfig::default();
        cfg_bad.snipe_by_note = true;
        cfg_bad.min_note = 0.5; // Under 1.0
        let res_note_bad = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![],
            config: cfg_bad,
        });
        assert!(res_note_bad.is_err(), "snipeByNote with minNote < 1.0 was allowed!");

        let mut cfg_good = SniperConfig::default();
        cfg_good.snipe_by_note = true;
        cfg_good.min_note = 7.0;
        let res_note_good = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![],
            config: cfg_good,
        });
        assert!(res_note_good.is_ok(), "Valid snipeByNote failed: {:?}", res_note_good.err());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_validation_rejects_nonpositive_target_id_and_exact_species_name() {
        let (mut engine, path) = temp_test_engine();

        // 1. target_id: 0 must be REJECTED
        let res_zero = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_zero".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(0)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 1000,
                max_price_gems: 0,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        assert!(res_zero.is_err(), "targetId 0 was allowed!");

        // 2. Exact species name: "Mew" must NOT match "Mewtwo"
        let rule_mew = Rule {
            id: "r_mew".into(),
            target_type: "pokemon".into(),
            target_category: None,
            target_id: None,
            target_name: "Mew".into(),
            max_price_gold: 10000,
            max_price_gems: 0,
            max_qty: 1,
            infinite: false,
            active: true,
            total_bought: 0,
            excluded_item_ids: Vec::new(),
            extra: HashMap::new(),
        };
        // Species ID None, comparing name
        assert!(rule_mew.matches_pokemon(None, "Mew"));
        assert!(!rule_mew.matches_pokemon(None, "Mewtwo"), "Substring matching erroneously matched Mewtwo for Mew!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_loaded_file_rejects_future_version() {
        let temp_dir = std::env::temp_dir();
        let c = TEST_ENGINE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = temp_dir.join(format!("sniper_future_{}_{}_{}.json", now_ms(), std::process::id(), c));

        let future_json = json!({
            "accounts": [
                AccountState::new(0),
                AccountState::new(1),
                AccountState::new(2),
                AccountState::new(3)
            ],
            "version": 999
        });
        std::fs::write(&path, serde_json::to_vec_pretty(&future_json).unwrap()).unwrap();

        let engine = SniperEngine::new(Some(path.clone()));
        assert!(engine.is_err(), "Future version 999 was erroneously loaded!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_concurrent_engine_calls_no_deadlock() {
        let engine = Arc::new(Mutex::new(SniperEngine::new(None).unwrap()));
        let mut handles = Vec::new();

        for i in 0..8 {
            let eng = Arc::clone(&engine);
            let handle = std::thread::spawn(move || {
                for _ in 0..10 {
                    let mut guard = eng.lock().unwrap();
                    let _ = guard.on_tick(i % 4, now_ms(), None);
                    let _ = guard.get_snapshot();
                }
            });
            handles.push(handle);
        }

        for h in handles {
            h.join().expect("thread join failed");
        }
    }

    #[test]
    fn test_category_matching_stones_including_shiny_stone() {
        let rule = Rule {
            id: "cat_stone".into(),
            target_type: "category".into(),
            target_category: Some("stone".into()),
            target_id: None,
            target_name: "Pedras".into(),
            max_price_gold: 50000,
            max_price_gems: 10,
            max_qty: 5,
            infinite: false,
            active: true,
            total_bought: 0,
            excluded_item_ids: Vec::new(),
            extra: HashMap::new(),
        };

        // 1. Matches classic Ancient Stone (ID 2, stone)
        assert!(rule.matches_category(Some(2)));

        // 2. Matches Bug Shiny Stone (ID 70031, stone)
        assert!(rule.matches_category(Some(70031)));

        // 3. Excludes Beast Ball (ID 5, category beast)
        assert!(!rule.matches_category(Some(5)));

        // 4. Excludes unknown item ID (9999998)
        assert!(!rule.matches_category(Some(9999998)));

        // 5. Excludes None
        assert!(!rule.matches_category(None));

        // 6. Test evaluate_offer with category rule
        let mut account = AccountState::new(0);
        account.enabled = true;
        account.rules.push(rule);
        let mut runtime = AccountRuntime::default();
        runtime.gold = 100000;
        runtime.orbs = 100;

        // Ancient Stone offer
        let offer_ancient = ParsedMarketOffer {
            id: 101,
            price: 25000,
            qty: 1,
            currency: "gold".into(),
            seller: "Ash".into(),
            compravel_em: None,
            item_id: Some(2),
            item_name: "Ancient Stone".into(),
            species_id: None,
            poke_name: "".into(),
            is_pokemon: false,
            is_shiny: false,
            potencia: 1,
            nota: None,
        };
        let dec_ancient = evaluate_offer(&offer_ancient, &account, &runtime);
        assert!(dec_ancient.matched);
        assert_eq!(dec_ancient.buy_qty, 1);
        assert_eq!(dec_ancient.rule_id, Some("cat_stone".into()));

        // Bug Shiny Stone offer in gems
        let offer_shiny_stone = ParsedMarketOffer {
            id: 102,
            price: 8,
            qty: 1,
            currency: "orb".into(),
            seller: "Misty".into(),
            compravel_em: None,
            item_id: Some(70031),
            item_name: "Bug Shiny Stone".into(),
            species_id: None,
            poke_name: "".into(),
            is_pokemon: false,
            is_shiny: false,
            potencia: 1,
            nota: None,
        };
        let dec_shiny_stone = evaluate_offer(&offer_shiny_stone, &account, &runtime);
        assert!(dec_shiny_stone.matched);
        assert_eq!(dec_shiny_stone.buy_qty, 1);

        // Beast Ball offer
        let offer_beast = ParsedMarketOffer {
            id: 103,
            price: 5000,
            qty: 1,
            currency: "gold".into(),
            seller: "Brock".into(),
            compravel_em: None,
            item_id: Some(5),
            item_name: "Beast Ball".into(),
            species_id: None,
            poke_name: "".into(),
            is_pokemon: false,
            is_shiny: false,
            potencia: 1,
            nota: None,
        };
        let dec_beast = evaluate_offer(&offer_beast, &account, &runtime);
        assert!(!dec_beast.matched, "Beast Ball erroneously matched stone category!");

        // Pokemon offer even if item_id happens to be 2
        let offer_poke = ParsedMarketOffer {
            id: 104,
            price: 5000,
            qty: 1,
            currency: "gold".into(),
            seller: "Gary".into(),
            compravel_em: None,
            item_id: Some(2),
            item_name: "".into(),
            species_id: Some(2),
            poke_name: "Ivysaur".into(),
            is_pokemon: true,
            is_shiny: false,
            potencia: 1,
            nota: None,
        };
        let dec_poke = evaluate_offer(&offer_poke, &account, &runtime);
        assert!(!dec_poke.matched, "Pokemon offer erroneously matched category rule!");
    }

    #[test]
    fn test_category_aggregate_limit() {
        let (mut engine, path) = temp_test_engine();

        let save_res = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_stones".into(),
                target_type: "category".into(),
                target_category: Some("stone".into()),
                target_id: None,
                target_name: "Pedras".into(),
                max_price_gold: 50000,
                max_price_gems: 0,
                max_qty: 2, // TOTAL across all items in category
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        assert!(save_res.is_ok());

        engine.runtimes[0].gold = 500000;

        // Buy 1 Ancient Stone (ID 2)
        let buy1 = engine.try_emit_buy(
            0,
            201,
            Some("r_stones".into()),
            "Ancient Stone".into(),
            1,
            20000,
            "gold".into(),
            now_ms(),
        );
        assert!(buy1.is_some());
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);

        // Clear outstanding buy to allow next
        engine.runtimes[0].outstanding_buy = None;
        engine.store.accounts[0].pending_intent = None;

        // Buy 1 Cocoon Stone (ID 23)
        let buy2 = engine.try_emit_buy(
            0,
            202,
            Some("r_stones".into()),
            "Cocoon Stone".into(),
            1,
            25000,
            "gold".into(),
            now_ms(),
        );
        assert!(buy2.is_some());
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 2);

        // Now total_bought == 2 == max_qty. Next evaluation of ANY stone must be skipped
        let offer_water = ParsedMarketOffer {
            id: 203,
            price: 10000,
            qty: 1,
            currency: "gold".into(),
            seller: "Misty".into(),
            compravel_em: None,
            item_id: Some(142),
            item_name: "Water Stone".into(),
            species_id: None,
            poke_name: "".into(),
            is_pokemon: false,
            is_shiny: false,
            potencia: 1,
            nota: None,
        };
        let dec3 = evaluate_offer(&offer_water, &engine.store.accounts[0], &engine.runtimes[0]);
        assert!(!dec3.matched, "Category rule aggregate limit was exceeded!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_category_market_itens_expansion_both_currencies() {
        let (mut engine, path) = temp_test_engine();

        let save_res = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_stones".into(),
                target_type: "category".into(),
                target_category: Some("stone".into()),
                target_id: None,
                target_name: "Pedras".into(),
                max_price_gold: 50000,
                max_price_gems: 10,
                max_qty: 10,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        assert!(save_res.is_ok());

        // Resumo packet with Ancient Stone (ID 2) eligible for BOTH gold and orb
        // and Bug Shiny Stone (ID 70031) eligible for orb
        let resumo_pkt = json!({
            "t": "market",
            "aba": "itens",
            "resumo": {
                "2": { "minGold": 25000, "minOrb": 5 },
                "70031": { "minGold": 999999, "minOrb": 8 },
                "5": { "minGold": 1000, "minOrb": 1 } // Beast Ball (category beast, not stone)
            }
        });

        let cmds = engine.on_message(0, &resumo_pkt, None);

        // Ancient Stone must emit BOTH gold and orb queries!
        let has_ancient_gold = cmds.iter().any(|c| c["t"] == "market.item" && c["itemId"] == 2 && c["moeda"] == "gold");
        let has_ancient_orb = cmds.iter().any(|c| c["t"] == "market.item" && c["itemId"] == 2 && c["moeda"] == "orb");
        assert!(has_ancient_gold, "Ancient Stone gold query missing!");
        assert!(has_ancient_orb, "Ancient Stone orb query missing!");

        // Bug Shiny Stone must emit orb query
        let has_shiny_orb = cmds.iter().any(|c| c["t"] == "market.item" && c["itemId"] == 70031 && c["moeda"] == "orb");
        assert!(has_shiny_orb, "Bug Shiny Stone query missing from category stones expansion!");

        // Beast Ball must NOT be queried
        let has_beast = cmds.iter().any(|c| c["itemId"] == 5);
        assert!(!has_beast, "Beast Ball was erroneously queried for stone category rule!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_note_threshold_equality_and_rejection() {
        let mut account = AccountState::new(0);
        account.enabled = true;
        account.config.snipe_by_note = true;
        account.config.min_note = 7.0;
        account.config.max_price_note_gold = 50000;
        account.config.max_price_note_gems = 20;

        let mut runtime = AccountRuntime::default();
        runtime.gold = 100000;
        runtime.orbs = 100;

        // 1. Equal to threshold: 7.0 matches!
        let offer_eq = ParsedMarketOffer {
            id: 301,
            price: 30000,
            qty: 1,
            currency: "gold".into(),
            seller: "S".into(),
            compravel_em: None,
            item_id: None,
            item_name: "".into(),
            species_id: Some(25),
            poke_name: "Pikachu".into(),
            is_pokemon: true,
            is_shiny: false,
            potencia: 1,
            nota: Some(7.0),
        };
        let dec_eq = evaluate_offer(&offer_eq, &account, &runtime);
        assert!(dec_eq.matched);
        assert_eq!(dec_eq.target_display_name, "★ Nota 7.0 Pikachu");

        // 2. Below threshold: 6.9 must NOT match
        let offer_below = ParsedMarketOffer {
            id: 302,
            price: 30000,
            qty: 1,
            currency: "gold".into(),
            seller: "S".into(),
            compravel_em: None,
            item_id: None,
            item_name: "".into(),
            species_id: Some(25),
            poke_name: "Pikachu".into(),
            is_pokemon: true,
            is_shiny: false,
            potencia: 1,
            nota: Some(6.9),
        };
        let dec_below = evaluate_offer(&offer_below, &account, &runtime);
        assert!(!dec_below.matched, "Note 6.9 matched threshold 7.0!");

        // 3. Above threshold: 8.5 matches
        let offer_above = ParsedMarketOffer {
            id: 303,
            price: 15,
            qty: 1,
            currency: "orb".into(),
            seller: "S".into(),
            compravel_em: None,
            item_id: None,
            item_name: "".into(),
            species_id: Some(25),
            poke_name: "Pikachu".into(),
            is_pokemon: true,
            is_shiny: false,
            potencia: 1,
            nota: Some(8.5),
        };
        let dec_above = evaluate_offer(&offer_above, &account, &runtime);
        assert!(dec_above.matched);

        // 4. Missing / None note must NOT match
        let offer_none = ParsedMarketOffer {
            id: 304,
            price: 1000,
            qty: 1,
            currency: "gold".into(),
            seller: "S".into(),
            compravel_em: None,
            item_id: None,
            item_name: "".into(),
            species_id: Some(25),
            poke_name: "Pikachu".into(),
            is_pokemon: true,
            is_shiny: false,
            potencia: 1,
            nota: None,
        };
        let dec_none = evaluate_offer(&offer_none, &account, &runtime);
        assert!(!dec_none.matched, "None note matched!");

        // 5. Test parse_offer with string and out-of-range values
        let raw_valid_str = json!({
            "id": 305,
            "preco": 1000,
            "moeda": "gold",
            "tipo": "pokemon",
            "pokemonNome": "Pikachu",
            "ficha": { "nota": "8.5" }
        });
        let parsed_valid = parse_offer(&raw_valid_str).unwrap();
        assert_eq!(parsed_valid.nota, Some(8.5));

        let raw_invalid_str = json!({
            "id": 306,
            "preco": 1000,
            "moeda": "gold",
            "tipo": "pokemon",
            "pokemonNome": "Pikachu",
            "ficha": { "nota": "invalid_note" }
        });
        let parsed_invalid = parse_offer(&raw_invalid_str).unwrap();
        assert_eq!(parsed_invalid.nota, None);

        let raw_out_of_range = json!({
            "id": 307,
            "preco": 1000,
            "moeda": "gold",
            "tipo": "pokemon",
            "pokemonNome": "Pikachu",
            "ficha": { "nota": 15.0 }
        });
        let parsed_oor = parse_offer(&raw_out_of_range).unwrap();
        assert_eq!(parsed_oor.nota, None);
    }

    #[test]
    fn test_shiny_look_shiny_and_p5_matching() {
        let mut account = AccountState::new(0);
        account.enabled = true;
        account.config.snipe_any_shiny = true;
        account.config.max_price_shiny_gold = 50000;
        account.config.snipe_any_p5 = true;
        account.config.max_price_p5_gold = 100000;

        let mut runtime = AccountRuntime::default();
        runtime.gold = 500000;

        // 1. lookShiny: true parses as shiny and matches
        let raw_look_shiny = json!({
            "id": 401,
            "preco": 40000,
            "moeda": "gold",
            "tipo": "pokemon",
            "pokemonNome": "Charizard",
            "lookShiny": true
        });
        let parsed_ls = parse_offer(&raw_look_shiny).unwrap();
        assert!(parsed_ls.is_shiny);
        let dec_ls = evaluate_offer(&parsed_ls, &account, &runtime);
        assert!(dec_ls.matched);
        assert!(dec_ls.target_display_name.contains("Shiny Charizard"));

        // 2. potencia >= 5 matches P5
        let raw_p5 = json!({
            "id": 402,
            "preco": 80000,
            "moeda": "gold",
            "tipo": "pokemon",
            "pokemonNome": "Blastoise",
            "ficha": { "potencia": 5 }
        });
        let parsed_p5 = parse_offer(&raw_p5).unwrap();
        assert_eq!(parsed_p5.potencia, 5);
        let dec_p5 = evaluate_offer(&parsed_p5, &account, &runtime);
        assert!(dec_p5.matched);
        assert!(dec_p5.target_display_name.contains("P5 Blastoise"));

        // 3. potencia 4 does NOT match P5
        let raw_p4 = json!({
            "id": 403,
            "preco": 80000,
            "moeda": "gold",
            "tipo": "pokemon",
            "pokemonNome": "Venusaur",
            "ficha": { "potencia": 4 }
        });
        let parsed_p4 = parse_offer(&raw_p4).unwrap();
        let dec_p4 = evaluate_offer(&parsed_p4, &account, &runtime);
        assert!(!dec_p4.matched, "Potencia 4 matched P5!");
    }

    #[test]
    fn test_scan_mode_original_cadence_and_700ms_delay() {
        let (mut engine, path) = temp_test_engine();

        let mut cfg = SniperConfig::default();
        cfg.scan_mode = "original".into();
        cfg.snipe_any_shiny = true;

        let save_res = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r1".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 1000,
                max_price_gems: 0,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: cfg,
        });
        assert!(save_res.is_ok());

        // First tick: fires market.itens at t=0, and queues pokemon query for +700ms
        let cmds1 = engine.on_tick(0, now_ms(), None);
        assert_eq!(cmds1.len(), 1);
        assert_eq!(cmds1[0]["t"], "market.itens");

        // Pokemon query is in scheduled_queries with delay
        assert_eq!(engine.runtimes[0].scheduled_queries.len(), 1);
        let q = &engine.runtimes[0].scheduled_queries[0];
        // Cycle 1 must be menor_preco gold!
        assert_eq!(q.payload["t"], "market.listar");
        assert_eq!(q.payload["ordem"], "menor_preco");
        assert_eq!(q.payload["moeda"], "gold");

        // Immediately ticking before 700ms has elapsed does NOT emit the query
        let cmds2 = engine.on_tick(0, now_ms(), None);
        assert!(cmds2.is_empty(), "Delayed query was emitted before 700ms elapsed!");

        // Simulate 700ms elapsed by backdating execute_at
        engine.runtimes[0].scheduled_queries[0].execute_at = Instant::now() - Duration::from_millis(10);
        let cmds3 = engine.on_tick(0, now_ms(), None);
        assert_eq!(cmds3.len(), 1);
        assert_eq!(cmds3[0]["ordem"], "menor_preco");
        assert_eq!(cmds3[0]["moeda"], "gold");
        assert!(engine.runtimes[0].scheduled_queries.is_empty());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_scan_mode_pause_cancels_queued_queries() {
        let (mut engine, path) = temp_test_engine();

        let mut cfg = SniperConfig::default();
        cfg.scan_mode = "original".into();
        cfg.snipe_any_shiny = true;

        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![],
            config: cfg,
        });

        // Tick queues pokemon query
        let _ = engine.on_tick(0, now_ms(), None);
        assert_eq!(engine.runtimes[0].scheduled_queries.len(), 1);

        // Pause/disable account
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: false,
            rules: vec![],
            config: SniperConfig::default(),
        });

        // Scheduled queries must be cleared!
        assert!(engine.runtimes[0].scheduled_queries.is_empty(), "Scheduled queries were not cancelled on pause!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_validation_rejects_unknown_category() {
        let (mut engine, path) = temp_test_engine();

        let res = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_bad_cat".into(),
                target_type: "category".into(),
                target_category: Some("unknown_category_xyz".into()),
                target_id: None,
                target_name: "Bad Cat".into(),
                max_price_gold: 1000,
                max_price_gems: 0,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        assert!(res.is_err(), "Unknown category was erroneously allowed!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_catalog_canonical_80_items_and_36_stones() {
        let catalog = SniperCatalog::get();
        assert!(catalog.items_by_id.len() >= 80, "Catalog must contain at least 80 canonical items (found {})", catalog.items_by_id.len());
        let stones = catalog.ids_by_category.get("stone").expect("stone category must exist");
        assert_eq!(stones.len(), 36, "Catalog must contain exactly 36 stones");
        let shiny_stones = stones.iter().filter(|&&id| id >= 70000).count();
        assert_eq!(shiny_stones, 18, "Catalog must contain 18 shiny stones");
        let normal_stones = stones.iter().filter(|&&id| id < 70000).count();
        assert_eq!(normal_stones, 18, "Catalog must contain 18 regular stones");
        // Verify houses/bicicletas loaded properly without falling back to empty catalog
        let casas = catalog.ids_by_category.get("casa").expect("casa category must exist");
        assert!(!casas.is_empty(), "Casa category must not be empty");

        // 80 items: fragment (3) and ticket (2), rare_loot stays 4
        let fragments = catalog.ids_by_category.get("fragment").expect("fragment category must exist");
        assert_eq!(fragments.len(), 3, "Catalog must contain exactly 3 fragment items");
        let tickets = catalog.ids_by_category.get("ticket").expect("ticket category must exist");
        assert_eq!(tickets.len(), 2, "Catalog must contain exactly 2 ticket items");
        let rare_loot = catalog.ids_by_category.get("rare_loot").expect("rare_loot category must exist");
        assert_eq!(rare_loot.len(), 4, "Catalog rare_loot must remain exactly 4 items");

        // Check alias resolution for all 7 items
        assert_eq!(resolve_canonical_item_id("Fragmento de Z-Move"), Some(59194));
        assert_eq!(resolve_canonical_item_id("Fragmento de Chave"), Some(70011));
        assert_eq!(resolve_canonical_item_id("Fragmento de Shiny Stone"), Some(70012));
        assert_eq!(resolve_canonical_item_id("Fragmento de Bicicleta"), Some(70013));
        assert_eq!(resolve_canonical_item_id("Mega Stone Fragment"), Some(70014));
        assert_eq!(resolve_canonical_item_id("Mega Shiny Stone Fragment"), Some(70015));
        assert_eq!(resolve_canonical_item_id("Shiny Egg Fragment"), Some(70017));
    }

    #[test]
    fn test_radar_validation_rejects_non_finite_and_zero_ceilings() {
        let (mut engine, path) = temp_test_engine();

        // 1. NaN min_note
        let mut cfg_nan = SniperConfig::default();
        cfg_nan.min_note = f64::NAN;
        let res_nan = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![],
            config: cfg_nan,
        });
        assert!(res_nan.is_err(), "NaN min_note was allowed!");

        // 2. Infinite min_note
        let mut cfg_inf = SniperConfig::default();
        cfg_inf.min_note = f64::INFINITY;
        let res_inf = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![],
            config: cfg_inf,
        });
        assert!(res_inf.is_err(), "Infinite min_note was allowed!");

        // 3. Active snipe_any_shiny with both ceilings zero
        let mut cfg_shiny_zero = SniperConfig::default();
        cfg_shiny_zero.snipe_any_shiny = true;
        cfg_shiny_zero.max_price_shiny_gold = 0;
        cfg_shiny_zero.max_price_shiny_gems = 0;
        let res_shiny = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![],
            config: cfg_shiny_zero,
        });
        assert!(res_shiny.is_err(), "Active snipe_any_shiny with 0 ceilings was allowed!");

        // 4. Active snipe_any_p5 with both ceilings zero
        let mut cfg_p5_zero = SniperConfig::default();
        cfg_p5_zero.snipe_any_p5 = true;
        cfg_p5_zero.max_price_p5_gold = 0;
        cfg_p5_zero.max_price_p5_gems = 0;
        let res_p5 = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![],
            config: cfg_p5_zero,
        });
        assert!(res_p5.is_err(), "Active snipe_any_p5 with 0 ceilings was allowed!");

        // 5. Active snipe_by_note with both ceilings zero
        let mut cfg_note_zero = SniperConfig::default();
        cfg_note_zero.snipe_by_note = true;
        cfg_note_zero.min_note = 7.0;
        cfg_note_zero.max_price_note_gold = 0;
        cfg_note_zero.max_price_note_gems = 0;
        let res_note = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![],
            config: cfg_note_zero,
        });
        assert!(res_note.is_err(), "Active snipe_by_note with 0 ceilings was allowed!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_parse_offer_shiny_combination_false_and_true() {
        // shiny: false but lookShiny: true must evaluate to is_shiny == true
        let payload = json!({
            "id": 101,
            "itemId": null,
            "tipo": "pokemon",
            "speciesId": 25,
            "preco": 10000,
            "moeda": "gold",
            "shiny": false,
            "lookShiny": true,
            "ficha": {
                "speciesId": 25,
                "nome": "Pikachu",
                "shiny": false,
                "potencia": 1
            }
        });
        let parsed = parse_offer(&payload).expect("Must parse offer");
        assert!(parsed.is_shiny, "shiny: false with lookShiny: true must evaluate to is_shiny == true");

        // lookShiny on ficha even if top-level shiny is false
        let payload2 = json!({
            "id": 102,
            "itemId": null,
            "tipo": "pokemon",
            "speciesId": 25,
            "preco": 10000,
            "moeda": "gold",
            "shiny": false,
            "ficha": {
                "speciesId": 25,
                "nome": "Pikachu",
                "lookShiny": true,
                "potencia": 1
            }
        });
        let parsed2 = parse_offer(&payload2).expect("Must parse offer");
        assert!(parsed2.is_shiny, "ficha with lookShiny: true must evaluate to is_shiny == true");
    }

    #[test]
    fn test_on_connect_and_on_tick_single_scheduler_path_no_duplication() {
        let (mut engine, path) = temp_test_engine();

        let mut cfg = SniperConfig::default();
        cfg.scan_mode = "original".into();
        cfg.snipe_any_shiny = true;
        cfg.max_price_shiny_gold = 50000;

        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r1".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(2)),
                target_name: "Ancient Stone".into(),
                max_price_gold: 10000,
                max_price_gems: 0,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: cfg,
        });

        // 1. on_connect: must emit market.itens at t=0 and schedule gold query at +700ms (NOT emit Pokemon immediately)
        let connect_cmds = engine.on_connect(0);
        assert_eq!(connect_cmds.len(), 1, "on_connect must emit exactly 1 command (market.itens)");
        assert_eq!(connect_cmds[0]["t"], "market.itens");

        // 1 query scheduled for +700ms (cycle 1 = gold)
        assert_eq!(engine.runtimes[0].scheduled_queries.len(), 1);
        assert_eq!(engine.runtimes[0].scheduled_queries[0].payload["ordem"], "menor_preco");
        assert_eq!(engine.runtimes[0].scheduled_queries[0].payload["moeda"], "gold");

        // 2. Immediate on_tick (50ms later): must NOT duplicate market.itens or emit scheduled query early
        let immediate_cmds = engine.on_tick(0, 50, None);
        assert!(immediate_cmds.is_empty(), "Immediate on_tick must not duplicate market.itens or leak queries early");
        assert_eq!(engine.runtimes[0].scheduled_queries.len(), 1);

        // 3. When +700ms arrives, the scheduled gold query must be drained
        engine.runtimes[0].scheduled_queries[0].execute_at = Instant::now() - Duration::from_millis(1);
        let due_cmds = engine.on_tick(0, 750, None);
        assert_eq!(due_cmds.len(), 1);
        assert_eq!(due_cmds[0]["t"], "market.listar");
        assert_eq!(due_cmds[0]["ordem"], "menor_preco");
        assert_eq!(due_cmds[0]["moeda"], "gold");
        assert!(engine.runtimes[0].scheduled_queries.is_empty());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_adaptive_mode_slow_staggers_three_queries_and_hot_rotates_one() {
        let (mut engine, path) = temp_test_engine();

        let mut cfg = SniperConfig::default();
        cfg.scan_mode = "adaptive".into();
        cfg.scan_interval_ms = 45000;
        cfg.fast_scan_interval_ms = 3000;
        cfg.snipe_any_shiny = true;
        cfg.max_price_shiny_gold = 50000;

        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![],
            config: cfg,
        });

        // 1. Slow round (cold): initial scan triggers and schedules 3 queries:
        // +700ms (gold), +1400ms (orb), +2100ms (recentes)
        let cmds_cold = engine.on_tick(0, 0, None);
        assert!(cmds_cold.is_empty()); // no item rules, so t=0 commands is empty
        assert_eq!(engine.runtimes[0].scheduled_queries.len(), 3, "Slow adaptive round must schedule 3 queries");
        assert_eq!(engine.runtimes[0].scheduled_queries[0].payload["ordem"], "menor_preco");
        assert_eq!(engine.runtimes[0].scheduled_queries[0].payload["moeda"], "gold");
        assert_eq!(engine.runtimes[0].scheduled_queries[1].payload["ordem"], "menor_preco");
        assert_eq!(engine.runtimes[0].scheduled_queries[1].payload["moeda"], "orb");
        assert_eq!(engine.runtimes[0].scheduled_queries[2].payload["ordem"], "recentes");

        // Clear scheduled queries
        engine.runtimes[0].clear_scheduled_queries();

        // 2. Hot round: set hot_until to future
        engine.runtimes[0].hot_until = Some(Instant::now() + Duration::from_secs(150));
        assert!(engine.runtimes[0].is_hot());

        // Fast scan triggers after fast_scan_interval_ms
        engine.runtimes[0].last_scan_instant = Some(Instant::now() - Duration::from_millis(3500));
        let _ = engine.on_tick(0, 3500, None);
        assert_eq!(engine.runtimes[0].scheduled_queries.len(), 1, "Hot round must schedule exactly 1 rotating query");

        // 3. Verify cancellation on disconnect
        engine.on_disconnect(0, None);
        assert!(engine.runtimes[0].scheduled_queries.is_empty(), "on_disconnect must clear scheduled queries");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_excluded_item_ids_validation_and_matching() {
        let (mut engine, path) = temp_test_engine();

        // 1. Valid exclusion: Water Stone (ID 142) excluded from category "stone"
        let save_ok = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_stones".into(),
                target_type: "category".into(),
                target_category: Some("stone".into()),
                target_id: None,
                target_name: "Pedras".into(),
                max_price_gold: 1000,
                max_price_gems: 0,
                max_qty: 10,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: vec![142], // Water Stone
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        assert!(save_ok.is_ok(), "Valid stone exclusion was rejected: {:?}", save_ok.err());

        // 2. Reject nonpositive ID (0)
        let save_zero = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_zero".into(),
                target_type: "category".into(),
                target_category: Some("stone".into()),
                target_id: None,
                target_name: "Pedras".into(),
                max_price_gold: 1000,
                max_price_gems: 0,
                max_qty: 10,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: vec![0],
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        assert!(save_zero.is_err(), "Excluded ID 0 was erroneously allowed");

        // 3. Reject nonexistent ID
        let save_nonexistent = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_none".into(),
                target_type: "category".into(),
                target_category: Some("stone".into()),
                target_id: None,
                target_name: "Pedras".into(),
                max_price_gold: 1000,
                max_price_gems: 0,
                max_qty: 10,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: vec![9999999],
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        assert!(save_nonexistent.is_err(), "Nonexistent excluded ID was erroneously allowed");

        // 4. Reject item from different category (e.g. 59194 is in TM category, not stone)
        let save_wrong_cat = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_wrong".into(),
                target_type: "category".into(),
                target_category: Some("stone".into()),
                target_id: None,
                target_name: "Pedras".into(),
                max_price_gold: 1000,
                max_price_gems: 0,
                max_qty: 10,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: vec![59194],
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        assert!(save_wrong_cat.is_err(), "Excluded item from wrong category was erroneously allowed");

        // 5. Test matching: Water Stone (142) excluded, Fire Stone (53) matches
        let rule = &engine.store.accounts[0].rules[0];
        assert!(!rule.matches_category(Some(142)), "Water Stone was not excluded by matches_category!");
        assert!(rule.matches_category(Some(53)), "Fire Stone failed to match category!");

        // 6. Test evaluate_offer
        let mut runtime = AccountRuntime::default();
        runtime.gold = 50000;

        let offer_water = ParsedMarketOffer {
            id: 611691,
            seller: "Gary".into(),
            price: 2,
            currency: "gold".into(),
            qty: 1,
            item_id: Some(142),
            item_name: "Water Stone".into(),
            species_id: None,
            poke_name: String::new(),
            compravel_em: None,
            is_pokemon: false,
            is_shiny: false,
            potencia: 1,
            nota: None,
        };
        let dec_water = evaluate_offer(&offer_water, &engine.store.accounts[0], &runtime);
        assert!(!dec_water.matched, "Excluded Water Stone matched evaluate_offer!");

        let offer_fire = ParsedMarketOffer {
            id: 611692,
            seller: "Ash".into(),
            price: 2,
            currency: "gold".into(),
            qty: 1,
            item_id: Some(53),
            item_name: "Fire Stone".into(),
            species_id: None,
            poke_name: String::new(),
            compravel_em: None,
            is_pokemon: false,
            is_shiny: false,
            potencia: 1,
            nota: None,
        };
        let dec_fire = evaluate_offer(&offer_fire, &engine.store.accounts[0], &runtime);
        assert!(dec_fire.matched, "Fire Stone did not match evaluate_offer!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_diagnostics_unrecognized_replies_and_dotted_keys() {
        let (mut engine, path) = temp_test_engine();

        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_water".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(142)),
                target_name: "Water Stone".into(),
                max_price_gold: 10,
                max_price_gems: 0,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        engine.runtimes[0].gold = 1000;

        // 1. Emit buy for offer 611691
        let offer = json!({
            "id": 611691,
            "vendedor": "Misty",
            "preco": 2,
            "moeda": "gold",
            "qtd": 1,
            "tipo": "item",
            "itemId": 142,
            "nome": "Water Stone"
        });
        let cmds = engine.on_message(0, &json!({ "t": "market", "anuncios": [offer] }), None);
        assert_eq!(cmds.len(), 1);
        assert_eq!(cmds[0]["t"], "market.comprar");
        assert_eq!(cmds[0]["id"], 611691);
        assert!(engine.runtimes[0].outstanding_buy.is_some());
        assert_eq!(engine.runtimes[0].reserved_gold, 2);

        // 2. Unrecognized error arrives: MUST NOT release budget or unblock pending intent!
        let unrec_error = json!({
            "t": "erro",
            "chave": "chat.flood",
            "msg": "Aguarde para falar no chat"
        });
        let _ = engine.on_message(0, &unrec_error, None);
        assert!(engine.runtimes[0].outstanding_buy.is_some(), "Unrecognized error released pending buy!");
        assert_eq!(engine.runtimes[0].reserved_gold, 2, "Unrecognized error released budget!");

        // Diagnostic log entry must be present
        let logs = &engine.store.accounts[0].logs;
        let diag_log = logs.iter().find(|l| l.status == "DIAGNOSTICO").expect("Diagnostic log entry missing");
        assert!(diag_log.details.contains("chat.flood"), "Diagnostic log missing chave details: {}", diag_log.details);
        assert_eq!(diag_log.offer_id, Some(611691));

        // 3. Progress non-refusal error (market.sorteio): MUST NOT release budget
        let sorteio_prog = json!({
            "t": "erro",
            "chave": "market.sorteio",
            "msg": "Este anúncio acabou de liberar: seu pedido entrou no sorteio."
        });
        let _ = engine.on_message(0, &sorteio_prog, None);
        assert!(engine.runtimes[0].outstanding_buy.is_some(), "Lottery progress error released pending buy!");
        assert_eq!(engine.runtimes[0].reserved_gold, 2);
        let prog_log = engine.store.accounts[0].logs.iter().find(|l| l.status == "PROGRESSO").expect("Progress log missing");
        assert_eq!(prog_log.offer_id, Some(611691));

        // 4. marketComprado with divergent ID: MUST NOT confirm buy 611691
        let divergent_confirm = json!({
            "t": "batalha",
            "ev": [{
                "k": "marketComprado",
                "id": 888888,
                "descricao": "Water Stone entregue!"
            }]
        });
        let _ = engine.on_message(0, &divergent_confirm, None);
        assert!(engine.runtimes[0].outstanding_buy.is_some(), "Divergent marketComprado confirmed pending buy!");
        assert_eq!(engine.runtimes[0].reserved_gold, 2);

        // 5. Terminal dotted refusal (market.sorteioPerdeu): RELEASES reservation and logs RECUSADO
        let sorteio_perdeu = json!({
            "t": "erro",
            "chave": "market.sorteioPerdeu",
            "msg": "Outro jogador levou este anúncio no sorteio da liberação."
        });
        let _ = engine.on_message(0, &sorteio_perdeu, None);
        assert!(engine.runtimes[0].outstanding_buy.is_none(), "Terminal refusal failed to release outstanding buy!");
        assert_eq!(engine.runtimes[0].reserved_gold, 0, "Terminal refusal failed to release reserved budget!");

        let rec_log = engine.store.accounts[0].logs.iter().find(|l| l.status == "RECUSADO").expect("Recusado log missing");
        assert!(rec_log.details.contains("Outro jogador levou") || rec_log.details.contains("market.sorteioPerdeu"));
        assert_eq!(rec_log.offer_id, Some(611691));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_item_envelope_inheritance_and_currency_strictness() {
        let (mut engine, path) = temp_test_engine();

        // Rule for Water Stone (ID 142), maxPriceGold: 500, maxPriceGems: 0
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_water_gold_only".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(142)),
                target_name: "Water Stone".into(),
                max_price_gold: 500,
                max_price_gems: 0,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        engine.runtimes[0].gold = 10000;
        engine.runtimes[0].orbs = 100;

        // 1. Payload with envelope moeda: "orb", line preco: 2, rule has gems: 0 => MUST NOT buy
        let pkt_orb = json!({
            "t": "market",
            "aba": "item",
            "itemId": 142,
            "moeda": "orb",
            "linhas": [{
                "id": 9501,
                "preco": 2,
                "qtd": 1,
                "ficha": { "nome": "Water Stone" }
            }]
        });
        let cmds1 = engine.on_message(0, &pkt_orb, None);
        assert!(cmds1.is_empty(), "Orb envelope offer was erroneously purchased with 0 gems ceiling!");

        // 2. Update rule to allow maxPriceGems: 2
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_water_gems".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(142)),
                target_name: "Water Stone".into(),
                max_price_gold: 0,
                max_price_gems: 2,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });

        // Offer now qualifies: sends buy with moeda: "orb", preco: 2
        let cmds2 = engine.on_message(0, &pkt_orb, None);
        assert_eq!(cmds2.len(), 1, "Failed to buy orb envelope offer with gems ceiling 2");
        assert_eq!(cmds2[0]["t"], "market.comprar");
        assert_eq!(cmds2[0]["id"], 9501);
        assert_eq!(cmds2[0]["moeda"], "orb");
        assert_eq!(cmds2[0]["preco"], 2);

        // 3. Line with explicit conflicting currency (moeda: "gold" on line vs "orb" on envelope) -> fail-closed
        engine.runtimes[0].outstanding_buy = None;
        let pkt_conflict_currency = json!({
            "t": "market",
            "aba": "item",
            "itemId": 142,
            "moeda": "orb",
            "linhas": [{
                "id": 9502,
                "preco": 2,
                "qtd": 1,
                "moeda": "gold",
                "ficha": { "nome": "Water Stone" }
            }]
        });
        let cmds3 = engine.on_message(0, &pkt_conflict_currency, None);
        assert!(cmds3.is_empty(), "Conflicting currency between envelope and line was not rejected!");

        // 4. Line with explicit conflicting itemId (itemId: 999 on line vs 142 on envelope) -> fail-closed
        let pkt_conflict_id = json!({
            "t": "market",
            "aba": "item",
            "itemId": 142,
            "moeda": "orb",
            "linhas": [{
                "id": 9503,
                "itemId": 999,
                "preco": 2,
                "qtd": 1,
                "ficha": { "nome": "Other Item" }
            }]
        });
        let cmds4 = engine.on_message(0, &pkt_conflict_id, None);
        assert!(cmds4.is_empty(), "Conflicting itemId between envelope and line was not rejected!");

        // 5. Line with no currency on line and no currency on envelope -> fail-closed (never default to gold)
        let pkt_no_currency = json!({
            "t": "market",
            "aba": "item",
            "itemId": 142,
            "linhas": [{
                "id": 9504,
                "preco": 2,
                "qtd": 1,
                "ficha": { "nome": "Water Stone" }
            }]
        });
        let cmds5 = engine.on_message(0, &pkt_no_currency, None);
        assert!(cmds5.is_empty(), "Offer with missing currency was erroneously defaulted to gold!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_batalha_aviso_terminal_and_progress_events() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_water".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(142)),
                target_name: "Water Stone".into(),
                max_price_gold: 10,
                max_price_gems: 0,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        engine.runtimes[0].gold = 1000;

        // Trigger buy
        let _ = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 7771, "itemId": 142, "preco": 5, "qtd": 1, "moeda": "gold"}]
        }), None);
        assert!(engine.runtimes[0].outstanding_buy.is_some());
        assert_eq!(engine.runtimes[0].reserved_gold, 5);

        // 1. Progress event: batalha.ev with k: "aviso", msg: "market.sorteio"
        let aviso_prog = json!({
            "t": "batalha",
            "ev": [{
                "k": "aviso",
                "msg": "market.sorteio"
            }]
        });
        let _ = engine.on_message(0, &aviso_prog, None);
        assert!(engine.runtimes[0].outstanding_buy.is_some(), "Aviso progress released pending buy!");
        assert_eq!(engine.runtimes[0].reserved_gold, 5);
        assert!(engine.store.accounts[0].logs.iter().any(|l| l.status == "PROGRESSO"));

        // 2. Terminal event: batalha.ev with k: "aviso", msg: "market.sorteioPerdeu"
        let aviso_terminal = json!({
            "t": "batalha",
            "ev": [{
                "k": "aviso",
                "msg": "market.sorteioPerdeu"
            }]
        });
        let _ = engine.on_message(0, &aviso_terminal, None);
        assert!(engine.runtimes[0].outstanding_buy.is_none(), "Aviso terminal failed to release pending buy!");
        assert_eq!(engine.runtimes[0].reserved_gold, 0, "Aviso terminal failed to release reservation!");
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 0, "Aviso terminal failed to restore rule quota!");
        assert!(engine.store.accounts[0].logs.iter().any(|l| l.status == "RECUSADO"));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_on_send_failure_guard() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_water".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(142)),
                target_name: "Water Stone".into(),
                max_price_gold: 10,
                max_price_gems: 0,
                max_qty: 5,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        engine.runtimes[0].gold = 1000;

        // Trigger buy for offer 8881
        let _ = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 8881, "itemId": 142, "preco": 5, "qtd": 1, "moeda": "gold"}]
        }), None);
        assert!(engine.runtimes[0].outstanding_buy.is_some());
        assert_eq!(engine.runtimes[0].reserved_gold, 5);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);

        // 1. Send failure on market.itens (scan command): MUST NOT release pending buy!
        engine.on_send_failure(0, &json!({ "t": "market.itens" }));
        assert!(engine.runtimes[0].outstanding_buy.is_some(), "Scan failure prematurely released pending buy!");
        assert_eq!(engine.runtimes[0].reserved_gold, 5);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);

        // 2. Send failure on market.comprar with divergent ID: MUST NOT release pending buy!
        engine.on_send_failure(0, &json!({ "t": "market.comprar", "id": 9999 }));
        assert!(engine.runtimes[0].outstanding_buy.is_some(), "Divergent buy failure prematurely released pending buy!");
        assert_eq!(engine.runtimes[0].reserved_gold, 5);

        // 3. Send failure on matching market.comprar (id 8881): RELEASES pending buy and rolls back quota!
        engine.on_send_failure(0, &json!({ "t": "market.comprar", "id": 8881 }));
        assert!(engine.runtimes[0].outstanding_buy.is_none(), "Matching buy failure failed to release pending buy!");
        assert_eq!(engine.runtimes[0].reserved_gold, 0);
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 0);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_excluded_item_ids_validation_and_rejection_on_item_rule() {
        let (mut engine, path) = temp_test_engine();

        // 1. Item rule with non-empty excluded_item_ids MUST be rejected
        let res_item = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_item_bad".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(142)),
                target_name: "Water Stone".into(),
                max_price_gold: 100,
                max_price_gems: 0,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: vec![142], // Non-empty excludedItemIds on item rule -> invalid!
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        assert!(res_item.is_err(), "Non-empty excluded_item_ids on item rule was erroneously allowed!");

        // 2. Category rule with unsafe JS integer (> 9_007_199_254_740_991) MUST be rejected
        let res_unsafe = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_cat_unsafe".into(),
                target_type: "category".into(),
                target_category: Some("stone".into()),
                target_id: None,
                target_name: "Pedras".into(),
                max_price_gold: 100,
                max_price_gems: 0,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: vec![9_007_199_254_740_992],
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        assert!(res_unsafe.is_err(), "Excluded item ID exceeding JS safe integer was erroneously allowed!");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_bounded_aux_logs_divergent_error_id_and_single_lottery_confirm() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_ws".into(),
                target_type: "item".into(),
                target_category: None,
                target_id: Some(json!(142)),
                target_name: "Water Stone".into(),
                max_price_gold: 100,
                max_price_gems: 0,
                max_qty: 1,
                infinite: false,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        engine.runtimes[0].gold = 1000;

        let _ = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 9101, "itemId": 142, "preco": 10, "qtd": 1, "moeda": "gold"}]
        }), None);
        assert!(engine.runtimes[0].outstanding_buy.is_some());

        // 1. Terminal error with divergent explicit offer ID must NOT release pending buy
        let _ = engine.on_message(0, &json!({
            "t": "erro",
            "id": 9999,
            "chave": "market.sorteioPerdeu"
        }), None);
        assert!(engine.runtimes[0].outstanding_buy.is_some(), "Divergent error ID prematurely released pending buy!");
        assert_eq!(engine.store.accounts[0].rules[0].total_bought, 1);

        // 2. Repeated mktSorteio 'lista' ticks + flood of unknown errors must cap aux logs at 5
        for _ in 0..16 {
            let _ = engine.on_message(0, &json!({
                "t": "mktSorteio",
                "id": 9101,
                "fase": "lista"
            }), None);
        }
        for i in 0..10 {
            let _ = engine.on_message(0, &json!({
                "t": "erro",
                "chave": format!("unknown.err.{}", i)
            }), None);
        }
        let aux_count = engine.store.accounts[0].logs.iter()
            .filter(|l| l.status == "DIAGNOSTICO" || l.status == "PROGRESSO")
            .count();
        assert_eq!(aux_count, 5, "Aux diagnostic/progress logs per pending offer must be bounded to 5");

        // 3. Lottery win (mktSorteio fim ok:true) followed by marketComprado confirms once without double-debiting
        let _ = engine.on_message(0, &json!({
            "t": "mktSorteio",
            "id": 9101,
            "fase": "fim",
            "ok": true,
            "descricao": "1x Water Stone"
        }), None);
        let _ = engine.on_message(0, &json!({
            "t": "batalha",
            "ev": [{"k": "marketComprado", "id": 9101, "sorteio": true, "descricao": "1x Water Stone"}]
        }), None);
        assert!(engine.runtimes[0].outstanding_buy.is_none());
        assert_eq!(engine.runtimes[0].gold, 990, "Balance must be debited once (1000 - 10 = 990)");
        let confirm_count = engine.store.accounts[0].logs.iter()
            .filter(|l| l.status == "CONFIRMADO" && l.offer_id == Some(9101))
            .count();
        assert_eq!(confirm_count, 1, "CONFIRMADO must be logged once for lottery win + marketComprado");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_confirmed_logs_never_evicted_by_non_confirmed_flood_and_seller_preserved() {
        let (mut engine, path) = temp_test_engine();
        let _ = engine.save_settings(vec![0], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_stone".into(),
                target_type: "item".into(),
                target_id: Some(json!(142)),
                target_category: None,
                target_name: "Water Stone".into(),
                max_price_gold: 10000,
                max_price_gems: 0,
                max_qty: 999,
                infinite: true,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        engine.runtimes[0].gold = 500_000;

        // 0. Category rule ("Pedras") with envelope-only itemId (23 = Cocoon Stone, no itemNome in row) MUST record "Cocoon Stone", NOT "Pedras"!
        let _ = engine.save_settings(vec![1], SniperSettingsInput {
            enabled: true,
            rules: vec![Rule {
                id: "r_cat_pedras".into(),
                target_type: "category".into(),
                target_id: None,
                target_category: Some("stone".into()),
                target_name: "Pedras".into(),
                max_price_gold: 10000,
                max_price_gems: 0,
                max_qty: 999,
                infinite: true,
                active: true,
                total_bought: 0,
                excluded_item_ids: Vec::new(),
                extra: HashMap::new(),
            }],
            config: SniperConfig::default(),
        });
        engine.runtimes[1].gold = 2_000_000;
        let cat_cmds = engine.on_message(1, &json!({
            "t": "market",
            "aba": "item",
            "itemId": 23,
            "moeda": "gold",
            "linhas": [{"id": 623832, "vendedor": "Rusuel", "preco": 10000, "qtd": 140}]
        }), None);
        assert_eq!(cat_cmds.len(), 1);
        let _ = engine.on_message(1, &json!({
            "t": "batalha",
            "ev": [{"k": "marketComprado", "id": 623832, "descricao": "140× Cocoon Stone"}]
        }), None);
        let cat_confirmed = engine.store.accounts[1].logs.iter()
            .find(|l| l.status == "CONFIRMADO" && l.offer_id == Some(623832))
            .expect("Category CONFIRMADO entry must exist");
        assert_eq!(cat_confirmed.target_name, "Cocoon Stone", "Category rule must log specific stone name, never 'Pedras'");
        assert_eq!(cat_confirmed.extra.get("seller").and_then(|v| v.as_str()), Some("Rusuel"));

        // 1. Market offer with seller "@exed" is dispatched and confirmed
        let cmds = engine.on_message(0, &json!({
            "t": "market",
            "linhas": [{"id": 9201, "itemId": 142, "vendedor": "@exed", "preco": 500, "qtd": 3, "moeda": "gold"}]
        }), None);
        assert_eq!(cmds.len(), 1);
        let _ = engine.on_message(0, &json!({
            "t": "batalha",
            "ev": [{"k": "marketComprado", "id": 9201, "descricao": "3x Water Stone"}]
        }), None);

        let confirmed = engine.store.accounts[0].logs.iter()
            .find(|l| l.status == "CONFIRMADO" && l.offer_id == Some(9201))
            .expect("CONFIRMADO entry must exist");
        assert_eq!(confirmed.target_name, "Water Stone");
        assert_eq!(confirmed.qty, Some(3));
        assert_eq!(confirmed.price, Some(500));
        assert_eq!(confirmed.extra.get("seller").and_then(|v| v.as_str()), Some("exed"));

        // 2. Flood 600 non-confirmed logs (DISPARADO / RECUSADO / DIAGNOSTICO)
        for i in 0..600u64 {
            add_log_to_account(&mut engine.store.accounts[0], SniperLogEntry {
                id: format!("noise_{}", i),
                timestamp: 100_000 + i,
                status: if i % 2 == 0 { "RECUSADO".into() } else { "DISPARADO".into() },
                target_name: "Cocoon Stone".into(),
                price: Some(9999),
                currency: Some("gold".into()),
                qty: Some(1),
                offer_id: Some(10_000 + i),
                details: "Noise".into(),
                account_index: Some(0),
                extra: HashMap::new(),
            });
        }

        let remaining_confirmed: Vec<&SniperLogEntry> = engine.store.accounts[0].logs.iter()
            .filter(|l| l.status == "CONFIRMADO")
            .collect();
        let remaining_noise_count = engine.store.accounts[0].logs.iter()
            .filter(|l| l.status != "CONFIRMADO")
            .count();
        assert_eq!(remaining_confirmed.len(), 1, "Confirmed purchase must NEVER be evicted by non-confirmed noise");
        assert_eq!(remaining_confirmed[0].offer_id, Some(9201));
        assert!(remaining_noise_count <= MAX_NON_CONFIRMED_LOGS_PER_ACCOUNT, "Non-confirmed tail is strictly capped");

        let _ = std::fs::remove_file(path);
    }
}
