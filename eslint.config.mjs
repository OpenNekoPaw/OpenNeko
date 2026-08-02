import eslint from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/node_modules/**',
      '**/*.js',
      '**/*.cjs',
      '**/coverage/**',
      '**/__mocks__/**',
    ],
  },

  // Base JS recommended rules
  eslint.configs.recommended,

  // Repository-owned Desktop functional scripts execute in Node.js and remain part of lint CI.
  {
    files: [
      'scripts/desktop-functional/**/*.mjs',
      'scripts/run-desktop-ui-functional.mjs',
      'scripts/test-orchestration/desktop-functional-runner.test.mjs',
      'packages/*-webview/functional/**/*.mjs',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        WebSocket: 'readonly',
      },
    },
    rules: {
      'no-console': 'error',
      'no-debugger': 'error',
      'prefer-const': 'error',
    },
  },

  // TypeScript files
  {
    files: [
      'apps/**/src/**/*.ts',
      'apps/**/src/**/*.tsx',
      'packages/**/src/**/*.ts',
      'packages/**/src/**/*.tsx',
    ],
    extends: [...tseslint.configs.recommended],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      // --- Error level (CI-blocking) ---
      'no-debugger': 'error',
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'prefer-const': 'error',
      'no-useless-escape': 'error',

      // --- Warn level (report-only, phased migration) ---
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // TypeScript handles these better than ESLint
      'no-undef': 'off',

      // Relaxed rules for existing codebase
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-case-declarations': 'off',
      'no-control-regex': 'off',
    },
  },

  // Explicit console output boundaries: the shared transport and a local manual executable.
  {
    files: ['packages/neko-shared/src/logger/console-logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Security rules — selective enforcement
  // Disabled: detect-object-injection (726 false positives on obj[key]),
  //           detect-non-literal-fs-filename (194 false positives in Extension Host)
  {
    ...security.configs.recommended,
    files: [
      'apps/**/src/**/*.ts',
      'apps/**/src/**/*.tsx',
      'packages/**/src/**/*.ts',
      'packages/**/src/**/*.tsx',
      'scripts/desktop-functional/**/*.mjs',
      'scripts/run-desktop-ui-functional.mjs',
      'scripts/test-orchestration/desktop-functional-runner.test.mjs',
      'packages/*-webview/functional/**/*.mjs',
    ],
    rules: {
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-non-literal-require': 'off',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-unsafe-regex': 'warn',
    },
  },

  // React hooks rules — applied to both .tsx and hook .ts files
  {
    files: [
      'apps/**/src/**/*.tsx',
      'apps/**/src/**/use*.ts',
      'packages/**/src/**/*.tsx',
      'packages/**/src/**/use*.ts',
    ],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Test files — relaxed rules for pragmatic test writing
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Allow `as any` in tests for mocking
      '@typescript-eslint/no-non-null-assertion': 'off', // Allow `!` in tests for known values
    },
  },
);
