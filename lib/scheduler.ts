"use client";

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleCallback = (deadline: IdleDeadlineLike) => void;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleCallback,
    options?: {
      timeout?: number;
    }
  ) => number;
  cancelIdleCallback?: (id: number) => void;
};

type RafWindow = Window & {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;
};

export function scheduleIdleTask(task: () => void, timeout = 500): () => void {
  if (typeof window === "undefined") {
    task();
    return () => undefined;
  }

  const win = window as IdleWindow;
  if (typeof win.requestIdleCallback === "function") {
    const id = win.requestIdleCallback(() => {
      task();
    }, { timeout });
    return () => {
      win.cancelIdleCallback?.(id);
    };
  }

  const timer = window.setTimeout(task, 0);
  return () => {
    window.clearTimeout(timer);
  };
}

export function createRafThrottle<T extends unknown[]>(fn: (...args: T) => void) {
  let rafId: number | null = null;
  let lastArgs: T | null = null;

  const invoke = () => {
    rafId = null;
    if (!lastArgs) return;
    const args = lastArgs;
    lastArgs = null;
    fn(...args);
  };

  const throttled = (...args: T) => {
    lastArgs = args;
    if (rafId !== null) return;
    const win = window as RafWindow;
    rafId = win.requestAnimationFrame(invoke);
  };

  throttled.cancel = () => {
    if (rafId === null) return;
    const win = window as RafWindow;
    win.cancelAnimationFrame(rafId);
    rafId = null;
    lastArgs = null;
  };

  return throttled;
}

export function createDebounced<T extends unknown[]>(
  fn: (...args: T) => void,
  delayMs: number
) {
  let timer: number | null = null;

  const debounced = (...args: T) => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };

  debounced.cancel = () => {
    if (timer === null) return;
    window.clearTimeout(timer);
    timer = null;
  };

  return debounced;
}
