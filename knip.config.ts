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
    'sharp', // Native binary, loaded at runtime
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
        'scripts/agent-eval/protocol-smoke.mjs',
        'scripts/agent-eval/validators/file-validator-cli.mjs',
        'scripts/test-orchestration/fixtures/*.ts',
      ],
    },
    // ── Layer 0: Library packages ──────────────────────
    'packages/neko-types': {
      // Knip auto-detects entries from package.json exports
      ignoreDependencies: ['react', 'react-dom', 'tailwindcss'], // Optional peer dependencies
    },
    'packages/neko-content': {},
    'packages/neko-client': {},

    // ── Extension parent packages ─────────────────────
    // These are VSCode manifest wrappers; entry from sub-packages.
    'packages/neko-cut': {},
    'packages/neko-agent': {},
    'packages/neko-canvas': {},
    'packages/neko-tools': {},
    'packages/neko-preview': {},
    'packages/neko-assets': {},
    'packages/neko-engine': {
      ignore: ['packages/host-napi/**'], // Rust packages, skip
    },

    // ── Extension sub-packages ────────────────────────
    'packages/neko-cut/packages/extension': {},
    'packages/neko-cut/packages/webview': {
      // Vite auto-detects entries from HTML files, explicit entry is redundant
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
    'packages/neko-agent/packages/platform': {},
    'packages/neko-agent/packages/agent': {},
    'packages/neko-agent/test-utils': {},
    'packages/neko-canvas/packages/extension': {},
    'packages/neko-canvas/packages/webview': {
      entry: ['src/preview/narrativePreviewMediaRuntime.ts'],
      ignore: [
        // Barrel exports
        'src/types/index.ts',
        'src/utils/index.ts',
        // Used via barrel exports in panels/
        'src/components/panels/PortEditor.tsx',
        'src/components/panels/PropertyPanel.tsx',
      ],
    },
    'packages/neko-tools/packages/extension': {},
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
      // Pure Extension Pack product manifest with no runtime source.
      entry: ['package.json'],
    },
    'packages/neko-engine/packages/host-napi': { ignore: ['**/*'] },
    'packages/neko-engine/packages/host-cli': {
      // Rust CLI binary, not TypeScript
      entry: ['package.json'],
    },
  },
};

export default config;
