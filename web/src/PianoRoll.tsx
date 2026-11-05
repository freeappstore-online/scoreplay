import { useEffect, useRef } from 'react';
import { type Song, formatTime } from './music';

export function PianoRoll({ song, time, muted, onSeek }: { song: Song; time: number; muted: Set<number>; onSeek: (time: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const windowStart = Math.floor(time / 12) * 12;
  useEffect(() => {
    const el = canvas.current!;
    const draw = () => {
      const width = el.clientWidth, height = 360, ratio = window.devicePixelRatio || 1;
      el.width = width * ratio; el.height = height * ratio;
      const ctx = el.getContext('2d')!; ctx.scale(ratio, ratio);
      const css = getComputedStyle(document.documentElement);
      const color = (token: string) => css.getPropertyValue(token).trim();
      const min = Math.max(0, song.notes.reduce((v, n) => Math.min(v, n.midi), 48) - 2);
      const max = Math.min(127, song.notes.reduce((v, n) => Math.max(v, n.midi), 72) + 2);
      const row = (height - 30) / (max - min + 1), left = 44;
      ctx.fillStyle = color('--paper'); ctx.fillRect(0, 0, width, height);
      ctx.font = '10px Manrope, sans-serif';
      for (let p = min; p <= max; p++) {
        const y = 30 + (max - p) * row;
        const black = [1,3,6,8,10].includes(p % 12);
        ctx.fillStyle = color(black ? '--paper-deep' : '--paper'); ctx.fillRect(left, y, width - left, row);
        ctx.fillStyle = color(black ? '--ink' : '--panel'); ctx.fillRect(0, y, left - 4, row - .5);
        if (p % 12 === 0) { ctx.fillStyle = color('--muted'); ctx.fillText(`C${Math.floor(p / 12) - 1}`, 8, y + row - 1); }
        ctx.strokeStyle = color('--line'); ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width, y); ctx.stroke();
      }
      for (let s = 0; s <= 12; s += 2) {
        const x = left + s / 12 * (width - left);
        ctx.fillStyle = color('--muted'); ctx.fillText(formatTime(windowStart + s), x + 3, 17);
        ctx.strokeStyle = color('--line-strong'); ctx.beginPath(); ctx.moveTo(x, 25); ctx.lineTo(x, height); ctx.stroke();
      }
      const colors = ['--accent', '--mint', '--sky', '--warning'];
      for (const n of song.notes) {
        if (n.time > windowStart + 12) break;
        if (n.time + n.duration < windowStart) continue;
        const x = left + Math.max(0, n.time - windowStart) / 12 * (width - left);
        const w = Math.min(width, left + (n.time + n.duration - windowStart) / 12 * (width - left)) - x;
        ctx.globalAlpha = muted.has(n.track) ? .15 : n.time <= time && n.time + n.duration > time ? 1 : .65;
        ctx.fillStyle = color(colors[n.track % colors.length]);
        ctx.fillRect(x, 30 + (max - n.midi) * row + 1, Math.max(w, 2), Math.max(2, row - 2));
      }
      ctx.globalAlpha = 1;
      const x = left + (time - windowStart) / 12 * (width - left);
      ctx.strokeStyle = color('--ink'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 26); ctx.lineTo(x, height); ctx.stroke();
    };
    const observer = new ResizeObserver(draw); observer.observe(el);
    const theme = new MutationObserver(draw); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    draw(); return () => { observer.disconnect(); theme.disconnect(); };
  }, [song, time, muted, windowStart]);
  return <canvas ref={canvas} className="block h-[360px] w-full cursor-crosshair" aria-label="Piano roll showing MIDI notes by pitch and time. Use the playback position slider to seek with a keyboard." onClick={event => {
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(windowStart + Math.max(0, (event.clientX - rect.left - 44) / (rect.width - 44)) * 12);
  }} />;
}
