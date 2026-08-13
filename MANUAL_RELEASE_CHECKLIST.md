# Pomodoro v0.3.0 Windows Release Acceptance

This checklist validates the existing `v0.3.0` release without changing its Git tag or production data. Test Profile is enabled only when `POMODORO_TEST_PROFILE=1` and an approved `.test-data/<profile>` directory are both present.

## Preparation

1. Build the current acceptance branch:

   ```powershell
   npm run build:tauri
   ```

2. Start an isolated manual profile with 10/5/5-second timers:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\run-test-profile.ps1 -ProfileName manual-acceptance -SmokeTimer
   ```

3. Confirm these files appear only below `.test-data\manual-acceptance`:

   - `.pomodoro-test-profile`
   - `pomodoro.sqlite3`
   - `window-state.json` after a window move/resize or clean exit
   - `webview` containing isolated WebView2 storage and the `-test` localStorage keys

4. Do not run the production app for test Sessions. Keep a copy of the production SQLite file metadata before and after acceptance if the production app is installed.

## Timer

- [ ] Focus Start
- [ ] Pause
- [ ] Resume
- [ ] Reset
- [ ] Skip
- [ ] Short Break
- [ ] Long Break
- [ ] Auto Start Break
- [ ] Auto Start Focus

## Completion and Statistics

- [ ] A complete Focus naturally reaches `00:00`
- [ ] Completed Focus Session is written to isolated SQLite
- [ ] Today Pomodoro increases by 1
- [ ] Today Focus Time increases by 10 seconds
- [ ] 7 Day statistics update
- [ ] 30 Day statistics update
- [ ] All Time statistics update
- [ ] Streak updates when this is the day's first completed Focus
- [ ] Skipped Focus appears as skipped without increasing Pomodoro or Focus Time
- [ ] Completed Break appears without increasing Pomodoro or Focus Time
- [ ] Statistics refresh after returning to the window

## Audio

- [ ] Focus completion produces an audible chime
- [ ] Break completion produces an audible chime
- [ ] Sound OFF suppresses the chime
- [ ] Volume changes the audible level
- [ ] Preview plays the selected volume

## Notification

- [ ] Focus completion shows a Windows notification
- [ ] Short Break completion shows a Windows notification
- [ ] Long Break completion shows a Windows notification
- [ ] Notification OFF suppresses notifications

## Tray

- [ ] Window close button hides to Tray
- [ ] Tray Restore opens the same timer state
- [ ] Tray Start/Pause works
- [ ] Tray Reset works
- [ ] Tray Skip works
- [ ] Tray Exit closes the process

## Hidden Completion

- [ ] Start a Focus timer
- [ ] Hide the window to Tray
- [ ] Timer naturally completes while hidden
- [ ] Completion sound is audible
- [ ] Windows notification appears
- [ ] Completed Session exists in isolated SQLite
- [ ] Restore the window
- [ ] Statistics immediately show the latest Session

## Global Shortcut

Put VS Code or a browser in the foreground before each check.

- [ ] `Ctrl+Alt+Space` starts/pauses/resumes
- [ ] `Ctrl+Alt+R` resets
- [ ] `Ctrl+Alt+S` skips
- [ ] `Ctrl+Alt+P` hides/restores the main window

## Compact

- [ ] Normal to Compact does not reset the timer
- [ ] Compact timer controls work
- [ ] Compact to Normal preserves timer state

## Always On Top

- [ ] ON keeps Pomodoro above another application
- [ ] OFF restores normal window stacking

## Window Restore

- [ ] Normal position restores after restart
- [ ] Normal size restores after restart
- [ ] Compact bounds restore independently
- [ ] Normal bounds remain independent of Compact bounds

## Restart

- [ ] Running timer recovers using its original target end time
- [ ] Paused timer recovers with the saved remaining time

## Test Data Review and Cleanup

Review `.test-data\manual-acceptance` before cleanup. Cleanup refuses paths without the exact test-profile marker and does not run while a workspace Pomodoro process is active.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cleanup-test-profile.ps1 -ProfileName manual-acceptance
```

Never delete or rename the production `pomodoro.sqlite3`, its WAL/SHM files, or the production WebView data directory during acceptance.
