import globals from 'globals';
import js from '@eslint/js';
import configPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['coverage/**'],
  },

  js.configs.recommended,
  configPrettier,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
];
