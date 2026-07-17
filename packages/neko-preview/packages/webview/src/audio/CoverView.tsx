/**
 * CoverView - Album cover art display
 *
 * Shows real album art with blurred background when available,
 * falls back to placeholder with first letter of filename + gradient.
 */

interface CoverViewProps {
  /** File name (used to generate placeholder letter) */
  fileName: string;
  /** Whether audio is currently playing (enables pulse animation) */
  isPlaying: boolean;
  /** Album cover art data URI */
  coverUri?: string;
}

export function CoverView({ fileName, isPlaying, coverUri }: CoverViewProps) {
  const letter = getDisplayLetter(fileName);

  const coverStyle = {
    width: 'min(280px, 60vh, 100%)' as const,
    aspectRatio: '1' as const,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)',
    animation: isPlaying ? 'neko-cover-pulse 3s ease-in-out infinite' : 'none',
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {coverUri ? (
        <>
          <div
            className="absolute -inset-5 bg-cover bg-center opacity-35"
            style={{
              backgroundImage: `url(${coverUri})`,
              filter: 'blur(40px) saturate(1.2)',
            }}
          />
          <img
            className="relative z-10 rounded-xl object-contain"
            style={coverStyle}
            src={coverUri}
            alt="Album art"
          />
        </>
      ) : (
        <div
          className="flex items-center justify-center rounded-xl overflow-hidden select-none"
          style={{
            ...coverStyle,
            background: `linear-gradient(135deg, color-mix(in srgb, var(--neko-preview-accent) 60%, #000) 0%, color-mix(in srgb, var(--neko-preview-accent) 30%, #000) 100%)`,
          }}
        >
          <span className="text-7xl font-bold text-white/85 uppercase leading-none">{letter}</span>
        </div>
      )}
    </div>
  );
}

/** Extract first meaningful character from filename (skip leading dots/numbers) */
function getDisplayLetter(fileName: string): string {
  const name = fileName.replace(/\.[^.]+$/, ''); // strip extension
  for (const ch of name) {
    if (/[a-zA-Z\u4e00-\u9fff]/.test(ch)) return ch;
  }
  return name[0] ?? '♪';
}
