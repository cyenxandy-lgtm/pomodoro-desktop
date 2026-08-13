use rusqlite::Connection;

const SCHEMA_VERSION: i64 = 3;

pub fn migrate(connection: &Connection) -> rusqlite::Result<()> {
    let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    match version {
        0 if table_exists(connection, "sessions")? => {
            migrate_v1_to_v2(connection)?;
            migrate_v2_to_v3(connection)?;
        }
        0 => {
            create_v2(connection)?;
            migrate_v2_to_v3(connection)?;
        }
        1 => {
            migrate_v1_to_v2(connection)?;
            migrate_v2_to_v3(connection)?;
        }
        2 => migrate_v2_to_v3(connection)?,
        3 => ensure_v3(connection)?,
        other => {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Unsupported database schema version: {other}"
            )))
        }
    }
    Ok(())
}

fn migrate_v2_to_v3(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch("BEGIN IMMEDIATE;")?;
    let result = connection
        .execute_batch(
            r#"
            CREATE INDEX IF NOT EXISTS sessions_v3_statistics_idx
                ON sessions(mode, status, date);
            "#,
        )
        .and_then(|_| {
            connection.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            connection.execute_batch("COMMIT;")
        });
    if result.is_err() {
        let _ = connection.execute_batch("ROLLBACK;");
    }
    result
}

fn ensure_v3(connection: &Connection) -> rusqlite::Result<()> {
    ensure_v2(connection)?;
    connection.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS sessions_v3_statistics_idx
            ON sessions(mode, status, date);
        "#,
    )?;
    connection.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    Ok(())
}

fn table_exists(connection: &Connection, name: &str) -> rusqlite::Result<bool> {
    connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [name],
        |row| row.get(0),
    )
}

fn create_v2(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch("BEGIN IMMEDIATE;")?;
    let result = ensure_v2(connection).and_then(|_| {
        connection.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        connection.execute_batch("COMMIT;")
    });
    if result.is_err() {
        let _ = connection.execute_batch("ROLLBACK;");
    }
    result
}

fn ensure_v2(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY NOT NULL,
            completion_event_id TEXT UNIQUE,
            mode TEXT NOT NULL CHECK (mode IN ('focus', 'short_break', 'long_break')),
            started_at INTEGER NOT NULL,
            ended_at INTEGER NOT NULL,
            planned_duration_seconds INTEGER NOT NULL CHECK (planned_duration_seconds >= 0),
            actual_duration_seconds INTEGER NOT NULL CHECK (actual_duration_seconds >= 0),
            status TEXT NOT NULL CHECK (status IN ('completed', 'cancelled', 'skipped')),
            date TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS sessions_v2_date_idx ON sessions(date);
        CREATE INDEX IF NOT EXISTS sessions_v2_ended_at_idx ON sessions(ended_at DESC);

        CREATE TABLE IF NOT EXISTS active_timer (
            singleton_id INTEGER PRIMARY KEY NOT NULL CHECK (singleton_id = 1),
            session_id TEXT NOT NULL UNIQUE,
            mode TEXT NOT NULL CHECK (mode IN ('focus', 'short_break', 'long_break')),
            status TEXT NOT NULL CHECK (status IN ('running', 'paused')),
            started_at INTEGER NOT NULL,
            target_end_time INTEGER,
            paused_remaining_seconds INTEGER,
            planned_duration_seconds INTEGER NOT NULL CHECK (planned_duration_seconds > 0),
            updated_at INTEGER NOT NULL,
            CHECK (
                (status = 'running' AND target_end_time IS NOT NULL AND paused_remaining_seconds IS NULL)
                OR
                (status = 'paused' AND target_end_time IS NULL AND paused_remaining_seconds IS NOT NULL)
            )
        );

        CREATE TABLE IF NOT EXISTS runtime_state (
            singleton_id INTEGER PRIMARY KEY NOT NULL CHECK (singleton_id = 1),
            current_mode TEXT NOT NULL DEFAULT 'focus'
                CHECK (current_mode IN ('focus', 'short_break', 'long_break')),
            completed_focuses_in_cycle INTEGER NOT NULL DEFAULT 0
                CHECK (completed_focuses_in_cycle >= 0),
            updated_at INTEGER NOT NULL
        );

        INSERT INTO runtime_state (
            singleton_id, current_mode, completed_focuses_in_cycle, updated_at
        )
        VALUES (1, 'focus', 0, 0)
        ON CONFLICT(singleton_id) DO NOTHING;
        "#,
    )?;
    connection.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    Ok(())
}

