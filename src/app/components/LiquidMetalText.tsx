"use client"

import { useEffect, useId, useRef } from "react"

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SCALE = 18 // displacement strength in pixels — the main lever
const FREQ_X = 0.012 // horizontal noise frequency (lower = bigger blobs)
const FREQ_Y = 0.012 // vertical noise frequency
const OCTAVES = 4 // noise detail layers (1–6; more = organic detail)
const SPEED = 1.2 // animation speed multiplier
// ─────────────────────────────────────────────────────────────────────────────

interface LiquidMetalTextProps {
  children: React.ReactNode
  fontSize?: string
  fontFamily?: string
  color?: string
  className?: string
  style?: React.CSSProperties
}

export default function LiquidMetalText({
  children,
  fontSize = "8rem",
  fontFamily = '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color = "#000000",
  className,
  style,
}: LiquidMetalTextProps) {
  const uid = useId().replace(/:/g, "")
  const filterId = `lm-${uid}`
  const turbRef = useRef<SVGFETurbulenceElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)

  useEffect(() => {
    const turb = turbRef.current
    if (!turb) return

    let running = true
    let last = performance.now()

    const tick = (now: number) => {
      if (!running) return
      tRef.current += ((now - last) / 1000) * SPEED
      last = now

      const t = tRef.current
      const fx = FREQ_X + Math.sin(t * 0.61) * FREQ_X * 0.35
      const fy = FREQ_Y + Math.cos(t * 0.43) * FREQ_Y * 0.3
      turb.setAttribute("baseFrequency", `${fx} ${fy}`)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className={className} style={{ display: "inline-block", ...style }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter
            id={filterId}
            x="-25%"
            y="-25%"
            width="150%"
            height="150%"
          >
            <feTurbulence
              ref={turbRef}
              type="fractalNoise"
              baseFrequency={`${FREQ_X} ${FREQ_Y}`}
              numOctaves={OCTAVES}
              seed={1}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={SCALE}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <span
        style={{
          display: "inline-block",
          fontSize,
          fontFamily,
          fontWeight: 900,
          color,
          lineHeight: 1.1,
          filter: `url(#${filterId})`,
          padding: "0.05em 0.02em",
        }}
      >
        {children}
      </span>
    </div>
  )
}
