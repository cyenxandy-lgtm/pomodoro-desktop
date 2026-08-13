use std::path::{Component, Path, PathBuf};

pub const TEST_PROFILE_ENV: &str = "POMODORO_TEST_PROFILE";
pub const DATA_DIRECTORY_ENV: &str = "POMODORO_DATA_DIR";
pub const SMOKE_TIMER_ENV: &str = "POMODORO_SMOKE_TIMER";
pub const SMOKE_AUTOSTART_ENV: &str = "POMODORO_SMOKE_AUTOSTART";
pub const TEST_PROFILE_MARKER: &str = ".pomodoro-test-profile";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataProfile {
    data_directory: PathBuf,
    test_profile: bool,
    smoke_timer: bool,
    smoke_autostart: bool,
}

impl DataProfile {
    pub fn production(data_directory: PathBuf) -> Self {
        Self {
            data_directory,
            test_profile: false,
            smoke_timer: false,
            smoke_autostart: false,
        }
    }

    pub fn resolve<I, K, V>(
        production_directory: PathBuf,
        test_data_root: &Path,
        variables: I,
    ) -> Result<Self, String>
    where
        I: IntoIterator<Item = (K, V)>,
        K: AsRef<str>,
        V: AsRef<str>,
    {
        let variables = variables
            .into_iter()
            .map(|(key, value)| (key.as_ref().to_owned(), value.as_ref().to_owned()))
            .collect::<std::collections::HashMap<_, _>>();
        if !is_enabled(variables.get(TEST_PROFILE_ENV)) {
            return Ok(Self::production(production_directory));
        }

        let configured = variables
            .get(DATA_DIRECTORY_ENV)
            .ok_or_else(|| format!("{DATA_DIRECTORY_ENV} is required for the test profile."))?;
        let data_directory = validate_test_directory(Path::new(configured), test_data_root)?;
        Ok(Self {
            data_directory,
            test_profile: true,
            smoke_timer: is_enabled(variables.get(SMOKE_TIMER_ENV)),
            smoke_autostart: is_enabled(variables.get(SMOKE_AUTOSTART_ENV)),
        })
    }

    pub fn data_directory(&self) -> &Path {
        &self.data_directory
    }

    pub fn is_test(&self) -> bool {
        self.test_profile
    }

    pub fn smoke_timer(&self) -> bool {
        self.smoke_timer
    }

    pub fn smoke_autostart(&self) -> bool {
        self.smoke_autostart
    }

    pub fn database_path(&self) -> PathBuf {
        self.data_directory.join("pomodoro.sqlite3")
    }

    pub fn window_state_path(&self) -> PathBuf {
        self.data_directory.join("window-state.json")
    }

    pub fn webview_data_path(&self) -> PathBuf {
        self.data_directory.join("webview")
    }

    pub fn prepare(&self) -> Result<(), String> {
        std::fs::create_dir_all(&self.data_directory)
            .map_err(|error| format!("Failed to create data directory: {error}"))?;
        if self.test_profile {
            std::fs::write(
                self.data_directory.join(TEST_PROFILE_MARKER),
                "pomodoro-test-profile-v1\n",
            )
            .map_err(|error| format!("Failed to write test profile marker: {error}"))?;
        }
        Ok(())
    }
}

fn is_enabled(value: Option<&String>) -> bool {
    value.is_some_and(|value| value == "1")
}

fn validate_test_directory(path: &Path, test_data_root: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err(format!("{DATA_DIRECTORY_ENV} must be an absolute path."));
    }

    let normalized = normalize_absolute_path(path)?;
    let normalized_root = normalize_absolute_path(test_data_root)?;
    if normalized == normalized_root || !normalized.starts_with(&normalized_root) {
        return Err(format!(
            "{DATA_DIRECTORY_ENV} must name a profile below {}.",
            normalized_root.display()
        ));
    }
    Ok(normalized)
}

