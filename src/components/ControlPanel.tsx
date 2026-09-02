/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Camera, 
  CameraOff, 
  RefreshCw, 
  Settings2, 
  Maximize2,
  Upload,
  Image as ImageIcon,
  X,
  Music,
  Play,
  Pause,
  Mic,
  Activity,
  Volume2,
  VolumeX,
  Monitor
} from 'lucide-react';
import { TrackingMetrics, CircleColors } from '../types';

interface ControlPanelProps {
  skeletonMode: 'overlay' | 'floating' | 'hidden';
  onSkeletonModeChange: (mode: 'overlay' | 'floating' | 'hidden') => void;
  
  isCameraActive: boolean;
  onToggleCamera: () => void;
  
  trackingMetrics: TrackingMetrics;

  cols: number;
  rows: number;
  onTriggerGrowth: () => void;
  onResetGrid: () => void;

  onImageChange: (img: HTMLImageElement | null) => void;
  hasImage: boolean;

  circleColors: CircleColors;
  onCircleColorsChange: (colors: CircleColors) => void;

  // Audio state integrations
  audioFileName: string;
  activeAudioSource: 'none' | 'file' | 'mic' | 'synth' | 'system';
  onSelectAudioSource: (source: 'none' | 'file' | 'mic' | 'synth' | 'system') => void;
  isAudioPlaying: boolean;
  onToggleAudioPlayback: () => void;
  volumeScale: number;
  onVolumeScaleChange: (v: number) => void;
  onAudioUpload: (file: File) => void;
  visualMode: 'concentric' | 'scattered' | 'dispersed' | 'random' | 'hyperbolic' | 'orbit';
  onVisualModeChange: (mode: 'concentric' | 'scattered' | 'dispersed' | 'random' | 'hyperbolic' | 'orbit') => void;
  mode2Settings: {
    minSpacing: number;
    maxSpacing: number;
    maxAmplitude: number;
    unifiedDiameter: number;
    breathingPeriod: number;
  };
  onMode2SettingsChange: (settings: {
    minSpacing: number;
    maxSpacing: number;
    maxAmplitude: number;
    unifiedDiameter: number;
    breathingPeriod: number;
  }) => void;
  mode3Spacings: {
    layer0: number;
    layer1: number;
    layer2: number;
    layer3: number;
    layer4: number;
    layer5: number;
  };
  onMode3SpacingsChange: (spacings: {
    layer0: number;
    layer1: number;
    layer2: number;
    layer3: number;
    layer4: number;
    layer5: number;
  }) => void;
  mode5Settings: {
    m5Speed: number;
    curveSpacing: number;
    circleSpacing: number;
    concentricScale: number;
    swapCount: number;
    innermostRadius: number;
    spacing1to2: number;
    spacing2to3: number;
    spacing3to4: number;
    spacing4to5: number;
  };
  onMode5SettingsChange: (settings: {
    m5Speed: number;
    curveSpacing: number;
    circleSpacing: number;
    concentricScale: number;
    swapCount: number;
    innermostRadius: number;
    spacing1to2: number;
    spacing2to3: number;
    spacing3to4: number;
    spacing4to5: number;
  }) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  skeletonMode,
  onSkeletonModeChange,
  isCameraActive,
  onToggleCamera,
  trackingMetrics,
  cols,
  rows,
  onTriggerGrowth,
  onResetGrid,
  onImageChange,
  hasImage,
  circleColors,
  onCircleColorsChange,

