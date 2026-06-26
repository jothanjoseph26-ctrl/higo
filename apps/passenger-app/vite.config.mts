import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const extensions = [
  '.mjs',
  '.web.tsx',
  '.tsx',
  '.web.ts',
  '.ts',
  '.web.jsx',
  '.jsx',
  '.web.js',
  '.js',
  '.css',
  '.json',
];

const EXPO_PACKAGES = [
  /react-native-vector-icons/,
  /react-native-screens/,
  /react-native-safe-area-context/,
  /react-native-image-picker/,
  /expo-av/,
  /expo-location/,
  /expo-speech/,
  /expo-task-manager/,
  /expo-image-manipulator/,
];

const rollupPlugin = (matchers: RegExp[]) => ({
  name: 'js-in-jsx',
  async load(id: string) {
    const normalizedId = id.replace(/\\/g, '/');
    if (!matchers.some((matcher) => matcher.test(normalizedId))) return;
    const cleanId = normalizedId.split('?')[0].split('#')[0];
    const loader =
      cleanId.endsWith('.tsx') ? 'tsx'
      : cleanId.endsWith('.jsx') ? 'jsx'
      : cleanId.endsWith('.ts') ? 'ts'
      : cleanId.endsWith('.js') ? 'jsx'
      : null;
    if (!loader) return;
    const file = readFileSync(id.split('?')[0].split('#')[0], { encoding: 'utf-8' });
    try {
      return await transformWithEsbuild(file, cleanId, { loader, jsx: 'automatic' });
    } catch (e) {
      console.error(`[js-in-jsx] transform error for ${cleanId}:`, e);
    }
  },
});

export default defineConfig({
  root: import.meta.dirname,
  base: process.env.VITE_BASE_PATH ?? '/',
  cacheDir: '../../node_modules/.vite/apps/passenger-app',
  define: {
    global: 'window',
    __DEV__: 'true',
    'process.env': '{}',
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
      process.env.VITE_API_BASE_URL ?? 'https://hiconnect-production.up.railway.app/api',
    ),
    'import.meta.env.VITE_SOCKET_URL': JSON.stringify(
      process.env.VITE_SOCKET_URL ?? 'https://hiconnect-production.up.railway.app',
    ),
  },
  resolve: {
    extensions,
    alias: [
      { find: 'react-native/Libraries/Utilities/codegenNativeComponent', replacement: join(import.meta.dirname, 'src/shims/codegenNativeComponent.tsx') },
      { find: 'react-native/Libraries/ReactNative/AppContainer', replacement: join(import.meta.dirname, 'src/shims/AppContainer.tsx') },
      { find: 'react-native', replacement: join(import.meta.dirname, 'src/shims/react-native-web-extended.ts') },
      { find: 'react-native-svg', replacement: 'react-native-svg-web' },
      { find: 'react-native-maps', replacement: resolve(import.meta.dirname, './src/components/react-native-maps-mock.tsx') },
      { find: '@react-native/assets-registry/registry', replacement: 'react-native-web/dist/modules/AssetRegistry/index' },
      { find: '@react-native/normalize-colors', replacement: join(import.meta.dirname, 'src/shims/normalize-colors-shim.ts') },
      { find: /expo-modules-core[\\/]src[\\/]ts-declarations[\\/](EventEmitter|NativeModule|SharedObject|SharedRef)/, replacement: join(import.meta.dirname, 'src/shims/expo-shim.ts') },
      { find: 'expo-modules-core', replacement: join(import.meta.dirname, 'src/shims/expo-shim.ts') },
      { find: /^expo$/, replacement: join(import.meta.dirname, 'src/shims/expo-shim.ts') },
    ],
  },
  build: {
    reportCompressedSize: true,
    commonjsOptions: { transformMixedEsModules: true },
    outDir: '../../dist/apps/passenger-app/web',
    rollupOptions: {
      external: [/expo-modules-core/],
      plugins: [rollupPlugin(EXPO_PACKAGES)],
    },
  },
  server: {
    port: 4200,
    host: 'localhost',
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  optimizeDeps: {
    exclude: [
      'expo',
      'expo-modules-core',
      'expo-av',
      'expo-image-manipulator',
      'expo-location',
      'expo-speech',
      'expo-task-manager',
      'react-native-image-picker',
      'react-native-screens',
    ],
    include: ['@higo/api-client', '@higo/shared-types', '@higo/brand-tokens', 'warn-once'],
    // Note: esbuildOptions removed — Vite 8 uses Rolldown, not esbuild.
    // JSX-in-JS is handled by the rollupPlugin('js-in-jsx') above.
  },
  plugins: [react(), nxViteTsPaths(), rollupPlugin(EXPO_PACKAGES)],
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
});
