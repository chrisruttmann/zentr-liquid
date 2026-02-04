import {
  Renderer,
  Mesh,
  Program,
  CanvasTexture,
  Vec2,
  createFullScreenTriangle,
  Geometry,
} from "./renderer"
import {
  VERTEX_SHADER,
  SINGLE_DISTORD_FS,
  GRID_FS,
  REPEAT_OVERLAP_FS,
  META_LOGO_FS,
  DOUBLE_LOGO_FS,
  MOUSE_GRID_FS,
} from "./shaders"
import { Flowmap } from "./flowmap"

// ─── exponential lerp (matches 27b's O function) ────────────────────────────
function elerp(prev: number, target: number, base: number, deltaSec: number) {
  return (prev - target) * Math.pow(base, deltaSec * 10) + target
}

// ─── Base Effect ─────────────────────────────────────────────────────────────
export abstract class Effect {
  abstract name: string
  renderer: Renderer
  mesh: Mesh | null = null
  geometry: Geometry
  canvasTexture: CanvasTexture | null = null

  constructor(renderer: Renderer) {
    this.renderer = renderer
    this.geometry = createFullScreenTriangle()
    this.geometry.upload(renderer.gl)
  }

  abstract mount(canvasTexture: CanvasTexture): void
  abstract tick(time: number, delta: number): void
  abstract getParams(): Record<string, { value: number; min: number; max: number; step?: number }>
  abstract setParam(key: string, val: number): void

  setColors(fg: [number, number, number], bg: [number, number, number]) {
    if (!this.mesh) return
    if (this.mesh.uniforms.Color) this.mesh.uniforms.Color.value = fg
    if (this.mesh.uniforms.Background) this.mesh.uniforms.Background.value = bg
  }

  dispose() {}
}

// ─── SingleDistord ───────────────────────────────────────────────────────────
export class SingleDistord extends Effect {
  name = "SingleDistord"
  params = { scale: 0.7 }

  mount(canvasTexture: CanvasTexture) {
    const gl = this.renderer.gl
    this.canvasTexture = canvasTexture
    this.mesh = new Mesh(
      this.geometry,
      new Program(gl, VERTEX_SHADER, SINGLE_DISTORD_FS, {
        Texture: { value: canvasTexture },
        Color: { value: [1, 1, 1] as [number, number, number] },
        Background: { value: [0, 0, 0] as [number, number, number] },
        Size: { value: new Vec2(this.renderer.width, this.renderer.height) },
        SizeImage: { value: new Vec2(canvasTexture.width, canvasTexture.height) },
        Time: { value: 0 },
        Scale: { value: this.params.scale },
        BarrelStrength: { value: -1.4 },
        DistortStrength: { value: 1 },
      })
    )
  }

  tick(time: number) {
    if (!this.mesh || !this.canvasTexture) return
    this.mesh.uniforms.Time.value = time * 0.001
    this.mesh.uniforms.Size.value = new Vec2(this.renderer.width, this.renderer.height)
    this.mesh.uniforms.Texture.value = this.canvasTexture
    this.mesh.uniforms.SizeImage.value = new Vec2(this.canvasTexture.width, this.canvasTexture.height)
  }

  getParams() {
    return { scale: { value: this.params.scale, min: 0.1, max: 1.0, step: 0.001 } }
  }
  setParam(key: string, val: number) {
    if (key === "scale") {
      this.params.scale = val
      if (this.mesh) this.mesh.uniforms.Scale.value = val
    }
  }
}

// ─── Grid ────────────────────────────────────────────────────────────────────
export class Grid extends Effect {
  name = "Grid"
  params = { scale: 0.8, repeatX: 5, repeatY: 5 }

