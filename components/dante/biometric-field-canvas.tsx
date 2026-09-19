"use client";

import { useEffect, useRef } from "react";

type Particle = {
  baseX: number;
  baseY: number;
  omegaX: number;
  phi: number;
  amplitudeX: number;
  speedY: number;
  radius: number;
  color: string;
};

export function BiometricFieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number | null = null;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let isReducedMotion = false;

    if (typeof window !== "undefined") {
      isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function initParticles(w: number, h: number) {
      const isMobile = w < 768;
      const count = isMobile ? 18 : 30;
      const newParticles: Particle[] = [];

      for (let i = 0; i < count; i++) {
        const randType = Math.random();
        let color = "rgba(255, 255, 255, 0.35)"; // 70% Neutral
        if (randType > 0.9) {
          color = "rgba(168, 85, 247, 0.55)"; // 10% Violet
        } else if (randType > 0.7) {
          color = "rgba(212, 255, 0, 0.65)"; // 20% Lime
        }

        newParticles.push({
          baseX: Math.random() * w,
          baseY: Math.random() * h,
          omegaX: 0.001 + Math.random() * 0.002,
          phi: Math.random() * Math.PI * 2,
          amplitudeX: 8 + Math.random() * 16,
          speedY: 0.15 + Math.random() * 0.35,
          radius: 0.75 + Math.random() * 0.75,
          color,
        });
      }
      particles = newParticles;
    }

    function handleResize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx?.scale(dpr, dpr);

      initParticles(width, height);
    }

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(canvas);
    handleResize();

    function render(time: number) {
      if (document.hidden) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const elapsed = time;
      ctx!.clearRect(0, 0, width, height);

      // --- 1. PROCEDURAL 36px ORTHOGRAPHIC GRID WITH RADIAL FALLOFF ---
      const gridSpacing = 36;
      const centerX = width / 2;
      const centerY = height * 0.35; // centered around Dante's spatial zone

      // Draw grid
      ctx!.save();
      ctx!.strokeStyle = "rgba(255, 255, 255, 0.025)";
      ctx!.lineWidth = 1;
      ctx!.beginPath();

      for (let x = 0; x <= width; x += gridSpacing) {
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, height);
      }
      for (let y = 0; y <= height; y += gridSpacing) {
        ctx!.moveTo(0, y);
        ctx!.lineTo(width, y);
      }
      ctx!.stroke();

      // Apply radial visibility mask (0-200px transparent around Dante)
      const maxRadius = Math.max(width, height) * 0.75;
      const maskGradient = ctx!.createRadialGradient(
        centerX,
        centerY,
        140,
        centerX,
        centerY,
        maxRadius
      );
      maskGradient.addColorStop(0, "rgba(4, 5, 7, 0.95)");
      maskGradient.addColorStop(0.25, "rgba(4, 5, 7, 0.4)");
      maskGradient.addColorStop(1, "rgba(4, 5, 7, 0)");

      ctx!.globalCompositeOperation = "destination-out";
      ctx!.fillStyle = maskGradient;
      ctx!.fillRect(0, 0, width, height);
      ctx!.restore();

      // --- 2. MICRO-PARTICLE FIELD ---
      if (!isReducedMotion) {
        ctx!.save();
        for (const p of particles) {
          const currentX = p.baseX + Math.sin(elapsed * p.omegaX + p.phi) * p.amplitudeX;
          const currentY = (p.baseY - (elapsed * 0.02 * p.speedY) % height + height) % height;

          ctx!.fillStyle = p.color;
          ctx!.shadowColor = p.color;
          ctx!.shadowBlur = 4;
          ctx!.beginPath();
          ctx!.arc(currentX, currentY, p.radius, 0, Math.PI * 2);
          ctx!.fill();
        }
        ctx!.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    }

    animationFrameId = requestAnimationFrame(render);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 size-full pointer-events-none z-0"
    />
  );
}
