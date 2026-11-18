export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The request took longer than ${Math.ceil(timeoutMs / 1000)} seconds. Please try again.`);
    this.name = "FetchTimeoutError";
  }
}

/** Does not retry writes: a timed-out request may already have reached the server. */
export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 30_000) {
  if (init.signal?.aborted) throw init.signal.reason;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new FetchTimeoutError(timeoutMs));
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new FetchTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}
