'use client'

// Ambient forge atmosphere ported from the Anvilary-Website design system
// (src/components/ui/EmberBackground.tsx). Copied and adapted so RoadForge
// builds independently — keep behavior in sync with the Anvilary source.

import { useEffect, useRef } from 'react'

type ParticleKind = 'cinder' | 'ember'

interface EmberParticle {
  age: number
  brightness: number
  curveFrequency: number
  curvePhase: number
  curveStrength: number
  drag: number
  earlyFade: number
  kind: ParticleKind
  life: number
  previousX: number
  previousY: number
  size: number
  trailLength: number
  verticalAcceleration: number
  vx: number
  vy: number
  wobbleFrequency: number
  wobblePhase: number
  wobbleStrength: number
  x: number
  y: number
}

interface EmberBackgroundProps {
  /** Restrained variant for dense surfaces like the roadmap workspace. */
  subdued?: boolean
}

const FRAME_INTERVAL_MS = 1000 / 30
const MAX_PIXEL_RATIO = 1.5
const MOBILE_BREAKPOINT = 640

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function particleLimit(width: number, subdued: boolean) {
  const base = width <= MOBILE_BREAKPOINT
    ? Math.round(16 + clamp((width - 320) / 320, 0, 1) * 2)
    : Math.round(30 + clamp((width - MOBILE_BREAKPOINT) / 800, 0, 1) * 6)
  return subdued ? Math.round(base * 0.5) : base
}

function createParticle(width: number, height: number, originX?: number, originY?: number): EmberParticle {
  const kind: ParticleKind = Math.random() < 0.7 ? 'cinder' : 'ember'
  const life = kind === 'cinder' ? randomBetween(3, 7) : randomBetween(1.5, 4)
  const intendedRise = height * randomBetween(kind === 'cinder' ? 0.4 : 0.46, 0.72)
  const verticalSpeed = intendedRise / life
  const x = originX ?? randomBetween(width * 0.07, width * 0.93)
  const y = originY ?? height * randomBetween(0.82, 1.05)
  const speedFactor = clamp(verticalSpeed / 150, 0.65, 1.7)

  return {
    age: 0,
    brightness: randomBetween(kind === 'cinder' ? 0.58 : 0.72, 1),
    curveFrequency: randomBetween(0.36, 0.78),
    curvePhase: randomBetween(0, Math.PI * 2),
    curveStrength: randomBetween(7, 22) * (Math.random() < 0.5 ? -1 : 1),
    drag: randomBetween(0.035, 0.095),
    earlyFade: Math.random() < 0.26 ? randomBetween(0.56, 0.76) : randomBetween(0.78, 0.94),
    kind,
    life,
    previousX: x,
    previousY: y,
    size: kind === 'cinder' ? randomBetween(1, 2) : randomBetween(0.75, 1.25),
    trailLength: kind === 'ember' ? clamp(randomBetween(3.5, 6.5) * speedFactor, 3, 9) : Math.random() < 0.3 ? 1.5 : 0,
    verticalAcceleration: -randomBetween(1.5, 8),
    vx: randomBetween(-22, 22),
    vy: -verticalSpeed * randomBetween(0.94, 1.08),
    wobbleFrequency: randomBetween(1.15, 2.15),
    wobblePhase: randomBetween(0, Math.PI * 2),
    wobbleStrength: randomBetween(2.5, 7),
    x,
    y,
  }
}

function advanceParticle(particle: EmberParticle, deltaSeconds: number, wind: number, gust: number) {
  particle.age += deltaSeconds
  particle.previousX = particle.x
  particle.previousY = particle.y

  const broadCurve = Math.sin(
    particle.age * particle.curveFrequency + particle.curvePhase,
  ) * particle.curveStrength
  const secondaryWobble = Math.sin(
    particle.age * particle.wobbleFrequency + particle.wobblePhase,
  ) * particle.wobbleStrength

  particle.vx += (wind + gust + broadCurve + secondaryWobble) * deltaSeconds
  particle.vy += particle.verticalAcceleration * deltaSeconds
  const drag = Math.exp(-particle.drag * deltaSeconds)
  particle.vx *= drag
  particle.vy *= Math.exp(-particle.drag * 0.28 * deltaSeconds)
  particle.x += particle.vx * deltaSeconds
  particle.y += particle.vy * deltaSeconds
}

function interpolateColor(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  amount: number,
) {
  return from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount))
}

function particleColor(progress: number) {
  const colors = [[255, 224, 151], [247, 126, 42], [177, 51, 24]] as const
  if (progress < 0.28) return interpolateColor(colors[0], colors[1], progress / 0.28)
  return interpolateColor(colors[1], colors[2], (progress - 0.28) / 0.72)
}

