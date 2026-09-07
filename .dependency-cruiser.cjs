const packageRoleCatalog = require('./quality/package-roles.json');

function rolePathPattern(role, predicate = () => true) {
  const paths = packageRoleCatalog.packages
    .filter((entry) => entry.roles.includes(role) && predicate(entry))
    .map((entry) => entry.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return `^(?:${paths.join('|')})/src/`;
}

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
      comment: '@neko/shared is the zero-workspace-dependency L0 foundation',
      severity: 'error',
      from: {
        path: '^packages/shared/',
      },
      to: {
        path: '^packages/',
        pathNot: '^packages/shared/',
      },
    },

    // ── Rule 3: Webview packages must not import host modules ─────────
    {
      name: 'webview-no-host-modules',
      comment: 'Webview packages run in the renderer sandbox and cannot access host modules',
      severity: 'error',
      from: {
        path: rolePathPattern('webview'),
      },
      to: {
        path: '^electron$',
      },
    },

    {
      name: 'domain-no-webview-runtime',
      comment: 'Host-neutral domain packages must not depend on Webview implementations',
      severity: 'error',
      from: { path: rolePathPattern('domain') },
      to: { path: rolePathPattern('webview') },
    },
    {
      name: 'contracts-no-runtime-implementation',
      comment: 'Pure contract packages must not depend on runtime implementations',
      severity: 'error',
      from: {
        path: rolePathPattern(
          'contracts',
          (entry) =>
            !entry.roles.some((role) =>
              ['domain', 'application', 'runtime', 'node', 'webview'].includes(role),
            ),
        ),
      },
      to: { path: rolePathPattern('runtime') },
    },

    // ── Rule 4: Character and Agent domain ownership ────────────
    {
      name: 'chara-no-agent-runtime-implementation',
      comment:
        'Character packages may consume Agent contracts, but must not depend on Agent runtime, Webview, or provider implementations',
      severity: 'error',
      from: { path: '^packages/chara/' },
      to: {
        path: '^packages/(?:agent/(?:runtime|webview)|ai/sdk)/',
      },
    },
    {
      name: 'agent-runtime-no-chara-domain',
      comment: 'Generic Agent provider/runtime packages remain independent from Chara behavior',
      severity: 'error',
      from: {
        path: '^packages/(?:agent/runtime|ai/sdk)/',
      },
      to: {
        path: '^packages/chara/',
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
  },
};
