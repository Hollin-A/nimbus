import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement these DOM APIs that Headless UI (Combobox) calls
// during pointer interaction and option scrolling. Polyfill them as no-ops so
// component tests don't throw on otherwise-supported behaviour.
Element.prototype.scrollIntoView = function scrollIntoView() {};
Element.prototype.hasPointerCapture = function hasPointerCapture() {
  return false;
};
Element.prototype.setPointerCapture = function setPointerCapture() {};
Element.prototype.releasePointerCapture = function releasePointerCapture() {};

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;
