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
    'packages/cut/webview/src/types.ts': ['exports'],
    'packages/cut/webview/src/types/**/*.ts': ['exports'],
    'packages/cut/webview/src/constants.ts': ['exports'],
    'packages/cut/webview/src/utils/index.ts': ['exports'],
    'packages/cut/webview/src/utils/speed.ts': ['exports'],
    'packages/cut/webview/src/utils/waveform.ts': ['exports'],
    'packages/cut/webview/src/utils/pyramidThumbnail.ts': ['exports'],
    // Logger facades expose test-injection hooks for package Webview tests.
    'packages/canvas/webview/src/utils/logger.ts': ['exports'],
    'packages/cut/webview/src/utils/logger.ts': ['exports'],
    'packages/preview/webview/src/utils/logger.ts': ['exports'],
    // Shared contract files consumed as package-level type surfaces
    'packages/canvas/webview/src/types/extendedCanvas.ts': ['exports'],
    'packages/preview/webview/src/shared/document-types.ts': ['exports'],
  },

  workspaces: {
    '.': {
      entry: [
        'scripts/agent-eval/ablation/run.mjs',
        'scripts/agent-eval/canvas-json-check.mjs',
        'scripts/agent-eval/fixtures/generate-synthetic-document-image-epub.mjs',
        'scripts/agent-eval/validators/file-validator-cli.mjs',
        'scripts/assert-dsh-cutover-release-ready.mjs',
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
        'scripts/dsh-runtime-closure.mjs',
        'scripts/prepare-media-runtime-bundle.mjs',
        'scripts/prepare-dsh-runtime-stage.mjs',
        'scripts/smoke-webview-builds.mjs',
        'scripts/validate-node-media-matrix.mts',
        'scripts/validate-node-media-waveform.mts',
      ],
      ignore: [
        // Deliberately invalid source trees consumed as architecture-gate fixtures.
        'scripts/fixtures/architecture-boundaries/**',
      ],
    },
    // ── Layer 0: Library packages ──────────────────────
    'packages/shared': {
      entry: [
        'src/index.ts',
        'src/core/index.ts',
        'src/errors/index.ts',
        'src/job-lifecycle/index.ts',
        'src/logger/index.ts',
        'src/path/index.ts',
      ],
    },
    'packages/ai/contracts': {},
    'packages/automation/contracts': {},
    'packages/automation/node': {},
    'packages/content/domain': {
      entry: ['src/index.ts', 'src/document/index.ts'],
    },
    'packages/media': {},
    'packages/chara/domain': {
      entry: [
        'src/index.ts',
        'src/application/index.ts',
        'src/core/index.ts',
        'src/testing/index.ts',
      ],
    },
    'packages/chara/node': {
      entry: ['src/index.ts'],
    },
    'packages/chara/webview': {
      entry: ['src/root.tsx'],
    },
    'packages/world/domain': {
      entry: [
        'src/index.ts',
        'src/contracts/index.ts',
        'src/core/index.ts',
        'src/application/index.ts',
        'src/testing/index.ts',
      ],
    },
    'packages/world/node': {
      entry: ['src/index.ts'],
    },
    'packages/generation/domain': {},
    'packages/quality': {},
    'packages/entity/domain': {
      entry: [
        'src/index.ts',
        'src/core/index.ts',
        'src/providers/index.ts',
        'src/projections/index.ts',
        'src/search/index.ts',
        'src/testing/index.ts',
      ],
    },
    'packages/search/domain': {
      entry: [
        'src/index.ts',
        'src/core/index.ts',
        'src/providers/index.ts',
        'src/testing/index.ts',
      ],
    },
    'packages/ui': {
      entry: [
        'src/index.ts',
        'src/creative/index.ts',
        'src/error-boundary/index.tsx',
        'src/foundation/index.tsx',
        'src/hooks/index.ts',
        'src/icons/codicon.css',
        'src/icons/index.ts',
        'src/i18n/index.ts',
        'src/i18n/react.tsx',
        'src/i18n/webview.ts',
        'src/keyboard/focus.css',
        'src/keyboard/index.ts',
        'src/markdown/index.ts',
        'src/primitives/index.ts',
        'src/test-utils/index.ts',
        'src/theme/index.ts',
        'src/theme/tailwind-preset.ts',
        'src/utils/index.ts',
        'src/workbench/editor-workbench.css',
        'src/workbench/index.ts',
      ],
      ignoreDependencies: ['tailwindcss'], // Optional peer used only by the exported preset.
    },

    'packages/assets/domain': {},
    'packages/assets/webview': {
      entry: [
        'src/global-library/root.tsx',
        'src/project-portability/ProjectPortabilityControl.tsx',
        'src/resource-browser/root.tsx',
      ],
    },
    'packages/cut/webview': {
      entry: [
        'functional/desktop-openneko-consumer.mjs',
        'src/host-adapter/index.tsx',
        'src/retained.ts',
      ],
    },
    'apps/neko-desktop': {
      entry: [
        'forge.config.ts',
        'vite.main.config.ts',
        'vite.preload.config.ts',
        'vite.renderer.config.ts',
        'src/main/index.ts',
        'src/main/desktop-openneko-qualification.ts',
        'src/preload/index.ts',
      ],
    },
    'packages/agent/runtime': {
      entry: [
        'src/index.ts',
        'src/runtime/index.ts',
        'src/workspace/index.ts',
      ],
    },
    'scripts/dsh-q0': {
      entry: [
        'prompt-provider/index.mjs',
        'seed-plugin/index.mjs',
        'src/qualify.mjs',
        'w2-seed-plugin/index.mjs',
      ],
      ignoreBinaries: [
        // The qualifier invokes build scripts in the three first-party plugin packages.
        'build',
      ],
      ignoreDependencies: [
        // Resolved as the exact executable package by the qualification process.
        '@deepseek-ai/dsh',
        // Named in the isolated profile manifest created at runtime.
        '@deepseek-ai/dsh-base',
        // Version-qualified without importing implementation modules.
        '@deepseek-ai/dsh-headless',
      ],
    },
    'packages/canvas/webview': {
      entry: [
        'functional/desktop-openneko-consumer.mjs',
        'src/host-adapter/index.tsx',
        'src/root.tsx',
        'src/test/setupCanvasStoreScope.ts',
      ],
      ignore: [
        // Barrel exports
        'src/utils/index.ts',
        // Used via barrel exports in panels/
      ],
    },
    'packages/preview/webview': {
      entry: [
        'functional/desktop-openneko-consumer.mjs',
        'scripts/three-reference-preset-feasibility.mts',
        'src/cbz/main.tsx',
        'src/docx/main.tsx',
        'src/epub/main.tsx',
        'src/pdf/main.tsx',
        'src/host-adapter/index.tsx',
      ],
    },
  },
};

export default config;
