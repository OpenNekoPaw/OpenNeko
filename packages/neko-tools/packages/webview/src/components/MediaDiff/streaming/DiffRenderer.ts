/**
 * DiffRenderer — WebGL2-based diff visualization for paired VideoFrames.
 *
 * Supports four diff modes:
 * - **Side-by-side**: Left/right split showing both frames simultaneously
 * - **Curtain**: Wipe split at adjustable slider position
 * - **Heatmap**: Pixel difference magnitude rendered as blue→green→yellow→red
 * - **Flicker**: Rapidly alternates between A and B frames
 *
 * Uses WebGL2 for GPU-accelerated rendering. VideoFrames are uploaded as
 * textures via `texImage2D(... videoFrame)`, then closed immediately after upload.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

import type { IRafScheduler } from '../../../runtime/rafScheduler';

/** Frame source accepted by renderPair: VideoFrame (streaming) or ImageBitmap (static) */
export type DiffFrame = VideoFrame | ImageBitmap;

export type DiffMode = 'side-by-side' | 'curtain' | 'heatmap' | 'flicker';

export interface DiffRendererConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  rafScheduler: IRafScheduler;
}

// ─── Shader sources ──────────────────────────────────────────────────────────

const VERTEX_SHADER = `#version 300 es
precision highp float;

const vec2 QUAD[4] = vec2[4](
	vec2(-1, -1),
	vec2( 1, -1),
	vec2(-1,  1),
	vec2( 1,  1)
);

out vec2 vUv;

void main() {
	vec2 pos = QUAD[gl_VertexID];
	// Flip Y so video is right-side-up
	vUv = pos * 0.5 + 0.5;
	vUv.y = 1.0 - vUv.y;
	gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const SIDEBYSIDE_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uDividerWidth; // divider width in UV space

in vec2 vUv;
out vec4 fragColor;

void main() {
	float half_ = 0.5;
	if (abs(vUv.x - half_) < uDividerWidth) {
		// Divider line
		fragColor = vec4(0.4, 0.4, 0.4, 1.0);
	} else if (vUv.x < half_) {
		// Left: frame A, remap x [0, 0.5) -> [0, 1]
		fragColor = texture(uTexA, vec2(vUv.x * 2.0, vUv.y));
	} else {
		// Right: frame B, remap x (0.5, 1] -> [0, 1]
		fragColor = texture(uTexB, vec2((vUv.x - half_) * 2.0, vUv.y));
	}
}
`;

const CURTAIN_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uSliderPos; // 0..1

in vec2 vUv;
out vec4 fragColor;

void main() {
	fragColor = vUv.x < uSliderPos
		? texture(uTexA, vUv)
		: texture(uTexB, vUv);
}
`;

const HEATMAP_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uTexA;
uniform sampler2D uTexB;

in vec2 vUv;
out vec4 fragColor;

// Maps [0..1] magnitude to blue→cyan→green→yellow→red heatmap
vec3 heatmap(float t) {
	t = clamp(t, 0.0, 1.0);
	// 5-stop gradient
	vec3 c;
	if (t < 0.25) {
		c = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), t * 4.0);
	} else if (t < 0.5) {
		c = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (t - 0.25) * 4.0);
	} else if (t < 0.75) {
		c = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (t - 0.5) * 4.0);
	} else {
		c = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (t - 0.75) * 4.0);
	}
	return c;
}

void main() {
	vec4 a = texture(uTexA, vUv);
	vec4 b = texture(uTexB, vUv);
	vec3 diff = abs(a.rgb - b.rgb);
	// Perceptual luminance weighting
	float magnitude = dot(diff, vec3(0.299, 0.587, 0.114));
	// Amplify small differences for visibility (gamma 0.5)
	magnitude = sqrt(magnitude);
	fragColor = vec4(heatmap(magnitude), 1.0);
}
`;

const FLICKER_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uShowA; // 1.0 = show A, 0.0 = show B

in vec2 vUv;
out vec4 fragColor;