  mount(canvasTexture: CanvasTexture) {
    const gl = this.renderer.gl
    this.canvasTexture = canvasTexture
    this.mesh = new Mesh(
      this.geometry,
      new Program(gl, VERTEX_SHADER, GRID_FS, {
        Texture: { value: canvasTexture },
        Color: { value: [0.87, 0, 0.004] as [number, number, number] },
        Background: { value: [0, 0, 0] as [number, number, number] },
        Size: { value: new Vec2(this.renderer.width, this.renderer.height) },
        SizeImage: { value: new Vec2(canvasTexture.width, canvasTexture.height) },
        Repeat: { value: new Vec2(this.params.repeatX, this.params.repeatY) },
        Time: { value: 0 },
        Scale: { value: this.params.scale },
        BarrelStrength: { value: 2.1 },
        DistortStrength: { value: 1 },
      })
    )
  }

  tick(time: number) {
    if (!this.mesh || !this.canvasTexture) return
    this.mesh.uniforms.Time.value = time * 0.001
    this.mesh.uniforms.Size.value = new Vec2(this.renderer.width, this.renderer.height)
    this.mesh.uniforms.Texture.value = this.canvasTexture
    this.mesh.uniforms.SizeImage.value = new Vec2(this.canvasTexture.width, this.canvasTexture.height)
  }

  getParams() {
    return {
      scale: { value: this.params.scale, min: 0.1, max: 1.0, step: 0.001 },
      repeatX: { value: this.params.repeatX, min: 1, max: 20, step: 1 },
      repeatY: { value: this.params.repeatY, min: 1, max: 20, step: 1 },
    }
  }
  setParam(key: string, val: number) {
    if (key === "scale") {
      this.params.scale = val
      if (this.mesh) this.mesh.uniforms.Scale.value = val
    }
    if (key === "repeatX") {
      this.params.repeatX = val
      if (this.mesh) this.mesh.uniforms.Repeat.value = new Vec2(val, this.params.repeatY)
    }
    if (key === "repeatY") {
      this.params.repeatY = val
      if (this.mesh) this.mesh.uniforms.Repeat.value = new Vec2(this.params.repeatX, val)
    }
  }
}

// ─── RepeatOverlap ───────────────────────────────────────────────────────────
export class RepeatOverlap extends Effect {
  name = "RepeatOverlap"
  params = {
    timeSpeed: 0.01,
    layerScaleMin: 0.01,
    layerScaleMax: 1.99,
    baseOffsetX: -1,
    baseOffsetY: -0.1,
    offsetSinusX: 1,
    offsetSinusY: 2,
  }

  static presets: Record<string, typeof RepeatOverlap.prototype.params> = {
    "bottom to top": {
      timeSpeed: 0.01, layerScaleMin: 0.01, layerScaleMax: 1.99,
      baseOffsetX: -1, baseOffsetY: -0.1, offsetSinusX: 1, offsetSinusY: 2,
    },
    "right to left": {
      timeSpeed: 0.104, layerScaleMin: 0.08, layerScaleMax: 1.6,
      baseOffsetX: -0.86, baseOffsetY: -0.69, offsetSinusX: 1, offsetSinusY: 2,
    },
    center: {
      timeSpeed: 0.04, layerScaleMin: 0.001, layerScaleMax: 3.6,
      baseOffsetX: 0, baseOffsetY: -0.45, offsetSinusX: 0, offsetSinusY: Math.PI * 0.5,
    },
    zoom: {
      timeSpeed: 0.04, layerScaleMin: 25, layerScaleMax: 0.01,
      baseOffsetX: 0, baseOffsetY: 0, offsetSinusX: 0, offsetSinusY: 0,
    },
  }

