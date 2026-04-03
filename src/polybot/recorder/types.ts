/**
 * Port interface for event recording.
 */

import type { DomainEvent } from '../models/events.js';

export interface EventRecorder {
  /** Initialize the recorder for a new session */
  start(sessionId: string): Promise<void>;
  /** Record a domain event */
  record(event: DomainEvent): Promise<void>;
  /** Flush and close the recorder */
  stop(): Promise<void>;
}
