import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', '.tmp/', 'test/fixtures/sample/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];