  mount(canvasTexture: CanvasTexture) {
    const gl = this.renderer.gl
    this.canvasTexture = canvasTexture
    this.mesh = new Mesh(
      this.geometry,
      new Program(gl, VERTEX_SHADER, REPEAT_OVERLAP_FS, {
        Texture: { value: canvasTexture },
        Color: { value: [0, 0, 0] as [number, number, number] },
        Background: { value: [0.87, 0, 0.004] as [number, number, number] },
        Size: { value: new Vec2(this.renderer.width, this.renderer.height) },
        SizeImage: { value: new Vec2(canvasTexture.width, canvasTexture.height) },
        Time: { value: 0 },
        Scale: { value: 1.5 },
        TimeSpeed: { value: this.params.timeSpeed },
        LayerScale: { value: new Vec2(this.params.layerScaleMin, this.params.layerScaleMax) },
        BaseOffset: { value: new Vec2(this.params.baseOffsetX, this.params.baseOffsetY) },
        OffsetSinus: { value: new Vec2(this.params.offsetSinusX, this.params.offsetSinusY) },
      })
    )
  }

  tick(time: number) {
    if (!this.mesh || !this.canvasTexture) return
    this.mesh.uniforms.Time.value = time * 0.001
    this.mesh.uniforms.Size.value = new Vec2(this.renderer.width, this.renderer.height)
    this.mesh.uniforms.Texture.value = this.canvasTexture
    this.mesh.uniforms.SizeImage.value = new Vec2(this.canvasTexture.width, this.canvasTexture.height)
  }

  applyPreset(name: string) {
    const p = RepeatOverlap.presets[name]
    if (!p) return
    Object.assign(this.params, p)
    if (this.mesh) {
      this.mesh.uniforms.TimeSpeed.value = p.timeSpeed
      this.mesh.uniforms.LayerScale.value = new Vec2(p.layerScaleMin, p.layerScaleMax)
      this.mesh.uniforms.BaseOffset.value = new Vec2(p.baseOffsetX, p.baseOffsetY)
      this.mesh.uniforms.OffsetSinus.value = new Vec2(p.offsetSinusX, p.offsetSinusY)
    }
  }

  getParams() {
    return {
      timeSpeed: { value: this.params.timeSpeed, min: 0, max: 0.2, step: 0.001 },
      layerScaleMin: { value: this.params.layerScaleMin, min: 0.01, max: 25, step: 0.01 },
      layerScaleMax: { value: this.params.layerScaleMax, min: 0.01, max: 25, step: 0.01 },
      baseOffsetX: { value: this.params.baseOffsetX, min: -1, max: 2, step: 0.01 },
      baseOffsetY: { value: this.params.baseOffsetY, min: -1, max: 2, step: 0.01 },
      offsetSinusX: { value: this.params.offsetSinusX, min: -20, max: 20, step: 0.01 },
      offsetSinusY: { value: this.params.offsetSinusY, min: -20, max: 20, step: 0.01 },
    }
  }
  setParam(key: string, val: number) {
    const k = key as keyof typeof this.params
    ;(this.params as any)[k] = val
    if (!this.mesh) return
    if (key === "timeSpeed") this.mesh.uniforms.TimeSpeed.value = val
    if (key === "layerScaleMin" || key === "layerScaleMax")
      this.mesh.uniforms.LayerScale.value = new Vec2(this.params.layerScaleMin, this.params.layerScaleMax)
    if (key === "baseOffsetX" || key === "baseOffsetY")
      this.mesh.uniforms.BaseOffset.value = new Vec2(this.params.baseOffsetX, this.params.baseOffsetY)
    if (key === "offsetSinusX" || key === "offsetSinusY")
      this.mesh.uniforms.OffsetSinus.value = new Vec2(this.params.offsetSinusX, this.params.offsetSinusY)
  }
}

// ─── MetaLogo ────────────────────────────────────────────────────────────────
export class MetaLogo extends Effect {
  name = "MetaLogo"
  params = { strength: 39, size: 20, lerpStrength: 0.4 }

  mouse = new Vec2()
  prevMouse = new Vec2()
  canvasTexture2: CanvasTexture | null = null

  onMouseMove: ((x: number, y: number) => void) | null = null

  setTexture2(tex: CanvasTexture) {
    this.canvasTexture2 = tex
    if (this.mesh) this.mesh.uniforms.Texture2.value = tex
  }

