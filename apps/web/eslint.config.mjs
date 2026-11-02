import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve('eslint-config-next'));
const tsParser = nextRequire('@typescript-eslint/parser');
const reactHooksPlugin = nextRequire('eslint-plugin-react-hooks');
const nextPlugin = nextRequire('@next/eslint-plugin-next');
export default [
  {
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooksPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'no-debugger': 'error',
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
  },
];
