/**
 * ColorWheelsPanel Component
 * 色轮调色面板 - 阴影/中间调/高光的色相/饱和度/亮度调整
 */

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { ColorWheelsParams, ColorWheelValue } from '../../types/colorCorrection';

// =============================================================================
// Types
// =============================================================================

interface ColorWheelsPanelProps {
  colorWheels: ColorWheelsParams;
  onChange: (
    wheel: 'shadows' | 'midtones' | 'highlights' | 'global',
    settings: ColorWheelValue,
  ) => void;
}

type WheelType = 'shadows' | 'midtones' | 'highlights' | 'global';

// =============================================================================
// Color Wheel Component
// =============================================================================

interface ColorWheelProps {
  label: string;
  settings: ColorWheelValue;
  onChange: (settings: ColorWheelValue) => void;
  size?: number;
}

const ColorWheel = memo(function ColorWheel({
  label,
  settings,
  onChange,
  size = 80,
}: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Convert hue/saturation to x/y position
  const hueToXY = useCallback(
    (hue: number, sat: number): { x: number; y: number } => {
      const radius = (sat / 100) * (size / 2 - 4);
      const angle = (hue - 90) * (Math.PI / 180);
      const x = size / 2 + Math.cos(angle) * radius;
      const y = size / 2 + Math.sin(angle) * radius;
      return { x, y };
    },
    [size],
  );

  // Convert x/y to hue/saturation
  const xyToHueSat = useCallback(
    (x: number, y: number): { hue: number; saturation: number } => {
      const centerX = size / 2;
      const centerY = size / 2;
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxRadius = size / 2 - 4;

      let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (angle < 0) angle += 360;

      const saturation = Math.min(100, (distance / maxRadius) * 100);

      return { hue: angle, saturation };
    },
    [size],
  );

  // Draw the color wheel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 4;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Draw color wheel gradient
    for (let angle = 0; angle < 360; angle += 1) {
      const startAngle = (angle - 0.5) * (Math.PI / 180);
      const endAngle = (angle + 0.5) * (Math.PI / 180);

      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      gradient.addColorStop(0, '#808080');
      gradient.addColorStop(1, `hsl(${angle}, 100%, 50%)`);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Draw outer ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw center point indicator
    const { x, y } = hueToXY(settings.hue, settings.saturation);

    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${settings.hue}, ${settings.saturation}%, 50%)`;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [settings, size, hueToXY]);

  // Handle mouse events
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      setIsDragging(true);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const { hue, saturation } = xyToHueSat(x, y);
        onChange({ ...settings, hue, saturation });
      }
    },
    [xyToHueSat, onChange, settings],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const { hue, saturation } = xyToHueSat(x, y);
        onChange({ ...settings, hue, saturation });
      }
    },
    [isDragging, xyToHueSat, onChange, settings],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    // Reset to center (neutral)
    onChange({ ...settings, hue: 0, saturation: 0 });
  }, [onChange, settings]);

  const handleLuminanceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...settings, luminance: parseFloat(e.target.value) });
    },
    [onChange, settings],
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] text-[var(--vscode-descriptionForeground)] uppercase tracking-wide">
        {label}
      </span>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />
      <input
        type="range"
        min={-100}
        max={100}
        step={1}
        value={settings.luminance}
        onChange={handleLuminanceChange}
        className="w-full h-1 accent-[var(--vscode-button-background)]"
        title={`Luminance: ${settings.luminance}`}
      />
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const ColorWheelsPanel = memo(function ColorWheelsPanel({
  colorWheels,
  onChange,
}: ColorWheelsPanelProps) {
  const { t } = useTranslation();

  const handleWheelChange = useCallback(
    (wheel: WheelType) => (settings: ColorWheelValue) => {
      onChange(wheel, settings);
    },
    [onChange],
  );

  return (
    <div className="space-y-3">
      {/* Color Wheels */}
      <div className="grid grid-cols-3 gap-2">
        <ColorWheel
          label={t('colorCorrection.colorWheels.shadows')}
          settings={colorWheels.shadows}
          onChange={handleWheelChange('shadows')}
        />
        <ColorWheel
          label={t('colorCorrection.colorWheels.midtones')}
          settings={colorWheels.midtones}
          onChange={handleWheelChange('midtones')}
        />
        <ColorWheel
          label={t('colorCorrection.colorWheels.highlights')}
          settings={colorWheels.highlights}
          onChange={handleWheelChange('highlights')}
        />
      </div>

      {/* Global Wheel */}
      <div className="flex justify-center pt-2 border-t border-[var(--vscode-panel-border)]">
        <ColorWheel
          label={t('colorCorrection.colorWheels.global')}
          settings={colorWheels.global}
          onChange={handleWheelChange('global')}
          size={100}
        />
      </div>

      {/* Info */}
      <div className="text-[9px] text-[var(--vscode-descriptionForeground)] text-center">
        {t('colorCorrection.colorWheels.hue')}: {colorWheels.global.hue.toFixed(0)}° |
        {t('colorCorrection.colorWheels.saturation')}: {colorWheels.global.saturation.toFixed(0)}% |
        {t('colorCorrection.colorWheels.luminance')}: {colorWheels.global.luminance > 0 ? '+' : ''}
        {colorWheels.global.luminance.toFixed(0)}
      </div>
    </div>
  );
});

export default ColorWheelsPanel;
