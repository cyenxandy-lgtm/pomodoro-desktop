import { memo, useEffect, useState } from 'react'
import type { Accent, Appearance, TimerSettings } from '../types'
import { Icon } from './Icon'
import { SoundSettings } from './SoundSettings'

type SettingsSection = 'timer' | 'sound' | 'notification' | 'desktop' | 'shortcuts' | 'appearance' | 'about'

interface SettingsPanelProps {
  settings: TimerSettings
  soundEnabled: boolean
  volume: number
  desktopNotifications: boolean
  notificationPermissionDenied: boolean
  closeToTray: boolean
  minimizeToTray: boolean
  globalShortcutsEnabled: boolean
  alwaysOnTop: boolean
  rememberWindowPosition: boolean
  shortcutUnavailable: string[]
  appearance: Appearance
  accent: Accent
  version: string
  onChange: (settings: Partial<TimerSettings>) => void
  onSoundEnabledChange: (enabled: boolean) => void
  onVolumeChange: (volume: number) => void
  onDesktopNotificationsChange: (enabled: boolean) => void
  onCloseToTrayChange: (enabled: boolean) => void
  onMinimizeToTrayChange: (enabled: boolean) => void
  onGlobalShortcutsEnabledChange: (enabled: boolean) => void
  onAlwaysOnTopChange: (enabled: boolean) => void
  onRememberWindowPositionChange: (enabled: boolean) => void
  onAppearanceChange: (appearance: Appearance) => void
  onAccentChange: (accent: Accent) => void
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

const SettingField = ({ label, hint, value, unit, min, max, onChange, onBlur }: SettingFieldProps) => (
  <label className="setting-field">
    <span><strong>{label}</strong><small>{hint}</small></span>
    <span className="number-input">
      <input type="number" inputMode="numeric" min={min} max={max} step="1" value={value}
        onChange={(event) => onChange(event.target.value)} onBlur={onBlur} aria-label={label} />
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
    <span><strong>{label}</strong><small>{hint}</small></span>
    <label className="sound-switch">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
      <span aria-hidden="true" />
    </label>
  </div>
)

const sectionLabels: Array<[SettingsSection, string]> = [
  ['timer', '计时'], ['sound', '声音'], ['notification', '通知'], ['desktop', '桌面'],
  ['shortcuts', '快捷键'], ['appearance', '外观'], ['about', '关于'],
]

const shortcutUnavailableMap: Record<string, string> = {
  'Ctrl+Alt+Space': 'Ctrl + Alt + Space', 'Ctrl+Alt+R': 'Ctrl + Alt + R',
  'Ctrl+Alt+S': 'Ctrl + Alt + S', 'Ctrl+Alt+P': 'Ctrl + Alt + P',
}
const unavailableLabel = (shortcut: string): string => shortcutUnavailableMap[shortcut] ?? shortcut

const SettingsPanelComponent = ({
  settings, soundEnabled, volume, desktopNotifications, notificationPermissionDenied,
  closeToTray, minimizeToTray,
  globalShortcutsEnabled, alwaysOnTop, rememberWindowPosition, shortcutUnavailable,
  appearance, accent, version, onChange, onSoundEnabledChange, onVolumeChange,
  onDesktopNotificationsChange, onCloseToTrayChange, onMinimizeToTrayChange,
  onGlobalShortcutsEnabledChange, onAlwaysOnTopChange, onRememberWindowPositionChange,
  onAppearanceChange, onAccentChange, onTestSound,
}: SettingsPanelProps) => {
  const [section, setSection] = useState<SettingsSection>('timer')
  const [focusValue, setFocusValue] = useState(String(settings.focusMinutes))
  const [breakValue, setBreakValue] = useState(String(settings.breakMinutes))
  const [longBreakValue, setLongBreakValue] = useState(String(settings.longBreakMinutes))
  const [intervalValue, setIntervalValue] = useState(String(settings.longBreakInterval))

  useEffect(() => {
    setFocusValue(String(settings.focusMinutes)); setBreakValue(String(settings.breakMinutes))
    setLongBreakValue(String(settings.longBreakMinutes)); setIntervalValue(String(settings.longBreakInterval))
  }, [settings.breakMinutes, settings.focusMinutes, settings.longBreakInterval, settings.longBreakMinutes])

  const commit = (value: string, min: number, max: number, fallback: number,
    field: 'focusMinutes' | 'breakMinutes' | 'longBreakMinutes' | 'longBreakInterval',
    setValue: (value: string) => void) => {
    const parsed = Number(value)
    const next = Number.isFinite(parsed) && value.trim() !== ''
      ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback
    setValue(String(next)); onChange({ [field]: next })
  }

  return (
    <section className="settings-panel" aria-label="设置">
      <div className="settings-heading">
        <div className="settings-icon"><Icon name="settings" size={19} /></div>
        <div><p className="eyebrow">偏好设置</p><h2>让专注更合拍</h2></div>
      </div>
      <p className="settings-description">设置自动保存在本地，并同步到桌面计时器。</p>

      <nav className="settings-nav" aria-label="设置分组">
        {sectionLabels.map(([value, label]) => (
          <button key={value} type="button" className={section === value ? 'active' : ''}
            aria-pressed={section === value} onClick={() => setSection(value)}>{label}</button>
        ))}
      </nav>

      {section === 'timer' && <div className="settings-section" aria-labelledby="timer-settings-title">
        <div className="settings-section-heading"><p className="eyebrow">计时</p><strong id="timer-settings-title">计时循环</strong></div>
        <div className="settings-list">
          <SettingField label="专注时长" hint="1–120 分钟" value={focusValue} unit="分钟" min={1} max={120}
            onChange={setFocusValue} onBlur={() => commit(focusValue, 1, 120, settings.focusMinutes, 'focusMinutes', setFocusValue)} />
          <SettingField label="短休息" hint="1–60 分钟" value={breakValue} unit="分钟" min={1} max={60}
            onChange={setBreakValue} onBlur={() => commit(breakValue, 1, 60, settings.breakMinutes, 'breakMinutes', setBreakValue)} />
          <SettingField label="长休息" hint="1–60 分钟" value={longBreakValue} unit="分钟" min={1} max={60}
            onChange={setLongBreakValue} onBlur={() => commit(longBreakValue, 1, 60, settings.longBreakMinutes, 'longBreakMinutes', setLongBreakValue)} />
          <SettingField label="长休息间隔" hint="每组完成的专注次数" value={intervalValue} unit="次" min={2} max={8}
            onChange={setIntervalValue} onBlur={() => commit(intervalValue, 2, 8, settings.longBreakInterval, 'longBreakInterval', setIntervalValue)} />
        </div>
        <div className="preference-list" aria-label="自动开始设置">
          <ToggleSetting label="自动开始休息" hint="专注结束后自动开始休息" checked={settings.autoStartBreak} onChange={(value) => onChange({ autoStartBreak: value })} />
          <ToggleSetting label="自动开始专注" hint="休息结束后自动开始下一轮专注" checked={settings.autoStartFocus} onChange={(value) => onChange({ autoStartFocus: value })} />
        </div>
      </div>}

      {section === 'sound' && <div className="settings-section" aria-labelledby="sound-title">
        <div className="settings-section-heading"><p className="eyebrow">声音</p><strong id="sound-title">声音提醒</strong></div>
        <SoundSettings enabled={soundEnabled} volume={volume} onEnabledChange={onSoundEnabledChange} onVolumeChange={onVolumeChange} onTest={onTestSound} />
      </div>}

      {section === 'notification' && <div className="settings-section" aria-labelledby="notification-title">
        <div className="settings-section-heading"><p className="eyebrow">通知</p><strong id="notification-title">系统通知</strong></div>
        <div className="preference-list"><ToggleSetting label="桌面通知" hint="计时结束后发送 Windows 通知" checked={desktopNotifications} onChange={onDesktopNotificationsChange} /></div>
        <p className={notificationPermissionDenied ? 'inline-notice is-warning' : 'settings-note'} role={notificationPermissionDenied ? 'status' : undefined}>
          {notificationPermissionDenied ? '系统通知权限未开启，请在 Windows 设置中允许 Pomodoro 发送通知。' : '通知由 Windows 管理，可在系统设置中调整权限。'}
        </p>
      </div>}

      {section === 'desktop' && <div className="settings-section" aria-labelledby="desktop-title">
        <div className="settings-section-heading"><p className="eyebrow">桌面</p><strong id="desktop-title">桌面体验</strong></div>
        <div className="preference-list">
          <ToggleSetting label="关闭到托盘" hint="关闭窗口时继续在后台运行" checked={closeToTray} onChange={onCloseToTrayChange} />
          <ToggleSetting label="最小化到托盘" hint="最小化窗口后自动隐藏" checked={minimizeToTray} onChange={onMinimizeToTrayChange} />
          <ToggleSetting label="始终置顶" hint="保持 Pomodoro 位于普通窗口上方" checked={alwaysOnTop} onChange={onAlwaysOnTopChange} />
          <ToggleSetting label="记住窗口位置" hint="下次启动恢复位置和尺寸" checked={rememberWindowPosition} onChange={onRememberWindowPositionChange} />
        </div>
      </div>}

      {section === 'shortcuts' && <div className="settings-section" aria-labelledby="shortcuts-title">
        <div className="settings-section-heading"><p className="eyebrow">快捷键</p><strong id="shortcuts-title">全局快捷键</strong></div>
        <div className="preference-list"><ToggleSetting label="启用全局快捷键" hint="在其他应用中也能控制计时器" checked={globalShortcutsEnabled} onChange={onGlobalShortcutsEnabledChange} /></div>
        {globalShortcutsEnabled && <div className="shortcut-list">
          {[['开始 / 暂停', 'Ctrl + Alt + Space'], ['重置', 'Ctrl + Alt + R'], ['跳过', 'Ctrl + Alt + S'], ['显示 / 隐藏', 'Ctrl + Alt + P']].map(([label, key]) => (
            <div className="shortcut-row" key={key}><span>{label}</span><kbd className={shortcutUnavailable.includes(key.replaceAll(' ', '')) ? 'unavailable' : ''}>{key}</kbd></div>
          ))}
          {shortcutUnavailable.length > 0 && <p className="inline-notice is-warning" role="status">{shortcutUnavailable.map(unavailableLabel).join('、')} 已被其他程序占用。</p>}
        </div>}
      </div>}

      {section === 'appearance' && <div className="settings-section" aria-labelledby="appearance-title">
        <div className="settings-section-heading"><p className="eyebrow">外观</p><strong id="appearance-title">主题与强调色</strong></div>
        <fieldset className="choice-group"><legend>主题</legend>
          {([['dark', '深色'], ['light', '浅色'], ['system', '跟随系统']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={appearance === value} className={appearance === value ? 'active' : ''} onClick={() => onAppearanceChange(value)}>{label}</button>
          ))}
        </fieldset>
        <fieldset className="choice-group accent-choices"><legend>强调色</legend>
          {([['rose', '暖红'], ['mint', '薄荷'], ['blue', '静蓝']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={accent === value} className={accent === value ? 'active' : ''} onClick={() => onAccentChange(value)}><span className={`accent-swatch is-${value}`} />{label}</button>
          ))}
        </fieldset>
      </div>}

      {section === 'about' && <div className="settings-section about-section" aria-labelledby="about-title">
        <div className="about-mark" aria-hidden="true">🍅</div><p className="eyebrow">关于</p><h3 id="about-title">Pomodoro</h3>
        <p>安静、可靠的桌面专注计时器。</p><dl><div><dt>版本</dt><dd>{version}</dd></div><div><dt>平台</dt><dd>Tauri Desktop App</dd></div><div><dt>数据</dt><dd>仅保存在本地</dd></div></dl>
      </div>}
    </section>
  )
}

export const SettingsPanel = memo(SettingsPanelComponent)
