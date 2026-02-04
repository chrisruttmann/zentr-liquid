// Ping-pong flowmap — renders mouse velocity into a texture each frame
import {
  Renderer,
  Geometry,
  createFullScreenTriangle,
  Program,
  Vec2,
  Texture,
} from "./renderer"
import { FLOWMAP_VS, FLOWMAP_FS } from "./shaders"

export class Flowmap {
  gl: WebGL2RenderingContext
  renderer: Renderer
  geometry: Geometry

  size = 32
  falloff = 0.3
  dissipation = 0.88
  alpha = 1

  mouse = new Vec2()
  velocity = new Vec2()

  // ping-pong framebuffers
  fbA: WebGLFramebuffer | null = null
  fbB: WebGLFramebuffer | null = null
  texA: WebGLTexture | null = null
  texB: WebGLTexture | null = null
  current = 0 // 0 = A is target, B is source; 1 = vice versa

  program: Program | null = null

  // expose the "read" texture as a fake Texture object so Program.bind can use it
  flowTexture: { texture: WebGLTexture | null } = { texture: null }

  constructor(renderer: Renderer) {
    this.renderer = renderer
    this.gl = renderer.gl
    this.geometry = createFullScreenTriangle()
    this.geometry.upload(this.gl)
    this.init()
  }

  private init() {
    const gl = this.gl
    const size = this.size

    // create two framebuffers + textures
    const create = () => {
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.HALF_FLOAT, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindTexture(gl.TEXTURE_2D, null)

      const fb = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return { tex, fb }
    }

    const a = create()
    const b = create()
    this.texA = a.tex
    this.fbA = a.fb
    this.texB = b.tex
    this.fbB = b.fb

    // compile flowmap shader
    // We build uniforms manually since we need the tMap to point to the "other" framebuffer
    this.program = new Program(gl, FLOWMAP_VS, FLOWMAP_FS, {
      tMap: { value: 0 as any }, // placeholder — set manually
      uFalloff: { value: this.falloff },
      uAlpha: { value: this.alpha },
      uDissipation: { value: this.dissipation },
      uAspect: { value: 1 },
      uMouse: { value: this.mouse },
      uVelocity: { value: this.velocity },
    })
  }

  // returns the texture that should be READ (the one we just wrote to last frame)
  getReadTexture(): WebGLTexture | null {
    return this.current === 0 ? this.texB : this.texA
  }

  update() {
    const gl = this.gl
    if (!this.program?.program) return

    const aspect = this.renderer.width / this.renderer.height

    // target = write to, source = read from
    const targetFb = this.current === 0 ? this.fbA : this.fbB
    const sourceTex = this.current === 0 ? this.texB : this.texA

    // update uniform values
    this.program.uniforms.uFalloff.value = this.falloff
    this.program.uniforms.uDissipation.value = this.dissipation
    this.program.uniforms.uAspect.value = aspect
    this.program.uniforms.uMouse.value = this.mouse
    this.program.uniforms.uVelocity.value = this.velocity

    // bind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFb)
    gl.viewport(0, 0, this.size, this.size)

    // bind program
    gl.useProgram(this.program.program)

    // manually bind geometry
    for (const [name, loc] of Object.entries(this.program.attribLocations)) {
      if (loc < 0) continue
      const buf = this.geometry.buffers[name]
      if (!buf) continue
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, this.geometry.attributes[name].size, gl.FLOAT, false, 0, 0)
    }

    // manually bind uniforms
    const p = this.program.program
    const tMapLoc = gl.getUniformLocation(p, "tMap")
    if (tMapLoc) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, sourceTex)
      gl.uniform1i(tMapLoc, 0)
    }

    const falloffLoc = gl.getUniformLocation(p, "uFalloff")
    if (falloffLoc) gl.uniform1f(falloffLoc, this.falloff)

    const alphaLoc = gl.getUniformLocation(p, "uAlpha")
    if (alphaLoc) gl.uniform1f(alphaLoc, this.alpha)

    const dissLoc = gl.getUniformLocation(p, "uDissipation")
    if (dissLoc) gl.uniform1f(dissLoc, this.dissipation)

    const aspectLoc = gl.getUniformLocation(p, "uAspect")
    if (aspectLoc) gl.uniform1f(aspectLoc, aspect)

    const mouseLoc = gl.getUniformLocation(p, "uMouse")
    if (mouseLoc) gl.uniform2f(mouseLoc, this.mouse.x, this.mouse.y)

    const velLoc = gl.getUniformLocation(p, "uVelocity")
    if (velLoc) gl.uniform2f(velLoc, this.velocity.x, this.velocity.y)

    // draw
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // restore
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.renderer.width, this.renderer.height)

    // swap
    this.current = this.current === 0 ? 1 : 0

    // update the exposed texture pointer
    this.flowTexture.texture = this.getReadTexture()
  }
}
