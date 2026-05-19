import { useEffect, useRef } from 'react';

// Barely-there canvas grain. Felt, not seen — alpha ~4/255.
export default function GrainOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    let raf = 0;

    function draw() {
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;

      const w = parent.offsetWidth;
      const h = parent.offsetHeight;
      // Layout may not be resolved yet (w/h === 0). Retry next frame —
      // createImageData throws IndexSizeError on a zero dimension.
      if (w <= 0 || h <= 0) {
        raf = requestAnimationFrame(draw);
        return;
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 4;
      }
      ctx.putImageData(img, 0, 0);
    }

    draw();
    window.addEventListener('resize', draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', draw);
    };
  }, []);

  return <canvas ref={ref} className="grain" aria-hidden="true" />;
}
