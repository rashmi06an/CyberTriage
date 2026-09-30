import { useEffect, useRef } from 'react';

/**
 * Animated network-mesh backdrop rendered on a full-window canvas.
 * Nodes drift, link to nearby neighbours, and packets travel along the links —
 * evoking a live network operations environment. Purely decorative; sits behind
 * all content with pointer-events disabled and respects prefers-reduced-motion.
 */

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pulse: number;
}

interface Packet {
  from: number;
  to: number;
  t: number;
  speed: number;
}

const LINK_DIST = 168;
const MAX_PACKETS = 26;

export function CyberBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let nodes: Node[] = [];
    let packets: Packet[] = [];
    let raf = 0;

    const nodeCount = () => {
      const target = Math.round((width * height) / 26000);
      return Math.max(26, Math.min(72, target));
    };

    const seed = () => {
      nodes = Array.from({ length: nodeCount() }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 1 + Math.random() * 1.8,
        pulse: Math.random() * Math.PI * 2,
      }));
      packets = [];
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const spawnPacket = () => {
      if (packets.length >= MAX_PACKETS || nodes.length < 2) return;
      const from = (Math.random() * nodes.length) | 0;
      // find a nearby node to travel to
      let best = -1;
      let bestDist = LINK_DIST * LINK_DIST;
      for (let i = 0; i < nodes.length; i++) {
        if (i === from) continue;
        const dx = nodes[i].x - nodes[from].x;
        const dy = nodes[i].y - nodes[from].y;
        const d = dx * dx + dy * dy;
        if (d < bestDist && Math.random() > 0.4) {
          bestDist = d;
          best = i;
        }
      }
      if (best >= 0) packets.push({ from, to: best, t: 0, speed: 0.006 + Math.random() * 0.012 });
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // update + draw links
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        a.x += a.vx;
        a.y += a.vy;
        a.pulse += 0.03;
        if (a.x < 0 || a.x > width) a.vx *= -1;
        if (a.y < 0 || a.y > height) a.vy *= -1;

        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.22;
            ctx.strokeStyle = `rgba(94, 234, 212, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // nodes
      for (const n of nodes) {
        const glow = 0.5 + Math.sin(n.pulse) * 0.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + glow * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(103, 232, 249, ${0.35 + glow * 0.4})`;
        ctx.fill();
      }

      // packets
      if (Math.random() < 0.14) spawnPacket();
      packets = packets.filter((p) => p.t < 1 && nodes[p.from] && nodes[p.to]);
      for (const p of packets) {
        p.t += p.speed;
        const a = nodes[p.from];
        const b = nodes[p.to];
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(191, 252, 244, 0.95)';
        ctx.shadowColor = 'rgba(94, 234, 212, 0.9)';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(draw);
    };

    resize();
    if (reduce) {
      // draw a single static frame
      draw();
      cancelAnimationFrame(raf);
    } else {
      draw();
    }

    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="cyber-bg" aria-hidden="true" />;
}
