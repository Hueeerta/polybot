/**
 * Port interfaces for transport connections and health probes.
 */

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface TransportConnection {
  readonly state: ConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (data: unknown) => void): void;
  onError(handler: (err: Error) => void): void;
  onStateChange(handler: (state: ConnectionState) => void): void;
}

export interface ProbeResult {
  reachable: boolean;
  latencyMs: number;
  lastMessageAt?: string;
  state: ConnectionState;
  error?: string;
}

export interface TransportProbe {
  probe(): Promise<ProbeResult>;
}
