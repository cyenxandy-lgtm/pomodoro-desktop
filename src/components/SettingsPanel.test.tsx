// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from './SettingsPanel'

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
        closeToTray
        minimizeToTray={false}
        globalShortcutsEnabled
        alwaysOnTop={false}
        rememberWindowPosition
        shortcutUnavailable={[]}
        onChange={onChange}
        onSoundEnabledChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onDesktopNotificationsChange={vi.fn()}
        onCloseToTrayChange={vi.fn()}
        onMinimizeToTrayChange={vi.fn()}
        onGlobalShortcutsEnabledChange={vi.fn()}
        onAlwaysOnTopChange={vi.fn()}
        onRememberWindowPositionChange={vi.fn()}
        onTestSound={vi.fn()}
      />,
    )

    const interval = screen.getByRole('spinbutton', { name: 'Long Break Interval' })
    fireEvent.change(interval, { target: { value: '3' } })
    fireEvent.blur(interval)
    fireEvent.click(screen.getByRole('checkbox', { name: '自动开始休息' }))

    expect(onChange).toHaveBeenNthCalledWith(1, { longBreakInterval: 3 })
    expect(onChange).toHaveBeenNthCalledWith(2, { autoStartBreak: true })
  })
})
