import { MakerDMG } from '@electron-forge/maker-dmg';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { fileURLToPath } from 'node:url';
import { resolveMacOSForgeTrust } from '../../scripts/resolve-macos-forge-trust.mjs';
import { desktopFuseConfig } from './fuse.config.js';

const macOSForgeTrust = resolveMacOSForgeTrust();

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
      fileURLToPath(new URL('./.dsh-runtime-stage/skills', import.meta.url)),
      fileURLToPath(new URL('./.dsh-runtime-stage/dsh-runtime', import.meta.url)),
    ],
    executableName: 'OpenNeko',
    name: 'OpenNeko',
    osxSign: macOSForgeTrust.osxSign,
  },
  makers: [new MakerDMG({}, ['darwin'])],
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