  mount(canvasTexture: CanvasTexture) {
    const gl = this.renderer.gl
    this.canvasTexture = canvasTexture
    this.mesh = new Mesh(
      this.geometry,
      new Program(gl, VERTEX_SHADER, META_LOGO_FS, {
        Texture1: { value: canvasTexture },
        Texture2: { value: this.canvasTexture2 || canvasTexture },
        Color: { value: [1, 1, 1] as [number, number, number] },
        Background: { value: [0, 0, 0] as [number, number, number] },
        Size: { value: new Vec2(this.renderer.width, this.renderer.height) },
        SizeImage: { value: new Vec2(canvasTexture.width, canvasTexture.height) },
        Scale: { value: 1 },
        Time: { value: 0 },
        Mouse: { value: this.prevMouse },
        Strength: { value: this.params.strength },
        Size2: { value: this.params.size },
      })
    )

    // MetaLogo declares both "uniform vec2 size" and "uniform float uSize".
    // The resolver tries uSize first for key "Size", finds the float — wrong.
    // Override both locations manually.
    if (this.mesh.program.program) {
      const sizeFloatLoc = gl.getUniformLocation(this.mesh.program.program, "uSize")
      if (sizeFloatLoc) {
        this.mesh.program.uniformLocations["Size2"] = sizeFloatLoc
      }
      const sizeVec2Loc = gl.getUniformLocation(this.mesh.program.program, "size")
      if (sizeVec2Loc) {
        this.mesh.program.uniformLocations["Size"] = sizeVec2Loc
      }
    }

    this.onMouseMove = (x: number, y: number) => {
      this.mouse.set(x, y)
    }
  }

  tick(time: number, delta: number) {
    if (!this.mesh || !this.canvasTexture) return
    const ds = delta / 1000

    this.prevMouse.x = elerp(this.prevMouse.x, this.mouse.x, this.params.lerpStrength, ds)
    this.prevMouse.y = elerp(this.prevMouse.y, this.mouse.y, this.params.lerpStrength, ds)

    this.mesh.uniforms.Mouse.value = this.prevMouse
    this.mesh.uniforms.Time.value = time * 0.001
    this.mesh.uniforms.Size.value = new Vec2(this.renderer.width, this.renderer.height)
    this.mesh.uniforms.Strength.value = this.params.strength
    this.mesh.uniforms.Size2.value = this.params.size
    this.mesh.uniforms.Texture1.value = this.canvasTexture
    this.mesh.uniforms.Texture2.value = this.canvasTexture2 || this.canvasTexture
    this.mesh.uniforms.SizeImage.value = new Vec2(this.canvasTexture.width, this.canvasTexture.height)
  }

  getParams() {
    return {
      strength: { value: this.params.strength, min: 1, max: 49, step: 1 },
      size: { value: this.params.size, min: 1, max: 25, step: 0.01 },
      lerpStrength: { value: this.params.lerpStrength, min: 0, max: 1, step: 0.001 },
    }
  }
  setParam(key: string, val: number) {
    ;(this.params as any)[key] = val
  }
}

// ─── DoubleLogo ──────────────────────────────────────────────────────────────
export class DoubleLogo extends Effect {
  name = "DoubleLogo"
  params = { lerpStrength: 0.4 }

  mouse = new Vec2()
  prevMouse = new Vec2()
  strength = 0
  prevStrength = 0
  posStrength = 0
  prevPosStrength = 0
  strengthTimeout: ReturnType<typeof setTimeout> | null = null
  posStrengthTimeout: ReturnType<typeof setTimeout> | null = null

  onMouseMove: ((x: number, y: number) => void) | null = null

