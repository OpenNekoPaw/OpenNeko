import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/node_modules/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      '**/coverage/**',
      '**/.turbo/**',
      '**/__mocks__/**',
    ],
  },

  // Base JS recommended rules
  eslint.configs.recommended,

  // TypeScript files
  {
    files: ['packages/**/src/**/*.ts', 'packages/**/src/**/*.tsx'],
    extends: [...tseslint.configs.recommended],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      // --- Error level (CI-blocking) ---
      'no-debugger': 'error',
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
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

  // Security rules — selective enforcement
  // Disabled: detect-object-injection (726 false positives on obj[key]),
  //           detect-non-literal-fs-filename (194 false positives in Extension Host)
  {
    ...security.configs.recommended,
    files: ['packages/**/src/**/*.ts', 'packages/**/src/**/*.tsx'],
    rules: {
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-non-literal-require': 'off',
      'security/detect-unsafe-regex': 'warn',
    },
  },

  // React hooks rules — applied to both .tsx and hook .ts files
  {
    files: ['packages/**/src/**/*.tsx', 'packages/**/src/**/use*.ts'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
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
