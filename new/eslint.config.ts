import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';
import configPrettier from 'eslint-config-prettier';

type Config = ReturnType<typeof defineConfig>;

const config: Config = defineConfig(
  {
    ignores: ['coverage/**', 'tmp/**', 'types/**'],
  },

  eslint.configs.recommended,
  tseslint.configs.recommended,
  configPrettier,

  {
    files: ['**/*.ts'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
);

export default config;
