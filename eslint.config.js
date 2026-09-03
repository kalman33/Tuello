// @ts-check
const angular = require('angular-eslint');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-plugin-prettier/recommended');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'tmp/**', 'out-tsc/**', 'coverage/**', '.angular/**', '.history/**', 'projects/**']
  },
  {
    files: ['**/*.ts'],
    extends: [...angular.configs.tsRecommended, prettier],
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.json'],
        tsconfigRootDir: __dirname
      }
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/prefer-inject': 'off',
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'mmn',
          style: 'camelCase'
        }
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'mmn',
          style: 'kebab-case'
        }
      ]
    }
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, prettier],
    rules: {}
  }
);
