use super::clock::{Clock, DateResolver};
use super::core::{CoreTransition, PersistenceChange, SessionDraft, TimerCore};
use super::domain::{
    DailySessionRecord, TimerEvent, TimerMode, TimerSession, TimerSettings, TimerSnapshot,
};
use crate::audio::CompletionAudio;
use crate::db::{CreateSessionResult, SqliteRepository};
use crate::notification::CompletionNotification;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use uuid::Uuid;

const TICK_INTERVAL: Duration = Duration::from_millis(250);

pub trait TimerEventSink: Send + Sync {
    fn emit(&self, event: &TimerEvent) -> Result<(), String>;
}

#[derive(Clone)]
pub struct TimerManager {
    shared: Arc<SharedTimerManager>,
}

struct SharedTimerManager {
    runtime: Mutex<TimerRuntime>,
    clock: Arc<dyn Clock>,
    date_resolver: Arc<dyn DateResolver>,
    event_sink: Arc<dyn TimerEventSink>,
    audio: Arc<dyn CompletionAudio>,
    notification: Arc<dyn CompletionNotification>,
    initialized: AtomicBool,
    shutdown: AtomicBool,
    worker: Mutex<Option<JoinHandle<()>>>,
}

struct TimerRuntime {
    core: TimerCore,
    repository: SqliteRepository,
}

impl TimerManager {
    pub fn new(
        repository: SqliteRepository,
        clock: Arc<dyn Clock>,
        date_resolver: Arc<dyn DateResolver>,
        event_sink: Arc<dyn TimerEventSink>,
        audio: Arc<dyn CompletionAudio>,
        notification: Arc<dyn CompletionNotification>,
    ) -> Result<Self, String> {
        let active = repository.load_active()?;
        let runtime_state = repository.load_runtime_state()?;
        let core = match active {
            Some(active) => TimerCore::restore(
                TimerSettings::default(),
                active,
                runtime_state.completed_focuses_in_cycle,
                clock.now_ms(),
            )?,
            None => TimerCore::new_in_mode(
                TimerSettings::default(),
                runtime_state.current_mode,
                runtime_state.completed_focuses_in_cycle,
            )?,
        };
        Ok(Self {
            shared: Arc::new(SharedTimerManager {
                runtime: Mutex::new(TimerRuntime { core, repository }),
                clock,
                date_resolver,
                event_sink,
                audio,
                notification,
                initialized: AtomicBool::new(false),
                shutdown: AtomicBool::new(false),
                worker: Mutex::new(None),
            }),
        })
    }

    pub fn initialize(
        &self,
        settings: TimerSettings,
        sound_enabled: bool,
        sound_volume: f32,
        desktop_notifications: bool,
    ) -> Result<TimerSnapshot, String> {
        self.shared.audio.configure(sound_enabled, sound_volume)?;
        if let Err(error) = self.shared.notification.configure(desktop_notifications) {
            log::warn!("Desktop notification configuration failed: {error}");
        }
        let now = self.shared.clock.now_ms();
        let (snapshot, events) = {
            let mut runtime = self.lock_runtime()?;
            let mut events = Vec::new();
            if let Some(event) = runtime.configure(
                settings,
                now,
                unique_event_id("configured"),
                self.shared.date_resolver.as_ref(),
            )? {
                events.push(event);
            }
            // Process termination cannot auto-start or deliver effects in the past.
            events.extend(runtime.reconcile(
                now,
                unique_event_id("tick"),
                self.shared.date_resolver.as_ref(),
                false,
            )?);
            (runtime.core.snapshot(), events)
        };
        self.shared.initialized.store(true, Ordering::Release);
        self.dispatch(events, false);
        Ok(snapshot)
    }

    pub fn configure(&self, settings: TimerSettings) -> Result<TimerSnapshot, String> {
        self.run_command(|runtime, now, date_resolver| {
            let mut events =
                runtime.reconcile(now, unique_event_id("tick"), date_resolver, true)?;
            if let Some(event) =
                runtime.configure(settings, now, unique_event_id("configured"), date_resolver)?
            {
                events.push(event);
            }
            Ok(events)
        })
    }

