use crate::timer::{TimerManager, TimerMode, TimerSnapshot};
use crate::window_state::WindowManager;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, Runtime};

const TRAY_TOGGLE: &str = "timer-toggle";
const TRAY_RESET: &str = "timer-reset";
const TRAY_SKIP: &str = "timer-skip";
const TRAY_OPEN: &str = "window-open";
const TRAY_QUIT: &str = "app-quit";

pub struct DesktopLifecycle {
    close_to_tray: AtomicBool,
    minimize_to_tray: AtomicBool,
    quitting: AtomicBool,
}

impl DesktopLifecycle {
    pub fn new() -> Self {
        Self {
            close_to_tray: AtomicBool::new(true),
            minimize_to_tray: AtomicBool::new(false),
            quitting: AtomicBool::new(false),
        }
    }

    pub fn configure(&self, close_to_tray: bool, minimize_to_tray: bool) {
        self.close_to_tray.store(close_to_tray, Ordering::Release);
        self.minimize_to_tray
            .store(minimize_to_tray, Ordering::Release);
    }

    pub fn should_hide_on_close(&self) -> bool {
        !self.quitting.load(Ordering::Acquire) && self.close_to_tray.load(Ordering::Acquire)
    }

    pub fn should_hide_on_minimize(&self) -> bool {
        !self.quitting.load(Ordering::Acquire) && self.minimize_to_tray.load(Ordering::Acquire)
    }

    pub fn mark_quitting(&self) {
        self.quitting.store(true, Ordering::Release);
    }
}

pub struct TrayController {
    tray: TrayIcon<tauri::Wry>,
    status: MenuItem<tauri::Wry>,
    toggle: MenuItem<tauri::Wry>,
    skip: MenuItem<tauri::Wry>,
}

impl TrayController {
    pub fn update(&self, snapshot: &TimerSnapshot) -> Result<(), String> {
        let mode = mode_label(snapshot.mode);
        let time = format_time(snapshot.remaining_seconds);
        self.status
            .set_text(format!("{mode} · {time}"))
            .map_err(|error| error.to_string())?;
        self.toggle
            .set_text(match snapshot.status {
                crate::timer::domain::TimerStatus::Running => "暂停",
                crate::timer::domain::TimerStatus::Paused => "继续",
                crate::timer::domain::TimerStatus::Idle => "开始",
            })
            .map_err(|error| error.to_string())?;
        self.skip
            .set_enabled(snapshot.status != crate::timer::domain::TimerStatus::Idle)
            .map_err(|error| error.to_string())?;
        self.tray
            .set_tooltip(Some(format!("Pomodoro · {mode} · {time}")))
            .map_err(|error| error.to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DesktopAction {
    StartPause,
    Reset,
    Skip,
    ToggleWindow,
    ShowWindow,
    Quit,
}

pub trait DesktopTimerController {
    fn snapshot(&self) -> Result<TimerSnapshot, String>;
    fn start(&self) -> Result<TimerSnapshot, String>;
    fn pause(&self) -> Result<TimerSnapshot, String>;
    fn resume(&self) -> Result<TimerSnapshot, String>;
    fn reset(&self) -> Result<TimerSnapshot, String>;
    fn skip(&self) -> Result<TimerSnapshot, String>;
}

pub trait DesktopWindowController {
    fn toggle_window(&self) -> Result<(), String>;
    fn show_window(&self) -> Result<(), String>;
}

struct TauriWindowController<'a, R: Runtime> {
    app: &'a AppHandle<R>,
}

impl<R: Runtime> DesktopWindowController for TauriWindowController<'_, R> {
    fn toggle_window(&self) -> Result<(), String> {
        toggle_main_window(self.app)
    }

    fn show_window(&self) -> Result<(), String> {
        show_main_window(self.app);
        Ok(())
    }
}

impl DesktopTimerController for TimerManager {
    fn snapshot(&self) -> Result<TimerSnapshot, String> {
        TimerManager::snapshot(self)
    }

    fn start(&self) -> Result<TimerSnapshot, String> {
        TimerManager::start(self)
    }

