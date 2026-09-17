import { useEffect, useRef } from 'react';

/* A short burst when a plate is confirmed.
 *
 * Canvas rather than DOM nodes: a hundred animated elements thrash layout on a
 * phone, one canvas does not. Hand-rolled rather than a library because the
 * whole thing is about sixty lines and the app ships to students on cellular.
 *
 * Colours come from the logo. Nothing here is themed, because confetti reads
 * the same on cream and on navy. */
const COLORS = ['#FD8F2A', '#77BE3D', '#FEEAD7', '#24384F'];
const COUNT = 90;
const DURATION = 1400;

export default function Confetti({ onDone }) {
  const canvasRef = useRef(null);
  // Held in a ref so the animation effect can stay [] and never restart, but
  // synced in an effect rather than during render, which is not allowed.
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    // Respect the setting rather than assuming everyone wants motion. Someone
    // who asked their phone for less of it still gets the confirmation, just
    // without the burst.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const t = setTimeout(() => doneRef.current?.(), 200);
      return () => clearTimeout(t);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let w, h;
    const size = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    // Fired upward from just below centre, so the burst reads as coming off the
    // card rather than raining from the top of the screen.
    const originX = w / 2;
    const originY = h * 0.55;
    const bits = Array.from({ length: COUNT }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      const speed = 5 + Math.random() * 8;
      return {
        x: originX + (Math.random() - 0.5) * 60,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: 5 + Math.random() * 5,
        h: 8 + Math.random() * 6,
        color: COLORS[(Math.random() * COLORS.length) | 0],
      };
    });

    const start = performance.now();
    let raf;

    const frame = (now) => {
      const elapsed = now - start;
      const t = elapsed / DURATION;
      if (t >= 1) {
        ctx.clearRect(0, 0, w, h);
        doneRef.current?.();
        return;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

      for (const b of bits) {
        b.vy += 0.34;          // gravity
        b.vx *= 0.995;         // drag
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.vr;

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.color;
        // Scaling height by cos() makes each piece read as a flat rectangle
        // tumbling in space instead of a spinning sticker.
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.rot)));
        ctx.restore();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    window.addEventListener('resize', size);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, []);

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />;
}
