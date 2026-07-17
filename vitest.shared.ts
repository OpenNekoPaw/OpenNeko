/**
 * Shared coverage configuration for all vitest packages.
 *
 * Keep vitest, @vitest/coverage-v8 and Vite peer resolution aligned across the workspace.
 */
export interface SharedCoverageOptions extends Record<string, unknown> {
  include: readonly string[];
  exclude?: readonly string[];
}

export function sharedCoverage(options: SharedCoverageOptions): Record<string, unknown> {
  const { include, exclude = [], ...overrides } = options;
  if (include.length === 0) {
    throw new Error('Shared coverage requires at least one owning production source include.');
  }
  return {
    provider: 'v8',
    reporter: ['text', 'json-summary', 'html'],
    include: [...include],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/__mocks__/**',
      '**/generated/**',
      ...exclude,
    ],
    processingConcurrency: 1,
    thresholds: {
      lines: 30,
      branches: 20,
      functions: 25,
      statements: 30,
    },
    ...overrides,
  };
}
