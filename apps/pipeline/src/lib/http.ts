// Small resilient fetch for the live provider calls. Dense-page VLM requests run
// ~4-5 minutes each and a live run makes many in sequence, so a single transient
// network blip ("fetch failed"), 429, or 5xx must not doom the whole run.
//
// This retries ONLY transient failures (network throw / 408 / 429 / 5xx) with
// exponential backoff, then rethrows loudly. It NEVER swallows an error or falls
// back to a fixture — a real 4xx (bad request, auth) fails immediately, and an
// exhausted retry budget still throws (SLICE-05: "fails loudly, does not replay").

export interface RetryOpts {
  retries?: number; // additional attempts after the first (default 3)
  baseDelayMs?: number; // backoff base (default 2000)
  label?: string; // for log lines
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

export async function fetchRetry(
  url: string,
  init: RequestInit,
  opts: RetryOpts = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 2000;
  const label = opts.label ?? "request";
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        const wait = base * 2 ** attempt;
        console.warn(
          `  ⚠ ${label} → HTTP ${res.status}; retry ${attempt + 1}/${retries} in ${wait}ms`,
        );
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      // Network-level failure (socket reset, DNS, "fetch failed"). Retry these.
      lastErr = err;
      if (attempt < retries) {
        const wait = base * 2 ** attempt;
        console.warn(
          `  ⚠ ${label} → ${(err as Error).message}; retry ${attempt + 1}/${retries} in ${wait}ms`,
        );
        await sleep(wait);
        continue;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`${label} failed after ${retries + 1} attempts`);
}
