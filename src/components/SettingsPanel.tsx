import { useEffect, useState } from 'react'
import type { TimerSettings } from '../types'
import { Icon } from './Icon'
import { SoundSettings } from './SoundSettings'

interface SettingsPanelProps {
  settings: TimerSettings
  soundEnabled: boolean
  volume: number
  desktopNotifications: boolean
  closeToTray: boolean
  minimizeToTray: boolean
  globalShortcutsEnabled: boolean
  alwaysOnTop: boolean
  rememberWindowPosition: boolean
  shortcutUnavailable: string[]
  onChange: (settings: Partial<TimerSettings>) => void
  onSoundEnabledChange: (enabled: boolean) => void
  onVolumeChange: (volume: number) => void
  onDesktopNotificationsChange: (enabled: boolean) => void
  onCloseToTrayChange: (enabled: boolean) => void
  onMinimizeToTrayChange: (enabled: boolean) => void
  onGlobalShortcutsEnabledChange: (enabled: boolean) => void
  onAlwaysOnTopChange: (enabled: boolean) => void
  onRememberWindowPositionChange: (enabled: boolean) => void
  onTestSound: () => void
}

interface SettingFieldProps {
  label: string
  hint: string
  value: string
  unit: string
  min: number
  max: number
  onChange: (value: string) => void
  onBlur: () => void
}

const SettingField = ({
  label,
  hint,
  value,
  unit,
  min,
  max,
  onChange,
  onBlur,
}: SettingFieldProps) => (
  <label className="setting-field">
    <span>
      <strong>{label}</strong>
      <small>{hint}</small>
    </span>
    <span className="number-input">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-label={label}
      />
      <span>{unit}</span>
    </span>
  </label>
)

interface ToggleSettingProps {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}

const ToggleSetting = ({ label, hint, checked, onChange }: ToggleSettingProps) => (
  <div className="preference-row">
    <span>
      <strong>{label}</strong>
      <small>{hint}</small>
    </span>
    <label className="sound-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span aria-hidden="true" />
    </label>
  </div>
)

