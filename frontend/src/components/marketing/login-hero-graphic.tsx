"use client";

import { CalendarDays, HeartPulse, Pill, ShieldCheck, Stethoscope, Video } from "lucide-react";

// The login page's brand moment. Composition mirrors the design-system spec:
// rotating dashed ring, icon nodes orbiting inside it, dot grid backdrop.
// Hidden on mobile (the form takes the screen).
//
// The nodes trace an appointment's real lifecycle (see StatusBadge) and reuse
// each icon's established meaning elsewhere in the app, so the graphic
// describes the product rather than any patient. Deliberately no numbers,
// readings, or status: fake ones on a clinical sign-in screen read as real
// (issue #158).
const ORBIT_NODES = [
  { Icon: CalendarDays, angle: 0 }, // appointment scheduled
  { Icon: ShieldCheck, angle: 72 }, // consent captured
  { Icon: HeartPulse, angle: 144 }, // preconsult vitals
  { Icon: Video, angle: 216 }, // the consultation
  { Icon: Pill, angle: 288 }, // prescription
];

// Orbit radius lives in --orbit-r on the carrier so it can flex by breakpoint;
// the nodes inherit it. Nodes ride inside the 440px dashed ring rather than on
// it, because the hero column is narrow: 0.9fr of a max-w-6xl grid is ~468px at
// xl and only ~410px at the lg breakpoint itself. A node reaches
// radius + 22px (half of h-11), so 200px fits xl with room to spare while 180px
// is what keeps it off the gutter down at 1024px.
const ORBIT_TRANSFORM = (angle: number) =>
  `translate(-50%, -50%) rotate(${angle}deg) translateY(calc(var(--orbit-r) * -1)) rotate(${-angle}deg)`;

export function LoginHeroGraphic() {
  return (
    <div className="relative h-[560px] w-full" aria-hidden>
      {/* Ambient radial glows */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-[var(--accent)]/[0.08] blur-[120px]" />
        <div className="absolute bottom-0 left-12 h-72 w-72 rounded-full bg-[var(--accent-secondary)]/[0.10] blur-[120px]" />
      </div>

      {/* Background dot grid (lighter — backdrop, not pattern) */}
      <div
        className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(15, 23, 42, 0.18) 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Outer rotating dashed ring — 60s glacial speed, shared with the orbit */}
      <div className="animate-orbit absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-[var(--accent)]/25" />

      {/* Inner static ring */}
      <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--accent)]/15" />

      {/* Breathing glow behind the medallion */}
      <div className="animate-breathe absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)]/20 blur-2xl" />

      {/* Central gradient block */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-8 shadow-accent-lg">
        <Stethoscope className="h-12 w-12 text-white" strokeWidth={1.5} />
      </div>

      {/* Orbiting pathway nodes. The carrier is inset-0 so its origin is already
          the container's centre — no translate utility to collide with the
          animated `rotate`. Each icon counter-rotates to stay upright. */}
      <div className="animate-orbit absolute inset-0 [--orbit-r:180px] xl:[--orbit-r:200px]">
        {ORBIT_NODES.map(({ Icon, angle }) => (
          <div
            key={angle}
            className="absolute left-1/2 top-1/2"
            style={{ transform: ORBIT_TRANSFORM(angle) }}
          >
            <div className="animate-orbit-reverse flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
              <Icon className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.75} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
