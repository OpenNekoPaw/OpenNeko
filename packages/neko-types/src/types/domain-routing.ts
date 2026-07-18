/**
 * Shared creative-domain routing metadata.
 *
 * These types are serializable orchestration data. They intentionally do not
 * name runtime services, ECS worlds, or concrete engine implementations.
 */

export type CreativeDomainId = 'timeline' | 'canvas' | 'audio' | 'project' | 'mixed';

export type CreativeDomainSource = 'operation-tool' | 'engine-tool' | 'capability' | 'intent';

export const TIMELINE_RENDER_SERVICE_PORT_ID = 'media-render';
export const AUDIO_RENDER_SERVICE_PORT_ID = 'audio-render';

export const CREATIVE_DOMAIN_SERVICE_PORT_IDS: Readonly<Partial<Record<CreativeDomainId, string>>> =
  {
    timeline: TIMELINE_RENDER_SERVICE_PORT_ID,
    audio: AUDIO_RENDER_SERVICE_PORT_ID,
  };

export interface CreativeDomainMetadata {
  readonly id: CreativeDomainId;
  readonly source?: CreativeDomainSource;
  readonly operationDomain?: string;
  readonly servicePortId?: string;
}

export interface DomainRouteIntent {
  readonly id: string;
  readonly domain?: CreativeDomainMetadata;
  readonly capabilityIds?: readonly string[];
}

export interface DomainRouteCapability {
  readonly id: string;
  readonly domain?: CreativeDomainMetadata;
  readonly servicePortId: string;
}

export interface DomainRoutePlan {
  readonly intentId: string;
  readonly domain: CreativeDomainMetadata;
  readonly servicePortId: string;
  readonly capabilityId?: string;
}

export type DomainRouteFailureReason =
  'missing-intent-domain' | 'no-capabilities' | 'capability-filter-empty' | 'domain-mismatch';

export interface DomainRouteError {
  readonly reason: DomainRouteFailureReason;
  readonly intentId: string;
  readonly domain?: CreativeDomainMetadata;
  readonly capabilityIds?: readonly string[];
  readonly message: string;
}

export type DomainRouteResult =
  | {
      readonly ok: true;
      readonly plan: DomainRoutePlan;
    }
  | {
      readonly ok: false;
      readonly error: DomainRouteError;
    };

export class DomainRouter {
  route(
    intent: DomainRouteIntent,
    capabilities: readonly DomainRouteCapability[],
  ): DomainRouteResult {
    if (!intent.domain) {
      return this.fail(intent, 'missing-intent-domain', 'Intent does not include a domain.');
    }

    if (capabilities.length === 0) {
      return this.fail(intent, 'no-capabilities', 'No capabilities are available for routing.');
    }

    const candidates = intent.capabilityIds
      ? capabilities.filter((candidate) => intent.capabilityIds?.includes(candidate.id) ?? false)
      : capabilities;

    if (candidates.length === 0) {
      return this.fail(
        intent,
        'capability-filter-empty',
        'Intent capability filter did not match any available capability.',
      );
    }

    const capability = candidates.find((candidate) => candidate.domain?.id === intent.domain?.id);

    if (!capability) {
      return this.fail(
        intent,
        'domain-mismatch',
        'No candidate capability matches the intent domain.',
      );
    }

    return {
      ok: true,
      plan: {
        intentId: intent.id,
        domain: intent.domain,
        servicePortId: capability.servicePortId,
        capabilityId: capability.id,
      },
    };
  }

  private fail(
    intent: DomainRouteIntent,
    reason: DomainRouteFailureReason,
    message: string,
  ): DomainRouteResult {
    return {
      ok: false,
      error: {
        reason,
        intentId: intent.id,
        domain: intent.domain,
        capabilityIds: intent.capabilityIds,
        message,
      },
    };
  }
}

export function createDomainRouter(): DomainRouter {
  return new DomainRouter();
}
