import type { IngestPayload } from '../parser/message-types.js';
import type { LocalBuffer } from './local-buffer.js';

export interface IngestClientConfig {
  apiUrl: string;
  apiToken: string;
  retryIntervalMs?: number;
}

export class IngestClient {
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly retryIntervalMs: number;

  constructor(
    private readonly config: IngestClientConfig,
    private readonly buffer: LocalBuffer,
  ) {
    this.retryIntervalMs = config.retryIntervalMs ?? 30_000;
  }

  async send(payload: IngestPayload): Promise<boolean> {
    try {
      const res = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        this.buffer.add(payload);
        return false;
      }

      return true;
    } catch {
      this.buffer.add(payload);
      return false;
    }
  }

  startRetryLoop(): void {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(() => {
      void this.flushBuffer();
    }, this.retryIntervalMs);
  }

  stopRetryLoop(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async flushBuffer(): Promise<number> {
    const entries = this.buffer.getAll();
    let sent = 0;

    for (const entry of entries) {
      try {
        const res = await fetch(this.config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiToken}`,
          },
          body: JSON.stringify(entry.payload),
        });

        if (res.ok) {
          this.buffer.remove(entry.id);
          sent++;
        }
      } catch {
        // API still unreachable, keep in buffer
      }
    }

    return sent;
  }
}
