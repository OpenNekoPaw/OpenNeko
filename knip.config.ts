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
    '@types/vscode', // Provided by VSCode runtime
    'esbuild', // Used as CLI bundler, not imported
    '@img/sharp-wasm32', // Sharp WASM fallback
    'clsx',
  ],
  ignoreIssues: {
    // Internal editor API surfaces: intentionally exported for feature modules
    'packages/neko-cut/packages/webview/src/types.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/types/**/*.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/constants.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/index.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/vscodeApi.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/speed.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/waveform.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/pyramidThumbnail.ts': ['exports'],
    // Logger facades expose test-injection hooks for package Webview tests.
    'packages/neko-canvas/packages/webview/src/utils/logger.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/logger.ts': ['exports'],
    'packages/neko-preview/packages/webview/src/utils/logger.ts': ['exports'],
    'packages/neko-tools/packages/webview/src/utils/logger.ts': ['exports'],
    // Vitest aliases this file as the complete `vscode` module, so property reads are dynamic.
    'packages/neko-entity/src/testing/vscode.ts': ['exports'],
    // Shared contract files consumed as package-level type surfaces
    'packages/neko-canvas/packages/webview/src/types/extendedCanvas.ts': ['exports'],
    'packages/neko-preview/packages/extension/src/types/document-messages.ts': ['exports'],
    'packages/neko-preview/packages/webview/src/shared/document-types.ts': ['exports'],
    // CommonJS script API consumed by package/bundle scripts via require().
    'packages/neko-engine/scripts/package-config.js': ['exports'],
  },

  workspaces: {
    '.': {
      entry: [
        'scripts/agent-eval/ablation/run.mjs',
        'scripts/agent-eval/canvas-json-check.mjs',
        'scripts/agent-eval/fixtures/generate-synthetic-document-image-epub.mjs',
        'scripts/agent-eval/protocol-smoke.mjs',
        'scripts/agent-eval/validators/file-validator-cli.mjs',
        'scripts/assert-openneko-release-artifacts.mjs',
        'scripts/check-application-boundaries.mjs',
        'scripts/check-canvas-playback-boundary.mjs',
        'scripts/check-content-access-boundaries.mjs',
        'scripts/check-*-debt-surfaces.mjs',
        'scripts/check-neko-agent-boundaries.mjs',
        'scripts/check-openspec.mjs',
        'scripts/check-release-channels.mjs',
        'scripts/check-strict-tsconfig.mjs',
        'scripts/check-webview-boundaries.mjs',
        'scripts/compile-ts-vsix.mjs',
        'scripts/project-release-version.mjs',
        'scripts/proto-gen-ts.mjs',
        'scripts/smoke-vscode-targets.mjs',
        'scripts/smoke-webview-builds.mjs',
        'scripts/test-orchestration/fixtures/*.ts',
        'scripts/test-orchestration/vscode-debug-config.local.mjs',
      ],
    },
    // ── Layer 0: Library packages ──────────────────────
    'packages/neko-types': {
      entry: [
        'src/index.ts',
        'src/components/index.ts',
        'src/config/config-reader.ts',
        'src/content-access/index.ts',
        'src/generated/__engine-check.ts',
        'src/i18n/index.ts',
        'src/i18n/react.tsx',
        'src/i18n/webview.ts',
        'src/icons/index.ts',
        'src/icons/editor.test.tsx',
        'src/local-metadata/index.ts',
        'src/local-metadata/node.ts',
        'src/local-metadata/node-workspace-identity.ts',
        'src/local-metadata/sqlite/index.ts',
        'src/local-metadata/testing/index.ts',
        'src/nkc/index.ts',
        'src/nkv/index.ts',
        'src/path/index.ts',
        'src/project-authoring/index.ts',
        'src/project-file-io/index.ts',
        'src/theme/index.ts',
        'src/vscode/index.ts',
        'src/vscode/extension/index.ts',
      ],
      ignoreDependencies: ['react', 'react-dom', 'tailwindcss'], // Optional peer dependencies
    },
    'packages/neko-content': {
      entry: ['src/index.ts', 'src/document/index.ts'],
    },
    'packages/neko-client': {},
    'packages/neko-entity': {
      entry: [
        'src/index.ts',
        'src/core/index.ts',
        'src/host-vscode/index.ts',
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
        'src/host-vscode/index.ts',
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

    // ── Extension parent packages ─────────────────────
    // These are VSCode manifest wrappers; entry from sub-packages.
    'packages/neko-cut': {},
    'packages/neko-agent': {
      entry: ['scripts/copy-builtin-skills.mjs'],
    },
    'packages/neko-canvas': {},
    'packages/neko-tools': {},
    'packages/neko-preview': {},
    'packages/neko-assets': {},
    'packages/neko-engine': {
      entry: ['scripts/check-media-closure.mjs', 'scripts/run-with-ffmpeg-env.js'],
      ignore: ['packages/host-napi/**'], // Rust packages, skip
    },

    // ── Extension sub-packages ────────────────────────
    'packages/neko-cut/packages/extension': {},
    'packages/neko-cut/packages/webview': {
      entry: ['src/host-adapter/index.tsx'],
      ignore: [
        // Phase 2 features (v2.0) - planned but not yet implemented
        'src/components/ColorCorrection/**',
        'src/components/Effects/**',
        'src/components/Mask/**',
        'src/components/PropertyPanel/**',
        'src/components/SpeedControl/**',
        'src/components/TransitionPicker/**',
        'src/components/ShapeRenderer.tsx',
        'src/utils/subtitleParser.ts',
      ],
    },
    'packages/neko-agent/packages/extension': {},
    'apps/neko-tui': {
      // Knip's Bun plugin treats `bun test <file>` as a directory project root.
      // The dedicated Bun adapter suite is exercised by the application/CI script.
      bun: false,
    },
    'packages/neko-agent/packages/webview': {
      ignore: [
        // Barrel exports
        'src/components/ChatView/InputArea/index.ts',
        'src/config/index.ts',
      ],
    },
    'packages/neko-agent/packages/platform': {
      entry: ['src/index.ts', 'src/files/index.ts', 'src/media/index.ts'],
    },
    'packages/neko-agent/packages/agent': {
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
    'packages/neko-agent/test-utils': {},
    'packages/neko-canvas/packages/extension': {},
    'packages/neko-canvas/packages/webview': {
      entry: ['src/host-adapter/index.tsx', 'src/preview/narrativePreviewMediaRuntime.ts'],
      ignore: [
        // Barrel exports
        'src/types/index.ts',
        'src/utils/index.ts',
        // Used via barrel exports in panels/
        'src/components/panels/PortEditor.tsx',
        'src/components/panels/PropertyPanel.tsx',
      ],
    },
    'packages/neko-tools/packages/extension': {
      entry: ['src/bootstrap/index.ts', 'src/media-diff/index.ts', 'src/media-lsp/index.ts'],
    },
    'packages/neko-tools/packages/webview': {
      entry: ['src/mediaDiff.tsx'],
      ignore: [
        // Barrel exports and internal utilities
        'src/components/MediaDiff/streaming/index.ts',
        'src/components/MediaDiff/VideoFrameRenderer.tsx',
      ],
    },
    'packages/neko-preview/packages/webview': {
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
    'packages/neko-preview/packages/extension': {},
    'packages/neko-engine/packages/extension': {},

    // ── Skills (CLI scripts, not imported) ───────────────
    // Skills are excluded from analysis - they are runtime scripts, not imported modules

    // ── Skip packages ─────────────────────────────────
    'packages/neko-proto': {
      // Protobuf IDL files, not TypeScript code
      entry: ['package.json'],
    },
    'apps/neko-vscode': {
      entry: ['package.json', 'scripts/run-tests.mjs', 'scripts/validate-manifest.mjs'],
    },
    'packages/neko-engine/packages/host-napi': { ignore: ['**/*'] },
    'packages/neko-engine/packages/host-cli': {
      // Rust CLI binary, not TypeScript
      entry: ['package.json'],
    },
  },
};

export default config;
