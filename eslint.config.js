// eslint.config.js - Updated with proper rules for CLI tool
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off', // Allow any for flexibility
      'prefer-const': 'error',
      'no-var': 'error',

      // Allow console statements in CLI and specific files
      'no-console': [
        'warn',
        {
          allow: ['error', 'warn', 'info'],
        },
      ],

      // Turn off conflicting base rules
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
  {
    // More permissive rules for CLI file
    files: ['src/cli.ts'],
    rules: {
      'no-console': 'off', // CLI needs console output
    },
  },
  {
    // More permissive rules for schema loader (needs console.warn)
    files: ['src/schema-loader.ts'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.js'],
  },
];
