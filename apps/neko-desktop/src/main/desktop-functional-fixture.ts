import * as path from 'node:path';

const FUNCTIONAL_FIXTURE_ARGUMENT = '--openneko-functional-fixture';
const FUNCTIONAL_FIXTURE_ENVIRONMENT = 'OPENNEKO_DESKTOP_FUNCTIONAL_HOME';
const FUNCTIONAL_WORKSPACE_ENVIRONMENT = 'OPENNEKO_DESKTOP_FUNCTIONAL_WORKSPACE';
const FUNCTIONAL_FIXTURE_PREFIX = 'openneko-desktop-functional-';

export function resolveDesktopRuntimeHome(input: {
  readonly systemHome: string;
  readonly argv: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
}): string {
  const fixtureHome = input.environment[FUNCTIONAL_FIXTURE_ENVIRONMENT];
  if (fixtureHome === undefined) return input.systemHome;
  if (!input.argv.includes(FUNCTIONAL_FIXTURE_ARGUMENT)) {
    throw new Error('Desktop functional fixture home requires the explicit fixture argument.');
  }
  if (!path.isAbsolute(fixtureHome)) {
    throw new Error('Desktop functional fixture home must be an absolute path.');
  }
  const resolved = path.resolve(fixtureHome);
  if (!path.basename(resolved).startsWith(FUNCTIONAL_FIXTURE_PREFIX)) {
    throw new Error('Desktop functional fixture home has an unsafe directory name.');
  }
  return resolved;
}

export function resolveDesktopFunctionalWorkspace(input: {
  readonly argv: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly fixtureHome: string;
}): string | undefined {
  const workspace = input.environment[FUNCTIONAL_WORKSPACE_ENVIRONMENT];
  if (workspace === undefined) return undefined;
  if (!input.argv.includes(FUNCTIONAL_FIXTURE_ARGUMENT)) {
    throw new Error('Desktop functional workspace requires the explicit fixture argument.');
  }
  if (!path.isAbsolute(workspace)) {
    throw new Error('Desktop functional workspace must be an absolute path.');
  }
  const fixtureHome = path.resolve(input.fixtureHome);
  const resolved = path.resolve(workspace);
  const relative = path.relative(fixtureHome, resolved);
  if (relative.length === 0 || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Desktop functional workspace must be contained by the fixture home.');
  }
  return resolved;
}