    pub fn configure_sound(&self, enabled: bool, volume: f32) -> Result<(), String> {
        self.shared.audio.configure(enabled, volume)
    }

    pub fn configure_notifications(&self, enabled: bool) -> bool {
        self.shared
            .notification
            .configure(enabled)
            .unwrap_or_else(|error| {
                log::warn!("Desktop notification configuration failed: {error}");
                false
            })
    }

    pub fn snapshot(&self) -> Result<TimerSnapshot, String> {
        self.run_command(|runtime, now, date_resolver| {
            runtime.reconcile(now, unique_event_id("tick"), date_resolver, true)
        })
    }

    pub fn start(&self) -> Result<TimerSnapshot, String> {
        self.run_transition_command(|runtime, now, date_resolver| {
            runtime.apply(
                |core| Ok(core.start(now, unique_event_id("session"), unique_event_id("started"))),
                now,
                date_resolver,
            )
        })
    }

    pub fn pause(&self) -> Result<TimerSnapshot, String> {
        self.run_transition_command(|runtime, now, date_resolver| {
            runtime.apply(
                |core| Ok(core.pause(now, unique_event_id("paused"))),
                now,
                date_resolver,
            )
        })
    }

    pub fn resume(&self) -> Result<TimerSnapshot, String> {
        self.run_transition_command(|runtime, now, date_resolver| {
            runtime.apply(
                |core| Ok(core.resume(now, unique_event_id("resumed"))),
                now,
                date_resolver,
            )
        })
    }

    pub fn reset(&self) -> Result<TimerSnapshot, String> {
        self.run_transition_command(|runtime, now, date_resolver| {
            runtime.apply(
                |core| Ok(Some(core.reset(now, unique_event_id("reset")))),
                now,
                date_resolver,
            )
        })
    }

    pub fn skip(&self) -> Result<TimerSnapshot, String> {
        self.run_transition_command(|runtime, now, date_resolver| {
            runtime.apply(
                |core| Ok(core.skip(now, unique_event_id("skipped"))),
                now,
                date_resolver,
            )
        })
    }

    pub fn select_mode(&self, mode: TimerMode) -> Result<TimerSnapshot, String> {
        self.run_transition_command(|runtime, now, date_resolver| {
            runtime.apply(
                |core| Ok(core.select_mode(mode, now, unique_event_id("modeChanged"))),
                now,
                date_resolver,
            )
        })
    }

    pub fn reconcile(&self) -> Result<TimerSnapshot, String> {
        self.snapshot()
    }

    pub fn create_session(&self, mut session: TimerSession) -> Result<CreateSessionResult, String> {
        if session.created_at == 0 {
            session.created_at = self.shared.clock.now_ms();
        }
        self.lock_runtime()?.repository.create_session(&session)
    }

    pub fn update_session(&self, session: TimerSession) -> Result<(), String> {
        self.lock_runtime()?.repository.update_session(&session)
    }

    pub fn sessions_by_date(&self, date: &str) -> Result<Vec<TimerSession>, String> {
        self.lock_runtime()?.repository.get_by_date(date)
    }

    pub fn recent_sessions(&self, limit: u32) -> Result<Vec<TimerSession>, String> {
        self.lock_runtime()?.repository.get_recent(limit)
    }

    pub fn daily_records(&self) -> Result<Vec<DailySessionRecord>, String> {
        self.lock_runtime()?.repository.get_daily_records()
    }

    pub fn start_worker(&self) -> Result<(), String> {
        let mut worker = self
            .shared
            .worker
            .lock()
            .map_err(|_| "Timer worker lock is poisoned.".to_owned())?;
        if worker.is_some() {
            return Ok(());
        }

        let manager = self.clone();
        *worker = Some(
            std::thread::Builder::new()
                .name("pomodoro-timer".into())
                .spawn(move || loop {
                    std::thread::sleep(TICK_INTERVAL);
                    if manager.shared.shutdown.load(Ordering::Acquire) {
                        break;
                    }
                    if manager.shared.initialized.load(Ordering::Acquire) {
                        if let Err(error) = manager.reconcile() {
                            log::error!("Timer reconciliation failed: {error}");
                        }
                    }
                })
                .map_err(|error| format!("Failed to start timer worker: {error}"))?,
        );
        Ok(())
    }

