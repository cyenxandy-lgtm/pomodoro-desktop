import type { TimerMode, TimerStatus } from '../types'

interface ModeSelectorProps {
  mode: TimerMode
  status: TimerStatus
  onSelect: (mode: TimerMode) => void
}

export const ModeSelector = ({ mode, status, onSelect }: ModeSelectorProps) => (
  <div className="mode-selector" role="tablist" aria-label="计时模式">
    <button
      className={mode === 'focus' ? 'mode-tab active' : 'mode-tab'}
      type="button"
      role="tab"
      aria-selected={mode === 'focus'}
      disabled={status === 'running'}
      onClick={() => onSelect('focus')}
    >
      <span className="tab-dot focus-dot" />
      Focus
    </button>
    <button
      className={mode === 'shortBreak' ? 'mode-tab active' : 'mode-tab'}
      type="button"
      role="tab"
      aria-selected={mode === 'shortBreak'}
      disabled={status === 'running'}
      onClick={() => onSelect('shortBreak')}
    >
      <span className="tab-dot break-dot" />
      Short
    </button>
    <button
      className={mode === 'longBreak' ? 'mode-tab active' : 'mode-tab'}
      type="button"
      role="tab"
      aria-selected={mode === 'longBreak'}
      disabled={status === 'running'}
      onClick={() => onSelect('longBreak')}
    >
      <span className="tab-dot break-dot" />
      Long
    </button>
  </div>
)
