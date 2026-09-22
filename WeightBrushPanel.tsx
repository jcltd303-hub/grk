import React from 'react';
import { useStudioStore, studioStore } from '../../store/studio';
import { WeightBrushMode } from '../../lib/rig/types';
import {
  Paintbrush,
  Sparkles,
  RotateCcw,
  Sliders,
  CheckCircle2,
  HelpCircle,
  Eye,
  Wand2,
} from 'lucide-react';

export const WeightBrushPanel: React.FC = () => {
  const skeleton = useStudioStore((s) => s.skeleton);
  const selectedBoneId = useStudioStore((s) => s.selectedBoneId);
  const mesh = useStudioStore((s) => s.mesh);
  const weightBrushSettings = useStudioStore((s) => s.weightBrushSettings);
  const showWeights = useStudioStore((s) => s.showWeights);

  const selectedBone = skeleton?.bones.find((b) => b.id === selectedBoneId) || null;

  const modes: { id: WeightBrushMode; label: string; desc: string; icon: string; color: string }[] = [
    {
      id: 'add',
      label: 'Add (+)',
      desc: 'Increase vertex weight towards target',
      icon: '+',
      color: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    },
    {
      id: 'subtract',
      label: 'Subtract (-)',
      desc: 'Reduce influence of current bone',
      icon: '-',
      color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    },
    {
      id: 'smooth',
      label: 'Smooth (~)',
      desc: 'Laplacian average with neighbors',
      icon: '~',
      color: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    },
    {
      id: 'set',
      label: 'Set (=)',
      desc: 'Directly stamp target weight value',
      icon: '=',
      color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    },
  ];

  return (
    <div className="space-y-3.5 text-xs text-slate-200">
      {/* Header & Weight Heatmap Toggle */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Paintbrush className="w-3.5 h-3.5 text-sky-400" />
          Vertex Skinning Brush
        </span>
        <button
          onClick={() => studioStore.toggleView('showWeights')}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-medium flex items-center gap-1 transition ${
            showWeights
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
          }`}
        >
          <Eye className="w-3 h-3" />
          <span>Heatmap: {showWeights ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Target Active Bone Banner */}
      {selectedBone ? (
        <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20"
              style={{ backgroundColor: selectedBone.color }}
            />
            <div className="min-w-0">
              <span className="font-semibold text-white truncate block">
                {selectedBone.name}
              </span>
              <span className="text-[10px] text-slate-400">Painting influence for this bone</span>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded border border-sky-500/30">
            Active
          </span>
        </div>
      ) : (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs">
          Please select a bone from the viewport or skeleton hierarchy to paint its vertex weights.
        </div>
      )}

      {/* Brush Mode Selector */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-400 block px-0.5">
          Brush Mode
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {modes.map((m) => {
            const isSelected = weightBrushSettings.mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => studioStore.setWeightBrushSettings({ mode: m.id })}
                className={`py-2 px-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                  isSelected
                    ? `${m.color} shadow-sm font-semibold`
                    : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span className="font-mono text-sm font-bold w-4 text-center shrink-0">
                  {m.icon}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-xs">{m.label}</div>
                  <div className="text-[9px] opacity-70 truncate">{m.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Brush Radius Slider */}
      <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-300 font-medium">Brush Radius</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                studioStore.setWeightBrushSettings({
                  radius: Math.max(5, weightBrushSettings.radius - 5),
                })
              }
              className="px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono"
            >
              -
            </button>
            <span className="font-mono text-white font-semibold text-[11px] w-8 text-center">
              {Math.round(weightBrushSettings.radius)}px
            </span>
            <button
              onClick={() =>
                studioStore.setWeightBrushSettings({
                  radius: Math.min(200, weightBrushSettings.radius + 5),
                })
              }
              className="px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono"
            >
              +
            </button>
          </div>
        </div>
        <input
          type="range"
          id="slider_weight_brush_radius"
          min="5"
          max="160"
          value={weightBrushSettings.radius}
          onChange={(e) =>
            studioStore.setWeightBrushSettings({ radius: Number(e.target.value) })
          }
          className="w-full accent-sky-500 cursor-pointer"
        />
        <div className="flex items-center justify-between text-[9px] text-slate-500">
          <span>Fine (5px)</span>
          <span>Medium (45px)</span>
          <span>Broad (160px)</span>
        </div>
      </div>

      {/* Brush Intensity Slider */}
      <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-300 font-medium">Brush Intensity (Hardness)</span>
          <span className="font-mono text-white font-semibold text-[11px]">
            {Math.round(weightBrushSettings.intensity * 100)}%
          </span>
        </div>
        <input
          type="range"
          id="slider_weight_brush_intensity"
          min="0.05"
          max="1.0"
          step="0.05"
          value={weightBrushSettings.intensity}
          onChange={(e) =>
            studioStore.setWeightBrushSettings({ intensity: Number(e.target.value) })
          }
          className="w-full accent-sky-500 cursor-pointer"
        />
      </div>

      {/* Target Weight Value Slider (if Set mode) */}
      {weightBrushSettings.mode === 'set' && (
        <div className="p-2.5 bg-slate-900/80 rounded-xl border border-amber-500/30 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-amber-300 font-medium">Target Weight Value</span>
            <span className="font-mono text-white font-semibold text-[11px]">
              {(weightBrushSettings.targetWeight ?? 1.0).toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            id="slider_weight_brush_target"
            min="0"
            max="1.0"
            step="0.05"
            value={weightBrushSettings.targetWeight ?? 1.0}
            onChange={(e) =>
              studioStore.setWeightBrushSettings({ targetWeight: Number(e.target.value) })
            }
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>
      )}

      {/* Quick Action Helpers */}
      <div className="space-y-1.5 pt-1">
        <label className="text-[11px] font-medium text-slate-400 block px-0.5">
          Weight Batch Utilities
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            id="btn_smooth_all_weights"
            onClick={() => studioStore.smoothAllWeightsForBone()}
            disabled={!selectedBone}
            title="Apply Laplacian smoothing to all vertices influenced by this bone"
            className="py-2 px-2 bg-slate-800/80 hover:bg-slate-750 disabled:opacity-30 disabled:pointer-events-none text-slate-200 hover:text-white rounded-xl text-xs font-medium border border-slate-700/60 flex items-center justify-center gap-1.5 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Smooth Bone</span>
          </button>

          <button
            id="btn_recalc_auto_weights"
            onClick={() => studioStore.recomputeWeights()}
            title="Reset to geometric envelope auto-weights"
            className="py-2 px-2 bg-slate-800/80 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl text-xs font-medium border border-slate-700/60 flex items-center justify-center gap-1.5 transition"
          >
            <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Auto-Weights</span>
          </button>
        </div>
      </div>

      {/* Visual Color Legend Guide */}
      <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
          <span>Heatmap Legend</span>
          <span className="text-slate-500">Vertex Weight</span>
        </div>
        <div className="h-2.5 rounded-full w-full bg-gradient-to-r from-blue-500 via-yellow-400 to-red-500 shadow-inner" />
        <div className="flex justify-between text-[9px] text-slate-500 font-mono">
          <span>0.0 (None)</span>
          <span>0.5 (Mid)</span>
          <span>1.0 (Full)</span>
        </div>
      </div>
    </div>
  );
};
