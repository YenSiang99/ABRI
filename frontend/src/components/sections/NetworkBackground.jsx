import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

// A quiet picture of what ABRI is: yellow nodes drifting behind the hero,
// joined by faint lines whenever two come close, like businesses meeting
// through the network. Drawn on a canvas, kept faint and faded out behind the
// headline (the mask below), so it reads as texture rather than motion.
//
// Cheap by design: about one node per 22,000 px² (capped at 70), a plain
// pairwise distance check, no blur or shadows. It stops drawing while the
// hero is off screen or the tab is hidden, and draws one still frame for
// visitors who prefer reduced motion.

const LINK_DISTANCE = 170; // px at which two nodes start to connect
const SPEED = 9; // px per second, roughly

function NetworkBackground({ className, style }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let nodes = [];
    let frame = 0;
    let visible = true;
    let last = performance.now();

    // The brand yellow from the theme, so it follows any palette change.
    // Light mode draws the lines in the deeper gold: the plain yellow all but
    // vanishes against the cream background.
    const rootStyle = getComputedStyle(document.documentElement);
    const rgb = (name, fallback) => {
      const hex = rootStyle.getPropertyValue(name).trim() || fallback;
      return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
    };
    const yellow = rgb("--yellow", "#fbbf24");
    const gold = rgb("--yellow-hi", "#f59e0b");
    const isDark = () => document.documentElement.classList.contains("dark");

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Denser on a narrow screen, where the hero is small and a desktop
      // density would leave only a handful of nodes.
      const density = width < 640 ? 11000 : 22000;
      const count = Math.min(70, Math.round((width * height) / density));
      nodes = Array.from({ length: count }, (_, i) => {
        const old = nodes[i];
        const angle = Math.random() * Math.PI * 2;
        const speed = SPEED * (0.4 + Math.random() * 0.8);
        return {
          x: old ? Math.min(old.x, width) : Math.random() * width,
          y: old ? Math.min(old.y, height) : Math.random() * height,
          vx: old ? old.vx : Math.cos(angle) * speed,
          vy: old ? old.vy : Math.sin(angle) * speed,
          size: old ? old.size : 1.4 + Math.random() * 1.6,
        };
      });
    }

    function draw(dt) {
      ctx.clearRect(0, 0, width, height);
      const dark = isDark();
      const line = dark ? yellow : gold;
      const lineAlpha = dark ? 0.35 : 0.45;

      for (const n of nodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
        n.x = Math.max(0, Math.min(width, n.x));
        n.y = Math.max(0, Math.min(height, n.y));
      }

      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d = Math.hypot(dx, dy);
          if (d < LINK_DISTANCE) {
            ctx.strokeStyle = `rgba(${line},${(1 - d / LINK_DISTANCE) * lineAlpha})`;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = `rgba(${dark ? yellow : gold},${dark ? 0.7 : 0.6})`;
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function loop(now) {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      draw(dt);
      frame = visible ? requestAnimationFrame(loop) : 0;
    }

    resize();
    if (still) {
      draw(0);
    } else {
      frame = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (still) draw(0);
    });
    ro.observe(canvas);

    // Only animate while the hero is on screen.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !still && !frame) {
        last = performance.now();
        frame = requestAnimationFrame(loop);
      }
    });
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={style}
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 size-full",
        // Clear behind the headline and search, the network showing towards
        // the sides and edges.
        "min-[640px]:[mask-image:radial-gradient(ellipse_42%_48%_at_50%_34%,transparent_35%,#000_100%)]",
        // On a phone the copy spans the full width, so there are no clear
        // sides to keep it to: it shows across the whole hero, at a third of
        // its strength behind the copy and in full above and around the photo.
        "max-[639px]:[mask-image:linear-gradient(to_bottom,#000_0,rgba(0,0,0,0.35)_56px,rgba(0,0,0,0.35)_calc(100%-260px),#000_calc(100%-180px))]",
        className,
      )}
    />
  );
}

export { NetworkBackground };