    fn pause(&self) -> Result<TimerSnapshot, String> {
        TimerManager::pause(self)
    }

    fn resume(&self) -> Result<TimerSnapshot, String> {
        TimerManager::resume(self)
    }

    fn reset(&self) -> Result<TimerSnapshot, String> {
        TimerManager::reset(self)
    }

    fn skip(&self) -> Result<TimerSnapshot, String> {
        TimerManager::skip(self)
    }
}

pub fn execute_timer_action(
    controller: &impl DesktopTimerController,
    action: DesktopAction,
) -> Result<TimerSnapshot, String> {
    match action {
        DesktopAction::StartPause => match controller.snapshot()?.status {
            crate::timer::domain::TimerStatus::Running => controller.pause(),
            crate::timer::domain::TimerStatus::Paused => controller.resume(),
            crate::timer::domain::TimerStatus::Idle => controller.start(),
        },
        DesktopAction::Reset => controller.reset(),
        DesktopAction::Skip => controller.skip(),
        _ => Err("Action does not target the timer".to_string()),
    }
}

pub fn execute_window_action(
    controller: &impl DesktopWindowController,
    action: DesktopAction,
) -> Result<(), String> {
    match action {
        DesktopAction::ToggleWindow => controller.toggle_window(),
        DesktopAction::ShowWindow => controller.show_window(),
        _ => Err("Action does not target the desktop window".to_string()),
    }
}

pub fn dispatch_desktop_action<R: Runtime>(
    app: &AppHandle<R>,
    action: DesktopAction,
) -> Result<(), String> {
    match action {
        DesktopAction::StartPause | DesktopAction::Reset | DesktopAction::Skip => {
            let manager = app.state::<TimerManager>();
            execute_timer_action(&*manager, action).map(|_| ())
        }
        DesktopAction::ToggleWindow | DesktopAction::ShowWindow => {
            execute_window_action(&TauriWindowController { app }, action)
        }
        DesktopAction::Quit => {
            if let Some(window_manager) = app.try_state::<WindowManager>() {
                window_manager.capture_and_flush(app);
            }
            app.state::<DesktopLifecycle>().mark_quitting();
            app.state::<TimerManager>().snapshot()?;
            app.exit(0);
            Ok(())
        }
    }
}

pub fn create_tray(app: &App) -> tauri::Result<TrayController> {
    let status = MenuItem::with_id(app, "timer-status", "Focus · 25:00", false, None::<&str>)?;
    let toggle = MenuItem::with_id(app, TRAY_TOGGLE, "开始", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, TRAY_RESET, "重置", true, None::<&str>)?;
    let skip = MenuItem::with_id(app, TRAY_SKIP, "跳过", false, None::<&str>)?;
    let open = MenuItem::with_id(app, TRAY_OPEN, "打开 Pomodoro", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, TRAY_QUIT, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&status, &toggle, &reset, &skip, &open, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("Pomodoro")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let tray = builder.build(app)?;

    Ok(TrayController {
        tray,
        status,
        toggle,
        skip,
    })
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.unminimize() {
            log::warn!("Failed to restore Pomodoro window: {error}");
        }
        if let Err(error) = window.show() {
            log::warn!("Failed to show Pomodoro window: {error}");
        }
        if let Err(error) = window.set_focus() {
            log::warn!("Failed to focus Pomodoro window: {error}");
        }
    }
}

fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("Main window is unavailable".to_string());
    };
    if window.is_visible().map_err(|error| error.to_string())? {
        if let Some(window_manager) = app.try_state::<WindowManager>() {
            window_manager.capture_and_flush(app);
        }
        window.hide().map_err(|error| error.to_string())
    } else {
        show_main_window(app);
        Ok(())
    }
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let action = match event.id().as_ref() {
        TRAY_TOGGLE => Some(DesktopAction::StartPause),
        TRAY_RESET => Some(DesktopAction::Reset),
        TRAY_SKIP => Some(DesktopAction::Skip),
        TRAY_OPEN => Some(DesktopAction::ShowWindow),
        TRAY_QUIT => Some(DesktopAction::Quit),
        _ => None,
    };

    if let Some(action) = action {
        if let Err(error) = dispatch_desktop_action(app, action) {
            log::error!("Tray desktop action failed: {error}");
        }
    }
}