    pub fn shutdown(&self) {
        self.shared.shutdown.store(true, Ordering::Release);
        let worker = self
            .shared
            .worker
            .lock()
            .ok()
            .and_then(|mut worker| worker.take());
        if let Some(worker) = worker {
            if worker.join().is_err() {
                log::error!("Timer worker terminated unexpectedly.");
            }
        }
    }

    fn run_transition_command(
        &self,
        command: impl FnOnce(
            &mut TimerRuntime,
            i64,
            &dyn DateResolver,
        ) -> Result<Option<TimerEvent>, String>,
    ) -> Result<TimerSnapshot, String> {
        self.run_command(|runtime, now, date_resolver| {
            let events = runtime.reconcile(now, unique_event_id("tick"), date_resolver, true)?;
            if has_completion(&events) {
                return Ok(events);
            }
            let mut events = events;
            if let Some(event) = command(runtime, now, date_resolver)? {
                events.push(event);
            }
            Ok(events)
        })
    }

    fn run_command(
        &self,
        command: impl FnOnce(
            &mut TimerRuntime,
            i64,
            &dyn DateResolver,
        ) -> Result<Vec<TimerEvent>, String>,
    ) -> Result<TimerSnapshot, String> {
        let now = self.shared.clock.now_ms();
        let (snapshot, events) = {
            let mut runtime = self.lock_runtime()?;
            let events = command(&mut runtime, now, self.shared.date_resolver.as_ref())?;
            (runtime.core.snapshot(), events)
        };
        self.dispatch(events, true);
        Ok(snapshot)
    }

    fn dispatch(&self, events: Vec<TimerEvent>, allow_completion_effects: bool) {
        for event in events {
            if event.is_completion() && allow_completion_effects {
                if let Err(error) = self.shared.audio.notify() {
                    log::error!("Completion audio failed: {error}");
                }
                if let Some(mode) = event.mode {
                    if let Err(error) = self.shared.notification.notify(mode) {
                        log::warn!("Completion notification failed: {error}");
                    }
                }
            }
            if let Err(error) = self.shared.event_sink.emit(&event) {
                log::error!("Timer event delivery failed: {error}");
            }
        }
    }

    fn lock_runtime(&self) -> Result<std::sync::MutexGuard<'_, TimerRuntime>, String> {
        self.shared
            .runtime
            .lock()
            .map_err(|_| "Timer runtime lock is poisoned.".to_owned())
    }
}

impl TimerRuntime {
    fn configure(
        &mut self,
        settings: TimerSettings,
        now: i64,
        event_id: String,
        date_resolver: &dyn DateResolver,
    ) -> Result<Option<TimerEvent>, String> {
        self.apply(
            |core| core.configure(settings, now, event_id),
            now,
            date_resolver,
        )
    }

    fn reconcile(
        &mut self,
        now: i64,
        event_id: String,
        date_resolver: &dyn DateResolver,
        allow_auto_start: bool,
    ) -> Result<Vec<TimerEvent>, String> {
        Ok(self
            .apply(
                |core| {
                    Ok(core.reconcile(now, event_id, unique_event_id("session"), allow_auto_start))
                },
                now,
                date_resolver,
            )?
            .into_iter()
            .collect())
    }

    fn apply(
        &mut self,
        transition: impl FnOnce(&mut TimerCore) -> Result<Option<CoreTransition>, String>,
        now: i64,
        date_resolver: &dyn DateResolver,
    ) -> Result<Option<TimerEvent>, String> {
        let previous_core = self.core.clone();
        let Some(transition) = transition(&mut self.core)? else {
            return Ok(None);
        };

        match self.persist(&transition, now, date_resolver) {
            Ok(should_emit) => Ok(should_emit.then_some(transition.event)),
            Err(error) => {
                self.core = previous_core;
                Err(error)
            }
        }
    }

