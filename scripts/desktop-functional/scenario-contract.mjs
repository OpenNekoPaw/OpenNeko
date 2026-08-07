import { posix, win32 } from 'node:path';

const FIXTURE_PREFIX = 'openneko-desktop-functional-';

export function validateDesktopFunctionalScenario(value) {
  if (!isRecord(value)) throw new Error('Desktop functional scenario must be an object.');
  requireIdentity(value.id, 'id');
  requirePackageOwner(value.owner);
  if (typeof value.prepare !== 'function') {
    throw new Error(`Desktop functional scenario '${value.id}' requires prepare().`);
  }
  if (typeof value.run !== 'function') {
    throw new Error(`Desktop functional scenario '${value.id}' requires run().`);
  }
  if (value.assertObservation !== undefined && typeof value.assertObservation !== 'function') {
    throw new Error(
      `Desktop functional scenario '${value.id}' assertObservation must be a function.`,
    );
  }
  return value;
}

export function validatePreparedDesktopFixture(value, fixtureHome) {
  if (!isRecord(value) || typeof value.workspacePath !== 'string') {
    throw new Error('Desktop functional scenario prepare() must return workspacePath.');
  }
  const normalizedHome = normalizePath(fixtureHome);
  const normalizedWorkspace = normalizePath(value.workspacePath);
  if (!normalizedWorkspace.startsWith(`${normalizedHome}/`)) {
    throw new Error('Desktop functional workspace must remain inside its fixture home.');
  }
  return value;
}

export function validateDesktopFunctionalStoragePaths(value) {
  if (!isRecord(value)) throw new Error('Desktop functional storage paths are required.');
  const paths = value.platform === 'win32' ? win32 : posix;
  const fixtureHome = requireAbsolutePath(paths, value.fixtureHome, 'fixture home');
  if (!paths.basename(fixtureHome).startsWith(FIXTURE_PREFIX)) {
    throw new Error('Desktop functional fixture home has an unsafe directory name.');
  }
  requireContainedPath(paths, fixtureHome, value.userDataRoot, 'Electron userData');
  if (value.workspacePath !== undefined) {
    requireContainedPath(paths, fixtureHome, value.workspacePath, 'Workspace');
  }
  return value;
}

function requireIdentity(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/u.test(value)) {
    throw new Error(`Desktop functional scenario ${label} is invalid.`);
  }
}

function requirePackageOwner(value) {
  if (typeof value !== 'string' || !/^@neko\/[a-z0-9][a-z0-9._-]*$/u.test(value)) {
    throw new Error('Desktop functional scenario owner is invalid.');
  }
}

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/\/$/u, '');
}

function requireAbsolutePath(paths, value, label) {
  if (typeof value !== 'string' || !paths.isAbsolute(value)) {
    throw new Error(`Desktop functional ${label} must be an absolute path.`);
  }
  return paths.resolve(value);
}

function requireContainedPath(paths, parent, value, label) {
  const target = requireAbsolutePath(paths, value, label);
  const relative = paths.relative(parent, target);
  if (relative.length === 0 || relative.startsWith('..') || paths.isAbsolute(relative)) {
    throw new Error(`Desktop functional ${label} must remain inside its fixture home.`);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}
