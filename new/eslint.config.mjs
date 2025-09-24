import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';
import configPrettier from 'eslint-config-prettier';

export default defineConfig(
  {
    ignores: ['coverage/**'],
  },

  eslint.configs.recommended,
  tseslint.configs.recommended,
  configPrettier,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
);
