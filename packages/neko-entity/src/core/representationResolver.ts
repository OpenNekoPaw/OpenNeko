import type {
  CreativeEntityRegistry,
  EntityRepresentationBinding,
  EntityRepresentationResolveRequest,
  EntityRepresentationResolveResult,
  EntityRepresentationRole,
} from '@neko/shared';
import { ENTITY_REPRESENTATION_ROLE_ORDER } from '@neko/shared';

export interface RepresentationBindingReader {
  list(): Promise<readonly EntityRepresentationBinding[]>;
}

export interface EntityRepresentationResolverOptions {
  readonly entities: CreativeEntityRegistry;
  readonly bindings: RepresentationBindingReader;
}

export class EntityRepresentationResolver {
  constructor(private readonly options: EntityRepresentationResolverOptions) {}

  async resolve(
    request: EntityRepresentationResolveRequest,
  ): Promise<EntityRepresentationResolveResult> {
    const entity = await this.options.entities.get(request.entityId);
    const candidates = (await this.options.bindings.list()).filter(
      (binding) =>
        binding.entityId === request.entityId &&
        (!entity || binding.entityKind === entity.kind) &&
        binding.status === 'confirmed' &&
        binding.availability === 'active',
    );

    const roles = candidateRoleOrder(request);
    for (const role of roles) {
      const binding = pickBindingForRole(candidates, role);
      if (!binding) continue;
      return {
        status: 'resolved',
        entityId: request.entityId,
        binding,
        representation: binding.representation,
        resolvedRole: role,
        usedAlternativeRole: request.preferredRole ? role !== request.preferredRole : false,
      };
    }

    return {
      status: 'missing-representation',
      entityId: request.entityId,
      missingRoles: roles,
      suggestedActions: ['generate', 'bind-existing', 'dismiss'],
    };
  }
}

function candidateRoleOrder(
  request: EntityRepresentationResolveRequest,
): readonly EntityRepresentationRole[] {
  if (request.allowAlternativeRoles === false && request.preferredRole) {
    return [request.preferredRole];
  }
  const configured =
    request.candidateRoles ??
    (request.preferredRole
      ? [
          request.preferredRole,
          ...ENTITY_REPRESENTATION_ROLE_ORDER[request.consumer].filter(
            (role) => role !== request.preferredRole,
          ),
        ]
      : ENTITY_REPRESENTATION_ROLE_ORDER[request.consumer]);
  return Array.from(new Set(configured));
}

function pickBindingForRole(
  bindings: readonly EntityRepresentationBinding[],
  role: EntityRepresentationRole,
): EntityRepresentationBinding | undefined {
  const roleBindings = bindings.filter((binding) => binding.role === role);
  return roleBindings.find((binding) => binding.isDefault) ?? roleBindings[0];
}