function drawParticle(
  context: CanvasRenderingContext2D,
  particle: EmberParticle,
  height: number,
) {
  const progress = particle.age / particle.life
  const fadeIn = clamp(progress / 0.08, 0, 1)
  const fadeOut = clamp((particle.earlyFade - progress) / 0.2, 0, 1)
  const headerFade = clamp((particle.y - height * 0.08) / (height * 0.16), 0, 1)
  const alpha = fadeIn * fadeOut * headerFade * particle.brightness
  if (alpha <= 0.01) return

  const [red, green, blue] = particleColor(progress)
  const velocity = Math.hypot(particle.vx, particle.vy) || 1
  const directionX = particle.vx / velocity
  const directionY = particle.vy / velocity

  if (particle.trailLength > 0) {
    const tailX = particle.x - directionX * particle.trailLength
    const tailY = particle.y - directionY * particle.trailLength
    const gradient = context.createLinearGradient(tailX, tailY, particle.x, particle.y)
    gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, 0)`)
    gradient.addColorStop(0.68, `rgba(${red}, ${green}, ${blue}, ${alpha * 0.42})`)
    gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, ${alpha})`)
    context.beginPath()
    context.moveTo(tailX, tailY)
    context.lineTo(particle.x, particle.y)
    context.strokeStyle = gradient
    context.lineWidth = particle.size
    context.lineCap = 'butt'
    context.stroke()
  }

  const coreLength = particle.kind === 'ember' ? 1.8 : particle.size
  context.beginPath()
  context.moveTo(
    particle.x - directionX * coreLength * 0.5,
    particle.y - directionY * coreLength * 0.5,
  )
  context.lineTo(
    particle.x + directionX * coreLength * 0.5,
    particle.y + directionY * coreLength * 0.5,
  )
  context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`
  context.lineWidth = particle.size
  context.lineCap = 'butt'
  context.stroke()
}

/** One fixed, non-interactive canvas for wind-driven ambient forge embers. */
export function EmberBackground({ subdued = false }: EmberBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || navigator.userAgent.includes('jsdom')) return
    const context = canvas.getContext('2d')
    if (!context) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let animationFrame = 0
    let lastFrame = 0
    let nextSpawn = 0
    let particles: EmberParticle[] = []
    let running = false
    let width = 0
    let height = 0
    let windFrom = 0
    let windTo = randomBetween(-13, 13)
    let windStartedAt = 0
    let windDuration = randomBetween(4.5, 8) * 1000

    const resize = () => {
      const previousWidth = width
      const previousHeight = height
      width = window.innerWidth
      height = window.innerHeight
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

      if (previousWidth && previousHeight) {
        for (const particle of particles) {
          particle.x *= width / previousWidth
          particle.previousX *= width / previousWidth
          particle.y *= height / previousHeight
          particle.previousY *= height / previousHeight
        }
        particles = particles.slice(0, particleLimit(width, subdued))
      }
    }

    const currentWind = (timestamp: number) => {
      let progress = clamp((timestamp - windStartedAt) / windDuration, 0, 1)
      if (progress >= 1) {
        windFrom = windTo
        windTo = randomBetween(-16, 16)
        windStartedAt = timestamp
        windDuration = randomBetween(4.5, 8) * 1000
        progress = 0
      }
      const eased = progress * progress * (3 - 2 * progress)
      return windFrom + (windTo - windFrom) * eased
    }

    const addParticles = (count: number) => {
      const available = particleLimit(width, subdued) - particles.length
      if (available <= 0) return
      const actualCount = Math.min(count, available)
      const clusterX = randomBetween(width * 0.07, width * 0.93)
      const clusterY = height * randomBetween(0.82, 1.05)

      for (let index = 0; index < actualCount; index += 1) {
        particles.push(createParticle(
          width,
          height,
          clusterX + randomBetween(-22, 22),
          clusterY + randomBetween(-12, 12),
        ))
      }
    }

    const seedParticles = () => {
      const count = particleLimit(width, subdued)
      particles = []
      for (let index = 0; index < count; index += 1) {
        const particle = createParticle(width, height)
        const seededAge = randomBetween(0, particle.life * particle.earlyFade * 0.92)
        for (let elapsed = 0; elapsed < seededAge; elapsed += 1 / 30) {
          advanceParticle(particle, Math.min(1 / 30, seededAge - elapsed), 0, 0)
        }
        particles.push(particle)
      }
    }

    const render = () => {
      context.clearRect(0, 0, width, height)
      for (const particle of particles) {
        drawParticle(context, particle, height)
      }
    }

    const stop = () => {
      running = false
      window.cancelAnimationFrame(animationFrame)
      context.clearRect(0, 0, width, height)
    }

    const tick = (timestamp: number) => {
      if (!running) return
      animationFrame = window.requestAnimationFrame(tick)
      if (timestamp - lastFrame < FRAME_INTERVAL_MS) return

      const deltaSeconds = Math.min((timestamp - lastFrame) / 1000, 0.1)
      lastFrame = timestamp
      const wind = currentWind(timestamp)
      const gust = Math.sin(timestamp * 0.00047) * Math.sin(timestamp * 0.00019) * 9

      if (timestamp >= nextSpawn && particles.length < particleLimit(width, subdued)) {
        addParticles(Math.random() < 0.18 ? Math.round(randomBetween(2, 5)) : 1)
        nextSpawn = timestamp + (width <= MOBILE_BREAKPOINT
          ? randomBetween(230, 520)
          : randomBetween(95, 230))
      }

      for (const particle of particles) {
        advanceParticle(particle, deltaSeconds, wind, gust)
      }
      particles = particles.filter((particle) => (
        particle.age < particle.life &&
        particle.age / particle.life < particle.earlyFade &&
        particle.y > -20 &&
        particle.x > -40 &&
        particle.x < width + 40
      ))
      render()
    }

    const start = () => {
      if (running || reducedMotion.matches || document.hidden) return
      if (!particles.length) seedParticles()
      const now = performance.now()
      lastFrame = now
      nextSpawn = now + randomBetween(120, 360)
      windStartedAt = now
      running = true
      animationFrame = window.requestAnimationFrame(tick)
    }
    const handlePreferenceChange = () => reducedMotion.matches ? stop() : start()
    const handleVisibilityChange = () => document.hidden ? stop() : start()

    resize()
    window.addEventListener('resize', resize)
    reducedMotion.addEventListener('change', handlePreferenceChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    start()

    return () => {
      stop()
      window.removeEventListener('resize', resize)
      reducedMotion.removeEventListener('change', handlePreferenceChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [subdued])

  return (
    <div
      className={subdued ? 'ember-background ember-background--subdued' : 'ember-background'}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="ember-canvas" />
    </div>
  )
}
