/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Rule 1: No circular dependencies ───────────────
    {
      name: 'no-circular',
      comment:
        'Runtime circular dependencies break module isolation and cause initialization issues',
      severity: 'error',
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ['type-only', 'type-import'] },
      },
    },

    // ── Rule 2: Layer 0 has zero internal dependencies ─
    {
      name: 'layer0-no-internal-deps',
      comment:
        'Foundation packages (@neko/shared, @neko/host, @neko/media, @neko/proto) must not depend on feature packages',
      severity: 'error',
      from: {
        path: [
          '^packages/neko-types/',
          '^packages/neko-host/',
          '^packages/neko-media/',
          '^packages/neko-proto/',
        ],
      },
      to: {
        path: '^packages/',
        pathNot: [
          // Allow self-references and Layer 0 peers
          '^packages/neko-types/',
          '^packages/neko-host/',
          '^packages/neko-media/',
          '^packages/neko-proto/',
        ],
      },
    },

    // ── Rule 3: Webview must not import vscode ─────────
    {
      name: 'webview-no-vscode',
      comment: 'Webview packages run in browser sandbox and cannot access the vscode module',
      severity: 'error',
      from: {
        path: 'packages/.+/packages/webview/',
      },
      to: {
        path: '^vscode$',
      },
    },

    // ── Rule 4: Extension must not import React ────────
    {
      name: 'extension-no-react',
      comment: 'Extension host packages must not import React or DOM libraries',
      severity: 'error',
      from: {
        path: 'packages/.+/packages/extension/',
      },
      to: {
        path: '^react(-dom)?$',
      },
    },

    // ── Rule 5: No cross-extension dependencies ────────
    // Each pair explicitly forbids cross-references between different extensions.
    // Same-extension internal imports are allowed.
    {
      name: 'no-cross-extension-deps-cut',
      comment: 'neko-cut extension must not depend on other extension packages',
      severity: 'warn',
      from: { path: '^packages/neko-cut/packages/extension/' },
      to: {
        path: '^packages/(?!neko-cut/)[^/]+/packages/extension/',
      },
    },
    {
      name: 'no-cross-extension-deps-agent',
      comment: 'neko-agent extension must not depend on other extension packages',
      severity: 'warn',
      from: { path: '^packages/neko-agent/packages/extension/' },
      to: {
        path: '^packages/(?!neko-agent/)[^/]+/packages/extension/',
      },
    },
    {
      name: 'no-cross-extension-deps-canvas',
      comment: 'neko-canvas extension must not depend on other extension packages',
      severity: 'warn',
      from: { path: '^packages/neko-canvas/packages/extension/' },
      to: {
        path: '^packages/(?!neko-canvas/)[^/]+/packages/extension/',
      },
    },
    {
      name: 'no-cross-extension-deps-preview',
      comment: 'neko-preview extension must not depend on other extension packages',
      severity: 'warn',
      from: { path: '^packages/neko-preview/' },
      to: {
        path: '^packages/(?!neko-preview/)[^/]+/packages/extension/',
      },
    },

    // ── Rule 6: Character domain ownership ────────────
    {
      name: 'chara-no-agent-runtime-implementation',
      comment:
        'neko-chara may consume Agent contracts, but must not depend on Agent runtime, platform, Extension, Webview, or provider implementations',
      severity: 'error',
      from: { path: '^packages/neko-chara/' },
      to: {
        path: '^packages/neko-agent/packages/(?!agent-types/)',
      },
    },
    {
      name: 'agent-runtime-no-chara-domain',
      comment:
        'Generic Agent runtime packages remain domain-neutral; only the host composition package may depend on neko-chara',
      severity: 'error',
      from: {
        path: '^packages/neko-agent/packages/(agent|ai-sdk|platform|webview|agent-types)/',
      },
      to: {
        path: '^packages/neko-chara/',
      },
    },
    {
      name: 'quality-domain-only-shared-contracts',
      comment:
        'neko-quality is host-neutral and may depend only on Layer 0 shared contracts',
      severity: 'error',
      from: { path: '^packages/neko-quality/' },
      to: {
        path: '^packages/',
        pathNot: ['^packages/neko-quality/', '^packages/neko-types/'],
      },
    },
    {
      name: 'agent-runtime-no-quality-domain',
      comment:
        'Generic Agent runtime packages remain Quality-neutral; only host composition may depend on neko-quality',
      severity: 'error',
      from: {
        path: '^packages/neko-agent/packages/(agent|ai-sdk|platform|webview|agent-types)/',
      },
      to: {
        path: '^packages/neko-quality/',
      },
    },
  ],

  options: {
    doNotFollow: {
      path: ['node_modules', 'dist', 'out', 'coverage', '\\.turbo'],
    },
    exclude: {
      path: [
        // Test files
        '\\.(test|spec)\\.(ts|tsx)$',
        '__mocks__',
        '__tests__',
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
    progress: { type: 'performance-log' },
  },
};
