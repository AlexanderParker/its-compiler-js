/**
 * Jest test setup
 */

// Global test timeout
jest.setTimeout(10000);

// Mock console methods in tests to reduce noise
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeEach(() => {
  // Suppress console output in tests unless explicitly testing console output
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

// This export makes this file a module, which allows the global augmentation to work
export {};
