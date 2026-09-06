import type { DshAcpImageAttachmentReadProjection } from '@neko/agent-contracts/dsh-acp';
import {
  isWorkspaceFileContentLocator,
  type AuthorizedWorkspaceWriter,
  type ContentReadService,
} from '@neko/content-domain';
import type { DshCanvasArtifactDeliveryInput } from './dsh-canvas-artifact-delivery';

/** Materialize the exact session attachment, never a second rendering of its source pages. */
export async function materializeDshCanvasImageOverviews(
  input: DshCanvasArtifactDeliveryInput,
  ports: {
    readonly readAttachment: (
      sessionId: string,
      attachmentId: string,
    ) => Promise<DshAcpImageAttachmentReadProjection>;
    readonly contentRead: ContentReadService;
    readonly writer: AuthorizedWorkspaceWriter;
  },
): Promise<void> {
  for (const artifact of input.artifacts) {
    const expected = artifact.overviewAttachment;
    if (!expected) continue;
    const locator = artifact.contentLocator;
    if (!isWorkspaceFileContentLocator(locator) || locator.selector !== undefined) {
      throw new Error('Image overview requires a Workspace file target.');
    }
    const stored = await ports.readAttachment(input.dshSessionId, expected.attachmentId);
    if (
      stored.attachment.attachmentId !== expected.attachmentId ||
      stored.attachment.mediaType !== expected.mediaType ||
      stored.attachment.bytes !== expected.bytes ||
      stored.attachment.width !== expected.width ||
      stored.attachment.height !== expected.height
    ) {
      throw new Error('Image overview attachment does not match its completed Tool result.');
    }
    const bytes = Buffer.from(stored.data, 'base64');
    if (bytes.byteLength !== expected.bytes)
      throw new Error('Image overview attachment byte length does not match.');
    const existing = await ports.contentRead.read(locator, { maxBytes: expected.bytes });
    if (existing.status === 'ready') {
      if (!bytes.equals(existing.bytes))
        throw new Error('Image overview Workspace file has conflicting content.');
      continue;
    }
    if (existing.diagnostic.code !== 'content-missing') {
      throw new Error(
        `Image overview Workspace target is unavailable: ${existing.diagnostic.code}.`,
      );
    }
    const written = await ports.writer.write(locator, bytes, {
      conflict: 'fail-if-exists',
      maxBytes: expected.bytes,
    });
    if (written.status !== 'written') {
      throw new Error(`Image overview Workspace write failed: ${written.diagnostic.code}.`);
    }
  }
}