/**
 * SQLite cannot alter CHECK constraints in place. The v1 tables are retained
 * as read-only archives while v2 tables receive a lossless normalized copy.
 */
fn migrate_v1_to_v2(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        r#"
        BEGIN IMMEDIATE;

        ALTER TABLE sessions RENAME TO sessions_v1_archive;
        ALTER TABLE active_timer RENAME TO active_timer_v1_archive;

        CREATE TABLE sessions (
            id TEXT PRIMARY KEY NOT NULL,
            completion_event_id TEXT UNIQUE,
            mode TEXT NOT NULL CHECK (mode IN ('focus', 'short_break', 'long_break')),
            started_at INTEGER NOT NULL,
            ended_at INTEGER NOT NULL,
            planned_duration_seconds INTEGER NOT NULL CHECK (planned_duration_seconds >= 0),
            actual_duration_seconds INTEGER NOT NULL CHECK (actual_duration_seconds >= 0),
            status TEXT NOT NULL CHECK (status IN ('completed', 'cancelled', 'skipped')),
            date TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        INSERT INTO sessions (
            id, completion_event_id, mode, started_at, ended_at,
            planned_duration_seconds, actual_duration_seconds, status, date, created_at
        )
        SELECT
            id,
            completion_event_id,
            CASE mode
                WHEN 'break' THEN 'short_break'
                WHEN 'shortBreak' THEN 'short_break'
                WHEN 'short_break' THEN 'short_break'
                ELSE mode
            END,
            started_at,
            ended_at,
            planned_duration_seconds,
            actual_duration_seconds,
            status,
            date,
            created_at
        FROM sessions_v1_archive;

        CREATE INDEX sessions_v2_date_idx ON sessions(date);
        CREATE INDEX sessions_v2_ended_at_idx ON sessions(ended_at DESC);

        CREATE TABLE active_timer (
            singleton_id INTEGER PRIMARY KEY NOT NULL CHECK (singleton_id = 1),
            session_id TEXT NOT NULL UNIQUE,
            mode TEXT NOT NULL CHECK (mode IN ('focus', 'short_break', 'long_break')),
            status TEXT NOT NULL CHECK (status IN ('running', 'paused')),
            started_at INTEGER NOT NULL,
            target_end_time INTEGER,
            paused_remaining_seconds INTEGER,
            planned_duration_seconds INTEGER NOT NULL CHECK (planned_duration_seconds > 0),
            updated_at INTEGER NOT NULL,
            CHECK (
                (status = 'running' AND target_end_time IS NOT NULL AND paused_remaining_seconds IS NULL)
                OR
                (status = 'paused' AND target_end_time IS NULL AND paused_remaining_seconds IS NOT NULL)
            )
        );

        INSERT INTO active_timer (
            singleton_id, session_id, mode, status, started_at, target_end_time,
            paused_remaining_seconds, planned_duration_seconds, updated_at
        )
        SELECT
            singleton_id,
            session_id,
            CASE mode
                WHEN 'break' THEN 'short_break'
                WHEN 'shortBreak' THEN 'short_break'
                WHEN 'short_break' THEN 'short_break'
                ELSE mode
            END,
            status,
            started_at,
            target_end_time,
            paused_remaining_seconds,
            planned_duration_seconds,
            updated_at
        FROM active_timer_v1_archive;

        CREATE TABLE runtime_state (
            singleton_id INTEGER PRIMARY KEY NOT NULL CHECK (singleton_id = 1),
            current_mode TEXT NOT NULL DEFAULT 'focus'
                CHECK (current_mode IN ('focus', 'short_break', 'long_break')),
            completed_focuses_in_cycle INTEGER NOT NULL DEFAULT 0
                CHECK (completed_focuses_in_cycle >= 0),
            updated_at INTEGER NOT NULL
        );
        INSERT INTO runtime_state (
            singleton_id, current_mode, completed_focuses_in_cycle, updated_at
        )
        VALUES (1, 'focus', 0, 0);

        PRAGMA user_version = 2;
        COMMIT;
        "#,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn legacy_database() -> Connection {
        let connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(
                r#"
                CREATE TABLE sessions (
                    id TEXT PRIMARY KEY NOT NULL,
                    completion_event_id TEXT UNIQUE,
                    mode TEXT NOT NULL CHECK (mode IN ('focus', 'break', 'shortBreak')),
                    started_at INTEGER NOT NULL,
                    ended_at INTEGER NOT NULL,
                    planned_duration_seconds INTEGER NOT NULL,
                    actual_duration_seconds INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    date TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX sessions_date_idx ON sessions(date);
                CREATE INDEX sessions_ended_at_idx ON sessions(ended_at DESC);
                CREATE TABLE active_timer (
                    singleton_id INTEGER PRIMARY KEY NOT NULL,
                    session_id TEXT NOT NULL UNIQUE,
                    mode TEXT NOT NULL,
                    status TEXT NOT NULL,
                    started_at INTEGER NOT NULL,
                    target_end_time INTEGER,
                    paused_remaining_seconds INTEGER,
                    planned_duration_seconds INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                INSERT INTO sessions VALUES (
                    'legacy-break', 'completion:legacy-break', 'break', 1000, 2000,
                    60, 60, 'completed', '2026-08-10', 2000
                );
                INSERT INTO active_timer VALUES (
                    1, 'active-break', 'shortBreak', 'paused', 3000, NULL, 30, 60, 4000
                );
                PRAGMA user_version = 1;
                "#,
            )
            .expect("legacy schema");
        connection
    }

    #[test]
    fn v1_migration_preserves_sessions_and_normalizes_break_modes() {
        let connection = legacy_database();
        migrate(&connection).expect("migrate");

        let session: (String, String) = connection
            .query_row("SELECT id, mode FROM sessions", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .expect("session");
        assert_eq!(session, ("legacy-break".into(), "short_break".into()));
        let active_mode: String = connection
            .query_row("SELECT mode FROM active_timer", [], |row| row.get(0))
            .expect("active timer");
        assert_eq!(active_mode, "short_break");
        assert!(table_exists(&connection, "sessions_v1_archive").expect("archive"));
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM sessions_v1_archive", [], |row| row
                    .get::<_, i64>(0))
                .expect("archive count"),
            1
        );
    }

    #[test]
    fn latest_migration_is_idempotent() {
        let connection = legacy_database();
        migrate(&connection).expect("first migration");
        migrate(&connection).expect("second migration");
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM sessions", [], |row| row
                    .get::<_, i64>(0))
                .expect("count"),
            1
        );
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("version");
        assert_eq!(version, 3);
        assert!(connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'sessions_v3_statistics_idx')",
                [],
                |row| row.get::<_, bool>(0),
            )
            .expect("statistics index"));
    }

    #[test]
    fn v2_database_upgrades_without_rebuilding_sessions() {
        let connection = legacy_database();
        migrate_v1_to_v2(&connection).expect("prepare v2");
        let before: i64 = connection
            .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
            .expect("before count");

        migrate(&connection).expect("upgrade to v3");

        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("version");
        let after: i64 = connection
            .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
            .expect("after count");
        assert_eq!(version, 3);
        assert_eq!(after, before);
        assert!(table_exists(&connection, "sessions_v1_archive").expect("archive preserved"));
    }
}
