/**
 * Terminal Capability Detection
 *
 * Detects terminal features and respects environment variables for accessibility.
 * The result is host data consumed by presentation adapters; Markdown does not infer
 * capabilities from source content.
 */
export interface TerminalCapabilities {
  readonly supportsColor: boolean;
  readonly supportsUnicode: boolean;
  readonly supportsExtendedColor: boolean;
  readonly supportsHyperlinks: boolean;
  readonly isCI: boolean;
  readonly columns: number;
  readonly rows: number;
}

export interface TerminalCapabilityInput {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly isTTY?: boolean;
  readonly columns?: number;
  readonly rows?: number;
}

export function detectCapabilities(input: TerminalCapabilityInput = {}): TerminalCapabilities {
  const env = input.env ?? process.env;
  const isTTY = input.isTTY ?? process.stdout.isTTY === true;
  const noColor = env['NO_COLOR'] !== undefined;
  const forceColor = env['FORCE_COLOR'] !== undefined && env['FORCE_COLOR'] !== '0';
  const term = env['TERM'] ?? '';

  // NO_COLOR has higher priority than FORCE_COLOR by contract.
  const supportsColor = !noColor && (forceColor || (term !== 'dumb' && isTTY));
  const supportsUnicode = !term.startsWith('linux') && term !== 'dumb';
  const supportsExtendedColor =
    supportsColor &&
    (term.includes('256color') ||
      term.includes('truecolor') ||
      env['COLORTERM'] === 'truecolor' ||
      env['COLORTERM'] === '24bit');
  const isCI =
    env['CI'] !== undefined ||
    env['GITHUB_ACTIONS'] !== undefined ||
    env['JENKINS_URL'] !== undefined ||
    env['TRAVIS'] !== undefined;

  return {
    supportsColor,
    supportsUnicode,
    supportsExtendedColor,
    supportsHyperlinks: detectHyperlinks(env, term, isTTY),
    isCI,
    columns: input.columns ?? process.stdout.columns ?? 80,
    rows: input.rows ?? process.stdout.rows ?? 24,
  };
}

export function getFallbackChars(capabilities: TerminalCapabilities) {
  if (capabilities.supportsUnicode) {
    return {
      spinner: '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'.split(''),
      check: '✓',
      cross: '✗',
      bullet: '•',
      bar: '█',
      barEmpty: '░',
      thinking: '💭',
      border: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
    } as const;
  }

  return {
    spinner: ['-', '\\', '|', '/'],
    check: '+',
    cross: 'x',
    bullet: '*',
    bar: '#',
    barEmpty: '-',
    thinking: '[T]',
    border: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
  } as const;
}

function detectHyperlinks(
  env: Readonly<Record<string, string | undefined>>,
  term: string,
  isTTY: boolean,
): boolean {
  if (!isTTY || term === 'dumb') return false;
  if (env['WT_SESSION'] !== undefined) return true;
  if (env['TERM_PROGRAM'] === 'iTerm.app' || env['TERM_PROGRAM'] === 'WezTerm') return true;
  if (env['VTE_VERSION'] !== undefined) {
    const version = Number.parseInt(env['VTE_VERSION'] ?? '', 10);
    return Number.isFinite(version) && version >= 5000;
  }
  return false;
}
