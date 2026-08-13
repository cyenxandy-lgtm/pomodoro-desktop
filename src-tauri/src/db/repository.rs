use crate::timer::domain::{
    ActiveTimerState, DailySessionRecord, RuntimeState, SessionStatus, TimerMode, TimerSession,
    TimerStatus,
};
use rusqlite::types::Type;
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::path::Path;
use std::time::Duration;

use super::schema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CreateSessionResult {
    Created,
    Duplicate,
}

pub struct SqliteRepository {
    connection: Connection,
}

impl SqliteRepository {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(error_message)?;
        Self::from_connection(connection)
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self, String> {
        let connection = Connection::open_in_memory().map_err(error_message)?;
        Self::from_connection(connection)
    }

    fn from_connection(connection: Connection) -> Result<Self, String> {
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(error_message)?;
        connection
            .pragma_update(None, "foreign_keys", true)
            .map_err(error_message)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(error_message)?;
        schema::migrate(&connection).map_err(error_message)?;
        Ok(Self { connection })
    }

    pub fn create_session(
        &mut self,
        session: &TimerSession,
    ) -> Result<CreateSessionResult, String> {
        insert_session(&self.connection, session).map_err(error_message)
    }

    pub fn update_session(&mut self, session: &TimerSession) -> Result<(), String> {
        let changed = self
            .connection
            .execute(
                r#"
                UPDATE sessions SET
                    completion_event_id = ?2,
                    mode = ?3,
                    started_at = ?4,
                    ended_at = ?5,
                    planned_duration_seconds = ?6,
                    actual_duration_seconds = ?7,
                    status = ?8,
                    date = ?9
                WHERE id = ?1
                "#,
                params![
                    &session.id,
                    session.completion_event_id.as_deref(),
                    session.mode.as_db_value(),
                    session.started_at,
                    session.ended_at,
                    session.planned_duration_seconds,
                    session.actual_duration_seconds,
                    session.status.as_db_value(),
                    &session.date,
                ],
            )
            .map_err(error_message)?;
        if changed == 1 {
            Ok(())
        } else {
            Err(format!("Cannot update unknown session: {}", session.id))
        }
    }

