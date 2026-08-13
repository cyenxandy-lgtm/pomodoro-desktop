use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow,
};

const NORMAL_DEFAULT_WIDTH: u32 = 430;
const NORMAL_DEFAULT_HEIGHT: u32 = 680;
const COMPACT_DEFAULT_WIDTH: u32 = 320;
const COMPACT_DEFAULT_HEIGHT: u32 = 160;
const SAVE_DEBOUNCE: Duration = Duration::from_millis(400);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
    #[serde(default)]
    pub position_saved: bool,
    #[serde(default = "default_scale_factor")]
    pub scale_factor: f64,
    #[serde(default)]
    pub monitor_name: Option<String>,
    #[serde(default)]
    pub monitor_offset_x: i32,
    #[serde(default)]
    pub monitor_offset_y: i32,
}

impl SavedBounds {
    fn defaults(width: u32, height: u32) -> Self {
        Self {
            x: 0,
            y: 0,
            width,
            height,
            maximized: false,
            position_saved: false,
            scale_factor: 1.0,
            monitor_name: None,
            monitor_offset_x: 0,
            monitor_offset_y: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct PersistedWindowState {
    version: u8,
    normal_bounds: SavedBounds,
    compact_bounds: SavedBounds,
    compact_mode: bool,
    always_on_top: bool,
    remember_window_position: bool,
}

impl Default for PersistedWindowState {
    fn default() -> Self {
        Self {
            version: 1,
            normal_bounds: SavedBounds::defaults(NORMAL_DEFAULT_WIDTH, NORMAL_DEFAULT_HEIGHT),
            compact_bounds: SavedBounds::defaults(COMPACT_DEFAULT_WIDTH, COMPACT_DEFAULT_HEIGHT),
            compact_mode: false,
            always_on_top: false,
            remember_window_position: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct MonitorBounds {
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub primary: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RestoredBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy)]
struct SizeLimits {
    min_width: u32,
    min_height: u32,
    max_width: Option<u32>,
    max_height: Option<u32>,
}

impl SizeLimits {
    fn normal() -> Self {
        Self {
            min_width: 360,
            min_height: 600,
            max_width: None,
            max_height: None,
        }
    }

    fn compact() -> Self {
        Self {
            min_width: 300,
            min_height: 140,
            max_width: Some(520),
            max_height: Some(260),
        }
    }
}

pub struct WindowManager {
    state: Arc<Mutex<PersistedWindowState>>,
    path: PathBuf,
    save_tx: Sender<()>,
}

impl WindowManager {
    pub fn open<R: Runtime>(app: AppHandle<R>, path: PathBuf) -> Self {
        let state = Arc::new(Mutex::new(load_state(&path)));
        let (save_tx, save_rx) = mpsc::channel();
        let worker_state = Arc::clone(&state);
        let worker_path = path.clone();
        std::thread::spawn(move || loop {
            if save_rx.recv().is_err() {
                break;
            }
            loop {
                match save_rx.recv_timeout(SAVE_DEBOUNCE) {
                    Ok(()) => continue,
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            capture_window(&app, &worker_state);
            persist_state(&worker_path, &worker_state);
        });
        Self {
            state,
            path,
            save_tx,
        }
    }

    pub fn apply_initial<R: Runtime>(&self, app: &AppHandle<R>) {
        let state = self.state.lock().expect("window state").clone();
        if let Some(window) = app.get_webview_window("main") {
            apply_window_mode(&window, &state, state.compact_mode);
            apply_always_on_top(&window, state.always_on_top);
        }
    }

    pub fn configure<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        compact_mode: bool,
        always_on_top: bool,
        remember_window_position: bool,
    ) {
        let previous_compact = self.state.lock().expect("window state").compact_mode;
        if previous_compact != compact_mode {
            capture_window(app, &self.state);
        }
        {
            let mut state = self.state.lock().expect("window state");
            state.compact_mode = compact_mode;
            state.always_on_top = always_on_top;
            state.remember_window_position = remember_window_position;
        }

        if let Some(window) = app.get_webview_window("main") {
            if previous_compact != compact_mode {
                apply_window_mode(
                    &window,
                    &self.state.lock().expect("window state"),
                    compact_mode,
                );
            }
            apply_always_on_top(&window, always_on_top);
        }
        self.flush();
    }

    pub fn schedule_capture(&self) {
        if self.save_tx.send(()).is_err() {
            log::warn!("Window state worker is unavailable");
        }
    }

    pub fn capture_and_flush<R: Runtime>(&self, app: &AppHandle<R>) {
        capture_window(app, &self.state);
        self.flush();
    }

    fn flush(&self) {
        persist_state(&self.path, &self.state);
    }
}

fn default_scale_factor() -> f64 {
    1.0
}

fn load_state(path: &Path) -> PersistedWindowState {
    match std::fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|error| {
            log::warn!("Invalid window state, using defaults: {error}");
            PersistedWindowState::default()
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            PersistedWindowState::default()
        }
        Err(error) => {
            log::warn!("Failed to read window state, using defaults: {error}");
            PersistedWindowState::default()
        }
    }
}

fn persist_state(path: &Path, state: &Arc<Mutex<PersistedWindowState>>) {
    let serialized = match serde_json::to_vec_pretty(&*state.lock().expect("window state")) {
        Ok(serialized) => serialized,
        Err(error) => {
            log::warn!("Failed to serialize window state: {error}");
            return;
        }
    };
    if let Err(error) = std::fs::write(path, serialized) {
        log::warn!("Failed to persist window state: {error}");
    }
}

fn capture_window<R: Runtime>(app: &AppHandle<R>, state: &Arc<Mutex<PersistedWindowState>>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let monitor = window.current_monitor().ok().flatten();
    let monitor_work_area = monitor.as_ref().map(|monitor| monitor.work_area());
    let bounds = SavedBounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized: window.is_maximized().unwrap_or(false),
        position_saved: true,
        scale_factor,
        monitor_name: monitor.as_ref().and_then(|monitor| monitor.name().cloned()),
        monitor_offset_x: monitor_work_area
            .map(|area| position.x - area.position.x)
            .unwrap_or(0),
        monitor_offset_y: monitor_work_area
            .map(|area| position.y - area.position.y)
            .unwrap_or(0),
    };

    let mut state = state.lock().expect("window state");
    if state.compact_mode {
        state.compact_bounds = bounds;
    } else if !bounds.maximized {
        state.normal_bounds = bounds;
    } else {
        state.normal_bounds.maximized = true;
    }
}

fn apply_window_mode<R: Runtime>(
    window: &WebviewWindow<R>,
    state: &PersistedWindowState,
    compact_mode: bool,
) {
    let limits = if compact_mode {
        SizeLimits::compact()
    } else {
        SizeLimits::normal()
    };
    if let Err(error) =
        window.set_min_size(Some(LogicalSize::new(limits.min_width, limits.min_height)))
    {
        log::warn!("Failed to set window minimum size: {error}");
    }
    let max_size = match (limits.max_width, limits.max_height) {
        (Some(width), Some(height)) => Some(LogicalSize::new(width, height)),
        _ => None,
    };
    if let Err(error) = window.set_max_size(max_size) {
        log::warn!("Failed to set window maximum size: {error}");
    }
    if compact_mode {
        let _ = window.unmaximize();
    }

    let monitors = monitor_bounds(window);
    let saved = if compact_mode {
        state.compact_bounds.clone()
    } else {
        state.normal_bounds.clone()
    };
    let should_maximize = !compact_mode && saved.maximized;
    let restored = if state.remember_window_position {
        restore_bounds(saved, &monitors, limits)
    } else {
        let defaults = if compact_mode {
            SavedBounds::defaults(COMPACT_DEFAULT_WIDTH, COMPACT_DEFAULT_HEIGHT)
        } else {
            SavedBounds::defaults(NORMAL_DEFAULT_WIDTH, NORMAL_DEFAULT_HEIGHT)
        };
        default_centered_bounds(defaults, &monitors, limits)
    };
    if let Err(error) = window.set_size(PhysicalSize::new(restored.width, restored.height)) {
        log::warn!("Failed to restore window size: {error}");
    }
    if let Err(error) = window.set_position(PhysicalPosition::new(restored.x, restored.y)) {
        log::warn!("Failed to restore window position: {error}");
    }
    if should_maximize {
        if let Err(error) = window.maximize() {
            log::warn!("Failed to restore maximized window: {error}");
        }
    }
}

trait WindowLevelController {
    fn set_window_always_on_top(&self, enabled: bool) -> Result<(), String>;
}

impl<R: Runtime> WindowLevelController for WebviewWindow<R> {
    fn set_window_always_on_top(&self, enabled: bool) -> Result<(), String> {
        self.set_always_on_top(enabled)
            .map_err(|error| error.to_string())
    }
}

fn apply_always_on_top(window: &impl WindowLevelController, enabled: bool) {
    if let Err(error) = window.set_window_always_on_top(enabled) {
        log::warn!("Failed to configure always-on-top: {error}");
    }
}

fn monitor_bounds<R: Runtime>(window: &WebviewWindow<R>) -> Vec<MonitorBounds> {
    let primary_name = window
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|monitor| monitor.name().cloned());
    window
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|monitor| {
            let area = monitor.work_area();
            let name = monitor.name().cloned();
            MonitorBounds {
                primary: name == primary_name,
                name,
                x: area.position.x,
                y: area.position.y,
                width: area.size.width,
                height: area.size.height,
                scale_factor: monitor.scale_factor(),
            }
        })
        .collect()
}

fn restore_bounds(
    saved: SavedBounds,
    monitors: &[MonitorBounds],
    limits: SizeLimits,
) -> RestoredBounds {
    let Some(primary) = select_primary(monitors) else {
        return sanitize_without_monitor(saved, limits);
    };
    if !saved.position_saved {
        return default_centered_bounds(saved, monitors, limits);
    }

    let named_monitor = saved.monitor_name.as_ref().and_then(|name| {
        monitors
            .iter()
            .find(|monitor| monitor.name.as_ref() == Some(name))
    });
    let intersecting_monitor = monitors
        .iter()
        .max_by_key(|monitor| intersection_area(&saved, monitor));
    let target = named_monitor
        .or(intersecting_monitor.filter(|monitor| intersection_area(&saved, monitor) > 0))
        .unwrap_or(primary);

    let old_scale = valid_scale(saved.scale_factor);
    let new_scale = valid_scale(target.scale_factor);
    let width = scaled_dimension(saved.width, old_scale, new_scale);
    let height = scaled_dimension(saved.height, old_scale, new_scale);
    let (candidate_x, candidate_y) = if named_monitor.is_some() {
        (
            target.x + scale_offset(saved.monitor_offset_x, old_scale, new_scale),
            target.y + scale_offset(saved.monitor_offset_y, old_scale, new_scale),
        )
    } else if intersection_area(&saved, target) > 0 {
        (saved.x, saved.y)
    } else {
        centered_position(primary, width, height)
    };

    clamp_to_monitor(candidate_x, candidate_y, width, height, target, limits)
}

fn default_centered_bounds(
    saved: SavedBounds,
    monitors: &[MonitorBounds],
    limits: SizeLimits,
) -> RestoredBounds {
    let Some(primary) = select_primary(monitors) else {
        return sanitize_without_monitor(saved, limits);
    };
    let width = saved.width;
    let height = saved.height;
    let (x, y) = centered_position(primary, width, height);
    clamp_to_monitor(x, y, width, height, primary, limits)
}

fn sanitize_without_monitor(saved: SavedBounds, limits: SizeLimits) -> RestoredBounds {
    RestoredBounds {
        x: saved.x,
        y: saved.y,
        width: clamp_dimension(saved.width, limits.min_width, limits.max_width, u32::MAX),
        height: clamp_dimension(saved.height, limits.min_height, limits.max_height, u32::MAX),
    }
}

fn clamp_to_monitor(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    monitor: &MonitorBounds,
    limits: SizeLimits,
) -> RestoredBounds {
    let scale = valid_scale(monitor.scale_factor);
    let width = clamp_dimension(
        width,
        scaled_limit(limits.min_width, scale),
        limits.max_width.map(|value| scaled_limit(value, scale)),
        monitor.width,
    );
    let height = clamp_dimension(
        height,
        scaled_limit(limits.min_height, scale),
        limits.max_height.map(|value| scaled_limit(value, scale)),
        monitor.height,
    );
    let max_x = monitor
        .x
        .saturating_add(monitor.width.saturating_sub(width) as i32);
    let max_y = monitor
        .y
        .saturating_add(monitor.height.saturating_sub(height) as i32);
    RestoredBounds {
        x: x.clamp(monitor.x, max_x.max(monitor.x)),
        y: y.clamp(monitor.y, max_y.max(monitor.y)),
        width,
        height,
    }
}

fn select_primary(monitors: &[MonitorBounds]) -> Option<&MonitorBounds> {
    monitors
        .iter()
        .find(|monitor| monitor.primary)
        .or(monitors.first())
}

fn intersection_area(saved: &SavedBounds, monitor: &MonitorBounds) -> i64 {
    let right = i64::from(saved.x) + i64::from(saved.width);
    let bottom = i64::from(saved.y) + i64::from(saved.height);
    let monitor_right = i64::from(monitor.x) + i64::from(monitor.width);
    let monitor_bottom = i64::from(monitor.y) + i64::from(monitor.height);
    let width = (right.min(monitor_right) - i64::from(saved.x).max(i64::from(monitor.x))).max(0);
    let height = (bottom.min(monitor_bottom) - i64::from(saved.y).max(i64::from(monitor.y))).max(0);
    width * height
}

fn centered_position(monitor: &MonitorBounds, width: u32, height: u32) -> (i32, i32) {
    (
        monitor.x + monitor.width.saturating_sub(width) as i32 / 2,
        monitor.y + monitor.height.saturating_sub(height) as i32 / 2,
    )
}

fn clamp_dimension(value: u32, min: u32, max: Option<u32>, monitor_max: u32) -> u32 {
    value
        .max(min.min(monitor_max))
        .min(max.unwrap_or(u32::MAX))
        .min(monitor_max)
}

fn scaled_dimension(value: u32, old_scale: f64, new_scale: f64) -> u32 {
    (f64::from(value) / old_scale * new_scale).round().max(1.0) as u32
}

fn scale_offset(value: i32, old_scale: f64, new_scale: f64) -> i32 {
    (f64::from(value) / old_scale * new_scale).round() as i32
}

fn scaled_limit(value: u32, scale: f64) -> u32 {
    (f64::from(value) * scale).round().max(1.0) as u32
}

fn valid_scale(scale: f64) -> f64 {
    if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    fn monitor(name: &str, x: i32, width: u32, scale_factor: f64, primary: bool) -> MonitorBounds {
        MonitorBounds {
            name: Some(name.to_string()),
            x,
            y: 0,
            width,
            height: 1080,
            scale_factor,
            primary,
        }
    }

    fn saved(x: i32, width: u32) -> SavedBounds {
        SavedBounds {
            x,
            y: 100,
            width,
            height: 680,
            maximized: false,
            position_saved: true,
            scale_factor: 1.0,
            monitor_name: None,
            monitor_offset_x: 0,
            monitor_offset_y: 100,
        }
    }

    #[test]
    fn restores_normal_single_screen_bounds() {
        let restored = restore_bounds(
            saved(120, 500),
            &[monitor("primary", 0, 1920, 1.0, true)],
            SizeLimits::normal(),
        );
        assert_eq!(
            restored,
            RestoredBounds {
                x: 120,
                y: 100,
                width: 500,
                height: 680
            }
        );
    }

    #[test]
    fn supports_negative_coordinate_monitor() {
        let restored = restore_bounds(
            saved(-1500, 430),
            &[
                monitor("left", -1920, 1920, 1.0, false),
                monitor("primary", 0, 1920, 1.0, true),
            ],
            SizeLimits::normal(),
        );
        assert_eq!(restored.x, -1500);
    }

    #[test]
    fn restores_named_right_hand_monitor() {
        let mut bounds = saved(2120, 500);
        bounds.monitor_name = Some("right".to_string());
        bounds.monitor_offset_x = 200;
        let restored = restore_bounds(
            bounds,
            &[
                monitor("primary", 0, 1920, 1.0, true),
                monitor("right", 1920, 2560, 1.0, false),
            ],
            SizeLimits::normal(),
        );
        assert_eq!(restored.x, 2120);
    }

    #[test]
    fn recenters_when_second_monitor_disappears() {
        let mut bounds = saved(2400, 500);
        bounds.monitor_name = Some("missing".to_string());
        let restored = restore_bounds(
            bounds,
            &[monitor("primary", 0, 1920, 1.0, true)],
            SizeLimits::normal(),
        );
        assert_eq!(restored.x, 710);
    }

    #[test]
    fn clamps_partial_offscreen_window() {
        let restored = restore_bounds(
            saved(1800, 500),
            &[monitor("primary", 0, 1920, 1.0, true)],
            SizeLimits::normal(),
        );
        assert_eq!(restored.x, 1420);
    }

    #[test]
    fn scales_size_and_offset_for_dpi_change() {
        let mut bounds = saved(100, 400);
        bounds.monitor_name = Some("primary".to_string());
        bounds.monitor_offset_x = 100;
        let restored = restore_bounds(
            bounds,
            &[monitor("primary", 0, 2880, 1.5, true)],
            SizeLimits::normal(),
        );
        assert_eq!((restored.x, restored.width), (150, 600));
    }

    #[test]
    fn enforces_minimum_and_monitor_maximum_size() {
        let tiny = restore_bounds(
            saved(0, 100),
            &[monitor("primary", 0, 1920, 1.0, true)],
            SizeLimits::normal(),
        );
        assert_eq!(tiny.width, 360);

        let huge = restore_bounds(
            saved(0, 4000),
            &[monitor("primary", 0, 1920, 1.0, true)],
            SizeLimits::normal(),
        );
        assert_eq!(huge.width, 1920);
    }

    #[test]
    fn compact_bounds_have_independent_sensible_limits() {
        let restored = restore_bounds(
            SavedBounds::defaults(900, 500),
            &[monitor("primary", 0, 1920, 1.0, true)],
            SizeLimits::compact(),
        );
        assert_eq!((restored.width, restored.height), (520, 260));
    }

    #[test]
    fn disabled_restore_uses_centered_mode_defaults() {
        let restored = default_centered_bounds(
            SavedBounds::defaults(NORMAL_DEFAULT_WIDTH, NORMAL_DEFAULT_HEIGHT),
            &[monitor("primary", 0, 1920, 1.0, true)],
            SizeLimits::normal(),
        );
        assert_eq!(
            restored,
            RestoredBounds {
                x: 745,
                y: 200,
                width: 430,
                height: 680,
            }
        );
    }

    struct FakeWindowLevel {
        enabled: AtomicBool,
        fail: bool,
    }

    impl WindowLevelController for FakeWindowLevel {
        fn set_window_always_on_top(&self, enabled: bool) -> Result<(), String> {
            self.enabled.store(enabled, Ordering::Release);
            if self.fail {
                Err("unsupported".to_string())
            } else {
                Ok(())
            }
        }
    }

    #[test]
    fn always_on_top_adapter_applies_true_and_false() {
        let window = FakeWindowLevel {
            enabled: AtomicBool::new(false),
            fail: false,
        };
        apply_always_on_top(&window, true);
        assert!(window.enabled.load(Ordering::Acquire));
        apply_always_on_top(&window, false);
        assert!(!window.enabled.load(Ordering::Acquire));
    }

    #[test]
    fn always_on_top_failure_does_not_panic() {
        let window = FakeWindowLevel {
            enabled: AtomicBool::new(false),
            fail: true,
        };
        apply_always_on_top(&window, true);
        assert!(window.enabled.load(Ordering::Acquire));
    }
}
