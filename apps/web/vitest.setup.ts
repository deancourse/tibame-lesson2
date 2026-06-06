import "@testing-library/jest-dom/vitest";

if (typeof globalThis.IntersectionObserver === "undefined") {
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;
}

// jsdom 在此環境未提供可用的 localStorage（useTheme 會用到）；補上記憶體版實作。
if (
  typeof globalThis.localStorage === "undefined" ||
  typeof globalThis.localStorage.getItem !== "function"
) {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });
}
