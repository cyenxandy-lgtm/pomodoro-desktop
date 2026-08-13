use crate::desktop::{dispatch_desktop_action, DesktopAction};
use serde::Serialize;
use std::collections::BTreeSet;
use std::sync::Mutex;
use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ShortcutAction {
    StartPause,
    Reset,
    Skip,
    ToggleWindow,
}

impl ShortcutAction {
    fn accelerator(self) -> &'static str {
        match self {
            Self::StartPause => "Ctrl+Alt+Space",
            Self::Reset => "Ctrl+Alt+R",
            Self::Skip => "Ctrl+Alt+S",
            Self::ToggleWindow => "Ctrl+Alt+P",
        }
    }

    fn desktop_action(self) -> DesktopAction {
        match self {
            Self::StartPause => DesktopAction::StartPause,
            Self::Reset => DesktopAction::Reset,
            Self::Skip => DesktopAction::Skip,
            Self::ToggleWindow => DesktopAction::ToggleWindow,
        }
    }
}

const SHORTCUT_ACTIONS: [ShortcutAction; 4] = [
    ShortcutAction::StartPause,
    ShortcutAction::Reset,
    ShortcutAction::Skip,
    ShortcutAction::ToggleWindow,
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    pub enabled: bool,
    pub unavailable: Vec<String>,
}

pub trait ShortcutRegistrar {
    fn register(&self, accelerator: &str) -> Result<(), String>;
    fn unregister(&self, accelerator: &str) -> Result<(), String>;
}

struct TauriShortcutRegistrar<'a, R: Runtime> {
    app: &'a AppHandle<R>,
}

impl<R: Runtime> ShortcutRegistrar for TauriShortcutRegistrar<'_, R> {
    fn register(&self, accelerator: &str) -> Result<(), String> {
        self.app
            .global_shortcut()
            .register(accelerator)
            .map_err(|error| error.to_string())
    }

    fn unregister(&self, accelerator: &str) -> Result<(), String> {
        self.app
            .global_shortcut()
            .unregister(accelerator)
            .map_err(|error| error.to_string())
    }
}

#[derive(Default)]
struct RegistrationState {
    enabled: bool,
    registered: BTreeSet<ShortcutAction>,
    unavailable: BTreeSet<ShortcutAction>,
}

impl RegistrationState {
    fn configure(&mut self, registrar: &impl ShortcutRegistrar, enabled: bool) -> ShortcutStatus {
        if !enabled {
            for action in std::mem::take(&mut self.registered) {
                if let Err(error) = registrar.unregister(action.accelerator()) {
                    log::warn!(
                        "Failed to unregister global shortcut {}: {error}",
                        action.accelerator()
                    );
                }
            }
            self.enabled = false;
            self.unavailable.clear();
            return self.status();
        }

        self.enabled = true;
        self.unavailable.clear();
        for action in SHORTCUT_ACTIONS {
            if self.registered.contains(&action) {
                continue;
            }
            match registrar.register(action.accelerator()) {
                Ok(()) => {
                    self.registered.insert(action);
                }
                Err(error) => {
                    self.unavailable.insert(action);
                    log::warn!(
                        "Global shortcut {} is unavailable: {error}",
                        action.accelerator()
                    );
                }
            }
        }
        self.status()
    }

    fn status(&self) -> ShortcutStatus {
        ShortcutStatus {
            enabled: self.enabled,
            unavailable: self
                .unavailable
                .iter()
                .map(|action| action.accelerator().to_string())
                .collect(),
        }
    }
}

pub struct ShortcutManager {
    state: Mutex<RegistrationState>,
}

impl ShortcutManager {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(RegistrationState::default()),
        }
    }

    pub fn configure<R: Runtime>(&self, app: &AppHandle<R>, enabled: bool) -> ShortcutStatus {
        self.state
            .lock()
            .expect("shortcut registration state")
            .configure(&TauriShortcutRegistrar { app }, enabled)
    }
}

pub fn handle_shortcut<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }

    let Some(action) = action_for_shortcut(shortcut) else {
        return;
    };
    if let Err(error) = dispatch_desktop_action(app, action.desktop_action()) {
        log::error!("Global shortcut action failed: {error}");
    }
}

fn action_for_shortcut(shortcut: &Shortcut) -> Option<ShortcutAction> {
    let modifiers = Modifiers::CONTROL | Modifiers::ALT;
    if shortcut.matches(modifiers, Code::Space) {
        Some(ShortcutAction::StartPause)
    } else if shortcut.matches(modifiers, Code::KeyR) {
        Some(ShortcutAction::Reset)
    } else if shortcut.matches(modifiers, Code::KeyS) {
        Some(ShortcutAction::Skip)
    } else if shortcut.matches(modifiers, Code::KeyP) {
        Some(ShortcutAction::ToggleWindow)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[derive(Default)]
    struct FakeRegistrar {
        calls: Mutex<Vec<String>>,
        failures: BTreeMap<String, String>,
    }

    impl ShortcutRegistrar for FakeRegistrar {
        fn register(&self, accelerator: &str) -> Result<(), String> {
            self.calls
                .lock()
                .expect("calls")
                .push(format!("register:{accelerator}"));
            self.failures.get(accelerator).cloned().map_or(Ok(()), Err)
        }

        fn unregister(&self, accelerator: &str) -> Result<(), String> {
            self.calls
                .lock()
                .expect("calls")
                .push(format!("unregister:{accelerator}"));
            Ok(())
        }
    }

    #[test]
    fn enable_disable_and_duplicate_enable_are_idempotent() {
        let registrar = FakeRegistrar::default();
        let mut state = RegistrationState::default();

        assert!(state.configure(&registrar, true).unavailable.is_empty());
        state.configure(&registrar, true);
        assert_eq!(registrar.calls.lock().expect("calls").len(), 4);

        state.configure(&registrar, false);
        let calls = registrar.calls.lock().expect("calls");
        assert_eq!(
            calls
                .iter()
                .filter(|call| call.starts_with("unregister"))
                .count(),
            4
        );
    }

    #[test]
    fn registration_failure_is_reported_without_blocking_other_shortcuts() {
        let registrar = FakeRegistrar {
            failures: BTreeMap::from([("Ctrl+Alt+Space".to_string(), "occupied".to_string())]),
            ..FakeRegistrar::default()
        };
        let mut state = RegistrationState::default();

        let status = state.configure(&registrar, true);

        assert!(status.enabled);
        assert_eq!(status.unavailable, ["Ctrl+Alt+Space"]);
        assert_eq!(state.registered.len(), 3);
    }

    #[test]
    fn shortcut_mapping_targets_shared_desktop_actions() {
        let modifiers = Some(Modifiers::CONTROL | Modifiers::ALT);
        for (code, expected) in [
            (Code::Space, DesktopAction::StartPause),
            (Code::KeyR, DesktopAction::Reset),
            (Code::KeyS, DesktopAction::Skip),
            (Code::KeyP, DesktopAction::ToggleWindow),
        ] {
            let shortcut = Shortcut::new(modifiers, code);
            assert_eq!(
                action_for_shortcut(&shortcut).map(ShortcutAction::desktop_action),
                Some(expected)
            );
        }
    }
}
