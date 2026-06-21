// vitest 全局 setup: 为 jsdom 补齐 ResizeObserver mock
// HeroUI Tabs 等组件在内部使用 ResizeObserver，jsdom 未实现该 API
class ResizeObserverMock {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
