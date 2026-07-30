import * as fs from 'node:fs/promises';

export async function copyDesktopGlobalMediaLibraryDirectory(
  sourceDirectory: string,
  destinationDirectory: string,
): Promise<void> {
  const sourceStat = await fs.lstat(sourceDirectory);
  if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) {
    throw new Error('Desktop global media-library source must be a physical directory.');
  }
  await fs.cp(sourceDirectory, destinationDirectory, {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter: async (sourcePath) => {
      if ((await fs.lstat(sourcePath)).isSymbolicLink()) {
        throw new Error('Desktop global media-library import refuses symbolic links.');
      }
      return true;
    },
  });
}