fn normalize_absolute_path(path: &Path) -> Result<PathBuf, String> {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
                normalized.push(component.as_os_str());
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(format!("{DATA_DIRECTORY_ENV} escapes its filesystem root."));
                }
            }
        }
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::SqliteRepository;
    use uuid::Uuid;

    fn production_directory() -> PathBuf {
        PathBuf::from(r"C:\Users\Tester\AppData\Roaming\com.pomodoro.desktop")
    }

    fn test_data_root() -> PathBuf {
        PathBuf::from(r"D:\Pomodoro\.test-data")
    }

    #[test]
    fn production_profile_keeps_tauri_app_data_directory() {
        let profile = DataProfile::resolve(
            production_directory(),
            &test_data_root(),
            std::iter::empty::<(&str, &str)>(),
        )
        .expect("production profile");

        assert_eq!(profile.data_directory(), production_directory());
        assert!(!profile.is_test());
        assert!(!profile.smoke_timer());
        assert!(!profile.smoke_autostart());
    }

    #[test]
    fn test_profile_uses_explicit_safe_override() {
        let profile = DataProfile::resolve(
            production_directory(),
            &test_data_root(),
            [
                (TEST_PROFILE_ENV, "1"),
                (DATA_DIRECTORY_ENV, r"D:\Pomodoro\.test-data\acceptance"),
                (SMOKE_TIMER_ENV, "1"),
                (SMOKE_AUTOSTART_ENV, "1"),
            ],
        )
        .expect("test profile");

        assert_eq!(
            profile.data_directory(),
            Path::new(r"D:\Pomodoro\.test-data\acceptance")
        );
        assert!(profile.is_test());
        assert!(profile.smoke_timer());
        assert!(profile.smoke_autostart());
        assert_eq!(
            profile.database_path(),
            Path::new(r"D:\Pomodoro\.test-data\acceptance\pomodoro.sqlite3")
        );
        assert_eq!(
            profile.window_state_path(),
            Path::new(r"D:\Pomodoro\.test-data\acceptance\window-state.json")
        );
        assert_eq!(
            profile.webview_data_path(),
            Path::new(r"D:\Pomodoro\.test-data\acceptance\webview")
        );
    }

    #[test]
    fn ignores_override_without_explicit_test_profile() {
        let profile = DataProfile::resolve(
            production_directory(),
            &test_data_root(),
            [(DATA_DIRECTORY_ENV, r"D:\Pomodoro\.test-data\ignored")],
        )
        .expect("production profile");

        assert_eq!(profile.data_directory(), production_directory());
        assert!(!profile.is_test());
    }

    #[test]
    fn rejects_missing_relative_and_unmarked_test_paths() {
        for variables in [
            vec![(TEST_PROFILE_ENV, "1")],
            vec![
                (TEST_PROFILE_ENV, "1"),
                (DATA_DIRECTORY_ENV, ".test-data\\run"),
            ],
            vec![
                (TEST_PROFILE_ENV, "1"),
                (DATA_DIRECTORY_ENV, r"C:\Users\Tester"),
            ],
            vec![
                (TEST_PROFILE_ENV, "1"),
                (DATA_DIRECTORY_ENV, r"C:\Users\Tester\.test-data"),
            ],
        ] {
            assert!(
                DataProfile::resolve(production_directory(), &test_data_root(), variables).is_err()
            );
        }

        assert!(DataProfile::resolve(
            production_directory(),
            &test_data_root(),
            [
                (TEST_PROFILE_ENV, "1"),
                (DATA_DIRECTORY_ENV, r"C:\Windows\.test-data\run"),
            ],
        )
        .is_err());
    }

    #[test]
    fn sqlite_and_window_state_paths_stay_inside_the_override() {
        let fixture_root =
            std::env::temp_dir().join(format!("pomodoro-profile-test-{}", Uuid::new_v4()));
        let test_root = fixture_root.join(".test-data");
        let profile_directory = test_root.join("acceptance");
        let profile = DataProfile::resolve(
            production_directory(),
            &test_root,
            [
                (TEST_PROFILE_ENV, "1"),
                (
                    DATA_DIRECTORY_ENV,
                    profile_directory.to_string_lossy().as_ref(),
                ),
            ],
        )
        .expect("isolated profile");

        profile.prepare().expect("prepare profile");
        let repository = SqliteRepository::open(&profile.database_path()).expect("open database");
        drop(repository);
        std::fs::write(profile.window_state_path(), "{}").expect("write window state fixture");

        assert!(profile.database_path().is_file());
        assert!(profile.window_state_path().is_file());
        assert!(profile_directory.join(TEST_PROFILE_MARKER).is_file());
        assert!(profile.database_path().starts_with(&profile_directory));
        assert!(profile.window_state_path().starts_with(&profile_directory));
        assert!(profile.webview_data_path().starts_with(&profile_directory));

        for path in [
            profile.database_path(),
            PathBuf::from(format!("{}-wal", profile.database_path().display())),
            PathBuf::from(format!("{}-shm", profile.database_path().display())),
            profile.window_state_path(),
            profile_directory.join(TEST_PROFILE_MARKER),
        ] {
            if path.exists() {
                std::fs::remove_file(path).expect("remove fixture file");
            }
        }
        std::fs::remove_dir(&profile_directory).expect("remove profile directory");
        std::fs::remove_dir(&test_root).expect("remove test root");
        std::fs::remove_dir(&fixture_root).expect("remove fixture root");
    }
}
