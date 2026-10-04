/**
 * Motion heuristic for one vehicle: tells "stalled", "jittering" and "asleep" apart from driving.
 *
 * Sliding window (default 3 s) over per-frame samples:
 *   net      straight-line displacement window start → end
 *   path     summed per-frame displacement (a jittering car accumulates path without net progress)
 *   yawPath  summed |Δyaw| (rocking / turning on the spot)
 *   flips    sign changes of the forward speed while |v| > flipSpeed (forward/back chatter)
 * Classification (first match):
 *   asleep   physics body sleeping for ≥ sleepFrames (its transformer chain is skipped)
 *   stall    net < stallNet and path < stallPath and yawPath < stallYaw
 *   jitter   net < jitterNet and (flips ≥ jitterFlips or roughness > jitterRough)       high-frequency chatter
 *   shuttle  net < jitterNet and (path > jitterPathRatio·max(net, 0.5) and path > jitterPath or yawPath > jitterYaw)
 *            slow back-and-forth without progress (a manoeuvre that never gets anywhere)
 *   moving   otherwise
 * roughness = mean |Δspeed| per frame over the window.
 * An event opens when the class leaves `moving` and closes when it returns; `onTrigger` fires once per event.
 */

export type MotionClass = 'moving' | 'stall' | 'jitter' | 'shuttle' | 'asleep'

export interface MotionSample {
  frame: number
  x: number
  z: number
  /** Heading (rad) in the floor plane. */
  yaw: number
  /** Signed forward speed (m/s). */
  speed: number
  sleeping: boolean
}

export interface MotionMetrics {
  net: number
  path: number
  yawPath: number
  flips: number
  vmax: number
  sleepFrames: number
  roughness: number
}

export interface MotionEvent {
  kind: Exclude<MotionClass, 'moving'>
  /** Frame the condition was first classified (window end). */
  startFrame: number
  /** First frame of the window that produced the classification (≈ when the trouble began). */
  windowStartFrame: number
  endFrame: number | null
  metrics: MotionMetrics
  at: { x: number; z: number; yaw: number }
}

export interface MotionMonitorOptions {
  windowFrames?: number
  evalEvery?: number
  stallNet?: number
  stallPath?: number
  stallYaw?: number
  jitterNet?: number
  jitterFlips?: number
  jitterPath?: number
  jitterPathRatio?: number
  jitterYaw?: number
  jitterRough?: number
  flipSpeed?: number
  sleepFrames?: number
  /** Return true to suppress classification (e.g. holding at the final goal on purpose). */
  ignore?: (s: MotionSample) => boolean
}

const DEFAULTS: Required<Omit<MotionMonitorOptions, 'ignore'>> = {
  windowFrames: 180,
  evalEvery: 15,
  stallNet: 0.4,
  stallPath: 0.8,
  stallYaw: 0.2,
  jitterNet: 1.5,
  jitterFlips: 3,
  jitterPath: 1.5,
  jitterPathRatio: 3,
  jitterYaw: 1.0,
  jitterRough: 0.8,
  flipSpeed: 0.3,
  sleepFrames: 30,
}

export class MotionMonitor {
  readonly opts: Required<Omit<MotionMonitorOptions, 'ignore'>> & Pick<MotionMonitorOptions, 'ignore'>
  private readonly buf: MotionSample[] = []
  private sleepRun = 0
  private current: MotionEvent | null = null
  readonly events: MotionEvent[] = []
  /** Frames spent in each class (evaluated windows × evalEvery). */
  readonly classFrames: Record<MotionClass, number> = { moving: 0, stall: 0, jitter: 0, shuttle: 0, asleep: 0 }
  onTrigger: ((ev: MotionEvent) => void) | null = null

  constructor(opts: MotionMonitorOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts }
  }

  get active(): MotionEvent | null {
    return this.current
  }

  push(s: MotionSample): void {
    this.buf.push(s)
    if (this.buf.length > this.opts.windowFrames) this.buf.shift()
    this.sleepRun = s.sleeping ? this.sleepRun + 1 : 0
    if (this.buf.length < this.opts.windowFrames && this.sleepRun < this.opts.sleepFrames) return
    if (s.frame % this.opts.evalEvery !== 0) return
    const ignored = this.opts.ignore?.(s) ?? false
    const m = this.metrics()
    const cls: MotionClass = ignored ? 'moving' : this.classify(m)
    this.classFrames[cls] += this.opts.evalEvery
    if (cls === 'moving') {
      if (this.current) {
        this.current.endFrame = s.frame
        this.current = null
      }
      return
    }
    if (this.current && this.current.kind === cls) return
    if (this.current) this.current.endFrame = s.frame
    const ev: MotionEvent = {
      kind: cls,
      startFrame: s.frame,
      windowStartFrame: cls === 'asleep' ? s.frame - this.sleepRun : this.buf[0]!.frame,
      endFrame: null,
      metrics: m,
      at: { x: s.x, z: s.z, yaw: s.yaw },
    }
    this.current = ev
    this.events.push(ev)
    this.onTrigger?.(ev)
  }

  metrics(): MotionMetrics {
    const b = this.buf
    let path = 0
    let yawPath = 0
    let flips = 0
    let vmax = 0
    let lastSign = 0
    let rough = 0
    for (let i = 0; i < b.length; i++) {
      const s = b[i]!
      vmax = Math.max(vmax, Math.abs(s.speed))
      if (Math.abs(s.speed) > this.opts.flipSpeed) {
        const sg = s.speed > 0 ? 1 : -1
        if (lastSign !== 0 && sg !== lastSign) flips++
        lastSign = sg
      }
      if (i === 0) continue
      const p = b[i - 1]!
      rough += Math.abs(s.speed - p.speed)
      path += Math.hypot(s.x - p.x, s.z - p.z)
      let dy = s.yaw - p.yaw
      while (dy > Math.PI) dy -= 2 * Math.PI
      while (dy < -Math.PI) dy += 2 * Math.PI
      yawPath += Math.abs(dy)
    }
    const a = b[0]!
    const z = b[b.length - 1]!
    return { net: Math.hypot(z.x - a.x, z.z - a.z), path, yawPath, flips, vmax, sleepFrames: this.sleepRun, roughness: rough / Math.max(1, b.length - 1) }
  }

  private classify(m: MotionMetrics): MotionClass {
    const o = this.opts
    if (m.sleepFrames >= o.sleepFrames) return 'asleep'
    if (m.net < o.stallNet && m.path < o.stallPath && m.yawPath < o.stallYaw) return 'stall'
    if (m.net < o.jitterNet && (m.flips >= o.jitterFlips || m.roughness > o.jitterRough)) return 'jitter'
    if (m.net < o.jitterNet && ((m.path > o.jitterPathRatio * Math.max(m.net, 0.5) && m.path > o.jitterPath) || m.yawPath > o.jitterYaw)) return 'shuttle'
    return 'moving'
  }

  /** Close an open event at the end of a run. */
  finish(frame: number): void {
    if (this.current) this.current.endFrame = frame
    this.current = null
  }
}
