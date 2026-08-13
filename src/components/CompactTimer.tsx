import type { TimerMode, TimerStatus } from '../types'
import { formatTime } from '../utils/timer'
import { Icon } from './Icon'
import { TimerControls } from './TimerControls'

interface CompactTimerProps { mode: TimerMode; status: TimerStatus; remainingSeconds: number; onStart: () => void; onPause: () => void; onResume: () => void; onReset: () => void; onSkip: () => void; onExpand: () => void }
const modeLabel = (mode: TimerMode): string => mode === 'focus' ? '专注' : mode === 'longBreak' ? '长休息' : '短休息'

export const CompactTimer = ({ mode, status, remainingSeconds, onStart, onPause, onResume, onReset, onSkip, onExpand }: CompactTimerProps) => (
  <main className="compact-timer" aria-label="紧凑计时器">
    <div className="compact-summary">
      <span className="mode-label"><span className="live-dot" />{modeLabel(mode)}</span>
      <time dateTime={`PT${remainingSeconds}S`} aria-label={`剩余 ${formatTime(remainingSeconds)}`}>{formatTime(remainingSeconds)}</time>
      <button className="expand-button button-ghost" type="button" onClick={onExpand} aria-label="展开完整界面"><Icon name="expand" size={16} /></button>
    </div>
    <TimerControls status={status} onStart={onStart} onPause={onPause} onResume={onResume} onReset={onReset} onSkip={onSkip} />
  </main>
)
