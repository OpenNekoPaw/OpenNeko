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
        'Foundation packages (@neko/shared, @neko/host, @neko/neko-client, @neko/proto) must not depend on other workspace packages',
      severity: 'error',
      from: {
        path: [
          '^packages/neko-types/',
          '^packages/neko-host/',
          '^packages/neko-client/',
          '^packages/neko-proto/',
          '^packages/neko-market/packages/core/',
          '^packages/neko-auth/packages/core/',
        ],
      },
      to: {
        path: '^packages/',
        pathNot: [
          // Allow self-references and Layer 0 peers
          '^packages/neko-types/',
          '^packages/neko-host/',
          '^packages/neko-client/',
          '^packages/neko-proto/',
          '^packages/neko-market/packages/core/',
          '^packages/neko-auth/packages/core/',
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
      name: 'no-cross-extension-deps-story',
      comment: 'neko-story extension must not depend on other extension packages',
      severity: 'warn',
      from: { path: '^packages/neko-story/packages/extension/' },
      to: {
        path: '^packages/(?!neko-story/)[^/]+/packages/extension/',
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
    {
      name: 'no-cross-extension-deps-market',
      comment: 'neko-market must not depend on other extension packages',
      severity: 'warn',
      from: { path: '^packages/neko-market/' },
      to: {
        path: '^packages/(?!neko-market/)[^/]+/packages/extension/',
      },
    },
    {
      name: 'marketplace-webview-no-vscode',
      comment: 'neko-market webview must not import vscode',
      severity: 'error',
      from: { path: '^packages/neko-market/packages/webview/' },
      to: { path: '^vscode$' },
    },
    {
      name: 'marketplace-extension-no-react',
      comment: 'neko-market extension must not import React',
      severity: 'error',
      from: { path: '^packages/neko-market/packages/extension/' },
      to: { path: '^react(-dom)?$' },
    },
  ],

  options: {
    doNotFollow: {
      path: ['node_modules', 'dist', 'out', 'coverage', '\\.turbo'],
    },
    exclude: {
      path: [
        // Rust packages (not TS)
        'packages/neko-engine/packages/engine-',
        'packages/neko-engine/packages/host-napi',
        'packages/neko-engine/packages/host-cli',
        'packages/neko-engine/packages/runtime-',
        // Planned/empty packages
        'packages/neko-model',
        'packages/neko-audio',
        'packages/neko-live',
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