    fn persist(
        &mut self,
        transition: &CoreTransition,
        now: i64,
        date_resolver: &dyn DateResolver,
    ) -> Result<bool, String> {
        match &transition.persistence {
            PersistenceChange::None => Ok(true),
            PersistenceChange::SaveActive(active) => {
                self.repository.save_active(active, now)?;
                Ok(true)
            }
            PersistenceChange::SaveIdle {
                mode,
                completed_focuses_in_cycle,
            } => {
                self.repository
                    .save_idle(*mode, *completed_focuses_in_cycle, now)?;
                Ok(true)
            }
            PersistenceChange::Finalize {
                session,
                current_mode,
                completed_focuses_in_cycle,
                next_active,
            } => {
                let session = finalize_session(session, now, date_resolver)?;
                Ok(self.repository.finalize_transition(
                    &session,
                    *current_mode,
                    *completed_focuses_in_cycle,
                    next_active.as_ref(),
                    now,
                )? == CreateSessionResult::Created)
            }
        }
    }
}

fn finalize_session(
    draft: &SessionDraft,
    created_at: i64,
    date_resolver: &dyn DateResolver,
) -> Result<TimerSession, String> {
    Ok(TimerSession {
        id: draft.id.clone(),
        completion_event_id: draft.completion_event_id.clone(),
        mode: draft.mode,
        started_at: draft.started_at,
        ended_at: draft.ended_at,
        planned_duration_seconds: draft.planned_duration_seconds,
        actual_duration_seconds: draft.actual_duration_seconds,
        status: draft.status,
        date: date_resolver.local_date_key(draft.ended_at)?,
        created_at,
    })
}

fn unique_event_id(prefix: &str) -> String {
    format!("{prefix}:{}", Uuid::new_v4())
}