fn mode_label(mode: TimerMode) -> &'static str {
    match mode {
        TimerMode::Focus => "Focus",
        TimerMode::ShortBreak => "Short Break",
        TimerMode::LongBreak => "Long Break",
    }
}

fn format_time(total_seconds: u32) -> String {
    format!("{:02}:{:02}", total_seconds / 60, total_seconds % 60)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timer::domain::{TimerSettings, TimerStatus};
    use std::sync::Mutex;

    struct FakeController {
        status: Mutex<TimerStatus>,
        calls: Mutex<Vec<&'static str>>,
    }

    #[derive(Default)]
    struct FakeWindowController {
        calls: Mutex<Vec<&'static str>>,
    }

    impl DesktopWindowController for FakeWindowController {
        fn toggle_window(&self) -> Result<(), String> {
            self.calls.lock().expect("calls").push("toggle");
            Ok(())
        }

        fn show_window(&self) -> Result<(), String> {
            self.calls.lock().expect("calls").push("show");
            Ok(())
        }
    }

    impl FakeController {
        fn new(status: TimerStatus) -> Self {
            Self {
                status: Mutex::new(status),
                calls: Mutex::new(Vec::new()),
            }
        }

        fn result(&self, call: &'static str, status: TimerStatus) -> TimerSnapshot {
            self.calls.lock().expect("calls").push(call);
            *self.status.lock().expect("status") = status;
            TimerSnapshot {
                status,
                ..TimerSnapshot::idle(TimerMode::Focus, TimerSettings::default(), 0)
            }
        }
    }

    impl DesktopTimerController for FakeController {
        fn snapshot(&self) -> Result<TimerSnapshot, String> {
            Ok(TimerSnapshot {
                status: *self.status.lock().expect("status"),
                ..TimerSnapshot::idle(TimerMode::Focus, TimerSettings::default(), 0)
            })
        }

        fn start(&self) -> Result<TimerSnapshot, String> {
            Ok(self.result("start", TimerStatus::Running))
        }

        fn pause(&self) -> Result<TimerSnapshot, String> {
            Ok(self.result("pause", TimerStatus::Paused))
        }

        fn resume(&self) -> Result<TimerSnapshot, String> {
            Ok(self.result("resume", TimerStatus::Running))
        }

        fn reset(&self) -> Result<TimerSnapshot, String> {
            Ok(self.result("reset", TimerStatus::Idle))
        }

        fn skip(&self) -> Result<TimerSnapshot, String> {
            Ok(self.result("skip", TimerStatus::Idle))
        }
    }

    #[test]
    fn start_pause_action_uses_the_single_timer_controller() {
        for (status, expected) in [
            (TimerStatus::Idle, "start"),
            (TimerStatus::Running, "pause"),
            (TimerStatus::Paused, "resume"),
        ] {
            let controller = FakeController::new(status);
            execute_timer_action(&controller, DesktopAction::StartPause).expect("action");
            assert_eq!(
                controller.calls.lock().expect("calls").as_slice(),
                &[expected]
            );
        }
    }

    #[test]
    fn reset_and_skip_actions_delegate_directly() {
        let controller = FakeController::new(TimerStatus::Running);
        execute_timer_action(&controller, DesktopAction::Reset).expect("reset");
        execute_timer_action(&controller, DesktopAction::Skip).expect("skip");
        assert_eq!(
            controller.calls.lock().expect("calls").as_slice(),
            &["reset", "skip"]
        );
    }

    #[test]
    fn window_actions_delegate_to_the_desktop_window_controller() {
        let controller = FakeWindowController::default();
        execute_window_action(&controller, DesktopAction::ToggleWindow).expect("toggle");
        execute_window_action(&controller, DesktopAction::ShowWindow).expect("show");
        assert_eq!(
            controller.calls.lock().expect("calls").as_slice(),
            &["toggle", "show"]
        );
    }
}
