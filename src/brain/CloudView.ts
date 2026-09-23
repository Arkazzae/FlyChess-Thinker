/**
 * Rotatable point cloud of the FlyWire v783 cell bodies (134,181 neurons, 117,708 with a
 * measured position), lit by the recorded activity of the fly's current thought. Between two
 * recorded steps the colours blend smoothly, and neurons that are switching on flash white,
 * so the wave of activity can be followed from the optic lobes to the read-out.
 *
 * Positions are measured somata; nothing is generated to make the brain look fuller.
 */

import { ROLE_READOUT, ROLE_VISUAL } from "@/ai/fly/brain";
import type { FlyAnatomy } from "@/state/fly";
import { brainClock, frameBlend } from "./clock";

export const GROUP_COLORS = ["#4fc3d9", "#6f8cff", "#b48cff", "#ff8a65", "#e6c35c", "#7fd67a"];

const VERTEX = `
precision mediump float;
attribute vec3 position;
attribute float group;
attribute float valid;
attribute float role;
attribute float actA;
attribute float actB;
uniform float yaw;
uniform float pitch;
uniform float aspect;
uniform float zoom;
uniform float dpr;
uniform float mixT;
uniform float norm;
uniform float roles;
uniform float focus;
uniform float density;
varying vec4 tint;

vec3 groupColor(float g) {
  return g < .5 ? vec3(.31,.765,.851) : g < 1.5 ? vec3(.435,.549,1.) : g < 2.5 ? vec3(.706,.549,1.)
       : g < 3.5 ? vec3(1.,.541,.396) : g < 4.5 ? vec3(.902,.765,.361) : vec3(.498,.839,.478);
}

void main() {
  vec3 p = vec3(position.x, -position.z, position.y);
  p = vec3(cos(yaw)*p.x + sin(yaw)*p.z, p.y, -sin(yaw)*p.x + cos(yaw)*p.z);
  p = vec3(p.x, cos(pitch)*p.y - sin(pitch)*p.z, sin(pitch)*p.y + cos(pitch)*p.z);
  float w = 1. + p.z * .28;
  bool hidden = valid < .5 || (focus > -.5 && abs(group - focus) > .5);
  gl_Position = hidden ? vec4(5.,5.,0.,1.) : vec4(p.x*zoom/aspect, p.y*zoom - .02, p.z*.2, w);

  float a0 = pow(clamp(actA / norm, 0., 1.6), .6);
  float a1 = pow(clamp(actB / norm, 0., 1.6), .6);
  float a = mix(a0, a1, mixT);
  // Switching on during this step: a white flash that peaks mid-transition.
  float rise = clamp((a1 - a0) * 2.2, 0., 1.) * sin(3.14159 * mixT);

  vec3 c = groupColor(group);
  float readout = roles * step(${ROLE_READOUT.toFixed(1)} - .5, role) * step(role, ${ROLE_READOUT.toFixed(1)} + .5);
  float visual = roles * step(${ROLE_VISUAL.toFixed(1)} - .5, role) * step(role, ${ROLE_VISUAL.toFixed(1)} + .5);
  c = mix(c, vec3(1., .84, .35), readout * .85);
  c = mix(c, vec3(.55, .95, 1.), visual * .35);
  vec3 lit = mix(c, vec3(1.), clamp(a * .35 + rise * .5, 0., 1.));
  gl_PointSize = (1.1 + a * 2.2 + rise * 1.8 + readout * a * 1.4) * dpr * (1.15 - p.z * .25) * mix(.8, 1., density);
  // Additive blending: small canvases pack more neurons per pixel, so each one is dimmer.
  tint = vec4(lit, (.022 + a * .3 + rise * .22) * mix(.4, 1., density));
}`;

const FRAGMENT = `
precision mediump float;
varying vec4 tint;
void main() {
  float d = distance(gl_PointCoord, vec2(.5));
  if (d > .5) discard;
  gl_FragColor = vec4(tint.rgb, tint.a * (1. - d * 1.4));
}`;

export interface CloudOptions {
  /** Highlight read-out (gold) and visual input (cyan) neurons. */
  roles: boolean;
  /** Show one anatomical group only; -1 = all. */
  focus: number;
  autoRotate: boolean;
}

/** A scripted camera and moment, used by scripts/media.mjs to render frame-exact presentation clips. */
export interface CloudShot { yaw: number; pitch: number; zoom: number; t: number }

export class CloudView {
  /** When set, every view draws this shot instead of following the user and the playback clock. */
  static director: (() => CloudShot) | null = null;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private attributes: Record<string, number> = {};
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private buffers: Record<string, WebGLBuffer> = {};
  private readonly count: number;
  private yaw = -0.5;
  private pitch = 0.12;
  private zoom = 0.85;
  private destroyed = false;
  private abort = new AbortController();
  private pointer?: { x: number; y: number; id: number };
  private touchedAt = 0;
  private lastNow = 0;
  private uploaded = { version: -1, k: -1, fallback: null as Float32Array | null };
  private fallbackNorm = 0.25;
  private readonly reduced = matchMedia("(prefers-reduced-motion: reduce)");
  private unsubscribe: () => void;
  options: CloudOptions = { roles: true, focus: -1, autoRotate: true };

