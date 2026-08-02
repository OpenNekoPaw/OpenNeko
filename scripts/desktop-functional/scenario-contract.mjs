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

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}
