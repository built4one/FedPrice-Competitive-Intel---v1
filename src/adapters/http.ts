import type { ConnectorStatus } from '../types';

export type FailureStatus = Exclude<ConnectorStatus['status'], 'SUCCESS' | 'CACHED' | 'ZERO_RESULTS' | 'SKIPPED'>;

export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly status: FailureStatus,
    public readonly statusCode?: number,
    public readonly attempts = 1,
    public readonly durationMs = 0,
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

interface FetchOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
}

const retryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function classifyStatus(status: number): FailureStatus {
  if (status === 401 || status === 403) return 'AUTH_REQUIRED';
  if (status === 408) return 'TIMEOUT';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400 || status === 404 || status === 422) return 'INVALID_QUERY';
  if (status >= 500) return 'SOURCE_UNAVAILABLE';
  return 'ERROR';
}

function safeMessage(body: string, status: number) {
  const compact = body.replace(/\s+/g, ' ').trim().slice(0, 240);
  return compact ? `HTTP ${status}: ${compact}` : `HTTP ${status}`;
}

export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit = {},
  options: FetchOptions = {},
): Promise<{ data: T; attempts: number; durationMs: number; statusCode: number }> {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const body = await response.text();
      if (!response.ok) {
        const status = classifyStatus(response.status);
        if (retryableStatus(response.status) && attempt < maxAttempts) {
          await wait(baseDelayMs * (2 ** (attempt - 1)) + Math.floor(Math.random() * 100));
          continue;
        }
        throw new ConnectorError(safeMessage(body, response.status), status, response.status, attempt, Date.now() - startedAt);
      }

      try {
        return { data: JSON.parse(body) as T, attempts: attempt, durationMs: Date.now() - startedAt, statusCode: response.status };
      } catch {
        throw new ConnectorError('The source returned a non-JSON response.', 'SOURCE_UNAVAILABLE', response.status, attempt, Date.now() - startedAt);
      }
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      const isTimeout = error instanceof Error && (error.name === 'AbortError' || /aborted|timeout/i.test(error.message));
      if (attempt < maxAttempts) {
        await wait(baseDelayMs * (2 ** (attempt - 1)) + Math.floor(Math.random() * 100));
        continue;
      }
      throw new ConnectorError(
        isTimeout ? `Timed out after ${timeoutMs}ms.` : (error instanceof Error ? error.message : 'Network request failed.'),
        isTimeout ? 'TIMEOUT' : 'SOURCE_UNAVAILABLE',
        undefined,
        attempt,
        Date.now() - startedAt,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new ConnectorError('Source request failed.', 'ERROR', undefined, maxAttempts, Date.now() - startedAt);
}