  constructor(readonly canvas: HTMLCanvasElement, anatomy: FlyAnatomy, roles: Uint8Array | null, private readonly fallback: () => Float32Array | null) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL is not available.");
    this.gl = gl;
    this.count = anatomy.neurons;
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Shader failed to compile.");
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program) ?? "Program failed to link.");
    gl.useProgram(this.program);
    for (const name of ["position", "group", "valid", "role", "actA", "actB"]) this.attributes[name] = gl.getAttribLocation(this.program, name);
    for (const name of ["yaw", "pitch", "aspect", "zoom", "dpr", "mixT", "norm", "roles", "focus", "density"]) this.uniforms[name] = gl.getUniformLocation(this.program, name);
    const buffer = (data: Float32Array) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      return b;
    };
    this.buffers = {
      position: buffer(anatomy.positions),
      group: buffer(Float32Array.from(anatomy.groups)),
      valid: buffer(Float32Array.from(anatomy.positioned)),
      role: buffer(roles ? Float32Array.from(roles) : new Float32Array(anatomy.neurons)),
      actA: buffer(new Float32Array(anatomy.neurons)),
      actB: buffer(new Float32Array(anatomy.neurons)),
    };
    gl.clearColor(0.035, 0.04, 0.05, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    const options = { signal: this.abort.signal };
    canvas.addEventListener("pointerdown", (e) => {
      this.pointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.touchedAt = performance.now();
      canvas.setPointerCapture(e.pointerId);
    }, options);
    canvas.addEventListener("pointermove", (e) => {
      if (!this.pointer || this.pointer.id !== e.pointerId) return;
      this.yaw += (e.clientX - this.pointer.x) * 0.008;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + (e.clientY - this.pointer.y) * 0.008));
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.touchedAt = performance.now();
    }, options);
    const release = () => { this.pointer = undefined; };
    canvas.addEventListener("pointerup", release, options);
    canvas.addEventListener("pointercancel", release, options);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.45, Math.min(2.6, this.zoom * Math.exp(-e.deltaY * 0.0012)));
      this.touchedAt = performance.now();
    }, { ...options, passive: false });
    canvas.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "Home"].includes(e.key)) return;
      e.preventDefault();
      if (e.key === "ArrowLeft") this.yaw -= 0.1;
      if (e.key === "ArrowRight") this.yaw += 0.1;
      if (e.key === "ArrowUp") this.pitch -= 0.1;
      if (e.key === "ArrowDown") this.pitch += 0.1;
      if (e.key === "+") this.zoom = Math.min(2.6, this.zoom * 1.1);
      if (e.key === "-") this.zoom = Math.max(0.45, this.zoom / 1.1);
      if (e.key === "Home") { this.yaw = -0.5; this.pitch = 0.12; this.zoom = 0.85; }
      this.touchedAt = performance.now();
    }, options);
    this.unsubscribe = brainClock.subscribe((t, now) => this.draw(t, now));
  }

  private upload(name: "actA" | "actB", data: Float32Array): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers[name]);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, data);
  }

  private draw(t: number, now: number): void {
    if (this.destroyed || this.gl.isContextLost()) return;
    const gl = this.gl;
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    if (this.options.autoRotate && !this.reduced.matches && !this.pointer && now - this.touchedAt > 2500) this.yaw += dt * 0.16;
    const shot = CloudView.director?.();
    if (shot) ({ yaw: this.yaw, pitch: this.pitch, zoom: this.zoom, t } = shot);

    const trace = brainClock.trace;
    const n = this.count;
    let mixT = 1;
    let norm = 0.25;
    if (trace && trace.frames.length === (trace.steps + 1) * n) {
      const { k, f } = frameBlend(t, trace.steps);
      mixT = f;
      if (this.uploaded.version !== brainClock.version || this.uploaded.k !== k) {
        this.upload("actA", trace.frames.subarray(k * n, (k + 1) * n));
        this.upload("actB", trace.frames.subarray((k + 1) * n, (k + 2) * n));
        this.uploaded = { version: brainClock.version, k, fallback: null };
      }
      const stats = brainClock.stats;
      if (stats) norm = Math.max(...stats.scale) * 0.9;
    } else {
      const activity = this.fallback();
      if (activity && activity.length === n && this.uploaded.fallback !== activity) {
        this.upload("actA", activity);
        this.upload("actB", activity);
        this.uploaded = { version: -1, k: -1, fallback: activity };
        let peak = 0;
        for (let i = 0; i < n; i += 7) peak = Math.max(peak, activity[i]);
        this.fallbackNorm = Math.max(0.05, peak * 0.6);
      }
      norm = this.fallbackNorm;
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    const values: Record<string, number> = {
      yaw: this.yaw, pitch: this.pitch, aspect: width / height, zoom: this.zoom * Math.min(1, (width / height) / 1.1 + 0.25), dpr,
      mixT, norm, roles: this.options.roles ? 1 : 0, focus: this.options.focus,
      density: Math.min(1, (this.canvas.clientWidth * this.canvas.clientHeight) / (820 * 560)),
    };
    for (const [name, value] of Object.entries(values)) gl.uniform1f(this.uniforms[name], value);
    for (const name of Object.keys(this.buffers)) {
      const location = this.attributes[name];
      if (location < 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[name]);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, name === "position" ? 3 : 1, gl.FLOAT, false, 0, 0);
    }
    gl.drawArrays(gl.POINTS, 0, this.count);
  }

  resetView(): void {
    this.yaw = -0.5;
    this.pitch = 0.12;
    this.zoom = 0.85;
  }

  dispose(): void {
    this.destroyed = true;
    this.unsubscribe();
    this.abort.abort();
    for (const b of Object.values(this.buffers)) this.gl.deleteBuffer(b);
    this.gl.deleteProgram(this.program);
  }
}
