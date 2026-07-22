'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  assertMacOSRuntimeClosure,
  materializeLinuxFfmpegClosure,
  materializeMacOSRuntimeClosure,
} = require('./bundle-ffmpeg');

test('validates feature-relative macOS load paths and existing payload files', () => {
  const files = ['/payload/engine.node', '/payload/libcodec.1.dylib'];
  assert.deepEqual(
    assertMacOSRuntimeClosure(files, {
      readInstallName: (filePath) => `@loader_path/${path.basename(filePath)}`,
      readDependencies: (filePath) =>
        filePath.endsWith('engine.node')
          ? ['@loader_path/libcodec.1.dylib', '/usr/lib/libSystem.B.dylib']
          : [],
      exists: () => true,
    }),
    { fileCount: 2 },
  );
  assert.throws(
    () =>
      assertMacOSRuntimeClosure(files, {
        readInstallName: (filePath) => `@loader_path/${path.basename(filePath)}`,
        readDependencies: () => ['/opt/homebrew/opt/codec/lib/libcodec.1.dylib'],
      }),
    /macOS runtime dependency is not feature-relative/u,
  );
  assert.throws(
    () =>
      assertMacOSRuntimeClosure(files, {
        readInstallName: (filePath) => `@loader_path/${path.basename(filePath)}`,
        readDependencies: () => ['@loader_path/missing.dylib'],
        exists: () => false,
      }),
    /macOS runtime dependency is missing from the payload/u,
  );
});

test('recursively materializes and rewrites the macOS non-system runtime closure', () => {
  const destinationDir = '/payload';
  const nativeFile = '/payload/neko-engine.darwin-arm64.node';
  const seedLibrary = '/brew/lib/libavcodec.62.dylib';
  const transitiveLibrary = '/brew/opt/codec/lib/libcodec.1.dylib';
  const dependencies = new Map([
    [nativeFile, ['/System/Library/Frameworks/Metal.framework/Versions/A/Metal', seedLibrary]],
    ['/payload/libavcodec.62.dylib', ['/usr/lib/libSystem.B.dylib', transitiveLibrary]],
    ['/payload/libcodec.1.dylib', ['/brew/Cellar/ffmpeg/lib/libavcodec.62.dylib']],
  ]);
  const canonicalPaths = new Map([
    [seedLibrary, '/brew/Cellar/ffmpeg/lib/libavcodec.62.dylib'],
    ['/brew/Cellar/ffmpeg/lib/libavcodec.62.dylib', '/brew/Cellar/ffmpeg/lib/libavcodec.62.dylib'],
    [transitiveLibrary, '/brew/Cellar/codec/lib/libcodec.1.dylib'],
  ]);
  const copied = [];
  const rewritten = [];
  const installNames = [];
  const signed = [];

  const runtimeFiles = materializeMacOSRuntimeClosure({
    destinationDir,
    rootConsumers: [nativeFile],
    seedLibraries: [seedLibrary],
    readDependencies: (filePath) => dependencies.get(filePath) ?? [],
    exists: () => true,
    realpath: (filePath) => canonicalPaths.get(filePath) ?? filePath,
    copyFile: (source, destination) => copied.push([source, destination]),
    rewriteDependency: (consumer, dependency, replacement) =>
      rewritten.push([consumer, dependency, replacement]),
    setInstallName: (filePath, installName) => installNames.push([filePath, installName]),
    signFile: (filePath) => signed.push(filePath),
  });

  assert.deepEqual(runtimeFiles, ['libavcodec.62.dylib', 'libcodec.1.dylib']);
  assert.deepEqual(copied, [
    ['/brew/Cellar/ffmpeg/lib/libavcodec.62.dylib', '/payload/libavcodec.62.dylib'],
    ['/brew/Cellar/codec/lib/libcodec.1.dylib', '/payload/libcodec.1.dylib'],
  ]);
  assert.deepEqual(rewritten, [
    [nativeFile, seedLibrary, '@loader_path/libavcodec.62.dylib'],
    ['/payload/libavcodec.62.dylib', transitiveLibrary, '@loader_path/libcodec.1.dylib'],
    [
      '/payload/libcodec.1.dylib',
      '/brew/Cellar/ffmpeg/lib/libavcodec.62.dylib',
      '@loader_path/libavcodec.62.dylib',
    ],
  ]);
  assert.deepEqual(installNames, [
    [nativeFile, '@loader_path/neko-engine.darwin-arm64.node'],
    ['/payload/libavcodec.62.dylib', '@loader_path/libavcodec.62.dylib'],
    ['/payload/libcodec.1.dylib', '@loader_path/libcodec.1.dylib'],
  ]);
  assert.deepEqual(signed, [
    '/payload/libavcodec.62.dylib',
    '/payload/libcodec.1.dylib',
    nativeFile,
  ]);
});

