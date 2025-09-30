import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import configPrettier from 'eslint-config-prettier';
import pluginCompat from 'eslint-plugin-compat';
import pluginDepend from 'eslint-plugin-depend';
import pluginSimpleImportSort from 'eslint-plugin-simple-import-sort';
import pluginUnicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

type Config = ReturnType<typeof defineConfig>;

const config: Config = defineConfig(
  {
    ignores: ['coverage/**', 'dist/**', 'tmp/**', 'types/**', '**/test-assets/**'],
  },

  eslint.configs.recommended,
  tseslint.configs.recommended,
  pluginUnicorn.configs.unopinionated,
  pluginCompat.configs['flat/recommended'],
  configPrettier,

  {
    files: ['**/*.ts'],

    plugins: {
      depend: pluginDepend,
      'simple-import-sort': pluginSimpleImportSort,
    },

    extends: ['depend/flat/recommended'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },

    settings: {
      lintAllEsApis: true,
      browserslistOpts: {
        env: 'node',
      },
    },

    rules: {
      // https://eslint.org/docs/latest/rules/prefer-template
      'prefer-template': 'error',

      // https://github.com/lydell/eslint-plugin-simple-import-sort
      'simple-import-sort/imports': 'error',
    },
  },

  {
    files: ['src/browser/**/*.ts'],
    settings: {
      browserslistOpts: {
        env: 'browser',
      },
    },
  },

  {
    files: ['src/isomorphic/**/*.ts'],
    settings: {
      browserslistOpts: {
        env: 'isomorphic',
      },
    },
  },
);

export default config;
