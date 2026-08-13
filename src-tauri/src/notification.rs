use crate::timer::TimerMode;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::plugin::PermissionState;
use tauri_plugin_notification::NotificationExt;

pub trait CompletionNotification: Send + Sync {
    fn configure(&self, enabled: bool) -> Result<bool, String>;
    fn notify(&self, mode: TimerMode) -> Result<(), String>;
}

pub struct NativeNotificationService {
    app_handle: tauri::AppHandle,
    enabled: AtomicBool,
    available: AtomicBool,
}

impl NativeNotificationService {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            app_handle,
            enabled: AtomicBool::new(true),
            available: AtomicBool::new(false),
        }
    }

    fn ensure_permission(&self) -> Result<bool, String> {
        let notification = self.app_handle.notification();
        let state = notification
            .permission_state()
            .map_err(|error| error.to_string())?;
        let granted = match state {
            PermissionState::Granted => true,
            PermissionState::Denied => false,
            PermissionState::Prompt | PermissionState::PromptWithRationale => notification
                .request_permission()
                .map(|permission| permission == PermissionState::Granted)
                .map_err(|error| error.to_string())?,
        };
        self.available.store(granted, Ordering::Release);
        Ok(granted)
    }
}

impl CompletionNotification for NativeNotificationService {
    fn configure(&self, enabled: bool) -> Result<bool, String> {
        self.enabled.store(enabled, Ordering::Release);
        if enabled {
            return self.ensure_permission();
        }
        Ok(true)
    }

    fn notify(&self, mode: TimerMode) -> Result<(), String> {
        if !self.enabled.load(Ordering::Acquire) {
            return Ok(());
        }
        if !self.available.load(Ordering::Acquire) && !self.ensure_permission()? {
            return Ok(());
        }

        let (title, body) = match mode {
            TimerMode::Focus => ("专注完成", "休息一下吧 🍅"),
            TimerMode::ShortBreak => ("休息结束", "准备开始下一轮专注"),
            TimerMode::LongBreak => ("长休息结束", "准备开始新一组专注"),
        };
        self.app_handle
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|error| error.to_string())
    }
}

#[cfg(test)]
pub struct RecordingNotification {
    enabled: AtomicBool,
    denied: AtomicBool,
    modes: std::sync::Mutex<Vec<TimerMode>>,
}

#[cfg(test)]
impl RecordingNotification {
    pub fn new() -> Self {
        Self {
            enabled: AtomicBool::new(true),
            denied: AtomicBool::new(false),
            modes: std::sync::Mutex::new(Vec::new()),
        }
    }

    pub fn deny(&self) {
        self.denied.store(true, Ordering::Release);
    }

    pub fn modes(&self) -> Vec<TimerMode> {
        self.modes.lock().expect("notifications").clone()
    }
}

#[cfg(test)]
impl CompletionNotification for RecordingNotification {
    fn configure(&self, enabled: bool) -> Result<bool, String> {
        self.enabled.store(enabled, Ordering::Release);
        Ok(!enabled || !self.denied.load(Ordering::Acquire))
    }

    fn notify(&self, mode: TimerMode) -> Result<(), String> {
        if self.denied.load(Ordering::Acquire) {
            return Err("notification permission denied".into());
        }
        if self.enabled.load(Ordering::Acquire) {
            self.modes
                .lock()
                .map_err(|_| "notification lock".to_owned())?
                .push(mode);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recording_notification_reports_denied_permission_without_enabling_delivery() {
        let notification = RecordingNotification::new();
        notification.deny();

        assert_eq!(notification.configure(true), Ok(false));
        assert_eq!(notification.configure(false), Ok(true));
    }
}
