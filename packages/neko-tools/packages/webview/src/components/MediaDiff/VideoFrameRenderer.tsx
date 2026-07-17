/**
 * VideoFrameRenderer — WebGL-based frame comparison
 *
 * Renders two video frames (JPEG Blob URLs) through WebGL shaders:
 * - Curtain: split-screen with draggable divider
 * - Heatmap: abs(colorA - colorB) mapped to color spectrum
 * - Flicker: rapid A/B alternation via injected raf scheduler
 */

import { memo, useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { useMediaDiffRuntime } from '../../runtime/MediaDiffRuntimeContext';
import { getLogger } from '../../utils/logger';

const logger = getLogger('VideoFrameRenderer');

// =============================================================================
// Types
// =============================================================================

export type WebGLRenderMode = 'curtain' | 'heatmap' | 'flicker';

interface VideoFrameRendererProps {
  currentFrameSrc?: string;
  previousFrameSrc?: string;
  mode: WebGLRenderMode;
  /** Curtain split position (0-1), only used in curtain mode */
  sliderPosition?: number;
  onSliderChange?: (position: number) => void;
}

// =============================================================================
// Shader Sources
// =============================================================================

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER_CURTAIN = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_textureA;
  uniform sampler2D u_textureB;
  uniform float u_splitPos;
  void main() {
    if (v_texCoord.x < u_splitPos) {
      gl_FragColor = texture2D(u_textureA, v_texCoord);
    } else {
      gl_FragColor = texture2D(u_textureB, v_texCoord);
    }
  }
`;

const FRAGMENT_SHADER_HEATMAP = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_textureA;
  uniform sampler2D u_textureB;
  // Map difference magnitude to heat color (blue→green→yellow→red)
  vec3 heatColor(float t) {
    float r = clamp(1.5 - abs(t - 0.75) * 4.0, 0.0, 1.0);
    float g = clamp(1.5 - abs(t - 0.5) * 4.0, 0.0, 1.0);
    float b = clamp(1.5 - abs(t - 0.25) * 4.0, 0.0, 1.0);
    return vec3(r, g, b);
  }
  void main() {
    vec4 colorA = texture2D(u_textureA, v_texCoord);
    vec4 colorB = texture2D(u_textureB, v_texCoord);
    vec3 diff = abs(colorA.rgb - colorB.rgb);
    float magnitude = (diff.r + diff.g + diff.b) / 3.0;
    gl_FragColor = vec4(heatColor(magnitude), 1.0);
  }
`;

const FRAGMENT_SHADER_FLICKER = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_textureA;
  uniform sampler2D u_textureB;
  uniform float u_showA;
  void main() {
    if (u_showA > 0.5) {
      gl_FragColor = texture2D(u_textureA, v_texCoord);
    } else {
      gl_FragColor = texture2D(u_textureB, v_texCoord);
    }
  }
`;

// =============================================================================
// WebGL Helpers
// =============================================================================

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    logger.error('Shader compile error', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    logger.error('Program link error', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function loadImageToTexture(
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
  image: HTMLImageElement,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

function getFragmentShader(mode: WebGLRenderMode): string {
  switch (mode) {
    case 'curtain':
      return FRAGMENT_SHADER_CURTAIN;
    case 'heatmap':
      return FRAGMENT_SHADER_HEATMAP;
    case 'flicker':
      return FRAGMENT_SHADER_FLICKER;
  }
}

// =============================================================================
// Main Component
// =============================================================================

export const VideoFrameRenderer = memo(function VideoFrameRenderer({
  currentFrameSrc,
  previousFrameSrc,
  mode,
  sliderPosition = 0.5,
  onSliderChange,
}: VideoFrameRendererProps) {
  const { t } = useTranslation();
  const { rafScheduler } = useMediaDiffRuntime();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureARef = useRef<WebGLTexture | null>(null);
  const textureBRef = useRef<WebGLTexture | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const flickerShowARef = useRef(true);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const [isDragging, setIsDragging] = useState(false);
  const [webglSupported, setWebglSupported] = useState(true);

  // Initialize WebGL context and geometry
  const initGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) {
      setWebglSupported(false);
      return;
    }
    glRef.current = gl;

    // Create textures
    textureARef.current = gl.createTexture();
    textureBRef.current = gl.createTexture();

    // Set up quad geometry (full-screen triangle strip)
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    // positions: clip space, texCoords interleaved
    const vertices = new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }, []);

  // Build shader program for current mode
  const buildProgram = useCallback((currentMode: WebGLRenderMode) => {
    const gl = glRef.current;
    if (!gl) return;

    if (programRef.current) {
      gl.deleteProgram(programRef.current);
    }

    const program = createProgram(gl, VERTEX_SHADER, getFragmentShader(currentMode));
    if (!program) return;
    programRef.current = program;

    gl.useProgram(program);

    // Bind attributes
    const posLoc = gl.getAttribLocation(program, 'a_position');
    const texLoc = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

    // Bind texture units
    const uTexA = gl.getUniformLocation(program, 'u_textureA');
    const uTexB = gl.getUniformLocation(program, 'u_textureB');
    gl.uniform1i(uTexA, 0);
    gl.uniform1i(uTexB, 1);
  }, []);

  // Render a single frame
  const render = useCallback(() => {
    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program) return;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureARef.current);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureBRef.current);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, []);

  // Initialize on mount
  useEffect(() => {
    initGL();
    return () => {
      rafScheduler.cancelFrame(animFrameRef.current);
      const gl = glRef.current;
      if (gl) {
        if (programRef.current) gl.deleteProgram(programRef.current);
        if (textureARef.current) gl.deleteTexture(textureARef.current);
        if (textureBRef.current) gl.deleteTexture(textureBRef.current);
      }
    };
  }, [initGL, rafScheduler]);

  // Rebuild program when mode changes
  useEffect(() => {
    buildProgram(mode);
    render();
  }, [mode, buildProgram, render]);

  // Load frame images into textures
  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;

    const loadImage = (src: string, texture: WebGLTexture | null) => {
      if (!texture) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Resize canvas to match image aspect ratio
        const canvas = canvasRef.current;
        if (canvas) {
          const container = canvas.parentElement;
          if (container) {
            const w = container.clientWidth;
            const h = container.clientHeight;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
          }
        }
        loadImageToTexture(gl, texture, img);
        render();
      };
      img.src = src;
    };

    if (previousFrameSrc && textureARef.current) {
      loadImage(previousFrameSrc, textureARef.current);
    }
    if (currentFrameSrc && textureBRef.current) {
      loadImage(currentFrameSrc, textureBRef.current);
    }
  }, [currentFrameSrc, previousFrameSrc, render]);

  // Update curtain split position uniform
  useEffect(() => {
    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program || mode !== 'curtain') return;

    gl.useProgram(program);
    const loc = gl.getUniformLocation(program, 'u_splitPos');
    gl.uniform1f(loc, sliderPosition);
    render();
  }, [sliderPosition, mode, render]);

  // Flicker animation loop
  useEffect(() => {
    if (mode !== 'flicker') {
      rafScheduler.cancelFrame(animFrameRef.current);
      animFrameRef.current = null;
      return;
    }

    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program) return;

    let lastToggle = 0;
    const FLICKER_INTERVAL = 500; // ms between toggles

    const loop = (timestamp: number) => {
      if (modeRef.current !== 'flicker') return;

      if (timestamp - lastToggle > FLICKER_INTERVAL) {
        flickerShowARef.current = !flickerShowARef.current;
        lastToggle = timestamp;

        gl.useProgram(program);
        const loc = gl.getUniformLocation(program, 'u_showA');
        gl.uniform1f(loc, flickerShowARef.current ? 1.0 : 0.0);
        render();
      }
      animFrameRef.current = rafScheduler.requestFrame(loop);
    };

    animFrameRef.current = rafScheduler.requestFrame(loop);
    return () => {
      rafScheduler.cancelFrame(animFrameRef.current);
      animFrameRef.current = null;
    };
  }, [mode, rafScheduler, render]);

  // Mouse interaction for curtain mode
  const handleMouseDown = useCallback(() => {
    if (mode === 'curtain') setIsDragging(true);
  }, [mode]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || mode !== 'curtain' || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      onSliderChange?.(Math.max(0, Math.min(1, x)));
    },
    [isDragging, mode, onSliderChange],
  );

  useEffect(() => {
    if (isDragging) {
      const handleUp = () => setIsDragging(false);
      window.addEventListener('mouseup', handleUp);
      return () => window.removeEventListener('mouseup', handleUp);
    }
  }, [isDragging]);

  if (!webglSupported) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--vscode-descriptionForeground)]">
        {t('mediaDiff.webglNotAvailable')}
      </div>
    );
  }

  return (
    <div
      className="relative flex-1 overflow-hidden bg-black rounded border border-[var(--vscode-panel-border)] m-2"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      style={{ cursor: mode === 'curtain' ? 'col-resize' : 'default' }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      {/* Curtain divider line */}
      {mode === 'curtain' && (
        <>
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none z-10"
            style={{ left: `${sliderPosition * 100}%` }}
          />
          <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 text-white text-xs rounded pointer-events-none">
            {t('mediaDiff.previous')}
          </div>
          <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded pointer-events-none">
            {t('mediaDiff.current')}
          </div>
        </>
      )}
      {/* Mode label */}
      {mode === 'heatmap' && (
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 text-white text-xs rounded pointer-events-none">
          {t('mediaDiff.differenceHeatmap')}
        </div>
      )}
      {mode === 'flicker' && (
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 text-white text-xs rounded pointer-events-none">
          {t('mediaDiff.flicker', {
            version: flickerShowARef.current ? t('mediaDiff.previous') : t('mediaDiff.current'),
          })}
        </div>
      )}
    </div>
  );
});

export default VideoFrameRenderer;
