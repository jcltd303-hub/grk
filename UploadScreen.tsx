import React, { useState, useRef } from 'react';
import { studioStore } from '../../store/studio';
import { removeImageBackground } from '../../lib/rig/bg-remove';
import { PresetType } from '../../lib/rig/types';
import { Upload, X, Wand2, Image as ImageIcon, Sparkles } from 'lucide-react';

interface UploadScreenProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UploadScreen: React.FC<UploadScreenProps> = ({ isOpen, onClose }) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [autoRemoveBg, setAutoRemoveBg] = useState(true);
  const [bgThreshold, setBgThreshold] = useState(30);
  const [autoRig, setAutoRig] = useState(true);
  const [presetType, setPresetType] = useState<PresetType>('human');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setSelectedFileUrl(dataUrl);

      // Process image for background removal if requested
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        if (autoRemoveBg) {
          const { canvas } = removeImageBackground(img, bgThreshold);
          setProcessedUrl(canvas.toDataURL('image/png'));
        } else {
          setProcessedUrl(dataUrl);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCustom = () => {
    const finalUrl = processedUrl || selectedFileUrl;
    if (!finalUrl) return;

    studioStore.loadCustomImage(finalUrl, presetType, autoRig);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-white">Import Artwork</h2>
              <p className="text-[11px] text-slate-400">
                Load any 2D sprite or illustration to mesh and rig directly in the studio.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center ${
              dragOver
                ? 'border-sky-500 bg-sky-500/10'
                : 'border-slate-700/80 hover:border-slate-600 bg-slate-800/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
              }}
            />

            {processedUrl || selectedFileUrl ? (
              <div className="space-y-3">
                <div className="w-40 h-40 mx-auto bg-slate-950/70 rounded-xl p-2 border border-slate-700 flex items-center justify-center overflow-hidden">
                  <img
                    src={processedUrl || selectedFileUrl || ''}
                    alt="Preview"
                    className="max-h-full max-w-full object-contain filter drop-shadow"
                  />
                </div>
                <p className="text-xs text-slate-300 font-medium">Click to choose another image</p>
              </div>
            ) : (
              <div className="space-y-2 py-4">
                <div className="w-12 h-12 bg-sky-500/20 text-sky-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-white">Drag & drop your 2D artwork here</p>
                <p className="text-xs text-slate-400">Supports transparent PNG, JPG, WebP, or SVG</p>
              </div>
            )}
          </div>

          {/* Automatic Rigging Options */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-white cursor-pointer">
                <input
                  type="checkbox"
                  id="chk_auto_rig_on_import"
                  checked={autoRig}
                  onChange={(e) => setAutoRig(e.target.checked)}
                  className="accent-sky-500 rounded"
                />
                <span className="flex items-center gap-1.5 font-semibold text-sky-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  Auto-Rig Character (Create Bones, Fit Widths & Bind Weights)
                </span>
              </label>
            </div>
            <p className="text-[11px] text-slate-400 pl-5">
              Automatically creates bones fitted to the character silhouette, optimizes bone envelope widths, and computes smooth skinning weights.
            </p>

            {autoRig && (
              <div className="pl-5 pt-1 flex items-center gap-2.5">
                <span className="text-xs text-slate-300 font-medium">Skeleton Template:</span>
                <select
                  id="select_auto_rig_type"
                  value={presetType}
                  onChange={(e) => setPresetType(e.target.value as PresetType)}
                  className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1 focus:outline-none focus:border-sky-500"
                >
                  <option value="human">Humanoid / Biped</option>
                  <option value="biped">Mech Robot Biped</option>
                  <option value="quadruped">Quadruped Beast (4 Legs)</option>
                  <option value="fish">Aquatic / Fish Creature</option>
                </select>
              </div>
            )}
          </div>

          {/* Background Cleaner Options */}
          {(selectedFileUrl || processedUrl) && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-medium text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRemoveBg}
                    onChange={(e) => {
                      setAutoRemoveBg(e.target.checked);
                      if (selectedFileUrl) {
                        const img = new Image();
                        img.src = selectedFileUrl;
                        img.onload = () => {
                          if (e.target.checked) {
                            const { canvas } = removeImageBackground(img, bgThreshold);
                            setProcessedUrl(canvas.toDataURL('image/png'));
                          } else {
                            setProcessedUrl(selectedFileUrl);
                          }
                        };
                      }
                    }}
                    className="accent-sky-500 rounded"
                  />
                  <span>Smart Background Cutout (Make Solid Backgrounds Transparent)</span>
                </label>
              </div>

              {autoRemoveBg && (
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Cutout Tolerance</span>
                    <span className="font-mono text-sky-400">{bgThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="80"
                    value={bgThreshold}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setBgThreshold(val);
                      if (selectedFileUrl) {
                        const img = new Image();
                        img.src = selectedFileUrl;
                        img.onload = () => {
                          const { canvas } = removeImageBackground(img, val);
                          setProcessedUrl(canvas.toDataURL('image/png'));
                        };
                      }
                    }}
                    className="w-full accent-sky-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            id="btn_load_artwork_confirm"
            disabled={!selectedFileUrl && !processedUrl}
            onClick={handleApplyCustom}
            className="px-5 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition shadow-lg shadow-sky-500/20 flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Load Artwork into Studio</span>
          </button>
        </div>
      </div>
    </div>
  );
};
