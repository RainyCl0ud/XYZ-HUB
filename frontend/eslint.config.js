import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },

  /*
   * These route-level pages intentionally start their async
   * data loader when the route mounts. The shared loader also
   * owns loading/error state because the same function is reused
   * by retry and refresh actions. Keep the rule enabled elsewhere.
   */
  {
    files: [
      'src/pages/ChattersPage.tsx',
      'src/pages/ChatterDetailPage.tsx',
      'src/pages/ConfigurationPage.tsx',
      'src/pages/DashboardPage.tsx',
      'src/pages/IncidentsPage.tsx',
      'src/pages/ModelsPage.tsx',
      'src/pages/PeoplePage.tsx',
      'src/pages/RoleBuilderPage.tsx',
      'src/pages/RulesPage.tsx',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  /*
   * Context modules deliberately export both a provider component
   * and its companion hook. That is a stable module boundary for
   * this application, so disable the Vite fast-refresh export rule
   * only for these two files rather than globally.
   */
  {
    files: [
      'src/auth/AuthContext.tsx',
      'src/components/ToastProvider.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
