/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
  z?: number;
}

interface HandOverlayProps {
  landmarksList: Point[][]; // MediaPipe results containing landmark coordinates
  mode: 'overlay' | 'floating' | 'hidden';
  isActive: boolean;
}

export const HandOverlay: React.FC<HandOverlayProps> = ({ landmarksList, mode, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (mode === 'hidden' || !isActive || !landmarksList || landmarksList.length === 0) {
      return;
    }

    landmarksList.forEach((landmarks) => {
      if (!landmarks || landmarks.length < 21) return;

      const thumb = landmarks[4];
      const index = landmarks[8];

      if (thumb && index) {
        // Map normalized mirrored coordinates to canvas space
        const tx = (1.0 - thumb.x) * canvas.width;
        const ty = thumb.y * canvas.height;
        const ix = (1.0 - index.x) * canvas.width;
        const iy = index.y * canvas.height;

        // Calculate direct 3D physical distance
        const dist3D = Math.hypot(
          thumb.x - index.x,
          thumb.y - index.y,
          thumb.z - index.z || 0.0
        );

        // Identify Hand (mirror horizontally, so left part is Left Hand)
        const wrist = landmarks[0];
        const isLeftHand = (1.0 - wrist.x) < 0.5;

        // 1. Draw direct connect line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(ix, iy);
        ctx.stroke();

        const mx = (tx + ix) / 2;
        const my = (ty + iy) / 2;

        // 3. Draw clean solid white tip dots
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(ix, iy, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // 4. Subtle glowing halos on interaction ends
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(tx, ty, 6.0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ix, iy, 6.0, 0, Math.PI * 2);
        ctx.stroke();

        // 5. Render real-time precise telemetry parameters
        ctx.font = '9px "JetBrains Mono", "Fira Code", monospace';
        ctx.textBaseline = 'middle';

        const drawLabel = (text: string, px: number, py: number, align: 'left' | 'center' | 'right' = 'left') => {
          ctx.textAlign = align;
          const textWidth = ctx.measureText(text).width;
          const padX = 4;
          const padY = 2;
          const bgW = textWidth + padX * 2;
          const bgH = 11 + padY * 2;

          ctx.fillStyle = 'rgba(10, 10, 12, 0.72)';
          const bx = align === 'center' ? px - bgW / 2 : align === 'right' ? px - bgW : px;
          ctx.fillRect(bx, py - bgH / 2, bgW, bgH);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText(text, px, py);
        };

        if (isLeftHand) {
          // L1 Pinch volume normalization range [0.02, 0.28]
          const minPinch = 0.02;
          const maxPinch = 0.28;
          const t = (dist3D - minPinch) / (maxPinch - minPinch);
          const volPct = Math.max(0, Math.min(100, Math.round(t * 100)));
          const radiusVal = (Math.max(0, Math.min(1, t)) * 50.0).toFixed(1);

          // Render L1 labels elegantly next to midpoint
          drawLabel(`L1: ${dist3D.toFixed(3)}`, mx + 10, my - 7, 'left');
          drawLabel(`Vol: ${volPct}%`, mx + 10, my + 7, 'left');
        } else {
          // Right hand L2 rotation trigonometry
          const dx = index.x - thumb.x;
          const dy = index.y - thumb.y;
          let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
          if (angleDeg < 0) angleDeg += 360;

          // Render L2 and Spin labels comfortably next to midpoint
          drawLabel(`L2: ${dist3D.toFixed(3)}`, mx + 10, my - 7, 'left');
          drawLabel(`Spin: ${angleDeg.toFixed(0)}°`, mx + 10, my + 7, 'left');
        }
      }
    });
  }, [landmarksList, mode, isActive]);

  if (mode === 'hidden') return null;

  const containerClasses =
    mode === 'floating'
      ? 'absolute bottom-8 right-8 w-64 h-48 bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden shadow-inner backdrop-blur-md transition-all duration-300 z-40'
      : 'absolute inset-0 w-full h-full pointer-events-none transition-all duration-300 z-30';

  return (
    <div className={containerClasses} id="hand-overlay-window">
      {mode === 'floating' && (
        <div className="absolute top-3 left-4 flex items-center gap-2 pointer-events-none z-50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest uppercase text-white/50 font-medium select-none">
            Optical Trace
          </span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={mode === 'floating' ? 256 : window.innerWidth}
        height={mode === 'floating' ? 192 : window.innerHeight}
        className="w-full h-full block"
      />
    </div>
  );
};
