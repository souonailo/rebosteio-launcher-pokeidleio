//! Controlled boss participation. Commands and receipts follow the game's own
//! boss.entrar / boss.auto protocol; inventory is never modified locally.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    sync::{atomic::{AtomicU64, Ordering}, Mutex},
    time::{Duration, Instant},
};

static HISTORY_LOCK: Mutex<()> = Mutex::new(());
static HISTORY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossHistoryRecord {
    pub id: String,
    pub at: u64,
    pub index: usize,
    pub account_id: String,
    pub account_name: String,
    pub boss_key: String,
    pub boss_name: String,
    pub result: String,
    pub attacks: Option<u64>,
    pub duration_ms: Option<u64>,
    pub drops: Option<Vec<BossDrop>>,
}

impl BossHistoryRecord {
    fn from_state(state: &crate::game_headless::HeadlessState, result: &str) -> Self {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
        let boss_key = state.boss_live.boss_key.clone().unwrap_or_default();
        let boss_name = state.boss_live.boss_name.clone().unwrap_or_else(|| boss_key.clone());
        Self {
            id: format!("native:{}:{nanos}:{}", state.i, HISTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed)),
            at: (nanos / 1_000_000) as u64,
            index: state.i,
            account_id: state.cid.clone(),
            account_name: state.name.clone(),
            boss_key,
            boss_name,
            result: result.into(),
            attacks: state.boss_live.turn,
            duration_ms: state.boss_live.duration_ms,
            drops: state.boss_live.last_battle_drops.clone(),
        }
    }
}

fn battle_clock_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn history_path() -> PathBuf {
    crate::credentials::get_app_data_dir().join("boss-history.jsonl")
}

pub fn append_history(records: &[BossHistoryRecord]) -> Result<(), String> {
    append_history_at(&history_path(), records)
}

fn append_history_at(path: &Path, records: &[BossHistoryRecord]) -> Result<(), String> {
    if records.is_empty() { return Ok(()); }
    let _lock = HISTORY_LOCK.lock().map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let mut file = OpenOptions::new().create(true).append(true).open(path).map_err(|e| e.to_string())?;
    for record in records {
        serde_json::to_writer(&mut file, record).map_err(|e| e.to_string())?;
        file.write_all(b"\n").map_err(|e| e.to_string())?;
    }
    file.flush().map_err(|e| e.to_string())?;
    file.sync_data().map_err(|e| e.to_string())
}

pub fn read_history(index: usize, account_id: &str) -> Result<Vec<BossHistoryRecord>, String> {
    read_history_at(&history_path(), index, account_id)
}