void main() {
	fragColor = uShowA > 0.5
		? texture(uTexA, vUv)
		: texture(uTexB, vUv);
}
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract pixel dimensions from either VideoFrame or ImageBitmap */
function getFrameDimensions(frame: DiffFrame): { w: number; h: number } {
  if ('displayWidth' in frame) {
    // VideoFrame
    return { w: frame.displayWidth, h: frame.displayHeight };
  }
  // ImageBitmap
  return { w: frame.width, h: frame.height };
}

// ─── DiffRenderer ────────────────────────────────────────────────────────────

export class DiffRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private texA: WebGLTexture;
  private texB: WebGLTexture;
  private programs: Record<DiffMode, WebGLProgram>;
  private uniformLocations: Record<DiffMode, Record<string, WebGLUniformLocation | null>>;

  private currentMode: DiffMode = 'curtain';
  private sliderPosition = 0.5;
  private flickerShowA = true;
  private flickerRafId: number | null = null;
  private disposed = false;
  /** Source frame dimensions (not canvas dimensions) */
  private frameWidth = 0;
  private frameHeight = 0;
  private readonly rafScheduler: IRafScheduler;

  constructor(config: DiffRendererConfig) {
    const { canvas, width, height, rafScheduler } = config;
    this.canvas = canvas;
    this.rafScheduler = rafScheduler;

    // Allow 0x0 — will auto-resize from first frame in renderPair
    if (width > 0 && height > 0) {
      this.frameWidth = width;
      this.frameHeight = height;
    }

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    if (this.frameWidth > 0 && this.frameHeight > 0) {
      this.applyCanvasSize();
    }

    // Create textures
    this.texA = this.createTexture();
    this.texB = this.createTexture();

    // Compile all shader programs
    this.programs = {
      'side-by-side': this.createProgram(VERTEX_SHADER, SIDEBYSIDE_FRAGMENT),
      curtain: this.createProgram(VERTEX_SHADER, CURTAIN_FRAGMENT),
      heatmap: this.createProgram(VERTEX_SHADER, HEATMAP_FRAGMENT),
      flicker: this.createProgram(VERTEX_SHADER, FLICKER_FRAGMENT),
    };

    // Cache uniform locations
    this.uniformLocations = {
      'side-by-side': {
        uTexA: gl.getUniformLocation(this.programs['side-by-side'], 'uTexA'),
        uTexB: gl.getUniformLocation(this.programs['side-by-side'], 'uTexB'),
        uDividerWidth: gl.getUniformLocation(this.programs['side-by-side'], 'uDividerWidth'),
      },
      curtain: {
        uTexA: gl.getUniformLocation(this.programs.curtain, 'uTexA'),
        uTexB: gl.getUniformLocation(this.programs.curtain, 'uTexB'),
        uSliderPos: gl.getUniformLocation(this.programs.curtain, 'uSliderPos'),
      },
      heatmap: {
        uTexA: gl.getUniformLocation(this.programs.heatmap, 'uTexA'),
        uTexB: gl.getUniformLocation(this.programs.heatmap, 'uTexB'),
      },
      flicker: {
        uTexA: gl.getUniformLocation(this.programs.flicker, 'uTexA'),
        uTexB: gl.getUniformLocation(this.programs.flicker, 'uTexB'),
        uShowA: gl.getUniformLocation(this.programs.flicker, 'uShowA'),
      },
    };
  }

  /** Set the active diff visualization mode */
  setMode(mode: DiffMode): void {
    if (this.currentMode === mode) return;

    // Stop flicker animation if leaving flicker mode
    if (this.currentMode === 'flicker') {
      this.stopFlickerLoop();
    }

    this.currentMode = mode;

    // Re-apply canvas size (side-by-side uses 2x width)
    if (this.frameWidth > 0 && this.frameHeight > 0) {
      this.applyCanvasSize();
    }

    // Start flicker animation if entering flicker mode
    if (mode === 'flicker') {
      this.startFlickerLoop();
    }
  }

  /** Set curtain slider position (0 = all B, 1 = all A) */
  setSliderPosition(pos: number): void {
    this.sliderPosition = Math.max(0, Math.min(1, pos));
  }

  /** Render a paired frame. Uploads textures and draws. Closes frames after upload. */
  renderPair(frameA: DiffFrame, frameB: DiffFrame): void {
    if (this.disposed) {
      frameA.close();
      frameB.close();
      return;
    }

    // Auto-resize canvas from actual frame dimensions when config had 0x0
    const { w, h } = getFrameDimensions(frameA);
    if (w > 0 && h > 0 && (this.frameWidth !== w || this.frameHeight !== h)) {
      this.frameWidth = w;
      this.frameHeight = h;
      this.applyCanvasSize();
    }

    const gl = this.gl;

    // Upload frame A → texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frameA);
    frameA.close();

    // Upload frame B → texture unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frameB);
    frameB.close();

    this.draw();
  }

  /**
   * Render a single frame (one-sided update).
   * Only uploads the new frame's texture; the other side retains its last content.
   * Used when one stream has ended but the other continues playing.
   */
  renderSingle(frame: DiffFrame, side: 'A' | 'B'): void {
    if (this.disposed) {
      frame.close();
      return;
    }

    const { w, h } = getFrameDimensions(frame);
    if (w > 0 && h > 0 && (this.frameWidth !== w || this.frameHeight !== h)) {
      this.frameWidth = w;
      this.frameHeight = h;
      this.applyCanvasSize();
    }

    const gl = this.gl;
    if (side === 'A') {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texA);
    } else {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texB);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    frame.close();

    this.draw();
  }

  /** Dispose all WebGL resources */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopFlickerLoop();

    const gl = this.gl;
    gl.deleteTexture(this.texA);
    gl.deleteTexture(this.texB);
    for (const prog of Object.values(this.programs)) {
      gl.deleteProgram(prog);
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────

  /** Apply canvas dimensions based on frame size and current mode.
   *  Side-by-side mode doubles the canvas width to preserve aspect ratio. */
  private applyCanvasSize(): void {
    const cw = this.currentMode === 'side-by-side' ? this.frameWidth * 2 : this.frameWidth;
    const ch = this.frameHeight;
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
      this.gl.viewport(0, 0, cw, ch);
    }
  }

  private draw(): void {
    const gl = this.gl;
    const mode = this.currentMode;
    const program = this.programs[mode];
    const locs = this.uniformLocations[mode];

    gl.useProgram(program);

    // Bind texture units
    gl.uniform1i(locs.uTexA!, 0);
    gl.uniform1i(locs.uTexB!, 1);

    // Mode-specific uniforms
    if (mode === 'side-by-side') {
      // 1px divider in UV space (canvas is 2x frame width in side-by-side)
      const canvasWidth = this.frameWidth * 2;
      const dividerWidth = canvasWidth > 0 ? 0.5 / canvasWidth : 0.001;
      gl.uniform1f(locs.uDividerWidth!, dividerWidth);
    } else if (mode === 'curtain') {
      gl.uniform1f(locs.uSliderPos!, this.sliderPosition);
    } else if (mode === 'flicker') {
      gl.uniform1f(locs.uShowA!, this.flickerShowA ? 1.0 : 0.0);
    }

    // Draw fullscreen quad (no VAO needed — positions generated in vertex shader)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private startFlickerLoop(): void {
    const toggle = () => {
      if (this.disposed || this.currentMode !== 'flicker') return;
      this.flickerShowA = !this.flickerShowA;
      this.draw();
      this.flickerRafId = this.rafScheduler.requestFrame(toggle);
    };
    this.flickerRafId = this.rafScheduler.requestFrame(toggle);
  }

  private stopFlickerLoop(): void {
    if (this.flickerRafId !== null) {
      this.rafScheduler.cancelFrame(this.flickerRafId);
      this.flickerRafId = null;
    }
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create WebGL texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vertSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(vs);
      gl.deleteShader(vs);
      throw new Error(`Vertex shader compile failed: ${info}`);
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(fs);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw new Error(`Fragment shader compile failed: ${info}`);
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`Program link failed: ${info}`);
    }

    // Shaders can be detached + deleted after linking
    gl.detachShader(prog, vs);
    gl.detachShader(prog, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return prog;
  }
}
