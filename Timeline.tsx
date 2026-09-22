import React, { useRef } from 'react';
import { useStudioStore, studioStore } from '../../store/studio';
import { Play, Pause, Plus, Clock, FastForward } from 'lucide-react';

export const Timeline: React.FC = () => {
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const currentTime = useStudioStore((s) => s.currentTime);
  const playbackSpeed = useStudioStore((s) => s.playbackSpeed);
  const clips = useStudioStore((s) => s.clips);
  const activeClipId = useStudioStore((s) => s.activeClipId);

  const activeClip = clips.find((c) => c.id === activeClipId);
  const duration = activeClip ? activeClip.duration : 2.0;

  const trackRef = useRef<HTMLDivElement | null>(null);
  const isScrubbing = useRef(false);

  const seekFromPointer = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    studioStore.seek(ratio * duration);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isScrubbing.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing.current) return;
    seekFromPointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isScrubbing.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  const speeds = [0.5, 1.0, 1.5, 2.0];
  const cycleSpeed = () => {
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    studioStore.setPlaybackSpeed(speeds[nextIdx]);
  };

  return (
    <div className="h-16 md:h-18 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex flex-col justify-between px-3 sm:px-4 md:px-6 py-1.5 md:py-2 shrink-0 select-none z-10 text-slate-200">
      {/* Top Controls: Playback, Timing, Keyframing */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: Playback buttons & Time */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <button
            id="btn_timeline_play_pause"
            onClick={() => (isPlaying ? studioStore.pause() : studioStore.play())}
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition shrink-0 ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-sky-500 hover:bg-sky-600 text-white'
            }`}
            title={isPlaying ? 'Pause Animation' : 'Play Animation'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5" />}
          </button>

          {/* Time Readout */}
          <div className="flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-slate-950/70 rounded-lg border border-slate-800 text-[11px] sm:text-xs font-mono shrink-0">
            <Clock className="w-3 h-3 text-slate-400 hidden xs:inline" />
            <span className="text-white font-semibold">{currentTime.toFixed(2)}s</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{duration.toFixed(2)}s</span>
          </div>

          {/* Speed Selector (Cycle on mobile, pill row on md) */}
          <button
            onClick={cycleSpeed}
            className="md:hidden px-2 py-0.5 bg-slate-950/70 rounded-lg border border-slate-800 text-[11px] font-mono text-sky-400 hover:text-white shrink-0"
            title="Tap to change playback speed"
          >
            {playbackSpeed}x
          </button>

          <div className="hidden md:flex items-center gap-0.5 bg-slate-950/70 rounded-lg border border-slate-800 p-0.5 text-xs">
            {speeds.map((s) => (
              <button
                key={s}
                onClick={() => studioStore.setPlaybackSpeed(s)}
                className={`px-1.5 py-0.5 rounded font-medium transition ${
                  playbackSpeed === s
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Center: Active Clip Name (truncated on mobile) */}
        <div className="text-[11px] sm:text-xs font-medium text-slate-400 truncate max-w-[130px] sm:max-w-[220px]">
          <span className="hidden sm:inline">Track: </span>
          <span className="text-sky-400 font-semibold">{activeClip?.name || 'Default'}</span>
        </div>

        {/* Right: Keyframing actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            id="btn_add_keyframe"
            onClick={() => studioStore.addKeyframeAtCurrentTime()}
            className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-sky-400 hover:text-sky-300 rounded-lg sm:rounded-xl text-xs font-medium flex items-center gap-1 transition"
            title="Record current pose as Keyframe at playhead"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Keyframe</span>
            <span className="xs:hidden">Key</span>
          </button>
        </div>
      </div>

      {/* Scrubbable Timeline Track */}
      <div
        id="timeline_scrub_track"
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative h-5 md:h-6 bg-slate-950/90 rounded-md sm:rounded-lg border border-slate-800 cursor-pointer overflow-hidden flex items-center touch-none"
      >
        {/* Subtle frame tick markings */}
        <div className="absolute inset-0 flex justify-between pointer-events-none px-2 opacity-20">
          {Array.from({ length: 21 }).map((_, i) => (
            <div key={i} className="h-full w-px bg-slate-600" />
          ))}
        </div>

        {/* Elapsed Time fill */}
        <div
          className="absolute left-0 top-0 bottom-0 bg-sky-500/20 pointer-events-none"
          style={{ width: `${(currentTime / duration) * 100}%` }}
        />

        {/* Keyframe Diamonds */}
        {activeClip?.keyframes.map((kf) => {
          const leftPct = (kf.time / duration) * 100;
          return (
            <div
              key={kf.id}
              onClick={(e) => {
                e.stopPropagation();
                studioStore.seek(kf.time);
              }}
              title={`Keyframe at ${kf.time.toFixed(2)}s`}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 sm:w-3.5 sm:h-3.5 bg-amber-400 hover:bg-amber-300 border border-slate-950 rotate-45 rounded-xs shadow-md z-10 transition transform hover:scale-125 cursor-pointer"
              style={{ left: `${leftPct}%` }}
            />
          );
        })}

        {/* Current Playhead cursor */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-sky-400 pointer-events-none shadow-[0_0_8px_rgba(56,189,248,0.8)] z-20"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        >
          <div className="absolute -top-0.5 -left-1.5 w-4 h-2 bg-sky-400 rounded-xs" />
        </div>
      </div>
    </div>
  );
};
