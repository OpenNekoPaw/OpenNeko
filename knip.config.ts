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
        'scripts/automation-runtime-release-inputs.mjs',
        'scripts/check-agent-extension-surface.mjs',
        'scripts/check-application-boundaries.mjs',
        'scripts/check-canvas-playback-boundary.mjs',
        'scripts/check-content-access-boundaries.mjs',
        'scripts/check-desktop-only-topology.mjs',
        'scripts/check-engine-retirement-boundary.mjs',
        'scripts/check-*-debt-surfaces.mjs',
        'scripts/check-local-metadata-runtime-matrix.mjs',
        'scripts/check-neko-agent-boundaries.mjs',
        'scripts/check-openspec.mjs',
        'scripts/check-package-boundaries.mjs',
        'scripts/check-package-product-status.mjs',
        'scripts/check-shared-public-surface.mjs',
        'scripts/check-storage-authorities.mts',
        'scripts/check-strict-tsconfig.mjs',
        'scripts/check-webview-boundaries.mjs',
        'scripts/dsh-runtime-closure.mjs',
        'scripts/desktop-functional/run-forge-build.mjs',
        'scripts/prepare-media-runtime-bundle.mjs',
        'scripts/prepare-dsh-runtime-stage.mjs',
        'scripts/run-desktop-ui-functional.mjs',
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
        'src/logger/node.ts',
        'src/path/index.ts',
      ],
    },
    'packages/ai/contracts': {},
    'packages/automation/contracts': {},
    'packages/automation/node': {},
    'packages/content/domain': {
      entry: [
        'src/index.ts',
        'src/core/index.ts',
        'src/node/index.ts',
        'src/project-file-io/index.ts',
        'src/document/index.ts',
        'src/document/node.ts',
      ],
    },
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
    'packages/generation/domain': {
      entry: [
        'src/index.ts',
        'src/comfyui/index.ts',
        'src/job/index.ts',
        'src/media/index.ts',
        'src/prompt/index.ts',
      ],
    },
    'packages/entity/domain': {
      entry: [
        'src/index.ts',
        'src/core/index.ts',
        'src/projections/index.ts',
        'src/search/index.ts',
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

    'packages/assets/domain': {
      entry: [
        'src/asset-center/index.ts',
        'src/asset-center/contract.ts',
        'src/asset-center/controller.ts',
        'src/asset-center/host-contract.ts',
        'src/asset-center/preview-coordination.ts',
        'src/asset-center/session.ts',
        'src/contracts/index.ts',
        'src/global-library/index.ts',
        'src/global-library/contract.ts',
        'src/global-library/controller.ts',
        'src/global-library/membership.ts',
        'src/resource-browser/index.ts',
        'src/resource-browser/contract.ts',
        'src/resource-browser/controller.ts',
        'src/resource-browser/content-tree-source.ts',
        'src/resource-browser/ports.ts',
        'src/resource-browser/presenter.ts',
      ],
    },
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
      ignoreDependencies: [
        // Invoked by the package-owned Desktop build runner through `pnpm exec`.
        '@electron-forge/cli',
      ],
    },
    'packages/dsh-bridge': {
      ignoreDependencies: [
        // Loaded by the package-owned Cordis patch instead of a TypeScript import.
        '@deepseek-ai/dsh-storage-json',
      ],
    },
    'packages/agent/runtime': {
      entry: [
        'src/index.ts',
        'src/application/index.ts',
        'src/acp/index.ts',
        'src/input/mention-excludes.ts',
        'src/input/workspace-ignore.ts',
        'src/session/conversation-id.ts',
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
        'src/host-runtime/index.ts',
        'src/root.tsx',
      ],
      ignore: [
        // Barrel exports
        'src/utils/index.ts',
        // Used via barrel exports in panels/
      ],
    },
    'packages/model/domain': {
      entry: ['src/index.ts'],
    },
    'packages/model/webview': {
      entry: ['scripts/three-reference-preset-feasibility.mts', 'src/root.tsx'],
    },
    'packages/preview/webview': {
      entry: [
        'functional/desktop-openneko-consumer.mjs',
        'src/cbz/main.tsx',
        'src/docx/main.tsx',
        'src/epub/main.tsx',
        'src/pdf/main.tsx',
        'src/host-adapter/index.tsx',
      ],
    },
    'packages/host': {
      entry: [
        'src/index.ts',
        'src/application.ts',
        'src/application-settings-contract.ts',
        'src/application-settings-service.ts',
        'src/application-settings-state.ts',
        'src/ai-model-settings-contract.ts',
        'src/ai-model-settings-service.ts',
        'src/desktop-shell-contract.ts',
        'src/desktop-project-registration-service.ts',
        'src/desktop-shell-service.ts',
        'src/desktop-shell-state.ts',
        'src/desktop-scene-contract.ts',
        'src/desktop-workspace-grant-authority.ts',
        'src/desktop-workspace-grant-contract.ts',
        'src/desktop-storage-settings-contract.ts',
        'src/desktop-workbench-contract.ts',
        'src/desktop-window-composition-contract.ts',
        'src/character-presentation-surface-registry.ts',
        'src/testing/in-memory-desktop-shell-state-repository.ts',
        'src/files/index.ts',
        'src/ports.ts',
        'src/projection-attachment.ts',
        'src/settings/index.ts',
      ],
    },
    'packages/local-metadata': {
      entry: [
        'src/index.ts',
        'src/resource-cache-contract.ts',
        'src/node.ts',
        'src/sqlite/index.ts',
        'src/testing/index.ts',
        'src/node-sqlite-local-metadata-store.ts',
        'src/node-workspace-identity.ts',
      ],
    },
    'packages/media': {
      entry: ['src/index.ts', 'src/node/index.ts', 'src/browser/index.ts'],
    },
    'packages/preview/domain': {
      entry: ['src/index.ts', 'src/authorized-session.ts', 'src/resource-projection.ts'],
    },
    'packages/professional-apps/node': {
      entry: ['src/index.ts', 'src/profiles/comfyui.ts'],
    },
    'packages/project/domain': {
      entry: [
        'src/index.ts',
        'src/contracts/index.ts',
        'src/application/index.ts',
        'src/testing/index.ts',
      ],
    },
    'packages/world/webview': {
      entry: ['src/root.tsx', 'src/runtime.tsx', 'src/style.css'],
    },
  },
};

export default config;
