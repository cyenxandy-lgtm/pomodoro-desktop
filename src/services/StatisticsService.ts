import { invoke } from '@tauri-apps/api/core'
import type { NativeStatisticsSnapshot } from '../domain/statistics'

export interface StatisticsQuery {
  startDate: string | null
  endDate: string | null
  recentLimit: number
}

export interface StatisticsService {
  getSnapshot(query: StatisticsQuery): Promise<NativeStatisticsSnapshot>
}

export interface StatisticsBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
}

const tauriBridge: StatisticsBridge = { invoke }

export class TauriStatisticsService implements StatisticsService {
  private readonly bridge: StatisticsBridge

  constructor(bridge: StatisticsBridge = tauriBridge) {
    this.bridge = bridge
  }

  getSnapshot = (query: StatisticsQuery): Promise<NativeStatisticsSnapshot> => (
    this.bridge.invoke<NativeStatisticsSnapshot>('statistics_get_snapshot', { ...query })
  )
}

export class EmptyStatisticsService implements StatisticsService {
  async getSnapshot(): Promise<NativeStatisticsSnapshot> {
    return { daily: [], recentSessions: [] }
  }
}
