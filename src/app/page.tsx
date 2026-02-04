"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Renderer, Vec2 } from "./webgl/renderer"
import { Effect, createEffect, EFFECT_ORDER, RepeatOverlap, MetaLogo, DoubleLogo, MouseGrid } from "./webgl/effects"

// ─── Debug panel styles (matches 27b exactly) ───────────────────────────────
const PANEL_CSS = `
.debug-panel {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 220px;
  background: rgba(30,30,30,0.92);
  backdrop-filter: blur(8px);
  border-radius: 8px;
  color: #ccc;
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: 11px;
  line-height: 1.5;
  z-index: 100;
  user-select: none;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  overflow: hidden;
}
.debug-section {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.debug-section:last-child { border-bottom: none; }
.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: #fff;
  font-size: 11px;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.debug-header .toggle {
  cursor: pointer;
  opacity: 0.5;
  font-size: 14px;
}
.debug-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 3px 0;
}
.debug-row label {
  width: 72px;
  flex-shrink: 0;
  color: #999;
}
.debug-row .val {
  width: 42px;
  text-align: right;
  flex-shrink: 0;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.debug-row input[type=range] {
  flex: 1;
  -webkit-appearance: none;
  height: 3px;
  background: rgba(255,255,255,0.2);
  border-radius: 2px;
  outline: none;
}
.debug-row input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
}
.debug-select {
  width: 100%;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  padding: 4px 6px;
  cursor: pointer;
  margin-top: 2px;
}
.debug-select option { background: #222; color: #fff; }
.debug-btn {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  padding: 3px 10px;
  cursor: pointer;
  margin-top: 2px;
}
.debug-btn:hover { background: rgba(255,255,255,0.2); }
.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-top: 4px;
}
.preset-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 3px;
  color: #aaa;
  font-family: inherit;
  font-size: 10px;
  padding: 3px 4px;
  cursor: pointer;
  text-align: center;
}
.preset-btn:hover, .preset-btn.active { background: rgba(255,255,255,0.18); color: #fff; border-color: rgba(255,255,255,0.3); }
.fps-bar {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 24px;
  margin-top: 4px;
}
.fps-bar span {
  flex: 1;
  background: rgba(255,255,255,0.25);
  border-radius: 1px 1px 0 0;
  transition: height 0.1s;
}
`

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const effectRef = useRef<Effect | null>(null)
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef(0)

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
  const fpsHistory = useRef<number[]>(Array(40).fill(60))
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

  // ─── mount effect ──────────────────────────────────────────────────────────
  const mountEffect = useCallback((name: string) => {
    if (!rendererRef.current) return
    if (effectRef.current) effectRef.current.dispose()
    const e = createEffect(name, rendererRef.current)
    e.mount()
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
    if (elapsed >= 200) {
      const currentFps = Math.round(fpsFrames.current / (elapsed / 1000))
      fpsHistory.current.push(currentFps)
      if (fpsHistory.current.length > 40) fpsHistory.current.shift()
      setFps(currentFps)
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
    renderer.clearColor(1, 1, 1, 1)
    rendererRef.current = renderer

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

  const effect = effectRef.current

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: bgColor, position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", position: "absolute", inset: 0 }}
      />
      {/* Text overlay — sits on top of the WebGL canvas */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none", zIndex: 1,
      }}>
        <span style={{
          fontFamily: `"${font}", sans-serif`,
          fontWeight: 900,
          fontSize: "clamp(4rem, 15vw, 12rem)",
          color: textColor,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
          lineHeight: 1,
          // mix-blend-mode so it composites nicely over the shader
          mixBlendMode: "difference",
        }}>
          {text}
        </span>
      </div>

      {/* ── Debug Panel ── */}
      <div className="debug-panel">
        {/* FPS */}
        <div className="debug-section">
          <div className="debug-header">
            Debug
            <span style={{ fontWeight: 400, color: "#aaa", textTransform: "none", letterSpacing: 0 }}>
              {fps} FPS
            </span>
          </div>
          <div className="fps-bar">
            {fpsHistory.current.map((f, i) => (
              <span key={i} style={{ height: `${Math.min(100, (f / 60) * 100)}%` }} />
            ))}
          </div>
        </div>

        {/* Effects switcher */}
        <div className="debug-section">
          <div className="debug-header">effects</div>
          <div className="debug-row" style={{ marginTop: 4 }}>
            <label style={{ width: "auto", flex: 0 }}>share</label>
            <button className="debug-btn" onClick={() => {
              navigator.clipboard?.writeText(window.location.href)
            }}>Share effect</button>
          </div>
          <div className="debug-row" style={{ marginTop: 2 }}>
            <label style={{ width: "auto", flex: 0 }}>effect</label>
            <select
              className="debug-select"
              value={effectName}
              onChange={(e) => setEffectName(e.target.value)}
            >
              {EFFECT_ORDER.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Brand / text controls */}
        <div className="debug-section">
          <div className="debug-header">text</div>
          <div className="debug-row" style={{ marginTop: 2 }}>
            <label style={{ width: "auto", flex: 0 }}>text</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value.toUpperCase())}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 4,
                color: "#fff",
                fontFamily: "inherit",
                fontSize: 11,
                padding: "4px 6px",
                outline: "none",
              }}
            />
          </div>
          <div className="debug-row" style={{ marginTop: 2 }}>
            <label style={{ width: "auto", flex: 0 }}>font</label>
            <select
              className="debug-select"
              value={font}
              onChange={(e) => setFont(e.target.value)}
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="debug-row" style={{ marginTop: 4 }}>
            <label>text</label>
            <input
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              style={{ width: 28, height: 22, border: "none", background: "none", cursor: "pointer", padding: 0 }}
            />
            <label style={{ marginLeft: 8 }}>bg</label>
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              style={{ width: 28, height: 22, border: "none", background: "none", cursor: "pointer", padding: 0 }}
            />
          </div>
        </div>

        {/* Per-effect params */}
        <div className="debug-section">
          <div className="debug-header">
            {effectName === "RepeatOverlap" ? "repeat overlap parameters" :
             effectName === "MetaLogo" ? "meta logo parameters" :
             effectName === "MouseGrid" ? "mouse grid parameters" :
             effectName === "Grid" ? "grid parameters" :
             effectName === "SingleDistord" ? "single distord parameters" :
             "double logo parameters"}
          </div>

          {Object.entries(params).map(([key, def]: [string, any]) => (
            <div className="debug-row" key={key}>
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

          {/* Presets for RepeatOverlap */}
          {effectName === "RepeatOverlap" && (
            <div className="preset-grid" style={{ marginTop: 6 }}>
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
