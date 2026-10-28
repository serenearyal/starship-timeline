// HTTP GET with timeout and retries, shared by the data fetch and the photo download.

// LL2's detailed launch list can take over 20 s to build when its cache is cold.
export const TIMEOUT_MS = 60_000;
export const ATTEMPTS = 3;
export const USER_AGENT = 'starship-flight-log/1.0 (+https://github.com/serenearyal/starship-timeline)';

export class HttpError extends Error {
  status: number;
  constructor(status: number, url: string) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET `url` and read the body with `read`, with a 60 s timeout per attempt (body included)
 * and up to `attempts` attempts (backoff 2 s, 4 s).
 * Retries network errors, timeouts and 5xx only. 429 and other 4xx fail at once, so a rate limit
 * never burns more of the hourly budget.
 */
export async function fetchWithRetry<T>(
  url: string,
  accept: string,
  read: (response: Response) => Promise<T>,
  attempts = ATTEMPTS,
): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const response = await fetch(url, {
        headers: { accept, 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new HttpError(response.status, url);
      return await read(response);
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof HttpError) || error.status >= 500;
      if (!retryable || i === attempts) break;
      console.warn(`retry ${i}/${attempts - 1} for ${url}: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(2000 * 2 ** (i - 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** GET JSON (see fetchWithRetry for timeout and retries). */
export function fetchJson(url: string, attempts = ATTEMPTS): Promise<unknown> {
  return fetchWithRetry(url, 'application/json', (response) => response.json(), attempts);
}

/** GET raw bytes, e.g. an image (see fetchWithRetry for timeout and retries). */
export function fetchBytes(url: string, attempts = ATTEMPTS): Promise<Uint8Array> {
  return fetchWithRetry(url, 'image/*', async (response) => new Uint8Array(await response.arrayBuffer()), attempts);
}