fn has_completion(events: &[TimerEvent]) -> bool {
    events.iter().any(TimerEvent::is_completion)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::RecordingNotifier;
    use crate::notification::RecordingNotification;
    use crate::timer::clock::test_support::{FakeClock, ThresholdDateResolver};
    use crate::timer::domain::{SessionStatus, TimerEventType, TimerStatus};
    use std::path::PathBuf;

    const START: i64 = 1_000_000;

    struct RecordingSink {
        events: Mutex<Vec<TimerEvent>>,
    }

    impl RecordingSink {
        fn new() -> Self {
            Self {
                events: Mutex::new(Vec::new()),
            }
        }

        fn events(&self) -> Vec<TimerEvent> {
            self.events.lock().expect("events").clone()
        }
    }

    impl TimerEventSink for RecordingSink {
        fn emit(&self, event: &TimerEvent) -> Result<(), String> {
            self.events
                .lock()
                .map_err(|_| "events lock".to_owned())?
                .push(event.clone());
            Ok(())
        }
    }

    struct Harness {
        path: PathBuf,
        clock: Arc<FakeClock>,
        sink: Arc<RecordingSink>,
        audio: Arc<RecordingNotifier>,
        notification: Arc<RecordingNotification>,
        manager: TimerManager,
    }

    impl Harness {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("pomodoro-test-{}.sqlite3", Uuid::new_v4()));
            let clock = Arc::new(FakeClock::new(START));
            let sink = Arc::new(RecordingSink::new());
            let audio = Arc::new(RecordingNotifier::new());
            let notification = Arc::new(RecordingNotification::new());
            let manager = create_manager(
                &path,
                Arc::clone(&clock),
                Arc::clone(&sink),
                Arc::clone(&audio),
                Arc::clone(&notification),
            );
            Self {
                path,
                clock,
                sink,
                audio,
                notification,
                manager,
            }
        }

        fn initialize(&self, settings: TimerSettings, notifications: bool) {
            self.manager
                .initialize(settings, true, 0.5, notifications)
                .expect("initialize");
        }

        fn finish_current(&self) {
            let duration = self.manager.snapshot().expect("snapshot").remaining_seconds;
            self.clock.advance(i64::from(duration) * 1_000);
            self.manager.reconcile().expect("complete");
        }
    }

    impl Drop for Harness {
        fn drop(&mut self) {
            for candidate in [
                self.path.clone(),
                PathBuf::from(format!("{}-wal", self.path.display())),
                PathBuf::from(format!("{}-shm", self.path.display())),
            ] {
                let _ = std::fs::remove_file(candidate);
            }
        }
    }

    fn settings() -> TimerSettings {
        TimerSettings {
            focus_minutes: 1,
            break_minutes: 1,
            long_break_minutes: 1,
            long_break_interval: 2,
            auto_start_break: false,
            auto_start_focus: false,
            test_duration_seconds: None,
        }
    }

    fn create_manager(
        path: &PathBuf,
        clock: Arc<FakeClock>,
        sink: Arc<RecordingSink>,
        audio: Arc<RecordingNotifier>,
        notification: Arc<RecordingNotification>,
    ) -> TimerManager {
        TimerManager::new(
            SqliteRepository::open(path).expect("repository"),
            clock,
            Arc::new(ThresholdDateResolver {
                midnight: i64::MAX,
                before: "2026-08-10",
                after: "2026-08-11",
            }),
            sink,
            audio,
            notification,
        )
        .expect("manager")
    }

    #[test]
    fn cycle_and_idle_mode_survive_restart() {
        let harness = Harness::new();
        harness.initialize(settings(), true);
        harness.manager.start().expect("start");
        harness.finish_current();
        assert_eq!(
            harness.manager.snapshot().expect("snapshot").mode,
            TimerMode::ShortBreak
        );

        let restored = create_manager(
            &harness.path,
            Arc::clone(&harness.clock),
            Arc::new(RecordingSink::new()),
            Arc::new(RecordingNotifier::new()),
            Arc::new(RecordingNotification::new()),
        );
        let snapshot = restored
            .initialize(settings(), true, 0.5, true)
            .expect("restore");
        assert_eq!(snapshot.mode, TimerMode::ShortBreak);
        assert_eq!(snapshot.completed_focuses_in_cycle, 1);
    }

    #[test]
    fn paused_timer_survives_restart() {
        let harness = Harness::new();
        harness.initialize(settings(), true);
        harness.manager.start().expect("start");
        harness.clock.advance(10_000);
        harness.manager.pause().expect("pause");
        let restored = create_manager(
            &harness.path,
            Arc::clone(&harness.clock),
            Arc::new(RecordingSink::new()),
            Arc::new(RecordingNotifier::new()),
            Arc::new(RecordingNotification::new()),
        );
        let snapshot = restored
            .initialize(settings(), true, 0.5, true)
            .expect("restore");
        assert_eq!(snapshot.status, TimerStatus::Paused);
        assert_eq!(snapshot.remaining_seconds, 50);
    }

    #[test]
    fn focus_short_break_and_long_break_each_notify_once() {
        let harness = Harness::new();
        harness.initialize(settings(), true);
        for mode in [
            TimerMode::Focus,
            TimerMode::ShortBreak,
            TimerMode::LongBreak,
        ] {
            harness.manager.select_mode(mode).expect("mode");
            harness.manager.start().expect("start");
            harness.finish_current();
        }
        assert_eq!(
            harness.notification.modes(),
            vec![
                TimerMode::Focus,
                TimerMode::ShortBreak,
                TimerMode::LongBreak
            ]
        );
        assert_eq!(harness.audio.count(), 3);
        assert_eq!(
            harness
                .sink
                .events()
                .iter()
                .filter(|event| event.event_type == TimerEventType::Completed)
                .count(),
            3
        );
    }

    #[test]
    fn repeated_reconciliation_does_not_duplicate_effects_or_sessions() {
        let harness = Harness::new();
        harness.initialize(settings(), true);
        harness.manager.start().expect("start");
        harness.clock.advance(60_000);
        for _ in 0..8 {
            harness.manager.reconcile().expect("reconcile");
        }
        assert_eq!(harness.notification.modes().len(), 1);
        assert_eq!(harness.audio.count(), 1);
        assert_eq!(
            harness.manager.recent_sessions(10).expect("sessions").len(),
            1
        );
    }

    #[test]
    fn disabled_notification_does_not_block_completion() {
        let harness = Harness::new();
        harness.initialize(settings(), false);
        harness.manager.start().expect("start");
        harness.finish_current();
        assert!(harness.notification.modes().is_empty());
        assert_eq!(
            harness.manager.daily_records().expect("daily")[0].completed_pomodoros,
            1
        );
    }

    #[test]
    fn denied_notification_does_not_roll_back_completion() {
        let harness = Harness::new();
        harness.notification.deny();
        harness.initialize(settings(), true);
        harness.manager.start().expect("start");
        harness.finish_current();
        assert_eq!(harness.audio.count(), 1);
        assert_eq!(
            harness.manager.recent_sessions(10).expect("sessions")[0].status,
            SessionStatus::Completed
        );
    }

    #[test]
    fn expired_restart_reconciles_without_late_audio_notification_or_auto_start() {
        let harness = Harness::new();
        let mut automatic = settings();
        automatic.auto_start_break = true;
        harness.initialize(automatic, true);
        harness.manager.start().expect("start");
        harness.clock.advance(120_000);

        let audio = Arc::new(RecordingNotifier::new());
        let notification = Arc::new(RecordingNotification::new());
        let restored = create_manager(
            &harness.path,
            Arc::clone(&harness.clock),
            Arc::new(RecordingSink::new()),
            Arc::clone(&audio),
            Arc::clone(&notification),
        );
        let snapshot = restored
            .initialize(automatic, true, 0.5, true)
            .expect("reconcile startup");
        assert_eq!(snapshot.status, TimerStatus::Idle);
        assert_eq!(snapshot.mode, TimerMode::ShortBreak);
        assert_eq!(audio.count(), 0);
        assert!(notification.modes().is_empty());
        assert_eq!(restored.recent_sessions(10).expect("sessions").len(), 1);
    }

    #[test]
    fn skip_persists_skipped_session_without_statistics_or_effects() {
        let harness = Harness::new();
        let mut automatic = settings();
        automatic.auto_start_break = true;
        harness.initialize(automatic, true);
        harness.manager.start().expect("start");
        harness.clock.advance(10_000);
        let snapshot = harness.manager.skip().expect("skip");
        assert_eq!(snapshot.status, TimerStatus::Idle);
        assert_eq!(snapshot.completed_focuses_in_cycle, 0);
        assert_eq!(
            harness.manager.recent_sessions(1).expect("session")[0].status,
            SessionStatus::Skipped
        );
        assert!(harness.manager.daily_records().expect("daily").is_empty());
        assert_eq!(harness.audio.count(), 0);
        assert!(harness.notification.modes().is_empty());
    }

    #[test]
    fn completion_wins_reset_and_mode_switch_at_boundary() {
        for use_reset in [true, false] {
            let harness = Harness::new();
            harness.initialize(settings(), true);
            harness.manager.start().expect("start");
            harness.clock.advance(60_000);
            if use_reset {
                harness.manager.reset().expect("reset");
            } else {
                harness
                    .manager
                    .select_mode(TimerMode::LongBreak)
                    .expect("mode switch");
            }
            assert_eq!(
                harness.manager.recent_sessions(1).expect("session")[0].status,
                SessionStatus::Completed
            );
            assert_eq!(harness.notification.modes().len(), 1);
        }
    }

    #[test]
    fn concurrent_start_and_completion_are_exactly_once() {
        let harness = Harness::new();
        harness.initialize(settings(), true);
        let starters: Vec<_> = (0..8)
            .map(|_| {
                let manager = harness.manager.clone();
                std::thread::spawn(move || manager.start().expect("start"))
            })
            .collect();
        for starter in starters {
            starter.join().expect("start thread");
        }
        harness.clock.advance(60_000);
        let reconcilers: Vec<_> = (0..8)
            .map(|_| {
                let manager = harness.manager.clone();
                std::thread::spawn(move || manager.reconcile().expect("reconcile"))
            })
            .collect();
        for reconciler in reconcilers {
            reconciler.join().expect("reconcile thread");
        }
        assert_eq!(
            harness.manager.recent_sessions(10).expect("sessions").len(),
            1
        );
        assert_eq!(harness.notification.modes().len(), 1);
    }
}
