import { ToastHttpError } from "./transport.js";

export function awaitRefreshForCaller<T>(
  refresh: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) return refresh;
  if (signal.aborted) return Promise.reject(callerCancellationError());

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => reject(callerCancellationError()));
    signal.addEventListener("abort", onAbort, { once: true });
    void refresh.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function callerCancellationError(): ToastHttpError {
  return new ToastHttpError("request_cancelled", "Toast request was cancelled.", {
    apiFamily: "standard",
    retryable: false,
  });
}
