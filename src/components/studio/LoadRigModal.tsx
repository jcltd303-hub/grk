import React, { useState, useRef } from 'react';
import { studioStore } from '../../store/studio';
import { unzipSync } from 'fflate';
import { convertSpineRig } from '../../lib/rig/spine-import';
import {
  FolderDown,
  FileCode,
  X,
  Upload,
  CheckCircle2,
  AlertCircle,
  Bone as BoneIcon,
  Film,
  Layers,
  Sparkles,
  Clipboard,
} from 'lucide-react';

interface LoadRigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedRigInfo {
  name: string;
  version: string;
  boneCount: number;
  rootId: string;
  hasEmbeddedImage: boolean;
  vertexCount?: number;
  triangleCount?: number;
  clipsCount: number;
}

export const LoadRigModal: React.FC<LoadRigModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [jsonContent, setJsonContent] = useState<string>('');
  const [jsonFileName, setJsonFileName] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [parsedInfo, setParsedInfo] = useState<ParsedRigInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadedNotice, setLoadedNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const inspectAndSetJSON = (raw: string, fileName?: string) => {
    setJsonContent(raw);
    if (fileName) setJsonFileName(fileName);
    setJsonError(null);
    setParsedInfo(null);

    const trimmed = raw.trim();
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.skeleton?.spine && !parsed.image?.dataUrl) {
        setJsonError('This is Spine rig.json. Select the full spine-rig.zip to include artwork.png.');
        return;
      }
      const info = parsed?.skeleton?.spine ? convertSpineRig(parsed) : parsed;
      if (!info.skeleton || !Array.isArray(info.skeleton.bones) || info.skeleton.bones.length === 0) {
        setJsonError('Rig format error: Missing "skeleton" or "skeleton.bones" array.');
        return;
      }

      const hasEmbedded = !!(info.image?.dataUrl || info.imageDataUrl);
      const clips = info.animations || info.clips || [];

      setParsedInfo({
        name: info.name || '2D Rig',
        version: parsed.skeleton?.spine || info.version || '1.0',
        boneCount: info.skeleton.bones.length,
        rootId: info.skeleton.rootId || info.skeleton.bones[0]?.id || 'root',
        hasEmbeddedImage: hasEmbedded,
        vertexCount: info.mesh?.vertices?.length,
        triangleCount: info.mesh?.triangles?.length,
        clipsCount: Array.isArray(clips) ? clips.length : 0,
      });
    } catch (err) {
      setJsonError(`Invalid JSON format: ${err instanceof Error ? err.message : 'Syntax error'}`);
    }
  };

  const inspectFile = async (file: File) => {
    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
        const json = files['rig.json'], png = files['artwork.png'], atlas = files['rig.atlas'];
        if (!json || !png || !atlas) throw new Error('Spine ZIP needs rig.json, rig.atlas, and artwork.png.');
        const parsed = JSON.parse(new TextDecoder().decode(json));
        if (!parsed?.skeleton?.spine) throw new Error('The ZIP does not contain a Spine rig.json.');
        const imageDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not read artwork.png.'));
          reader.readAsDataURL(new Blob([new Uint8Array(png) as BlobPart], { type: 'image/png' }));
        });
        inspectAndSetJSON(JSON.stringify({ ...parsed, image: { dataUrl: imageDataUrl } }), file.name);
      } else {
        inspectAndSetJSON(await file.text(), file.name);
      }
    } catch (error) {
      setJsonContent('');
      setParsedInfo(null);
      setJsonError(error instanceof Error ? error.message : 'Could not read rig file.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    void inspectFile(file);
  };

  const handleLoadStarterRig = async () => {
    setIsLoading(true);
    setJsonError(null);
    const success = await studioStore.loadStarterRig();
    setIsLoading(false);
    if (success) {
      setLoadedNotice('Loaded Starter Rig with full skeleton & animation tracks!');
      setTimeout(() => {
        setLoadedNotice(null);
        onClose();
      }, 700);
    } else {
      setJsonError('Failed to load starter rig.');
    }
  };

  const handleLoadJson = async () => {
    if (!jsonContent) return;
    setIsLoading(true);
    setJsonError(null);

    const result = await studioStore.loadRigFromJSON(jsonContent);
    setIsLoading(false);

    if (result.success) {
      setLoadedNotice(
        `Successfully loaded "${result.stats?.name || 'Rig'}" (${result.stats?.bones} bones, ${result.stats?.vertices} vertices, ${result.stats?.clips} animation tracks)!`
      );
      setTimeout(() => {
        setLoadedNotice(null);
        onClose();
      }, 900);
    } else {
      setJsonError(result.error || 'Failed to parse and build rig from JSON.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 !bg-slate-950/90" role="dialog" aria-modal="true">
      <div className="!bg-slate-900 !text-slate-200 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ backgroundColor: "#0f172a", color: "#e2e8f0" }}>
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <FolderDown className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Load Rig (JSON)</h2>
              <p className="text-[11px] text-slate-400">
                Import complete 2D rig definitions with bone hierarchies, envelope widths, skinning weights, and keyframe animations.
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

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === 'upload'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload JSON File</span>
            </button>
            <button
              onClick={() => setActiveTab('paste')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === 'paste'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>Paste JSON Text</span>
            </button>
          </div>

          <button
            id="btn_load_starter_rig"
            onClick={handleLoadStarterRig}
            disabled={isLoading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
            title="Load a complete starter rig to test bone articulation and animations"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Starter Rig</span>
          </button>
        </div>

        {/* Notification Banner */}
        {loadedNotice && (
          <div className="m-4 mb-0 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="font-medium">{loadedNotice}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {activeTab === 'upload' ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  void inspectFile(file);
                }
              }}
              className="bg-slate-800/40 border border-dashed border-slate-700/80 hover:border-amber-500/60 rounded-xl p-6 text-center space-y-3 transition"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json,.zip,application/json,application/zip"
                className="hidden"
              />

              <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Upload className="w-6 h-6" />
              </div>

              <div>
                <p className="text-xs font-semibold text-white">
                  Drop a Spine ZIP or Rig Definition JSON here
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Restores complete bone hierarchy, envelope widths, vertex weights, and animation tracks.
                </p>
              </div>

              <button
                type="button"
                id="btn_choose_rig_json"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition"
              >
                <FileCode className="w-3.5 h-3.5 text-amber-400" />
                <span>{jsonFileName ? 'Change JSON File' : 'Browse JSON File'}</span>
              </button>

              {jsonFileName && (
                <div className="text-xs font-mono text-amber-300 bg-slate-950/60 py-1 px-3 rounded-lg border border-slate-800 inline-block">
                  Selected: {jsonFileName}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>Paste Rig Definition JSON</span>
                <span className="text-[11px] text-slate-400 font-normal">
                  Format: version 2.0 or 1.0 JSON
                </span>
              </label>
              <textarea
                value={jsonContent}
                onChange={(e) => inspectAndSetJSON(e.target.value)}
                placeholder='{\n  "version": "2.0",\n  "name": "My Rig",\n  "skeleton": { ... },\n  "mesh": { ... },\n  "animations": [ ... ]\n}'
                rows={7}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 custom-scrollbar resize-none"
              />
            </div>
          )}

          {/* Validation Error */}
          {jsonError && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{jsonError}</span>
            </div>
          )}

          {/* Parsed Inspection Card */}
          {parsedInfo && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">{parsedInfo.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded">
                    v{parsedInfo.version}
                  </span>
                </div>
                <span className="text-[11px] text-emerald-400 font-medium">Valid Rig Specification</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-400 text-[10px] mb-0.5">
                    <BoneIcon className="w-3 h-3 text-sky-400" />
                    <span>Bones</span>
                  </div>
                  <div className="text-sm font-bold text-white font-mono">{parsedInfo.boneCount}</div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-400 text-[10px] mb-0.5">
                    <Layers className="w-3 h-3 text-emerald-400" />
                    <span>Skinning Mesh</span>
                  </div>
                  <div className="text-sm font-bold text-white font-mono">
                    {parsedInfo.vertexCount ? `${parsedInfo.vertexCount} verts` : 'Auto-Rigged'}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-400 text-[10px] mb-0.5">
                    <Film className="w-3 h-3 text-purple-400" />
                    <span>Animations</span>
                  </div>
                  <div className="text-sm font-bold text-white font-mono">{parsedInfo.clipsCount} clips</div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="text-slate-400 text-[10px] mb-0.5">Texture</div>
                  <div className="text-xs font-semibold text-amber-300 truncate">
                    {parsedInfo.hasEmbeddedImage ? 'Embedded PNG' : 'Current Canvas'}
                  </div>
                </div>
              </div>

              <button
                id="btn_confirm_load_rig_json"
                onClick={handleLoadJson}
                disabled={isLoading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Load Rig & Enter Pose Mode</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between text-xs text-slate-400">
          <span>Supported: Spine ZIP and Studio Rig JSON (v2.0 & v1.0).</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