  mount(canvasTexture: CanvasTexture) {
    const gl = this.renderer.gl
    this.canvasTexture = canvasTexture
    this.mesh = new Mesh(
      this.geometry,
      new Program(gl, VERTEX_SHADER, DOUBLE_LOGO_FS, {
        Texture: { value: canvasTexture },
        Color: { value: [1, 1, 1] as [number, number, number] },
        Background: { value: [0, 0, 0] as [number, number, number] },
        Size: { value: new Vec2(this.renderer.width, this.renderer.height) },
        SizeImage: { value: new Vec2(canvasTexture.width, canvasTexture.height) },
        Scale: { value: 0.7 },
        Time: { value: 0 },
        Mouse: { value: this.prevMouse },
        Strength: { value: 0 },
        PosStrength: { value: 0 },
      })
    )

    this.onMouseMove = (x: number, y: number) => {
      this.mouse.set(x, y)
      this.strength = 1
      this.posStrength = 1
      if (this.strengthTimeout) clearTimeout(this.strengthTimeout)
      if (this.posStrengthTimeout) clearTimeout(this.posStrengthTimeout)
      this.strengthTimeout = setTimeout(() => { this.strength = 0 }, 2000)
      this.posStrengthTimeout = setTimeout(() => { this.posStrength = 0 }, 1000)
    }
  }

  tick(time: number, delta: number) {
    if (!this.mesh || !this.canvasTexture) return
    const ds = delta / 1000

    this.prevMouse.x = elerp(this.prevMouse.x, this.mouse.x, this.params.lerpStrength, ds)
    this.prevMouse.y = elerp(this.prevMouse.y, this.mouse.y, this.params.lerpStrength, ds)
    this.prevStrength = elerp(this.prevStrength, this.strength, this.params.lerpStrength, ds)
    this.prevPosStrength = elerp(this.prevPosStrength, this.posStrength, this.params.lerpStrength, ds)

    this.mesh.uniforms.Mouse.value = this.prevMouse
    this.mesh.uniforms.Strength.value = this.prevStrength
    this.mesh.uniforms.PosStrength.value = this.prevPosStrength
    this.mesh.uniforms.Time.value = time * 0.001
    this.mesh.uniforms.Size.value = new Vec2(this.renderer.width, this.renderer.height)
    this.mesh.uniforms.Texture.value = this.canvasTexture
    this.mesh.uniforms.SizeImage.value = new Vec2(this.canvasTexture.width, this.canvasTexture.height)
  }

  getParams() {
    return {
      lerpStrength: { value: this.params.lerpStrength, min: 0, max: 1, step: 0.001 },
    }
  }
  setParam(key: string, val: number) {
    ;(this.params as any)[key] = val
  }

  dispose() {
    if (this.strengthTimeout) clearTimeout(this.strengthTimeout)
    if (this.posStrengthTimeout) clearTimeout(this.posStrengthTimeout)
  }
}

// ─── MouseGrid ───────────────────────────────────────────────────────────────
export class MouseGrid extends Effect {
  name = "MouseGrid"
  params = { gridSize: 30, mouseRadius: 0.3, dissipation: 0.88 }
  flowmap: Flowmap | null = null

  mouse = new Vec2(-1, -1)
  lastMouse = new Vec2(-1, -1)
  velocity = new Vec2()
  velocityNeedsUpdate = false
  lastMouseTime = 0

  onMouseMove: ((x: number, y: number, screenX: number, screenY: number) => void) | null = null