    pub fn get_by_date(&self, date: &str) -> Result<Vec<TimerSession>, String> {
        let mut statement = self
            .connection
            .prepare(
                r#"
                SELECT id, completion_event_id, mode, started_at, ended_at,
                       planned_duration_seconds, actual_duration_seconds, status, date, created_at
                FROM sessions
                WHERE date = ?1
                ORDER BY ended_at DESC
                "#,
            )
            .map_err(error_message)?;
        let sessions = statement
            .query_map([date], map_session)
            .map_err(error_message)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error_message)?;
        Ok(sessions)
    }

    pub fn get_recent(&self, limit: u32) -> Result<Vec<TimerSession>, String> {
        let mut statement = self
            .connection
            .prepare(
                r#"
                SELECT id, completion_event_id, mode, started_at, ended_at,
                       planned_duration_seconds, actual_duration_seconds, status, date, created_at
                FROM sessions
                ORDER BY ended_at DESC
                LIMIT ?1
                "#,
            )
            .map_err(error_message)?;
        let sessions = statement
            .query_map([i64::from(limit)], map_session)
            .map_err(error_message)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error_message)?;
        Ok(sessions)
    }

    pub fn get_daily_records(&self) -> Result<Vec<DailySessionRecord>, String> {
        let mut statement = self
            .connection
            .prepare(
                r#"
                SELECT
                    date,
                    COUNT(*) AS completed_pomodoros,
                    CAST(ROUND(SUM(planned_duration_seconds) / 60.0) AS INTEGER) AS focus_minutes
                FROM sessions
                WHERE mode = 'focus' AND status = 'completed'
                GROUP BY date
                ORDER BY date DESC
                "#,
            )
            .map_err(error_message)?;
        let rows = statement
            .query_map([], |row| {
                Ok(DailySessionRecord {
                    date: row.get(0)?,
                    completed_pomodoros: checked_u32(row.get(1)?, 1)?,
                    focus_minutes: checked_u32(row.get(2)?, 2)?,
                })
            })
            .map_err(error_message)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error_message)
    }

    pub fn save_active(&mut self, active: &ActiveTimerState, now: i64) -> Result<(), String> {
        active.validate()?;
        self.connection
            .execute(
                r#"
                INSERT INTO active_timer (
                    singleton_id, session_id, mode, status, started_at, target_end_time,
                    paused_remaining_seconds, planned_duration_seconds, updated_at
                ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ON CONFLICT(singleton_id) DO UPDATE SET
                    session_id = excluded.session_id,
                    mode = excluded.mode,
                    status = excluded.status,
                    started_at = excluded.started_at,
                    target_end_time = excluded.target_end_time,
                    paused_remaining_seconds = excluded.paused_remaining_seconds,
                    planned_duration_seconds = excluded.planned_duration_seconds,
                    updated_at = excluded.updated_at
                "#,
                params![
                    active.session_id,
                    active.mode.as_db_value(),
                    active.status.as_db_value(),
                    active.started_at,
                    active.target_end_time,
                    active.paused_remaining_seconds,
                    active.planned_duration_seconds,
                    now,
                ],
            )
            .map_err(error_message)?;
        Ok(())
    }

    pub fn load_active(&self) -> Result<Option<ActiveTimerState>, String> {
        self.connection
            .query_row(
                r#"
                SELECT session_id, mode, status, started_at, target_end_time,
                       paused_remaining_seconds, planned_duration_seconds
                FROM active_timer
                WHERE singleton_id = 1
                "#,
                [],
                |row| {
                    let active = ActiveTimerState {
                        session_id: row.get(0)?,
                        mode: parse_mode(row.get(1)?, 1)?,
                        status: parse_status(row.get(2)?, 2)?,
                        started_at: row.get(3)?,
                        target_end_time: row.get(4)?,
                        paused_remaining_seconds: optional_u32(row.get(5)?, 5)?,
                        planned_duration_seconds: checked_u32(row.get(6)?, 6)?,
                    };
                    active
                        .validate()
                        .map_err(|message| conversion_error(2, message))?;
                    Ok(active)
                },
            )
            .optional()
            .map_err(error_message)
    }

    #[cfg(test)]
    pub fn clear_active(&mut self) -> Result<(), String> {
        self.connection
            .execute("DELETE FROM active_timer WHERE singleton_id = 1", [])
            .map_err(error_message)?;
        Ok(())
    }

    pub fn load_runtime_state(&self) -> Result<RuntimeState, String> {
        self.connection
            .query_row(
                r#"
                SELECT current_mode, completed_focuses_in_cycle
                FROM runtime_state WHERE singleton_id = 1
                "#,
                [],
                |row| {
                    Ok(RuntimeState {
                        current_mode: parse_mode(row.get(0)?, 0)?,
                        completed_focuses_in_cycle: checked_u32(row.get(1)?, 1)?,
                    })
                },
            )
            .map_err(error_message)
    }

    pub fn save_idle(
        &mut self,
        mode: TimerMode,
        completed_focuses_in_cycle: u32,
        now: i64,
    ) -> Result<(), String> {
        let transaction = self.connection.transaction().map_err(error_message)?;
        transaction
            .execute("DELETE FROM active_timer WHERE singleton_id = 1", [])
            .map_err(error_message)?;
        save_runtime_state_on(&transaction, mode, completed_focuses_in_cycle, now)
            .map_err(error_message)?;
        transaction.commit().map_err(error_message)
    }

    pub fn finalize_transition(
        &mut self,
        session: &TimerSession,
        current_mode: TimerMode,
        completed_focuses_in_cycle: u32,
        next_active: Option<&ActiveTimerState>,
        now: i64,
    ) -> Result<CreateSessionResult, String> {
        let transaction = self.connection.transaction().map_err(error_message)?;
        let result = insert_session(&transaction, session).map_err(error_message)?;
        transaction
            .execute(
                "DELETE FROM active_timer WHERE singleton_id = 1 AND session_id = ?1",
                [&session.id],
            )
            .map_err(error_message)?;
        if result == CreateSessionResult::Created {
            save_runtime_state_on(&transaction, current_mode, completed_focuses_in_cycle, now)
                .map_err(error_message)?;
            if let Some(active) = next_active {
                save_active_on(&transaction, active, now).map_err(error_message)?;
            }
        }
        transaction.commit().map_err(error_message)?;
        Ok(result)
    }
}

