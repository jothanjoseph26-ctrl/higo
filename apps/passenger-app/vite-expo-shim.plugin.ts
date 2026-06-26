import type { Plugin } from 'vite';
import { join } from 'path';

export function expoModulesCoreShimPlugin(appDir: string): Plugin {
  const shimPath = join(appDir, 'src/shims/expo-shim.ts');

  return {
    name: 'expo-modules-core-shim',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'expo-modules-core' || source.startsWith('expo-modules-core/')) {
        return shimPath;
      }
      return null;
    },
    transform(code, id) {
      if (!id.includes('node_modules')) return null;
      if (!code.includes('expo-modules-core')) return null;
      const next = code.replace(
        /from\s+['"]expo-modules-core['"]/g,
        `from '${shimPath.replace(/\\/g, '/')}'`,
      );
      return next === code ? null : { code: next, map: null };
    },
  };
}