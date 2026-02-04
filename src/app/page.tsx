"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Renderer, CanvasTexture } from "./webgl/renderer"
import { Effect, createEffect, EFFECT_ORDER, RepeatOverlap, MetaLogo, DoubleLogo, MouseGrid } from "./webgl/effects"

// ─── Panel styles ─────────────────────────────────────────────────────────────
const PANEL_CSS = `
.panel {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 200px;
  background: rgba(20,20,20,0.88);
  backdrop-filter: blur(12px);
  border-radius: 10px;
  color: #aaa;
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: 11px;
  line-height: 1.5;
  z-index: 100;
  user-select: none;
  box-shadow: 0 4px 32px rgba(0,0,0,0.5);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel-row label {
  width: 36px;
  flex-shrink: 0;
  color: #666;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.panel-row .val {
  width: 34px;
  text-align: right;
  flex-shrink: 0;
  color: #fff;
  font-variant-numeric: tabular-nums;
  font-size: 10px;
}
.panel-row input[type=range] {
  flex: 1;
  -webkit-appearance: none;
  height: 2px;
  background: rgba(255,255,255,0.15);
  border-radius: 1px;
  outline: none;
}
.panel-row input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
}
.panel-select {
  flex: 1;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 5px;
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  padding: 4px 6px;
  cursor: pointer;
  outline: none;
}
.panel-select option { background: #1a1a1a; color: #fff; }
.panel-input {
  flex: 1;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 5px;
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  padding: 4px 6px;
  outline: none;
}
.panel-divider {
  height: 1px;
  background: rgba(255,255,255,0.07);
}
.panel-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.panel-top .fps {
  color: #555;
  font-size: 10px;
}
.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-top: 2px;
}
.preset-btn {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  color: #777;
  font-family: inherit;
  font-size: 10px;
  padding: 3px 4px;
  cursor: pointer;
  text-align: center;
}
.preset-btn:hover { background: rgba(255,255,255,0.14); color: #fff; border-color: rgba(255,255,255,0.2); }
`

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const effectRef = useRef<Effect | null>(null)
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef(0)
  const canvasTextureRef = useRef<CanvasTexture | null>(null)
  const canvasTextureBlurRef = useRef<CanvasTexture | null>(null)
  const textColorRef = useRef("#ffffff")
  const bgColorRef = useRef("#000000")

  const [effectName, setEffectName] = useState(() => {
    if (typeof window === "undefined") return "MetaLogo"
    const params = new URLSearchParams(window.location.search)
    const raw = params.get("name")
    if (raw) {
      try { return JSON.parse(decodeURI(raw)) } catch { return raw }
    }
    return "MetaLogo"
  })

  const [params, setParams] = useState<Record<string, { value: number; min: number; max: number; step?: number }>>({})
  const [fps, setFps] = useState(60)
  const fpsFrames = useRef(0)
  const fpsStart = useRef(performance.now())

  // ─── brand / text overlay state ──────────────────────────────────────────
  const [text, setText] = useState("ZENTR")
  const [bgColor, setBgColor] = useState("#000000")
  const [textColor, setTextColor] = useState("#ffffff")
  const [font, setFont] = useState("Inter")

  const FONTS = [
    "Inter", "Geist", "Arial Black", "Impact",
    "Bebas Neue", "Oswald", "Rajdhani", "Barlow Condensed",
    "Montserrat", "Roboto Condensed", "Anton", "Fugaz One",
  ]

  // load Google Font dynamically when font changes
  useEffect(() => {
    if (typeof document === "undefined") return
    const safe = ["Arial Black", "Impact"] // system fonts, no fetch needed
    if (safe.includes(font)) return
    const id = `gf-${font.replace(/\s+/g, "-")}`
    if (document.getElementById(id)) return
    const link = document.createElement("link")
    link.id = id
    link.rel = "stylesheet"
    link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/\s+/g, "+")}:wght@700;900&display=swap`
    document.head.appendChild(link)
  }, [font])

  // keep color refs in sync so mountEffect closure always has current values
  useEffect(() => { textColorRef.current = textColor }, [textColor])
  useEffect(() => { bgColorRef.current = bgColor }, [bgColor])

  // ─── mount effect ──────────────────────────────────────────────────────────
  const mountEffect = useCallback((name: string) => {
    if (!rendererRef.current || !canvasTextureRef.current) return
    if (effectRef.current) effectRef.current.dispose()
    const e = createEffect(name, rendererRef.current)
    e.mount(canvasTextureRef.current)
    if (e instanceof MetaLogo && canvasTextureBlurRef.current) {
      e.setTexture2(canvasTextureBlurRef.current)
    }
    e.setColors(hexToRgb(textColorRef.current), hexToRgb(bgColorRef.current))
    effectRef.current = e
    setParams(e.getParams())
  }, [])

  // ─── mouse ─────────────────────────────────────────────────────────────────
  const handleMouse = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current
    const effect = effectRef.current
    if (!canvas || !effect) return

    const rect = canvas.getBoundingClientRect()
    let clientX: number, clientY: number
    if ("touches" in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    const dpr = window.devicePixelRatio || 1
    const cssX = clientX - rect.left
    const cssY = clientY - rect.top
    // physical pixels, Y flipped for WebGL (Y=0 at bottom)
    const physX = cssX * dpr
    const physY = (rect.height - cssY) * dpr

    if ("onMouseMove" in effect && (effect as any).onMouseMove) {
      if (effect instanceof MouseGrid) {
        // MouseGrid flowmap expects normalised 0-1, Y=0 at top
        ;(effect as MouseGrid).onMouseMove!(
          cssX / rect.width,
          cssY / rect.height,
          clientX,
          clientY
        )
      } else {
        // MetaLogo / DoubleLogo expect physical pixels, Y=0 at bottom
        ;(effect as any).onMouseMove!(physX, physY)
      }
    }
  }, [])

  // ─── RAF loop ──────────────────────────────────────────────────────────────
  const loop = useCallback((time: number) => {
    const renderer = rendererRef.current
    const effect = effectRef.current
    if (!renderer || !effect?.mesh) {
      rafRef.current = requestAnimationFrame(loop)
      return
    }

    const delta = time - lastTimeRef.current
    lastTimeRef.current = time

    // FPS
    fpsFrames.current++
    const elapsed = time - fpsStart.current
    if (elapsed >= 500) {
      setFps(Math.round(fpsFrames.current / (elapsed / 1000)))
      fpsFrames.current = 0
      fpsStart.current = time
    }

    effect.tick(time, delta)
    renderer.render(effect.mesh)
    rafRef.current = requestAnimationFrame(loop)
  }, [])

  // ─── init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // inject panel CSS
    const style = document.createElement("style")
    style.textContent = PANEL_CSS
    document.head.appendChild(style)

    const renderer = new Renderer(canvas)
    renderer.clearColor(0, 0, 0, 1)
    rendererRef.current = renderer

    const canvasTex = new CanvasTexture(renderer.gl)
    canvasTextureRef.current = canvasTex
    canvasTex.update("ZENTR", "Inter")

    const canvasTexBlur = new CanvasTexture(renderer.gl)
    canvasTextureBlurRef.current = canvasTexBlur
    canvasTexBlur.update("ZENTR", "Inter", 12)

    mountEffect(effectName)
    rafRef.current = requestAnimationFrame(loop)

    const onResize = () => renderer.resize()
    window.addEventListener("resize", onResize)
    window.addEventListener("mousemove", handleMouse, { passive: true })
    window.addEventListener("touchmove", handleMouse, { passive: true })

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("mousemove", handleMouse)
      window.removeEventListener("touchmove", handleMouse)
      document.head.removeChild(style)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── swap effect when dropdown changes ─────────────────────────────────────
  useEffect(() => {
    mountEffect(effectName)
    // update URL
    const url = new URL(window.location.href)
    url.searchParams.set("name", encodeURI(JSON.stringify(effectName)))
    window.history.replaceState(null, "", url.toString())
  }, [effectName, mountEffect])

  // re-render canvas textures when text or font changes
  useEffect(() => {
    if (canvasTextureRef.current) canvasTextureRef.current.update(text, font)
    if (canvasTextureBlurRef.current) canvasTextureBlurRef.current.update(text, font, 12)
  }, [text, font])

  // push color changes into active effect + clear color
  useEffect(() => {
    if (effectRef.current) {
      effectRef.current.setColors(hexToRgb(textColor), hexToRgb(bgColor))
    }
    if (rendererRef.current) {
      const bg = hexToRgb(bgColor)
      rendererRef.current.clearColor(bg[0], bg[1], bg[2], 1)
    }
  }, [textColor, bgColor])

  // ─── param change handler ──────────────────────────────────────────────────
  const onParamChange = (key: string, val: number) => {
    const effect = effectRef.current
    if (!effect) return
    effect.setParam(key, val)
    setParams((prev) => ({ ...prev, [key]: { ...prev[key], value: val } } as any))
  }

  // ─── preset handler (RepeatOverlap) ────────────────────────────────────────
  const onPreset = (name: string) => {
    const effect = effectRef.current
    if (effect instanceof RepeatOverlap) {
      effect.applyPreset(name)
      setParams(effect.getParams())
    }
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: bgColor, position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", position: "absolute", inset: 0 }}
      />
      <div className="panel">
        {/* top row: effect picker + fps */}
        <div className="panel-top">
          <select
            className="panel-select"
            value={effectName}
            onChange={(e) => setEffectName(e.target.value)}
            style={{ flex: 1 }}
          >
            {EFFECT_ORDER.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="fps">{fps}</span>
        </div>

        <div className="panel-divider" />

        {/* text + font + colors */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="panel-row">
            <label>text</label>
            <input
              type="text"
              className="panel-input"
              value={text}
              onChange={(e) => setText(e.target.value.toUpperCase())}
            />
          </div>
          <div className="panel-row">
            <label>font</label>
            <select
              className="panel-select"
              value={font}
              onChange={(e) => setFont(e.target.value)}
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="panel-row">
            <label>color</label>
            <input
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              style={{ width: 24, height: 20, border: "none", background: "none", cursor: "pointer", padding: 0 }}
            />
            <label style={{ marginLeft: 4 }}>bg</label>
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              style={{ width: 24, height: 20, border: "none", background: "none", cursor: "pointer", padding: 0 }}
            />
          </div>
        </div>

        <div className="panel-divider" />

        {/* per-effect sliders */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {Object.entries(params).map(([key, def]: [string, any]) => (
            <div className="panel-row" key={key}>
              <label>{key.replace(/([A-Z])/g, " $1").toLowerCase()}</label>
              <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step || 0.01}
                value={def.value}
                onChange={(e) => onParamChange(key, parseFloat(e.target.value))}
              />
              <span className="val">{typeof def.value === "number" ? def.value.toFixed(def.step && def.step >= 1 ? 0 : def.step && def.step >= 0.01 ? 2 : 3) : def.value}</span>
            </div>
          ))}

          {effectName === "RepeatOverlap" && (
            <div className="preset-grid" style={{ marginTop: 2 }}>
              {Object.keys(RepeatOverlap.presets).map((name) => (
                <button key={name} className="preset-btn" onClick={() => onPreset(name)}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
