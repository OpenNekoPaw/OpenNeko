import * as path from 'node:path';
import { assertDesktopAgentAutomationLaunch } from '../shared/agent-automation-contract';

const FUNCTIONAL_FIXTURE_ARGUMENT = '--openneko-functional-fixture';
const FUNCTIONAL_HIDDEN_ARGUMENT = '--openneko-functional-hidden';
const FUNCTIONAL_FIXTURE_ENVIRONMENT = 'OPENNEKO_DESKTOP_FUNCTIONAL_HOME';
const FUNCTIONAL_WORKSPACE_ENVIRONMENT = 'OPENNEKO_DESKTOP_FUNCTIONAL_WORKSPACE';
const FUNCTIONAL_CUT_EXPORT_ENVIRONMENT = 'OPENNEKO_DESKTOP_FUNCTIONAL_CUT_EXPORT';
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

export function resolveDesktopFunctionalWindowMode(argv: readonly string[]): 'visible' | 'hidden' {
  if (!argv.includes(FUNCTIONAL_HIDDEN_ARGUMENT)) return 'visible';
  if (!argv.includes(FUNCTIONAL_FIXTURE_ARGUMENT)) {
    throw new Error('Desktop functional hidden mode requires the explicit fixture argument.');
  }
  return 'hidden';
}

export function resolveDesktopFunctionalCutExport(input: {
  readonly argv: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly workspace: string | undefined;
}): string | undefined {
  const target = input.environment[FUNCTIONAL_CUT_EXPORT_ENVIRONMENT];
  if (target === undefined) return undefined;
  if (!input.argv.includes(FUNCTIONAL_FIXTURE_ARGUMENT) || !input.workspace) {
    throw new Error('Desktop functional Cut export requires an explicit fixture Workspace.');
  }
  if (!path.isAbsolute(target)) {
    throw new Error('Desktop functional Cut export must be an absolute path.');
  }
  const workspace = path.resolve(input.workspace);
  const resolved = path.resolve(target);
  const relative = path.relative(workspace, resolved);
  if (
    relative.length === 0 ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !/\.(?:mp4|mov)$/iu.test(relative)
  ) {
    throw new Error('Desktop functional Cut export must be a contained MP4 or MOV file.');
  }
  return relative.split(path.sep).join('/');
}

export function resolveDesktopAgentAutomationLaunch(input: {
  readonly argv: readonly string[];
  readonly fixtureHome: string;
  readonly userDataRoot: string;
  readonly workspace: string | undefined;
}): boolean {
  if (!input.argv.includes(FUNCTIONAL_FIXTURE_ARGUMENT)) return false;
  if (!input.workspace) {
    throw new Error('Desktop Agent automation requires an isolated fixture Workspace.');
  }
  const fixtureHome = path.resolve(input.fixtureHome);
  const userDataRoot = path.resolve(input.userDataRoot);
  const relativeUserData = path.relative(fixtureHome, userDataRoot);
  const isolatedUserData = !(
    relativeUserData.length === 0 ||
    relativeUserData.startsWith('..') ||
    path.isAbsolute(relativeUserData)
  );
  if (!isolatedUserData) {
    throw new Error('Desktop Agent automation requires isolated Electron userData.');
  }
  assertDesktopAgentAutomationLaunch({ fixtureLaunch: true, isolatedUserData });
  return true;
}
