import { Icon } from './Icon'

interface SoundSettingsProps {
  enabled: boolean
  volume: number
  onEnabledChange: (enabled: boolean) => void
  onVolumeChange: (volume: number) => void
  onTest: () => void
}

export const SoundSettings = ({
  enabled,
  volume,
  onEnabledChange,
  onVolumeChange,
  onTest,
}: SoundSettingsProps) => {
  const volumePercent = Math.round(volume * 100)

  return (
    <div className="preference-list sound-settings" aria-label="声音设置">
      <div className="preference-row">
        <span>
          <strong>完成提示音</strong>
          <small>计时结束时播放柔和提示音</small>
        </span>
        <label className="sound-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            aria-label="完成提示音"
          />
          <span aria-hidden="true" />
        </label>
      </div>
      <div className="volume-row">
        <label htmlFor="completion-volume">音量</label>
        <input
          id="completion-volume"
          type="range"
          min="0"
          max="100"
          step="1"
          value={volumePercent}
          disabled={!enabled}
          onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
          aria-valuetext={`${volumePercent}%`}
        />
        <output htmlFor="completion-volume">{volumePercent}%</output>
      </div>
      <button
        className="sound-test-button button-ghost"
        type="button"
        disabled={!enabled || volume <= 0}
        onClick={onTest}
      >
        <Icon name="play" size={13} />
        试听声音
      </button>
    </div>
  )
}