fn save_runtime_state_on(
    connection: &Connection,
    mode: TimerMode,
    completed_focuses_in_cycle: u32,
    now: i64,
) -> rusqlite::Result<()> {
    connection.execute(
        r#"
        UPDATE runtime_state
        SET current_mode = ?1, completed_focuses_in_cycle = ?2, updated_at = ?3
        WHERE singleton_id = 1
        "#,
        params![mode.as_db_value(), completed_focuses_in_cycle, now],
    )?;
    Ok(())
}

fn save_active_on(
    connection: &Connection,
    active: &ActiveTimerState,
    now: i64,
) -> rusqlite::Result<()> {
    connection.execute(
        r#"
        INSERT INTO active_timer (
            singleton_id, session_id, mode, status, started_at, target_end_time,
            paused_remaining_seconds, planned_duration_seconds, updated_at
        ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(singleton_id) DO UPDATE SET
            session_id = excluded.session_id,
            mode = excluded.mode,
            status = excluded.status,
            started_at = excluded.started_at,
            target_end_time = excluded.target_end_time,
            paused_remaining_seconds = excluded.paused_remaining_seconds,
            planned_duration_seconds = excluded.planned_duration_seconds,
            updated_at = excluded.updated_at
        "#,
        params![
            &active.session_id,
            active.mode.as_db_value(),
            active.status.as_db_value(),
            active.started_at,
            active.target_end_time,
            active.paused_remaining_seconds,
            active.planned_duration_seconds,
            now,
        ],
    )?;
    Ok(())
}

fn insert_session(
    connection: &Connection,
    session: &TimerSession,
) -> rusqlite::Result<CreateSessionResult> {
    let changed = connection.execute(
        r#"
        INSERT INTO sessions (
            id, completion_event_id, mode, started_at, ended_at,
            planned_duration_seconds, actual_duration_seconds, status, date, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT DO NOTHING
        "#,
        params![
            &session.id,
            session.completion_event_id.as_deref(),
            session.mode.as_db_value(),
            session.started_at,
            session.ended_at,
            session.planned_duration_seconds,
            session.actual_duration_seconds,
            session.status.as_db_value(),
            &session.date,
            session.created_at,
        ],
    )?;
    Ok(if changed == 1 {
        CreateSessionResult::Created
    } else {
        CreateSessionResult::Duplicate
    })
}

fn map_session(row: &Row<'_>) -> rusqlite::Result<TimerSession> {
    Ok(TimerSession {
        id: row.get(0)?,
        completion_event_id: row.get(1)?,
        mode: parse_mode(row.get(2)?, 2)?,
        started_at: row.get(3)?,
        ended_at: row.get(4)?,
        planned_duration_seconds: checked_u32(row.get(5)?, 5)?,
        actual_duration_seconds: checked_u32(row.get(6)?, 6)?,
        status: parse_session_status(row.get(7)?, 7)?,
        date: row.get(8)?,
        created_at: row.get(9)?,
    })
}

fn parse_mode(value: String, column: usize) -> rusqlite::Result<TimerMode> {
    TimerMode::from_db_value(&value).map_err(|message| conversion_error(column, message))
}

fn parse_status(value: String, column: usize) -> rusqlite::Result<TimerStatus> {
    TimerStatus::from_db_value(&value).map_err(|message| conversion_error(column, message))
}

fn parse_session_status(value: String, column: usize) -> rusqlite::Result<SessionStatus> {
    SessionStatus::from_db_value(&value).map_err(|message| conversion_error(column, message))
}

fn checked_u32(value: i64, column: usize) -> rusqlite::Result<u32> {
    u32::try_from(value).map_err(|error| conversion_error(column, error.to_string()))
}

fn optional_u32(value: Option<i64>, column: usize) -> rusqlite::Result<Option<u32>> {
    value.map(|number| checked_u32(number, column)).transpose()
}

fn conversion_error(column: usize, message: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        column,
        Type::Text,
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            message,
        )),
    )
}