test('rejects a missing macOS runtime dependency', () => {
  assert.throws(
    () =>
      materializeMacOSRuntimeClosure({
        destinationDir: '/payload',
        rootConsumers: ['/payload/neko-engine.darwin-arm64.node'],
        seedLibraries: ['/brew/lib/libavcodec.62.dylib'],
        readDependencies: () => [],
        exists: () => false,
      }),
    /macOS runtime dependency does not exist.*libavcodec\.62\.dylib/u,
  );
});

test('reuses a canonical seed for a previously patched loader_path dependency', () => {
  const copied = [];
  assert.deepEqual(
    materializeMacOSRuntimeClosure({
      destinationDir: '/payload',
      rootConsumers: ['/payload/engine.node'],
      seedLibraries: ['/brew/lib/libcodec.1.dylib'],
      readDependencies: (filePath) =>
        filePath.endsWith('engine.node') ? ['@loader_path/libcodec.1.dylib'] : [],
      exists: () => true,
      realpath: (filePath) =>
        filePath.startsWith('/brew/') ? '/brew/Cellar/libcodec.1.dylib' : filePath,
      copyFile: (source, destination) => copied.push([source, destination]),
      rewriteDependency: () => {},
      setInstallName: () => {},
      signFile: () => {},
    }),
    ['libcodec.1.dylib'],
  );
  assert.deepEqual(copied, [['/brew/Cellar/libcodec.1.dylib', '/payload/libcodec.1.dylib']]);
});

test('rejects different macOS runtime libraries with the same basename', () => {
  assert.throws(
    () =>
      materializeMacOSRuntimeClosure({
        destinationDir: '/payload',
        rootConsumers: ['/payload/neko-engine.darwin-arm64.node'],
        seedLibraries: ['/brew/a/libcodec.1.dylib'],
        readDependencies: (filePath) =>
          filePath.endsWith('.node') ? ['/brew/b/libcodec.1.dylib'] : [],
        exists: () => true,
        realpath: (filePath) => filePath,
        copyFile: () => {},
        rewriteDependency: () => {},
        setInstallName: () => {},
        signFile: () => {},
      }),
    /macOS runtime basename collision.*libcodec\.1\.dylib/u,
  );
});

test('materializes only the Linux FFmpeg SONAME file from an alias chain', (t) => {
  const { destinationDir, sourceDir } = createFixture(t);
  createAliasChain(sourceDir, 'avcodec', '62', '28.102');
  createAliasChain(sourceDir, 'avformat', '62', '6.100');

  const copied = materializeLinuxFfmpegClosure(sourceDir, destinationDir, ['avcodec', 'avformat'], {
    readSoname: (filePath) => path.basename(filePath).replace(/\.\d+\.\d+$/u, ''),
    readNeeded: () => [],
  });

  assert.deepEqual(copied, ['libavcodec.so.62', 'libavformat.so.62']);
  assert.deepEqual(fs.readdirSync(destinationDir), ['libavcodec.so.62', 'libavformat.so.62']);
  assert.equal(fs.lstatSync(path.join(destinationDir, 'libavcodec.so.62')).isFile(), true);
  assert.equal(
    fs.readFileSync(path.join(destinationDir, 'libavcodec.so.62'), 'utf8'),
    'libavcodec',
  );
});

test('rejects a Linux FFmpeg library without one major-version alias', (t) => {
  const { destinationDir, sourceDir } = createFixture(t);
  fs.writeFileSync(path.join(sourceDir, 'libavcodec.so.62.28.102'), 'libavcodec');
  fs.symlinkSync('libavcodec.so.62.28.102', path.join(sourceDir, 'libavcodec.so'));

  assert.throws(
    () =>
      materializeLinuxFfmpegClosure(sourceDir, destinationDir, ['avcodec'], {
        readSoname: () => 'libavcodec.so.62',
        readNeeded: () => [],
      }),
    /FFmpeg library avcodec.*exactly one major-version alias.*received <none>/u,
  );
});

