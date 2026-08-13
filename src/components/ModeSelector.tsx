import { memo } from 'react'
import type { KeyboardEvent } from 'react'
import type { TimerMode, TimerStatus } from '../types'

interface ModeSelectorProps { mode: TimerMode; status: TimerStatus; onSelect: (mode: TimerMode) => void }
const modes: Array<{ value: TimerMode; label: string; className: string }> = [
  { value: 'focus', label: '专注', className: 'focus-dot' },
  { value: 'shortBreak', label: '短休息', className: 'break-dot' },
  { value: 'longBreak', label: '长休息', className: 'long-break-dot' },
]

const ModeSelectorComponent = ({ mode, status, onSelect }: ModeSelectorProps) => {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || status === 'running') return
    event.preventDefault()
    const current = modes.findIndex((item) => item.value === mode)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? modes.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + modes.length) % modes.length
    onSelect(modes[next].value)
  }

  return (
    <div className="mode-selector" role="tablist" aria-label="计时模式" onKeyDown={onKeyDown}>
      {modes.map((item) => <button key={item.value} className={mode === item.value ? 'mode-tab active' : 'mode-tab'} type="button"
        role="tab" aria-selected={mode === item.value} tabIndex={mode === item.value ? 0 : -1} disabled={status === 'running'} onClick={() => onSelect(item.value)}>
        <span className={`tab-dot ${item.className}`} aria-hidden="true" />{item.label}
      </button>)}
    </div>
  )
}

export const ModeSelector = memo(ModeSelectorComponent)
