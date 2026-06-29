import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

// Floating orb that moves in a gentle sine-wave path
function Orb({
  startX, startY, radius, color, speedMul, phaseSin, phaseCos,
}: {
  startX: number; startY: number; radius: number; color: string;
  speedMul: number; phaseSin: number; phaseCos: number;
}) {
  const frame = useCurrentFrame();
  const t = frame * 0.012 * speedMul;
  const x = startX + Math.sin(t + phaseSin) * 80;
  const y = startY + Math.cos(t + phaseCos) * 50;
  const opacity = 0.15 + Math.sin(t * 1.3 + phaseSin) * 0.07;

  return (
    <circle
      cx={x}
      cy={y}
      r={radius}
      fill={color}
      opacity={opacity}
      style={{ filter: `blur(${radius * 0.6}px)` }}
    />
  );
}

// Animated ring that pulses outward from a point
function PulseRing({ cx, cy, delay, color }: { cx: number; cy: number; delay: number; color: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = (frame - delay + 300) % 120;

  const scale = interpolate(localFrame, [0, 100], [0.2, 3], { extrapolateRight: "clamp" });
  const opacity = interpolate(localFrame, [0, 60, 100], [0.5, 0.2, 0], { extrapolateRight: "clamp" });

  return (
    <circle
      cx={cx}
      cy={cy}
      r={60}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      opacity={opacity}
      transform={`scale(${scale})`}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    />
  );
}

// Grid of faint dots
function DotGrid({ width, height }: { width: number; height: number }) {
  const frame = useCurrentFrame();
  const spacing = 60;
  const cols = Math.ceil(width / spacing);
  const rows = Math.ceil(height / spacing);
  const dots: JSX.Element[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const x = c * spacing;
      const y = r * spacing;
      const phase = (c + r) * 0.4;
      const opacity = 0.04 + Math.sin(frame * 0.02 + phase) * 0.03;
      dots.push(
        <circle key={`${r}-${c}`} cx={x} cy={y} r={1.5} fill="white" opacity={opacity} />
      );
    }
  }
  return <>{dots}</>;
}

// Shooting particle lines
function Particle({ startX, startY, angle, delay, color }: {
  startX: number; startY: number; angle: number; delay: number; color: string;
}) {
  const frame = useCurrentFrame();
  const localFrame = (frame - delay + 360) % 180;
  const progress = localFrame / 180;
  const len = 120;
  const dx = Math.cos(angle) * len * progress;
  const dy = Math.sin(angle) * len * progress;
  const opacity = interpolate(progress, [0, 0.1, 0.7, 1], [0, 0.6, 0.4, 0], { extrapolateRight: "clamp" });

  return (
    <line
      x1={startX}
      y1={startY}
      x2={startX + dx}
      y2={startY + dy}
      stroke={color}
      strokeWidth={1}
      opacity={opacity}
    />
  );
}

export function GoalsBackground() {
  const { width, height } = useVideoConfig();

  const orbs = [
    { startX: width * 0.15, startY: height * 0.2,  radius: 180, color: "#7c3aed", speedMul: 0.6, phaseSin: 0,   phaseCos: 1   },
    { startX: width * 0.8,  startY: height * 0.15, radius: 220, color: "#2563eb", speedMul: 0.5, phaseSin: 2,   phaseCos: 0.5 },
    { startX: width * 0.5,  startY: height * 0.7,  radius: 160, color: "#0891b2", speedMul: 0.7, phaseSin: 1,   phaseCos: 2   },
    { startX: width * 0.9,  startY: height * 0.8,  radius: 140, color: "#7c3aed", speedMul: 0.45,phaseSin: 3,   phaseCos: 1.5 },
    { startX: width * 0.1,  startY: height * 0.75, radius: 120, color: "#1d4ed8", speedMul: 0.8, phaseSin: 0.5, phaseCos: 2.5 },
  ];

  const pulses = [
    { cx: width * 0.2,  cy: height * 0.3,  delay: 0,   color: "#7c3aed" },
    { cx: width * 0.75, cy: height * 0.6,  delay: 40,  color: "#2563eb" },
    { cx: width * 0.5,  cy: height * 0.85, delay: 80,  color: "#0891b2" },
  ];

  const particles = [
    { startX: width * 0.3,  startY: height * 0.1,  angle: Math.PI * 0.3,  delay: 0,   color: "#a78bfa" },
    { startX: width * 0.7,  startY: height * 0.2,  angle: Math.PI * 1.1,  delay: 30,  color: "#60a5fa" },
    { startX: width * 0.1,  startY: height * 0.6,  angle: Math.PI * -0.2, delay: 60,  color: "#34d399" },
    { startX: width * 0.85, startY: height * 0.5,  angle: Math.PI * 0.8,  delay: 90,  color: "#a78bfa" },
    { startX: width * 0.5,  startY: height * 0.9,  angle: Math.PI * 1.6,  delay: 120, color: "#60a5fa" },
    { startX: width * 0.2,  startY: height * 0.45, angle: Math.PI * 0.05, delay: 150, color: "#34d399" },
  ];

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
      <DotGrid width={width} height={height} />
      {orbs.map((o, i) => <Orb key={i} {...o} />)}
      {pulses.map((p, i) => <PulseRing key={i} {...p} />)}
      {particles.map((p, i) => <Particle key={i} {...p} />)}
    </svg>
  );
}

// Number count-up animation component (for use outside Remotion)
export function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  return null; // placeholder — actual implementation uses CSS
}
