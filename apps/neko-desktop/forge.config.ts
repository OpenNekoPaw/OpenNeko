import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { fileURLToPath } from 'node:url';
import { desktopFuseConfig } from './fuse.config.js';
import { resolveDesktopBuiltinSkillSourceRoot } from './src/main/desktop-builtin-skill-root.js';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.openneko.desktop',
    download: {
      checksums: {
        'electron-v43.2.0-darwin-arm64.zip':
          'ad4a0ae3c37ee05aa06c7e2ed0627608389790f0505a2b0d20319efbe33ffe28',
      },
    },
    extraResource: [
      resolveDesktopBuiltinSkillSourceRoot(fileURLToPath(new URL('.', import.meta.url))),
    ],
    executableName: 'OpenNeko',
    name: 'OpenNeko',
    osxSign: {
      identity: '-',
      identityValidation: false,
      optionsForFile: () => ({
        additionalArguments: ['--options', '0'],
        hardenedRuntime: false,
      }),
    },
  },
  makers: [new MakerZIP({}, ['darwin'])],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
      concurrent: 2,
    }),
    new FusesPlugin(desktopFuseConfig),
  ],
};

export default config;
