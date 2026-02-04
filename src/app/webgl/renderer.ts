// Minimal WebGL2 renderer — mirrors the 27b architecture exactly

export class Vec2 {
  x: number
  y: number
  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
  }
  set(x: number, y: number) {
    this.x = x
    this.y = y
    return this
  }
  copy(v: Vec2) {
    this.x = v.x
    this.y = v.y
    return this
  }
}

// ─── Geometry ────────────────────────────────────────────────────────────────
// Single full-screen triangle (3 verts covers the quad)
export class Geometry {
  attributes: Record<string, { size: number; data: Float32Array }>
  buffers: Record<string, WebGLBuffer | null> = {}

  constructor(
    attributes: Record<string, { size: number; data: Float32Array }>
  ) {
    this.attributes = attributes
  }

  upload(gl: WebGL2RenderingContext) {
    for (const key of Object.keys(this.attributes)) {
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, this.attributes[key].data, gl.STATIC_DRAW)
      this.buffers[key] = buf
    }
  }
}

export function createFullScreenTriangle(): Geometry {
  return new Geometry({
    position: {
      size: 2,
      data: new Float32Array([-1, -1, 3, -1, -1, 3]),
    },
    uv: {
      size: 2,
      data: new Float32Array([0, 0, 2, 0, 0, 2]),
    },
  })
}

// ─── Texture ─────────────────────────────────────────────────────────────────
export class Texture {
  gl: WebGL2RenderingContext
  texture: WebGLTexture | null = null
  image: HTMLImageElement | null = null
  loaded = false

  constructor(gl: WebGL2RenderingContext, src: string) {
    this.gl = gl
    this.texture = gl.createTexture()
    this.image = new Image()
    this.image.onload = () => {
      this.upload()
      this.loaded = true
    }
    this.image.src = src
  }

  upload() {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.image!
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }
}

// ─── Program ─────────────────────────────────────────────────────────────────
export interface UniformDef {
  value: number | Vec2 | Texture | [number, number, number]
}
export type Uniforms = Record<string, UniformDef>

export class Program {
  gl: WebGL2RenderingContext
  program: WebGLProgram | null = null
  uniforms: Uniforms
  attribLocations: Record<string, number> = {}
  uniformLocations: Record<string, WebGLUniformLocation | null> = {}

  constructor(
    gl: WebGL2RenderingContext,
    vs: string,
    fs: string,
    uniforms: Uniforms
  ) {
    this.gl = gl
    this.uniforms = uniforms
    this.program = this.compile(vs, fs)
    if (this.program) this.resolveLocations()
  }

  private compile(vs: string, fs: string): WebGLProgram | null {
    const gl = this.gl
    const v = this.shader(gl.VERTEX_SHADER, vs)
    const f = this.shader(gl.FRAGMENT_SHADER, fs)
    if (!v || !f) return null
    const p = gl.createProgram()
    if (!p) return null
    gl.attachShader(p, v)
    gl.attachShader(p, f)
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error("Link error:", gl.getProgramInfoLog(p))
      return null
    }
    gl.deleteShader(v)
    gl.deleteShader(f)
    return p
  }

  private shader(type: number, src: string): WebGLShader | null {
    const gl = this.gl
    const s = gl.createShader(type)
    if (!s) return null
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("Shader error:", gl.getShaderInfoLog(s))
      gl.deleteShader(s)
      return null
    }
    return s
  }

  private resolveLocations() {
    const gl = this.gl
    const p = this.program!
    // attribs
    for (const name of ["position", "uv"]) {
      this.attribLocations[name] = gl.getAttribLocation(p, name)
    }
    // uniforms
    for (const name of Object.keys(this.uniforms)) {
      this.uniformLocations[name] = gl.getUniformLocation(p, `u${name.charAt(0).toUpperCase()}${name.slice(1)}`)
      // also try exact name
      if (!this.uniformLocations[name]) {
        this.uniformLocations[name] = gl.getUniformLocation(p, name)
      }
    }
  }

  bind(gl: WebGL2RenderingContext, geom: Geometry, textureUnit = 0) {
    if (!this.program) return
    gl.useProgram(this.program)

    // bind geometry
    for (const [name, loc] of Object.entries(this.attribLocations)) {
      if (loc < 0) continue
      const buf = geom.buffers[name]
      if (!buf) continue
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, geom.attributes[name].size, gl.FLOAT, false, 0, 0)
    }

    // bind uniforms
    let texUnit = textureUnit
    for (const [name, def] of Object.entries(this.uniforms)) {
      const loc = this.uniformLocations[name]
      if (!loc) continue
      const v = def.value
      if (typeof v === "number") {
        gl.uniform1f(loc, v)
      } else if (v instanceof Vec2) {
        gl.uniform2f(loc, v.x, v.y)
      } else if (v instanceof Texture) {
        gl.activeTexture(gl.TEXTURE0 + texUnit)
        gl.bindTexture(gl.TEXTURE_2D, v.texture)
        gl.uniform1i(loc, texUnit)
        texUnit++
      } else if (Array.isArray(v)) {
        gl.uniform3f(loc, v[0], v[1], v[2])
      }
    }
  }
}

// ─── Mesh ────────────────────────────────────────────────────────────────────
export class Mesh {
  geometry: Geometry
  program: Program
  uniforms: Uniforms

  constructor(geometry: Geometry, program: Program) {
    this.geometry = geometry
    this.program = program
    this.uniforms = program.uniforms
  }
}

// ─── Renderer ────────────────────────────────────────────────────────────────
export class Renderer {
  gl: WebGL2RenderingContext
  canvas: HTMLCanvasElement
  width = 0
  height = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    })
    if (!gl) throw new Error("WebGL2 not supported")
    this.gl = gl
    this.resize()
  }

  clearColor(r: number, g: number, b: number, a: number) {
    this.gl.clearColor(r, g, b, a)
  }

  resize() {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.parentElement?.getBoundingClientRect()
    this.width = (rect?.width || window.innerWidth) * dpr
    this.height = (rect?.height || window.innerHeight) * dpr
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.canvas.style.width = `${this.width / dpr}px`
    this.canvas.style.height = `${this.height / dpr}px`
    this.gl.viewport(0, 0, this.width, this.height)
  }

  render(mesh: Mesh) {
    const gl = this.gl
    gl.clear(gl.COLOR_BUFFER_BIT)
    mesh.program.bind(gl, mesh.geometry)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}
