import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchTimeoutError, fetchWithTimeout } from "@/lib/fetch-with-timeout";

describe("fetchWithTimeout", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  it("returns a successful response", async () => {
    const response = new Response("ok");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(fetchWithTimeout("/api/example", {}, 100)).resolves.toBe(response);
  });
  it("aborts and returns a clear timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_: RequestInfo | URL, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))));
    const pending = fetchWithTimeout("/api/example", {}, 50);
    const assertion = expect(pending).rejects.toBeInstanceOf(FetchTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
  it("preserves a caller abort", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_: RequestInfo | URL, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))));
    const pending = fetchWithTimeout("/api/example", { signal: controller.signal }, 1_000);
    const reason = new Error("cancelled by caller"); controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });
  it("does not start a request when the caller already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("already cancelled"); controller.abort(reason);
    const mockedFetch = vi.fn(); vi.stubGlobal("fetch", mockedFetch);
    await expect(fetchWithTimeout("/api/example", { signal: controller.signal })).rejects.toBe(reason);
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
