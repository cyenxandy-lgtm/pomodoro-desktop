use std::io::Cursor;
use std::sync::{mpsc, Mutex};

const COMPLETION_SOUND: &[u8] = include_bytes!("../../public/sounds/chime.wav");

pub trait CompletionAudio: Send + Sync {
    fn configure(&self, enabled: bool, volume: f32) -> Result<(), String>;
    fn notify(&self) -> Result<(), String>;
}

#[derive(Debug, Clone, Copy)]
struct SoundConfig {
    enabled: bool,
    volume: f32,
}

pub struct NativeSoundPlayer {
    config: Mutex<SoundConfig>,
    sender: mpsc::Sender<f32>,
}

impl NativeSoundPlayer {
    pub fn new() -> Result<Self, String> {
        let (sender, receiver) = mpsc::channel::<f32>();
        std::thread::Builder::new()
            .name("pomodoro-audio".into())
            .spawn(move || {
                while let Ok(volume) = receiver.recv() {
                    if let Err(error) = play_completion_sound(volume) {
                        log::error!("Failed to play completion sound: {error}");
                    }
                }
            })
            .map_err(|error| format!("Failed to start audio worker: {error}"))?;

        Ok(Self {
            config: Mutex::new(SoundConfig {
                enabled: true,
                volume: 0.7,
            }),
            sender,
        })
    }
}

impl CompletionAudio for NativeSoundPlayer {
    fn configure(&self, enabled: bool, volume: f32) -> Result<(), String> {
        let mut config = self
            .config
            .lock()
            .map_err(|_| "Completion sound configuration lock is poisoned.".to_owned())?;
        config.enabled = enabled;
        config.volume = volume.clamp(0.0, 1.0);
        Ok(())
    }

    fn notify(&self) -> Result<(), String> {
        let config = *self
            .config
            .lock()
            .map_err(|_| "Completion sound configuration lock is poisoned.".to_owned())?;
        if !config.enabled || config.volume == 0.0 {
            return Ok(());
        }
        self.sender
            .send(config.volume)
            .map_err(|error| format!("Completion sound worker is unavailable: {error}"))
    }
}

fn play_completion_sound(volume: f32) -> Result<(), String> {
    let output = rodio::DeviceSinkBuilder::open_default_sink()
        .map_err(|error| format!("Cannot open the default audio output: {error}"))?;
    let player = rodio::play(output.mixer(), Cursor::new(COMPLETION_SOUND))
        .map_err(|error| format!("Cannot decode completion sound: {error}"))?;
    player.set_volume(volume);
    player.sleep_until_end();
    Ok(())
}

#[cfg(test)]
pub struct RecordingNotifier {
    notifications: std::sync::atomic::AtomicUsize,
}

#[cfg(test)]
impl RecordingNotifier {
    pub fn new() -> Self {
        Self {
            notifications: std::sync::atomic::AtomicUsize::new(0),
        }
    }

    pub fn count(&self) -> usize {
        self.notifications.load(std::sync::atomic::Ordering::SeqCst)
    }
}

#[cfg(test)]
impl CompletionAudio for RecordingNotifier {
    fn configure(&self, _enabled: bool, _volume: f32) -> Result<(), String> {
        Ok(())
    }

    fn notify(&self) -> Result<(), String> {
        self.notifications
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }
}
