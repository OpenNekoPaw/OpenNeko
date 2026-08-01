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

    // ── Rule 3: Webview packages must not import host modules ─────────
    {
      name: 'webview-no-host-modules',
      comment: 'Webview packages run in the renderer sandbox and cannot access host modules',
      severity: 'error',
      from: {
        path: '^packages/(?:neko-(?:agent|canvas|cut|preview|tools)-webview|neko-assets)/',
      },
      to: {
        path: '^(?:electron|vscode)$',
      },
    },

    // ── Rule 4: Character and Quality domain ownership ────────────
    {
      name: 'chara-no-agent-runtime-implementation',
      comment:
        'neko-chara may consume Agent contracts, but must not depend on Agent runtime, platform, Webview, or provider implementations',
      severity: 'error',
      from: { path: '^packages/neko-chara/' },
      to: {
        path: '^packages/neko-(?:agent-runtime|ai-sdk|platform|agent-webview)/',
      },
    },
    {
      name: 'agent-runtime-no-chara-domain',
      comment:
        'Generic Agent runtime packages remain domain-neutral; only the host composition package may depend on neko-chara',
      severity: 'error',
      from: {
        path: '^packages/neko-(?:agent-runtime|ai-sdk|platform|agent-webview|agent-types)/',
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
        path: '^packages/neko-(?:agent-runtime|ai-sdk|platform|agent-webview|agent-types)/',
      },
      to: {
        path: '^packages/neko-quality/',
      },
    },
  ],

  options: {
    doNotFollow: {
      path: ['node_modules', 'dist', 'out', 'coverage'],
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
