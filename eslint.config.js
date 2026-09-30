import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build output, not source. `.vercel/output` alone accounted for 206 of the
  // 240 errors a full run reported, which is how a lint run stops being worth
  // reading: the real problems were a rounding error in the noise.
  globalIgnores(['dist', '.vercel', '.ssr-build']),

  // Serverless functions and build scripts run in Node, not a browser. Without
  // this they report `process`, `console` and friends as undefined.
  {
    files: ['api/**/*.js', 'scripts/**/*.mjs', 'middleware.js', 'vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Service workers get their own globals (self, clients, caches), and none
  // of the window ones.
  {
    files: ['public/push-sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
