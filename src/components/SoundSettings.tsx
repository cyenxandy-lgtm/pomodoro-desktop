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
    <section className="sound-settings" aria-label="提醒声音设置">
      <div className="sound-setting-heading">
        <div>
          <strong>提醒声音</strong>
          <small>计时结束时播放柔和提示</small>
        </div>
        <label className="sound-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            aria-label="提醒声音开关"
          />
          <span aria-hidden="true" />
        </label>
      </div>
      <div className="volume-row">
        <span>音量</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={volumePercent}
          disabled={!enabled}
          onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
          aria-label="提醒音量"
        />
        <output>{volumePercent}%</output>
      </div>
      <button className="sound-test-button" type="button" disabled={!enabled || volume <= 0} onClick={onTest}>
        <Icon name="play" size={13} />
        试听声音
      </button>
    </section>
  )
}
