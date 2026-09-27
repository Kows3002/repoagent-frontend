// Share only requests that are currently running. Settled responses are never
// cached: a refresh must see current session, repository, and job state.
interface PendingRequest {
  controller: AbortController;
  promise: Promise<unknown>;
  subscribers: number;
  cancelWhenUnused: boolean;
}

const pending = new Map<string, PendingRequest>();
const MAX_PENDING_REQUESTS = 100;

function canceled(): DOMException {
  return new DOMException("Request canceled", "AbortError");
}

export function clearSharedRequests(): void {
  const requests = [...pending.values()];
  pending.clear();
  for (const request of requests) request.controller.abort();
}

export function shareRequest<T>(
  key: string,
  operation: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal | null,
  cancelWhenUnused = true,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(canceled());
  let request = pending.get(key);
  if (!request || request.controller.signal.aborted) {
    if (pending.size >= MAX_PENDING_REQUESTS) {
      return Promise.reject(new DOMException("Too many concurrent requests", "QuotaExceededError"));
    }
    const controller = new AbortController();
    request = {controller, promise: Promise.resolve(), subscribers: 0, cancelWhenUnused};
    const current = request;
    const release = () => {
      if (pending.get(key) === current) pending.delete(key);
    };
    pending.set(key, current);
    current.promise = operation(controller.signal).then(
      value => { release(); return value; },
      error => { release(); throw error; },
    );
  }
  const current = request;
  current.subscribers += 1;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return false;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      current.subscribers -= 1;
      // React StrictMode remounts effects synchronously. A replacement subscriber
      // can retain this transport without inheriting the first caller's abort.
      void Promise.resolve().then(() => {
        if (current.cancelWhenUnused && current.subscribers === 0 && pending.get(key) === current) {
          pending.delete(key);
          current.controller.abort();
        }
      });
      return true;
    };
    const onAbort = () => { if (finish()) reject(canceled()); };
    signal?.addEventListener("abort", onAbort, {once: true});
    current.promise.then(
      value => {
        if (finish()) {
          if (current.controller.signal.aborted) reject(canceled());
          else resolve(value as T);
        }
      },
      error => { if (finish()) reject(error); },
    );
    if (signal?.aborted) onAbort();
  });
}
