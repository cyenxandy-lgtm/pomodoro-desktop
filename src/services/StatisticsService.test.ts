import { describe, expect, it } from 'vitest'
import { TauriStatisticsService } from './StatisticsService'
import type { StatisticsBridge } from './StatisticsService'

class FakeBridge implements StatisticsBridge {
  calls: Array<{ command: string; args?: Record<string, unknown> }> = []

  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    this.calls.push({ command, args })
    return { daily: [], recentSessions: [] } as T
  }
}

describe('TauriStatisticsService', () => {
  it('maps the typed snapshot query to one bounded IPC command', async () => {
    const bridge = new FakeBridge()
    const service = new TauriStatisticsService(bridge)

    await service.getSnapshot({ startDate: null, endDate: '2026-08-10', recentLimit: 30 })

    expect(bridge.calls).toEqual([{
      command: 'statistics_get_snapshot',
      args: { startDate: null, endDate: '2026-08-10', recentLimit: 30 },
    }])
  })
})