fn read_history_at(path: &Path, index: usize, account_id: &str) -> Result<Vec<BossHistoryRecord>, String> {
    let _lock = HISTORY_LOCK.lock().map_err(|e| e.to_string())?;
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    for line in BufReader::new(file).lines() {
        let line = line.map_err(|e| e.to_string())?;
        if let Ok(row) = serde_json::from_str::<BossHistoryRecord>(&line) {
            if row.index == index && (account_id.is_empty() || row.account_id == account_id)
                && seen.insert(row.id.clone()) {
                rows.push(row);
            }
        }
    }
    rows.sort_by(|a, b| b.at.cmp(&a.at));
    Ok(rows)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossAllocation {
    pub boss_key: String,
    pub percent: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BossMode {
    #[default]
    All,
    Quantity,
    Demand,
    Infinite,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub boss_key: String,
    #[serde(default)]
    pub mode: BossMode,
    #[serde(default)]
    pub quantity: Option<u32>,
    /// Confirmed arena entries, not victories. Each consumes the server's entrance fee.
    #[serde(default)]
    pub completed: u32,
    #[serde(default)]
    pub distribution: Option<Vec<BossAllocation>>,
    #[serde(default)]
    pub entry_counts: HashMap<String, u32>,
    #[serde(default)]
    pub initial_tokens: Option<u64>,
    /// Persist before sending boss.entrar. An interrupted request is never replayed.
    #[serde(default)]
    pub pending_entry: bool,
    #[serde(default)]
    pub uncertain: bool,
    /// A persisted off request only when this launcher previously owned auto mode.
    /// Never disable another independently configured server automation on startup.
    #[serde(default)]
    pub stop_requested: bool,
    /// Prevent an automation configured for a previous login from using another account.
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub owner_id: Option<String>,
    /// Captured before boss.entrar and kept until an authoritative inventory
    /// snapshot proves the server charged the corresponding entrance item.
    #[serde(default)]
    pub pending_stock: Option<DebitGuard>,
    #[serde(default)]
    pub awaiting_stock: Option<DebitGuard>,
    /// Hunt active before this job, saved before leaving it.
    #[serde(default)]
    pub return_hunt: Option<String>,
    /// A completed job must return to its own recorded hunt.
    #[serde(default)]
    pub return_pending: bool,
    /// Character-bound selection for each boss. The same Pokémon may fill both roles.
    #[serde(default)]
    pub pokemon_owner_id: Option<String>,
    #[serde(default)]
    pub pokemon_profiles: HashMap<String, BossPokemonProfile>,
    /// Captured before any automatic switch; retained until the server confirms restoration.
    #[serde(default)]
    pub return_pokemon_id: Option<Value>,
}

impl BossSettings {
    pub fn select_next_boss(&self) -> Option<String> {
        if let Some(ref dist) = self.distribution {
            if !dist.is_empty() {
                let n = (self.completed as i64) + 1;
                let mut best_deficit = i64::MIN;
                let mut best_key = None;
                for alloc in dist {
                    if alloc.percent == 0 {
                        continue;
                    }
                    let count = self.entry_counts.get(&alloc.boss_key).copied().unwrap_or(0) as i64;
                    let deficit = n.saturating_mul(alloc.percent as i64).saturating_sub(100i64.saturating_mul(count));
                    if deficit > best_deficit {
                        best_deficit = deficit;
                        best_key = Some(alloc.boss_key.clone());
                    }
                }
                return best_key;
            }
        }
        if !self.boss_key.is_empty() {
            Some(self.boss_key.clone())
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossPokemonProfile {
    pub primary_id: Value,
    pub fighter_id: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebitGuard {
    pub item_id: String,
    pub balance_before: u64,
    #[serde(default = "one_token")]
    pub required_debit: u64,
}
fn one_token() -> u64 {
    1
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossDrop {
    pub id: String,
    pub name: String,
    pub qty: u64,
    pub boss_key: String,
    pub boss_name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BossLive {
    pub in_arena: bool,
    pub started_at_ms: Option<u64>,
    pub duration_ms: Option<u64>,
    pub boss_key: Option<String>,
    pub boss_name: Option<String>,
    pub slot: Option<i64>,
    pub current_hp: Option<i64>,
    pub max_hp: Option<i64>,
    pub hp_percent: Option<f64>,
    pub player_hp: Option<i64>,
    pub player_max_hp: Option<i64>,
    /// Number of player attacks observed in this arena, exposed as an attack/turn counter.
    pub turn: Option<u64>,
    pub winner: Option<String>,
    pub status: String,
    pub auto_active: Option<bool>,
    pub auto_key: Option<String>,
    pub enabled: bool,
    pub mode: BossMode,
    pub limit: Option<u32>,
    pub completed: u32,
    pub token_balance: Option<u64>,
    pub session_victories: u64,
    /// Server-reported drops from the most recent terminal boss event.
    /// `None` means the event omitted its drops field; `Some([])` means the
    /// server explicitly reported no rewards.
    #[serde(default)]
    pub last_battle_drops: Option<Vec<BossDrop>>,
    pub pending: bool,
    pub uncertain: bool,
    /// Server events have no receipt ID. A terminal event is accepted at most
    /// once until another bossEntrou (or a new arena) is observed.
    #[serde(skip)]
    pub terminal_receipt_recorded: bool,
    #[serde(skip)]
    pub accepted_victory_indices: Vec<usize>,
    #[serde(skip)]
    field_mobs: HashMap<i64, BossMobVitals>,
    #[serde(skip)]
    field_boss_key: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct BossMobVitals {
    name: Option<String>,
    hp: Option<i64>,
    max_hp: Option<i64>,
    dead: bool,
    arena_scene: bool,
}

impl BossLive {
    fn field_hp(value: &Value) -> Option<i64> {
        let number = value.as_f64().or_else(|| value.as_str()?.parse().ok())?;
        number.is_finite().then(|| number.max(0.0).round() as i64)
    }

    fn observe_field_mobs(&mut self, mobs: &[Value], init: bool) {
        if init {
            self.field_mobs.clear();
            if self.in_arena {
                self.current_hp = None;
                self.max_hp = None;
                self.hp_percent = None;
            }
        }
        for mob in mobs {
            let Some(slot) = mob.get("s").and_then(Value::as_i64) else { continue };
            let is_new = !self.field_mobs.contains_key(&slot);
            let entry = self.field_mobs.entry(slot).or_default();
            if let Some(name) = mob.get("n").and_then(Value::as_str) {
                entry.name = Some(name.to_owned());
            }
            if let Some(hp) = mob.get("hp").and_then(Self::field_hp) {
                entry.hp = Some(hp);
            }
            if let Some(max_hp) = mob.get("mhp").and_then(Self::field_hp) {
                entry.max_hp = Some(max_hp);
            }
            if let Some(dead) = mob.get("x").and_then(Value::as_bool) {
                entry.dead = dead;
            }
            if self.in_arena && (init || is_new) {
                entry.arena_scene = true;
            }
        }
    }

    fn sync_hp_from_field(&mut self) -> bool {
        if !self.in_arena { return false }
        let Some(slot) = self.slot else { return false };
        let Some(mob) = self.field_mobs.get(&slot) else { return false };
        // A cached field may precede the arena confirmation. Its slot alone
        // could belong to the previous hunt, so require the boss name too.
        if let Some(field_key) = self.field_boss_key.as_deref() {
            if self.boss_key.as_deref() != Some(field_key) { return false }
        } else if !mob.arena_scene {
            let Some(actual) = mob.name.as_deref() else { return false };
            if ![self.boss_name.as_deref(), self.boss_key.as_deref()].into_iter()
                .flatten().any(|name| name.eq_ignore_ascii_case(actual)) { return false }
        }
        let Some(max_hp) = mob.max_hp.filter(|value| *value > 0) else { return false };
        let hp = if mob.dead { 0 } else { mob.hp.unwrap_or(max_hp) };
        let percent = ((hp as f64 / max_hp as f64) * 100.0).clamp(0.0, 100.0);
        let changed = self.current_hp != Some(hp) || self.max_hp != Some(max_hp)
            || self.hp_percent != Some(percent);
        self.current_hp = Some(hp);
        self.max_hp = Some(max_hp);
        self.hp_percent = Some(percent);
        changed
    }

    pub fn apply_settings(
        &mut self,
        settings: &BossSettings,
        inventory_known: bool,
        tokens: Option<u64>,
    ) {
        self.enabled = settings.enabled;
        self.mode = settings.mode;
        self.limit = match settings.mode {
            BossMode::Quantity | BossMode::Demand => settings.quantity,
            _ => None,
        };
        self.completed = settings.completed;
        self.pending = settings.pending_entry;
        self.uncertain = settings.uncertain;
        self.token_balance = if inventory_known { tokens } else { None };
        if settings.uncertain {
            self.status = "uncertain".into();
        } else if settings.pending_entry && !self.in_arena {
            self.status = "entering".into();
        } else if settings.enabled
            && !self.in_arena
            && settings.mode == BossMode::Infinite
            && inventory_known
            && tokens.is_some_and(|t| t == 0)
        {
            self.status = "waiting_tokens".into();
        } else if settings.enabled && self.status == "waiting_tokens" {
            self.status = "waiting".into();
        } else if !settings.enabled
            && !self.in_arena
            && (((settings.mode == BossMode::Quantity || settings.mode == BossMode::Demand)
                && settings
                    .quantity
                    .is_some_and(|limit| limit > 0 && settings.completed >= limit))
                || (settings.mode == BossMode::All
                    && settings.completed > 0
                    && self.token_balance == Some(0)
                    && !settings.stop_requested))
        {
            self.status = "completed".into();
        } else if !settings.enabled
            && !self.in_arena
            && self.status != "victory"
            && self.status != "defeat"
        {
            self.status = "idle".into();
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
enum PreparationStep {
    #[default]
    Ready,
    AwaitLocation,
    AwaitCenter,
    AwaitCure,
    Failed,
}

#[derive(Debug, Clone, Default)]
pub struct BossRuntime {
    pub settings: BossSettings,
    awaiting_auto: Option<bool>,
    exit_sent: bool,
    finished_battle: bool,
    active_entry: bool,
    server_loop_started: bool,
    last_error: Option<String>,
    preparation: PreparationStep,
    preparation_started: Option<Instant>,
    last_center_retry: Option<Instant>,
    entry_sent_at: Option<Instant>,
    entry_retry_at: Option<Instant>,
    last_return_attempt: Option<Instant>,
    last_pokemon_switch_attempt: Option<Instant>,
}

#[derive(Default)]
pub struct BossFleet {
    pub accounts: [BossRuntime; 4],
}

fn path() -> PathBuf {
    crate::credentials::get_app_data_dir().join("auto-boss-v1.json")
}

impl BossFleet {
    pub fn load() -> Self {
        Self::load_from(&path())
    }

    fn load_from(file: &Path) -> Self {
        let saved = fs::read(file)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Vec<BossSettings>>(&bytes).ok())
            .unwrap_or_default();
        Self::from_settings(saved)
    }

    fn from_settings(saved: Vec<BossSettings>) -> Self {
        let mut fleet = Self::default();
        for (i, settings) in saved.into_iter().take(4).enumerate() {
            fleet.accounts[i].settings = settings;
            if fleet.accounts[i].settings.enabled {
                fleet.accounts[i].preparation = PreparationStep::AwaitLocation;
            }
            if fleet.accounts[i].settings.pending_entry {
                fleet.accounts[i].settings.uncertain = true;
            }
        }
        fleet
    }

    pub fn save(&self) -> Result<(), String> {
        self.save_to(&path())
    }

    fn save_to(&self, file: &Path) -> Result<(), String> {
        fs::create_dir_all(file.parent().ok_or("Caminho inválido")?).map_err(|e| e.to_string())?;
        let tmp = file.with_extension("json.tmp");
        let settings: Vec<_> = self.accounts.iter().map(|a| a.settings.clone()).collect();
        fs::write(
            &tmp,
            serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        // Rust uses MoveFileExW(REPLACE_EXISTING) on Windows. Preserve the old
        // file until the atomic replacement; never create a deletion gap.
        fs::rename(tmp, file).map_err(|e| e.to_string())
    }
}

fn packet<'a>(raw: &'a Value) -> &'a Value {
    raw.get("data").unwrap_or(raw)
}

fn player<'a>(raw: &'a Value) -> &'a Value {
    let data = packet(raw);
    data.get("estado").unwrap_or(data)
}

fn id(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_owned)
        .or_else(|| value.as_u64().map(|n| n.to_string()))
}

pub fn catalog_from_welcome(raw: &Value) -> Option<Vec<Value>> {
    let data = packet(raw);
    data.get("bossesJogaveis")
        .or_else(|| player(raw).get("bossesJogaveis"))
        .and_then(Value::as_array)
        .cloned()
}

pub fn boss_catalog_entry<'a>(catalog: &'a [Value], key: &str) -> Option<&'a Value> {
    catalog.iter().find(|item| {
        item.get("key")
            .or_else(|| item.get("slug"))
            .or_else(|| item.get("id"))
            .and_then(Value::as_str)
            == Some(key)
    })
}

pub fn boss_cost(boss: &Value) -> Option<(String, u64)> {
    let entrance = boss.get("entrada");
    let item_id = entrance
        .and_then(|v| v.get("itemId"))
        .or_else(|| boss.get("item_id"))
        .or_else(|| boss.get("item"))
        .and_then(id)?;
    if item_id.trim().is_empty() || item_id == "0" {
        return None;
    }
    // The UI accepts a positive integer cost from entrada.qtd or the legacy
    // item_cost field. A present but malformed fee must NOT silently become
    // one token: that could authorize a boss.entrar without enough stock.
    let supplied_fee = entrance
        .and_then(|v| v.get("qtd"))
        .filter(|v| !v.is_null())
        .or_else(|| boss.get("item_cost").filter(|v| !v.is_null()));
    let qty = match supplied_fee {
        None => 1, // The game's omitted fee defaults to one entry item.
        Some(Value::Number(n)) => n.as_u64()?,
        Some(Value::String(s)) => s.parse::<u64>().ok()?,
        Some(_) => return None,
    };
    (qty > 0).then_some((item_id, qty))
}

fn battle_drops(event: &Value, boss_key: &str, boss_name: &str) -> Option<Vec<BossDrop>> {
    event.get("drops")?.as_array()?.iter()
        .map(|drop| battle_drop(drop, boss_key, boss_name))
        .collect()
}

fn battle_drop(drop: &Value, boss_key: &str, boss_name: &str) -> Option<BossDrop> {
            let item_id = drop.get("itemId").or_else(|| drop.get("id")).and_then(id).unwrap_or_default();
            let qty = drop
                .get("qtd")
                .or_else(|| drop.get("qty"))
                .and_then(Value::as_u64)?;
            if qty == 0 {
                return None;
            }
            let name = drop
                .get("nome")
                .or_else(|| drop.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if item_id.is_empty() && name.trim().is_empty() {
                return None;
            }
            Some(BossDrop {
                name: crate::game_headless::resolve_headless_item_name(item_id.parse().ok(), name),
                id: item_id,
                qty,
                boss_key: boss_key.to_owned(),
                boss_name: boss_name.to_owned(),
            })
}

pub fn apply_runtime_state(
    state: &mut crate::game_headless::HeadlessState,
    settings: &BossSettings,
) {
    // Preview the selected boss before combat only when that choice exists
    // in the authoritative playable catalog. Leave a real arena untouched.
    if !state.boss_live.in_arena && settings.enabled {
        let key = settings.select_next_boss().unwrap_or_else(|| settings.boss_key.clone());
        if let Some(selected) = boss_catalog_entry(&state.bosses_jogaveis, &key) {
            state.boss_live.boss_key = Some(key.clone());
            state.boss_live.boss_name = selected
                .get("name")
                .or_else(|| selected.get("nome"))
                .and_then(Value::as_str)
                .map(str::to_owned)
                .or_else(|| Some(key));
        }
    }
    let next_boss = settings.select_next_boss();
    let active_key = if state.boss_live.in_arena {
        state.boss_live.boss_key.as_deref().unwrap_or(&settings.boss_key)
    } else {
        next_boss.as_deref().unwrap_or(&settings.boss_key)
    };
    let cost_item = boss_catalog_entry(&state.bosses_jogaveis, active_key)
        .and_then(boss_cost)
        .map(|(id, _)| id);
    let tokens = cost_item
        .as_deref()
        .map(|id| state.inv_map.get(id).and_then(Value::as_u64).unwrap_or(0));
    state
        .boss_live
        .apply_settings(settings, state.inventory_known, tokens);
}

pub fn is_valid_config(mode: BossMode, quantity: Option<u32>) -> bool {
    is_valid_config_with_distribution(mode, quantity, None)
}

pub fn is_valid_config_with_distribution(
    mode: BossMode,
    quantity: Option<u32>,
    distribution: Option<&[BossAllocation]>,
) -> bool {
    if let Some(dist) = distribution {
        if !dist.is_empty() {
            let mut sum: u32 = 0;
            for a in dist {
                if a.percent > 100 {
                    return false;
                }
                match sum.checked_add(a.percent) {
                    Some(s) => sum = s,
                    None => return false,
                }
            }
            if sum != 100 {
                return false;
            }
        }
    }
    match mode {
        BossMode::All | BossMode::Demand | BossMode::Infinite => true,
        BossMode::Quantity => quantity.is_some_and(|n| n > 0 && n <= 100_000),
    }
}

pub fn validate_distribution(
    distribution: &[BossAllocation],
    catalog: &[Value],
) -> Result<(), String> {
    if distribution.is_empty() {
        return Ok(());
    }
    let mut total_percent: u32 = 0;
    let mut seen_keys = HashSet::new();
    let mut common_item_id: Option<String> = None;
    let mut common_fee: Option<u64> = None;

    for alloc in distribution {
        if alloc.boss_key.trim().is_empty() {
            return Err("Chave de boss inválida na distribuição".into());
        }
        if alloc.percent > 100 {
            return Err("Porcentagem não pode ser maior que 100%".into());
        }
        total_percent = total_percent
            .checked_add(alloc.percent)
            .ok_or_else(|| "Soma das porcentagens excede 100%".to_string())?;
        if !seen_keys.insert(alloc.boss_key.clone()) {
            return Err(format!("Chave de boss duplicada na distribuição: {}", alloc.boss_key));
        }
        let boss = boss_catalog_entry(catalog, &alloc.boss_key)
            .ok_or_else(|| format!("Boss '{}' indisponível no catálogo jogável informado pelo servidor", alloc.boss_key))?;
        if alloc.percent == 0 {
            continue;
        }
        let (item_id, fee) = boss_cost(boss)
            .ok_or_else(|| format!("O servidor não informou o custo de entrada para o boss '{}'", alloc.boss_key))?;

        if let Some(ref existing_id) = common_item_id {
            if existing_id != &item_id {
                return Err("Moedas de entrada incompatíveis na distribuição: todos os bosses devem utilizar o mesmo item de entrada".into());
            }
        } else {
            common_item_id = Some(item_id);
        }

        if let Some(existing_fee) = common_fee {
            if existing_fee != fee {
                return Err("Custos de entrada incompatíveis na distribuição: todos os bosses devem ter o mesmo custo por entrada".into());
            }
        } else {
            common_fee = Some(fee);
        }
    }

    if total_percent != 100 {
        return Err(format!("A soma das porcentagens da distribuição deve ser exatamente 100% (atual: {total_percent}%)"));
    }

    Ok(())
}

pub fn team_selection_command(
    state: &crate::game_headless::HeadlessState,
    settings: &BossSettings,
    pokemon_id: &Value,
) -> Result<Value, String> {
    if !state.live {
        return Err("Conecte esta conta para trocar o Pokémon".into());
    }
    if settings.enabled || settings.pending_entry || settings.uncertain || state.boss_live.in_arena
    {
        return Err(
            "Desligue o Auto Boss e aguarde a conclusão da arena e das entradas pendentes".into(),
        );
    }
    if !(pokemon_id.is_string() || pokemon_id.is_u64())
        || !state
            .team
            .iter()
            .any(|member| member.slot.is_some() && member.id.as_ref() == Some(pokemon_id))
    {
        return Err("Pokémon indisponível na equipe desta conta".into());
    }
    Ok(json!({"t":"team.active","pokemonId":pokemon_id}))
}

pub(crate) fn available_team_member(state: &crate::game_headless::HeadlessState, pokemon_id: &Value) -> bool {
    (pokemon_id.is_string() || pokemon_id.is_u64())
        && state.team.iter().any(|member| member.slot.is_some() && member.id.as_ref() == Some(pokemon_id))
}

impl BossRuntime {
    pub fn configure_pokemon_profile(
        &mut self,
        state: &crate::game_headless::HeadlessState,
        boss_key: &str,
        primary_id: Value,
        fighter_id: Value,
    ) -> Result<(), String> {
        if !state.live || state.cid.is_empty() {
            return Err("Conecte a conta para identificar o personagem e a equipe".into());
        }
        if self.settings.enabled || self.settings.pending_entry || self.settings.uncertain
            || self.settings.stop_requested || self.settings.return_pokemon_id.is_some()
            || state.boss_live.in_arena {
            return Err("Aguarde o fim do Auto Boss e o retorno do Pokémon principal".into());
        }
        if boss_catalog_entry(&state.bosses_jogaveis, boss_key).is_none() {
            return Err("Boss indisponível no catálogo jogável desta conta".into());
        }
        if !available_team_member(state, &primary_id) || !available_team_member(state, &fighter_id) {
            return Err("Escolha dois Pokémon presentes na equipe desta conta".into());
        }
        if self.settings.pokemon_owner_id.as_deref() != Some(state.cid.as_str()) {
            self.settings.pokemon_profiles.clear();
        }
        self.settings.pokemon_owner_id = Some(state.cid.clone());
        self.settings.pokemon_profiles.insert(boss_key.to_owned(), BossPokemonProfile { primary_id, fighter_id });
        Ok(())
    }
}

impl BossRuntime {
    pub fn center_when_server_unlocked(&mut self, raw: &Value, state: &crate::game_headless::HeadlessState) -> Option<Value> {
        if !self.settings.enabled || self.preparation != PreparationStep::AwaitCenter || state.in_center != Some(false) || !self.matches_owner(state) { return None; }
        if !matches!(raw.get("t").and_then(Value::as_str), Some("estado" | "welcome")) { return None; }
        let p = player(raw);
        let unlocked = p.get("centroLivreEm")?.as_u64()?;
        let now = p.get("servidorAgora")?.as_u64()?;
        if unlocked == 0 || unlocked > now || self.last_center_retry.is_some_and(|last| last.elapsed() < Duration::from_secs(1)) { return None; }
        self.last_center_retry = Some(Instant::now());
        Some(json!({"t":"centro.ir"}))
    }
    pub fn blocks_external_boss_command(&self, command: &Value) -> bool {
        if !matches!(
            command.get("t").and_then(Value::as_str),
            Some("boss.entrar" | "boss.auto" | "boss.sair")
        ) {
            return false;
        }
        self.settings.enabled
            || self.settings.pending_entry
            || self.settings.uncertain
            || self.settings.stop_requested
            || self.settings.awaiting_stock.is_some()
            || self.awaiting_auto.is_some()
    }

    pub fn matches_owner(&self, state: &crate::game_headless::HeadlessState) -> bool {
        if let Some(cid) = self.settings.owner_id.as_deref() {
            return !state.cid.is_empty() && state.cid == cid;
        }
        self.settings
            .owner
            .as_deref()
            .is_some_and(|nick| nick.eq_ignore_ascii_case(&state.name))
    }

    pub fn sync_handshake(&mut self, state: &crate::game_headless::HeadlessState) -> bool {
        let mut changed = false;
        if !self.matches_owner(state) {
            if self.settings.pending_entry && !self.settings.uncertain {
                self.settings.uncertain = true;
                return true;
            }
            return false;
        }
        if self.settings.pending_entry {
            if state.boss_live.in_arena
                && state.boss_live.boss_key.as_deref() == Some(self.settings.boss_key.as_str())
            {
                self.entry_confirmed();
            } else {
                self.settings.uncertain = true;
            }
            changed = true;
        }
        if state.boss_live.auto_active == Some(true)
            && state.boss_live.auto_key.as_deref() == Some(self.settings.boss_key.as_str())
        {
            self.server_loop_started = true;
        }
        self.active_entry = state.boss_live.in_arena
            && state.boss_live.boss_key.as_deref() == Some(self.settings.boss_key.as_str());
        if !self.settings.enabled && !self.settings.pending_entry && !self.settings.uncertain
            && self.settings.completed > 0 && self.settings.return_hunt.is_some()
            && !self.settings.return_pending && state.in_center == Some(true)
            && !state.boss_live.in_arena
        {
            self.settings.return_pending = true;
            changed = true;
        }
        if self.reconcile_debit(state.inventory_known, &state.inv_map) {
            changed = true;
        }
        changed
    }

    fn reconcile_debit(
        &mut self,
        inventory_known: bool,
        inventory: &serde_json::Map<String, Value>,
    ) -> bool {
        if !inventory_known {
            return false;
        }
        if self.settings.awaiting_stock.as_ref().is_some_and(|guard| {
            inventory
                .get(&guard.item_id)
                .and_then(Value::as_u64)
                .unwrap_or(0)
                <= guard.balance_before.saturating_sub(guard.required_debit)
        }) {
            self.settings.awaiting_stock = None;
            return true;
        }
        false
    }

    pub fn configure(
        &mut self,
        enabled: bool,
        key: String,
        mode: BossMode,
        quantity: Option<u32>,
        owner: Option<String>,
    ) {
        self.configure_with_plan(enabled, key, mode, quantity, owner, None, None);
    }

    pub fn configure_with_plan(
        &mut self,
        enabled: bool,
        key: String,
        mode: BossMode,
        quantity: Option<u32>,
        owner: Option<String>,
        distribution: Option<Vec<BossAllocation>>,
        initial_tokens: Option<u64>,
    ) {
        let pokemon_owner_id = self.settings.pokemon_owner_id.clone();
        let pokemon_profiles = self.settings.pokemon_profiles.clone();
        let return_pokemon_id = if self.settings.enabled { self.settings.return_pokemon_id.clone() } else { None };
        let stop_requested = !enabled
            && (self.settings.stop_requested
                || (self.settings.enabled && matches!(self.settings.mode, BossMode::All | BossMode::Infinite))
                || self.server_loop_started);
        let effective_key = if let Some(ref dist) = distribution {
            dist.iter().find(|a| a.percent > 0).map(|a| a.boss_key.clone()).unwrap_or(key)
        } else {
            key
        };
        self.settings = BossSettings {
            enabled,
            boss_key: effective_key,
            mode,
            quantity: match mode {
                BossMode::Quantity | BossMode::Demand => quantity,
                _ => None,
            },
            completed: 0,
            distribution,
            entry_counts: HashMap::new(),
            initial_tokens,
            pending_entry: false,
            uncertain: false,
            stop_requested,
            owner,
            owner_id: None,
            pending_stock: None,
            awaiting_stock: None,
            return_hunt: None,
            return_pending: false,
            pokemon_owner_id,
            pokemon_profiles,
            return_pokemon_id,
        };
        self.awaiting_auto = None;
        self.exit_sent = false;
        self.finished_battle = false;
        self.active_entry = false;
        self.server_loop_started = false;
        self.last_error = None;
        self.preparation = PreparationStep::Ready;
        self.preparation_started = None;
        self.entry_retry_at = None;
        self.last_pokemon_switch_attempt = None;
    }

    /// Configuration is transactional: never erase a potentially consumed
    /// entry or an unconfirmed stock debit, even when the user toggles OFF.
    pub fn configure_checked(
        &mut self,
        enabled: bool,
        key: String,
        mode: BossMode,
        quantity: Option<u32>,
        owner: Option<String>,
        owner_id: Option<String>,
        in_arena: bool,
    ) -> Result<(), String> {
        self.configure_checked_with_plan(enabled, key, mode, quantity, owner, owner_id, in_arena, None, None)
    }

    pub fn configure_checked_with_plan(
        &mut self,
        enabled: bool,
        key: String,
        mode: BossMode,
        quantity: Option<u32>,
        owner: Option<String>,
        owner_id: Option<String>,
        in_arena: bool,
        distribution: Option<Vec<BossAllocation>>,
        initial_tokens: Option<u64>,
    ) -> Result<(), String> {
        if !enabled {
            // Keep the original identity, key and outstanding debit across
            // OFF even if the account is currently disconnected. Otherwise
            // a stop request could be sent to a different character later.
            self.settings.stop_requested |= matches!(self.settings.mode, BossMode::All | BossMode::Infinite)
                && (self.settings.enabled || self.server_loop_started);
            self.settings.enabled = false;
            // OFF must take precedence over an earlier unacknowledged
            // boss.auto(true), because commands on this socket are ordered.
            if self.awaiting_auto == Some(true) {
                self.awaiting_auto = None;
            }
            return Ok(());
        }
        if self.settings.pending_entry
            || self.settings.uncertain
            || self.settings.awaiting_stock.is_some()
            || self.settings.return_pending
            || (!self.settings.enabled && self.settings.return_pokemon_id.is_some())
        {
            return Err("Existe uma entrada, débito ou retorno à hunt ainda sem confirmação do servidor. Aguarde a conclusão antes de alterar.".into());
        }

        let is_distribution_mode = distribution.as_ref().is_some_and(|d| !d.is_empty())
            || (distribution.is_none() && self.settings.distribution.as_ref().is_some_and(|d| !d.is_empty()));
        let is_same_dist = match (&self.settings.distribution, &distribution) {
            (None, None) => true,
            (Some(a), Some(b)) => a == b,
            _ => false,
        };
        let is_same_key = if is_distribution_mode {
            true
        } else {
            self.settings.boss_key == key
        };
        let is_same_quantity = if matches!(mode, BossMode::Demand | BossMode::Infinite) {
            true
        } else {
            self.settings.quantity == quantity
        };

        if in_arena {
            if self.settings.enabled
                && is_same_key
                && self.settings.mode == mode
                && is_same_quantity
                && is_same_dist
            {
                return Ok(());
            }
            return Err(
                "Aguarde o encerramento da arena atual antes de trocar o Auto Boss.".into(),
            );
        }
        if self.awaiting_auto.is_some() || self.settings.stop_requested {
            return Err(
                "Aguarde o servidor confirmar a alteração anterior do modo automático.".into(),
            );
        }
        if self.settings.enabled
            && is_same_key
            && self.settings.mode == mode
            && is_same_quantity
            && is_same_dist
            && self.settings.owner == owner
            && self.settings.owner_id == owner_id
        {
            return Ok(());
        }
        self.configure_with_plan(enabled, key, mode, quantity, owner, distribution, initial_tokens);
        self.settings.owner_id = owner_id;
        self.preparation = PreparationStep::AwaitLocation;
        self.preparation_started = None;
        Ok(())
    }

    fn entry_confirmed(&mut self) {
        self.entry_sent_at = None;
        self.entry_retry_at = None;
        self.settings.pending_entry = false;
        self.settings.uncertain = false;
        self.settings.completed = self.settings.completed.saturating_add(1);
        if !self.settings.boss_key.is_empty() {
            let count = self.settings.entry_counts.entry(self.settings.boss_key.clone()).or_insert(0);
            *count = count.saturating_add(1);
        }
        self.settings.awaiting_stock = self.settings.pending_stock.take();
        self.active_entry = true;
        self.finished_battle = false;
        self.exit_sent = false;
        if (self.settings.mode == BossMode::Quantity || self.settings.mode == BossMode::Demand)
            && self.settings.completed >= self.settings.quantity.unwrap_or(0)
        {
            self.settings.enabled = false;
        }
    }

    /// Returns true if durable settings changed and must be saved.
    pub fn observe(&mut self, raw: &Value, after: &crate::game_headless::HeadlessState) -> bool {
        let ty = raw.get("t").and_then(Value::as_str).unwrap_or("");
        if matches!(ty, "reset" | "disconnected" | "telemetry_gap") {
            self.awaiting_auto = None;
            self.exit_sent = false;
            self.active_entry = false;
            if self.settings.enabled && !self.settings.pending_entry {
                self.preparation = PreparationStep::AwaitLocation;
            }
            if self.settings.pending_entry {
                self.settings.uncertain = true;
                return true;
            }
            return false;
        }
        if !self.matches_owner(after) {
            if self.settings.pending_entry && !self.settings.uncertain {
                self.settings.uncertain = true;
                return true;
            }
            return false;
        }
        let mut changed = false;
        if self.settings.return_pending && after.live && after.in_center == Some(false)
            && !after.boss_live.in_arena
            && self.settings.return_hunt.as_deref() == Some(after.hunt.as_str())
        {
            self.settings.return_pending = false;
            self.settings.return_hunt = None;
            self.last_return_attempt = None;
            changed = true;
        }
        if ty == "welcome" {
            self.awaiting_auto = None;
            self.exit_sent = false;
            if self.settings.pending_entry {
                let arena = player(raw).pointer("/boss/arena");
                if arena.and_then(|v| v.get("key")).and_then(Value::as_str)
                    == Some(self.settings.boss_key.as_str())
                {
                    self.entry_confirmed();
                } else {
                    // A request may have succeeded and completed during an outage.
                    // An empty arena cannot prove the token was not consumed.
                    self.settings.uncertain = true;
                }
                changed = true;
            }
            self.server_loop_started = player(raw).pointer("/boss/auto").and_then(Value::as_bool)
                == Some(true)
                && player(raw).pointer("/boss/autoKey").and_then(Value::as_str)
                    == Some(self.settings.boss_key.as_str());
            self.active_entry = after.boss_live.in_arena
                && after.boss_live.boss_key.as_deref() == Some(self.settings.boss_key.as_str());
        }
        if matches!(ty, "welcome" | "estado") {
            let boss = player(raw).get("boss");
            if ty == "estado"
                && self.settings.pending_entry
                && boss.and_then(|b| b.pointer("/arena/key")).and_then(Value::as_str)
                    == Some(self.settings.boss_key.as_str())
            {
                self.entry_confirmed();
                if matches!(self.settings.mode, BossMode::All | BossMode::Infinite)
                    && after.boss_live.auto_active == Some(true)
                    && after.boss_live.auto_key.as_deref() == Some(self.settings.boss_key.as_str())
                {
                    self.server_loop_started = true;
                }
                changed = true;
            }
            if boss.and_then(|b| b.get("auto")).and_then(Value::as_bool) == Some(false) {
                self.server_loop_started = false;
            }
            if let (Some(waiting), Some(actual)) = (
                self.awaiting_auto,
                boss.and_then(|b| b.get("auto")).and_then(Value::as_bool),
            ) {
                if waiting == actual
                    && (!waiting
                        || boss.and_then(|b| b.get("autoKey")).and_then(Value::as_str)
                            == Some(self.settings.boss_key.as_str()))
                {
                    self.awaiting_auto = None;
                    if !waiting && self.settings.stop_requested {
                        self.settings.stop_requested = false;
                        changed = true;
                    }
                }
            }
            if player(raw)
                .get("items")
                .or_else(|| player(raw).get("inventory"))
                .is_some()
                && self.reconcile_debit(after.inventory_known, &after.inv_map)
            {
                changed = true;
            }
            if self.finished_battle
                && player(raw)
                    .pointer("/boss/arena")
                    .is_some_and(Value::is_null)
            {
                self.finished_battle = false;
                self.exit_sent = false;
                if self.settings.enabled && after.in_center.is_some() {
                    self.preparation = PreparationStep::AwaitLocation;
                }
            }
        }
        if ty == "erro"
            && self.settings.enabled
            && matches!(
                self.preparation,
                PreparationStep::AwaitCenter | PreparationStep::AwaitCure
            )
        {
            self.last_error = packet(raw)
                .get("chave")
                .or_else(|| packet(raw).get("msg"))
                .and_then(Value::as_str)
                .map(str::to_owned);
            changed = true;
        }
        if ty == "erro" && self.settings.pending_entry {
            self.settings.uncertain = true;
            self.last_error = packet(raw)
                .get("chave")
                .or_else(|| packet(raw).get("msg"))
                .and_then(Value::as_str)
                .map(str::to_owned);
            changed = true;
        }
        if ty == "batalha" {
            if let Some(events) = packet(raw).get("ev").and_then(Value::as_array) {
                for event in events {
                    let kind = event
                        .get("k")
                        .or_else(|| event.get("t"))
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    let key = event
                        .get("key")
                        .and_then(Value::as_str)
                        .or(after.boss_live.boss_key.as_deref());
                    match kind {
                        "aviso" if event.get("msg").and_then(Value::as_str)
                            == Some("vá ao Centro Pokemon antes de desafiar um boss")
                            && self.settings.pending_entry && !self.active_entry
                            && !after.boss_live.in_arena =>
                        {
                            self.settings.pending_entry = false;
                            self.settings.uncertain = false;
                            self.settings.pending_stock = None;
                            self.entry_sent_at = None;
                            self.preparation = PreparationStep::AwaitLocation;
                            self.preparation_started = None;
                            self.entry_retry_at = Some(Instant::now() + Duration::from_secs(1));
                            self.last_error = None;
                            changed = true;
                        }
                        // This is an explicit rejection, not an ambiguous timeout:
                        // the server did not start an arena or debit an entry.
                        "aviso" if event.get("msg").and_then(Value::as_str) == Some("boss.esperaProximo")
                            && self.settings.pending_entry && !self.active_entry
                            && !after.boss_live.in_arena =>
                        {
                            if let Some(seconds) = event.pointer("/params/s").and_then(Value::as_f64)
                                .filter(|s| s.is_finite() && *s >= 0.0 && *s <= 3600.0)
                            {
                                self.settings.pending_entry = false;
                                self.settings.uncertain = false;
                                self.settings.pending_stock = None;
                                self.entry_sent_at = None;
                                self.entry_retry_at = Some(Instant::now() + Duration::from_secs_f64(seconds + 1.0));
                                self.last_error = None;
                                changed = true;
                            }
                        }
                        "aviso" if self.settings.enabled && matches!(self.preparation, PreparationStep::AwaitCenter | PreparationStep::AwaitCure) => {
                            if let Some(message) = event.get("msg").and_then(Value::as_str).filter(|message| message.starts_with("em combate")) {
                                self.last_error = Some(message.to_owned());
                                changed = true;
                            }
                        }
                        "curado" | "joy"
                            if (kind == "curado" || event.get("fala").and_then(Value::as_str) == Some("jaCurado"))
                                && self.settings.enabled
                                && self.preparation == PreparationStep::AwaitCure
                                && after.in_center == Some(true) =>
                        {
                            self.preparation = PreparationStep::Ready;
                            // The server may still enforce the hunt combat lock
                            // after the Center and healing receipts.
                            self.preparation_started = Some(Instant::now());
                            changed = true;
                        }
                        "bossEntrou" if key == Some(self.settings.boss_key.as_str()) => {
                            if self.settings.pending_entry && !self.active_entry {
                                self.entry_confirmed();
                                if matches!(self.settings.mode, BossMode::All | BossMode::Infinite)
                                    && after.boss_live.auto_active == Some(true)
                                    && after.boss_live.auto_key.as_deref()
                                        == Some(self.settings.boss_key.as_str())
                                {
                                    self.server_loop_started = true;
                                }
                                // A snapshot may precede the event within a server
                                // update. Compare the pending balance as well.
                                self.reconcile_debit(after.inventory_known, &after.inv_map);
                                changed = true;
                            } else if self.settings.enabled
                                && matches!(self.settings.mode, BossMode::All | BossMode::Infinite)
                                && (self.server_loop_started || event.get("auto").and_then(Value::as_bool) == Some(true))
                                && !self.active_entry
                            {
                                self.server_loop_started = true;
                                if self.awaiting_auto == Some(true) {
                                    self.awaiting_auto = None;
                                }
                                self.entry_confirmed();
                                changed = true;
                            }
                        }
                        "bossMorto" | "bossPerdeu"
                            if key == Some(self.settings.boss_key.as_str()) =>
                        {
                            self.finished_battle = true;
                            self.active_entry = false;
                            if self.settings.return_hunt.is_some() && !self.settings.enabled {
                                self.settings.return_pending = true;
                                changed = true;
                            }
                        }
                        "bossSaiu" => {
                            self.finished_battle = false;
                            self.exit_sent = false;
                            self.active_entry = false;
                            if self.settings.enabled {
                                self.preparation = PreparationStep::AwaitLocation;
                                self.preparation_started = None;
                            }
                        }
                        "bossAuto" => {
                            if let Some(confirmed) = event.get("ativo").and_then(Value::as_bool) {
                                if !confirmed {
                                    self.server_loop_started = false;
                                }
                                let stop_confirmed =
                                    !confirmed && self.awaiting_auto == Some(false);
                                if self.awaiting_auto == Some(confirmed)
                                    && (!confirmed
                                        || event.get("key").and_then(Value::as_str)
                                            == Some(self.settings.boss_key.as_str())
                                        || after.boss_live.auto_key.as_deref()
                                            == Some(self.settings.boss_key.as_str()))
                                {
                                    self.awaiting_auto = None;
                                }
                                if stop_confirmed && self.settings.stop_requested {
                                    self.settings.stop_requested = false;
                                    changed = true;
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        if !self.settings.pending_entry
            && !self.settings.uncertain
            && !self.active_entry
            && !self.finished_battle
            && !self.exit_sent
            && !after.boss_live.in_arena
            && self.settings.awaiting_stock.is_none()
            && self.settings.distribution.as_ref().is_some_and(|d| !d.is_empty())
        {
            if let Some(next) = self.settings.select_next_boss() {
                if self.settings.boss_key != next {
                    self.settings.boss_key = next;
                    changed = true;
                }
            }
        }
        changed
    }

    /// At most one command per tick. Entries are never repeated after uncertain sends.
    /// The caller must persist settings BEFORE sending boss.entrar.
    pub fn next_command(&mut self, state: &crate::game_headless::HeadlessState) -> Option<Value> {
        self.next_command_with_raid_reservation(state, false)
    }

    /// If weekly raid enrollment is enabled and unconfirmed, reserve one
    /// Bronze Boss Token (70000). With that reservation, continuous server
    /// auto would be unsafe, so the client advances only confirmed battles.
    pub fn next_command_with_raid_reservation(
        &mut self,
        state: &crate::game_headless::HeadlessState,
        reserve_bronze: bool,
    ) -> Option<Value> {
        if self.settings.pending_entry && !self.settings.uncertain && self.entry_sent_at.is_some_and(|sent| sent.elapsed() >= Duration::from_secs(30)) {
            self.settings.uncertain = true;
            self.last_error = Some("O servidor não confirmou a entrada no Boss. Verifique o jogo antes de iniciar outra entrada.".into());
            self.entry_sent_at = None;
        }
        if self.awaiting_auto.is_some() {
            return None;
        }
        if !self.settings.enabled {
            if self.settings.stop_requested {
                if !state.live || !self.matches_owner(state) {
                    return None;
                }
                // Always send an explicit false after an ON -> OFF transition.
                // A previous boss.auto(true) may still be queued when a
                // pre-transition snapshot reports false.
                self.awaiting_auto = Some(false);
                return Some(json!({"t":"boss.auto","ativo":false}));
            }
            if self.finished_battle
                && state.live
                && self.matches_owner(state)
                && state.boss_live.in_arena
                && !self.exit_sent
                && state.boss_live.boss_key.as_deref() == Some(self.settings.boss_key.as_str())
            {
                self.exit_sent = true;
                return Some(json!({"t":"boss.sair"}));
            }
            if let Some(primary) = self.settings.return_pokemon_id.clone() {
                if !state.live || !self.matches_owner(state) || state.boss_live.in_arena
                    || self.settings.pending_entry || self.settings.uncertain
                    || (self.finished_battle && state.boss_live.status == "defeat") {
                    return None;
                }
                if state.active_id.as_ref() == Some(&primary) {
                    self.settings.return_pokemon_id = None;
                    self.last_pokemon_switch_attempt = None;
                } else {
                    if !available_team_member(state, &primary) {
                        self.last_error = Some("O Pokémon principal não está mais na equipe; retorno automático pausado.".into());
                        return None;
                    }
                    if self.last_pokemon_switch_attempt.is_some_and(|last| last.elapsed() < Duration::from_secs(5)) {
                        return None;
                    }
                    self.last_pokemon_switch_attempt = Some(Instant::now());
                    return Some(json!({"t":"team.active","pokemonId":primary}));
                }
            }
            if self.settings.return_pending && state.live && self.matches_owner(state)
                && state.in_center == Some(true) && !state.boss_live.in_arena
                && !self.settings.pending_entry && !self.settings.uncertain
                && !self.settings.stop_requested
                && self.last_return_attempt.is_none_or(|last| last.elapsed() >= Duration::from_secs(5))
            {
                if let Some(hunt) = self.settings.return_hunt.as_ref() {
                    self.last_return_attempt = Some(Instant::now());
                    return Some(json!({"t":"hunt.select", "slug":hunt}));
                }
            }
            return None;
        }
        if self.settings.uncertain || self.settings.pending_entry {
            return None;
        }
        if self.entry_retry_at.is_some_and(|deadline| Instant::now() < deadline) {
            return None;
        }
        self.entry_retry_at = None;
        if !state.live || !state.inventory_known {
            return None;
        }
        if !self.matches_owner(state) {
            return None;
        }
        if self.finished_battle && !state.boss_live.in_arena {
            self.finished_battle = false;
            self.exit_sent = false;
            if state.in_center.is_some() {
                self.preparation = PreparationStep::AwaitLocation;
                self.preparation_started = None;
            }
        }
        let has_distribution = self.settings.distribution.as_ref().is_some_and(|d| !d.is_empty());
        if !self.settings.pending_entry
            && !self.settings.uncertain
            && !self.active_entry
            && !self.finished_battle
            && !self.exit_sent
            && !state.boss_live.in_arena
            && self.settings.awaiting_stock.is_none()
            && has_distribution
        {
            if let Some(next) = self.settings.select_next_boss() {
                if self.settings.boss_key != next {
                    self.settings.boss_key = next;
                }
            }
        }
        let Some(boss) = boss_catalog_entry(&state.bosses_jogaveis, &self.settings.boss_key) else {
            self.last_error = Some(format!("O boss programado '{}' não está no catálogo desta conta. Auto Boss aguardando disponibilidade.", self.settings.boss_key));
            return None;
        };
        if state.boss_live.in_arena
            && state.boss_live.boss_key.as_deref() != Some(self.settings.boss_key.as_str())
        {
            return None;
        }
        let level = boss
            .get("minNivelTreinador")
            .or_else(|| boss.get("level"))
            .or_else(|| boss.get("nv"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        if (state.level as u64) < level {
            self.last_error = Some(format!("O boss programado exige nível {level}. Auto Boss aguardando o nível necessário."));
            return None;
        }
        let (item_id, fee) = boss_cost(boss)?;
        let tokens = state
            .inv_map
            .get(&item_id)
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let reserve = if reserve_bronze && item_id == "70000" {
            1
        } else {
            0
        };
        let native_auto = reserve == 0 && !has_distribution
            && (self.settings.mode == BossMode::All
                || (self.settings.mode == BossMode::Infinite
                    && (tokens >= fee.saturating_mul(2)
                        || self.server_loop_started
                        || (state.boss_live.auto_active == Some(true)
                            && state.boss_live.auto_key.as_deref() == Some(self.settings.boss_key.as_str())))));
        let manual_exit = !native_auto;
        if state.boss_live.in_arena && !self.finished_battle {
            if reserve > 0 && state.boss_live.auto_active == Some(true) {
                self.awaiting_auto = Some(false);
                return Some(json!({"t":"boss.auto","ativo":false}));
            }
            return None;
        }
        if self.finished_battle
            && state.boss_live.in_arena
            && manual_exit
        {
            if !self.exit_sent {
                self.exit_sent = true;
                return Some(json!({"t":"boss.sair"}));
            }
            return None;
        }
        let is_limit_reached = match self.settings.mode {
            BossMode::Quantity | BossMode::Demand => {
                self.settings.completed >= self.settings.quantity.unwrap_or(0)
            }
            _ => false,
        };
        if self.settings.mode == BossMode::Infinite {
            if tokens < fee.saturating_add(reserve) {
                // Disable server boss.auto before zero-token early return
                if state.boss_live.auto_active == Some(true) {
                    self.awaiting_auto = Some(false);
                    return Some(json!({"t":"boss.auto","ativo":false}));
                }
                // Infinite remains enabled while hunting with zero tokens.
                // Restores hunt/primary between token batches, repeats when token collected.
                if !state.boss_live.in_arena && !self.finished_battle && !self.exit_sent {
                    if let Some(primary) = self.settings.return_pokemon_id.clone() {
                        if state.active_id.as_ref() != Some(&primary) {
                            if !available_team_member(state, &primary) {
                                self.last_error = Some("O Pokémon principal não está mais na equipe; retorno automático pausado.".into());
                            } else {
                                if self.last_pokemon_switch_attempt.is_none_or(|last| last.elapsed() >= Duration::from_secs(5)) {
                                    self.last_pokemon_switch_attempt = Some(Instant::now());
                                    return Some(json!({"t":"team.active","pokemonId":primary}));
                                }
                            }
                            // Wait for primary selection ack before hunt
                            return None;
                        }
                    }
                    if let Some(hunt) = self.settings.return_hunt.as_ref() {
                        if state.hunt != *hunt
                            && (state.in_center == Some(true) || state.hunt == "centro")
                            && self.last_return_attempt.is_none_or(|last| last.elapsed() >= Duration::from_secs(5))
                        {
                            self.last_return_attempt = Some(Instant::now());
                            return Some(json!({"t":"hunt.select","slug":hunt}));
                        }
                    }
                }
                return None;
            }
        } else if tokens < fee || is_limit_reached {
            if self.settings.mode == BossMode::All
                && (self.server_loop_started
                    || (state.boss_live.auto_active == Some(true)
                        && state.boss_live.auto_key.as_deref()
                            == Some(self.settings.boss_key.as_str())))
            {
                self.settings.stop_requested = true;
            }
            self.settings.enabled = false;
            if self.finished_battle && self.settings.return_hunt.is_some() {
                self.settings.return_pending = true;
            }
            return None;
        }
        // The reserved token must stay available for raid.inscrever. Keep
        // config ON while waiting for raid receipt or additional tokens.
        if tokens < fee.saturating_add(reserve) {
            if reserve > 0 && state.boss_live.auto_active == Some(true) {
                self.awaiting_auto = Some(false);
                return Some(json!({"t":"boss.auto","ativo":false}));
            }
            return None;
        }
        if reserve > 0 && state.boss_live.auto_active == Some(true) {
            self.awaiting_auto = Some(false);
            return Some(json!({"t":"boss.auto","ativo":false}));
        }
        // Once the first entry is confirmed, the server owns healing and every
        // next entry in this batch. Do not inject local Center/exit commands.
        if native_auto && self.server_loop_started {
            return None;
        }
        // A new configured job must first reach the Center, then wait for the
        // server's `curado` receipt before any boss command can be sent.
        if self.preparation == PreparationStep::AwaitCure && self.preparation_started.is_some_and(|started| {
            started.elapsed() >= Duration::from_secs(30)
        }) {
            self.preparation = PreparationStep::Failed;
            self.preparation_started = None;
            let detail = self.last_error.take().map(|message| format!(" Último aviso do jogo: {message}.")).unwrap_or_default();
            self.last_error = Some(format!("Preparação do Auto Boss sem confirmação do servidor após 30 segundos.{detail} Desative e ative novamente para tentar de novo."));
        }
        // Startup/reconnect may resume the hunt after a Center/heal receipt.
        // Never reuse that receipt once the authoritative location has changed.
        if self.preparation == PreparationStep::Ready && state.in_center == Some(false) {
            self.preparation = PreparationStep::AwaitLocation;
            self.preparation_started = None;
        }
        match self.preparation {
            PreparationStep::AwaitLocation => match state.in_center {
                Some(true) => {
                    if self.settings.return_hunt.as_deref().is_none_or(|hunt| hunt == "centro" || hunt.starts_with("boss_"))
                        && !state.last_hunt_slug.is_empty() && state.last_hunt_slug != "centro"
                        && !state.last_hunt_slug.starts_with("boss_") {
                        self.settings.return_hunt = Some(state.last_hunt_slug.clone());
                    }
                    self.preparation = PreparationStep::AwaitCure;
                    self.preparation_started = Some(Instant::now());
                    return Some(json!({"t":"centro.curar"}));
                }
                Some(false) => {
                    if self.settings.return_hunt.as_deref().is_none_or(|hunt| hunt == "centro" || hunt.starts_with("boss_"))
                        && !state.last_hunt_slug.is_empty() && state.last_hunt_slug != "centro"
                        && !state.last_hunt_slug.starts_with("boss_") {
                        self.settings.return_hunt = Some(state.last_hunt_slug.clone());
                    }
                    self.preparation = PreparationStep::AwaitCenter;
                    self.preparation_started = Some(Instant::now());
                    return Some(json!({"t":"centro.ir"}));
                }
                None => return None,
            },
            PreparationStep::AwaitCenter => {
                if state.in_center == Some(true) {
                    self.preparation = PreparationStep::AwaitCure;
                    self.preparation_started = Some(Instant::now());
                    return Some(json!({"t":"centro.curar"}));
                }
                return None;
            }
            PreparationStep::AwaitCure | PreparationStep::Failed => return None,
            PreparationStep::Ready => {
                if self.preparation_started.is_some_and(|started| started.elapsed() < Duration::from_secs(3)) {
                    return None;
                }
                self.preparation_started = None;
            }
        }
        if self.settings.pokemon_owner_id.as_deref() == Some(state.cid.as_str()) {
            if let Some(profile) = self.settings.pokemon_profiles.get(&self.settings.boss_key) {
                if state.active_id.as_ref() != Some(&profile.fighter_id) {
                    if state.boss_live.in_arena || !available_team_member(state, &profile.fighter_id) {
                        self.last_error = Some("O combatente configurado não está disponível na equipe.".into());
                        return None;
                    }
                    if self.last_pokemon_switch_attempt.is_some_and(|last| last.elapsed() < Duration::from_secs(5)) {
                        return None;
                    }
                    self.last_pokemon_switch_attempt = Some(Instant::now());
                    return Some(json!({"t":"team.active","pokemonId":profile.fighter_id}));
                }
                self.last_pokemon_switch_attempt = None;
            }
        }
        if state.boss_live.auto_active == Some(true)
            && !native_auto
        {
            self.awaiting_auto = Some(false);
            return Some(json!({"t":"boss.auto","ativo":false}));
        }
        if native_auto
            && (state.boss_live.auto_active == Some(false)
                || (state.boss_live.auto_active == Some(true)
                    && state.boss_live.auto_key.as_deref()
                        != Some(self.settings.boss_key.as_str())))
        {
            self.awaiting_auto = Some(true);
            return Some(json!({"t":"boss.auto","ativo":true,"key":self.settings.boss_key}));
        }
        // Current server starts the first fight when enabling native auto.
        // Wait for its receipt instead of injecting a second manual entry.
        if native_auto && self.settings.mode == BossMode::Infinite {
            return None;
        }
        // Do not send a boss entry while there is another arena, an unresolved
        // token debit, or a server-controlled continuous loop already running.
        if state.boss_live.in_arena
            || self.finished_battle
            || self.settings.awaiting_stock.is_some()
            || self.exit_sent
        {
            return None;
        }
        // If server auto status is absent, no safe guarantee another loop
        // isn't active. Wait for a full authoritative boss snapshot.
        if state.boss_live.auto_active.is_none() {
            return None;
        }
        self.settings.pending_entry = true;
        self.entry_sent_at = Some(Instant::now());
        self.settings.pending_stock = Some(DebitGuard {
            item_id,
            balance_before: tokens,
            required_debit: fee,
        });
        Some(json!({"t":"boss.entrar","key":self.settings.boss_key}))
    }

    pub fn status(&self, live: Option<&BossLive>) -> Value {
        let next_boss_key = self.settings.select_next_boss();
        json!({
            "enabled": self.settings.enabled,
            "bossKey": self.settings.boss_key,
            "mode": self.settings.mode,
            "quantity": self.settings.quantity,
            "completed": self.settings.completed,
            "distribution": self.settings.distribution,
            "entryCounts": self.settings.entry_counts,
            "nextBossKey": next_boss_key,
            "initialTokens": self.settings.initial_tokens,
            "config": {
                "enabled": self.settings.enabled,
                "bossKey": self.settings.boss_key,
                "mode": self.settings.mode,
                "quantity": self.settings.quantity,
                "distribution": self.settings.distribution,
            },
            "pokemonOwnerId": self.settings.pokemon_owner_id,
            "pokemonProfiles": self.settings.pokemon_profiles,
            "pokemonReturnPending": self.settings.return_pokemon_id.is_some(),
            "pending": self.settings.pending_entry,
            "uncertain": self.settings.uncertain,
            "awaitingAuto": self.awaiting_auto,
            "awaitingStock": self.settings.awaiting_stock.is_some(),
            "retryAfterMs": self.entry_retry_at.map(|deadline| deadline.saturating_duration_since(Instant::now()).as_millis() as u64),
            "preparation": match self.preparation {
                PreparationStep::Ready => "ready",
                PreparationStep::AwaitLocation => "awaiting_location",
                PreparationStep::AwaitCenter => "awaiting_center",
                PreparationStep::AwaitCure => "awaiting_cure",
                PreparationStep::Failed => "preparation_error",
            },
            "error": self.last_error,
            "live": live
        })
    }
}

/// Parses only server-reported boss state, arena mobs and battle receipts.
/// Never derives rewards from inventory changes or local probability tables.
pub fn observe_headless_message(
    raw: &Value,
    state: &mut crate::game_headless::HeadlessState,
) -> bool {
    let ty = raw.get("t").and_then(Value::as_str).unwrap_or("");
    let data = packet(raw);
    if matches!(ty, "reset" | "disconnected" | "telemetry_gap") {
        state.boss_live.in_arena = false;
        state.boss_live.auto_active = None;
        state.boss_live.current_hp = None;
        state.boss_live.max_hp = None;
        state.boss_live.hp_percent = None;
        state.boss_live.field_mobs.clear();
        state.boss_live.status = "disconnected".into();
        return true;
    }

    let mut changed = false;
    if ty == "welcome" {
        let next_name = player(raw)
            .get("nick")
            .or_else(|| player(raw).get("nome"))
            .and_then(Value::as_str);
        if next_name.is_some_and(|name| !name.eq_ignore_ascii_case(&state.name)) {
            state.boss_drops.clear();
        }
        let session_victories = state.boss_live.session_victories;
        state.boss_live = BossLive {
            session_victories,
            ..Default::default()
        };
        if let Some(catalog) = catalog_from_welcome(raw) {
            state.bosses_jogaveis = catalog;
            changed = true;
        }
        if let Some(catalog) = packet(raw)
            .get("bossesCatalogo")
            .or_else(|| player(raw).get("bossesCatalogo"))
            .and_then(Value::as_array)
        {
            state.bosses_catalogo = catalog.clone();
            changed = true;
        }
    }
    if matches!(ty, "welcome" | "estado") {
        let p = player(raw);
        if let Some(catalog) = p.get("bossesJogaveis").and_then(Value::as_array) {
            state.bosses_jogaveis = catalog.clone();
            changed = true;
        }
        if let Some(boss) = p.get("boss") {
            if let Some(arena) = boss.get("arena") {
                if arena.is_null() {
                    state.boss_live.in_arena = false;
                    state.boss_live.slot = None;
                    state.boss_live.field_mobs.clear();
                } else if arena.is_object() {
                    if !state.boss_live.in_arena {
                        state.boss_live.started_at_ms = None;
                        state.boss_live.duration_ms = None;
                        state.boss_live.terminal_receipt_recorded = false;
                        state.boss_live.winner = None;
                        state.boss_live.current_hp = None;
                        state.boss_live.max_hp = None;
                        state.boss_live.hp_percent = None;
                    }
                    state.boss_live.in_arena = true;
                    state.boss_live.boss_key = arena
                        .get("key")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                        .or_else(|| state.boss_live.boss_key.take());
                    state.boss_live.boss_name = arena
                        .get("nome")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                        .or_else(|| state.boss_live.boss_name.take());
                    state.boss_live.slot = arena.get("slot").and_then(Value::as_i64);
                    state.boss_live.sync_hp_from_field();
                    if state.boss_live.status != "fighting" {
                        state.boss_live.status = "fighting".into();
                    }
                }
                changed = true;
            }
            if let Some(auto) = boss.get("auto").and_then(Value::as_bool) {
                state.boss_live.auto_active = Some(auto);
                changed = true;
            }
            if let Some(key_value) = boss.get("autoKey") {
                state.boss_live.auto_key = key_value.as_str().map(str::to_owned);
                if let Some(key) = key_value.as_str() {
                    if state.boss_live.boss_key.is_none() {
                        state.boss_live.boss_key = Some(key.into());
                    }
                }
                changed = true;
            }
        }
        let active = p
            .get("activeId")
            .or_else(|| p.get("activePokemonId"))
            .or(state.active_id.as_ref());
        for pokemons in [
            p.get("pokemons").and_then(Value::as_array),
            p.get("pkMud").and_then(Value::as_array),
        ]
        .into_iter()
        .flatten()
        {
            if let Some(pk) = pokemons
                .iter()
                .find(|pk| active.is_some() && pk.get("id") == active)
            {
                if let Some(hp) = pk.get("hp").and_then(Value::as_i64) {
                    state.boss_live.player_hp = Some(hp);
                    changed = true;
                }
                if let Some(hp) = pk.get("maxHp").and_then(Value::as_i64) {
                    state.boss_live.player_max_hp = Some(hp);
                    changed = true;
                }
            }
        }
    }
    if matches!(ty, "campo" | "campo.init") {
        if ty == "campo.init" {
            state.boss_live.field_boss_key = data.get("slug").and_then(Value::as_str)
                .and_then(|slug| slug.strip_prefix("boss_")).map(str::to_owned);
        }
        let slug = data
            .get("slug")
            .or_else(|| raw.get("slug"))
            .and_then(Value::as_str);
        let in_center = data
            .get("centro")
            .and_then(Value::as_bool)
            .or_else(|| slug.map(|value| value == "centro"));
        if in_center == Some(true) {
            // The server sends this after bossMorto when the player is
            // automatically returned to Nurse Joy. Reflect the location so
            // the HUD does not remain stuck in an arena and quantity mode
            // does not send a redundant boss.sair.
            state.in_center = Some(true);
            state.boss_live.in_arena = false;
            state.boss_live.slot = None;
            state.boss_live.field_mobs.clear();
            if !matches!(state.boss_live.status.as_str(), "victory" | "defeat") {
                state.boss_live.status = "center".into();
            }
            changed = true;
        } else if in_center == Some(false) {
            state.in_center = Some(false);
            changed = true;
        }
    }
    if matches!(ty, "campo" | "campo.init") {
        let mobs = raw.get("mobs").or_else(|| data.get("mobs")).and_then(Value::as_array);
        if ty == "campo.init" || mobs.is_some() {
            state.boss_live.observe_field_mobs(mobs.map(Vec::as_slice).unwrap_or_default(), ty == "campo.init");
            changed |= state.boss_live.sync_hp_from_field();
        }
        if let Some(removed) = data.get("fora").and_then(Value::as_array) {
            for slot in removed.iter().filter_map(Value::as_i64) {
                state.boss_live.field_mobs.remove(&slot);
                if state.boss_live.slot == Some(slot) && !state.boss_live.terminal_receipt_recorded {
                    state.boss_live.current_hp = None;
                    state.boss_live.max_hp = None;
                    state.boss_live.hp_percent = None;
                    changed = true;
                }
            }
        }
    }
    if ty == "batalha" {
        state.boss_live.accepted_victory_indices.clear();
        if let Some(events) = data.get("ev").and_then(Value::as_array) {
            for (event_index, event) in events.iter().enumerate() {
                let kind = event
                    .get("k")
                    .or_else(|| event.get("t"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                match kind {
                    "bossEntrou" => {
                        let live = &mut state.boss_live;
                        if live.in_arena
                            && !live.terminal_receipt_recorded
                            && live.boss_key.as_deref() == event.get("key").and_then(Value::as_str)
                        {
                            live.started_at_ms.get_or_insert_with(battle_clock_ms);
                            // Repeated notice of the same arena does not reset
                            // the HUD or allow two receipts for one battle.
                            continue;
                        }
                        live.in_arena = true;
                        live.boss_key = event
                            .get("key")
                            .and_then(Value::as_str)
                            .map(str::to_owned)
                            .or_else(|| live.boss_key.take());
                        live.boss_name = event
                            .get("nome")
                            .and_then(Value::as_str)
                            .map(str::to_owned)
                            .or_else(|| live.boss_name.take());
                        live.slot = event.get("slot").and_then(Value::as_i64);
                        live.started_at_ms = Some(battle_clock_ms());
                        live.duration_ms = None;
                        live.turn = Some(0);
                        live.winner = None;
                        live.last_battle_drops = None;
                        live.current_hp = None;
                        live.max_hp = None;
                        live.hp_percent = None;
                        live.sync_hp_from_field();
                        live.status = "fighting".into();
                        live.terminal_receipt_recorded = false;
                        changed = true;
                    }
                    "ataque"
                        if state.boss_live.in_arena
                            && event.get("por").and_then(Value::as_str) == Some("jogador") =>
                    {
                        state.boss_live.turn =
                            Some(state.boss_live.turn.unwrap_or(0).saturating_add(1));
                        changed = true;
                    }
                    "bossMorto" => {
                        let live = &mut state.boss_live;
                        if live.terminal_receipt_recorded {
                            continue;
                        }
                        live.terminal_receipt_recorded = true;
                        live.accepted_victory_indices.push(event_index);
                        live.session_victories = live.session_victories.saturating_add(1);
                        live.boss_key = event
                            .get("key")
                            .and_then(Value::as_str)
                            .map(str::to_owned)
                            .or_else(|| live.boss_key.take());
                        live.boss_name = event
                            .get("nome")
                            .and_then(Value::as_str)
                            .map(str::to_owned)
                            .or_else(|| live.boss_name.take());
                        live.current_hp = Some(0);
                        live.hp_percent = Some(0.0);
                        live.field_mobs.clear();
                        live.winner = Some("victory".into());
                        live.status = "victory".into();
                        live.last_battle_drops = battle_drops(
                            event,
                            live.boss_key.as_deref().unwrap_or_default(),
                            live.boss_name.as_deref().unwrap_or_default(),
                        );
                        let boss_key = live.boss_key.clone().unwrap_or_default();
                        let boss_name = live.boss_name.clone().unwrap_or_default();
                        for drop in event.get("drops").and_then(Value::as_array).into_iter().flatten()
                            .filter_map(|item| battle_drop(item, &boss_key, &boss_name)) {
                            if let Some(found) = state
                                .boss_drops
                                .iter_mut()
                                .find(|d| d.id == drop.id && d.boss_key == boss_key
                                    && (!d.id.is_empty() || d.name == drop.name))
                            {
                                found.qty = found.qty.saturating_add(drop.qty);
                            } else {
                                state.boss_drops.push(drop);
                            }
                        }
                        state.boss_live.duration_ms = state.boss_live.started_at_ms.and_then(|start| battle_clock_ms().checked_sub(start));
                        let receipt = BossHistoryRecord::from_state(state, "victory");
                        state.boss_history_pending.push(receipt);
                        changed = true;
                    }
                    "bossPerdeu" => {
                        if state.boss_live.terminal_receipt_recorded {
                            continue;
                        }
                        state.boss_live.terminal_receipt_recorded = true;
                        state.boss_live.boss_key = event.get("key").and_then(Value::as_str)
                            .map(str::to_owned).or_else(|| state.boss_live.boss_key.take());
                        state.boss_live.boss_name = event.get("nome").and_then(Value::as_str)
                            .map(str::to_owned).or_else(|| state.boss_live.boss_name.take());
                        state.boss_live.in_arena = false;
                        state.boss_live.field_mobs.clear();
                        state.boss_live.winner = Some("defeat".into());
                        state.boss_live.status = "defeat".into();
                        state.boss_live.last_battle_drops = battle_drops(
                            event,
                            state.boss_live.boss_key.as_deref().unwrap_or_default(),
                            state.boss_live.boss_name.as_deref().unwrap_or_default(),
                        );
                        state.boss_live.duration_ms = state.boss_live.started_at_ms.and_then(|start| battle_clock_ms().checked_sub(start));
                        let receipt = BossHistoryRecord::from_state(state, "defeat");
                        state.boss_history_pending.push(receipt);
                        changed = true;
                    }
                    "bossSaiu" => {
                        state.boss_live.in_arena = false;
                        state.boss_live.slot = None;
                        state.boss_live.field_mobs.clear();
                        state.boss_live.status = "left".into();
                        changed = true;
                    }
                    "bossAuto" => {
                        if let Some(active) = event.get("ativo").and_then(Value::as_bool) {
                            state.boss_live.auto_active = Some(active);
                            changed = true;
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game_headless::HeadlessState;

    fn fixture() -> HeadlessState {
        let mut state = HeadlessState::new(0, "Fixture".into());
        state.live = true;
        state.level = 100;
        state.inventory_known = true;
        state.inv_map.insert("70000".into(), json!(3));
        state.boss_live.auto_active = Some(false);
        state.bosses_jogaveis = vec![json!({
            "key": "test-boss",
            "name": "Test Boss",
            "minNivelTreinador": 70,
            "entrada": {"itemId":70000,"qtd":1,"nome":"Bronze Boss Token"},
            "drops":[{"itemId": 70021, "nome":"Fire Shiny Stone","qtd":[1,2],"chance":0.01}]
        })];
        state
    }

    fn confirm_preparation(runtime: &mut BossRuntime, state: &mut HeadlessState) {
        state.in_center = Some(false);
        assert_eq!(runtime.next_command(state), Some(json!({"t":"centro.ir"})));
        observe_headless_message(
            &json!({"t":"campo.init","data":{"slug":"centro","centro":true}}),
            state,
        );
        assert_eq!(runtime.next_command(state), Some(json!({"t":"centro.curar"})));
        observe_headless_message(&json!({"t":"batalha","ev":[{"k":"curado"}]}), state);
        runtime.observe(&json!({"t":"batalha","ev":[{"k":"curado"}]}), state);
        runtime.preparation_started = Some(Instant::now() - Duration::from_secs(3));
    }

    #[test]
    fn hunt_resumed_after_healing_requires_center_again_before_entry() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure_checked(true, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()), None, false).unwrap();
        confirm_preparation(&mut runtime, &mut state);
        state.in_center = Some(false);
        state.last_hunt_slug = "original_hunt".into();
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.ir"})));
        assert!(!runtime.settings.pending_entry);
    }

    #[test]
    fn explicit_center_refusal_restarts_preparation_without_replaying_entry() {
        let mut state = fixture();
        state.inv_map.insert("70000".into(), json!(1));
        let mut runtime = BossRuntime::default();
        runtime.configure(true, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()));
        assert!(runtime.next_command(&state).is_some());
        state.in_center = Some(false);
        let refused = json!({"t":"batalha","ev":[{"k":"aviso","msg":"vá ao Centro Pokemon antes de desafiar um boss"}]});
        assert!(runtime.observe(&refused, &state));
        assert!(!runtime.settings.pending_entry && !runtime.settings.uncertain);
        assert_eq!(runtime.next_command(&state), None);
        runtime.entry_retry_at = Some(Instant::now() - Duration::from_secs(1));
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.ir"})));
        assert!(!runtime.settings.pending_entry);
    }

    #[test]
    fn server_next_boss_wait_retries_only_after_explicit_refusal_and_deadline() {
        let mut state = fixture();
        state.inv_map.insert("70000".into(), json!(1));
        let mut runtime = BossRuntime::default();
        runtime.configure(true, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()));
        let enter = json!({"t":"boss.entrar","key":"test-boss"});
        assert_eq!(runtime.next_command(&state), Some(enter.clone()));
        let refused = json!({"t":"batalha","ev":[{"k":"aviso","msg":"boss.esperaProximo","params":{"s":6}}]});
        assert!(runtime.observe(&refused, &state));
        assert!(!runtime.settings.pending_entry && !runtime.settings.uncertain);
        assert!(runtime.settings.pending_stock.is_none());
        assert_eq!(runtime.settings.completed, 0);
        assert_eq!(state.inv_map["70000"], 1);
        assert_eq!(runtime.next_command(&state), None);
        assert!(!runtime.observe(&refused, &state), "duplicate notices cannot extend the wait");
        runtime.entry_retry_at = Some(Instant::now() - Duration::from_secs(1));
        assert_eq!(runtime.next_command(&state), Some(enter));
        assert_eq!(runtime.next_command(&state), None, "retry still requires confirmation");
        let accepted = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&accepted, &mut state);
        runtime.observe(&accepted, &state);
        assert_eq!(runtime.settings.completed, 1);
        assert!(!runtime.settings.pending_entry && !runtime.settings.uncertain);
        assert!(!runtime.observe(&refused, &state), "a notice cannot cancel a confirmed arena");
    }

    #[test]
    fn unknown_or_malformed_notice_never_releases_pending_entry() {
        for event in [
            json!({"k":"aviso","msg":"other.warning","params":{"s":6}}),
            json!({"k":"aviso","msg":"boss.esperaProximo"}),
            json!({"k":"aviso","msg":"boss.esperaProximo","params":{"s":-1}}),
            json!({"k":"aviso","msg":"boss.esperaProximo","params":{"s":99999999}}),
        ] {
            let mut state = fixture();
        state.inv_map.insert("70000".into(), json!(1));
            let mut runtime = BossRuntime::default();
            runtime.configure(true, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()));
            assert!(runtime.next_command(&state).is_some());
            runtime.observe(&json!({"t":"batalha","ev":[event]}), &state);
            assert!(runtime.settings.pending_entry && runtime.settings.pending_stock.is_some());
            assert_eq!(runtime.next_command(&state), None);
        }
    }

    #[test]
    fn disabled_auto_boss_does_not_retry_rejected_entry() {
        let mut state = fixture();
        state.inv_map.insert("70000".into(), json!(1));
        let mut runtime = BossRuntime::default();
        runtime.configure(true, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()));
        assert!(runtime.next_command(&state).is_some());
        runtime.settings.enabled = false;
        runtime.observe(&json!({"t":"batalha","ev":[{"k":"aviso","msg":"boss.esperaProximo","params":{"s":6}}]}), &state);
        runtime.entry_retry_at = Some(Instant::now() - Duration::from_secs(1));
        assert!(!runtime.settings.pending_entry);
        assert_eq!(runtime.next_command(&state), None);
    }

    #[test]
    fn repeated_boss_preparation_preserves_original_hunt() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.settings.return_hunt = Some("original_hunt".into());
        state.last_hunt_slug = "boss_test-boss".into();
        state.in_center = Some(true);
        runtime.settings.enabled = true;
        runtime.settings.owner = Some("Fixture".into());
        runtime.settings.boss_key = "test-boss".into();
        runtime.preparation = PreparationStep::AwaitLocation;
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.curar"})));
        assert_eq!(runtime.settings.return_hunt.as_deref(), Some("original_hunt"));
        runtime.settings.return_hunt = None;
        runtime.preparation = PreparationStep::AwaitLocation;
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.curar"})));
        assert_eq!(runtime.settings.return_hunt, None, "boss fields are never return hunts");
    }

    #[test]
    fn team_switch_uses_owned_pokemon_id_and_rejects_running_or_uncertain_boss() {
        let mut state = fixture();
        state.team = vec![crate::game_headless::PokemonTeamMember {
            id: Some(json!(12345)),
            slot: Some(1),
            sid: Some(25),
            ..Default::default()
        }];
        let mut settings = BossSettings::default();
        assert_eq!(
            team_selection_command(&state, &settings, &json!(12345)).unwrap(),
            json!({"t":"team.active","pokemonId":12345})
        );
        for invalid in [json!(25), json!(null), json!(true), json!("12345")] {
            assert!(team_selection_command(&state, &settings, &invalid).is_err());
        }
        settings.enabled = true;
        assert!(team_selection_command(&state, &settings, &json!(12345)).is_err());
        settings.enabled = false;
        settings.pending_entry = true;
        assert!(team_selection_command(&state, &settings, &json!(12345)).is_err());
        settings.pending_entry = false;
        settings.uncertain = true;
        assert!(team_selection_command(&state, &settings, &json!(12345)).is_err());
        settings.uncertain = false;
        state.boss_live.in_arena = true;
        assert!(team_selection_command(&state, &settings, &json!(12345)).is_err());
        state.boss_live.in_arena = false;
        state.live = false;
        assert!(team_selection_command(&state, &settings, &json!(12345)).is_err());
    }

    #[test]
    fn pokemon_profiles_are_saved_per_boss_and_bound_to_character() {
        let mut state = fixture();
        state.cid = "cid-a".into();
        state.team = [11, 22].into_iter().map(|id| crate::game_headless::PokemonTeamMember {
            id: Some(json!(id)), slot: Some(id), ..Default::default()
        }).collect();
        state.bosses_jogaveis.push(json!({"key":"second-boss"}));
        let mut runtime = BossRuntime::default();
        runtime.configure_pokemon_profile(&state, "test-boss", json!(11), json!(22)).unwrap();
        runtime.configure_pokemon_profile(&state, "second-boss", json!(11), json!(11)).unwrap();
        assert_eq!(runtime.settings.pokemon_profiles["test-boss"].fighter_id, json!(22));
        assert_eq!(runtime.settings.pokemon_profiles["second-boss"].fighter_id, json!(11));
        assert!(runtime.configure_pokemon_profile(&state, "test-boss", json!(11), json!(99)).is_err());
        let persisted = serde_json::to_string(&vec![runtime.settings.clone()]).unwrap();
        let reloaded = BossFleet::from_settings(serde_json::from_str(&persisted).unwrap());
        assert_eq!(reloaded.accounts[0].settings.pokemon_profiles.len(), 2);
        state.cid = "cid-b".into();
        runtime.configure_pokemon_profile(&state, "test-boss", json!(22), json!(22)).unwrap();
        assert_eq!(runtime.settings.pokemon_owner_id.as_deref(), Some("cid-b"));
        assert_eq!(runtime.settings.pokemon_profiles.len(), 1, "old character's profiles are not reused");
    }

    #[test]
    fn fighter_switch_waits_for_receipt_and_primary_returns_before_hunt() {
        let mut state = fixture();
        state.cid = "cid-a".into();
        state.in_center = Some(true);
        state.active_id = Some(json!(11));
        state.team = [11, 22].into_iter().map(|id| crate::game_headless::PokemonTeamMember {
            id: Some(json!(id)), slot: Some(id), ..Default::default()
        }).collect();
        let mut runtime = BossRuntime::default();
        runtime.configure_pokemon_profile(&state, "test-boss", json!(11), json!(22)).unwrap();
        runtime.configure_checked(true, "test-boss".into(), BossMode::Quantity, Some(1),
            Some(state.name.clone()), Some(state.cid.clone()), false).unwrap();
        runtime.settings.return_pokemon_id = Some(json!(11));
        runtime.settings.return_hunt = Some("enraged_typhlosion".into());
        runtime.preparation = PreparationStep::Ready;
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"team.active","pokemonId":22})));
        assert_eq!(runtime.next_command(&state), None, "do not enter before activeId confirms fighter");
        state.active_id = Some(json!(22));
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})));
        runtime.settings.pending_entry = false;
        runtime.settings.enabled = false;
        runtime.settings.return_pending = true;
        runtime.finished_battle = true;
        state.boss_live.in_arena = true;
        state.boss_live.boss_key = Some("test-boss".into());
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.sair"})));
        state.boss_live.in_arena = false;
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"team.active","pokemonId":11})));
        assert_eq!(runtime.next_command(&state), None, "hunt cannot resume before principal is confirmed");
        state.active_id = Some(json!(11));
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"hunt.select","slug":"enraged_typhlosion"})));
        assert_eq!(runtime.settings.return_pokemon_id, None);
    }

    #[test]
    fn principal_can_be_the_boss_fighter_without_a_redundant_switch() {
        let mut state = fixture();
        state.cid = "cid-a".into();
        state.in_center = Some(true);
        state.active_id = Some(json!(11));
        state.team = vec![crate::game_headless::PokemonTeamMember {
            id: Some(json!(11)), slot: Some(1), ..Default::default()
        }];
        let mut runtime = BossRuntime::default();
        runtime.configure_pokemon_profile(&state, "test-boss", json!(11), json!(11)).unwrap();
        runtime.configure_checked(true, "test-boss".into(), BossMode::Quantity, Some(1),
            Some(state.name.clone()), Some(state.cid.clone()), false).unwrap();
        runtime.settings.return_pokemon_id = Some(json!(11));
        runtime.preparation = PreparationStep::Ready;
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})));
        runtime.settings.pending_entry = false;
        runtime.settings.enabled = false;
        runtime.finished_battle = false;
        assert_eq!(runtime.next_command(&state), None);
        assert_eq!(runtime.settings.return_pokemon_id, None);
    }

    #[test]
    fn defeat_waits_for_exit_then_restores_primary_even_after_restart() {
        let mut state = fixture();
        state.cid = "cid-a".into();
        state.active_id = Some(json!(22));
        state.in_center = Some(false);
        state.team = [11, 22].into_iter().map(|id| crate::game_headless::PokemonTeamMember {
            id: Some(json!(id)), slot: Some(id), ..Default::default()
        }).collect();
        state.boss_live.in_arena = true;
        state.boss_live.boss_key = Some("test-boss".into());
        let mut runtime = BossRuntime::default();
        runtime.settings.owner_id = Some(state.cid.clone());
        runtime.settings.boss_key = "test-boss".into();
        runtime.settings.return_pokemon_id = Some(json!(11));
        let loss = json!({"t":"batalha","ev":[{"k":"bossPerdeu","key":"test-boss"}]});
        observe_headless_message(&loss, &mut state);
        runtime.observe(&loss, &state);
        assert_eq!(runtime.next_command(&state), None, "do not switch while defeat exit is unconfirmed");
        let exit = json!({"t":"batalha","ev":[{"k":"bossSaiu","key":"test-boss"}]});
        observe_headless_message(&exit, &mut state);
        runtime.observe(&exit, &state);
        let saved = serde_json::to_string(&vec![runtime.settings.clone()]).unwrap();
        let mut restarted = BossFleet::from_settings(serde_json::from_str(&saved).unwrap());
        assert_eq!(restarted.accounts[0].next_command(&state),
            Some(json!({"t":"team.active","pokemonId":11})));
        state.active_id = Some(json!(11));
        assert_eq!(restarted.accounts[0].next_command(&state), None);
        assert_eq!(restarted.accounts[0].settings.return_pokemon_id, None);
    }

    #[test]
    fn stopped_all_mode_exits_finished_arena_before_restoring_primary() {
        let mut state = fixture();
        state.cid = "cid-a".into();
        state.active_id = Some(json!(22));
        state.team = [11, 22].into_iter().map(|id| crate::game_headless::PokemonTeamMember {
            id: Some(json!(id)), slot: Some(id), ..Default::default()
        }).collect();
        state.boss_live.in_arena = true;
        state.boss_live.boss_key = Some("test-boss".into());
        let mut runtime = BossRuntime::default();
        runtime.settings.mode = BossMode::All;
        runtime.settings.boss_key = "test-boss".into();
        runtime.settings.owner_id = Some(state.cid.clone());
        runtime.settings.return_pokemon_id = Some(json!(11));
        runtime.finished_battle = true;
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.sair"})));
        assert_eq!(runtime.next_command(&state), None, "wait for server arena exit");
        state.boss_live.in_arena = false;
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"team.active","pokemonId":11})));
    }

    #[test]
    fn battle_duration_stops_at_result_and_legacy_history_still_loads() {
        let mut state = fixture();
        let enter = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"suicune"}]});
        observe_headless_message(&enter, &mut state);
        assert!(state.boss_live.started_at_ms.is_some());
        state.boss_live.started_at_ms = Some(battle_clock_ms() - 12_000);
        observe_headless_message(&enter, &mut state);
        observe_headless_message(&json!({"t":"batalha","ev":[{"k":"bossMorto","key":"suicune"}]}), &mut state);
        let record = state.boss_history_pending.last().unwrap();
        assert!(record.duration_ms.unwrap() >= 12_000);
        assert_eq!(record.duration_ms, state.boss_live.duration_ms);
        let mut legacy = serde_json::to_value(record).unwrap();
        legacy.as_object_mut().unwrap().remove("durationMs");
        assert!(serde_json::from_value::<BossHistoryRecord>(legacy).unwrap().duration_ms.is_none());
    }

    #[test]
    fn catalog_and_prices_are_authoritative() {
        let welcome = json!({"t":"welcome","data":{"bossesJogaveis":[{
            "key":"test-boss","entrada":{"itemId":70000,"qtd":2},
            "drops":[{"itemId":70021,"chance":0.01}]
        }]}});
        let catalog = catalog_from_welcome(&welcome).unwrap();
        let boss = boss_catalog_entry(&catalog, "test-boss").unwrap();
        assert_eq!(boss_cost(boss), Some(("70000".into(), 2)));
        assert_eq!(boss["drops"][0]["itemId"], 70021);
        assert!(boss_catalog_entry(&catalog, "nonexistent").is_none());
        assert_eq!(boss_cost(&json!({"key":"incomplete"})), None);
        assert!(is_valid_config(BossMode::All, None));
        assert!(!is_valid_config(BossMode::Quantity, None));
        assert!(!is_valid_config(BossMode::Quantity, Some(0)));
        let mut state = fixture();
        state.bosses_jogaveis.clear();
        assert!(observe_headless_message(
            &json!({
                "t":"welcome","data":{
                    "bossesCatalogo":[{"key":"locked-boss","drops":["TM Disk Piece"]}],
                    "estado":{"bossesJogaveis":catalog}
                }
            }),
            &mut state
        ));
        assert_eq!(state.bosses_jogaveis[0]["key"], "test-boss");
        assert_eq!(state.bosses_jogaveis[0]["entrada"]["qtd"], 2);
        assert_eq!(state.bosses_catalogo[0]["drops"][0], "TM Disk Piece");
        assert_eq!(serde_json::to_value(&state).unwrap()["bossesCatalogo"][0]["key"], "locked-boss");
    }

    #[test]
    fn malformed_explicit_boss_fee_never_falls_back_to_one_token() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure(
            true,
            "test-boss".into(),
            BossMode::Quantity,
            Some(1),
            Some("Fixture".into()),
        );
        for bad in [
            json!(0),
            json!(-1),
            json!(1.5),
            json!(true),
            json!("invalid"),
            json!([]),
        ] {
            state.bosses_jogaveis[0]["entrada"]["qtd"] = bad;
            assert_eq!(boss_cost(&state.bosses_jogaveis[0]), None);
            assert_eq!(
                runtime.next_command(&state),
                None,
                "never enter with an unverified explicit token cost"
            );
            assert!(!runtime.settings.pending_entry);
        }
        state.bosses_jogaveis[0]["entrada"]["qtd"] = json!("2");
        assert_eq!(
            boss_cost(&state.bosses_jogaveis[0]),
            Some(("70000".into(), 2))
        );
        assert_eq!(
            boss_cost(&json!({"entrada":{"itemId":70000},"item_cost":2})),
            Some(("70000".into(), 2)),
            "legacy fee agrees with the UI"
        );
        assert_eq!(
            boss_cost(&json!({"entrada":{"itemId":70000}})),
            Some(("70000".into(), 1)),
            "omitted fee retains the established default"
        );
        assert_eq!(boss_cost(&json!({"entrada":{"itemId":"","qtd":1}})), None);
    }

    #[test]
    fn selected_boss_preview_cannot_overwrite_a_different_live_arena() {
        let mut state = fixture();
        let settings = BossSettings {
            enabled: true,
            boss_key: "test-boss".into(),
            ..Default::default()
        };
        apply_runtime_state(&mut state, &settings);
        assert_eq!(state.boss_live.boss_key.as_deref(), Some("test-boss"));
        assert_eq!(state.boss_live.boss_name.as_deref(), Some("Test Boss"));
        assert_eq!(state.boss_live.token_balance, Some(3));
        state.boss_live.in_arena = true;
        state.boss_live.boss_key = Some("other-boss".into());
        state.boss_live.boss_name = Some("Existing Arena".into());
        apply_runtime_state(&mut state, &settings);
        assert_eq!(state.boss_live.boss_key.as_deref(), Some("other-boss"));
        assert_eq!(state.boss_live.boss_name.as_deref(), Some("Existing Arena"));
    }

    #[test]
    fn pending_returns_survive_restart_and_stay_bound_to_each_account() {
        let mut saved = Vec::new();
        for index in 0..4 {
            saved.push(BossSettings {
                owner: Some(format!("player-{index}")),
                return_hunt: Some(format!("hunt-{index}")),
                return_pending: true,
                ..Default::default()
            });
        }
        let encoded = serde_json::to_string(&saved).unwrap();
        let mut fleet = BossFleet::from_settings(serde_json::from_str(&encoded).unwrap());
        for index in 0..4 {
            let mut state = fixture();
            state.name = format!("player-{index}");
            state.in_center = Some(true);
            assert_eq!(fleet.accounts[index].next_command(&state), Some(json!({"t":"hunt.select","slug":format!("hunt-{index}")})));
            state.name = "different-player".into();
            fleet.accounts[index].last_return_attempt = None;
            assert_eq!(fleet.accounts[index].next_command(&state), None);
        }
    }

    #[test]
    fn reconnect_in_center_recovers_a_finished_job_return() {
        let mut state = fixture();
        state.in_center = Some(true);
        state.boss_live.in_arena = false;
        let mut runtime = BossRuntime::default();
        runtime.settings.owner = Some("Fixture".into());
        runtime.settings.completed = 1;
        runtime.settings.return_hunt = Some("enraged_typhlosion".into());
        assert!(runtime.sync_handshake(&state));
        assert!(runtime.settings.return_pending);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"hunt.select","slug":"enraged_typhlosion"})));
    }

    #[test]
    fn completed_job_returns_only_its_previous_hunt_after_center_receipt() {
        let mut state = fixture();
        state.in_center = Some(false);
        state.last_hunt_slug = "enraged_typhlosion".into();
        let mut runtime = BossRuntime::default();
        runtime.configure_checked(true, "test-boss".into(), BossMode::Quantity, Some(1), Some("Fixture".into()), None, false).unwrap();
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.ir"})));
        assert_eq!(runtime.settings.return_hunt.as_deref(), Some("enraged_typhlosion"));
        let center = json!({"t":"campo.init","slug":"centro","centro":true});
        observe_headless_message(&center, &mut state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.curar"})));
        let cure = json!({"t":"batalha","ev":[{"k":"curado"}]});
        runtime.observe(&cure, &state);
        runtime.preparation_started = Some(Instant::now() - Duration::from_secs(3));
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})));
        let entered = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&entered, &mut state);
        runtime.observe(&entered, &state);
        assert!(!runtime.settings.enabled);
        assert_eq!(runtime.next_command(&state), None, "never leave during the battle");
        let victory = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss","drops":[]}]});
        observe_headless_message(&victory, &mut state);
        runtime.observe(&victory, &state);
        observe_headless_message(&center, &mut state);
        runtime.observe(&center, &state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"hunt.select","slug":"enraged_typhlosion"})));
        assert_eq!(runtime.next_command(&state), None, "throttle until the server responds");
        state.in_center = Some(false);
        state.hunt = "other_hunt".into();
        runtime.observe(&json!({"t":"estado"}), &state);
        assert!(runtime.settings.return_pending, "a different hunt is not a confirmation");
        state.hunt = "enraged_typhlosion".into();
        runtime.observe(&json!({"t":"estado"}), &state);
        assert!(!runtime.settings.return_pending);
        assert_eq!(runtime.next_command(&state), None);
    }

    #[test]
    fn arena_snapshot_confirms_pending_once_even_if_entry_event_follows() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure(true, "test-boss".into(), BossMode::Quantity, Some(1), Some("Fixture".into()));
        assert!(runtime.next_command(&state).is_some());
        let other = json!({"t":"estado","boss":{"arena":{"key":"other-boss"}}});
        observe_headless_message(&other, &mut state);
        runtime.observe(&other, &state);
        assert!(runtime.settings.pending_entry);
        assert_eq!(runtime.settings.completed, 0);
        let snapshot = json!({"t":"estado","boss":{"arena":{"key":"test-boss"}}});
        observe_headless_message(&snapshot, &mut state);
        assert!(runtime.observe(&snapshot, &state));
        assert_eq!(runtime.settings.completed, 1);
        assert!(!runtime.settings.pending_entry);
        assert!(!runtime.settings.enabled);
        let receipt = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&receipt, &mut state);
        runtime.observe(&receipt, &state);
        assert_eq!(runtime.settings.completed, 1);
        assert_eq!(runtime.next_command(&state), None);
    }

    #[test]
    fn quantity_mode_uses_distinct_confirmed_entries_and_stock_updates() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure(
            true,
            "test-boss".into(),
            BossMode::Quantity,
            Some(2),
            Some("Fixture".into()),
        );
        let enter = json!({"t":"boss.entrar","key":"test-boss"});
        assert_eq!(runtime.next_command(&state), Some(enter.clone()));
        assert!(runtime.settings.pending_entry);
        assert_eq!(
            runtime.next_command(&state),
            None,
            "no second send without server confirmation"
        );

        let receipt = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss","nome":"Test Boss","slot":1}]});
        observe_headless_message(&receipt, &mut state);
        assert!(runtime.observe(&receipt, &state));
        assert_eq!(runtime.settings.completed, 1);
        assert_eq!(
            runtime.next_command(&state),
            None,
            "never enter while fighting"
        );

        let victory = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss","nome":"Test Boss","drops":[{"itemId":70021,"qtd":2,"nome":"Fire Shiny Stone"}]}]});
        observe_headless_message(&victory, &mut state);
        runtime.observe(&victory, &state);
        assert_eq!(state.boss_drops.len(), 1);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.sair"})));
        assert_eq!(runtime.next_command(&state), None);
        let out = json!({"t":"estado","boss":{"arena":null,"auto":false},"items":{"70000":2}});
        observe_headless_message(&out, &mut state);
        state.inv_map.insert("70000".into(), json!(2));
        runtime.observe(&out, &state);
        assert_eq!(runtime.next_command(&state), Some(enter));
        observe_headless_message(&receipt, &mut state);
        assert!(runtime.observe(&receipt, &state));
        assert_eq!(runtime.settings.completed, 2);
        assert!(!runtime.settings.enabled);
        assert_eq!(
            runtime.next_command(&state),
            None,
            "reached exact configured count"
        );
        let finished = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss"}]});
        observe_headless_message(&finished, &mut state);
        runtime.observe(&finished, &state);
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.sair"})),
            "leave the final arena once the configured number of entries is complete"
        );
        assert_eq!(runtime.next_command(&state), None);
    }

    #[test]
    fn unconfirmed_entry_becomes_uncertain_even_after_disabling() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure_checked(true, "test-boss".into(), BossMode::Quantity, Some(1), Some("Fixture".into()), None, false).unwrap();
        confirm_preparation(&mut runtime, &mut state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})));
        runtime.configure_checked(false, "test-boss".into(), BossMode::Quantity, Some(1), Some("Fixture".into()), None, false).unwrap();
        runtime.entry_sent_at = Some(Instant::now() - Duration::from_secs(31));
        assert_eq!(runtime.next_command(&state), None);
        assert!(runtime.settings.pending_entry && runtime.settings.uncertain);
        assert_eq!(runtime.next_command(&state), None);
    }

    #[test]
    fn center_retry_requires_server_unlock_and_is_throttled() {
        let mut state = fixture(); state.in_center = Some(false);
        let mut runtime = BossRuntime::default();
        runtime.configure_checked(true, "test-boss".into(), BossMode::Quantity, Some(1), Some("Fixture".into()), None, false).unwrap();
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.ir"})));
        assert_eq!(runtime.center_when_server_unlocked(&json!({"t":"estado","centroLivreEm":1001,"servidorAgora":1000}), &state), None);
        let unlocked = json!({"t":"estado","centroLivreEm":1000,"servidorAgora":1001});
        assert_eq!(runtime.center_when_server_unlocked(&unlocked, &state), Some(json!({"t":"centro.ir"})));
        assert_eq!(runtime.center_when_server_unlocked(&unlocked, &state), None);
    }

    #[test]
    fn already_healed_joy_confirms_preparation_in_center() {
        let mut state = fixture();
        state.in_center = Some(true);
        let mut runtime = BossRuntime::default();
        runtime.configure_checked(true, "test-boss".into(), BossMode::Quantity, Some(1), Some("Fixture".into()), None, false).unwrap();
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.curar"})));
        assert!(!runtime.observe(&json!({"t":"batalha","ev":[{"k":"joy","fala":"outra"}]}), &state));
        assert!(runtime.observe(&json!({"t":"batalha","ev":[{"k":"joy","fala":"jaCurado"}]}), &state));
        assert_eq!(runtime.preparation, PreparationStep::Ready);
        assert_eq!(runtime.next_command(&state), None);
        runtime.preparation_started = Some(Instant::now() - Duration::from_secs(3));
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})));
        assert_eq!(runtime.next_command(&state), None);
    }

    #[test]
    fn preparation_timeout_preserves_battle_warning_from_server() {
        let mut state = fixture();
        state.in_center = Some(false);
        let mut runtime = BossRuntime::default();
        runtime.configure_checked(true, "test-boss".into(), BossMode::Quantity, Some(1), Some("Fixture".into()), None, false).unwrap();
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.ir"})));
        let notice = json!({"t":"batalha","ev":[{"k":"aviso","msg":"em combate — espere 2.9s sem tomar nem dar dano"}]});
        assert!(runtime.observe(&notice, &state));
        runtime.preparation_started = Some(Instant::now() - Duration::from_secs(31));
        assert_eq!(runtime.next_command(&state), None);
        assert!(runtime.last_error.as_deref().unwrap().contains("em combate"));
    }

    #[test]
    fn configured_quantity_job_waits_for_center_and_cure_receipts() {
        let mut state = fixture();
        state.in_center = Some(false);
        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked(
                true,
                "test-boss".into(),
                BossMode::Quantity,
                Some(1),
                Some("Fixture".into()),
                None,
                false,
            )
            .unwrap();

        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.ir"})));
        assert_eq!(
            runtime.next_command(&state),
            None,
            "wait for the server's center confirmation"
        );

        let center = json!({"t":"campo.init","slug":"centro","centro":true});
        observe_headless_message(&center, &mut state);
        runtime.observe(&center, &state);
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"centro.curar"}))
        );
        assert_eq!(
            runtime.next_command(&state),
            None,
            "never issue duplicate cure requests"
        );

        let cured = json!({"t":"batalha","ev":[{"k":"curado"},{"k":"joy"}]});
        observe_headless_message(&cured, &mut state);
        assert!(runtime.observe(&cured, &state));
        assert_eq!(runtime.next_command(&state), None, "wait for the combat lock after curing");
        runtime.preparation_started = Some(Instant::now() - Duration::from_secs(3));
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.entrar","key":"test-boss"}))
        );
        assert_eq!(
            runtime.next_command(&state),
            None,
            "persist pending entry; do not duplicate it"
        );
    }

    #[test]
    fn victory_result_distinguishes_missing_empty_and_reported_rewards() {
        let mut state = fixture();
        let entered =
            json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss","nome":"Test Boss"}]});
        observe_headless_message(&entered, &mut state);
        let missing = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss"}]});
        observe_headless_message(&missing, &mut state);
        assert_eq!(state.boss_live.last_battle_drops, None);

        let entered =
            json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss","nome":"Test Boss"}]});
        observe_headless_message(&entered, &mut state);
        let empty = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss","drops":[]}]});
        observe_headless_message(&empty, &mut state);
        assert_eq!(state.boss_live.last_battle_drops, Some(vec![]));

        let entered =
            json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss","nome":"Test Boss"}]});
        observe_headless_message(&entered, &mut state);
        let reward = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss","nome":"Test Boss","drops":[{"itemId":70021,"qtd":2,"nome":"Fire Shiny Stone"}]}]});
        observe_headless_message(&reward, &mut state);
        let drops = state.boss_live.last_battle_drops.as_ref().unwrap();
        assert_eq!(drops.len(), 1);
        assert_eq!(
            (drops[0].id.as_str(), drops[0].name.as_str(), drops[0].qty),
            ("70021", "Fire Shiny Stone", 2)
        );

        observe_headless_message(&entered, &mut state);
        let named = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss","drops":[{"nome":"Unknown Reward A","qtd":2},{"nome":"Unknown Reward B","qtd":1}]}]});
        observe_headless_message(&named, &mut state);
        let drops = state.boss_live.last_battle_drops.as_ref().unwrap();
        assert_eq!((drops[0].name.as_str(), drops[0].qty), ("Unknown Reward A", 2));
        assert_eq!((drops[1].name.as_str(), drops[1].qty), ("Unknown Reward B", 1));
        assert_eq!(state.boss_drops.iter().filter(|d| d.id.is_empty()).count(), 2);

        let entered = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&entered, &mut state);
        let malformed = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss","drops":[{"unexpected":true}]}]});
        observe_headless_message(&malformed, &mut state);
        assert_eq!(
            state.boss_live.last_battle_drops, None,
            "unrecognized loot entries must remain unknown, not imply no rewards"
        );
    }

    #[test]
    fn history_queues_every_distinct_battle_even_in_one_packet() {
        let mut state = fixture();
        state.cid = "trainer-1".into();
        let packet = json!({"t":"batalha","ev":[
            {"k":"bossEntrou","key":"suicune","nome":"Suicune"},
            {"k":"bossMorto","key":"suicune","drops":[]},
            {"k":"bossSaiu"},
            {"k":"bossEntrou","key":"zapdos","nome":"Zapdos"},
            {"k":"bossPerdeu","key":"zapdos","nome":"Zapdos","drops":[]}
        ]});
        observe_headless_message(&packet, &mut state);
        assert_eq!(state.boss_history_pending.len(), 2);
        assert_eq!(state.boss_history_pending[0].boss_key, "suicune");
        assert_eq!(state.boss_history_pending[0].result, "victory");
        assert_eq!(state.boss_history_pending[0].drops, Some(vec![]));
        assert_eq!(state.boss_history_pending[1].boss_key, "zapdos");
        assert_eq!(state.boss_history_pending[1].result, "defeat");
        assert_eq!(state.boss_history_pending[1].account_id, "trainer-1");
        observe_headless_message(&json!({"t":"batalha","ev":[{"k":"bossPerdeu"}]}), &mut state);
        assert_eq!(state.boss_history_pending.len(), 2, "repeated terminal receipt is ignored");
    }

    #[test]
    fn history_file_preserves_zero_drop_wins_across_reads() {
        let mut state = fixture();
        state.cid = "cid-history-test".into();
        state.boss_live.boss_key = Some("suicune".into());
        state.boss_live.boss_name = Some("Suicune".into());
        state.boss_live.last_battle_drops = Some(vec![]);
        let path = std::env::temp_dir().join(format!("pio-boss-history-{}.jsonl",
            BossHistoryRecord::from_state(&state, "victory").id.replace(':', "-")));
        let rows = (0..401).map(|_| BossHistoryRecord::from_state(&state, "victory")).collect::<Vec<_>>();
        append_history_at(&path, &rows).unwrap();
        append_history_at(&path, &rows[..1]).unwrap(); // A retry after an uncertain flush must not duplicate the view.
        let reloaded = read_history_at(&path, 0, "cid-history-test").unwrap();
        assert_eq!(reloaded.len(), 401);
        assert!(reloaded.iter().all(|row| row.drops == Some(vec![])));
        assert!(read_history_at(&path, 0, "another-account").unwrap().is_empty());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn confirmed_return_to_center_clears_arena_and_preserves_battle_result() {
        let mut state = fixture();
        let victory = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss","drops":[]}]});
        observe_headless_message(&victory, &mut state);
        let center = json!({"t":"campo.init","slug":"centro","centro":true});
        assert!(observe_headless_message(&center, &mut state));
        assert_eq!(state.in_center, Some(true));
        assert!(!state.boss_live.in_arena);
        assert_eq!(state.boss_live.status, "victory");
        assert_eq!(state.boss_live.last_battle_drops, Some(vec![]));
    }

    #[test]
    fn uncertain_entry_survives_reconnect_without_duplicate_request() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure(
            true,
            "test-boss".into(),
            BossMode::Quantity,
            Some(3),
            Some("Fixture".into()),
        );
        assert!(runtime.next_command(&state).is_some());
        assert!(runtime.observe(&json!({"t":"disconnected"}), &state));
        assert!(runtime.settings.uncertain);
        assert!(runtime.settings.pending_entry);
        state.boss_live.in_arena = false;
        assert!(runtime.sync_handshake(&state));
        assert_eq!(runtime.next_command(&state), None);
        let serialized = serde_json::to_string(&runtime.settings).unwrap();
        let recovered: BossSettings = serde_json::from_str(&serialized).unwrap();
        assert!(recovered.uncertain && recovered.pending_entry);
        assert_eq!(recovered.completed, 0);
    }

    #[test]
    fn new_raid_reservation_stops_native_batch_during_the_current_fight() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure(true, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()));
        state.boss_live.in_arena = true;
        state.boss_live.boss_key = Some("test-boss".into());
        state.boss_live.auto_active = Some(true);
        state.boss_live.auto_key = Some("test-boss".into());
        runtime.server_loop_started = true;
        assert_eq!(runtime.next_command_with_raid_reservation(&state, true), Some(json!({"t":"boss.auto","ativo":false})));
        assert!(runtime.settings.enabled);
        assert!(state.boss_live.in_arena, "stopping repetition does not leave the active fight");
    }

    #[test]
    fn infinite_native_batch_runs_to_empty_then_rearms_for_new_tokens() {
        let mut state = fixture();
        state.in_center = Some(true);
        let mut runtime = BossRuntime::default();
        runtime.configure(true, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()));
        runtime.settings.return_hunt = Some("original_hunt".into());
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.auto","ativo":true,"key":"test-boss"})));
        assert_eq!(runtime.next_command(&state), None);
        let auto_on = json!({"t":"estado","boss":{"auto":true,"autoKey":"test-boss","arena":null}});
        observe_headless_message(&auto_on, &mut state);
        runtime.observe(&auto_on, &state);
        assert_eq!(runtime.next_command(&state), None, "native auto starts the first fight itself");
        let entered = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss","auto":true}]});
        let victory = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss"}]});
        for remaining in (0..3).rev() {
            observe_headless_message(&entered, &mut state);
            runtime.observe(&entered, &state);
            runtime.observe(&entered, &state);
            state.inv_map.insert("70000".into(), json!(remaining));
            runtime.observe(&json!({"t":"estado","items":{"70000":remaining}}), &state);
            observe_headless_message(&victory, &mut state);
            runtime.observe(&victory, &state);
            if remaining > 0 {
                assert_eq!(runtime.next_command(&state), None, "server owns the next fight, even with one token left");
            }
        }
        assert_eq!(runtime.settings.completed, 3, "duplicate entry receipts do not count twice");
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.auto","ativo":false})));
        let stopped = json!({"t":"estado","boss":{"auto":false,"arena":null},"items":{"70000":0}});
        observe_headless_message(&stopped, &mut state);
        runtime.observe(&stopped, &state);
        assert!(runtime.settings.enabled, "infinite remains armed after the native batch");
        state.hunt = "centro".into();
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"hunt.select","slug":"original_hunt"})));
        state.inv_map.insert("70000".into(), json!(2));
        runtime.preparation = PreparationStep::Ready;
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.auto","ativo":true,"key":"test-boss"})), "new batch rearms native auto");
    }

    #[test]
    fn infinite_native_batch_stops_on_off_and_respects_reservation_and_distribution() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure(true, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()));
        assert_eq!(runtime.next_command_with_raid_reservation(&state, true), Some(json!({"t":"boss.entrar","key":"test-boss"})), "raid reserve requires individual entries");
        runtime.configure_with_plan(true, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()), Some(vec![BossAllocation { boss_key: "test-boss".into(), percent: 100 }]), None);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})), "distribution remains individually scheduled");
        runtime.configure(true, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()));
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.auto","ativo":true,"key":"test-boss"})));
        runtime.configure_checked(false, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()), None, false).unwrap();
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.auto","ativo":false})), "OFF cancels even an unacknowledged native ON");
        state.inv_map.insert("70000".into(), json!(1));
        runtime.configure(true, "test-boss".into(), BossMode::Infinite, None, Some("Fixture".into()));
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})), "one token uses manual entry");
    }

    #[test]
    fn all_mode_enables_server_loop_once_and_stops_only_when_requested() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure(
            true,
            "test-boss".into(),
            BossMode::All,
            None,
            Some("Fixture".into()),
        );
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.auto","ativo":true,"key":"test-boss"}))
        );
        assert_eq!(
            runtime.next_command(&state),
            None,
            "await auto acknowledgment"
        );
        let enabled = json!({"t":"estado","boss":{"auto":true,"autoKey":"test-boss","arena":null}});
        observe_headless_message(&enabled, &mut state);
        runtime.observe(&enabled, &state);
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.entrar","key":"test-boss"}))
        );
        let entered = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&entered, &mut state);
        runtime.observe(&entered, &state);
        assert_eq!(runtime.settings.completed, 1);
        assert_eq!(
            runtime.next_command(&state),
            None,
            "the server now manages subsequent entries"
        );
        runtime.configure(
            false,
            "test-boss".into(),
            BossMode::All,
            None,
            Some("Fixture".into()),
        );
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.auto","ativo":false}))
        );
        assert_eq!(runtime.next_command(&state), None);
        let disabled = json!({"t":"estado","boss":{"auto":false}});
        observe_headless_message(&disabled, &mut state);
        runtime.observe(&disabled, &state);
        assert!(!runtime.settings.stop_requested);
        assert_eq!(runtime.next_command(&state), None);
    }

    #[test]
    fn center_wait_survives_timeout_and_off_on_restarts_safely() {
        let mut state = fixture();
        state.cid = "cid-1".into();
        state.in_center = Some(false);
        let mut runtime = BossRuntime::default();
        runtime.configure_checked(
            true,
            "test-boss".into(),
            BossMode::Quantity,
            Some(1),
            Some("Fixture".into()),
            Some("cid-1".into()),
            false,
        ).unwrap();
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.ir"})));
        runtime.preparation_started = Some(Instant::now() - Duration::from_secs(31));
        assert_eq!(runtime.next_command(&state), None);
        assert_eq!(runtime.preparation, PreparationStep::AwaitCenter);
        let unlocked = json!({"t":"estado","centroLivreEm":1000,"servidorAgora":1001});
        assert_eq!(runtime.center_when_server_unlocked(&unlocked, &state), Some(json!({"t":"centro.ir"})));
        runtime.configure_checked(false, String::new(), BossMode::All, None, None, None, false).unwrap();
        runtime.configure_checked(true, "test-boss".into(), BossMode::Quantity, Some(1), Some("Fixture".into()), Some("cid-1".into()), false).unwrap();
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.ir"})));
    }

    #[test]
    fn disabled_unowned_automation_does_not_modify_user_server_auto() {
        let mut state = fixture();
        state.boss_live.auto_active = Some(true);
        let mut runtime = BossRuntime::default();
        assert_eq!(runtime.next_command(&state), None);
        runtime.configure(
            true,
            "test-boss".into(),
            BossMode::Quantity,
            Some(1),
            Some("Other".into()),
        );
        assert_eq!(
            runtime.next_command(&state),
            None,
            "wrong character identity"
        );
    }

    #[test]
    fn weekly_raid_reserves_last_bronze_token_and_uses_manual_all_mode() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure(
            true,
            "test-boss".into(),
            BossMode::All,
            None,
            Some("Fixture".into()),
        );
        let entry = json!({"t":"boss.entrar","key":"test-boss"});
        // When weekly raid registration awaits a token, do not activate
        // the server's unbounded boss.auto loop.
        assert_eq!(
            runtime.next_command_with_raid_reservation(&state, true),
            Some(entry.clone())
        );
        let joined = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&joined, &mut state);
        runtime.observe(&joined, &state);
        assert_eq!(runtime.settings.completed, 1);
        let kill = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss"}]});
        observe_headless_message(&kill, &mut state);
        runtime.observe(&kill, &state);
        assert_eq!(
            runtime.next_command_with_raid_reservation(&state, true),
            Some(json!({"t":"boss.sair"}))
        );
        assert_eq!(
            runtime.next_command_with_raid_reservation(&state, true),
            None
        );
        let back = json!({"t":"estado","boss":{"arena":null,"auto":false},
            "items":{"70000":2}});
        observe_headless_message(&back, &mut state);
        state.inv_map.insert("70000".into(), json!(2));
        runtime.observe(&back, &state);
        assert_eq!(
            runtime.next_command_with_raid_reservation(&state, true),
            Some(entry)
        );
        observe_headless_message(&joined, &mut state);
        runtime.observe(&joined, &state);
        assert_eq!(runtime.settings.completed, 2);
        observe_headless_message(&kill, &mut state);
        runtime.observe(&kill, &state);
        assert_eq!(
            runtime.next_command_with_raid_reservation(&state, true),
            Some(json!({"t":"boss.sair"}))
        );
        let last = json!({"t":"estado","boss":{"arena":null,"auto":false},
            "items":{"70000":1}});
        observe_headless_message(&last, &mut state);
        state.inv_map.insert("70000".into(), json!(1));
        runtime.observe(&last, &state);
        assert_eq!(
            runtime.next_command_with_raid_reservation(&state, true),
            None,
            "last Bronze Token must remain available for raid.inscrever"
        );
        assert!(
            runtime.settings.enabled,
            "configuration waits for raid registration rather than losing the request"
        );
        // After a confirmed weekly inscription, the last token is free to spend.
        assert_eq!(
            runtime.next_command_with_raid_reservation(&state, false),
            Some(json!({"t":"boss.auto","ativo":true,"key":"test-boss"}))
        );
    }

    #[test]
    fn weekly_raid_reservation_stops_preexisting_server_auto() {
        let mut state = fixture();
        state.boss_live.auto_active = Some(true);
        state.boss_live.auto_key = Some("test-boss".into());
        state.inv_map.insert("70000".into(), json!(1));
        let mut runtime = BossRuntime::default();
        runtime.configure(
            true,
            "test-boss".into(),
            BossMode::All,
            None,
            Some("Fixture".into()),
        );
        assert_eq!(
            runtime.next_command_with_raid_reservation(&state, true),
            Some(json!({"t":"boss.auto","ativo":false}))
        );
        assert_eq!(
            runtime.next_command_with_raid_reservation(&state, true),
            None,
            "wait for server to confirm the auto switch"
        );
    }

    #[test]
    fn boss_live_hp_attacks_and_drops_are_server_sourced_and_cumulative() {
        let mut state = fixture();
        let entered = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss","nome":"Test Boss","slot":7}]});
        assert!(observe_headless_message(&entered, &mut state));
        let field = json!({"t":"campo","mobs":[
            {"s":6,"hp":999,"mhp":999},
            {"s":7,"hp":300,"mhp":600,"n":"Test Boss"}
        ]});
        assert!(observe_headless_message(&field, &mut state));
        assert_eq!(state.boss_live.current_hp, Some(300));
        assert_eq!(state.boss_live.hp_percent, Some(50.0));
        let attacks = json!({"t":"batalha","ev":[
            {"k":"ataque","por":"boss"},
            {"k":"ataque","por":"jogador"}
        ]});
        assert!(observe_headless_message(&attacks, &mut state));
        assert_eq!(state.boss_live.turn, Some(1));
        let non_boss = json!({"t":"batalha","ev":[{"k":"morte","quem":"selvagem","drops":[{"itemId":70021,"qtd":7}]}]});
        observe_headless_message(&non_boss, &mut state);
        assert!(
            state.boss_drops.is_empty(),
            "wild loot must not become boss loot"
        );
        let victory = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss","nome":"Test Boss",
            "drops":[{"itemId":70021,"qtd":2,"nome":"Fire Shiny Stone"}]}]});
        observe_headless_message(&victory, &mut state);
        observe_headless_message(&victory, &mut state);
        assert_eq!(state.boss_drops.len(), 1);
        assert_eq!(
            state.boss_drops[0].qty, 2,
            "replayed bossMorto is not another reward"
        );
        assert_eq!(state.boss_live.session_victories, 1);
        observe_headless_message(
            &json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]}),
            &mut state,
        );
        observe_headless_message(&victory, &mut state);
        assert_eq!(state.boss_drops[0].qty, 4, "distinct new battle is counted");
        assert_eq!(state.boss_live.session_victories, 2);
        assert_eq!(state.boss_live.winner.as_deref(), Some("victory"));
        let ui = serde_json::to_value(&state).unwrap();
        assert_eq!(ui["bossLive"]["currentHp"], 0);
        assert_eq!(
            ui["bossLive"]["turn"], 0,
            "new arena starts a new attack counter"
        );
        assert_eq!(ui["bossDrops"][0]["bossKey"], "test-boss");
    }

    #[test]
    fn key_only_arena_recovers_suicune_hp_from_field() {
        let mut state = fixture();
        observe_headless_message(&json!({"t":"campo.init","slug":"boss_suicune","mobs":[{"s":1,"mhp":65000}]}), &mut state);
        observe_headless_message(&json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"suicune"}]}), &mut state);
        observe_headless_message(&json!({"t":"estado","estado":{"boss":{"arena":{"key":"suicune","slot":1}}}}), &mut state);
        assert_eq!(state.boss_live.current_hp, Some(65000));
        observe_headless_message(&json!({"t":"campo","mobs":[{"s":1,"hp":32123.8}]}), &mut state);
        assert_eq!(state.boss_live.current_hp, Some(32124));
        observe_headless_message(&json!({"t":"campo","fora":[1]}), &mut state);
        assert_eq!(state.boss_live.current_hp, None);
    }

    #[test]
    fn boss_hp_survives_field_before_arena_and_partial_updates() {
        let mut state = fixture();
        let initial = json!({"t":"campo.init","mobs":[
            {"s":6,"n":"Other Mob","hp":999,"mhp":999},
            {"s":7,"n":"Test Boss","hp":300,"mhp":600}
        ]});
        observe_headless_message(&initial, &mut state);
        assert_eq!(state.boss_live.current_hp, None);
        let arena = json!({"t":"estado","boss":{"arena":{
            "key":"test-boss","nome":"Test Boss","slot":7
        }}});
        observe_headless_message(&arena, &mut state);
        assert_eq!(state.boss_live.current_hp, Some(300));
        assert_eq!(state.boss_live.max_hp, Some(600));
        observe_headless_message(&json!({"t":"campo","mobs":[{"s":7,"hp":120}]}), &mut state);
        assert_eq!(state.boss_live.current_hp, Some(120));
        assert_eq!(state.boss_live.max_hp, Some(600));
        assert_eq!(state.boss_live.hp_percent, Some(20.0));
    }

    #[test]
    fn boss_hp_never_uses_a_different_mob_from_a_previous_field() {
        let mut state = fixture();
        observe_headless_message(&json!({"t":"campo.init","mobs":[
            {"s":7,"n":"Other Mob","hp":500,"mhp":1000}
        ]}), &mut state);
        observe_headless_message(&json!({"t":"estado","boss":{"arena":{
            "key":"test-boss","nome":"Test Boss","slot":7
        }}}), &mut state);
        assert_eq!(state.boss_live.current_hp, None);
        assert_eq!(state.boss_live.max_hp, None);
        observe_headless_message(&json!({"t":"campo.init","mobs":[
            {"s":6,"n":"Other Mob","hp":500,"mhp":1000},
            {"s":7,"n":"Test Boss","hp":400,"mhp":600}
        ]}), &mut state);
        assert_eq!(state.boss_live.current_hp, Some(400));
        assert_eq!(state.boss_live.max_hp, Some(600));
    }

    #[test]
    fn boss_hp_does_not_reuse_previous_arena_field() {
        let mut state = fixture();
        observe_headless_message(&json!({"t":"campo.init","mobs":[
            {"s":7,"n":"Test Boss","hp":400,"mhp":600}
        ]}), &mut state);
        let arena = json!({"t":"estado","boss":{"arena":{
            "key":"test-boss","nome":"Test Boss","slot":7
        }}});
        observe_headless_message(&arena, &mut state);
        assert_eq!(state.boss_live.current_hp, Some(400));
        observe_headless_message(&json!({"t":"estado","boss":{"arena":null}}), &mut state);
        observe_headless_message(&arena, &mut state);
        assert_eq!(state.boss_live.current_hp, None);
        assert_eq!(state.boss_live.max_hp, None);
    }

    #[test]
    fn reconfigure_while_entry_pending_cannot_erase_idempotency_guard() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked(
                true,
                "test-boss".into(),
                BossMode::Quantity,
                Some(2),
                Some("Fixture".into()),
                Some("cid-1".into()),
                false,
            )
            .unwrap();
        state.cid = "cid-1".into();
        confirm_preparation(&mut runtime, &mut state);
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.entrar","key":"test-boss"}))
        );
        assert_eq!(
            runtime
                .settings
                .pending_stock
                .as_ref()
                .unwrap()
                .balance_before,
            3
        );
        let before = runtime.settings.clone();
        assert!(runtime
            .configure_checked(
                true,
                "another".into(),
                BossMode::Quantity,
                Some(20),
                Some("Fixture".into()),
                Some("cid-1".into()),
                false
            )
            .is_err());
        assert_eq!(
            runtime.settings, before,
            "rejected edit must not mutate persistent state"
        );
        runtime
            .configure_checked(
                false,
                "another".into(),
                BossMode::All,
                None,
                Some("Fixture".into()),
                None,
                false,
            )
            .unwrap();
        assert!(!runtime.settings.enabled);
        assert_eq!(runtime.settings.boss_key, "test-boss");
        assert_eq!(runtime.settings.pending_stock, before.pending_stock);
        assert!(runtime.settings.pending_entry);
        assert_eq!(runtime.next_command(&state), None);
        let joined = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&joined, &mut state);
        assert!(
            runtime.observe(&joined, &state),
            "late confirmation still tracked after OFF"
        );
        assert_eq!(runtime.settings.completed, 1);
        assert!(!runtime.settings.enabled);
        assert!(runtime.settings.awaiting_stock.is_some());
        assert_eq!(runtime.next_command(&state), None);
    }

    #[test]
    fn reconfigure_inside_arena_preserves_original_job_and_identical_save_is_noop() {
        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked(
                true,
                "test-boss".into(),
                BossMode::Quantity,
                Some(4),
                Some("Fixture".into()),
                None,
                false,
            )
            .unwrap();
        runtime.settings.completed = 2;
        let previous = runtime.settings.clone();
        runtime
            .configure_checked(
                true,
                "test-boss".into(),
                BossMode::Quantity,
                Some(4),
                Some("Fixture".into()),
                None,
                true,
            )
            .unwrap();
        assert_eq!(runtime.settings, previous);
        assert!(runtime
            .configure_checked(
                true,
                "other".into(),
                BossMode::All,
                None,
                Some("Fixture".into()),
                None,
                true
            )
            .is_err());
        assert!(runtime
            .configure_checked(
                true,
                "test-boss".into(),
                BossMode::Quantity,
                Some(8),
                Some("Fixture".into()),
                None,
                true
            )
            .is_err());
        assert_eq!(runtime.settings, previous);
        runtime
            .configure_checked(
                false,
                "other".into(),
                BossMode::All,
                None,
                Some("Fixture".into()),
                None,
                true,
            )
            .unwrap();
        assert!(!runtime.settings.enabled);
        assert_eq!(runtime.settings.completed, 2);
        assert_eq!(runtime.settings.boss_key, "test-boss");
    }

    #[test]
    fn serialized_four_accounts_do_not_replay_pending_entries_on_restart() {
        let mut fleet = BossFleet::default();
        let mut states: Vec<HeadlessState> = (0..4)
            .map(|index| {
                let mut state = fixture();
                state.i = index;
                state.name = format!("Player-{index}");
                state.cid = format!("id-{index}");
                state
            })
            .collect();
        for (index, state) in states.iter_mut().enumerate() {
            fleet.accounts[index]
                .configure_checked(
                    true,
                    "test-boss".into(),
                    BossMode::Quantity,
                    Some(index as u32 + 1),
                    Some(state.name.clone()),
                    Some(state.cid.clone()),
                    false,
                )
                .unwrap();
        confirm_preparation(&mut fleet.accounts[index], state);
            assert!(fleet.accounts[index].next_command(state).is_some());
        }
        let persisted = serde_json::to_vec(
            &fleet
                .accounts
                .iter()
                .map(|r| r.settings.clone())
                .collect::<Vec<_>>(),
        )
        .unwrap();
        let recovered: Vec<BossSettings> = serde_json::from_slice(&persisted).unwrap();
        let mut reloaded = BossFleet::from_settings(recovered);
        for (index, state) in states.iter().enumerate() {
            let job = &mut reloaded.accounts[index];
            assert!(job.settings.uncertain && job.settings.pending_entry);
            assert_eq!(
                job.settings.pending_stock.as_ref().unwrap().item_id,
                "70000"
            );
            assert_eq!(
                job.next_command(state),
                None,
                "restart cannot replay a pending entry"
            );
        }
        // Account 1 receives a server-confirmed arena; all other accounts
        // retain the exact original pending state and balances.
        let receipt = json!({"t":"welcome","estado":{
            "id":"id-1","nick":"Player-1",
            "boss":{"arena":{"key":"test-boss"},"auto":false},"items":{"70000":3}
        }});
        observe_headless_message(&receipt, &mut states[1]);
        assert!(reloaded.accounts[1].sync_handshake(&states[1]));
        assert_eq!(reloaded.accounts[1].settings.completed, 1);
        assert!(reloaded.accounts[1].settings.awaiting_stock.is_some());
        for index in [0, 2, 3] {
            assert_eq!(reloaded.accounts[index].settings.completed, 0);
            assert!(reloaded.accounts[index].settings.pending_entry);
        }
        assert_eq!(reloaded.accounts[1].next_command(&states[1]), None);
    }

    #[test]
    fn persisted_four_account_settings_replace_existing_file_without_truncating_other_slots() {
        let folder = std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .join(format!(
                "boss-settings-fixture-{}-{:?}",
                std::process::id(),
                std::thread::current().id()
            ));
        std::fs::create_dir_all(&folder).unwrap();
        let file = folder.join("settings.json");
        let mut fleet = BossFleet::default();
        for index in 0..4 {
            fleet.accounts[index].configure(
                true,
                format!("boss-{index}"),
                BossMode::Quantity,
                Some(index as u32 + 1),
                Some(format!("player-{index}")),
            );
        }
        fleet.save_to(&file).unwrap();
        let before = std::fs::read(&file).unwrap();
        fleet.accounts[2].settings.pending_entry = true;
        fleet.accounts[2].settings.pending_stock = Some(DebitGuard {
            item_id: "70000".into(),
            balance_before: 10,
            required_debit: 1,
        });
        fleet.save_to(&file).unwrap();
        assert_ne!(std::fs::read(&file).unwrap(), before);
        assert!(!file.with_extension("json.tmp").exists());
        let loaded = BossFleet::load_from(&file);
        assert_eq!(loaded.accounts[2].settings.boss_key, "boss-2");
        assert!(loaded.accounts[2].settings.pending_entry);
        assert!(
            loaded.accounts[2].settings.uncertain,
            "a pending request loaded after restart is always uncertain"
        );
        for index in [0, 1, 3] {
            assert_eq!(
                loaded.accounts[index].settings.boss_key,
                format!("boss-{index}")
            );
            assert!(!loaded.accounts[index].settings.pending_entry);
        }
        std::fs::remove_file(&file).unwrap();
        std::fs::remove_dir(&folder).unwrap();
    }

    #[test]
    fn debit_guard_waits_for_full_server_entry_fee_including_after_restart() {
        let mut state = fixture();
        state.inv_map.insert("70000".into(), json!(5));
        state.bosses_jogaveis[0]["entrada"]["qtd"] = json!(2);
        let mut runtime = BossRuntime::default();
        runtime.configure(
            true,
            "test-boss".into(),
            BossMode::Quantity,
            Some(3),
            Some("Fixture".into()),
        );
        assert!(runtime.next_command(&state).is_some());
        let joined = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&joined, &mut state);
        runtime.observe(&joined, &state);
        let guard = runtime.settings.awaiting_stock.as_ref().unwrap();
        assert_eq!((guard.balance_before, guard.required_debit), (5, 2));
        let persisted = serde_json::to_value(&runtime.settings).unwrap();
        let mut recovered = BossRuntime {
            settings: serde_json::from_value(persisted).unwrap(),
            ..Default::default()
        };
        state.boss_live.in_arena = false;
        state.inv_map.insert("70000".into(), json!(4));
        recovered.sync_handshake(&state);
        assert!(
            recovered.settings.awaiting_stock.is_some(),
            "one token is not the expected two-token fee"
        );
        assert_eq!(recovered.next_command(&state), None);
        state.inv_map.insert("70000".into(), json!(3));
        assert!(recovered.sync_handshake(&state));
        assert!(recovered.settings.awaiting_stock.is_none());
        assert_eq!(
            recovered.next_command(&state),
            Some(json!({"t":"boss.entrar","key":"test-boss"}))
        );
    }

    #[test]
    fn one_account_identity_cannot_trigger_commands_for_another_same_name() {
        let mut state = fixture();
        state.cid = "character-B".into();
        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked(
                true,
                "test-boss".into(),
                BossMode::Quantity,
                Some(2),
                Some("Fixture".into()),
                Some("character-A".into()),
                false,
            )
            .unwrap();
        assert_eq!(runtime.next_command(&state), None);
        assert!(!runtime.sync_handshake(&state));
        let entered = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&entered, &mut state);
        assert!(!runtime.observe(&entered, &state));
        assert_eq!(runtime.settings.completed, 0);
        state.cid = "character-A".into();
        state.name = "Renamed Fixture".into();
        state.boss_live.in_arena = false;
        confirm_preparation(&mut runtime, &mut state);
        assert!(runtime.next_command(&state).is_some());
    }

    #[test]
    fn boss_loss_and_exit_do_not_award_drops_or_replay_pending_entry() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure(
            true,
            "test-boss".into(),
            BossMode::Quantity,
            Some(2),
            Some("Fixture".into()),
        );
        assert!(runtime.next_command(&state).is_some());
        let joined = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&joined, &mut state);
        runtime.observe(&joined, &state);
        let loss = json!({"t":"batalha","ev":[{"k":"bossPerdeu","key":"test-boss"}]});
        observe_headless_message(&loss, &mut state);
        runtime.observe(&loss, &state);
        assert_eq!(state.boss_live.winner.as_deref(), Some("defeat"));
        assert!(state.boss_drops.is_empty());
        let exit = json!({"t":"batalha","ev":[{"k":"bossSaiu","key":"test-boss"}]});
        observe_headless_message(&exit, &mut state);
        runtime.observe(&exit, &state);
        assert_eq!(
            runtime.next_command(&state),
            None,
            "confirmed fee must post before reentry"
        );
        let patch = json!({"t":"estado","items":{"70000":2},"boss":{"arena":null,"auto":false}});
        observe_headless_message(&patch, &mut state);
        state.inv_map.insert("70000".into(), json!(2));
        runtime.observe(&patch, &state);
        confirm_preparation(&mut runtime, &mut state);
        assert!(runtime.next_command(&state).is_some());
        assert!(runtime.settings.pending_entry);
        assert_eq!(runtime.next_command(&state), None);
    }

    #[test]
    fn exhausted_server_loop_sends_auto_false_without_abandoning_arena() {
        let mut state = fixture();
        let mut runtime = BossRuntime::default();
        runtime.configure(
            true,
            "test-boss".into(),
            BossMode::All,
            None,
            Some("Fixture".into()),
        );
        runtime.server_loop_started = true;
        state.boss_live.auto_active = Some(true);
        state.boss_live.auto_key = Some("test-boss".into());
        state.inv_map.insert("70000".into(), json!(0));
        assert_eq!(runtime.next_command(&state), None);
        assert!(!runtime.settings.enabled);
        assert!(runtime.settings.stop_requested);
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.auto","ativo":false}))
        );
        assert_eq!(runtime.next_command(&state), None);
    }

    #[test]
    fn off_during_unacknowledged_auto_on_forces_false_even_if_old_snapshot_says_off() {
        let mut state = fixture();
        state.cid = "character-1".into();
        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked(
                true,
                "test-boss".into(),
                BossMode::All,
                None,
                Some("Fixture".into()),
                Some("character-1".into()),
                false,
            )
            .unwrap();
        confirm_preparation(&mut runtime, &mut state);
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.auto","ativo":true,"key":"test-boss"}))
        );
        assert_eq!(runtime.awaiting_auto, Some(true));
        runtime
            .configure_checked(
                false,
                "ignored".into(),
                BossMode::Quantity,
                Some(17),
                None,
                None,
                false,
            )
            .unwrap();
        assert_eq!(
            runtime.awaiting_auto, None,
            "OFF supersedes unacknowledged ON"
        );
        assert!(runtime.settings.stop_requested);
        assert_eq!(runtime.settings.owner_id.as_deref(), Some("character-1"));
        assert_eq!(runtime.settings.boss_key, "test-boss");
        // This snapshot was generated before the ON was processed. It must
        // not be accepted as proof that the later OFF command succeeded.
        let old_state = json!({"t":"estado","boss":{"auto":false}});
        observe_headless_message(&old_state, &mut state);
        runtime.observe(&old_state, &state);
        assert!(runtime.settings.stop_requested);
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.auto","ativo":false}))
        );
        assert_eq!(runtime.next_command(&state), None);
        runtime.observe(&old_state, &state);
        assert!(
            !runtime.settings.stop_requested,
            "OFF acknowledged after send"
        );
    }

    #[test]
    fn stop_request_survives_launcher_restart_without_cached_account_state() {
        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked(
                true,
                "test-boss".into(),
                BossMode::All,
                None,
                Some("Fixture".into()),
                Some("character-1".into()),
                false,
            )
            .unwrap();
        runtime
            .configure_checked(false, String::new(), BossMode::All, None, None, None, false)
            .unwrap();
        let original = runtime.settings.clone();
        assert!(original.stop_requested);
        assert_eq!(original.owner_id.as_deref(), Some("character-1"));
        let mut fleet = BossFleet::from_settings(vec![original]);
        let mut state = fixture();
        state.cid = "another-character".into();
        assert_eq!(
            fleet.accounts[0].next_command(&state),
            None,
            "never turn off another logged-in user's loop"
        );
        state.cid = "character-1".into();
        assert_eq!(
            fleet.accounts[0].next_command(&state),
            Some(json!({"t":"boss.auto","ativo":false}))
        );
    }

    #[test]
    fn off_after_uncertain_entry_is_safe_even_offline_and_never_restarts() {
        let mut state = fixture();
        state.cid = "owner-4".into();
        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked(
                true,
                "test-boss".into(),
                BossMode::All,
                None,
                Some("Fixture".into()),
                Some("owner-4".into()),
                false,
            )
            .unwrap();
        confirm_preparation(&mut runtime, &mut state);
        let auto_enabled = json!({"t":"estado","boss":{"auto":true,"autoKey":"test-boss"}});
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.auto","ativo":true,"key":"test-boss"}))
        );
        observe_headless_message(&auto_enabled, &mut state);
        runtime.observe(&auto_enabled, &state);
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.entrar","key":"test-boss"}))
        );
        state.live = false;
        assert!(runtime.observe(&json!({"t":"disconnected"}), &state));
        assert!(runtime.settings.uncertain);
        let prior = runtime.settings.clone();
        runtime
            .configure_checked(
                false,
                String::new(),
                BossMode::Quantity,
                Some(99),
                None,
                None,
                false,
            )
            .unwrap();
        assert!(!runtime.settings.enabled);
        assert!(runtime.settings.pending_entry && runtime.settings.uncertain);
        assert_eq!(runtime.settings.pending_stock, prior.pending_stock);
        assert_eq!(runtime.settings.owner_id, prior.owner_id);
        assert_eq!(runtime.settings.boss_key, prior.boss_key);
        assert!(runtime.settings.stop_requested);
        assert_eq!(
            runtime.next_command(&state),
            None,
            "OFF cannot send while disconnected"
        );
        state.live = true;
        state.boss_live.in_arena = false;
        assert!(runtime.sync_handshake(&state));
        assert_eq!(
            runtime.next_command(&state),
            Some(json!({"t":"boss.auto","ativo":false}))
        );
        let off_ack = json!({"t":"estado","boss":{"auto":false}});
        observe_headless_message(&off_ack, &mut state);
        runtime.observe(&off_ack, &state);
        assert!(!runtime.settings.stop_requested);
        assert!(
            runtime.settings.pending_entry && runtime.settings.uncertain,
            "OFF ack cannot clear an unresolved entry"
        );
        assert_eq!(
            runtime.next_command(&state),
            None,
            "never replay the uncertain entry"
        );
    }

    #[test]
    fn automation_prevents_unsupervised_duplicate_boss_messages_only_for_its_account() {
        let mut fleet = BossFleet::default();
        fleet.accounts[2].configure(
            true,
            "test-boss".into(),
            BossMode::Quantity,
            Some(2),
            Some("Player-2".into()),
        );
        let enter = json!({"t":"boss.entrar","key":"test-boss"});
        let auto = json!({"t":"boss.auto","ativo":true,"key":"test-boss"});
        assert!(fleet.accounts[2].blocks_external_boss_command(&enter));
        assert!(fleet.accounts[2].blocks_external_boss_command(&auto));
        assert!(!fleet.accounts[1].blocks_external_boss_command(&enter));
        assert!(!fleet.accounts[2].blocks_external_boss_command(&json!({"t":"raid.inscrever"})));
        fleet.accounts[2].settings.enabled = false;
        fleet.accounts[2].settings.pending_entry = true;
        assert!(
            fleet.accounts[2].blocks_external_boss_command(&enter),
            "OFF with a pending entry still owns its idempotency guard"
        );
    }

    #[test]
    fn demand_mode_snapshots_initial_tokens_and_ignores_subsequent_token_gains() {
        let mut state = fixture();
        state.inv_map.insert("70000".into(), json!(3));
        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked_with_plan(
                true,
                "test-boss".into(),
                BossMode::Demand,
                Some(3),
                Some("Fixture".into()),
                None,
                false,
                None,
                Some(3),
            )
            .unwrap();
        assert_eq!(runtime.settings.mode, BossMode::Demand);
        assert_eq!(runtime.settings.quantity, Some(3));
        assert_eq!(runtime.settings.initial_tokens, Some(3));

        // Battle 1
        confirm_preparation(&mut runtime, &mut state);
        let enter = json!({"t":"boss.entrar","key":"test-boss"});
        assert_eq!(runtime.next_command(&state), Some(enter.clone()));
        let receipt = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&receipt, &mut state);
        runtime.observe(&receipt, &state);
        assert_eq!(runtime.settings.completed, 1);
        state.inv_map.insert("70000".into(), json!(2));
        runtime.observe(&json!({"t":"estado","items":{"70000":2}}), &state);
        let victory_drops = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss","drops":[{"itemId":70000,"qtd":2,"nome":"Bronze Boss Token"}]}]});
        observe_headless_message(&victory_drops, &mut state);
        runtime.observe(&victory_drops, &state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.sair"})));
        let out = json!({"t":"estado","boss":{"arena":null,"auto":false},"items":{"70000":4}});
        observe_headless_message(&out, &mut state);
        state.inv_map.insert("70000".into(), json!(4));
        runtime.observe(&out, &state);

        // Battle 2
        confirm_preparation(&mut runtime, &mut state);
        assert_eq!(runtime.next_command(&state), Some(enter.clone()));
        observe_headless_message(&receipt, &mut state);
        runtime.observe(&receipt, &state);
        assert_eq!(runtime.settings.completed, 2);
        state.inv_map.insert("70000".into(), json!(3));
        runtime.observe(&json!({"t":"estado","items":{"70000":3}}), &state);
        observe_headless_message(&victory_drops, &mut state);
        runtime.observe(&victory_drops, &state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.sair"})));
        let out2 = json!({"t":"estado","boss":{"arena":null,"auto":false},"items":{"70000":5}});
        observe_headless_message(&out2, &mut state);
        state.inv_map.insert("70000".into(), json!(5));
        runtime.observe(&out2, &state);

        // Battle 3
        confirm_preparation(&mut runtime, &mut state);
        assert_eq!(runtime.next_command(&state), Some(enter));
        observe_headless_message(&receipt, &mut state);
        runtime.observe(&receipt, &state);
        assert_eq!(runtime.settings.completed, 3);
        assert!(!runtime.settings.enabled, "Demand mode stops after initial budget of 3 is exhausted");
        observe_headless_message(&victory_drops, &mut state);
        runtime.observe(&victory_drops, &state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.sair"})));
        let out3 = json!({"t":"estado","boss":{"arena":null,"auto":false},"items":{"70000":6}});
        observe_headless_message(&out3, &mut state);
        state.inv_map.insert("70000".into(), json!(6));
        runtime.observe(&out3, &state);

        // Even though inventory has 6 tokens, demand mode does not enter again!
        assert_eq!(runtime.next_command(&state), None);
        assert_eq!(runtime.settings.completed, 3);
    }

    #[test]
    fn demand_mode_counts_server_confirmed_entries_even_defeats() {
        let mut state = fixture();
        state.inv_map.insert("70000".into(), json!(2));
        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked_with_plan(
                true,
                "test-boss".into(),
                BossMode::Demand,
                Some(2),
                Some("Fixture".into()),
                None,
                false,
                None,
                Some(2),
            )
            .unwrap();

        // Battle 1 ends in defeat
        confirm_preparation(&mut runtime, &mut state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})));
        let entered = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&entered, &mut state);
        runtime.observe(&entered, &state);
        assert_eq!(runtime.settings.completed, 1);
        let defeat = json!({"t":"batalha","ev":[{"k":"bossPerdeu","key":"test-boss"}]});
        observe_headless_message(&defeat, &mut state);
        runtime.observe(&defeat, &state);
        assert_eq!(runtime.settings.completed, 1, "Defeat counts toward the demand target");
        let exit = json!({"t":"batalha","ev":[{"k":"bossSaiu","key":"test-boss"}]});
        observe_headless_message(&exit, &mut state);
        runtime.observe(&exit, &state);
        let patch = json!({"t":"estado","items":{"70000":1},"boss":{"arena":null,"auto":false}});
        observe_headless_message(&patch, &mut state);
        state.inv_map.insert("70000".into(), json!(1));
        runtime.observe(&patch, &state);

        // Battle 2 ends in victory
        confirm_preparation(&mut runtime, &mut state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})));
        observe_headless_message(&entered, &mut state);
        runtime.observe(&entered, &state);
        assert_eq!(runtime.settings.completed, 2);
        assert!(!runtime.settings.enabled, "Target of 2 entries reached");
        let victory = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss"}]});
        observe_headless_message(&victory, &mut state);
        runtime.observe(&victory, &state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.sair"})));
        observe_headless_message(&exit, &mut state);
        runtime.observe(&exit, &state);
        assert_eq!(runtime.next_command(&state), None);
    }

    #[test]
    fn deterministic_distribution_yields_exact_counts_at_100_entries() {
        let mut settings = BossSettings {
            enabled: true,
            mode: BossMode::Demand,
            distribution: Some(vec![
                BossAllocation { boss_key: "boss-a".into(), percent: 20 },
                BossAllocation { boss_key: "boss-b".into(), percent: 30 },
                BossAllocation { boss_key: "boss-c".into(), percent: 40 },
                BossAllocation { boss_key: "boss-d".into(), percent: 10 },
            ]),
            quantity: Some(100),
            ..Default::default()
        };

        for _ in 0..100 {
            let next = settings.select_next_boss().expect("Next boss must be determined");
            *settings.entry_counts.entry(next).or_insert(0) += 1;
            settings.completed += 1;
        }

        assert_eq!(settings.entry_counts.get("boss-a"), Some(&20));
        assert_eq!(settings.entry_counts.get("boss-b"), Some(&30));
        assert_eq!(settings.entry_counts.get("boss-c"), Some(&40));
        assert_eq!(settings.entry_counts.get("boss-d"), Some(&10));
        assert_eq!(settings.completed, 100);
    }

    #[test]
    fn distribution_validates_percentages_zeros_duplicates_and_unknown_keys() {
        let catalog = vec![
            json!({"key":"boss-a","entrada":{"itemId":70000,"qtd":1}}),
            json!({"key":"boss-b","entrada":{"itemId":70000,"qtd":1}}),
            json!({"key":"boss-c","entrada":{"itemId":70000,"qtd":1}}),
        ];

        // Sum != 100
        let bad_sum = vec![
            BossAllocation { boss_key: "boss-a".into(), percent: 50 },
            BossAllocation { boss_key: "boss-b".into(), percent: 40 },
        ];
        assert!(validate_distribution(&bad_sum, &catalog).is_err());

        // Percent > 100
        let over_100 = vec![
            BossAllocation { boss_key: "boss-a".into(), percent: 110 },
        ];
        assert!(validate_distribution(&over_100, &catalog).is_err());

        // Duplicate keys
        let duplicates = vec![
            BossAllocation { boss_key: "boss-a".into(), percent: 50 },
            BossAllocation { boss_key: "boss-a".into(), percent: 50 },
        ];
        assert!(validate_distribution(&duplicates, &catalog).is_err());

        // Unknown key
        let unknown = vec![
            BossAllocation { boss_key: "boss-a".into(), percent: 50 },
            BossAllocation { boss_key: "nonexistent".into(), percent: 50 },
        ];
        assert!(validate_distribution(&unknown, &catalog).is_err());

        // Zero percent entry is valid in sum, but never selected
        let zero_weight = vec![
            BossAllocation { boss_key: "boss-a".into(), percent: 70 },
            BossAllocation { boss_key: "boss-b".into(), percent: 30 },
            BossAllocation { boss_key: "boss-c".into(), percent: 0 },
        ];
        assert!(validate_distribution(&zero_weight, &catalog).is_ok());

        let mut settings = BossSettings {
            enabled: true,
            mode: BossMode::Demand,
            distribution: Some(zero_weight),
            ..Default::default()
        };
        for _ in 0..100 {
            let next = settings.select_next_boss().unwrap();
            *settings.entry_counts.entry(next).or_insert(0) += 1;
            settings.completed += 1;
        }
        assert_eq!(settings.entry_counts.get("boss-a"), Some(&70));
        assert_eq!(settings.entry_counts.get("boss-b"), Some(&30));
        assert_eq!(settings.entry_counts.get("boss-c"), None, "Zero weight is never chosen");
    }

    #[test]
    fn infinite_mode_cycles_between_hunting_and_boss_batches() {
        let mut state = fixture();
        state.cid = "cid-inf".into();
        state.name = "Fixture".into();
        state.active_id = Some(json!(11));
        state.hunt = "fire_plains".into();
        state.last_hunt_slug = "fire_plains".into();
        state.in_center = Some(false);
        state.team = [11, 22].into_iter().map(|id| crate::game_headless::PokemonTeamMember {
            id: Some(json!(id)), slot: Some(id), ..Default::default()
        }).collect();
        state.inv_map.insert("70000".into(), json!(0));

        let mut runtime = BossRuntime::default();
        runtime.configure_pokemon_profile(&state, "test-boss", json!(11), json!(22)).unwrap();
        // Infinite mode accepts zero tokens at start!
        runtime
            .configure_checked_with_plan(
                true,
                "test-boss".into(),
                BossMode::Infinite,
                None,
                Some("Fixture".into()),
                Some("cid-inf".into()),
                false,
                None,
                Some(0),
            )
            .unwrap();
        runtime.settings.return_hunt = Some("fire_plains".into());
        runtime.settings.return_pokemon_id = Some(json!(11));
        assert!(runtime.settings.enabled);

        // With 0 tokens, infinite mode remains enabled and status is waiting_tokens
        apply_runtime_state(&mut state, &runtime.settings);
        assert_eq!(state.boss_live.status, "waiting_tokens");
        assert_eq!(runtime.next_command(&state), None);

        // Player collects a token while hunting
        state.inv_map.insert("70000".into(), json!(1));
        apply_runtime_state(&mut state, &runtime.settings);
        assert_eq!(state.boss_live.status, "waiting");
        state.in_center = Some(false);
        // Next command goes to center
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.ir"})));
        let center = json!({"t":"campo.init","slug":"centro","centro":true});
        observe_headless_message(&center, &mut state);
        runtime.observe(&center, &state);
        // Cures at center
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.curar"})));
        let cured = json!({"t":"batalha","ev":[{"k":"curado"}]});
        observe_headless_message(&cured, &mut state);
        runtime.observe(&cured, &state);
        runtime.preparation_started = Some(Instant::now() - Duration::from_secs(3));
        // Switches to fighter pokemon (22)
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"team.active","pokemonId":22})));
        state.active_id = Some(json!(22));
        // Enters boss
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})));
        let entered = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&entered, &mut state);
        runtime.observe(&entered, &state);
        assert_eq!(runtime.settings.completed, 1);

        // Battle won, tokens spent
        let victory = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss"}]});
        observe_headless_message(&victory, &mut state);
        runtime.observe(&victory, &state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.sair"})));
        let exit = json!({"t":"batalha","ev":[{"k":"bossSaiu","key":"test-boss"}]});
        observe_headless_message(&exit, &mut state);
        runtime.observe(&exit, &state);
        let patch = json!({"t":"estado","items":{"70000":0},"boss":{"arena":null,"auto":false}});
        observe_headless_message(&patch, &mut state);
        state.inv_map.insert("70000".into(), json!(0));
        runtime.observe(&patch, &state);

        // With 0 tokens, infinite mode restores primary pokemon and hunt!
        state.hunt = "centro".into();
        assert!(runtime.settings.enabled, "Infinite remains enabled");
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"team.active","pokemonId":11})));
        state.active_id = Some(json!(11));
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"hunt.select","slug":"fire_plains"})));
        state.hunt = "fire_plains".into();
        state.in_center = Some(false);

        // Player collects another token!
        state.inv_map.insert("70000".into(), json!(1));
        runtime.last_return_attempt = None;
        runtime.last_pokemon_switch_attempt = None;
        // The cycle repeats: goes to center to prepare
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.ir"})));
    }

    #[test]
    fn distribution_receipts_do_not_duplicate_allocation() {
        let mut state = fixture();
        state.bosses_jogaveis.push(json!({
            "key": "boss-b",
            "entrada": {"itemId": 70000, "qtd": 1}
        }));
        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked_with_plan(
                true,
                "test-boss".into(),
                BossMode::Demand,
                Some(2),
                Some("Fixture".into()),
                None,
                false,
                Some(vec![
                    BossAllocation { boss_key: "test-boss".into(), percent: 50 },
                    BossAllocation { boss_key: "boss-b".into(), percent: 50 },
                ]),
                Some(2),
            )
            .unwrap();

        assert_eq!(runtime.settings.boss_key, "test-boss");
        confirm_preparation(&mut runtime, &mut state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})));
        assert!(runtime.settings.pending_entry);

        let entered = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&entered, &mut state);
        runtime.observe(&entered, &state);
        assert_eq!(runtime.settings.completed, 1);
        assert_eq!(runtime.settings.entry_counts.get("test-boss"), Some(&1));

        // Replayed receipt does not increment allocation again
        observe_headless_message(&entered, &mut state);
        runtime.observe(&entered, &state);
        assert_eq!(runtime.settings.completed, 1);
        assert_eq!(runtime.settings.entry_counts.get("test-boss"), Some(&1));

        // Battle ends, exit
        let victory = json!({"t":"batalha","ev":[{"k":"bossMorto","key":"test-boss"}]});
        observe_headless_message(&victory, &mut state);
        runtime.observe(&victory, &state);
        assert_eq!(runtime.settings.completed, 1);
        observe_headless_message(&victory, &mut state);
        runtime.observe(&victory, &state);
        assert_eq!(runtime.settings.completed, 1);

        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.sair"})));
        let exit = json!({"t":"batalha","ev":[{"k":"bossSaiu","key":"test-boss"}]});
        observe_headless_message(&exit, &mut state);
        runtime.observe(&exit, &state);
        let patch = json!({"t":"estado","items":{"70000":1},"boss":{"arena":null,"auto":false}});
        observe_headless_message(&patch, &mut state);
        state.inv_map.insert("70000".into(), json!(1));
        runtime.observe(&patch, &state);

        // Key now rotates to boss-b
        assert_eq!(runtime.settings.boss_key, "boss-b");
    }

    #[test]
    fn fleet_persistence_retains_demand_infinite_and_distribution_plans_across_four_accounts() {
        let mut fleet = BossFleet::default();
        fleet.accounts[0].configure_with_plan(
            true, "boss-0".into(), BossMode::Demand, Some(10), Some("p0".into()),
            Some(vec![BossAllocation { boss_key: "boss-0".into(), percent: 100 }]),
            Some(10),
        );
        fleet.accounts[0].settings.entry_counts.insert("boss-0".into(), 4);
        fleet.accounts[0].settings.completed = 4;

        fleet.accounts[1].configure_with_plan(
            true, "boss-1".into(), BossMode::Infinite, None, Some("p1".into()),
            Some(vec![
                BossAllocation { boss_key: "boss-1".into(), percent: 60 },
                BossAllocation { boss_key: "boss-2".into(), percent: 40 },
            ]),
            Some(0),
        );

        fleet.accounts[2].configure_with_plan(
            true, "boss-2".into(), BossMode::Demand, Some(5), Some("p2".into()),
            None, Some(5),
        );

        fleet.accounts[3].configure(
            false, "boss-3".into(), BossMode::Quantity, Some(2), Some("p3".into()),
        );

        let folder = std::env::temp_dir().join(format!("pio-fleet-persist-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let file = folder.join("fleet.json");
        fleet.save_to(&file).unwrap();

        let loaded = BossFleet::load_from(&file);
        assert_eq!(loaded.accounts[0].settings.mode, BossMode::Demand);
        assert_eq!(loaded.accounts[0].settings.completed, 4);
        assert_eq!(loaded.accounts[0].settings.initial_tokens, Some(10));
        assert_eq!(loaded.accounts[0].settings.entry_counts.get("boss-0"), Some(&4));
        assert_eq!(loaded.accounts[0].settings.distribution.as_ref().unwrap().len(), 1);

        assert_eq!(loaded.accounts[1].settings.mode, BossMode::Infinite);
        assert_eq!(loaded.accounts[1].settings.distribution.as_ref().unwrap().len(), 2);
        assert_eq!(loaded.accounts[1].settings.distribution.as_ref().unwrap()[0].percent, 60);

        assert_eq!(loaded.accounts[2].settings.mode, BossMode::Demand);
        assert_eq!(loaded.accounts[2].settings.quantity, Some(5));

        assert_eq!(loaded.accounts[3].settings.mode, BossMode::Quantity);
        assert!(!loaded.accounts[3].settings.enabled);

        let _ = std::fs::remove_file(file);
        let _ = std::fs::remove_dir(folder);
    }

    #[test]
    fn distribution_validates_playable_catalog_and_incompatible_costs() {
        let catalog = vec![
            json!({"key":"boss-bronze-1","entrada":{"itemId":"70000","qtd":1}}),
            json!({"key":"boss-bronze-2","entrada":{"itemId":"70000","qtd":1}}),
            json!({"key":"boss-silver","entrada":{"itemId":"70001","qtd":1}}),
            json!({"key":"boss-expensive","entrada":{"itemId":"70000","qtd":2}}),
            json!({"key":"boss-free","entrada":{"itemId":"0","qtd":0}}),
        ];

        // Valid: both use 70000 @ 1 token
        let valid = vec![
            BossAllocation { boss_key: "boss-bronze-1".into(), percent: 60 },
            BossAllocation { boss_key: "boss-bronze-2".into(), percent: 40 },
        ];
        assert!(validate_distribution(&valid, &catalog).is_ok());

        // Incompatible item ID (currency)
        let diff_item = vec![
            BossAllocation { boss_key: "boss-bronze-1".into(), percent: 50 },
            BossAllocation { boss_key: "boss-silver".into(), percent: 50 },
        ];
        let err = validate_distribution(&diff_item, &catalog).unwrap_err();
        assert!(err.contains("Moedas de entrada incompatíveis"));

        // Incompatible fee
        let diff_fee = vec![
            BossAllocation { boss_key: "boss-bronze-1".into(), percent: 50 },
            BossAllocation { boss_key: "boss-expensive".into(), percent: 50 },
        ];
        let err = validate_distribution(&diff_fee, &catalog).unwrap_err();
        assert!(err.contains("Custos de entrada incompatíveis"));

        // Invalid fee (0)
        let free = vec![
            BossAllocation { boss_key: "boss-bronze-1".into(), percent: 50 },
            BossAllocation { boss_key: "boss-free".into(), percent: 50 },
        ];
        assert!(validate_distribution(&free, &catalog).is_err());
    }

    #[test]
    fn manual_cycle_reheals_after_defeat_and_rotates_key_only_after_stock_receipt() {
        let mut state = fixture();
        state.bosses_jogaveis.push(json!({
            "key": "boss-b",
            "entrada": {"itemId": 70000, "qtd": 1}
        }));
        state.in_center = Some(false);
        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked_with_plan(
                true,
                "test-boss".into(),
                BossMode::Demand,
                Some(2),
                Some("Fixture".into()),
                None,
                false,
                Some(vec![
                    BossAllocation { boss_key: "test-boss".into(), percent: 50 },
                    BossAllocation { boss_key: "boss-b".into(), percent: 50 },
                ]),
                Some(2),
            )
            .unwrap();

        // Entry 1 for test-boss
        confirm_preparation(&mut runtime, &mut state);
        assert_eq!(runtime.settings.boss_key, "test-boss");
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"test-boss"})));
        let entered = json!({"t":"batalha","ev":[{"k":"bossEntrou","key":"test-boss"}]});
        observe_headless_message(&entered, &mut state);
        runtime.observe(&entered, &state);

        // Defeat occurs in arena
        let loss = json!({"t":"batalha","ev":[{"k":"bossPerdeu","key":"test-boss"}]});
        observe_headless_message(&loss, &mut state);
        runtime.observe(&loss, &state);
        // During arena exit, key MUST NOT rotate yet (active key preserved for result attribution)
        assert_eq!(runtime.settings.boss_key, "test-boss");
        assert!(!state.boss_live.in_arena, "Defeat receipt has already ended the arena");
        let exit = json!({"t":"batalha","ev":[{"k":"bossSaiu","key":"test-boss"}]});
        observe_headless_message(&exit, &mut state);
        runtime.observe(&exit, &state);

        // Before stock debit is reconciled, key must STILL NOT rotate
        assert!(runtime.settings.awaiting_stock.is_some());
        assert_eq!(runtime.settings.boss_key, "test-boss");

        // Stock debit confirmed by server snapshot
        let patch = json!({"t":"estado","items":{"70000":1},"boss":{"arena":null,"auto":false}});
        observe_headless_message(&patch, &mut state);
        state.inv_map.insert("70000".into(), json!(1));
        runtime.observe(&patch, &state);
        assert!(runtime.settings.awaiting_stock.is_none());

        // NOW key rotates to boss-b!
        assert_eq!(runtime.settings.boss_key, "boss-b");

        // Player is outside center after defeat: must reheal before next entry!
        state.in_center = Some(false);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.ir"})));
        let center = json!({"t":"campo.init","slug":"centro","centro":true});
        observe_headless_message(&center, &mut state);
        runtime.observe(&center, &state);
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"centro.curar"})));
        let cured = json!({"t":"batalha","ev":[{"k":"curado"}]});
        observe_headless_message(&cured, &mut state);
        runtime.observe(&cured, &state);
        runtime.preparation_started = Some(Instant::now() - Duration::from_secs(3));

        // Now enters boss-b!
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.entrar","key":"boss-b"})));
    }

    #[test]
    fn configure_noop_preserves_rotated_key_and_counters() {
        let mut runtime = BossRuntime::default();
        let dist = vec![
            BossAllocation { boss_key: "boss-a".into(), percent: 50 },
            BossAllocation { boss_key: "boss-b".into(), percent: 50 },
        ];
        runtime
            .configure_checked_with_plan(
                true,
                "boss-a".into(),
                BossMode::Demand,
                Some(10),
                Some("Fixture".into()),
                Some("cid-1".into()),
                false,
                Some(dist.clone()),
                Some(10),
            )
            .unwrap();

        // Simulate that 1 entry for boss-a was completed and key rotated to boss-b
        runtime.settings.completed = 1;
        runtime.settings.entry_counts.insert("boss-a".into(), 1);
        runtime.settings.boss_key = "boss-b".into();

        // Re-saving with the same plan (even if UI supplies boss-a as key) MUST be a no-op!
        let before = runtime.settings.clone();
        runtime
            .configure_checked_with_plan(
                true,
                "boss-a".into(),
                BossMode::Demand,
                Some(10),
                Some("Fixture".into()),
                Some("cid-1".into()),
                false,
                Some(dist),
                Some(10),
            )
            .unwrap();

        assert_eq!(runtime.settings, before, "No-op configure must not reset completed, counters, or rotated key");
        assert_eq!(runtime.settings.completed, 1);
        assert_eq!(runtime.settings.boss_key, "boss-b");
    }

    #[test]
    fn infinite_mode_disables_server_auto_and_waits_for_primary_ack_before_hunt() {
        let mut state = fixture();
        state.cid = "cid-inf".into();
        state.name = "Fixture".into();
        state.active_id = Some(json!(22)); // active is fighter
        state.team = [11, 22].into_iter().map(|id| crate::game_headless::PokemonTeamMember {
            id: Some(json!(id)), slot: Some(id), ..Default::default()
        }).collect();
        state.hunt = "fire_plains".into();
        state.in_center = Some(true);
        state.inv_map.insert("70000".into(), json!(0));
        state.boss_live.auto_active = Some(true); // server auto is active!

        let mut runtime = BossRuntime::default();
        runtime
            .configure_checked_with_plan(
                true,
                "test-boss".into(),
                BossMode::Infinite,
                None,
                Some("Fixture".into()),
                Some("cid-inf".into()),
                false,
                None,
                Some(0),
            )
            .unwrap();
        runtime.settings.return_hunt = Some("fire_plains".into());
        runtime.settings.return_pokemon_id = Some(json!(11));

        // 1. With 0 tokens and auto_active == true, it MUST first disable server boss.auto!
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"boss.auto","ativo":false})));
        assert_eq!(runtime.awaiting_auto, Some(false));

        // Server confirms auto stopped
        let auto_ack = json!({"t":"batalha","ev":[{"k":"bossAuto","ativo":false}]});
        observe_headless_message(&auto_ack, &mut state);
        runtime.observe(&auto_ack, &state);

        // 2. Now it sends team.active to switch back to primary pokemon (11)
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"team.active","pokemonId":11})));

        // 3. While waiting for primary switch ack (active_id is still 22), it MUST NOT send hunt.select!
        assert_eq!(runtime.next_command(&state), None, "Must wait for primary selection ack before hunt");

        // Primary switch confirmed
        state.active_id = Some(json!(11));

        // 4. Now that primary pokemon is confirmed, it selects the return hunt
        state.hunt = "centro".into();
        assert_eq!(runtime.next_command(&state), Some(json!({"t":"hunt.select","slug":"fire_plains"})));
    }

    #[test]
    fn boss_saiu_resets_preparation_when_in_center_is_none() {
        let mut state = fixture();
        state.in_center = None;
        let mut runtime = BossRuntime::default();
        runtime.settings.enabled = true;
        runtime.settings.owner = Some("Fixture".into());
        runtime.preparation = PreparationStep::Ready;

        let exit = json!({"t":"batalha","ev":[{"k":"bossSaiu","key":"test-boss"}]});
        observe_headless_message(&exit, &mut state);
        runtime.observe(&exit, &state);

        assert_eq!(runtime.preparation, PreparationStep::AwaitLocation, "bossSaiu must reset preparation even when in_center is None");
    }

    #[test]
    fn distribution_sum_overflow_is_prevented() {
        let overflow_allocs = vec![
            BossAllocation { boss_key: "boss-a".into(), percent: u32::MAX },
            BossAllocation { boss_key: "boss-b".into(), percent: 1 },
        ];
        assert!(!is_valid_config_with_distribution(BossMode::Demand, Some(1), Some(&overflow_allocs)));

        let catalog = vec![json!({"key":"boss-a","entrada":{"itemId":"70000","qtd":1}})];
        let err = validate_distribution(&overflow_allocs, &catalog);
        assert!(err.is_err());
    }
}
