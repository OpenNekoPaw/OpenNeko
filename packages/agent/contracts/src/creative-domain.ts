/** Serializable creative-domain metadata shared by current Agent Tool contracts. */
export interface CreativeDomainMetadata {
  readonly id: 'timeline' | 'canvas' | 'audio' | 'project' | 'mixed';
  readonly source?: 'operation-tool' | 'engine-tool' | 'intent';
  readonly operationDomain?: string;
  readonly servicePortId?: string;
}
