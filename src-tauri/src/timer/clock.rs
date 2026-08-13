use chrono::{Local, TimeZone};
use std::time::{SystemTime, UNIX_EPOCH};

pub trait Clock: Send + Sync {
    fn now_ms(&self) -> i64;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or_default()
    }
}

pub trait DateResolver: Send + Sync {
    fn local_date_key(&self, timestamp_ms: i64) -> Result<String, String>;
}

pub struct SystemLocalDateResolver;

impl DateResolver for SystemLocalDateResolver {
    fn local_date_key(&self, timestamp_ms: i64) -> Result<String, String> {
        Local
            .timestamp_millis_opt(timestamp_ms)
            .single()
            .map(|date| date.format("%Y-%m-%d").to_string())
            .ok_or_else(|| format!("Invalid completion timestamp: {timestamp_ms}"))
    }
}

#[cfg(test)]
pub mod test_support {
    use super::{Clock, DateResolver};
    use std::sync::atomic::{AtomicI64, Ordering};

    pub struct FakeClock {
        now: AtomicI64,
    }

    impl FakeClock {
        pub fn new(now: i64) -> Self {
            Self {
                now: AtomicI64::new(now),
            }
        }

        pub fn advance(&self, milliseconds: i64) {
            self.now.fetch_add(milliseconds, Ordering::SeqCst);
        }
    }

    impl Clock for FakeClock {
        fn now_ms(&self) -> i64 {
            self.now.load(Ordering::SeqCst)
        }
    }

    pub struct ThresholdDateResolver {
        pub midnight: i64,
        pub before: &'static str,
        pub after: &'static str,
    }

    impl DateResolver for ThresholdDateResolver {
        fn local_date_key(&self, timestamp_ms: i64) -> Result<String, String> {
            Ok(if timestamp_ms < self.midnight {
                self.before
            } else {
                self.after
            }
            .to_owned())
        }
    }
}
