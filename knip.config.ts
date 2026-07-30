import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  exclude: [
    // Type-only exports in app code create too much noise for this monorepo.
    // We keep knip focused on runtime dead code and dependency drift.
    'types',
  ],
  ignoreBinaries: [
    // Root package scripts invoke this local CI wrapper directly.
    'scripts/act-ci.sh',
  ],
  ignoreDependencies: [
    '@fission-ai/openspec', // Used by the `openspec` CLI invoked in development workflow.
    'esbuild', // Used as CLI bundler, not imported
    '@img/sharp-wasm32', // Sharp WASM fallback
    'clsx',
  ],
  ignoreIssues: {
    // Internal editor API surfaces: intentionally exported for feature modules
    'packages/neko-cut-webview/src/types.ts': ['exports'],
    'packages/neko-cut-webview/src/types/**/*.ts': ['exports'],
    'packages/neko-cut-webview/src/constants.ts': ['exports'],
    'packages/neko-cut-webview/src/utils/index.ts': ['exports'],
    'packages/neko-cut-webview/src/utils/speed.ts': ['exports'],
    'packages/neko-cut-webview/src/utils/waveform.ts': ['exports'],
    'packages/neko-cut-webview/src/utils/pyramidThumbnail.ts': ['exports'],
    // Logger facades expose test-injection hooks for package Webview tests.
    'packages/neko-canvas-webview/src/utils/logger.ts': ['exports'],
    'packages/neko-cut-webview/src/utils/logger.ts': ['exports'],
    'packages/neko-preview-webview/src/utils/logger.ts': ['exports'],
    'packages/neko-tools-webview/src/utils/logger.ts': ['exports'],
    // Shared contract files consumed as package-level type surfaces
    'packages/neko-canvas-webview/src/types/extendedCanvas.ts': ['exports'],
    'packages/neko-preview-webview/src/shared/document-types.ts': ['exports'],
  },

  workspaces: {
    '.': {
      entry: [
        'scripts/agent-eval/ablation/run.mjs',
        'scripts/agent-eval/canvas-json-check.mjs',
        'scripts/agent-eval/fixtures/generate-synthetic-document-image-epub.mjs',
        'scripts/agent-eval/validators/file-validator-cli.mjs',
        'scripts/check-application-boundaries.mjs',
        'scripts/check-canvas-playback-boundary.mjs',
        'scripts/check-content-access-boundaries.mjs',
        'scripts/check-desktop-only-topology.mjs',
        'scripts/check-engine-retirement-boundary.mjs',
        'scripts/check-*-debt-surfaces.mjs',
        'scripts/check-local-metadata-runtime-matrix.mjs',
        'scripts/check-neko-agent-boundaries.mjs',
        'scripts/check-openspec.mjs',
        'scripts/check-strict-tsconfig.mjs',
        'scripts/check-webview-boundaries.mjs',
        'scripts/prepare-media-runtime-bundle.mjs',
        'scripts/smoke-webview-builds.mjs',
        'scripts/validate-node-media-matrix.mts',
        'scripts/validate-node-media-waveform.mts',
      ],
    },
    // ── Layer 0: Library packages ──────────────────────
    'packages/neko-types': {
      entry: [
        'src/index.ts',
        'src/components/index.ts',
        'src/config/config-reader.ts',
        'src/content-access/index.ts',
        'src/i18n/index.ts',
        'src/i18n/react.tsx',
        'src/i18n/webview.ts',
        'src/icons/index.ts',
        'src/local-metadata/index.ts',
        'src/local-metadata/node.ts',
        'src/local-metadata/node-workspace-identity.ts',
        'src/local-metadata/sqlite/index.ts',
        'src/local-metadata/testing/index.ts',
        'src/logger/index.ts',
        'src/nkc/index.ts',
        'src/path/index.ts',
        'src/project-authoring/index.ts',
        'src/project-file-io/index.ts',
        'src/theme/index.ts',
        'src/types/storage.ts',
      ],
      ignoreDependencies: ['react', 'react-dom', 'tailwindcss'], // Optional peer dependencies
    },
    'packages/neko-content': {
      entry: ['src/index.ts', 'src/document/index.ts'],
    },
    'packages/neko-media': {},
    'packages/neko-chara': {
      entry: ['src/index.ts', 'src/application/index.ts', 'src/core/index.ts', 'src/testing/index.ts'],
    },
    'packages/neko-generation': {},
    'packages/neko-quality': {},
    'packages/neko-entity': {
      entry: [
        'src/index.ts',
        'src/core/index.ts',
        'src/providers/index.ts',
        'src/projections/index.ts',
        'src/search/index.ts',
        'src/testing/index.ts',
      ],
    },
    'packages/neko-search': {
      entry: [
        'src/index.ts',
        'src/core/index.ts',
        'src/providers/index.ts',
        'src/testing/index.ts',
      ],
    },
    'packages/neko-ui': {
      entry: [
        'src/index.ts',
        'src/creative/index.ts',
        'src/error-boundary/index.tsx',
        'src/foundation/index.tsx',
        'src/hooks/index.ts',
        'src/icons/codicon.css',
        'src/icons/index.ts',
        'src/keyboard/focus.css',
        'src/keyboard/index.ts',
        'src/markdown/index.ts',
        'src/primitives/index.ts',
        'src/test-utils/index.ts',
        'src/utils/index.ts',
        'src/workbench/editor-workbench.css',
        'src/workbench/index.ts',
      ],
    },

    'packages/neko-assets': {},
    'packages/neko-cut-webview': {
      entry: ['src/host-adapter/index.tsx', 'src/retained.ts'],
    },
    'apps/neko-desktop': {
      entry: [
        'forge.config.ts',
        'vite.main.config.ts',
        'vite.preload.config.ts',
        'vite.renderer.config.ts',
        'src/main/index.ts',
        'src/preload/index.ts',
      ],
      ignore: ['src/renderer/styles.css'],
    },
    'packages/neko-agent-webview': {
      ignore: [
        // Barrel exports
        'src/components/ChatView/InputArea/index.ts',
        'src/config/index.ts',
      ],
    },
    'packages/neko-platform': {
      entry: ['src/index.ts', 'src/files/index.ts', 'src/media/index.ts'],
    },
    'packages/neko-agent-runtime': {
      entry: [
        'src/index.ts',
        'src/approval/index.ts',
        'src/pi/index.ts',
        'src/runtime/index.ts',
        'src/tools/index.ts',
        'src/validation/index.ts',
        'src/workspace/index.ts',
      ],
    },
    'packages/neko-agent-test-utils': {},
    'packages/neko-canvas-webview': {
      entry: [
        'src/host-adapter/index.tsx',
        'src/main.tsx',
        'src/root.tsx',
        'src/test/setupCanvasStoreScope.ts',
      ],
      ignore: [
        // Barrel exports
        'src/utils/index.ts',
        // Used via barrel exports in panels/
        'src/components/panels/PortEditor.tsx',
        'src/components/panels/PropertyPanel.tsx',
      ],
    },
    'packages/neko-tools-contracts': {
      entry: ['src/index.ts'],
    },
    'packages/neko-tools-webview': {
      entry: ['src/mediaDiff.tsx'],
      ignore: [
        // Barrel exports and internal utilities
        'src/components/MediaDiff/streaming/index.ts',
        'src/components/MediaDiff/VideoFrameRenderer.tsx',
      ],
    },
    'packages/neko-preview-webview': {
      entry: [
        'scripts/three-reference-preset-feasibility.mts',
        'src/audio/main.tsx',
        'src/video/main.tsx',
        'src/cbz/main.tsx',
        'src/docx/main.tsx',
        'src/epub/main.tsx',
        'src/pdf/main.tsx',
        'src/model/main.tsx',
        'src/host-adapter/index.tsx',
      ],
    },
  },
};

export default config;