fn error_message(error: rusqlite::Error) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn completed_session(id: &str, completion_event_id: &str) -> TimerSession {
        TimerSession {
            id: id.into(),
            completion_event_id: Some(completion_event_id.into()),
            mode: TimerMode::Focus,
            started_at: 1_000,
            ended_at: 61_000,
            planned_duration_seconds: 60,
            actual_duration_seconds: 60,
            status: SessionStatus::Completed,
            date: "2026-08-10".into(),
            created_at: 61_000,
        }
    }

    fn running_active() -> ActiveTimerState {
        ActiveTimerState {
            session_id: "session-1".into(),
            mode: TimerMode::Focus,
            status: TimerStatus::Running,
            started_at: 1_000,
            target_end_time: Some(61_000),
            paused_remaining_seconds: None,
            planned_duration_seconds: 60,
        }
    }

    #[test]
    fn session_and_completion_ids_are_unique() {
        let mut repository = SqliteRepository::in_memory().expect("repository");
        let first = completed_session("session-1", "completion-1");
        assert_eq!(
            repository.create_session(&first).expect("first insert"),
            CreateSessionResult::Created
        );
        assert_eq!(
            repository.create_session(&first).expect("duplicate id"),
            CreateSessionResult::Duplicate
        );
        assert_eq!(
            repository
                .create_session(&completed_session("session-2", "completion-1"))
                .expect("duplicate completion"),
            CreateSessionResult::Duplicate
        );
        assert_eq!(repository.get_recent(10).expect("recent").len(), 1);
    }

    #[test]
    fn active_timer_round_trips_and_clears() {
        let mut repository = SqliteRepository::in_memory().expect("repository");
        repository
            .save_active(&running_active(), 2_000)
            .expect("save active");
        assert_eq!(
            repository.load_active().expect("load"),
            Some(running_active())
        );

        let paused = ActiveTimerState {
            status: TimerStatus::Paused,
            target_end_time: None,
            paused_remaining_seconds: Some(42),
            ..running_active()
        };
        repository.save_active(&paused, 3_000).expect("pause save");
        assert_eq!(repository.load_active().expect("load paused"), Some(paused));

        repository.clear_active().expect("clear");
        assert_eq!(repository.load_active().expect("empty"), None);
    }

    #[test]
    fn finalize_is_atomic_and_daily_stats_only_count_completed_focus() {
        let mut repository = SqliteRepository::in_memory().expect("repository");
        repository
            .save_active(&running_active(), 2_000)
            .expect("active");
        let session = completed_session("session-1", "completion-1");
        assert_eq!(
            repository
                .finalize_transition(&session, TimerMode::ShortBreak, 1, None, 61_000)
                .expect("finalize"),
            CreateSessionResult::Created
        );
        assert!(repository.load_active().expect("active cleared").is_none());
        assert_eq!(
            repository.load_runtime_state().expect("runtime state"),
            RuntimeState {
                current_mode: TimerMode::ShortBreak,
                completed_focuses_in_cycle: 1,
            }
        );

        let break_session = TimerSession {
            id: "break-1".into(),
            completion_event_id: Some("break-completion-1".into()),
            mode: TimerMode::ShortBreak,
            ..session.clone()
        };
        repository
            .create_session(&break_session)
            .expect("break session");
        let cancelled = TimerSession {
            id: "cancelled-1".into(),
            completion_event_id: None,
            status: SessionStatus::Cancelled,
            ..session
        };
        repository
            .create_session(&cancelled)
            .expect("cancelled session");

        assert_eq!(
            repository.get_daily_records().expect("daily"),
            vec![DailySessionRecord {
                date: "2026-08-10".into(),
                completed_pomodoros: 1,
                focus_minutes: 1,
            }]
        );
    }
}
