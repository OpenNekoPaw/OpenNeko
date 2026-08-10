export function parseAutomationRuntimeCargoLock(source, label) {
  const packages = [];
  for (const block of source.split('[[package]]').slice(1)) {
    const name = readString(block, 'name');
    const release = readString(block, 'version');
    if (!name || !release) throw new Error(`${label} Cargo lock is malformed.`);
    const packageSource = readString(block, 'source');
    const checksum = readString(block, 'checksum');
    if ((packageSource === undefined) !== (checksum === undefined)) {
      throw new Error(`${label} Cargo lock package source/checksum is incomplete.`);
    }
    packages.push(Object.freeze({ name, release, source: packageSource, checksum }));
  }
  const identities = new Set(packages.map(({ name, release }) => `${name}@${release}`));
  if (identities.size !== packages.length) {
    throw new Error(`${label} Cargo lock contains duplicate package identities.`);
  }
  return Object.freeze(packages);
}

export function indexAutomationRuntimeCargoLock(packages, label) {
  const index = new Map();
  for (const entry of packages) {
    const identity = `${entry.name}@${entry.release}`;
    if (index.has(identity)) throw new Error(`${label} Cargo lock contains '${identity}' twice.`);
    index.set(identity, entry);
  }
  return index;
}

function readString(block, field) {
  return new RegExp(`^${field} = "([^"]+)"$`, 'mu').exec(block)?.[1];
}
