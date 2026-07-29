import * as path from 'node:path';
import { verifyMediaRuntimeDirectory, type VerifiedMediaRuntime } from '@neko/media/node';
import { installVerifiedMediaRuntimePaths, resolveMediaRuntimeTarget } from './media-host-contract';

export async function configureOpenNekoMediaRuntime(
  extensionRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<VerifiedMediaRuntime> {
  const target = resolveMediaRuntimeTarget();
  const verified = await verifyMediaRuntimeDirectory(
    path.join(extensionRoot, 'dist', 'media-runtime', target),
    target,
  );
  installVerifiedMediaRuntimePaths(environment, verified.executables);
  return verified;
}
