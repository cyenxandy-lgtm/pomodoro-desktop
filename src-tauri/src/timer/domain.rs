use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TimerMode {
    Focus,
    ShortBreak,
    LongBreak,
}

impl TimerMode {
    pub fn as_db_value(self) -> &'static str {
        match self {
            Self::Focus => "focus",
            Self::ShortBreak => "short_break",
            Self::LongBreak => "long_break",
        }
    }

    pub fn from_db_value(value: &str) -> Result<Self, String> {
        match value {
            "focus" => Ok(Self::Focus),
            "break" | "shortBreak" | "short_break" => Ok(Self::ShortBreak),
            "longBreak" | "long_break" => Ok(Self::LongBreak),
            _ => Err(format!("Unknown timer mode: {value}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TimerStatus {
    Idle,
    Running,
    Paused,
}

impl TimerStatus {
    pub fn as_db_value(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Running => "running",
            Self::Paused => "paused",
        }
    }

    pub fn from_db_value(value: &str) -> Result<Self, String> {
        match value {
            "running" => Ok(Self::Running),
            "paused" => Ok(Self::Paused),
            "idle" => Ok(Self::Idle),
            _ => Err(format!("Unknown timer status: {value}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerSettings {
    pub focus_minutes: u32,
    pub break_minutes: u32,
    pub long_break_minutes: u32,
    pub long_break_interval: u32,
    pub auto_start_break: bool,
    pub auto_start_focus: bool,
}

impl Default for TimerSettings {
    fn default() -> Self {
        Self {
            focus_minutes: 25,
            break_minutes: 5,
            long_break_minutes: 15,
            long_break_interval: 4,
            auto_start_break: false,
            auto_start_focus: false,
        }
    }
}

impl TimerSettings {
    pub fn validate(self) -> Result<Self, String> {
        if !(1..=120).contains(&self.focus_minutes) {
            return Err("Focus duration must be between 1 and 120 minutes.".into());
        }
        if !(1..=60).contains(&self.break_minutes) {
            return Err("Short Break duration must be between 1 and 60 minutes.".into());
        }
        if !(1..=60).contains(&self.long_break_minutes) {
            return Err("Long Break duration must be between 1 and 60 minutes.".into());
        }
        if !(2..=8).contains(&self.long_break_interval) {
            return Err("Long Break interval must be between 2 and 8 Focus sessions.".into());
        }
        Ok(self)
    }

    pub fn duration_seconds(self, mode: TimerMode) -> u32 {
        match mode {
            TimerMode::Focus => self.focus_minutes * 60,
            TimerMode::ShortBreak => self.break_minutes * 60,
            TimerMode::LongBreak => self.long_break_minutes * 60,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerSnapshot {
    pub mode: TimerMode,
    pub status: TimerStatus,
    pub remaining_seconds: u32,
    pub duration_seconds: u32,
    pub started_at: Option<i64>,
    pub target_end_time: Option<i64>,
    pub session_id: Option<String>,
    pub completed_focuses_in_cycle: u32,
}

impl TimerSnapshot {
    pub fn idle(mode: TimerMode, settings: TimerSettings, completed_focuses_in_cycle: u32) -> Self {
        let duration_seconds = settings.duration_seconds(mode);
        Self {
            mode,
            status: TimerStatus::Idle,
            remaining_seconds: duration_seconds,
            duration_seconds,
            started_at: None,
            target_end_time: None,
            session_id: None,
            completed_focuses_in_cycle,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TimerEventType {
    Started,
    Paused,
    Resumed,
    Reset,
    Skipped,
    Tick,
    Completed,
    ModeChanged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerEvent {
    #[serde(rename = "type")]
    pub event_type: TimerEventType,
    pub event_id: String,
    pub occurred_at: i64,
    pub snapshot: TimerSnapshot,
    pub session_id: Option<String>,
    pub mode: Option<TimerMode>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub planned_duration_seconds: Option<u32>,
    pub previous_mode: Option<TimerMode>,
    pub cancelled_session_id: Option<String>,
    pub skipped_session_id: Option<String>,
}

impl TimerEvent {
    pub fn simple(
        event_type: TimerEventType,
        event_id: String,
        occurred_at: i64,
        snapshot: TimerSnapshot,
    ) -> Self {
        Self {
            event_type,
            event_id,
            occurred_at,
            snapshot,
            session_id: None,
            mode: None,
            started_at: None,
            completed_at: None,
            planned_duration_seconds: None,
            previous_mode: None,
            cancelled_session_id: None,
            skipped_session_id: None,
        }
    }

    pub fn is_completion(&self) -> bool {
        self.event_type == TimerEventType::Completed
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Completed,
    Cancelled,
    Skipped,
}

impl SessionStatus {
    pub fn as_db_value(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
            Self::Skipped => "skipped",
        }
    }

    pub fn from_db_value(value: &str) -> Result<Self, String> {
        match value {
            "completed" => Ok(Self::Completed),
            "cancelled" => Ok(Self::Cancelled),
            "skipped" => Ok(Self::Skipped),
            _ => Err(format!("Unknown session status: {value}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerSession {
    pub id: String,
    pub completion_event_id: Option<String>,
    pub mode: TimerMode,
    pub started_at: i64,
    pub ended_at: i64,
    pub planned_duration_seconds: u32,
    pub actual_duration_seconds: u32,
    pub status: SessionStatus,
    pub date: String,
    #[serde(default)]
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveTimerState {
    pub session_id: String,
    pub mode: TimerMode,
    pub status: TimerStatus,
    pub started_at: i64,
    pub target_end_time: Option<i64>,
    pub paused_remaining_seconds: Option<u32>,
    pub planned_duration_seconds: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RuntimeState {
    pub current_mode: TimerMode,
    pub completed_focuses_in_cycle: u32,
}

impl ActiveTimerState {
    pub fn validate(&self) -> Result<(), String> {
        match self.status {
            TimerStatus::Running
                if self.target_end_time.is_some() && self.paused_remaining_seconds.is_none() =>
            {
                Ok(())
            }
            TimerStatus::Paused
                if self.target_end_time.is_none() && self.paused_remaining_seconds.is_some() =>
            {
                Ok(())
            }
            TimerStatus::Idle => Err("Idle timers must not be persisted.".into()),
            _ => Err("Active timer fields do not match its status.".into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySessionRecord {
    pub date: String,
    pub completed_pomodoros: u32,
    pub focus_minutes: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timer_event_serialization_matches_the_typescript_protocol() {
        let event = TimerEvent::simple(
            TimerEventType::Reset,
            "reset:1".into(),
            1_000,
            TimerSnapshot::idle(TimerMode::Focus, TimerSettings::default(), 2),
        );
        let value = serde_json::to_value(event).expect("serialize event");

        assert_eq!(value["type"], "reset");
        assert_eq!(value["eventId"], "reset:1");
        assert_eq!(value["snapshot"]["remainingSeconds"], 1_500);
        assert_eq!(value["snapshot"]["completedFocusesInCycle"], 2);
        assert!(value["cancelledSessionId"].is_null());
    }

    #[test]
    fn database_mode_parser_accepts_legacy_break_names() {
        assert_eq!(TimerMode::from_db_value("break"), Ok(TimerMode::ShortBreak));
        assert_eq!(
            TimerMode::from_db_value("shortBreak"),
            Ok(TimerMode::ShortBreak)
        );
        assert_eq!(
            TimerMode::from_db_value("long_break"),
            Ok(TimerMode::LongBreak)
        );
    }
}
