use crate::db::SqliteRepository;
use crate::timer::TimerSession;
use chrono::NaiveDate;
use serde::Serialize;
use std::sync::Mutex;

const MAX_RECENT_SESSIONS: u32 = 50;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyFocusStatistics {
    pub date: String,
    pub completed_pomodoros: u32,
    pub focus_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatisticsSnapshot {
    pub daily: Vec<DailyFocusStatistics>,
    pub recent_sessions: Vec<TimerSession>,
}

pub struct StatisticsService {
    repository: Mutex<SqliteRepository>,
}

impl StatisticsService {
    pub fn new(repository: SqliteRepository) -> Self {
        Self {
            repository: Mutex::new(repository),
        }
    }

    pub fn snapshot(
        &self,
        start_date: Option<&str>,
        end_date: Option<&str>,
        recent_limit: u32,
    ) -> Result<StatisticsSnapshot, String> {
        let start = validate_date(start_date)?;
        let end = validate_date(end_date)?;
        if start.zip(end).is_some_and(|(start, end)| start > end) {
            return Err("Statistics start date must not be after end date.".into());
        }

        let repository = self
            .repository
            .lock()
            .map_err(|_| "Statistics repository lock is poisoned.".to_string())?;
        Ok(StatisticsSnapshot {
            daily: repository.get_daily_statistics(start_date, end_date)?,
            recent_sessions: repository.get_recent(recent_limit.min(MAX_RECENT_SESSIONS))?,
        })
    }
}

fn validate_date(value: Option<&str>) -> Result<Option<NaiveDate>, String> {
    value
        .map(|date| {
            NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .map_err(|_| format!("Invalid statistics date: {date}"))
        })
        .transpose()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timer::domain::SessionStatus;
    use crate::timer::{TimerMode, TimerSession};

    #[test]
    fn rejects_invalid_or_reversed_ranges() {
        let service = StatisticsService::new(SqliteRepository::in_memory().expect("repository"));
        assert!(service.snapshot(Some("not-a-date"), None, 20).is_err());
        assert!(service
            .snapshot(Some("2026-08-11"), Some("2026-08-10"), 20)
            .is_err());
    }

    #[test]
    fn caps_recent_session_requests_at_fifty() {
        let mut repository = SqliteRepository::in_memory().expect("repository");
        for index in 0..60 {
            repository
                .create_session(&TimerSession {
                    id: format!("session-{index}"),
                    completion_event_id: Some(format!("completion-{index}")),
                    mode: TimerMode::Focus,
                    started_at: i64::from(index) * 1_000,
                    ended_at: i64::from(index) * 1_000 + 500,
                    planned_duration_seconds: 60,
                    actual_duration_seconds: 60,
                    status: SessionStatus::Completed,
                    date: "2026-08-10".into(),
                    created_at: i64::from(index) * 1_000 + 500,
                })
                .expect("insert session");
        }
        let service = StatisticsService::new(repository);

        let snapshot = service.snapshot(None, None, 500).expect("snapshot");

        assert_eq!(snapshot.recent_sessions.len(), 50);
        assert_eq!(snapshot.recent_sessions[0].id, "session-59");
    }
}
