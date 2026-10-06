import { useEffect, useRef } from 'react';

/* The celebration when a plate is confirmed.
 *
 * Modelled on the celebration in Apple's Messages: two bursts fired from the
 * lower corners, crossing toward the middle, with a mix of shapes that tumble
 * and catch the light as they turn. It reads as an event, not as sprinkles.
 *
 * Canvas rather than DOM nodes: a hundred animated elements thrash layout on a
 * phone, one canvas does not. Hand-rolled rather than a library because the
 * whole thing is small and the app ships to students on cellular.
 *
 * Physics is stepped by elapsed time, not by frame, so it plays at the same
 * speed on a 60 Hz and a 120 Hz screen.
 *
 * Colours come from the logo. Nothing here is themed, because confetti reads
 * the same on cream and on navy. */
const COLORS = ['#FD8F2A', '#77BE3D', '#FEEAD7', '#24384F', '#FFB45E'];
const PER_CANNON = 44;
const DURATION = 2100;
const GRAVITY = 1500;   // px/s^2
const DRAG = 0.9;       // velocity kept per second

const SHAPES = ['ribbon', 'dot', 'tile'];

export default function Confetti({ onDone }) {
  const canvasRef = useRef(null);
  // Held in a ref so the animation effect can stay [] and never restart, but
  // synced in an effect rather than during render, which is not allowed.
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    // Someone who asked their phone for less motion still gets the confirmation,
    // just without the burst.
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

    const fire = (originX, direction) => Array.from({ length: PER_CANNON }, () => {
      // Aimed up and across the screen, with a wide spread.
      const angle = -Math.PI / 2 + direction * (0.35 + Math.random() * 0.55) + (Math.random() - 0.5) * 0.5;
      const speed = 820 + Math.random() * 760;
      return {
        x: originX + (Math.random() - 0.5) * 24,
        y: h + 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 14,
        // The flip: each piece turns about its own axis at its own rate.
        flip: Math.random() * Math.PI * 2,
        vflip: 5 + Math.random() * 9,
        size: 6 + Math.random() * 7,
        shape: SHAPES[(Math.random() * SHAPES.length) | 0],
        color: COLORS[(Math.random() * COLORS.length) | 0],
        delay: Math.random() * 90,
      };
    });
    const bits = [...fire(w * 0.06, 1), ...fire(w * 0.94, -1)];

    const start = performance.now();
    let last = start;
    let raf;

    const frame = (now) => {
      const elapsed = now - start;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      if (elapsed >= DURATION) {
        ctx.clearRect(0, 0, w, h);
        doneRef.current?.();
        return;
      }

      ctx.clearRect(0, 0, w, h);
      const fade = elapsed < DURATION - 500 ? 1 : (DURATION - elapsed) / 500;

      for (const b of bits) {
        if (elapsed < b.delay) continue;
        b.vy += GRAVITY * dt;
        const drag = Math.pow(DRAG, dt);
        b.vx *= drag;
        b.vy *= drag;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
        b.flip += b.vflip * dt;

        // Turning edge-on dims the piece, as a lit sheet does.
        const face = Math.cos(b.flip);
        ctx.save();
        ctx.globalAlpha = fade * (0.55 + 0.45 * Math.abs(face));
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.scale(1, Math.max(0.12, Math.abs(face)));
        ctx.fillStyle = b.color;
        if (b.shape === 'dot') {
          ctx.beginPath();
          ctx.arc(0, 0, b.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (b.shape === 'ribbon') {
          ctx.fillRect(-b.size * 0.22, -b.size, b.size * 0.44, b.size * 2);
        } else {
          const s = b.size;
          ctx.beginPath();
          ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.28);
          ctx.fill();
        }
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