  audioFileName,
  activeAudioSource,
  onSelectAudioSource,
  isAudioPlaying,
  onToggleAudioPlayback,
  volumeScale,
  onVolumeScaleChange,
  onAudioUpload,
  visualMode,
  onVisualModeChange,
  mode2Settings,
  onMode2SettingsChange,
  mode3Spacings,
  onMode3SpacingsChange,
  mode5Settings,
  onMode5SettingsChange
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div 
      className={`absolute top-6 left-6 z-50 text-white panel-transition select-none max-h-[85vh] flex flex-col ${
        isCollapsed 
          ? 'w-12 h-12 bg-black/80 border border-white/20 rounded-full items-center justify-center cursor-pointer shadow-2xl hover:bg-zinc-950/95' 
          : 'w-80 bg-zinc-950/85 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_24px_50px_-12px_rgba(0,0,0,0.9)] overflow-hidden'
      }`}
      id="control-panel-root"
      onClick={() => {
        if (isCollapsed) setIsCollapsed(false);
      }}
    >
      {/* MINIMIZED CIRCULAR ICON */}
      {isCollapsed ? (
        <button 
          title="Expand Controls"
          className="w-12 h-12 flex items-center justify-center text-zinc-300 focus:outline-none cursor-pointer"
          id="expand-panel-btn"
          onClick={(e) => {
            e.stopPropagation();
            setIsCollapsed(false);
          }}
        >
          <Settings2 className="w-5 h-5 animate-spin-slow" />
        </button>
      ) : (
        <>
          {/* HEADER LAYER */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-white/5">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              </div>
              <h1 className="font-sans font-bold text-xs tracking-widest uppercase text-white/90">
                APPARATUS SYSTEM
              </h1>
            </div>
            
            <div className="flex items-center gap-2">
              <a 
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 font-sans text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all cursor-pointer flex items-center gap-1.5 focus:outline-none"
                title="在新标签页独立打开本应用以解除浏览器对系统声音捕获的沙箱隔离限制"
              >
                <Maximize2 className="w-3 h-3" />
                <span>新窗口打开</span>
              </a>

              <button 
                className="text-zinc-400 hover:text-zinc-100 font-mono text-xs px-2 py-0.5 rounded border border-white/5 hover:border-white/20 transition-all cursor-pointer focus:outline-none"
                id="collapse-panel-btn"
                title="Collapse Controls"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCollapsed(true);
                }}
              >
                [-]
              </button>
            </div>
          </div>

          {/* MAIN FORM CONTENTS */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm leading-relaxed">
            
            {/* SENSOR TRACK STATUS */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                  SYSTEM TELEMETRY
                </span>
                <span className="font-mono text-[10px] bg-white/5 text-zinc-300 px-1.5 py-0.5 rounded">
                  {trackingMetrics.fps} FPS
                </span>
              </div>
              
              <div className="bg-zinc-900/50 rounded-xl p-3 border border-white/5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Gesture Engine:</span>
                  <span className={trackingMetrics.trackingActive ? 'text-emerald-400 font-medium' : 'text-zinc-500'}>
                    {trackingMetrics.trackingActive ? 'Tracking Live' : 'Autonomous Demo'}
                  </span>
                </div>
                
                {trackingMetrics.trackingActive ? (
                  <div className="space-y-1 pt-1.5 border-t border-white/5 font-mono text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Left Pinch [Radius]:</span>
                      <span className="text-emerald-400 font-bold">{trackingMetrics.circleRadius.toFixed(1)}px</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Right Pinch [Pull]:</span>
                      <span className="text-zinc-300">{(trackingMetrics.rightDistance * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Hands Gestures:</span>
                      <span className="text-zinc-300">
                        {trackingMetrics.isFistLeft && trackingMetrics.isFistRight ? '✊✊ RESET FISTS' : '👋 Tracking'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-zinc-500 pt-1.5 border-t border-white/5 leading-normal font-sans">
                    Use your mouse/touch, or wave your hands over your webcam to control this elastic machine.
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={onToggleCamera}
                    id="camera-toggle-btn"
                    className={`w-full py-2 border transition-all cursor-pointer text-[10px] font-mono font-bold uppercase tracking-[0.15em] rounded-lg flex items-center justify-center gap-2 hover:shadow-lg focus:outline-none ${
                      isCameraActive 
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20' 
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    {isCameraActive ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                    {isCameraActive ? 'Disable Webcam' : 'Enable Webcam'}
                  </button>
                </div>
              </div>
            </div>

            {/* BACKGROUND MATERIAL */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 block">
                BACKGROUND MATERIAL
              </span>
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400 font-sans flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                    Custom Backdrop:
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${hasImage ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-zinc-500'}`}>
                    {hasImage ? 'ACTIVE' : 'DEFAULT'}
                  </span>
                </div>

                <div className="flex gap-2">
                  <label className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-zinc-900 border border-white/10 hover:border-white/20 active:bg-zinc-950 text-zinc-300 text-[10px] uppercase font-mono font-bold tracking-wider rounded-lg cursor-pointer transition-all focus:outline-none hover:shadow-lg">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            const img = new Image();
                            img.onload = () => {
                              onImageChange(img);
                            };
                            img.src = evt.target?.result as string;
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                    />
                  </label>

                  {hasImage && (
                    <button
                      onClick={() => onImageChange(null)}
                      className="p-2 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 rounded-lg cursor-pointer transition-all active:scale-95 focus:outline-none"
                      title="Reset Default Background"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* AUDIO RECEPTOR (声音与音量感应) */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 block">
                AUDIO RECEPTOR & HARMONICS
              </span>
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-3.5 shadow-inner">
                {/* Audio Status & File Name */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400 font-sans flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-zinc-400" />
                    Source Mode:
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded capitalize ${
                    activeAudioSource !== 'none' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-white/5 text-zinc-500'
                  }`}>
                    {activeAudioSource === 'none' ? 'No Feed' : activeAudioSource}
                  </span>
                </div>

                {/* Display File/Source Info */}
                {activeAudioSource !== 'none' && (
                  <div className="bg-black/40 border border-white/5 px-2.5 py-2 rounded-lg flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                      <span className="text-[10px] font-mono text-zinc-300 truncate" title={audioFileName}>
                        {audioFileName || 'Unknown Source'}
                      </span>
                    </div>
                    {activeAudioSource === 'file' && (
                      <button
                        onClick={onToggleAudioPlayback}
                        className="p-1.5 hover:bg-white/5 rounded-md cursor-pointer text-zinc-400 hover:text-zinc-100 transition-colors"
                        title={isAudioPlaying ? "Pause Audio" : "Play Audio"}
                      >
                        {isAudioPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                )}

                {/* Source Selection Buttons */}
                <div className="grid grid-cols-4 gap-1 bg-black/20 p-1 rounded-xl">
                  {/* File Pick */}
                  <label className={`flex flex-col items-center justify-center py-2 px-0.5 rounded-lg border text-center cursor-pointer transition-all ${
                    activeAudioSource === 'file' 
                      ? 'bg-zinc-800 border-white/20 text-zinc-200 font-bold' 
                      : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-250 hover:bg-white/5'
                  }`}>
                    <Upload className="w-3.5 h-3.5 mb-1 text-center mx-auto" />
                    <span className="text-[8px] font-mono uppercase tracking-wider">File</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          onAudioUpload(file);
                        }
                      }}
                      className="hidden"
                    />
                  </label>

                  {/* Mic Toggle */}
                  <button
                    onClick={() => onSelectAudioSource('mic')}
                    className={`flex flex-col items-center justify-center py-2 px-0.5 rounded-lg border text-center transition-all cursor-pointer ${
                      activeAudioSource === 'mic'
                        ? 'bg-zinc-800 border-white/20 text-zinc-200 font-bold'
                        : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-250 hover:bg-white/5'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5 mb-1 mx-auto" />
                    <span className="text-[8px] font-mono uppercase tracking-wider">Mic</span>
                  </button>

                  {/* System Audio Capture */}
                  <button
                    onClick={() => onSelectAudioSource('system')}
                    className={`flex flex-col items-center justify-center py-2 px-0.5 rounded-lg border text-center transition-all cursor-pointer ${
                      activeAudioSource === 'system'
                        ? 'bg-zinc-800 border-white/20 text-zinc-200 font-bold'
                        : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-250 hover:bg-white/5'
                    }`}
                    title="Capture currently playing browser tab or system audio output"
                  >
                    <Monitor className="w-3.5 h-3.5 mb-1 mx-auto text-indigo-400" />
                    <span className="text-[8px] font-mono uppercase tracking-wider text-indigo-300">System</span>
                  </button>

                  {/* Synth Toggle */}
                  <button
                    onClick={() => onSelectAudioSource('synth')}
                    className={`flex flex-col items-center justify-center py-2 px-0.5 rounded-lg border text-center transition-all cursor-pointer ${
                      activeAudioSource === 'synth'
                        ? 'bg-zinc-800 border-white/20 text-zinc-200 font-bold'
                        : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-250 hover:bg-white/5'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5 mb-1 mx-auto" />
                    <span className="text-[8px] font-mono uppercase tracking-wider">Ambient</span>
                  </button>
                </div>

                {/* Reset Audio connection */}
                {activeAudioSource !== 'none' && (
                  <button
                    onClick={() => onSelectAudioSource('none')}
                    className="w-full py-1.5 bg-rose-500/5 border border-rose-500/20 hover:bg-rose-500/15 text-rose-400 text-[9px] uppercase font-mono tracking-widest rounded-lg cursor-pointer transition-colors"
                  >
                    Disconnect Audio Feed
                  </button>
                )}

                {/* Right Hand Volume metrics & Master fader */}
                <div className="pt-2.5 border-t border-white/5 space-y-1.5">
                  <div className="flex items-center justify-between font-sans text-xs">
                    <span className="text-zinc-400 flex items-center gap-1.5">
                      {volumeScale > 0.05 ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-zinc-500" />}
                      App Volume:
                    </span>
                    <span className="font-mono text-[10px] text-zinc-300 font-bold bg-white/5 px-2 py-0.5 rounded">
                      {Math.round(volumeScale * 100)}%
                    </span>
                  </div>
                  
                  {/* Slider indicator of active volume (allows live manual override slider matching Right Pinch) */}
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volumeScale}
                      onChange={(e) => onVolumeScaleChange(parseFloat(e.target.value))}
                      className="flex-1 accent-indigo-500 h-1 bg-zinc-900 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="text-[8px] font-mono text-zinc-500 leading-tight">
                    {trackingMetrics.trackingActive 
                      ? "⚡ Right hand pinch/stretch controls current volume and y-axis shape!" 
                      : "Webcam not tracking. Use slider to test y-axis compression and volume level manually."}
                  </div>
                </div>
              </div>
            </div>

            {/* GRID LAYOUT STATUS */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/50 block">
                Grid Layout
              </span>
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400 font-sans">Topology Layout:</span>
                  <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-white bg-white/5 px-2.5 py-0.5 rounded-md border border-white/5">
                    <span>10</span>
                    <span className="text-white/30 text-xs">×</span>
                    <span>10</span>
                  </div>
                </div>

                <div className="text-[9px] font-mono text-white/30 leading-normal border-t border-white/5 pt-2 flex items-center gap-1.5 justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Concentric Dot Grid & Circle Mesh</span>
                  </div>
                  <span className="text-zinc-600 text-[8px]">50px interval</span>
                </div>
              </div>
            </div>

            {/* CIRCLE LAYERS & COLORS */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/50 block">
                Circle Layers & Colors
              </span>
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-2.5 shadow-inner">
                {([
                  { key: 'c50', label: '50px Circle', size: 50 },
                  { key: 'c40', label: '40px Circle', size: 40 },
                  { key: 'c30', label: '30px Circle', size: 30 },
                  { key: 'c20', label: '20px Circle', size: 20 },
                  { key: 'c10', label: '10px Circle', size: 10 },
                ] as const).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: circleColors[key] }} />
                      <span className="text-zinc-350 font-medium font-sans">{label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* Hex input */}
                      <input
                        type="text"
                        value={circleColors[key]}
                        onChange={(e) => {
                          let val = e.target.value;
                          if (val && !val.startsWith('#')) {
                            val = '#' + val;
                          }
                          onCircleColorsChange({
                            ...circleColors,
                            [key]: val,
                          });
                        }}
                        className="w-18 bg-zinc-900 border border-white/10 hover:border-white/20 focus:border-white/30 text-[10px] font-mono text-zinc-200 rounded px-1.5 py-1 text-center font-bold focus:outline-none"
                        maxLength={7}
                        placeholder="#ffffff"
                      />
                      {/* Interactive color picker */}
                      <div className="relative w-6 h-6 rounded-md border border-white/10 overflow-hidden cursor-pointer hover:border-white/30 flex-shrink-0" style={{ backgroundColor: circleColors[key] }}>
                        <input
                          type="color"
                          value={circleColors[key].startsWith('#') && circleColors[key].length === 7 ? circleColors[key] : '#ffffff'}
                          onChange={(e) => {
                            onCircleColorsChange({
                              ...circleColors,
                              [key]: e.target.value,
                            });
                          }}
                          className="absolute inset-[-4px] w-[200%] h-[200%] p-0 m-0 border-0 cursor-pointer opacity-0"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* INTERACTIVE VISUAL MODE */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 block">
                VISUAL STREAM PROFILE
              </span>
              <div className="grid grid-cols-6 gap-0.5 bg-zinc-950/40 p-1 rounded-xl border border-white/5 text-[8px]">
                <button
                  onClick={() => onVisualModeChange('concentric')}
                  id="mode-btn-concentric"
                  className={`py-1.5 px-0 rounded-lg text-center cursor-pointer font-sans transition-all focus:outline-none ${
                    visualMode === 'concentric'
                      ? 'bg-white/10 text-white font-medium shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Mode 1: Grid
                </button>
                <button
                  onClick={() => onVisualModeChange('scattered')}
                  id="mode-btn-scattered"
                  className={`py-1.5 px-0 rounded-lg text-center cursor-pointer font-sans transition-all focus:outline-none ${
                    visualMode === 'scattered'
                      ? 'bg-white/10 text-white font-medium shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Mode 2: Scatter
                </button>
                <button
                  onClick={() => onVisualModeChange('dispersed')}
                  id="mode-btn-dispersed"
                  className={`py-1.5 px-0 rounded-lg text-center cursor-pointer font-sans transition-all focus:outline-none ${
                    visualMode === 'dispersed'
                      ? 'bg-white/10 text-white font-medium shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Mode 3: Disperse
                </button>
                <button
                  onClick={() => onVisualModeChange('random')}
                  id="mode-btn-random"
                  className={`py-1.5 px-0 rounded-lg text-center cursor-pointer font-sans transition-all focus:outline-none ${
                    visualMode === 'random'
                      ? 'bg-white/10 text-white font-medium shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Mode 4: Random
                </button>
                <button
                  onClick={() => onVisualModeChange('hyperbolic')}
                  id="mode-btn-hyperbolic"
                  className={`py-1.5 px-0 rounded-lg text-center cursor-pointer font-sans transition-all focus:outline-none ${
                    visualMode === 'hyperbolic'
                      ? 'bg-white/10 text-white font-medium shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Mode 5: Ellipses
                </button>
                <button
                  onClick={() => onVisualModeChange('orbit')}
                  id="mode-btn-orbit"
                  className={`py-1.5 px-0 rounded-lg text-center cursor-pointer font-sans transition-all focus:outline-none ${
                    visualMode === 'orbit'
                      ? 'bg-white/10 text-white font-medium shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Mode 6: Orbit
                </button>
              </div>
              <div className="text-[8px] font-mono text-zinc-500 leading-normal">
                💡 Rotate right hand (L2) by 20° twice or click canvas to cycle modes sequentially.
              </div>
            </div>

            {/* MODE 5 ORBIT CONFIGURATION */}
            {visualMode === 'hyperbolic' && (
              <div className="space-y-2.5">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/50 block">
                  Mode 5: Ellipse Composition (椭圆合成)
                </span>
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-2.5 shadow-inner">
                  <p className="text-zinc-400 text-xs leading-relaxed">
                    The original concentric hyperbolic orbit grid has been fully deleted and replaced with a structured composition of 5 precisely aligned vector ellipses.
                  </p>
                  <div className="space-y-1 font-mono text-[9px] text-zinc-500">
                    <div>• Ellipse 1: 308px × 308px (Left: 335px, Top: 88px)</div>
                    <div>• Ellipse 2: 438px × 438px (Left: 424px, Top: 192px)</div>
                    <div>• Ellipse 3: 378px × 378px (Left: 744px, Top: 108px)</div>
                    <div>• Ellipse 4: 258px × 258px (Left: 295px, Top: 458px)</div>
                    <div>• Ellipse 5: 243px × 243px (Left: 158px, Top: 88px)</div>
                  </div>
                </div>
              </div>
            )}

            {/* SKELETON DISPLAY OVERLAYS */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 block">
                SKELETON GRAPHICS
              </span>
              <div className="grid grid-cols-3 gap-1 bg-zinc-950/40 p-1 rounded-xl border border-white/5 text-xs">
                {(['overlay', 'floating', 'hidden'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onSkeletonModeChange(mode)}
                    id={`skeleton-btn-${mode}`}
                    className={`py-1.5 px-2 rounded-lg text-center cursor-pointer capitalize font-sans transition-all focus:outline-none ${
                      skeletonMode === mode 
                        ? 'bg-white/10 text-white font-medium shadow-sm' 
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                    }`}
                  >
                    {mode === 'overlay' ? 'Full' : mode === 'floating' ? 'Float' : 'Hide'}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
};
