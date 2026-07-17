import type { MarkdownNode, NormalizedMarkdownDocument } from '@neko/markdown';
import type { TerminalHyperlink } from './contracts';
import { makeTerminalTextInert, validateWebHyperlink } from './safe-encoding';

export type TerminalResourceTarget =
  | {
      readonly kind: 'web';
      readonly target: string;
      readonly displayTarget: string;
    }
  | {
      readonly kind: 'authorized-local-resource';
      readonly target: string;
      readonly displayTarget: string;
      readonly authorizationId: string;
    }
  | {
      readonly kind: 'unsupported';
      readonly displayTarget: string;
      readonly reason:
        'invalid' | 'unsafe-control' | 'unsupported-scheme' | 'unauthorized-local-resource';
    };

export interface TerminalResourceTargetRequest {
  readonly destination: string;
  readonly usage: 'link' | 'image';
}

export interface TerminalResourceTargetResolver {
  resolve(request: TerminalResourceTargetRequest): TerminalResourceTarget;
}

export const defaultTerminalResourceTargetResolver: TerminalResourceTargetResolver = Object.freeze({
  resolve(request: TerminalResourceTargetRequest): TerminalResourceTarget {
    const inert = makeTerminalTextInert(request.destination);
    if (inert.replacements > 0) {
      return { kind: 'unsupported', displayTarget: inert.text, reason: 'unsafe-control' };
    }
    const web = validateWebHyperlink(request.destination);
    if (web !== undefined) return { kind: 'web', target: web, displayTarget: web };

    let url: URL;
    try {
      url = new URL(request.destination);
    } catch {
      return { kind: 'unsupported', displayTarget: inert.text, reason: 'invalid' };
    }
    return {
      kind: 'unsupported',
      displayTarget: inert.text,
      reason: url.protocol === 'file:' ? 'unauthorized-local-resource' : 'unsupported-scheme',
    };
  },
});

export function toTerminalHyperlink(target: TerminalResourceTarget): TerminalHyperlink | undefined {
  if (target.kind === 'web') return { kind: 'web', target: target.target };
  if (target.kind === 'authorized-local-resource') {
    return {
      kind: 'authorized-local-resource',
      target: target.target,
      authorizationId: target.authorizationId,
    };
  }
  return undefined;
}

export interface TerminalResourceResolutionSnapshot {
  readonly sessionId: NormalizedMarkdownDocument['sessionId'];
  readonly revision: NormalizedMarkdownDocument['revision'];
  readonly nodeCount: number;
  readonly targets: ReadonlyMap<string, TerminalResourceTarget>;
}

export function resolveTerminalResourceTargets(
  document: NormalizedMarkdownDocument,
  resolver: TerminalResourceTargetResolver,
): TerminalResourceResolutionSnapshot {
  const targets = new Map<string, TerminalResourceTarget>();
  let nodeCount = 0;
  visit(document.root);
  return Object.freeze({
    sessionId: document.sessionId,
    revision: document.revision,
    nodeCount,
    targets,
  });

  function visit(node: MarkdownNode): void {
    if (node.type === 'link' || node.type === 'image') {
      const request: TerminalResourceTargetRequest = {
        destination: node.destination,
        usage: node.type,
      };
      targets.set(terminalResourceTargetRequestKey(request), resolver.resolve(request));
      nodeCount += 1;
    }
    if ('children' in node) {
      for (const child of node.children) visit(child);
    }
  }
}

export function createSnapshotTerminalResourceTargetResolver(
  snapshot: TerminalResourceResolutionSnapshot,
): TerminalResourceTargetResolver {
  return Object.freeze({
    resolve(request: TerminalResourceTargetRequest): TerminalResourceTarget {
      const target = snapshot.targets.get(terminalResourceTargetRequestKey(request));
      if (target === undefined) {
        throw new Error(
          `Terminal resource resolution snapshot omitted ${request.usage} target ${request.destination}.`,
        );
      }
      return target;
    },
  });
}

function terminalResourceTargetRequestKey(request: TerminalResourceTargetRequest): string {
  return `${request.usage}\u0000${request.destination}`;
}
