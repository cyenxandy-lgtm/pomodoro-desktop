use crate::db::CreateSessionResult;
use crate::desktop::DesktopLifecycle;
use crate::timer::{
    DailySessionRecord, TimerManager, TimerMode, TimerSession, TimerSettings, TimerSnapshot,
};
use tauri::State;

#[tauri::command]
pub fn desktop_configure_lifecycle(
    lifecycle: State<'_, DesktopLifecycle>,
    close_to_tray: bool,
    minimize_to_tray: bool,
) {
    lifecycle.configure(close_to_tray, minimize_to_tray);
}

#[tauri::command]
pub fn timer_initialize(
    manager: State<'_, TimerManager>,
    settings: TimerSettings,
    sound_enabled: bool,
    sound_volume: f32,
    desktop_notifications: bool,
) -> Result<TimerSnapshot, String> {
    manager.initialize(settings, sound_enabled, sound_volume, desktop_notifications)
}

#[tauri::command]
pub fn timer_get_snapshot(manager: State<'_, TimerManager>) -> Result<TimerSnapshot, String> {
    manager.snapshot()
}

#[tauri::command]
pub fn timer_configure(
    manager: State<'_, TimerManager>,
    settings: TimerSettings,
) -> Result<TimerSnapshot, String> {
    manager.configure(settings)
}

#[tauri::command]
pub fn timer_configure_sound(
    manager: State<'_, TimerManager>,
    enabled: bool,
    volume: f32,
) -> Result<(), String> {
    manager.configure_sound(enabled, volume)
}

#[tauri::command]
pub fn timer_configure_notifications(manager: State<'_, TimerManager>, enabled: bool) {
    manager.configure_notifications(enabled);
}

#[tauri::command]
pub fn timer_start(manager: State<'_, TimerManager>) -> Result<TimerSnapshot, String> {
    manager.start()
}

#[tauri::command]
pub fn timer_pause(manager: State<'_, TimerManager>) -> Result<TimerSnapshot, String> {
    manager.pause()
}

#[tauri::command]
pub fn timer_resume(manager: State<'_, TimerManager>) -> Result<TimerSnapshot, String> {
    manager.resume()
}

#[tauri::command]
pub fn timer_reset(manager: State<'_, TimerManager>) -> Result<TimerSnapshot, String> {
    manager.reset()
}

#[tauri::command]
pub fn timer_skip(manager: State<'_, TimerManager>) -> Result<TimerSnapshot, String> {
    manager.skip()
}

#[tauri::command]
pub fn timer_select_mode(
    manager: State<'_, TimerManager>,
    mode: TimerMode,
) -> Result<TimerSnapshot, String> {
    manager.select_mode(mode)
}

#[tauri::command]
pub fn timer_reconcile(manager: State<'_, TimerManager>) -> Result<TimerSnapshot, String> {
    manager.reconcile()
}

#[tauri::command]
pub fn session_create(
    manager: State<'_, TimerManager>,
    session: TimerSession,
) -> Result<CreateSessionResult, String> {
    manager.create_session(session)
}

#[tauri::command]
pub fn session_update(
    manager: State<'_, TimerManager>,
    session: TimerSession,
) -> Result<(), String> {
    manager.update_session(session)
}

#[tauri::command]
pub fn session_get_by_date(
    manager: State<'_, TimerManager>,
    date: String,
) -> Result<Vec<TimerSession>, String> {
    manager.sessions_by_date(&date)
}

#[tauri::command]
pub fn session_get_recent(
    manager: State<'_, TimerManager>,
    limit: u32,
) -> Result<Vec<TimerSession>, String> {
    manager.recent_sessions(limit)
}

#[tauri::command]
pub fn session_get_daily_records(
    manager: State<'_, TimerManager>,
) -> Result<Vec<DailySessionRecord>, String> {
    manager.daily_records()
}