test('rejects ambiguous Linux FFmpeg major-version aliases', (t) => {
  const { destinationDir, sourceDir } = createFixture(t);
  createAliasChain(sourceDir, 'avcodec', '61', '9.100');
  fs.symlinkSync('libavcodec.so.61.9.100', path.join(sourceDir, 'libavcodec.so.62'));

  assert.throws(
    () =>
      materializeLinuxFfmpegClosure(sourceDir, destinationDir, ['avcodec'], {
        readSoname: () => 'libavcodec.so.61',
        readNeeded: () => [],
      }),
    /FFmpeg library avcodec.*libavcodec\.so\.61, libavcodec\.so\.62/u,
  );
});

test('rejects a Linux FFmpeg alias that disagrees with the ELF SONAME', (t) => {
  const { destinationDir, sourceDir } = createFixture(t);
  createAliasChain(sourceDir, 'avcodec', '62', '28.102');

  assert.throws(
    () =>
      materializeLinuxFfmpegClosure(sourceDir, destinationDir, ['avcodec'], {
        readSoname: () => 'libavcodec.so.61',
        readNeeded: () => [],
      }),
    /libavcodec\.so\.62.*ELF SONAME libavcodec\.so\.61/u,
  );
});

test('rejects a native consumer linked against an absent FFmpeg major version', (t) => {
  const { destinationDir, sourceDir } = createFixture(t);
  const nativeFile = path.join(destinationDir, 'neko-engine.linux-x64-gnu.node');
  createAliasChain(sourceDir, 'avcodec', '62', '28.102');
  fs.writeFileSync(nativeFile, 'native');

  assert.throws(
    () =>
      materializeLinuxFfmpegClosure(sourceDir, destinationDir, ['avcodec'], {
        rootConsumers: [nativeFile],
        readSoname: () => 'libavcodec.so.62',
        readNeeded: (filePath) => (filePath === nativeFile ? ['libavcodec.so.60'] : []),
      }),
    /neko-engine\.linux-x64-gnu\.node requires missing FFmpeg runtime libavcodec\.so\.60/u,
  );
});

test('rejects an archive FFmpeg dependency omitted from the configured closure', (t) => {
  const { destinationDir, sourceDir } = createFixture(t);
  const nativeFile = path.join(destinationDir, 'neko-engine.linux-x64-gnu.node');
  createAliasChain(sourceDir, 'avcodec', '62', '28.102');
  createAliasChain(sourceDir, 'avdevice', '62', '3.102');
  fs.writeFileSync(nativeFile, 'native');

  assert.throws(
    () =>
      materializeLinuxFfmpegClosure(sourceDir, destinationDir, ['avcodec'], {
        rootConsumers: [nativeFile],
        readSoname: () => 'libavcodec.so.62',
        readNeeded: (filePath) => (filePath === nativeFile ? ['libavdevice.so.62'] : []),
      }),
    /neko-engine\.linux-x64-gnu\.node requires missing FFmpeg runtime libavdevice\.so\.62/u,
  );
});

test('rejects a bundled FFmpeg library with an absent transitive FFmpeg dependency', (t) => {
  const { destinationDir, sourceDir } = createFixture(t);
  createAliasChain(sourceDir, 'avcodec', '62', '28.102');
  createAliasChain(sourceDir, 'avutil', '60', '26.102');

  assert.throws(
    () =>
      materializeLinuxFfmpegClosure(sourceDir, destinationDir, ['avcodec', 'avutil'], {
        readSoname: (filePath) => path.basename(filePath).replace(/\.\d+\.\d+$/u, ''),
        readNeeded: (filePath) =>
          path.basename(filePath) === 'libavcodec.so.62' ? ['libavutil.so.59'] : [],
      }),
    /libavcodec\.so\.62 requires missing FFmpeg runtime libavutil\.so\.59/u,
  );
});

function createAliasChain(sourceDir, library, major, fullVersion) {
  const fullName = `lib${library}.so.${major}.${fullVersion}`;
  const majorName = `lib${library}.so.${major}`;
  fs.writeFileSync(path.join(sourceDir, fullName), `lib${library}`);
  fs.symlinkSync(fullName, path.join(sourceDir, majorName));
  fs.symlinkSync(majorName, path.join(sourceDir, `lib${library}.so`));
}

function createFixture(t) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-closure-test-'));
  const sourceDir = path.join(fixtureRoot, 'source');
  const destinationDir = path.join(fixtureRoot, 'destination');
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(destinationDir);
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  return { destinationDir, sourceDir };
}
