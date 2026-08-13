// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from './SettingsPanel'

afterEach(cleanup)

describe('SettingsPanel', () => {
  it('emits atomic setting patches so adjacent changes cannot overwrite each other', () => {
    const onChange = vi.fn()

    render(
      <SettingsPanel
        settings={{
          focusMinutes: 25,
          breakMinutes: 5,
          longBreakMinutes: 15,
          longBreakInterval: 4,
          autoStartBreak: false,
          autoStartFocus: false,
        }}
        soundEnabled
        volume={0.7}
        desktopNotifications
        notificationPermissionDenied={false}
        closeToTray
        minimizeToTray={false}
        globalShortcutsEnabled
        alwaysOnTop={false}
        rememberWindowPosition
        shortcutUnavailable={[]}
        appearance="dark"
        accent="rose"
        version="0.3.0"
        onChange={onChange}
        onSoundEnabledChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onDesktopNotificationsChange={vi.fn()}
        onCloseToTrayChange={vi.fn()}
        onMinimizeToTrayChange={vi.fn()}
        onGlobalShortcutsEnabledChange={vi.fn()}
        onAlwaysOnTopChange={vi.fn()}
        onRememberWindowPositionChange={vi.fn()}
        onAppearanceChange={vi.fn()}
        onAccentChange={vi.fn()}
        onTestSound={vi.fn()}
      />,
    )

    const interval = screen.getByRole('spinbutton', { name: '长休息间隔' })
    fireEvent.change(interval, { target: { value: '3' } })
    fireEvent.blur(interval)
    fireEvent.click(screen.getByRole('checkbox', { name: '自动开始休息' }))

    expect(onChange).toHaveBeenNthCalledWith(1, { longBreakInterval: 3 })
    expect(onChange).toHaveBeenNthCalledWith(2, { autoStartBreak: true })
  })

  it('navigates settings groups and exposes persisted appearance choices', () => {
    const onAppearanceChange = vi.fn()
    const onAccentChange = vi.fn()
    render(
      <SettingsPanel
        settings={{ focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartBreak: false, autoStartFocus: false }}
        soundEnabled volume={0.7} desktopNotifications notificationPermissionDenied closeToTray minimizeToTray={false}
        globalShortcutsEnabled alwaysOnTop={false} rememberWindowPosition shortcutUnavailable={[]}
        appearance="system" accent="mint" version="0.3.0"
        onChange={vi.fn()} onSoundEnabledChange={vi.fn()} onVolumeChange={vi.fn()}
        onDesktopNotificationsChange={vi.fn()} onCloseToTrayChange={vi.fn()}
        onMinimizeToTrayChange={vi.fn()} onGlobalShortcutsEnabledChange={vi.fn()}
        onAlwaysOnTopChange={vi.fn()} onRememberWindowPositionChange={vi.fn()}
        onAppearanceChange={onAppearanceChange} onAccentChange={onAccentChange} onTestSound={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '通知' }))
    expect(screen.getByRole('status').textContent).toContain('系统通知权限未开启')
    fireEvent.click(screen.getByRole('button', { name: '外观' }))
    expect(screen.getByRole('button', { name: '跟随系统' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /薄荷/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '浅色' }))
    fireEvent.click(screen.getByRole('button', { name: /静蓝/ }))
    expect(onAppearanceChange).toHaveBeenCalledWith('light')
    expect(onAccentChange).toHaveBeenCalledWith('blue')

    fireEvent.click(screen.getByRole('button', { name: '关于' }))
    expect(screen.getByText('0.3.0')).toBeTruthy()
  })
})
