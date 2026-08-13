use super::domain::{
    ActiveTimerState, SessionStatus, TimerEvent, TimerEventType, TimerMode, TimerSettings,
    TimerSnapshot, TimerStatus,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionDraft {
    pub id: String,
    pub completion_event_id: Option<String>,
    pub mode: TimerMode,
    pub started_at: i64,
    pub ended_at: i64,
    pub planned_duration_seconds: u32,
    pub actual_duration_seconds: u32,
    pub status: SessionStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PersistenceChange {
    None,
    SaveActive(ActiveTimerState),
    Finalize {
        session: SessionDraft,
        current_mode: TimerMode,
        completed_focuses_in_cycle: u32,
        next_active: Option<ActiveTimerState>,
    },
    SaveIdle {
        mode: TimerMode,
        completed_focuses_in_cycle: u32,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoreTransition {
    pub event: TimerEvent,
    pub persistence: PersistenceChange,
}

#[derive(Debug, Clone)]
pub struct TimerCore {
    settings: TimerSettings,
    snapshot: TimerSnapshot,
}

impl TimerCore {
    #[cfg(test)]
    pub fn new(settings: TimerSettings, completed_focuses_in_cycle: u32) -> Result<Self, String> {
        Self::new_in_mode(settings, TimerMode::Focus, completed_focuses_in_cycle)
    }

    pub fn new_in_mode(
        settings: TimerSettings,
        mode: TimerMode,
        completed_focuses_in_cycle: u32,
    ) -> Result<Self, String> {
        let settings = settings.validate()?;
        Ok(Self {
            settings,
            snapshot: TimerSnapshot::idle(mode, settings, completed_focuses_in_cycle),
        })
    }

    pub fn restore(
        settings: TimerSettings,
        active: ActiveTimerState,
        completed_focuses_in_cycle: u32,
        now: i64,
    ) -> Result<Self, String> {
        let settings = settings.validate()?;
        active.validate()?;
        let remaining_seconds = match active.status {
            TimerStatus::Running => remaining_seconds(
                active
                    .target_end_time
                    .ok_or_else(|| "Running timer is missing targetEndTime.".to_owned())?,
                now,
            ),
            TimerStatus::Paused => active
                .paused_remaining_seconds
                .ok_or_else(|| "Paused timer is missing remaining seconds.".to_owned())?,
            TimerStatus::Idle => return Err("Idle timer cannot be restored as active.".into()),
        };

        Ok(Self {
            settings,
            snapshot: TimerSnapshot {
                mode: active.mode,
                status: active.status,
                remaining_seconds,
                duration_seconds: active.planned_duration_seconds,
                started_at: Some(active.started_at),
                target_end_time: active.target_end_time,
                session_id: Some(active.session_id),
                completed_focuses_in_cycle,
            },
        })
    }

    pub fn snapshot(&self) -> TimerSnapshot {
        self.snapshot.clone()
    }

    pub fn configure(
        &mut self,
        settings: TimerSettings,
        now: i64,
        event_id: String,
    ) -> Result<Option<CoreTransition>, String> {
        self.settings = settings.validate()?;
        if self.snapshot.status != TimerStatus::Idle {
            return Ok(None);
        }

        let next_snapshot = TimerSnapshot::idle(
            self.snapshot.mode,
            self.settings,
            self.snapshot.completed_focuses_in_cycle,
        );
        if next_snapshot.duration_seconds == self.snapshot.duration_seconds {
            return Ok(None);
        }
        self.snapshot = next_snapshot;
        Ok(Some(CoreTransition {
            event: TimerEvent::simple(TimerEventType::Tick, event_id, now, self.snapshot()),
            persistence: PersistenceChange::None,
        }))
    }

    pub fn start(
        &mut self,
        now: i64,
        session_id: String,
        event_id: String,
    ) -> Option<CoreTransition> {
        if !self.start_internal(now, session_id.clone()) {
            return None;
        }

        let mut event = TimerEvent::simple(TimerEventType::Started, event_id, now, self.snapshot());
        event.session_id = Some(session_id);
        Some(CoreTransition {
            event,
            persistence: PersistenceChange::SaveActive(self.active_state()?),
        })
    }

    pub fn pause(&mut self, now: i64, event_id: String) -> Option<CoreTransition> {
        if self.snapshot.status != TimerStatus::Running {
            return None;
        }
        let target_end_time = self.snapshot.target_end_time?;
        let next_remaining = remaining_seconds(target_end_time, now);
        if next_remaining == 0 {
            return None;
        }

        self.snapshot.status = TimerStatus::Paused;
        self.snapshot.remaining_seconds = next_remaining;
        self.snapshot.target_end_time = None;
        let session_id = self.snapshot.session_id.clone()?;

        let mut event = TimerEvent::simple(TimerEventType::Paused, event_id, now, self.snapshot());
        event.session_id = Some(session_id);
        Some(CoreTransition {
            event,
            persistence: PersistenceChange::SaveActive(self.active_state()?),
        })
    }

    pub fn resume(&mut self, now: i64, event_id: String) -> Option<CoreTransition> {
        if self.snapshot.status != TimerStatus::Paused || self.snapshot.remaining_seconds == 0 {
            return None;
        }

        self.snapshot.status = TimerStatus::Running;
        self.snapshot.target_end_time = Some(
            now.saturating_add(i64::from(self.snapshot.remaining_seconds).saturating_mul(1_000)),
        );
        let session_id = self.snapshot.session_id.clone()?;

        let mut event = TimerEvent::simple(TimerEventType::Resumed, event_id, now, self.snapshot());
        event.session_id = Some(session_id);
        Some(CoreTransition {
            event,
            persistence: PersistenceChange::SaveActive(self.active_state()?),
        })
    }

    pub fn reset(&mut self, now: i64, event_id: String) -> CoreTransition {
        let cancelled = self.session_draft(SessionStatus::Cancelled, now);
        let cancelled_session_id = self.snapshot.session_id.clone();
        let mode = self.snapshot.mode;
        let cycle = self.snapshot.completed_focuses_in_cycle;
        self.snapshot = TimerSnapshot::idle(mode, self.settings, cycle);

        let mut event = TimerEvent::simple(TimerEventType::Reset, event_id, now, self.snapshot());
        event.cancelled_session_id = cancelled_session_id;
        CoreTransition {
            event,
            persistence: cancelled
                .map(|session| PersistenceChange::Finalize {
                    session,
                    current_mode: mode,
                    completed_focuses_in_cycle: cycle,
                    next_active: None,
                })
                .unwrap_or(PersistenceChange::SaveIdle {
                    mode,
                    completed_focuses_in_cycle: cycle,
                }),
        }
    }

    pub fn skip(&mut self, now: i64, event_id: String) -> Option<CoreTransition> {
        let skipped = self.session_draft(SessionStatus::Skipped, now)?;
        let skipped_session_id = self.snapshot.session_id.clone()?;
        let previous_mode = self.snapshot.mode;
        let cycle = if previous_mode == TimerMode::LongBreak {
            0
        } else {
            self.snapshot.completed_focuses_in_cycle
        };
        let next_mode = match previous_mode {
            TimerMode::Focus => TimerMode::ShortBreak,
            TimerMode::ShortBreak | TimerMode::LongBreak => TimerMode::Focus,
        };
        self.snapshot = TimerSnapshot::idle(next_mode, self.settings, cycle);

        let mut event = TimerEvent::simple(TimerEventType::Skipped, event_id, now, self.snapshot());
        event.previous_mode = Some(previous_mode);
        event.skipped_session_id = Some(skipped_session_id);
        Some(CoreTransition {
            event,
            persistence: PersistenceChange::Finalize {
                session: skipped,
                current_mode: next_mode,
                completed_focuses_in_cycle: cycle,
                // Skip is explicitly never auto-started.
                next_active: None,
            },
        })
    }

    pub fn select_mode(
        &mut self,
        mode: TimerMode,
        now: i64,
        event_id: String,
    ) -> Option<CoreTransition> {
        if mode == self.snapshot.mode {
            return None;
        }

        let previous_mode = self.snapshot.mode;
        let cancelled = self.session_draft(SessionStatus::Cancelled, now);
        let cancelled_session_id = self.snapshot.session_id.clone();
        let cycle = self.snapshot.completed_focuses_in_cycle;
        self.snapshot = TimerSnapshot::idle(mode, self.settings, cycle);

        let mut event =
            TimerEvent::simple(TimerEventType::ModeChanged, event_id, now, self.snapshot());
        event.previous_mode = Some(previous_mode);
        event.cancelled_session_id = cancelled_session_id;
        Some(CoreTransition {
            event,
            persistence: cancelled
                .map(|session| PersistenceChange::Finalize {
                    session,
                    current_mode: mode,
                    completed_focuses_in_cycle: cycle,
                    next_active: None,
                })
                .unwrap_or(PersistenceChange::SaveIdle {
                    mode,
                    completed_focuses_in_cycle: cycle,
                }),
        })
    }

    /**
     * Wall-clock semantics: completion is recorded at targetEndTime. Auto-start
     * begins at observation time so a sleeping machine does not fabricate cycles.
     */
    pub fn reconcile(
        &mut self,
        now: i64,
        event_id: String,
        auto_session_id: String,
        allow_auto_start: bool,
    ) -> Option<CoreTransition> {
        if self.snapshot.status != TimerStatus::Running {
            return None;
        }
        let target_end_time = self.snapshot.target_end_time?;
        let next_remaining = remaining_seconds(target_end_time, now);
        if next_remaining > 0 {
            if next_remaining == self.snapshot.remaining_seconds {
                return None;
            }
            self.snapshot.remaining_seconds = next_remaining;
            return Some(CoreTransition {
                event: TimerEvent::simple(TimerEventType::Tick, event_id, now, self.snapshot()),
                persistence: PersistenceChange::None,
            });
        }

        let completed_mode = self.snapshot.mode;
        let session_id = self.snapshot.session_id.clone()?;
        let started_at = self.snapshot.started_at?;
        let planned_duration_seconds = self.snapshot.duration_seconds;
        let completion_event_id = format!("completion:{session_id}");
        let session = SessionDraft {
            id: session_id.clone(),
            completion_event_id: Some(completion_event_id.clone()),
            mode: completed_mode,
            started_at,
            ended_at: target_end_time,
            planned_duration_seconds,
            actual_duration_seconds: planned_duration_seconds,
            status: SessionStatus::Completed,
        };

        let (next_mode, cycle) = match completed_mode {
            TimerMode::Focus => {
                let cycle = self.snapshot.completed_focuses_in_cycle.saturating_add(1);
                let mode = if cycle >= self.settings.long_break_interval {
                    TimerMode::LongBreak
                } else {
                    TimerMode::ShortBreak
                };
                (mode, cycle)
            }
            TimerMode::ShortBreak => (TimerMode::Focus, self.snapshot.completed_focuses_in_cycle),
            TimerMode::LongBreak => (TimerMode::Focus, 0),
        };
        self.snapshot = TimerSnapshot::idle(next_mode, self.settings, cycle);
        let should_auto_start = match completed_mode {
            TimerMode::Focus => self.settings.auto_start_break,
            TimerMode::ShortBreak | TimerMode::LongBreak => self.settings.auto_start_focus,
        };
        if should_auto_start && allow_auto_start {
            let _ = self.start_internal(now, auto_session_id);
        }

        let mut event = TimerEvent::simple(
            TimerEventType::Completed,
            completion_event_id,
            now,
            self.snapshot(),
        );
        event.session_id = Some(session_id);
        event.mode = Some(completed_mode);
        event.started_at = Some(started_at);
        event.completed_at = Some(target_end_time);
        event.planned_duration_seconds = Some(planned_duration_seconds);
        Some(CoreTransition {
            event,
            persistence: PersistenceChange::Finalize {
                session,
                current_mode: next_mode,
                completed_focuses_in_cycle: cycle,
                next_active: self.active_state(),
            },
        })
    }

    fn start_internal(&mut self, now: i64, session_id: String) -> bool {
        if self.snapshot.status != TimerStatus::Idle || self.snapshot.remaining_seconds == 0 {
            return false;
        }
        self.snapshot.status = TimerStatus::Running;
        self.snapshot.duration_seconds = self.snapshot.remaining_seconds;
        self.snapshot.started_at = Some(now);
        self.snapshot.target_end_time = Some(
            now.saturating_add(i64::from(self.snapshot.remaining_seconds).saturating_mul(1_000)),
        );
        self.snapshot.session_id = Some(session_id);
        true
    }

    fn active_state(&self) -> Option<ActiveTimerState> {
        let session_id = self.snapshot.session_id.clone()?;
        let started_at = self.snapshot.started_at?;
        Some(ActiveTimerState {
            session_id,
            mode: self.snapshot.mode,
            status: self.snapshot.status,
            started_at,
            target_end_time: self.snapshot.target_end_time,
            paused_remaining_seconds: (self.snapshot.status == TimerStatus::Paused)
                .then_some(self.snapshot.remaining_seconds),
            planned_duration_seconds: self.snapshot.duration_seconds,
        })
    }

    fn session_draft(&self, status: SessionStatus, ended_at: i64) -> Option<SessionDraft> {
        if self.snapshot.status == TimerStatus::Idle {
            return None;
        }
        let planned_duration_seconds = self.snapshot.duration_seconds;
        Some(SessionDraft {
            id: self.snapshot.session_id.clone()?,
            completion_event_id: None,
            mode: self.snapshot.mode,
            started_at: self.snapshot.started_at?,
            ended_at,
            planned_duration_seconds,
            actual_duration_seconds: planned_duration_seconds
                .saturating_sub(self.snapshot.remaining_seconds),
            status,
        })
    }
}

pub fn remaining_seconds(target_end_time: i64, now: i64) -> u32 {
    if target_end_time <= now {
        return 0;
    }
    let milliseconds = target_end_time.saturating_sub(now);
    u32::try_from(milliseconds.saturating_add(999) / 1_000).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    const START: i64 = 1_000_000;

    fn settings() -> TimerSettings {
        TimerSettings {
            focus_minutes: 1,
            break_minutes: 2,
            long_break_minutes: 3,
            long_break_interval: 4,
            auto_start_break: false,
            auto_start_focus: false,
        }
    }

    fn core(cycle: u32) -> TimerCore {
        TimerCore::new(settings(), cycle).expect("valid timer")
    }

    fn complete(timer: &mut TimerCore, session: &str) -> CoreTransition {
        timer.start(START, session.into(), "started".into());
        timer
            .reconcile(START + 60_000, "tick".into(), "auto".into(), true)
            .expect("completion")
    }

    #[test]
    fn start_pause_resume_and_reset_preserve_cycle() {
        let mut timer = core(3);
        timer.start(START, "session-1".into(), "started-1".into());
        timer.pause(START + 5_200, "paused-1".into());
        assert_eq!(timer.snapshot().remaining_seconds, 55);
        timer.resume(START + 75_200, "resumed-1".into());
        let reset = timer.reset(START + 80_000, "reset-1".into());

        assert_eq!(timer.snapshot().completed_focuses_in_cycle, 3);
        let PersistenceChange::Finalize { session, .. } = reset.persistence else {
            panic!("reset must persist cancellation");
        };
        assert_eq!(session.status, SessionStatus::Cancelled);
    }

    #[test]
    fn first_focus_enters_short_break_and_fourth_enters_long_break() {
        let mut first = core(0);
        complete(&mut first, "session-1");
        assert_eq!(first.snapshot().mode, TimerMode::ShortBreak);
        assert_eq!(first.snapshot().completed_focuses_in_cycle, 1);

        let mut fourth = core(3);
        complete(&mut fourth, "session-4");
        assert_eq!(fourth.snapshot().mode, TimerMode::LongBreak);
        assert_eq!(fourth.snapshot().completed_focuses_in_cycle, 4);
    }

    #[test]
    fn long_break_completion_resets_cycle() {
        let mut timer = core(4);
        timer.select_mode(TimerMode::LongBreak, START, "mode".into());
        timer.start(START, "long-break".into(), "started".into());
        timer.reconcile(START + 180_000, "tick".into(), "next-focus".into(), true);
        assert_eq!(timer.snapshot().mode, TimerMode::Focus);
        assert_eq!(timer.snapshot().completed_focuses_in_cycle, 0);
    }

    #[test]
    fn manual_mode_switch_does_not_change_cycle() {
        let mut timer = core(3);
        timer.select_mode(TimerMode::LongBreak, START, "mode".into());
        timer.select_mode(TimerMode::Focus, START, "mode-2".into());
        assert_eq!(timer.snapshot().completed_focuses_in_cycle, 3);
    }

    #[test]
    fn skip_focus_is_skipped_and_does_not_advance_cycle() {
        let mut timer = core(3);
        timer.start(START, "focus".into(), "started".into());
        let skipped = timer.skip(START + 10_000, "skip".into()).expect("skip");
        assert_eq!(timer.snapshot().mode, TimerMode::ShortBreak);
        assert_eq!(timer.snapshot().status, TimerStatus::Idle);
        assert_eq!(timer.snapshot().completed_focuses_in_cycle, 3);
        let PersistenceChange::Finalize { session, .. } = skipped.persistence else {
            panic!("skip must finalize session");
        };
        assert_eq!(session.status, SessionStatus::Skipped);
    }

    #[test]
    fn skip_long_break_resets_cycle_without_auto_start() {
        let mut next_settings = settings();
        next_settings.auto_start_focus = true;
        let mut timer = TimerCore::new(next_settings, 4).expect("timer");
        timer.select_mode(TimerMode::LongBreak, START, "mode".into());
        timer.start(START, "long-break".into(), "started".into());
        timer.skip(START + 10_000, "skip".into());
        assert_eq!(timer.snapshot().mode, TimerMode::Focus);
        assert_eq!(timer.snapshot().status, TimerStatus::Idle);
        assert_eq!(timer.snapshot().completed_focuses_in_cycle, 0);
    }

    #[test]
    fn focus_auto_start_break_obeys_setting() {
        let mut disabled = core(0);
        complete(&mut disabled, "focus-off");
        assert_eq!(disabled.snapshot().status, TimerStatus::Idle);

        let mut enabled_settings = settings();
        enabled_settings.auto_start_break = true;
        let mut enabled = TimerCore::new(enabled_settings, 0).expect("timer");
        complete(&mut enabled, "focus-on");
        assert_eq!(enabled.snapshot().status, TimerStatus::Running);
        assert_eq!(enabled.snapshot().mode, TimerMode::ShortBreak);
        assert_eq!(enabled.snapshot().session_id.as_deref(), Some("auto"));
    }

    #[test]
    fn short_and_long_break_auto_start_focus_obey_setting() {
        let mut enabled_settings = settings();
        enabled_settings.auto_start_focus = true;

        for mode in [TimerMode::ShortBreak, TimerMode::LongBreak] {
            let mut timer = TimerCore::new(enabled_settings, 4).expect("timer");
            timer.select_mode(mode, START, "mode".into());
            timer.start(START, "break".into(), "started".into());
            let duration = i64::from(enabled_settings.duration_seconds(mode)) * 1_000;
            timer.reconcile(START + duration, "tick".into(), "next-focus".into(), true);
            assert_eq!(timer.snapshot().mode, TimerMode::Focus);
            assert_eq!(timer.snapshot().status, TimerStatus::Running);
        }
    }

    #[test]
    fn completion_uses_target_time_and_only_happens_once() {
        let mut timer = core(0);
        timer.start(START, "session-1".into(), "started".into());
        let completed = timer
            .reconcile(START + 90_000, "tick".into(), "auto".into(), true)
            .expect("completion");
        assert_eq!(completed.event.completed_at, Some(START + 60_000));
        assert_eq!(completed.event.occurred_at, START + 90_000);
        assert!(timer
            .reconcile(START + 91_000, "tick-2".into(), "auto-2".into(), true,)
            .is_none());
    }

    #[test]
    fn restored_running_timer_keeps_cycle_and_target() {
        let active = ActiveTimerState {
            session_id: "session-1".into(),
            mode: TimerMode::Focus,
            status: TimerStatus::Running,
            started_at: START,
            target_end_time: Some(START + 60_000),
            paused_remaining_seconds: None,
            planned_duration_seconds: 60,
        };
        let timer = TimerCore::restore(settings(), active, 3, START + 15_000).expect("restored");
        assert_eq!(timer.snapshot().remaining_seconds, 45);
        assert_eq!(timer.snapshot().completed_focuses_in_cycle, 3);
    }
}
