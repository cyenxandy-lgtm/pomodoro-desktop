use crate::db::CreateSessionResult;
use crate::desktop::DesktopLifecycle;
use crate::shortcuts::{ShortcutManager, ShortcutStatus};
use crate::statistics::{StatisticsService, StatisticsSnapshot};
use crate::timer::{
    DailySessionRecord, TimerManager, TimerMode, TimerSession, TimerSettings, TimerSnapshot,
};
use crate::window_state::WindowManager;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn desktop_configure_lifecycle(
    lifecycle: State<'_, DesktopLifecycle>,
    close_to_tray: bool,
    minimize_to_tray: bool,
) {
    lifecycle.configure(close_to_tray, minimize_to_tray);
}

#[tauri::command]
pub fn desktop_configure_productivity(
    app: AppHandle,
    shortcut_manager: State<'_, ShortcutManager>,
    window_manager: State<'_, WindowManager>,
    global_shortcuts_enabled: bool,
    always_on_top: bool,
    remember_window_position: bool,
    compact_mode: bool,
) -> ShortcutStatus {
    let shortcut_status = shortcut_manager.configure(&app, global_shortcuts_enabled);
    window_manager.configure(&app, compact_mode, always_on_top, remember_window_position);
    shortcut_status
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

#[tauri::command]
pub fn statistics_get_snapshot(
    service: State<'_, StatisticsService>,
    start_date: Option<String>,
    end_date: Option<String>,
    recent_limit: u32,
) -> Result<StatisticsSnapshot, String> {
    service.snapshot(start_date.as_deref(), end_date.as_deref(), recent_limit)
}
