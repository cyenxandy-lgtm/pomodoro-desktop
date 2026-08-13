import type { TimerStatus } from '../types'
import { Icon } from './Icon'

interface TimerControlsProps {
  status: TimerStatus
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onSkip: () => void
}

export const TimerControls = ({
  status,
  onStart,
  onPause,
  onResume,
  onReset,
  onSkip,
}: TimerControlsProps) => {
  const isRunning = status === 'running'
  const primaryLabel = isRunning ? '暂停' : status === 'paused' ? '继续' : '开始'
  const primaryIcon = isRunning ? 'pause' : 'play'
  const handlePrimary = isRunning ? onPause : status === 'paused' ? onResume : onStart

  return (
    <div className="timer-controls" aria-label="计时控制">
      <button className="primary-button" type="button" onClick={handlePrimary}>
        <Icon name={primaryIcon} size={17} />
        <span>{primaryLabel}</span>
      </button>
      <button className="secondary-button" type="button" onClick={onReset} aria-label="重置计时器">
        <Icon name="reset" size={17} />
        <span>重置</span>
      </button>
      <button
        className="skip-button"
        type="button"
        disabled={status === 'idle'}
        onClick={onSkip}
        aria-label="跳过当前阶段"
      >
        <Icon name="skip" size={16} />
        <span>跳过</span>
      </button>
    </div>
  )
}
