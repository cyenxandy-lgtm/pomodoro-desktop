mod audio;
mod commands;
mod db;
mod desktop;
mod notification;
mod shortcuts;
mod statistics;
mod timer;
mod window_state;

use audio::NativeSoundPlayer;
use db::SqliteRepository;
use desktop::{create_tray, DesktopLifecycle, TrayController};
use notification::NativeNotificationService;
use shortcuts::ShortcutManager;
use statistics::StatisticsService;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use timer::clock::{SystemClock, SystemLocalDateResolver};
use timer::runtime::TimerEventSink;
use timer::TimerManager;
use window_state::WindowManager;

struct TauriTimerEventSink {
    app_handle: tauri::AppHandle,
}

impl TimerEventSink for TauriTimerEventSink {
    fn emit(&self, event: &timer::domain::TimerEvent) -> Result<(), String> {
        if let Some(tray) = self.app_handle.try_state::<TrayController>() {
            if let Err(error) = tray.update(&event.snapshot) {
                log::warn!("Failed to update tray projection: {error}");
            }
        }
        self.app_handle
            .emit("timer:event", event)
            .map_err(|error| error.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let application = tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(shortcuts::handle_shortcut)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| {
            let lifecycle = window.app_handle().state::<DesktopLifecycle>();
            match event {
                tauri::WindowEvent::CloseRequested { api, .. }
                    if lifecycle.should_hide_on_close() =>
                {
                    api.prevent_close();
                    if let Some(manager) = window.app_handle().try_state::<WindowManager>() {
                        manager.capture_and_flush(window.app_handle());
                    }
                    if let Err(error) = window.hide() {
                        log::error!("Failed to hide Pomodoro window: {error}");
                    }
                }
                tauri::WindowEvent::CloseRequested { .. } => {
                    if let Some(window_manager) = window.app_handle().try_state::<WindowManager>() {
                        window_manager.capture_and_flush(window.app_handle());
                    }
                    lifecycle.mark_quitting();
                    if let Some(manager) = window.app_handle().try_state::<TimerManager>() {
                        if let Err(error) = manager.snapshot() {
                            log::error!("Final timer persistence check failed: {error}");
                        }
                    }
                    window.app_handle().exit(0);
                }
                tauri::WindowEvent::Resized(_)
                    if lifecycle.should_hide_on_minimize()
                        && window.is_minimized().unwrap_or(false) =>
                {
                    if let Some(manager) = window.app_handle().try_state::<WindowManager>() {
                        manager.capture_and_flush(window.app_handle());
                    }
                    if let Err(error) = window.hide() {
                        log::error!("Failed to hide minimized Pomodoro window: {error}");
                    }
                }
                tauri::WindowEvent::Moved(_)
                | tauri::WindowEvent::Resized(_)
                | tauri::WindowEvent::ScaleFactorChanged { .. } => {
                    if let Some(manager) = window.app_handle().try_state::<WindowManager>() {
                        manager.schedule_capture();
                    }
                }
                _ => {}
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            app.manage(DesktopLifecycle::new());
            let data_directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_directory)?;
            let window_manager = WindowManager::open(
                app.handle().clone(),
                data_directory.join("window-state.json"),
            );
            window_manager.apply_initial(app.handle());
            window_manager.schedule_capture();
            app.manage(window_manager);
            let shortcut_manager = ShortcutManager::new();
            shortcut_manager.configure(app.handle(), true);
            app.manage(shortcut_manager);
            let database_path = data_directory.join("pomodoro.sqlite3");
            let statistics_repository =
                SqliteRepository::open(&database_path).map_err(std::io::Error::other)?;
            app.manage(StatisticsService::new(statistics_repository));
            let repository =
                SqliteRepository::open(&database_path).map_err(std::io::Error::other)?;
            let manager = TimerManager::new(
                repository,
                Arc::new(SystemClock),
                Arc::new(SystemLocalDateResolver),
                Arc::new(TauriTimerEventSink {
                    app_handle: app.handle().clone(),
                }),
                Arc::new(NativeSoundPlayer::new().map_err(std::io::Error::other)?),
                Arc::new(NativeNotificationService::new(app.handle().clone())),
            )
            .map_err(std::io::Error::other)?;
            manager.start_worker().map_err(std::io::Error::other)?;
            app.manage(manager);
            let tray = create_tray(app)?;
            app.manage(tray);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::timer_initialize,
            commands::timer_get_snapshot,
            commands::timer_configure,
            commands::timer_configure_sound,
            commands::timer_configure_notifications,
            commands::timer_start,
            commands::timer_pause,
            commands::timer_resume,
            commands::timer_reset,
            commands::timer_skip,
            commands::timer_select_mode,
            commands::timer_reconcile,
            commands::desktop_configure_lifecycle,
            commands::desktop_configure_productivity,
            commands::session_create,
            commands::session_update,
            commands::session_get_by_date,
            commands::session_get_recent,
            commands::session_get_daily_records,
            commands::statistics_get_snapshot,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application");

    application.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(window_manager) = app_handle.try_state::<WindowManager>() {
                window_manager.capture_and_flush(app_handle);
            }
            if let Some(shortcut_manager) = app_handle.try_state::<ShortcutManager>() {
                shortcut_manager.configure(app_handle, false);
            }
            app_handle.state::<TimerManager>().shutdown();
        }
    });
}