export const SettingsPanel = ({
  settings,
  soundEnabled,
  volume,
  desktopNotifications,
  closeToTray,
  minimizeToTray,
  globalShortcutsEnabled,
  alwaysOnTop,
  rememberWindowPosition,
  shortcutUnavailable,
  onChange,
  onSoundEnabledChange,
  onVolumeChange,
  onDesktopNotificationsChange,
  onCloseToTrayChange,
  onMinimizeToTrayChange,
  onGlobalShortcutsEnabledChange,
  onAlwaysOnTopChange,
  onRememberWindowPositionChange,
  onTestSound,
}: SettingsPanelProps) => {
  const [focusValue, setFocusValue] = useState(String(settings.focusMinutes))
  const [breakValue, setBreakValue] = useState(String(settings.breakMinutes))
  const [longBreakValue, setLongBreakValue] = useState(String(settings.longBreakMinutes))
  const [intervalValue, setIntervalValue] = useState(String(settings.longBreakInterval))

  useEffect(() => {
    setFocusValue(String(settings.focusMinutes))
    setBreakValue(String(settings.breakMinutes))
    setLongBreakValue(String(settings.longBreakMinutes))
    setIntervalValue(String(settings.longBreakInterval))
  }, [
    settings.breakMinutes,
    settings.focusMinutes,
    settings.longBreakInterval,
    settings.longBreakMinutes,
  ])

  const commitValue = (value: string, min: number, max: number, fallback: number): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && value.trim() !== ''
      ? Math.min(max, Math.max(min, Math.round(parsed)))
      : fallback
  }

  const commit = (
    value: string,
    min: number,
    max: number,
    fallback: number,
    field: 'focusMinutes' | 'breakMinutes' | 'longBreakMinutes' | 'longBreakInterval',
    setValue: (value: string) => void,
  ) => {
    const next = commitValue(value, min, max, fallback)
    setValue(String(next))
    onChange({ [field]: next })
  }

  return (
    <section className="settings-panel" aria-label="设置">
      <div className="settings-heading">
        <div className="settings-icon"><Icon name="settings" size={19} /></div>
        <div>
          <p className="eyebrow">偏好设置</p>
          <h2>番茄循环</h2>
        </div>
      </div>
      <p className="settings-description">设置会自动保存在本地，并同步到 Rust Timer。</p>

      <div className="settings-list">
        <SettingField
          label="Focus"
          hint="专注时间 · 1–120 分钟"
          value={focusValue}
          unit="分钟"
          min={1}
          max={120}
          onChange={setFocusValue}
          onBlur={() => commit(
            focusValue, 1, 120, settings.focusMinutes, 'focusMinutes', setFocusValue,
          )}
        />
        <SettingField
          label="Short Break"
          hint="短休息 · 1–60 分钟"
          value={breakValue}
          unit="分钟"
          min={1}
          max={60}
          onChange={setBreakValue}
          onBlur={() => commit(
            breakValue, 1, 60, settings.breakMinutes, 'breakMinutes', setBreakValue,
          )}
        />
        <SettingField
          label="Long Break"
          hint="长休息 · 1–60 分钟"
          value={longBreakValue}
          unit="分钟"
          min={1}
          max={60}
          onChange={setLongBreakValue}
          onBlur={() => commit(
            longBreakValue,
            1,
            60,
            settings.longBreakMinutes,
            'longBreakMinutes',
            setLongBreakValue,
          )}
        />
        <SettingField
          label="Long Break Interval"
          hint="每组完成的 Focus 数 · 2–8"
          value={intervalValue}
          unit="次"
          min={2}
          max={8}
          onChange={setIntervalValue}
          onBlur={() => commit(
            intervalValue,
            2,
            8,
            settings.longBreakInterval,
            'longBreakInterval',
            setIntervalValue,
          )}
        />
      </div>

      <div className="preference-list" aria-label="自动开始设置">
        <ToggleSetting
          label="自动开始休息"
          hint="Focus 完成后自动开始 Break"
          checked={settings.autoStartBreak}
          onChange={(autoStartBreak) => onChange({ autoStartBreak })}
        />
        <ToggleSetting
          label="自动开始专注"
          hint="Break 完成后自动开始 Focus"
          checked={settings.autoStartFocus}
          onChange={(autoStartFocus) => onChange({ autoStartFocus })}
        />
      </div>

      <SoundSettings
        enabled={soundEnabled}
        volume={volume}
        onEnabledChange={onSoundEnabledChange}
        onVolumeChange={onVolumeChange}
        onTest={onTestSound}
      />

      <div className="preference-list" aria-label="通知设置">
        <ToggleSetting
          label="桌面通知"
          hint="Timer 完成后发送 Windows 通知"
          checked={desktopNotifications}
          onChange={onDesktopNotificationsChange}
        />
      </div>

      <div className="settings-section-heading">
        <p className="eyebrow">Desktop</p>
        <strong>桌面体验</strong>
      </div>
      <div className="preference-list desktop-preferences" aria-label="桌面设置">
        <ToggleSetting
          label="关闭到托盘"
          hint="关闭主窗口时保持 Timer 运行"
          checked={closeToTray}
          onChange={onCloseToTrayChange}
        />
        <ToggleSetting
          label="最小化到托盘"
          hint="最小化主窗口后自动隐藏"
          checked={minimizeToTray}
          onChange={onMinimizeToTrayChange}
        />
        <ToggleSetting
          label="始终置顶"
          hint="让 Pomodoro 保持在普通窗口上方"
          checked={alwaysOnTop}
          onChange={onAlwaysOnTopChange}
        />
        <ToggleSetting
          label="记住窗口位置"
          hint="下次启动恢复位置和大小"
          checked={rememberWindowPosition}
          onChange={onRememberWindowPositionChange}
        />
        <ToggleSetting
          label="全局快捷键"
          hint="在其他应用中控制 Timer"
          checked={globalShortcutsEnabled}
          onChange={onGlobalShortcutsEnabledChange}
        />
      </div>

      {globalShortcutsEnabled && (
        <div className="shortcut-list" aria-label="快捷键列表">
          {[
            ['开始 / 暂停', 'Ctrl + Alt + Space'],
            ['重置', 'Ctrl + Alt + R'],
            ['跳过', 'Ctrl + Alt + S'],
            ['显示 / 隐藏', 'Ctrl + Alt + P'],
          ].map(([label, accelerator]) => (
            <div className="shortcut-row" key={accelerator}>
              <span>{label}</span>
              <kbd className={shortcutUnavailable.includes(accelerator.replaceAll(' ', '')) ? 'unavailable' : ''}>
                {accelerator}
              </kbd>
            </div>
          ))}
          {shortcutUnavailable.length > 0 && (
            <p className="shortcut-warning" role="status">部分快捷键当前被其他程序占用</p>
          )}
        </div>
      )}

      <div className="settings-note">
        <span className="note-dot" />
        时长设置将在当前计时结束或重置后使用
      </div>
    </section>
  )
}
