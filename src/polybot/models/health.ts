/**
 * Health status types for components and the overall system.
 */

export type HealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ComponentHealth {
  name: string;
  state: HealthState;
  lastCheck: string;
  latencyMs?: number;
  message?: string;
  /** Consecutive failure count */
  failures: number;
}

export interface StreamingStats {
  wsState: string;
  subscribedAssets: number;
  totalFrames: number;
  frameCounts: Record<string, number>;
  lastFrameAt: string | undefined;
  reconnectCount: number;
  sessionEvents: number;
  sessionDurationMs: number;
}

export interface HealthStatus {
  overall: HealthState;
  components: ComponentHealth[];
  checkedAt: string;
  streaming?: StreamingStats;
}
