import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import configPrettier from 'eslint-config-prettier';
import pluginSimpleImportSort from 'eslint-plugin-simple-import-sort';
import pluginUnicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

type Config = ReturnType<typeof defineConfig>;

const config: Config = defineConfig(
  {
    ignores: ['coverage/**', 'dist/**', 'tmp/**', 'types/**'],
  },

  eslint.configs.recommended,
  tseslint.configs.recommended,
  pluginUnicorn.configs.unopinionated,
  configPrettier,

  {
    files: ['**/*.ts'],

    plugins: {
      'simple-import-sort': pluginSimpleImportSort,
    },

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },

    rules: {
      // https://eslint.org/docs/latest/rules/prefer-template
      'prefer-template': 'error',

      // https://github.com/lydell/eslint-plugin-simple-import-sort
      'simple-import-sort/imports': 'error',
    },
  },
);

export default config;
