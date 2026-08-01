import { useEffect, useRef, useState } from 'react';
import './SplashScreen.css';

export default function SplashScreen({ onDone }) {
  const [entering, setEntering] = useState(false);
  const [sloganIn, setSloganIn] = useState(false);
  const [sloganOut, setSloganOut] = useState(false);
  const svgRef    = useRef(null);
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => setEntering(true));

    const timers = [];
    const after  = (ms, fn) => timers.push(setTimeout(fn, ms));

    after(2100, () => setSloganIn(true));
    after(4400, () => { setSloganIn(false); setSloganOut(true); });
    after(4700, () => disintegrate());

    return () => {
      timers.forEach(clearTimeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  async function disintegrate() {
    const svgEl  = svgRef.current;
    const canvas = canvasRef.current;
    if (!svgEl || !canvas) { onDone(); return; }

    // Freeze pieces at their final state before sampling
    setEntering(false);
    svgEl.querySelectorAll('.splash-piece').forEach(p => {
      p.style.opacity  = '1';
      p.style.animation = 'none';
    });

    await new Promise(r => requestAnimationFrame(r));

    const dpr       = window.devicePixelRatio || 1;
    const svgRect   = svgEl.getBoundingClientRect();
    const screenW   = window.innerWidth;
    const screenH   = window.innerHeight;

    // Render SVG to an offscreen canvas
    const tmpC   = document.createElement('canvas');
    tmpC.width   = Math.round(svgRect.width  * dpr);
    tmpC.height  = Math.round(svgRect.height * dpr);
    const tmpCtx = tmpC.getContext('2d');
    tmpCtx.scale(dpr, dpr);

    try {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const blob    = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url     = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        const img   = new Image();
        img.onload  = () => { tmpCtx.drawImage(img, 0, 0, svgRect.width, svgRect.height); resolve(); };
        img.onerror = reject;
        img.src     = url;
      });
      URL.revokeObjectURL(url);
    } catch {
      onDone();
      return;
    }

    // Sample pixels → particles
    const iData     = tmpCtx.getImageData(0, 0, tmpC.width, tmpC.height);
    const pixels    = iData.data;
    const particles = [];

    const ox = svgRect.left;
    const oy = svgRect.top;
    const cx = ox + svgRect.width  / 2;
    const cy = oy + svgRect.height / 2;

    const step = 3;
    for (let py = 0; py < tmpC.height; py += step) {
      for (let px = 0; px < tmpC.width; px += step) {
        const i = (py * tmpC.width + px) * 4;
        if (pixels[i + 3] < 25) continue;

        const wx = ox + px / dpr;
        const wy = oy + py / dpr;
        const dx = wx - cx;
        const dy = wy - cy;
        const dist  = Math.sqrt(dx * dx + dy * dy) || 1;
        const speed = 0.6 + Math.random() * Math.random() * 4.5;

        particles.push({
          x:     wx,
          y:     wy,
          vx:    (dx / dist) * speed + (Math.random() - 0.5) * 0.6,
          vy:    (dy / dist) * speed + (Math.random() - 0.5) * 0.6 - 0.3,
          r:     pixels[i],
          g:     pixels[i + 1],
          b:     pixels[i + 2],
          alpha: pixels[i + 3] / 255,
          life:  1.0,
          decay: 0.022 + Math.random() * 0.025,
          size:  1 + Math.random() * 1.2,
        });
      }
    }

    // Size the canvas to cover the full screen
    canvas.width  = Math.round(screenW * dpr);
    canvas.height = Math.round(screenH * dpr);
    canvas.style.display = 'block';

    // Hide the SVG content — canvas takes over
    if (svgRef.current) svgRef.current.style.opacity = '0';

    const ctx = canvas.getContext('2d');

    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      for (const p of particles) {
        if (p.life <= 0) continue;
        alive = true;
        p.x   += p.vx;
        p.y   += p.vy;
        p.vy  += 0.06;
        p.vx  *= 0.995;
        p.life -= p.decay;

        ctx.globalAlpha = Math.max(0, p.life) * p.alpha;
        ctx.fillStyle   = `rgb(${p.r},${p.g},${p.b})`;
        ctx.fillRect(
          Math.round(p.x * dpr),
          Math.round(p.y * dpr),
          Math.ceil(p.size * dpr),
          Math.ceil(p.size * dpr),
        );
      }

      ctx.globalAlpha = 1;
      if (alive) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onDone();
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  return (
    <div className="splash-screen">
      <canvas ref={canvasRef} className="splash-canvas" style={{ display: 'none' }} />
      <div className={`splash-content${entering ? ' splash-entering' : ''}`}>
        <svg
          ref={svgRef}
          className="splash-svg"
          viewBox="0 0 286 311"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            className="splash-piece splash-frame"
            d="M74.95 251.37C74.83 251.26 74.72 251.15 74.61 251.03C74.91 250.84 75.2 250.66 75.5 250.47C70.78 248.51 65.68 246.88 61.49 243.8C41.09 228.76 41.94 206.68 42.04 183.5C42.13 162.94 41.98 142.39 42 121.83C42.01 117.2 44.17 112.69 44 108.17C45.52 107.46 45.41 104.34 46.22 102.86C48.35 98.97 50.32 95.05 53.26 91.42C57.84 85.77 63.35 81.87 69.33 78.18C72 76.53 76.35 76.23 78.5 74.01C81.16 74.49 86.53 72.73 89.37 72.18C94.18 71.26 100.25 71.98 105.17 72.05C129.16 72.43 153.17 72 177.17 72.08C183.28 72.11 189.39 72.16 195.5 72.19C197.5 72.2 199.95 71.69 201.9 72.04C204.28 72.46 212.05 74.27 213.83 73.59C214.86 75.5 217.57 75.29 219.44 76.14C224.32 78.35 229.79 81.33 233.82 85.06C237.47 88.45 241.08 93.01 243.84 97.3C245.4 99.72 245.78 103.66 248.1 105.5C247.8 107.87 250.49 116.49 251.01 119.5C251.93 124.92 251.17 134.46 250.98 140.17C250.64 150.26 251.11 160.4 251.02 170.5C250.89 186.51 252.88 203.9 248.85 219.33C247.86 223.12 245.42 227.14 243.33 230.51C226.31 257.97 193.14 253.24 164.5 252.94C157.5 252.87 150.5 252.88 143.5 252.89C132.28 252.91 121.06 252.99 109.83 252.98C105.03 252.98 88.84 253.91 85.33 252.95C82.62 252.21 77.61 249.78 74.95 251.37ZM94.25 84.16C81.85 84.29 68.94 90.84 62.23 101.39C50.7 119.52 58.09 145.72 78.33 153.82C85.27 156.6 92.77 157.62 100.41 156.84C105.25 156.35 110.12 154.46 114.25 152.09C119.72 148.94 124.14 144.81 127.76 139.6C130.09 136.26 131.36 132.08 132.05 128.18C136.09 105.34 117.58 83.92 94.25 84.16ZM128.77 85.5C138.56 94.23 144.3 104.74 145.42 118C146.22 127.38 143.54 138.33 149.28 146.5C157.39 158.05 171.2 156.96 183.83 156.87C190.78 156.83 197.72 156.9 204.67 156.88C212.61 156.85 220.56 156.88 228.5 156.88C230.54 156.88 235.34 157.81 236.56 155.71C237.47 154.15 236.88 150.95 236.89 149.17C236.92 143.83 236.87 138.5 236.89 133.17C236.91 126.4 237.57 118.95 235.84 112.34C232.63 100.08 222.02 89.77 209.95 86.19C199.21 83 175.9 84.72 163.83 84.77C155.28 84.8 146.72 84.75 138.17 84.81C135.7 84.82 130.63 83.99 128.77 85.5ZM236.5 169.1C231.71 168.15 226.06 168.91 221.17 168.93C210.61 168.99 200.06 168.87 189.5 168.96C159.28 169.23 129.05 168.82 98.83 168.91C88.17 168.95 77.5 168.88 66.83 168.96C64.62 168.97 57.01 167.81 57 170.5C55.41 169.07 55.64 175.79 55.63 176.83C55.56 183.96 55.44 191.02 55.98 198.17C56.28 202.04 58.18 205.96 59.85 209.29C66.56 222.69 78.82 229.95 93.49 231.8C103.34 233.04 117.87 231.84 128.17 231.76C144.06 231.64 159.95 232.03 175.83 231.76C189.59 231.52 205.49 233.84 217.73 226.88C228.11 220.97 235.36 210.61 237.89 199.12C238.85 194.71 238.12 189.34 238.13 184.83C238.14 180.39 239.62 172.48 236.5 169.1ZM235.64 170.04C176.54 170.09 117.43 170.14 58.33 170.19C117.43 170.14 176.54 170.09 235.64 170.04Z"
            fill="#263950"
          />
          <path
            className="splash-piece splash-cream"
            d="M235.64 170.04C238.3 173.31 236.91 181.39 236.89 185.5C236.87 190.7 237.28 196.37 235.85 201.4C232.88 211.83 225.03 222.85 214.41 226.87C201.68 231.69 187.13 230.03 173.5 230.02C154.39 230 135.28 229.97 116.17 230.02C101.93 230.06 90.72 231.56 77.56 225.91C66.56 221.18 58.75 208.15 57.14 196.78C56.62 193.12 56.99 189.19 56.99 185.5C56.99 182.46 56.02 171.62 58.33 170.19C117.43 170.14 176.54 170.09 235.64 170.04Z"
            fill="#fdecd7"
          />
          <path
            className="splash-piece splash-green"
            d="M128.77 85.5C130.63 83.99 135.7 84.82 138.17 84.81C146.72 84.75 155.28 84.8 163.83 84.77C175.9 84.72 199.21 83 209.95 86.19C222.02 89.77 232.63 100.08 235.84 112.34C237.57 118.95 236.91 126.4 236.89 133.17C236.87 138.5 236.92 143.83 236.89 149.17C236.88 150.95 237.47 154.15 236.56 155.71C235.34 157.81 230.54 156.88 228.5 156.88C220.56 156.88 212.61 156.85 204.67 156.88C197.72 156.9 190.78 156.83 183.83 156.87C171.2 156.96 157.39 158.05 149.28 146.5C143.54 138.33 146.22 127.38 145.42 118C144.3 104.74 138.56 94.23 128.77 85.5Z"
            fill="#77bd3e"
          />
          <path
            className="splash-piece splash-orange"
            d="M94.25 84.16C117.58 83.92 136.09 105.34 132.05 128.18C131.36 132.08 130.09 136.26 127.76 139.6C124.14 144.81 119.72 148.94 114.25 152.09C110.12 154.46 105.25 156.35 100.41 156.84C92.77 157.62 85.27 156.6 78.33 153.82C58.09 145.72 50.7 119.52 62.23 101.39C68.94 90.84 81.85 84.29 94.25 84.16Z"
            fill="#fd9029"
          />
          <path
            className="splash-piece splash-border"
            d="M74.95 251.37C77.61 249.78 82.62 252.21 85.33 252.95C88.84 253.91 105.03 252.98 109.83 252.98C121.06 252.99 132.28 252.91 143.5 252.89C150.5 252.88 157.5 252.87 164.5 252.94C193.14 253.24 226.31 257.97 243.33 230.51C245.42 227.14 247.86 223.12 248.85 219.33C252.88 203.9 250.89 186.51 251.02 170.5C251.11 160.4 250.64 150.26 250.98 140.17C251.17 134.46 251.93 124.92 251.01 119.5C250.49 116.49 247.8 107.87 248.1 105.5C245.78 103.66 245.4 99.72 243.84 97.3C241.08 93.01 237.47 88.45 233.82 85.06C229.79 81.33 224.32 78.35 219.44 76.14C217.57 75.29 214.86 75.5 213.83 73.59C212.05 74.27 204.28 72.46 201.9 72.04C199.95 71.69 197.5 72.2 195.5 72.19C189.39 72.16 183.28 72.11 177.17 72.08C153.17 72 129.16 72.43 105.17 72.05C100.25 71.98 94.18 71.26 89.37 72.18C86.53 72.73 81.16 74.49 78.5 74.01C76.35 76.23 72 76.53 69.33 78.18C63.35 81.87 57.84 85.77 53.26 91.42C50.32 95.05 48.35 98.97 46.22 102.86C45.41 104.34 45.52 107.46 44 108.17C44.17 112.69 42.01 117.2 42 121.83C41.98 142.39 42.13 162.94 42.04 183.5C41.94 206.68 41.09 228.76 61.49 243.8C65.68 246.88 70.78 248.51 75.5 250.47C75.2 250.66 74.91 250.84 74.61 251.03C71.87 251.1 69.38 249.38 67 248.18C57.29 243.29 50.58 235.86 45.82 226.33C39.57 213.84 41.19 198.82 41.05 184.83C40.89 169.41 40.88 153.93 41.05 138.5C41.13 131.47 40.07 123.81 41.14 116.85C41.95 111.6 43.48 106.26 45.81 101.65C47.02 99.24 47.94 96.79 49.28 94.46C56.89 81.25 73.28 73.19 87.51 71.1C96.04 69.85 105.54 71 114.17 70.98C130.39 70.95 146.61 71.07 162.83 70.98C191.93 70.83 218.45 66.4 239.81 89.35C242 91.7 243.69 94.93 245.14 97.71C253.08 112.91 251.85 121.24 251.96 138.5C252.06 154.39 251.96 170.28 251.97 186.17C251.98 210.49 253.09 229.26 231.68 244.84C219.21 253.93 204.11 253.95 188.83 253.95C174.06 253.96 159.28 253.93 144.5 253.96C127.5 253.99 110.5 254.16 93.5 253.97C89.96 253.93 77.19 253.75 74.95 251.37Z"
            fill="#0a0e1a"
          />
        </svg>
        <p className={`splash-slogan${sloganIn ? ' slogan-in' : ''}${sloganOut ? ' slogan-out' : ''}`}>
          Eat well. Every meal.
        </p>
      </div>
    </div>
  );
}
