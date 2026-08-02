export interface KeyframeControlProps {
  readonly propertyId: string;
  readonly animatable?: boolean;
  readonly hasKeyframes?: boolean;
  readonly isAtKeyframe?: boolean;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly onToggleKeyframe?: (propertyId: string) => void;
}
