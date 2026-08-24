import type {
  MaterializedVideoGenerationInput,
  MaterializedVideoGenerationRequest,
  VideoGenerationInput,
} from '@neko/generation';

export function findMaterializedVideoInput(
  request: MaterializedVideoGenerationRequest,
  ...roles: readonly VideoGenerationInput['role'][]
): MaterializedVideoGenerationInput | undefined {
  return request.inputs?.find((input) => roles.includes(input.role));
}
