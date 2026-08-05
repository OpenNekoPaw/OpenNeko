export const ASSET_LIBRARY_MEMBERSHIP_STATES = ['active', 'removed'] as const;

export type AssetLibraryMembershipState = (typeof ASSET_LIBRARY_MEMBERSHIP_STATES)[number];

export interface AssetLibraryMembershipRecord {
  readonly membershipId: string;
  readonly sourceRelativePath: string;
  readonly label: string;
  readonly mediaType: string | null;
  readonly byteLength: number | null;
  readonly modifiedAt: string | null;
  readonly state: AssetLibraryMembershipState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AssetLibraryMembershipRegistration {
  readonly membershipId: string;
  readonly sourceRelativePath: string;
  readonly label: string;
  readonly mediaType: string | null;
  readonly byteLength: number | null;
  readonly modifiedAt: string | null;
  readonly registeredAt: string;
}

export type AssetLibraryInventoryInitializationResult =
  | { readonly status: 'initialized'; readonly importedCount: number }
  | { readonly status: 'already-initialized' };

export interface AssetLibraryMembershipRepository {
  get(membershipId: string): Promise<AssetLibraryMembershipRecord | null>;
  findBySourceRelativePath(
    sourceRelativePath: string,
  ): Promise<AssetLibraryMembershipRecord | null>;
  listActive(): Promise<readonly AssetLibraryMembershipRecord[]>;
  initializeExistingInventory(
    registrations: readonly AssetLibraryMembershipRegistration[],
    completedAt: string,
  ): Promise<AssetLibraryInventoryInitializationResult>;
  activate(registration: AssetLibraryMembershipRegistration): Promise<AssetLibraryMembershipRecord>;
  remove(membershipId: string, removedAt: string): Promise<AssetLibraryMembershipRecord>;
}

export function assertAssetLibraryMembershipRegistration(
  value: AssetLibraryMembershipRegistration,
): void {
  requireNonEmpty(value.membershipId, 'Asset membershipId is required.');
  assertAssetLibrarySourceRelativePath(value.sourceRelativePath);
  requireNonEmpty(value.label, 'Asset membership label is required.');
  if (
    value.byteLength !== null &&
    (!Number.isSafeInteger(value.byteLength) || value.byteLength < 0)
  ) {
    throw new Error('Asset membership byteLength must be a non-negative safe integer.');
  }
  requireIsoDate(value.modifiedAt, 'Asset membership modifiedAt is invalid.');
  requireIsoDate(value.registeredAt, 'Asset membership registeredAt is invalid.');
}

export function assertAssetLibrarySourceRelativePath(value: string): void {
  requireNonEmpty(value, 'Asset membership sourceRelativePath is required.');
  if (
    value.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.includes('\\') ||
    value.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error('Asset membership sourceRelativePath must be a safe package-relative path.');
  }
}

function requireNonEmpty(value: string, message: string): void {
  if (value.trim().length === 0) throw new Error(message);
}

function requireIsoDate(value: string | null, message: string): void {
  if (
    value !== null &&
    (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
  ) {
    throw new Error(message);
  }
}