  mount(canvasTexture: CanvasTexture) {
    const gl = this.renderer.gl
    this.canvasTexture = canvasTexture
    this.flowmap = new Flowmap(this.renderer)
    this.flowmap.dissipation = this.params.dissipation
    this.flowmap.falloff = this.params.mouseRadius

    this.mesh = new Mesh(
      this.geometry,
      new Program(gl, VERTEX_SHADER, MOUSE_GRID_FS, {
        Texture: { value: canvasTexture },
        Flow: { value: this.flowmap.flowTexture as any },
        Color: { value: [1, 1, 1] as [number, number, number] },
        Background: { value: [0, 0, 0] as [number, number, number] },
        SizeImage: { value: new Vec2(canvasTexture.width, canvasTexture.height) },
        Resolution: { value: new Vec2(this.renderer.width, this.renderer.height) },
        Time: { value: 0 },
        Size: { value: new Vec2(this.renderer.width, this.renderer.height) },
        GridSize: { value: this.params.gridSize },
        Mouse: { value: this.mouse },
        Scale: { value: 0.7 },
      })
    )

    // fix tFlow uniform location
    if (this.mesh.program.program) {
      const flowLoc = gl.getUniformLocation(this.mesh.program.program, "tFlow")
      if (flowLoc) this.mesh.program.uniformLocations["Flow"] = flowLoc
    }

    this.onMouseMove = (x: number, y: number, screenX: number, screenY: number) => {
      this.mouse.set(x, y)
      const now = performance.now()
      const dt = Math.max(now - this.lastMouseTime, 1)
      this.velocity.x = (screenX - this.lastMouse.x) / dt
      this.velocity.y = (screenY - this.lastMouse.y) / dt
      this.lastMouse.set(screenX, screenY)
      this.lastMouseTime = now
      this.velocityNeedsUpdate = true
    }
  }

  tick(time: number) {
    if (!this.mesh || !this.flowmap || !this.canvasTexture) return

    if (!this.velocityNeedsUpdate) {
      this.flowmap.mouse.set(-1, -1)
      this.flowmap.velocity.set(0, 0)
    }
    this.velocityNeedsUpdate = false

    this.flowmap.mouse.copy(this.mouse)
    const lerpAmt = this.velocity.x !== 0 || this.velocity.y !== 0 ? 0.5 : 0.1
    this.flowmap.velocity.x += (this.velocity.x - this.flowmap.velocity.x) * lerpAmt
    this.flowmap.velocity.y += (this.velocity.y - this.flowmap.velocity.y) * lerpAmt
    this.flowmap.update()

    this.mesh.uniforms.Time.value = time * 0.001
    this.mesh.uniforms.Size.value = new Vec2(this.renderer.width, this.renderer.height)
    this.mesh.uniforms.Resolution.value = new Vec2(this.renderer.width, this.renderer.height)
    this.mesh.uniforms.Mouse.value = this.mouse
    this.mesh.uniforms.GridSize.value = this.params.gridSize
    this.mesh.uniforms.Texture.value = this.canvasTexture
    this.mesh.uniforms.SizeImage.value = new Vec2(this.canvasTexture.width, this.canvasTexture.height)
    if (this.flowmap.flowTexture.texture) {
      this.mesh.uniforms.Flow.value = this.flowmap.flowTexture as any
    }
  }

  getParams() {
    return {
      gridSize: { value: this.params.gridSize, min: 0, max: 50, step: 1 },
      mouseRadius: { value: this.params.mouseRadius, min: 0, max: 0.5, step: 0.001 },
      dissipation: { value: this.params.dissipation, min: 0.01, max: 0.99, step: 0.01 },
    }
  }
  setParam(key: string, val: number) {
    ;(this.params as any)[key] = val
    if (key === "dissipation" && this.flowmap) this.flowmap.dissipation = val
    if (key === "mouseRadius" && this.flowmap) this.flowmap.falloff = val
  }
}

// ─── Registry ────────────────────────────────────────────────────────────────
export const EFFECT_ORDER = [
  "DoubleLogo",
  "RepeatOverlap",
  "Grid",
  "SingleDistord",
  "MetaLogo",
  "MouseGrid",
]

export function createEffect(name: string, renderer: Renderer): Effect {
  switch (name) {
    case "DoubleLogo":     return new DoubleLogo(renderer)
    case "RepeatOverlap":  return new RepeatOverlap(renderer)
    case "Grid":           return new Grid(renderer)
    case "SingleDistord":  return new SingleDistord(renderer)
    case "MetaLogo":       return new MetaLogo(renderer)
    case "MouseGrid":      return new MouseGrid(renderer)
    default:               return new DoubleLogo(renderer)
  }
}
