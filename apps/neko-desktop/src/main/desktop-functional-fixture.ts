import * as path from 'node:path';

const FUNCTIONAL_FIXTURE_ARGUMENT = '--openneko-functional-fixture';
const FUNCTIONAL_FIXTURE_ENVIRONMENT = 'OPENNEKO_DESKTOP_FUNCTIONAL_HOME';
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
