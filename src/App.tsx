/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { 
  GlassParameters, 
  DEFAULT_PARAMETERS, 
  TrackingMetrics,
  CircleColors
} from './types';
import { 
  createProgram, 
  compileShader, 
  VERTEX_SHADER_SRC, 
  FRAGMENT_SHADER_SRC, 
  generateConstructivistBackdrop,
  createSubdividedGridBuffer
} from './lib/webgl-utils';
import { ControlPanel } from './components/ControlPanel';
import { HandOverlay } from './components/HandOverlay';
import { Mode5Ellipses } from './components/Mode5Ellipses';

const getPseudorandomPos = (dotIdx: number, cycleIdx: number, w: number, h: number) => {
  // Enhanced multi-seeded raw hash to get excellent pseudo-random positioning and avoid clustering
  const seedX = Math.sin(dotIdx * 17.513 + cycleIdx * 43.193) * 12345.6789;
  const seedY = Math.cos(dotIdx * 29.842 + cycleIdx * 81.354) * 98765.4321;
  const randX = seedX - Math.floor(seedX);
  const randY = seedY - Math.floor(seedY);
  
  // Safe premium margin boundaries (15% to 85% of screen viewport)
  const padW = (w || 800) * 0.15;
  const padH = (h || 600) * 0.15;
  return {
    x: padW + randX * ((w || 800) - 2 * padW),
    y: padH + randY * ((h || 600) - 2 * padH)
  };
};

const MODE5_ORBITS = [
  { cxOffset: -151,   cyOffset: -118,   rx: 154,   ry: 154,   id: 0 }, // Ellipse 1
  { cxOffset: 3,      cyOffset: 51,     rx: 219,   ry: 219,   id: 1 }, // Ellipse 2
  { cxOffset: 293,    cyOffset: -63,    rx: 189,   ry: 189,   id: 2 }, // Ellipse 3
  { cxOffset: -216,   cyOffset: 227,    rx: 129,   ry: 129,   id: 4 }, // Ellipse 4
  { cxOffset: -360.5, cyOffset: -150.5, rx: 121.5, ry: 121.5, id: 5 }, // Ellipse 5
];

export default function App() {
  // HTML Element Refs
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Optical Parameter State
  const [params] = useState<GlassParameters>(DEFAULT_PARAMETERS);
  
  // Interface Configuration States
  const [skeletonMode, setSkeletonMode] = useState<'overlay' | 'floating' | 'hidden'>('floating');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isMediaPipeReady, setIsMediaPipeReady] = useState<boolean>(false);

  // Audio receptor-related react states
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
  const [audioFileName, setAudioFileName] = useState<string>('');
  const [activeAudioSource, setActiveAudioSource] = useState<'none' | 'file' | 'mic' | 'synth' | 'system'>('none');
  const [volumeScale, setVolumeScale] = useState<number>(0.8);
  const [audioError, setAudioError] = useState<{ title: string; message: string; isSandbox: boolean } | null>(null);

  // Audio elements & Web Audio Graph references
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Microphone stream references
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // System Desktop Capture references
  const systemStreamRef = useRef<MediaStream | null>(null);
  const systemSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Synthesizer scheduler reference
  const synthIntervalRef = useRef<any>(null);

  // Real-time audio frequency and physics matrices for interpolation
  const frequencyDataRef = useRef<Uint8Array>(new Uint8Array(128));
  const gridAudioIntensityRef = useRef<number[]>(Array(100).fill(0.0));
  const intensityHistoryRef = useRef<number[][]>(Array.from({ length: 100 }, () => Array(30).fill(0.0)));
  const rowVolumesRef = useRef<number[]>(Array(10).fill(1.0));

  // Sync state volume to Ref to bypass stale closure inside requestAnimationFrame loop
  const volumeScaleRef = useRef<number>(0.8);
  useEffect(() => {
    volumeScaleRef.current = volumeScale;
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(volumeScale, audioCtxRef.current.currentTime);
    }
  }, [volumeScale]);

  // MediaPipe Skeleton Data for rendering overlay
  const [rawLandmarks, setRawLandmarks] = useState<any[][]>([]);

  // 2x2 Default Grid Configuration
  const [cols, setCols] = useState<number>(2);
  const [rows, setRows] = useState<number>(2);

  // Background Image state and ref
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const uploadedImageRef = useRef<HTMLImageElement | null>(null);

  const colsRef = useRef<number>(2);
  const rowsRef = useRef<number>(2);
  const growDirectionRef = useRef<number>(-1.0); // -1.0 = none, 0.0 = cols, 1.0 = rows
  const growthProgressRef = useRef<number>(1.0); // 0.0 to 1.0
  const isPinchingLeftRef = useRef<boolean>(false);

  // Mouse interaction state markers
  const isMouseDownRef = useRef<boolean>(false);

  // Physics joint variables on CPU
  const jointsRef = useRef<{ x: number; y: number; vx: number; vy: number; rx: number; ry: number }[]>([]);

  const distortCenterTarget = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const distortCenterCurrent = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  // Circle radius controlled by left hand pinch [0, 50]
  const circleRadiusRef = useRef<number>(50.0);

  // Custom colors for different layer depths of circles
  const [circleColors, setCircleColors] = useState<CircleColors>({
    c50: '#ffffff',
    c40: '#38bdf8',
    c30: '#818cf8',
    c20: '#f43f5e',
    c10: '#fbbf24'
  });

  const circleColorsRef = useRef<CircleColors>(circleColors);
  const layerCanvasesRef = useRef<HTMLCanvasElement[]>([]);
  const layerCanvasesMode5Ref = useRef<HTMLCanvasElement[]>([]);

  // Visual Mode Configuration (Mode 1: Concentric vs Mode 2: Scattered vs Mode 3: Dispersed vs Mode 4: Random layout vs Mode 5: Hyperbolic vs Mode 6: Orbit vs Mode 7: Lines)
  const [visualMode, setVisualMode] = useState<'concentric' | 'scattered' | 'dispersed' | 'random' | 'hyperbolic' | 'orbit' | 'lines'>('concentric');
  const visualModeRef = useRef<'concentric' | 'scattered' | 'dispersed' | 'random' | 'hyperbolic' | 'orbit' | 'lines'>('concentric');
  const [mode2Settings, setMode2Settings] = useState({
    minSpacing: 38,
    maxSpacing: 58,
    maxAmplitude: 48,
    unifiedDiameter: 10,
    breathingPeriod: 5.0
  });
  const mode2SettingsRef = useRef(mode2Settings);
  mode2SettingsRef.current = mode2Settings;
  const [mode3Spacings, setMode3Spacings] = useState({
    layer0: 150,
    layer1: 125,
    layer2: 100,
    layer3: 75,
    layer4: 50,
    layer5: 35
  });
  const mode3SpacingsRef = useRef(mode3Spacings);
  mode3SpacingsRef.current = mode3Spacings;
  const [mode5Settings, setMode5Settings] = useState({
    m5Speed: 0.001,
    curveSpacing: 80.0,
    circleSpacing: 18.0,
    concentricScale: 1.5,
    swapCount: 0,
    innermostRadius: 80.0,
    spacing1to2: 80.0,
    spacing2to3: 80.0,
    spacing3to4: 80.0,
    spacing4to5: 80.0
  });
  const mode5SettingsRef = useRef(mode5Settings);
  mode5SettingsRef.current = mode5Settings;
  
  // Mode 5 Helper mapping functions
  const getMode5OrbitAndIndex = (dotIndex: number) => {
    if (mode5DotToOrbitMapRef.current && mode5DotToOrbitMapRef.current[dotIndex]) {
      return mode5DotToOrbitMapRef.current[dotIndex];
    }
    if (dotIndex < 36) {
      return { orbit: 0, index: dotIndex };
    } else if (dotIndex < 62) {
      return { orbit: 1, index: dotIndex - 36 };
    } else if (dotIndex < 80) {
      return { orbit: 2, index: dotIndex - 62 };
    } else if (dotIndex < 92) {
      return { orbit: 3, index: dotIndex - 80 };
    } else {
      return { orbit: 4, index: dotIndex - 92 };
    }
  };

  const getMode5OrbitCount = (orbit: number) => {
    if (orbit === 0) return 36;
    if (orbit === 1) return 26;
    if (orbit === 2) return 18;
    if (orbit === 3) return 12;
    return 8;
  };

  const mode5TargetRingRef = useRef<number[]>([]);
  const mode5CurrentRadiusRef = useRef<number[]>([]);
  const mode5ActiveRingRef = useRef<number[]>([]);
  const mode5MergedToRef = useRef<(number | null)[]>([]);
  const mode5LastAngleRef = useRef<number[]>([]);
  const mode5RedistributionTimerRef = useRef<number>(0);
  const mode5SwapStateRef = useRef({
    swapCount: 0,
    lastBeatTime: 0,
  });
  const mode5DotToOrbitMapRef = useRef<{ orbit: number; index: number }[]>([]);
  const mode5DotAnglesRef = useRef<number[]>([]);
  const mode5DotDirectionsRef = useRef<number[]>([]);
  const mode5DotSpeedsRef = useRef<number[]>([]);
  const mode5ThresholdsRef = useRef<number[]>([]);
  const mode5LitDurationsRef = useRef<number[]>([]);
  const mode5CooldownsRef = useRef<number[]>([]);
  const mode5FreqBinMapRef = useRef<number[]>([]);
  const mode5DotStatesRef = useRef<{
    state: 'inactive' | 'appearing' | 'disappearing';
    appearProgress: number;
    disappearProgress: number;
    litTimer: number;
  }[]>([]);
  const mode6DotStatesRef = useRef<{
    state: 'inactive' | 'active';
    intensity: number;
    activeTimer: number;
    litDuration: number;
    cooldown: number;
    landingRippleScale: number;
  }[]>([]);
  const mode6JumpStatesRef = useRef<{
    [layerIndex: number]: {
      isJumping: boolean;
      phase: 'none' | 'rising' | 'hovering' | 'falling';
      startX: number;
      startY: number;
      floatYOffset: number;
      height: number;
      riseDuration: number;
      hoverDuration: number;
      fallDuration: number;
      elapsed: number;
      attachedDotIndex: number;
    };
  }[]>([]);
  const lastFrameModeRef = useRef<'concentric' | 'scattered' | 'dispersed' | 'random' | 'hyperbolic' | 'orbit' | 'lines'>('concentric');
  const weight1Ref = useRef<number[]>(Array(5).fill(1.0));
  const weight2Ref = useRef<number[]>(Array(5).fill(0.0));
  const weight3Ref = useRef<number[]>(Array(5).fill(0.0));
  const weight4Ref = useRef<number[]>(Array(5).fill(0.0));
  const weight5Ref = useRef<number[]>(Array(5).fill(0.0));
  const weight6Ref = useRef<number[]>(Array(5).fill(0.0));
  const weight7Ref = useRef<number[]>(Array(5).fill(0.0));
  const mode7StatesRef = useRef<{
    x: number;
    dir: number;
    speed: number;
    radius: number;
    colorIdx: number;
  }[]>([]);
  const dispersedStartTimeRef = useRef<number | null>(null);
  const mode3StartTimeRef = useRef<number | null>(null);
  const scrambleMapRef = useRef<number[]>([]);
  const scatterOffsetsRef = useRef<{ x: number; y: number }[]>([]);
  const mode4ColorMapRef = useRef<number[]>([]);
  const mode4DotLayerColorMapRef = useRef<number[][]>([]);
  const mode4LastCycleIdxRef = useRef<number[]>(Array(100).fill(0));
  const mode1DotLayerColorMapRef = useRef<number[][]>([]);
  const mode5DotSmoothedHzRef = useRef<number[]>([]);
  const lastBassIntensityRef = useRef<number>(0);
  const beatPulseRef = useRef<number>(0);
  const mode4AccumTimeRef = useRef<number[]>(Array(100).fill(0.0));
  const m3ToM4TransitionStartTimeRef = useRef<number | null>(null);

  // Right Hand L2 Rotation tracker states
  const isPinchingRightL2Ref = useRef<boolean>(false);
  const initialL2AngleRef = useRef<number | null>(null);
  const modeToggleCooldownRef = useRef<number>(0);

  // Click tracker for fallback toggle
  const dragStartRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });

  // Right hand angle tracking variables
  const lastRightHandTimeRef = useRef<number>(0);
  const rightHandBaselineAngleRef = useRef<number | null>(null);
  const rightHandAngleChangeStreakRef = useRef<number>(0);
  const rightHandRotationDirectionRef = useRef<number>(0);
  const rightHandLastTriggerTimeRef = useRef<number>(0);

  // Left hand L1 rotation tracking and fireworks refs
  const dotFireworksRef = useRef<{ spawnTime: number; duration: number; raysCount: number; rays?: { opacity: number; lengthMult: number }[] }[]>(Array(100).fill(null as any));
  const leftHandBaselineAngleRef = useRef<number | null>(null);
  const leftHandAngleChangeStreakRef = useRef<number>(0);

  const regenerateBlurredLayerCaches = (colors: CircleColors) => {
    const canvases: HTMLCanvasElement[] = [];
    const canvasesMode5: HTMLCanvasElement[] = [];
    const concentricLayers = [
      { maxRadius: 50.0, colorKey: 'c50' as const, layerIndex: 0 },
      { maxRadius: 40.0, colorKey: 'c40' as const, layerIndex: 1 },
      { maxRadius: 30.0, colorKey: 'c30' as const, layerIndex: 2 },
      { maxRadius: 20.0, colorKey: 'c20' as const, layerIndex: 3 },
      { maxRadius: 10.0, colorKey: 'c10' as const, layerIndex: 4 },
    ];

    const getValidHexColor = (hex: string, defaultColor: string) => {
      if (/^#[0-9A-F]{6}$/i.test(hex) || /^#[0-9A-F]{3}$/i.test(hex)) {
        return hex;
      }
      return defaultColor;
    };

    concentricLayers.forEach(({ maxRadius, colorKey, layerIndex }) => {
      const size = 180;
      const getCanvasForBlur = (blurPx: number) => {
        const can = document.createElement('canvas');
        can.width = size;
        can.height = size;
        const ctx = can.getContext('2d');
        if (!ctx) return can;

        const cx = size / 2;
        const cy = size / 2;
        const rawColor = colors[colorKey] || '#ffffff';
        const hexColor = getValidHexColor(rawColor, '#ffffff');

        ctx.filter = `blur(${blurPx}px)`;
        ctx.fillStyle = hexColor;
        ctx.beginPath();
        ctx.arc(cx, cy, maxRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-atop';

        const imgData = ctx.createImageData(size, size);
        const data = imgData.data;
        for (let j = 0; j < data.length; j += 4) {
          const rand = Math.floor(Math.random() * 255);
          data[j] = rand;
          data[j + 1] = rand;
          data[j + 2] = rand;
          data[j + 3] = 24;
        }

        const tempCan = document.createElement('canvas');
        tempCan.width = size;
        tempCan.height = size;
        tempCan.getContext('2d')?.putImageData(imgData, 0, 0);
        ctx.drawImage(tempCan, 0, 0);

        ctx.globalCompositeOperation = 'source-over';
        return can;
      };

      // 1. Generate original blur canvas for standard modes (Modes 1, 2, 3, 4)
      const originalBlurPx = (5 - layerIndex) * 2.4 + 1.2;
      canvases.push(getCanvasForBlur(originalBlurPx));

      // 2. Generate sharp blur canvas for Mode 5: restored original edge blur per request
      const sharpBlurPx = (5 - layerIndex) * 2.4 + 1.2;
      canvasesMode5.push(getCanvasForBlur(sharpBlurPx));
    });

    layerCanvasesRef.current = canvases;
    layerCanvasesMode5Ref.current = canvasesMode5;
  };

  useEffect(() => {
    circleColorsRef.current = circleColors;
    regenerateBlurredLayerCaches(circleColors);
  }, [circleColors]);

  useEffect(() => {
    if (scrambleMapRef.current.length === 0) {
      const arr = Array.from({ length: 100 }, (_, i) => i);
      for (let idx = arr.length - 1; idx > 0; idx--) {
        const jdx = Math.floor(Math.random() * (idx + 1));
        const temp = arr[idx];
        arr[idx] = arr[jdx];
        arr[jdx] = temp;
      }
      scrambleMapRef.current = arr;
    }
    if (scatterOffsetsRef.current.length === 0) {
      scatterOffsetsRef.current = Array.from({ length: 100 }, () => ({
        x: (Math.random() - 0.5) * 85.0, // spread up to +-42.5px
        y: (Math.random() - 0.5) * 85.0
      }));
    }
    if (mode4ColorMapRef.current.length === 0) {
      mode4ColorMapRef.current = Array.from({ length: 100 }, () => Math.floor(Math.random() * 5));
    }
    if (mode5DotToOrbitMapRef.current.length === 0) {
      const slots: { orbit: number; index: number }[] = [];
      const orbitCounts = [36, 26, 18, 12, 8];
      for (let orbit = 0; orbit < 5; orbit++) {
        const count = orbitCounts[orbit];
        for (let idx = 0; idx < count; idx++) {
          slots.push({ orbit, index: idx });
        }
      }
      // Shuffle slots so that each of the 100 dots maps to a randomized orbit and position
      for (let idx = slots.length - 1; idx > 0; idx--) {
        const jdx = Math.floor(Math.random() * (idx + 1));
        const temp = slots[idx];
        slots[idx] = slots[jdx];
        slots[jdx] = temp;
      }
      mode5DotToOrbitMapRef.current = slots;
    }
    if (mode5DotAnglesRef.current.length === 0) {
      const angles = [];
      const directions = [];
      const speeds = [];
      for (let i = 0; i < 100; i++) {
        const { orbit, index } = getMode5OrbitAndIndex(i);
        const count = getMode5OrbitCount(orbit);
        angles.push((index / count) * Math.PI * 2);
        directions.push(orbit % 2 === 0 ? 1 : -1);
        speeds.push(0.00003 + (4 - orbit) * 0.00001); // planet/Kepler physics speed
      }
      mode5DotAnglesRef.current = angles;
      mode5DotDirectionsRef.current = directions;
      mode5DotSpeedsRef.current = speeds;
    }
    if (mode5DotStatesRef.current.length === 0) {
      mode5DotStatesRef.current = Array.from({ length: 100 }, () => ({
        state: 'inactive',
        appearProgress: 0.0,
        disappearProgress: 0.0,
        litTimer: 0.0,
      }));
    }
    if (mode5ThresholdsRef.current.length === 0) {
      mode5ThresholdsRef.current = Array.from({ length: 100 }, () => 0.14 + Math.random() * 0.22); // thresholds between 0.14 and 0.36
    }
    if (mode5LitDurationsRef.current.length === 0) {
      mode5LitDurationsRef.current = Array.from({ length: 100 }, () => 0.5 + Math.random() * 1.5); // durations between 0.5s and 2.0s
    }
    if (mode5CooldownsRef.current.length === 0) {
      mode5CooldownsRef.current = Array.from({ length: 100 }, () => 0.0);
    }
    if (mode5FreqBinMapRef.current.length === 0) {
      const bins: number[] = [];
      const maxActiveBinVal = 48;
      for (let i = 0; i < 100; i++) {
        const t = i / 99;
        const factor = Math.pow(t, 1.5);
        const bin = Math.min(127, Math.floor(factor * maxActiveBinVal));
        bins.push(bin);
      }
      for (let idx = bins.length - 1; idx > 0; idx--) {
        const jdx = Math.floor(Math.random() * (idx + 1));
        const temp = bins[idx];
        bins[idx] = bins[jdx];
        bins[jdx] = temp;
      }
      mode5FreqBinMapRef.current = bins;
    }
    if (mode1DotLayerColorMapRef.current.length === 0) {
      mode1DotLayerColorMapRef.current = Array.from({ length: 100 }, () => {
        // Pre-roll a randomized assignment of which of the 5 layer canvas colors each layer of this dot uses
        return Array.from({ length: 5 }, () => Math.floor(Math.random() * 5));
      });
    }
    if (mode4DotLayerColorMapRef.current.length === 0) {
      mode4DotLayerColorMapRef.current = Array.from({ length: 100 }, () => {
        // Pre-roll randomized color layers for Mode 4 representation
        return Array.from({ length: 5 }, () => Math.floor(Math.random() * 5));
      });
    }
    if (mode5DotSmoothedHzRef.current.length === 0) {
      mode5DotSmoothedHzRef.current = Array.from({ length: 100 }, () => 0.0);
    }
    if (mode6DotStatesRef.current.length === 0) {
      mode6DotStatesRef.current = Array.from({ length: 100 }, () => ({
        state: 'inactive',
        intensity: 0.0,
        activeTimer: 0.0,
        litDuration: 0.8 + Math.random() * 1.2,
        cooldown: 0.0,
        landingRippleScale: 0.0,
      }));
    }
    if (mode6JumpStatesRef.current.length === 0) {
      mode6JumpStatesRef.current = Array.from({ length: 100 }, (_, i) => ({
        3: {
          isJumping: false,
          phase: 'none' as const,
          startX: 0.0,
          startY: 0.0,
          floatYOffset: 0.0,
          height: 70.0 + Math.random() * 100.0,
          riseDuration: 0.4 + Math.random() * 0.2,
          hoverDuration: 0.12 + Math.random() * 0.15, // Slightly reduced hover duration
          fallDuration: 0.4 + Math.random() * 0.2,
          elapsed: 0.0,
          attachedDotIndex: i,
        },
        4: {
          isJumping: false,
          phase: 'none' as const,
          startX: 0.0,
          startY: 0.0,
          floatYOffset: 0.0,
          height: 80.0 + Math.random() * 110.0,
          riseDuration: 0.4 + Math.random() * 0.2,
          hoverDuration: 0.12 + Math.random() * 0.15, // Slightly reduced hover duration
          fallDuration: 0.4 + Math.random() * 0.2,
          elapsed: 0.0,
          attachedDotIndex: i,
        }
      }));
    }
    if (mode7StatesRef.current.length === 0) {
      mode7StatesRef.current = Array.from({ length: 100 }, (_, i) => {
        const lineIdx = Math.floor(i / 20);
        // Even index lines move left-to-right (1), odd index lines move right-to-left (-1)
        const dir = lineIdx % 2 === 0 ? 1 : -1;
        return {
          x: Math.random() * (window.innerWidth || 1200), // Random starting position
          dir,
          speed: 40.0 + Math.random() * 80.0, // speed in px per sec
          radius: 10.0 + Math.random() * 40.0, // radius between 10px and 50px
          colorIdx: Math.floor(Math.random() * 5),
        };
      });
    }
  }, []);

  // Telemetry metric state
  const [metrics, setMetrics] = useState<TrackingMetrics>({
    leftDistance: 0.15,
    rightDistance: 0.15,
    isFistLeft: false,
    isFistRight: false,
    fps: 60,
    trackingActive: false,
    circleRadius: 50.0
  });

  // MediaPipe Hands & Camera trackers cached
  const handsTrackerRef = useRef<any>(null);
  const cameraTrackerRef = useRef<any>(null);
  const isWebcamActiveRef = useRef<boolean>(false);
  const noisePatternRef = useRef<CanvasPattern | null>(null);

  // Texture and Program parameters for hot-swaps
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const bgTextureRef = useRef<WebGLTexture | null>(null);
  const gridBufferRef = useRef<WebGLBuffer | null>(null);
  const gridBufferColsRef = useRef<number>(0);
  const gridBufferRowsRef = useRef<number>(0);

  // Initialize CPU joints representation
  const initJoints = (c: number, r: number) => {
    const arr = [];
    for (let y = 0; y <= r; y++) {
      for (let x = 0; x <= c; x++) {
        const rx = -1.0 + 2.0 * (x / c);
        const ry = -1.0 + 2.0 * (y / r);
        arr.push({
          x: rx,
          y: ry,
          vx: 0.0,
          vy: 0.0,
          rx,
          ry
        });
      }
    }
    jointsRef.current = arr;
  };

  // Grid Expansion functions
  const handleTriggerGrowth = () => {
    if (colsRef.current === rowsRef.current) {
      // cols++ (Right side expansion)
      colsRef.current += 1;
      growDirectionRef.current = 0.0;
      growthProgressRef.current = 0.0;
      setCols(colsRef.current);
      initJoints(colsRef.current, rowsRef.current);
      updateBackdropOnGPU(colsRef.current, rowsRef.current);
    } else {
      // rows++ (Bottom side expansion)
      rowsRef.current += 1;
      growDirectionRef.current = 1.0;
      growthProgressRef.current = 0.0;
      setRows(rowsRef.current);
      initJoints(colsRef.current, rowsRef.current);
      updateBackdropOnGPU(colsRef.current, rowsRef.current);
    }
  };

  const handleResetGrid = () => {
    colsRef.current = 2; // Default starting screen 2x2
    rowsRef.current = 2;
    growDirectionRef.current = -1.0;
    growthProgressRef.current = 1.0;
    setCols(2);
    setRows(2);
    initJoints(2, 2);
    updateBackdropOnGPU(2, 2);
  };

  const handleResetParameters = () => {
    handleResetGrid();
  };

  const handleImageChange = (img: HTMLImageElement | null) => {
    uploadedImageRef.current = img;
    setUploadedImage(img);
    updateBackdropOnGPU(colsRef.current, rowsRef.current, img);
  };

  // -------------------------------------------------------------
  // AUDIO CONTROLLERS (Web Audio API Graph management)
  // -------------------------------------------------------------
  const initAudio = () => {
    if (audioCtxRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn('AudioContext is not supported on this browser.');
      return;
    }

    const audioCtx = new AudioContextClass();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; // 128 channels

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = volumeScaleRef.current;

    const audioEl = new Audio();
    audioEl.loop = true;
    audioEl.crossOrigin = 'anonymous';

    const source = audioCtx.createMediaElementSource(audioEl);
    source.connect(analyser);
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    audioCtxRef.current = audioCtx;
    audioSourceRef.current = source;
    analyserNodeRef.current = analyser;
    gainNodeRef.current = gainNode;
    audioElementRef.current = audioEl;
  };

  const stopActiveAudioSource = () => {
    // 1. Microphone teardown
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (micSourceNodeRef.current) {
      micSourceNodeRef.current.disconnect();
      micSourceNodeRef.current = null;
    }

    // 1b. System audio teardown
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach(t => t.stop());
      systemStreamRef.current = null;
    }
    if (systemSourceNodeRef.current) {
      systemSourceNodeRef.current.disconnect();
      systemSourceNodeRef.current = null;
    }

    // 2. Synthesizer demo interval clearance
    if (synthIntervalRef.current) {
      clearInterval(synthIntervalRef.current);
      synthIntervalRef.current = null;
    }

    // 3. Audio file element pause
    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }

    setIsAudioPlaying(false);
  };

  const handleAudioUpload = (file: File) => {
    initAudio();
    stopActiveAudioSource();

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    if (audioElementRef.current) {
      const url = URL.createObjectURL(file);
      audioElementRef.current.src = url;
      audioElementRef.current.play()
        .then(() => {
          setIsAudioPlaying(true);
          setActiveAudioSource('file');
          setAudioFileName(file.name);
        })
        .catch(err => {
          console.error('Audio file playback failed:', err);
        });
    }
  };

  const handleSelectAudioSource = async (sourceType: 'none' | 'file' | 'mic' | 'synth' | 'system') => {
    initAudio();
    stopActiveAudioSource();

    if (sourceType === 'none') {
      setActiveAudioSource('none');
      setAudioFileName('');
      return;
    }

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }

    if (sourceType === 'mic') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!audioCtxRef.current || !analyserNodeRef.current) return;

        const micSource = audioCtxRef.current.createMediaStreamSource(stream);
        micSource.connect(analyserNodeRef.current);

        micStreamRef.current = stream;
        micSourceNodeRef.current = micSource;
        setActiveAudioSource('mic');
        setIsAudioPlaying(true);
        setAudioFileName('Live Microphone Capture');
      } catch (err) {
        console.error('Microphone access rejected:', err);
        alert('Could not access microphone feed.');
      }
    } else if (sourceType === 'system') {
      // 1. Proactively check if the app is rendered in an iframe to prevent getDisplayMedia Security Error
      const isInsideIframe = window.self !== window.top;
      if (isInsideIframe) {
        setAudioError({
          title: '🔒 浏览器安全沙箱限制 (Iframe Sandbox)',
          message: '由于当前页面嵌套于 AI Studio 的双栏预览 (Iframe) 中，浏览器出于隐私与安全政策，严格禁止在非顶层 Nested 元素中执行屏幕和系统扬声器采集（Permission Policy 中的 display-capture 未授予限制）。\n\n💡 极速解决方案：双击上方/右上角“新窗口打开”按钮，单独在浏览器标签页访问。此沙箱限制便会彻底解除，即可随心所欲同步您的音乐播放器！',
          isSandbox: true
        });
        return;
      }

      try {
        // Request desktop sharing / tab audio capture screen query
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: 1,
            height: 1,
            frameRate: 1
          },
          audio: true
        });

        if (!audioCtxRef.current || !analyserNodeRef.current) return;

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          // Instruct user how to enable system audio
          stream.getTracks().forEach(t => t.stop());
          setAudioError({
            title: '⚠️ 未勾选共享音频选项',
            message: '捕获已被中断：请重新点击，并在浏览器弹出的分享窗口中，确保勾选了底部的“同时分享系统音频”或“共享标签页中的音频”选项，否则网页将无法取得音频电平信号。',
            isSandbox: false
          });
          return;
        }

        // We can safely stop screen visual track since we only want audio frequencies
        stream.getVideoTracks().forEach(t => t.stop());

        const systemSource = audioCtxRef.current.createMediaStreamSource(stream);
        systemSource.connect(analyserNodeRef.current);

        systemStreamRef.current = stream;
        systemSourceNodeRef.current = systemSource;
        setActiveAudioSource('system');
        setIsAudioPlaying(true);
        setAudioFileName('Captured System & Player Audio');
      } catch (err: any) {
        console.warn('System sharing handled exception:', err);
        const errMsg = String(err?.message || '').toLowerCase();
        const errName = String(err?.name || '');
        const isPolicyError = 
          errName === 'SecurityError' || 
          errMsg.includes('permissions policy') || 
          errMsg.includes('disallowed') || 
          errMsg.includes('policy');
        
        if (isPolicyError) {
          setAudioError({
            title: '🔒 浏览器安全沙箱限制 (Iframe Sandbox)',
            message: '由于当前页面嵌套于 AI Studio 的双栏预览 (Iframe) 中，浏览器出于隐私与安全政策，严格禁止在非顶层 Nested 元素中执行屏幕和系统扬声器采集（Permission Policy 中的 display-capture 未授予限制）。\n\n💡 极速解决方案：双击上方/右上角“在独立标签页打开本应用”（Open in new window）按钮，单独在浏览器标签页访问。此沙箱限制便会彻底解除，即可随心所欲同步您的音乐播放器！',
            isSandbox: true
          });
        } else {
          setAudioError({
            title: '⚠️ 系统声音捕获未成功',
            message: '无法启动电脑系统声音：已取消共享、未勾选所需音频源，亦或当前浏览器平台不支持系统声卡捕获。\n\n提示：建议在弹出的浏览器选择页中选择“共享此标签页”并勾选“共享音频”！',
            isSandbox: false
          });
        }
      }
    } else if (sourceType === 'synth') {
      setActiveAudioSource('synth');
      setIsAudioPlaying(true);
      setAudioFileName('Ambient Synth Sequencer');

      const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25]; // Pentatonic scale
      let stepIdx = 0;

      const triggerAmbientNote = () => {
        if (!audioCtxRef.current || !analyserNodeRef.current) return;
        const ctx = audioCtxRef.current;
        const rootFreq = notes[stepIdx % notes.length];
        stepIdx++;

        const osc = ctx.createOscillator();
        const env = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(rootFreq, ctx.currentTime);

        env.gain.setValueAtTime(0, ctx.currentTime);
        env.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.05);
        env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);

        osc.connect(env);
        env.connect(analyserNodeRef.current);
        if (gainNodeRef.current) {
          env.connect(gainNodeRef.current);
        }

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.0);

        // Harmonize with octave on chance
        if (Math.random() > 0.45) {
          const oscHarm = ctx.createOscillator();
          const envHarm = ctx.createGain();

          oscHarm.type = 'sine';
          oscHarm.frequency.setValueAtTime(rootFreq * 2.0, ctx.currentTime);

          envHarm.gain.setValueAtTime(0, ctx.currentTime);
          envHarm.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.03);
          envHarm.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);

          oscHarm.connect(envHarm);
          envHarm.connect(analyserNodeRef.current);
          if (gainNodeRef.current) {
            envHarm.connect(gainNodeRef.current);
          }

          oscHarm.start(ctx.currentTime);
          oscHarm.stop(ctx.currentTime + 0.7);
        }
      };

      triggerAmbientNote();
      synthIntervalRef.current = setInterval(triggerAmbientNote, 420);
    }
  };

  const handleToggleAudioPlayback = () => {
    if (activeAudioSource !== 'file' || !audioElementRef.current) return;

    if (isAudioPlaying) {
      audioElementRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      audioElementRef.current.play()
        .then(() => setIsAudioPlaying(true))
        .catch(err => console.error('Audio playback resume failed:', err));
    }
  };

  // Re-binds backdrop textures on GPU
  const updateBackdropOnGPU = (
    c: number,
    r: number,
    img: HTMLImageElement | null = uploadedImageRef.current
  ) => {
    const gl = glRef.current;
    if (!gl || !bgTextureRef.current) return;

    // Generate clean canvas source
    const canvasSource = generateConstructivistBackdrop(c, r, img);

    // Bind and upload with UNPACK_FLIP_Y_WEBGL option to prevent vertical flipping
    gl.bindTexture(gl.TEXTURE_2D, bgTextureRef.current);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasSource);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  // Joint physics solver with direct, crisp deformation and zero bounce back
  const updateJointsPhysics = (time: number, isTracking: boolean) => {
    const c = colsRef.current;
    const r = rowsRef.current;
    
    const pullRadius = 0.85;
    
    const joints = jointsRef.current;
    if (!joints || joints.length !== (c + 1) * (r + 1)) return;
    
    let interX = 0;
    let interY = 0;
    let interactionActive = false;
    
    if (isTracking || isMouseDownRef.current) {
      interX = -1.0 + 2.0 * distortCenterTarget.current.x;
      // Invert Y to align to clip coordinates perfectly
      interY = -1.0 + 2.0 * (1.0 - distortCenterTarget.current.y);
      interactionActive = true;
    }
    
    for (let y = 0; y <= r; y++) {
      for (let x = 0; x <= c; x++) {
        const idx = x + y * (c + 1);
        const j = joints[idx];
        
        // Lock screen boundary vertices
        if (x === 0 || x === c || y === 0 || y === r) {
          j.x = j.rx;
          j.y = j.ry;
          j.vx = 0.0;
          j.vy = 0.0;
          continue;
        }
        
        let targetX = j.rx;
        let targetY = j.ry;
        
        if (interactionActive) {
          const dx = interX - j.rx;
          const dy = interY - j.ry;
          const dist = Math.hypot(dx, dy);
          
          if (dist < pullRadius) {
            // Highly crisp localized direct deformation for every intersection cross matching 1:1
            const factor = Math.pow(1.0 - dist / pullRadius, 2.0) * 0.68;
            targetX = j.rx + dx * factor;
            targetY = j.ry + dy * factor;
          }
        }
        
        // Zero sluggish bounce back, direct 100% crisp assignment
        j.x = targetX;
        j.y = targetY;
        j.vx = 0.0;
        j.vy = 0.0;
      }
    }
  };

  // Ensure MediaPipe Scripts are resolved
  useEffect(() => {
    let checkInterval: any;
    
    const verifyMediaPipe = () => {
      if (window.Hands && window.Camera) {
        setIsMediaPipeReady(true);
        clearInterval(checkInterval);
      }
    };

    checkInterval = setInterval(verifyMediaPipe, 250);
    verifyMediaPipe();

    return () => clearInterval(checkInterval);
  }, []);

  // Canvas Lifecycles and compilation
  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('2D context is not supported.');
      return;
    }

    // Warm up the noise pattern once for high performance grain
    const noiseCan = document.createElement('canvas');
    noiseCan.width = 128;
    noiseCan.height = 128;
    const noiseCtx = noiseCan.getContext('2d');
    if (noiseCtx) {
      const imgData = noiseCtx.createImageData(128, 128);
      const data = imgData.data;
      for (let j = 0; j < data.length; j += 4) {
        const val = Math.floor(Math.random() * 255);
        data[j] = val;     // R
        data[j + 1] = val; // G
        data[j + 2] = val; // B
        data[j + 3] = 22;  // subtle transparency for sand/grain feel (alpha around 0.08)
      }
      noiseCtx.putImageData(imgData, 0, 0);
      const pattern = ctx.createPattern(noiseCan, 'repeat');
      if (pattern) {
        noisePatternRef.current = pattern;
      }
    }

    let lastTime = performance.now();
    let frameCount = 0;
    let fpsTimer = 0;
    let requestId: number;

    const render = (time: number) => {
      const now = performance.now();
      const delta = now - lastTime;

      // Scale canvas safely
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      const isTracking = rawLandmarks.length > 0;

      // Autonomous anchor point drift if silent idle
      if (!isTracking && !isMouseDownRef.current) {
        const driftTime = time * 0.0012;
        distortCenterTarget.current = {
          x: 0.5 + 0.16 * Math.sin(driftTime),
          y: 0.5 + 0.16 * Math.cos(driftTime * 1.35)
        };
      }

      // Smooth coordinate interpolation
      distortCenterCurrent.current.x += (distortCenterTarget.current.x - distortCenterCurrent.current.x) * 0.15;
      distortCenterCurrent.current.y += (distortCenterTarget.current.y - distortCenterCurrent.current.y) * 0.15;

      // Update Mode Transition progress weights for Mode 1, Mode 2, Mode 3, Mode 4, Mode 5, Mode 6, and Mode 7
      const targetWeight1 = visualModeRef.current === 'concentric' ? 1.0 : 0.0;
      const targetWeight2 = visualModeRef.current === 'scattered' ? 1.0 : 0.0;
      const targetWeight3 = visualModeRef.current === 'dispersed' ? 1.0 : 0.0;
      const targetWeight4 = visualModeRef.current === 'random' ? 1.0 : 0.0;
      const targetWeight5 = visualModeRef.current === 'hyperbolic' ? 1.0 : 0.0;
      const targetWeight6 = visualModeRef.current === 'orbit' ? 1.0 : 0.0;
      const targetWeight7 = visualModeRef.current === 'lines' ? 1.0 : 0.0;

      for (let i = 0; i < 5; i++) {
        const radiusVal = 50.0 - i * 10.0;
        let speed = 0.15 + (radiusVal / 50.0) * 0.20;

        // Significantly reduce the speed specifically when transitioning into or out of Mode 5
        // to make the tornado-like spiral vortex transition extremely slow, fluid, and elegant.
        if (visualModeRef.current === 'hyperbolic' || targetWeight5 === 1.0 || weight5Ref.current[i] > 0.001) {
          speed = 0.011 + (radiusVal / 50.0) * 0.016; // Takes around 3-4 seconds to merge, creating a gorgeous slow-motion glide
        }

        weight1Ref.current[i] += (targetWeight1 - weight1Ref.current[i]) * speed;
        weight2Ref.current[i] += (targetWeight2 - weight2Ref.current[i]) * speed;
        weight3Ref.current[i] += (targetWeight3 - weight3Ref.current[i]) * speed;
        weight4Ref.current[i] += (targetWeight4 - weight4Ref.current[i]) * speed;
        weight5Ref.current[i] += (targetWeight5 - weight5Ref.current[i]) * speed;
        weight6Ref.current[i] += (targetWeight6 - weight6Ref.current[i]) * speed;
        weight7Ref.current[i] += (targetWeight7 - weight7Ref.current[i]) * speed;
      }

      // Track start/elapsed time of dispersed, random, and hyperbolic modes
      if (lastFrameModeRef.current !== visualModeRef.current) {
        if (lastFrameModeRef.current === 'dispersed' && visualModeRef.current === 'random') {
          m3ToM4TransitionStartTimeRef.current = time;
          // Randomize dot colors when moving from mode 3 to mode 4
          mode4DotLayerColorMapRef.current = Array.from({ length: 100 }, () => {
            return Array.from({ length: 5 }, () => Math.floor(Math.random() * 5));
          });
        } else {
          m3ToM4TransitionStartTimeRef.current = null;
        }
        dispersedStartTimeRef.current = null;
        lastFrameModeRef.current = visualModeRef.current;

        // Reset Mode 6 orbital jump affiliations and states to default on switching
        for (let i = 0; i < 100; i++) {
          if (mode6JumpStatesRef.current[i]) {
            const layers = [3, 4];
            layers.forEach((lIdx) => {
              const j = mode6JumpStatesRef.current[i][lIdx];
              if (j) {
                j.isJumping = false;
                j.phase = 'none';
                j.floatYOffset = 0.0;
                j.attachedDotIndex = i;
              }
            });
          }
          if (mode6DotStatesRef.current[i]) {
            mode6DotStatesRef.current[i].state = 'inactive';
            mode6DotStatesRef.current[i].intensity = 0.0;
            mode6DotStatesRef.current[i].activeTimer = 0.0;
            mode6DotStatesRef.current[i].landingRippleScale = 0.0;
          }
        }
        if (visualModeRef.current === 'random') {
          for (let i = 0; i < 100; i++) {
            // Give dots standard staggered start offsets within their cycle so they don't bulk jump at once
            mode4AccumTimeRef.current[i] = (i % 5) * 1.0;
          }
        }
      }

      if (m3ToM4TransitionStartTimeRef.current !== null && (time - m3ToM4TransitionStartTimeRef.current) >= 1600) {
        m3ToM4TransitionStartTimeRef.current = null;
      }

      const isM3ToM4Active = m3ToM4TransitionStartTimeRef.current !== null && (time - m3ToM4TransitionStartTimeRef.current) < 1600;

      if (visualModeRef.current === 'dispersed' || visualModeRef.current === 'random' || visualModeRef.current === 'hyperbolic' || visualModeRef.current === 'orbit') {
        if (dispersedStartTimeRef.current === null) {
          dispersedStartTimeRef.current = time;
        }
      } else {
        dispersedStartTimeRef.current = null;
      }

      if (visualModeRef.current === 'dispersed') {
        if (mode3StartTimeRef.current === null) {
          mode3StartTimeRef.current = time;
        }
      } else if (!isM3ToM4Active) {
        mode3StartTimeRef.current = null;
      }

      const elapsed = dispersedStartTimeRef.current !== null ? (time - dispersedStartTimeRef.current) / 1000.0 : 0.0;
      const m3_elapsed = mode3StartTimeRef.current !== null ? (time - mode3StartTimeRef.current) / 1000.0 : 10.0;

      // 1. Draw elegant background material
      if (uploadedImageRef.current) {
        const img = uploadedImageRef.current;
        const imgW = img.naturalWidth || img.width;
        const imgH = img.naturalHeight || img.height;
        const scale = Math.max(canvas.width / imgW, canvas.height / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const drawX = (canvas.width - drawW) / 2;
        const drawY = (canvas.height - drawH) / 2;
        
        ctx.fillStyle = '#08090b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      } else {
        // Render identical premium constructivist backdrop gradient in 2D
        const w = canvas.width;
        const h = canvas.height;
        const gradient = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, Math.max(w, h) * 0.72);
        gradient.addColorStop(0, '#1c1e24'); // subtle deep grey center
        gradient.addColorStop(1, '#08090b'); // crisp deep black border
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      }

      // 2. Draw 10x10 matrix with 5 layered concentric circles (radii [50, 40, 30, 20, 10]) in order of size
      const rowsCount = 10;
      const colsCount = 10;
      const spacing = 50;
      const baseRadius = circleRadiusRef.current;

      const gridWidth = (colsCount - 1) * spacing;
      const gridHeight = (rowsCount - 1) * spacing;
      const startX = (canvas.width - gridWidth) / 2;
      const startY = (canvas.height - gridHeight) / 2;
      const frameCx = canvas.width / 2;
      const frameCy = canvas.height / 2;

      // Interaction targets in pixel coordinates
      const targetPx = distortCenterCurrent.current.x * canvas.width;
      const targetPy = distortCenterCurrent.current.y * canvas.height;

      const pullRadius = 280; // interactive distance trigger
      ctx.lineWidth = 1.0;

      // Update row-by-row lagging physics for volume-based vertical deformation
      const rowVolumes = rowVolumesRef.current;
      const targetVolume = volumeScaleRef.current;
      rowVolumes[0] += (targetVolume - rowVolumes[0]) * 0.15;
      for (let r = 1; r < 10; r++) {
        rowVolumes[r] += (rowVolumes[r - 1] - rowVolumes[r]) * 0.15;
      }

      // 1.5. Prepare 3D depth-sorting order for concentric circles and white dots
      const getDotCoords = (dotIdx: number, layerIdx: number) => {
        const r = Math.floor(dotIdx / 10);
        const c = dotIdx % 10;

        let w1 = weight1Ref.current[layerIdx];
        let w2 = weight2Ref.current[layerIdx];
        let w3 = weight3Ref.current[layerIdx];
        let w4 = weight4Ref.current[layerIdx];
        let w5 = weight5Ref.current[layerIdx];
        let w6 = weight6Ref.current[layerIdx];
        let w7 = weight7Ref.current[layerIdx];

        if (isM3ToM4Active) {
          const tTrans = (time - m3ToM4TransitionStartTimeRef.current!) / 1000.0;
          w1 = 0.0;
          w2 = 0.0;
          w5 = 0.0;
          w6 = 0.0;
          w7 = 0.0;
          if (tTrans < 0.35) {
            w3 = 1.0;
            w4 = 0.0;
          } else {
            w3 = 0.0;
            w4 = 1.0;
          }
        }

        const scramIndex = scrambleMapRef.current[dotIdx] ?? dotIdx;
        const scramR = Math.floor(scramIndex / 10);
        const scramC = scramIndex % 10;

        const bxOrig = startX + c * spacing;
        const byOrig = startY + r * spacing;

        const bxScram = startX + scramC * spacing;
        const byScram = startY + scramR * spacing;

        // Mode 3
        const m3SpacingX = 50 + (4 - layerIdx) * 8.0;
        const m3SpacingY = 50 + (4 - layerIdx) * 4.0;
        const m3GridWidthL = 9 * m3SpacingX;
        const m3GridHeightL = 9 * m3SpacingY;
        const m3StartXL = frameCx - m3GridWidthL / 2;
        const m3StartYL = frameCy - m3GridHeightL / 2;
        const m3bxCentered = m3StartXL + scramC * m3SpacingX;
        const m3byCentered = m3StartYL + scramR * m3SpacingY;
        const halfW = canvas.width / 2;
        const m3LayerAmp = Math.max(20.0, halfW - m3GridWidthL / 2 - 100);
        const m3Time = isM3ToM4Active ? m3ToM4TransitionStartTimeRef.current! : time;
        const m3Elapsed = isM3ToM4Active 
          ? (m3ToM4TransitionStartTimeRef.current! - (mode3StartTimeRef.current ?? m3ToM4TransitionStartTimeRef.current!)) / 1000.0 
          : m3_elapsed;
        const m3Theta = (2.0 * Math.PI * (m3Time / 1000.0)) / 14.0;
        const swingX = Math.sin(m3Theta);
        const swingEase = Math.pow(Math.min(1.0, m3Elapsed / 2.5), 1.5);
        const bxTarget = m3bxCentered + swingX * m3LayerAmp * swingEase;
        const byTarget = m3byCentered;
        let m3_bx = bxTarget;
        let m3_by = byTarget;
        if (m3Elapsed < 1.5) {
          const progress = Math.min(1.0, m3Elapsed / 1.5);
          const easeOut = 1.0 - Math.pow(1.0 - progress, 3.0);
          m3_bx = bxScram * (1.0 - easeOut) + bxTarget * easeOut;
          m3_by = byScram * (1.0 - easeOut) + byTarget * easeOut;
        }

        // Mode 4
        const period_i = 4.0 + (dotIdx % 5) * 0.5;
        const pTime = mode4AccumTimeRef.current[dotIdx];
        const cycleIdx = Math.floor(pTime / period_i);
        const localCycleTime = pTime % period_i;
        let prevX = frameCx + (c - 4.5) * 100;
        let prevY = frameCy + (r - 4.5) * 70;
        if (cycleIdx > 0) {
          const prevPos = getPseudorandomPos(dotIdx, cycleIdx - 1, canvas.width, canvas.height);
          prevX = prevPos.x;
          prevY = prevPos.y;
        }
        const currPos = getPseudorandomPos(dotIdx, cycleIdx, canvas.width, canvas.height);
        const currX = currPos.x;
        const currY = currPos.y;
        let m4_bx = currX;
        let m4_by = currY;
        if (localCycleTime < 0.4) {
          m4_bx = prevX;
          m4_by = prevY;
        }

        // Mode 5
        const m5_orbitIdx = getMode5OrbitAndIndex(dotIdx).orbit;
        const m5_orbitRef = MODE5_ORBITS[m5_orbitIdx];
        const m5_angleVal = mode5DotAnglesRef.current[dotIdx] !== undefined ? mode5DotAnglesRef.current[dotIdx] : 0.0;
        const m5_cx = frameCx + m5_orbitRef.cxOffset;
        const m5_cy = frameCy + m5_orbitRef.cyOffset;
        const m5_bx = m5_cx + Math.cos(m5_angleVal) * m5_orbitRef.rx;
        const m5_by = m5_cy + Math.sin(m5_angleVal) * m5_orbitRef.ry;

        // Mode 6: Orbit Ellipse in the middle of screen
        const m6_rx = Math.max(100, canvas.width * 0.38);
        const m6_ry = Math.max(40, canvas.height * 0.18);
        const m6_baseAngle = (dotIdx * 2.0 * Math.PI) / 100.0;
        const m6_orbitSpeed = 0.00035;
        const m6_angle = m6_baseAngle + (time * m6_orbitSpeed);
        const m6_bx = frameCx + Math.cos(m6_angle) * m6_rx;
        const m6_by = frameCy + Math.sin(m6_angle) * m6_ry;

        // Mode 7: Lines Layout
        let m7_bx = frameCx;
        let m7_by = frameCy;
        const m7State = mode7StatesRef.current[dotIdx];
        if (m7State) {
          const lineIdx = Math.floor(dotIdx / 20); // 100 dots divided into 5 lines of 20 dots each
          const r1 = m7State.radius;
          const x1 = m7State.x;
          const y1 = frameCy + (lineIdx - 2) * 100;
          
          m7_bx = x1;
          m7_by = y1;
          
          // Compute sticky physics pull from adjacent lines
          let m7_pullX = 0;
          let m7_pullY = 0;
          const adjLines = [];
          if (lineIdx > 0) adjLines.push(lineIdx - 1);
          if (lineIdx < 4) adjLines.push(lineIdx + 1);
          
          adjLines.forEach((adjL) => {
            const startIdx = adjL * 20;
            const endIdx = startIdx + 20;
            for (let otherIdx = startIdx; otherIdx < endIdx; otherIdx++) {
              const m7Other = mode7StatesRef.current[otherIdx];
              if (m7Other) {
                const r2 = m7Other.radius;
                
                // Adjacent lines check: 两圆直径的和大于等于70
                if (2 * (r1 + r2) >= 70) {
                  const x2 = m7Other.x;
                  const y2 = frameCy + (adjL - 2) * 100;
                  
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const distSec = Math.hypot(dx, dy);
                  
                  const maxDist = 150; // Interaction threshold
                  if (distSec < maxDist && distSec > 5.0) {
                    const stickyFactor = (maxDist - distSec) / (maxDist - 100);
                    const clampedSticky = Math.max(0, Math.min(1, stickyFactor));
                    
                    // Pull force pulling them together ("黏性动态, 互相吸引")
                    const force = 24.0 * clampedSticky;
                    m7_pullX += (dx / distSec) * force;
                    m7_pullY += (dy / distSec) * force;
                  }
                }
              }
            }
          });
          
          m7_bx += m7_pullX;
          m7_by += m7_pullY;
        }

        // Interpolation
        let bx = w1 * bxOrig + w2 * bxScram + w3 * m3_bx + w4 * m4_bx + w5 * m5_bx + w6 * m6_bx + w7 * m7_bx;
        let by = w1 * byOrig + w2 * byScram + w3 * m3_by + w4 * m4_by + w5 * m5_by + w6 * m6_by + w7 * m7_by;

        // Spiral vortex swirl for Mode 4 & Mode 5 merger
        if (w4 > 0.01 && w5 > 0.01) {
          const sumW = w4 + w5;
          const tTransition = w5 / sumW;
          const currentCx = frameCx + m5_orbitRef.cxOffset * tTransition;
          const currentCy = frameCy + m5_orbitRef.cyOffset * tTransition;
          const dxCenter = bx - currentCx;
          const dyCenter = by - currentCy;
          const distToCenter = Math.hypot(dxCenter, dyCenter);
          if (distToCenter > 1.0) {
            const ratio = tTransition * (1.0 - tTransition);
            const contractionStrength = ratio * 1.55;
            const targetDist = distToCenter * (1.0 - contractionStrength);
            const twistIntensity = (1.0 - tTransition) * 3.6 * (1.0 + (dotIdx % 3) * 0.25);
            const currentAng = Math.atan2(dyCenter, dxCenter);
            const swirledAng = currentAng + twistIntensity;
            bx = currentCx + Math.cos(swirledAng) * targetDist;
            by = currentCy + Math.sin(swirledAng) * targetDist;
          }
        }

        // Elastic distortion
        const dx = targetPx - bx;
        const dy = targetPy - by;
        const dist = Math.hypot(dx, dy);
        let x = bx;
        let y = by;
        if (dist < pullRadius) {
          const gravityStrength = 0.85 * w1;
          if (gravityStrength > 0.01) {
            const factor = Math.pow(1.0 - dist / pullRadius, 1.8) * gravityStrength;
            x += dx * factor;
            y += dy * factor;
          }
        }

        return { x, y };
      };

      const sortedDotIndices = Array.from({ length: 100 }, (_, i) => i)
        .sort((a, b) => {
          return getDotCoords(a, 4).y - getDotCoords(b, 4).y;
        });

      // Draw the central narrow tracking elliptical orbit path if Mode 6 is active
      const w6_active = weight6Ref.current[4];
      if (w6_active > 0.001) {
        ctx.save();
        ctx.strokeStyle = `rgba(255, 255, 255, ${(w6_active * 0.165).toFixed(3)})`;
        ctx.lineWidth = 0.55; // 極細白色軌道
        ctx.beginPath();
        const m6_rx = Math.max(100, canvas.width * 0.38);
        const m6_ry = Math.max(40, canvas.height * 0.18);
        ctx.ellipse(frameCx, frameCy, m6_rx, m6_ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Query live frequency data from AnalyserNode
      const analyser = analyserNodeRef.current;
      const freqData = frequencyDataRef.current;
      if (analyser) {
        analyser.getByteFrequencyData(freqData);
      } else {
        freqData.fill(0);
      }

      // Live sub-bass drum frequency energy (bins 1 to 4) for heavy accent detection
      const bassValVal = (freqData[1] || 0) + (freqData[2] || 0) + (freqData[3] || 0) + (freqData[4] || 0);
      const bassIntensity = (bassValVal / 4.0) / 255.0;

      const threshold = 0.35; // optimal active threshold for beat peaks
      let isBeat = false;
      if (bassIntensity > threshold && bassIntensity > lastBassIntensityRef.current + 0.05) {
        isBeat = true;
      }
      lastBassIntensityRef.current = bassIntensity;

      // Calculate instantaneous amplitude (energy) of frequency bands for Mode 4
      // 1. 人声频带 (Vocals Band): Focuses heavily on vocal formants and fundamentals (~100Hz - 1000Hz, bins 1 to 6)
      const vocalSum = (freqData[1] || 0) + (freqData[2] || 0) + (freqData[3] || 0) + (freqData[4] || 0) + (freqData[5] || 0) + (freqData[6] || 0);
      const vocalsAmp = (vocalSum / 6.0) / 255.0;

      // 2. 中频频带 (Mid-range Band): harmonics of mid instruments/vocals/snare (~1000Hz - 3000Hz, bins 7 to 18)
      let midSum = 0;
      for (let bIdx = 7; bIdx <= 18; bIdx++) {
        midSum += freqData[bIdx] || 0;
      }
      const midAmp = (midSum / 12.0) / 255.0;

      // 3. 高频弦乐频带 (High-frequency Strings Band): high string melodies and cymbals (~3000Hz - 8000Hz, bins 19 to 48)
      let highSum = 0;
      for (let bIdx = 19; bIdx <= 48; bIdx++) {
        highSum += freqData[bIdx] || 0;
      }
      const highStringsAmp = (highSum / 30.0) / 255.0;

      if (isBeat) {
        beatPulseRef.current = 1.0; // Instant expansion peak
      } else {
        beatPulseRef.current *= 0.88; // Smooth exponential decay
      }

      // Update 100 dot points' audio intensity vectors and shift history buffers
      const gridIntensities = gridAudioIntensityRef.current;
      const intensityHistories = intensityHistoryRef.current;
      const dt = Math.min(0.1, delta / 1000.0);

      for (let i = 0; i < 100; i++) {
        // Human hearing is logarithmic, and music is condensed in lower/middle frequencies.
        // We focus the mapping entirely on the active spectrum (bins 0 to 48, up to ~8.2 kHz).
        // This ensures the bottom rows (indices 80-99) fall inside highly active instrumental/cymbal frequencies!
        const t = i / 99;
        const factor = Math.pow(t, 1.6);
        const maxActiveBin = 48;
        const binIdx = Math.min(127, Math.floor(factor * maxActiveBin));
        const rawHz = freqData[binIdx] || 0;

        // Progressive volume boost: since high frequency bands naturally decay rapidly,
        // we add an elegant progressive boost so all rows are extremely vibrant.
        const frequencyBoost = 1.0 + (binIdx / maxActiveBin) * 4.2;
        let targetHz = Math.min(1.0, (rawHz / 255.0) * frequencyBoost);

        // Mix 12% of the bass/mid rhythm into higher frequency rows to maintain cohesive pulsing
        const bassVal = (freqData[1] || 0) + (freqData[2] || 0) + (freqData[3] || 0);
        const avgBass = (bassVal / 3.0) / 255.0;
        if (binIdx > 12) {
          targetHz = targetHz * 0.88 + avgBass * 0.12;
        }
        
        // Slightly smooth out to make transitions look wonderful
        gridIntensities[i] += (targetHz - gridIntensities[i]) * 0.35;
        
        const history = intensityHistories[i];
        history.unshift(gridIntensities[i]);
        if (history.length > 30) {
          history.pop();
        }

        // --- Accumulate rhythm-based virtual time for Mode 4 position jumping ---
        let bandAmp = 0.0;
        if (i < 30) {
          bandAmp = vocalsAmp;
        } else if (i < 70) {
          bandAmp = midAmp;
        } else {
          bandAmp = highStringsAmp;
        }

        // Base flow rate is 0.7s per real-time second.
        // Accelerated by music energy to make positions jump matching rhythm intensity!
        const speedMultiplier = 0.7 + bandAmp * 4.3;
        let deltaProgress = dt * speedMultiplier;

        // When a beat/drum hits, push the timelines of dots forward by a strong staggered step
        if (isBeat) {
          deltaProgress += 0.22 + (i % 8) * 0.04;
        }
        mode4AccumTimeRef.current[i] += deltaProgress;

        // --- Accumulate orbit-based motion angle for Mode 5 ---
        // For Mode 5 independent tone mapping, determine its unique unmixed raw frequency intensity
        let m5_dotBinIdx = 20;
        if (mode5FreqBinMapRef.current && mode5FreqBinMapRef.current[i] !== undefined) {
          m5_dotBinIdx = mode5FreqBinMapRef.current[i];
        } else {
          const m5_tVal = i / 99;
          const m5_factorVal = Math.pow(m5_tVal, 1.6);
          m5_dotBinIdx = Math.min(127, Math.floor(m5_factorVal * 48));
        }
        const m5_rawHzVal = (freqData[m5_dotBinIdx] || 0) / 255.0;

        // Smooth individual tone/frequency intensity in a slow and fluid low-pass filter to prevent fast flashing
        if (mode5DotSmoothedHzRef.current[i] === undefined) {
          mode5DotSmoothedHzRef.current[i] = 0.0;
        }
        const m5_smoothHzVal = mode5DotSmoothedHzRef.current[i] + (m5_rawHzVal - mode5DotSmoothedHzRef.current[i]) * 0.06;
        mode5DotSmoothedHzRef.current[i] = m5_smoothHzVal;

        if (mode5DotAnglesRef.current[i] !== undefined) {
          const dir = mode5DotDirectionsRef.current[i] || 1;
          const baseSpd = mode5DotSpeedsRef.current[i] || 0.00003;

          // Highly elegant and soft speed reaction: slow, gentle, and smooth based on individual dot frequency
          const speedMultiplier = 1.0 + m5_smoothHzVal * 1.5;
          const deltaAng = dir * baseSpd * delta * speedMultiplier;
          mode5DotAnglesRef.current[i] = (mode5DotAnglesRef.current[i] + deltaAng) % (Math.PI * 2);
        }

        // --- Update Mode 5 dot state transitions ---
        if (!mode5DotStatesRef.current[i]) {
          mode5DotStatesRef.current[i] = {
            state: 'inactive',
            appearProgress: 0.0,
            disappearProgress: 0.0,
            litTimer: 0.0,
          };
        }
        
        const m5StateObj = mode5DotStatesRef.current[i];
        if (m5StateObj.litTimer === undefined) {
          m5StateObj.litTimer = 0.0;
        }

        // Apply countdown to the cooldown timer
        if (mode5CooldownsRef.current[i] !== undefined && mode5CooldownsRef.current[i] > 0) {
          mode5CooldownsRef.current[i] = Math.max(0, mode5CooldownsRef.current[i] - dt);
        }
        
        const threshold = mode5ThresholdsRef.current[i] !== undefined ? mode5ThresholdsRef.current[i] : 0.22;
        const targetLitDuration = mode5LitDurationsRef.current[i] !== undefined ? mode5LitDurationsRef.current[i] : 1.0;
        const cooldownRemaining = mode5CooldownsRef.current[i] !== undefined ? mode5CooldownsRef.current[i] : 0.0;

        const isTonePresent = m5_smoothHzVal > threshold && cooldownRemaining <= 0; 
        
        if (m5StateObj.state === 'inactive') {
          // Staggered trigger: tone must exceed threshold, and there is a randomized chance per frame (dt) to activate.
          // This gives each dot an elegant, natural time-staggered birth delay.
          const triggerChance = 1.5 * dt * (m5_smoothHzVal / threshold);
          if (isTonePresent && Math.random() < triggerChance) {
            m5StateObj.state = 'appearing';
            m5StateObj.appearProgress = 0.0;
            m5StateObj.disappearProgress = 0.0;
            m5StateObj.litTimer = 0.0;
          }
        }
        
        if (m5StateObj.state === 'appearing') {
          // Smoothly build up appearProgress towards 1.0 (very responsive)
          m5StateObj.appearProgress = Math.min(1.0, m5StateObj.appearProgress + dt * 6.0);
          
          // Stay lit for the randomized duration under music playback
          m5StateObj.litTimer += dt;
          if (m5StateObj.litTimer >= targetLitDuration) {
            m5StateObj.state = 'disappearing';
            m5StateObj.disappearProgress = 0.0;
          }
        } else if (m5StateObj.state === 'disappearing') {
          // Decay progress to 1.0 over about 0.8 seconds (duration = dt * (1 / 0.8) = dt * 1.25)
          m5StateObj.disappearProgress += dt * 1.25;
          if (m5StateObj.disappearProgress >= 1.0) {
            m5StateObj.state = 'inactive';
            m5StateObj.disappearProgress = 1.0;
            m5StateObj.appearProgress = 0.0;
            m5StateObj.litTimer = 0.0;

            // Set a randomized cooldown (e.g. 0.4s to 3.0s) so this dot doesn't immediately reappear
            mode5CooldownsRef.current[i] = 0.4 + Math.random() * 2.6;

            // Shifting position: "圆消失后，应该随机出现在别的位置（新的轨道随机位置）"
            const newOrbit = Math.floor(Math.random() * 5);
            const orbitCounts = [36, 26, 18, 12, 8];
            const newIndex = Math.floor(Math.random() * orbitCounts[newOrbit]);
            
            if (mode5DotToOrbitMapRef.current) {
              mode5DotToOrbitMapRef.current[i] = { orbit: newOrbit, index: newIndex };
            }
            if (mode5DotAnglesRef.current && mode5DotAnglesRef.current[i] !== undefined) {
              mode5DotAnglesRef.current[i] = Math.random() * Math.PI * 2;
            }
          }
        } else {
          // Completely inactive
          m5StateObj.appearProgress = 0.0;
          m5StateObj.disappearProgress = 0.0;
          m5StateObj.litTimer = 0.0;
        }

        // --- Update Mode 7 position movement ---
        const m7State = mode7StatesRef.current[i];
        if (m7State) {
          m7State.x += m7State.dir * m7State.speed * dt;
          const padding = m7State.radius + 20;
          const w = canvas.width || window.innerWidth || 1200;
          if (m7State.dir > 0 && m7State.x > w + padding) {
            m7State.x = -padding;
          } else if (m7State.dir < 0 && m7State.x < -padding) {
            m7State.x = w + padding;
          }
        }

        // --- Update Mode 6 state transitions ---
        if (!mode6DotStatesRef.current[i]) {
          mode6DotStatesRef.current[i] = {
            state: 'inactive',
            intensity: 0.0,
            activeTimer: 0.0,
            litDuration: 0.8 + Math.random() * 1.2,
            cooldown: 0.0,
            landingRippleScale: 0.0,
          };
        }
        const m6StateObj = mode6DotStatesRef.current[i];

        // Decelerate cooldown
        if (m6StateObj.cooldown > 0) {
          m6StateObj.cooldown = Math.max(0, m6StateObj.cooldown - dt);
        }
        
        // Decelerate landing ripple
        if (m6StateObj.landingRippleScale > 0) {
          m6StateObj.landingRippleScale = Math.max(0, m6StateObj.landingRippleScale - dt * 2.5);
        }

        const m6_audioVal = gridIntensities[i] !== undefined ? gridIntensities[i] : 0.0;
        const m6_threshold = 0.22;

        if (m6StateObj.state === 'inactive') {
          // If we are in orbit mode and audio exceeds threshold
          if (visualModeRef.current === 'orbit' && m6_audioVal > m6_threshold && m6StateObj.cooldown <= 0) {
            m6StateObj.state = 'active';
            m6StateObj.activeTimer = 0.0;
            m6StateObj.cooldown = m6StateObj.litDuration + 0.5 + Math.random() * 1.5;
            m6StateObj.litDuration = 0.8 + Math.random() * 1.2;
            
            // Trigger the jump of 10px (layer index 4) and 20px (layer index 3) circles
            const m6_rx = Math.max(100, canvas.width * 0.38);
            const m6_ry = Math.max(40, canvas.height * 0.18);
            const m6_baseAngle = (i * 2.0 * Math.PI) / 100.0;
            const m6_orbitSpeed = 0.00035;
            const m6_angle = m6_baseAngle + (time * m6_orbitSpeed);
            const launchX = frameCx + Math.cos(m6_angle) * m6_rx;
            const launchY = frameCy + Math.sin(m6_angle) * m6_ry;

            const layersToJump = [3, 4];
            layersToJump.forEach((lIdx) => {
              if (!mode6JumpStatesRef.current[i]) {
                mode6JumpStatesRef.current[i] = {
                  3: { isJumping: false, phase: 'none', startX: 0, startY: 0, floatYOffset: 0, height: 80, riseDuration: 0.5, hoverDuration: 0.16, fallDuration: 0.5, elapsed: 0, attachedDotIndex: i },
                  4: { isJumping: false, phase: 'none', startX: 0, startY: 0, floatYOffset: 0, height: 100, riseDuration: 0.5, hoverDuration: 0.16, fallDuration: 0.5, elapsed: 0, attachedDotIndex: i },
                };
              }
              const jumpObj = mode6JumpStatesRef.current[i][lIdx];
              jumpObj.isJumping = true;
              jumpObj.phase = 'rising';
              jumpObj.startX = launchX;
              jumpObj.startY = launchY;
              jumpObj.floatYOffset = 0.0;
              jumpObj.elapsed = 0.0;
              jumpObj.height = 70.0 + Math.random() * 120.0; // Staggered height "滞空高度不统一, 错落有致"
              jumpObj.riseDuration = 0.35 + Math.random() * 0.2;
              jumpObj.hoverDuration = 0.12 + Math.random() * 0.15; // Slightly reduced hover duration per request
              jumpObj.fallDuration = 0.35 + Math.random() * 0.2;
              jumpObj.attachedDotIndex = i; // Reset affiliation back to origin
            });
          }
        }

        if (m6StateObj.state === 'active') {
          m6StateObj.intensity = Math.min(1.0, m6StateObj.intensity + dt * 5.0);
          m6StateObj.activeTimer += dt;
          if (m6StateObj.activeTimer >= m6StateObj.litDuration) {
            m6StateObj.state = 'inactive';
          }
        } else {
          m6StateObj.intensity = Math.max(0.0, m6StateObj.intensity - dt * 2.0);
        }

        // Process physics for layer 3 and 4
        if (mode6JumpStatesRef.current[i]) {
          const lIdxs = [3, 4];
          lIdxs.forEach((lIdx) => {
            const jumpObj = mode6JumpStatesRef.current[i][lIdx];
            if (jumpObj.isJumping) {
              jumpObj.elapsed += dt;
              const totalDur = jumpObj.riseDuration + jumpObj.hoverDuration + jumpObj.fallDuration;
              if (jumpObj.elapsed < jumpObj.riseDuration) {
                jumpObj.phase = 'rising';
                const ratio = jumpObj.elapsed / jumpObj.riseDuration;
                const easeOutCubic = 1.0 - Math.pow(1.0 - ratio, 3.0);
                jumpObj.floatYOffset = jumpObj.height * easeOutCubic;
              } else if (jumpObj.elapsed < (jumpObj.riseDuration + jumpObj.hoverDuration)) {
                jumpObj.phase = 'hovering';
                const ratio = (jumpObj.elapsed - jumpObj.riseDuration) / jumpObj.hoverDuration;
                const hoverBob = Math.sin(ratio * Math.PI) * 4.0;
                jumpObj.floatYOffset = jumpObj.height + hoverBob;
              } else if (jumpObj.elapsed < totalDur) {
                jumpObj.phase = 'falling';
                const ratio = (jumpObj.elapsed - jumpObj.riseDuration - jumpObj.hoverDuration) / jumpObj.fallDuration;
                const easeInQuad = ratio * ratio;
                jumpObj.floatYOffset = jumpObj.height * (1.0 - easeInQuad);
              } else {
                jumpObj.phase = 'none';
                jumpObj.isJumping = false;
                jumpObj.floatYOffset = 0.0;
                jumpObj.elapsed = 0.0;

                // Search nearest dot index k in Mode 6 coordinates
                const landingX = jumpObj.startX;
                const landingY = jumpObj.startY;

                let bestK = i;
                let minDist = Infinity;
                const m6_rx = Math.max(100, canvas.width * 0.38);
                const m6_ry = Math.max(40, canvas.height * 0.18);
                const m6_orbitSpeed = 0.00035;

                for (let k = 0; k < 100; k++) {
                  const k_baseAngle = (k * 2.0 * Math.PI) / 100.0;
                  const k_angle = k_baseAngle + (time * m6_orbitSpeed);
                  const k_bx = frameCx + Math.cos(k_angle) * m6_rx;
                  const k_by = frameCy + Math.sin(k_angle) * m6_ry;
                  const d = Math.hypot(k_bx - landingX, k_by - landingY);
                  if (d < minDist) {
                    minDist = d;
                    bestK = k;
                  }
                }

                jumpObj.attachedDotIndex = bestK;

                // Trigger landing flash/ripple scale pop on bestK
                if (!mode6DotStatesRef.current[bestK]) {
                  mode6DotStatesRef.current[bestK] = {
                    state: 'inactive', intensity: 0.0, activeTimer: 0.0, litDuration: 1.0, cooldown: 0.0, landingRippleScale: 0.0
                  };
                }
                mode6DotStatesRef.current[bestK].landingRippleScale = 1.0;
              }
            }
          });
        }
      }

      // Hex helper to guarantee a valid draw without canvas errors
      const getValidHexColor = (hex: string, defaultColor: string) => {
        if (/^#[0-9A-F]{6}$/i.test(hex) || /^#[0-9A-F]{3}$/i.test(hex)) {
          return hex;
        }
        return defaultColor;
      };

      const currentColors = circleColorsRef.current;

      // ---- MODE 5: Replaced/Deleted Original Contents ----

      // Define our concentric layers from bottom to top (smallest on top of largest) with progressive index
      const concentricLayers = [
        { maxRadius: 50.0, colorKey: 'c50' as const, layerIndex: 0 },
        { maxRadius: 40.0, colorKey: 'c40' as const, layerIndex: 1 },
        { maxRadius: 30.0, colorKey: 'c30' as const, layerIndex: 2 },
        { maxRadius: 20.0, colorKey: 'c20' as const, layerIndex: 3 },
        { maxRadius: 10.0, colorKey: 'c10' as const, layerIndex: 4 },
      ];

      // Draw each layer as a single batch, looping in 3D depth-sorted order to preserve perspective overlaps
      concentricLayers.forEach(({ maxRadius, colorKey, layerIndex }) => {
        const cachedCanvasNormal = layerCanvasesRef.current[layerIndex];
        if (!cachedCanvasNormal) return;

        // Draw Mode 7 background horizontal lines (parallel to x-axis)
        const currentW7 = weight7Ref.current[2] || 0.0;
        if (layerIndex === 0 && currentW7 > 0.01) {
          ctx.save();
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 * currentW7})`;
          ctx.lineWidth = 0.5;
          for (let j = 0; j < 5; j++) {
            const lineY = frameCy + (j - 2) * 100;
            ctx.beginPath();
            ctx.moveTo(0, lineY);
            ctx.lineTo(canvas.width, lineY);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Draw Mode 7 sticky fluid bridges (water-droplet attraction) if w7 is active
        if (currentW7 > 0.01) {
          // Draw sticky fluid bridges between adjacent lines for this layer
          for (let L = 0; L < 4; L++) {
            const currentLineDotsStart = L * 20;
            const nextLineDotsStart = (L + 1) * 20;

            for (let i = currentLineDotsStart; i < currentLineDotsStart + 20; i++) {
              const m7State1 = mode7StatesRef.current[i];
              if (!m7State1) continue;

              const audio1 = gridIntensities[i] !== undefined ? gridIntensities[i] : 0.0;
              if (audio1 < 0.04) continue; // skip silent dots

              const r1 = m7State1.radius * (maxRadius / 50.0) * (0.15 + 0.85 * Math.min(1.0, audio1 * 2.5));
              const coord1 = getDotCoords(i, layerIndex);
              const x1 = coord1.x;
              const y1 = coord1.y;

              for (let j = nextLineDotsStart; j < nextLineDotsStart + 20; j++) {
                const m7State2 = mode7StatesRef.current[j];
                if (!m7State2) continue;

                const audio2 = gridIntensities[j] !== undefined ? gridIntensities[j] : 0.0;
                if (audio2 < 0.04) continue; // skip silent dots

                // Adjacent check: 两圆直径的和大于等于70
                if (2 * (m7State1.radius + m7State2.radius) < 70) continue;

                const r2 = m7State2.radius * (maxRadius / 50.0) * (0.15 + 0.85 * Math.min(1.0, audio2 * 2.5));
                const coord2 = getDotCoords(j, layerIndex);
                const x2 = coord2.x;
                const y2 = coord2.y;

                const dx = x2 - x1;
                const dy = y2 - y1;
                const distSec = Math.hypot(dx, dy);

                const maxDist = 150; // merge Interaction limit
                if (distSec < maxDist && distSec > 5.0) {
                  const stickyFactor = (maxDist - distSec) / (maxDist - 100);
                  const clampedSticky = Math.max(0, Math.min(1, stickyFactor));

                  if (clampedSticky > 0.01) {
                    const angle = Math.atan2(dy, dx);
                    const spread = Math.PI * 0.45 * clampedSticky;

                    // tangent nodes on circle 1
                    const p1x = x1 + r1 * Math.cos(angle + spread);
                    const p1y = y1 + r1 * Math.sin(angle + spread);
                    const p2x = x1 + r1 * Math.cos(angle - spread);
                    const p2y = y1 + r1 * Math.sin(angle - spread);

                    // tangent nodes on circle 2
                    const p3x = x2 + r2 * Math.cos(angle + Math.PI + spread);
                    const p3y = y2 + r2 * Math.sin(angle + Math.PI + spread);
                    const p4x = x2 + r2 * Math.cos(angle + Math.PI - spread);
                    const p4y = y2 + r2 * Math.sin(angle + Math.PI - spread);

                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;

                    // neck narrow control
                    const neckRadius = Math.min(r1, r2) * 0.75 * clampedSticky;
                    const side1X = midX + neckRadius * Math.cos(angle + Math.PI / 2);
                    const side1Y = midY + neckRadius * Math.sin(angle + Math.PI / 2);

                    const side2X = midX + neckRadius * Math.cos(angle - Math.PI / 2);
                    const side2Y = midY + neckRadius * Math.sin(angle - Math.PI / 2);

                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(p1x, p1y);
                    ctx.quadraticCurveTo(side1X, side1Y, p4x, p4y);
                    ctx.lineTo(p3x, p3y);
                    ctx.quadraticCurveTo(side2X, side2Y, p2x, p2y);
                    ctx.closePath();

                    const hex1 = currentColors[colorKey] || '#ffffff';
                    ctx.fillStyle = getValidHexColor(hex1, '#ffffff');

                    const avgAlpha = (Math.min(1.0, audio1 * 2.0) + Math.min(1.0, audio2 * 2.0)) / 2 * currentW7;
                    ctx.globalAlpha = avgAlpha;
                    ctx.fill();
                    ctx.restore();
                  }
                }
              }
            }
          }
        }

        sortedDotIndices.forEach((dotIndex) => {
          const r = Math.floor(dotIndex / colsCount);
          const c = dotIndex % colsCount;
          
          let w1 = weight1Ref.current[layerIndex];
          let w2 = weight2Ref.current[layerIndex];
          let w3 = weight3Ref.current[layerIndex];
          let w4 = weight4Ref.current[layerIndex];
          let w5 = weight5Ref.current[layerIndex];
          let w6 = weight6Ref.current[layerIndex];
          let w7 = weight7Ref.current[layerIndex];

          const cachedCanvas = (w5 > 0.2) 
            ? (layerCanvasesMode5Ref.current[layerIndex] || cachedCanvasNormal) 
            : cachedCanvasNormal;

          if (isM3ToM4Active) {
            const tTrans = (time - m3ToM4TransitionStartTimeRef.current!) / 1000.0;
            w1 = 0.0;
            w2 = 0.0;
            w5 = 0.0;
            w6 = 0.0;
            w7 = 0.0;
            if (tTrans < 0.35) {
              w3 = 1.0;
              w4 = 0.0;
            } else {
              w3 = 0.0;
              w4 = 1.0;
            }
          }

          const trans = 1.0 - w1;

          const scramIndex = scrambleMapRef.current[dotIndex] ?? dotIndex;
          const scramR = Math.floor(scramIndex / colsCount);
          const scramC = scramIndex % colsCount;

          // Swapping positions exactly on the original coordinate axes grid
          const bxOrig = startX + c * spacing;
          const byOrig = startY + r * spacing;

          // ---- RESTOREATIVE MODE 2 SCRAMBLED COORDINATES ----
          const bxScram = startX + scramC * spacing;
          const byScram = startY + scramR * spacing;

          // ---- NEW MODE 3 PERSPECTIVE DEPTH + DIAGONAL SWEEP ----
          const m3SpacingX = 50 + (4 - layerIndex) * 8.0; // 50px for top layer, 82px for bottom layer
          const m3SpacingY = 50 + (4 - layerIndex) * 4.0; // 50px for top layer, 66px for bottom layer
          const m3GridWidthL = (colsCount - 1) * m3SpacingX;
          const m3GridHeightL = (rowsCount - 1) * m3SpacingY;
          const m3StartXL = frameCx - m3GridWidthL / 2;
          const m3StartYL = frameCy - m3GridHeightL / 2;
          const m3bxCentered = m3StartXL + scramC * m3SpacingX;
          const m3byCentered = m3StartYL + scramR * m3SpacingY;

          // Calculate standard/dynamic amplitude so outermost circles at maximum swing are exactly 100px from the screen sidebar borders
          const halfW = canvas.width / 2;
          const m3LayerAmp = Math.max(20.0, halfW - m3GridWidthL / 2 - 100);

          const m3Time = isM3ToM4Active ? m3ToM4TransitionStartTimeRef.current! : time;
          const m3Elapsed = isM3ToM4Active 
            ? (m3ToM4TransitionStartTimeRef.current! - (mode3StartTimeRef.current ?? m3ToM4TransitionStartTimeRef.current!)) / 1000.0 
            : m3_elapsed;

          const m3Theta = (2.0 * Math.PI * (m3Time / 1000.0)) / 14.0;
          const swingX = Math.sin(m3Theta);
          // Smooth, positive-only interpolation from 0.0 to 1.0 on transition to prevent sudden jerking or visual shrinkage
          const swingEase = Math.pow(Math.min(1.0, m3Elapsed / 2.5), 1.5);

          // Removed wide angle diagonal distortion completely. Only apply horizontal swing.
          const bxTarget = m3bxCentered + swingX * m3LayerAmp * swingEase;
          const byTarget = m3byCentered;

          let m3_bx = bxTarget;
          let m3_by = byTarget;

          if (m3Elapsed < 1.5) {
            // Direct natural dispersion from Mode 2 scrambled grids (bxScram, byScram)
            const progress = Math.min(1.0, m3Elapsed / 1.5);
            const easeOut = 1.0 - Math.pow(1.0 - progress, 3.0); // cubic ease-out
            m3_bx = bxScram * (1.0 - easeOut) + bxTarget * easeOut;
            m3_by = byScram * (1.0 - easeOut) + byTarget * easeOut;
          }

          // baseline coordinates used as reference for staggered transitions in Mode 4
          const bxReg = frameCx + (c - 4.5) * 100;
          const byReg = frameCy + (r - 4.5) * 70;

          // ---- MODE 4: Staggered Random Jumps ----
          const period_i = 4.0 + (dotIndex % 5) * 0.5; // cycle duration between 4.0s and 6.0s
          const pTime = mode4AccumTimeRef.current[dotIndex];
          const cycleIdx = Math.floor(pTime / period_i);
          const localCycleTime = pTime % period_i;

          let prevX = bxReg;
          let prevY = byReg;
          if (cycleIdx > 0) {
            const prevPos = getPseudorandomPos(dotIndex, cycleIdx - 1, canvas.width, canvas.height);
            prevX = prevPos.x;
            prevY = prevPos.y;
          }

          const currPos = getPseudorandomPos(dotIndex, cycleIdx, canvas.width, canvas.height);
          const currX = currPos.x;
          const currY = currPos.y;

          let m4_bx = currX;
          let m4_by = currY;
          let m4_scale = 1.0;

          const T_peak = 0.9 + 0.75 * (period_i - 0.9);
          const totalDuration = (period_i + 0.4) - T_peak;

          if (localCycleTime < 0.4) {
            m4_bx = prevX;
            m4_by = prevY;
            const timeSincePeak = (period_i - T_peak) + localCycleTime;
            const p = Math.max(0.0, Math.min(1.0, timeSincePeak / totalDuration));
            // Seamlessly contract/fade out to 0.0 with cosine ease from 1.0 peak
            const ease = 0.5 + 0.5 * Math.cos(p * Math.PI);
            m4_scale = ease;
          } else if (localCycleTime < 0.9) {
            m4_bx = currX;
            m4_by = currY;
            const progress = (localCycleTime - 0.4) / 0.5;
            // Rapid peak expansion to 1.0 with sine ease
            m4_scale = Math.sin(progress * Math.PI / 2);
          } else {
            m4_bx = currX;
            m4_by = currY;
            const t2 = (localCycleTime - 0.9) / (period_i - 0.9);
            if (t2 < 0.75) {
              m4_scale = 1.0; // Keep fully expanded
            } else {
              // Smooth final contraction matching the crossover phase
              const timeSincePeak = localCycleTime - T_peak;
              const p = Math.max(0.0, Math.min(1.0, timeSincePeak / totalDuration));
              const ease = 0.5 + 0.5 * Math.cos(p * Math.PI);
              m4_scale = ease;
            }
          }

          // ---- MODE 5: Concentric Ring Orbit ----
          const m5_orbitIdx = getMode5OrbitAndIndex(dotIndex).orbit;
          const m5_orbitRef = MODE5_ORBITS[m5_orbitIdx];
          const m5_angleVal = mode5DotAnglesRef.current[dotIndex] !== undefined ? mode5DotAnglesRef.current[dotIndex] : 0.0;
          const m5_cx = frameCx + m5_orbitRef.cxOffset;
          const m5_cy = frameCy + m5_orbitRef.cyOffset;
          const m5_bx = m5_cx + Math.cos(m5_angleVal) * m5_orbitRef.rx;
          const m5_by = m5_cy + Math.sin(m5_angleVal) * m5_orbitRef.ry;

          // ---- MODE 6: Ellipse Orbit Clockwise ----
          const m6_rx = Math.max(100, canvas.width * 0.38);
          const m6_ry = Math.max(40, canvas.height * 0.18);
          const m6_baseAngle = (dotIndex * 2.0 * Math.PI) / 100.0;
          const m6_orbitSpeed = 0.00035;
          const m6_angle = m6_baseAngle + (time * m6_orbitSpeed);
          const m6_bx = frameCx + Math.cos(m6_angle) * m6_rx;
          const m6_by = frameCy + Math.sin(m6_angle) * m6_ry;

          let bx = w1 * bxOrig + w2 * bxScram + w3 * m3_bx + w4 * m4_bx + w5 * m5_bx + w6 * m6_bx;
          let by = w1 * byOrig + w2 * byScram + w3 * m3_by + w4 * m4_by + w5 * m5_by + w6 * m6_by;

          // Tornado-like vortex spiral attraction transition between Mode 4 and Mode 5 ("轨道会像龙卷风一样吸引周边的圆")
          if (w4 > 0.01 && w5 > 0.01) {
            const sumW = w4 + w5;
            const tTransition = w5 / sumW; // 0 -> 1 as we move from Mode 4 to Mode 5
            
            const currentCx = frameCx + m5_orbitRef.cxOffset * tTransition;
            const currentCy = frameCy + m5_orbitRef.cyOffset * tTransition;
            
            const dxCenter = bx - currentCx;
            const dyCenter = by - currentCy;
            const distToCenter = Math.hypot(dxCenter, dyCenter);
            
            if (distToCenter > 1.0) {
              const ratio = tTransition * (1.0 - tTransition); // peaks at 0.25 midway
              const contractionStrength = ratio * 1.55; 
              const targetDist = distToCenter * (1.0 - contractionStrength);
              
              // Spiral/tornado vortex angular twist that decays to 0 as we settle into Mode 5 orbits
              const twistIntensity = (1.0 - tTransition) * 3.6 * (1.0 + (dotIndex % 3) * 0.25);
              const currentAng = Math.atan2(dyCenter, dxCenter);
              const swirledAng = currentAng + twistIntensity;
              
              bx = currentCx + Math.cos(swirledAng) * targetDist;
              by = currentCy + Math.sin(swirledAng) * targetDist;
            }
          }

          // Elastic distortion formula
          const dx = targetPx - bx;
          const dy = targetPy - by;
          const dist = Math.hypot(dx, dy);

          let x = bx;
          let y = by;

          if (dist < pullRadius) {
            const gravityStrength = 0.85 * w1;
            if (gravityStrength > 0.01) {
              const factor = Math.pow(1.0 - dist / pullRadius, 1.8) * gravityStrength;
               x += dx * factor;
               y += dy * factor;
            }
          }

          // Concentric batch index (0 to 4) working outwards from center (4.5, 4.5)
          const origB = Math.max(Math.abs(r - 4.5), Math.abs(c - 4.5));
          const scramB = Math.max(Math.abs(scramR - 4.5), Math.abs(scramC - 4.5));
          const currentB = origB * (1.0 - trans) + scramB * trans;
          const b = Math.floor(currentB);
          
          // Normalized master progress based on the current left-hand pinch radius
          const p = baseRadius / 50.0;

          // Staggered trigger offsets: Batch 0 starts first, Batch 4 starts last.
          const start_b = b * 0.12;
          const width = 0.52; // 0.12 * 4 + 0.52 = 1.0, preserving perfect fully-open state of 50px
          const p_b = Math.max(0, Math.min(1, (p - start_b) / width));

          // Dynamic maxRadius scaling based on animated orbital radius for Mode 5
          const currentMaxRadius = maxRadius;

          const localCircleRadius = p_b * currentMaxRadius;

          // ---- REFACTORED MODE 3 CIRCLE DIAMETER MORPHING ----
          let targetLocalCircleRadius = localCircleRadius;
          const m3AmpFactorVal = Math.abs(swingX);

          if (w3 > 0.0) {
            // As horizontal swing amplitude gets larger, shrink all circles under 10px diameter (5px radius)
            // "图层越下，圆就越小，图层越上，圆就越大":
            // layerIndex = 0 is the bottom-most layer, which gets smallest target radius.
            // layerIndex = 4 is the top-most component layer, which gets larger target radius.
            const minRadiusForBottom = 1.2; // 2.4px diameter (bottom)
            const minRadiusForTop = 4.5;    // 9.0px diameter (top)
            const targetR = minRadiusForBottom + (layerIndex / 4.0) * (minRadiusForTop - minRadiusForBottom);

            const shrinkProgress = w3 * m3AmpFactorVal;
            targetLocalCircleRadius = localCircleRadius * (1.0 - shrinkProgress) + targetR * shrinkProgress;
          }

          // Audio Frequency wave expansion (staggered delay ripple)
          // Smaller layerIndex means larger circle. layerIndex=4 is the smallest, which must react first (smallest delay).
          // Diameters: layerIndex 4 (smallest) uses leadDelay = 0 (first), layerIndex 0 (largest) uses leadDelay = 16 (last)
          const leadDelay = (4 - layerIndex) * 4;
          const followDelay = leadDelay + 5;

          // Audio frequency moves synchronously with each circle as it swaps coordinates
          const normHistory = intensityHistories[dotIndex];
          const leadVal = normHistory ? (normHistory[leadDelay] || 0.0) : 0.0;
          const followVal = normHistory ? (normHistory[followDelay] || 0.0) : 0.0;

          // Option A: Non-linear Peak Boost (hardcoded with exponent = 3.0, multiplier = 5.0)
          const exponent = 3.0;
          const multiplier = 5.0;
          const layerScale = currentMaxRadius / 50.0;

          const processedFollow = Math.pow(Math.max(0, followVal), exponent) * multiplier;
          const processedLead = Math.pow(Math.max(0, leadVal), exponent) * (multiplier * 0.4);

          const netFactorA = -processedLead + processedFollow;
          const expansion = netFactorA * 16.0 * layerScale;

          // Implement master manual volume scale scaling (volumeScaleRef.current) to expand/shrink all circles as requested!
          let finalRadius = Math.max(0.1, (targetLocalCircleRadius + expansion) * volumeScaleRef.current);

          // Mode 3: Under lateral oscillation, make circles smaller as they get closer to the left/right screen edges, approaching 10px diameter (5px radius)
          if (w3 > 0.01) {
            const halfCanvasW = canvas.width / 2;
            const distFromCenter = Math.abs(x - halfCanvasW);
            // Max possible excursion peak is about 100px from the screen boundaries
            const maxExcursionDist = Math.max(100, halfCanvasW - 100);
            const closeness = Math.min(1.0, distFromCenter / maxExcursionDist);
            
            // To approach exactly 10px diameter (5px radius) smoothly at max boundaries closeness
            const targetMode3Radius = 5.0;
            const ratioMult = targetMode3Radius / Math.max(0.1, finalRadius);
            const scaleFactor = (1.0 - closeness) * 1.0 + closeness * ratioMult;
            
            // Interpolate this scaling factor by the Mode 3 activity weight w3
            const blendedScale = (1.0 - w3) * 1.0 + w3 * scaleFactor;
            finalRadius = finalRadius * blendedScale;
          }

          // Mode 5: Shrink circle size proportionally to preserve extremely premium density details on the orbits and prevent clumping/pixelation
          if (w5 > 0.01) {
            const m5SizeScaleFactor = (1.0 - w5) * 1.0 + w5 * 0.38; // 62% smaller circle size for Mode 5
            finalRadius = finalRadius * m5SizeScaleFactor;
          }

          if (finalRadius <= 0.1) return;

          let bandAmp = 0.0;
          if (dotIndex < 30) {
            bandAmp = vocalsAmp;
          } else if (dotIndex < 70) {
            bandAmp = midAmp;
          } else {
            bandAmp = highStringsAmp;
          }
          const m4_amplitude_scale = 0.3 + bandAmp * 0.65;
          let m5_layerScale = 1.0;
          let m5_layerAlpha = 1.0;
          const dotState = mode5DotStatesRef.current[dotIndex];
          if (dotState) {
            if (dotState.state === 'appearing') {
              const normAppear = dotState.appearProgress;
              m5_layerAlpha = normAppear;
              m5_layerScale = 0.4 + 0.6 * normAppear;
            } else if (dotState.state === 'disappearing') {
              // "圆消逝时，同个圆心上各个大小的圆应该由内而外逐步扩散再收回圆心，最后消失。"
              // Innermost is layerIndex = 4, outermost is layerIndex = 0.
              const delay = (4 - layerIndex) * 0.09; // layer 4 delay is 0, layer 0 is 0.36
              const progress = dotState.disappearProgress;
              const localT = (progress - delay);
              
              if (localT <= 0.0) {
                m5_layerScale = 1.0;
                m5_layerAlpha = 1.0;
              } else {
                const actionDuration = 0.4;
                const normalizedT = localT / actionDuration;
                
                if (normalizedT < 1.0) {
                  const expansionFraction = 0.45;
                  if (normalizedT < expansionFraction) {
                    const tExp = normalizedT / expansionFraction;
                    const easeExp = Math.sin(tExp * Math.PI / 2);
                    m5_layerScale = 1.0 + easeExp * 1.5; // expand up to 2.5x base size
                    m5_layerAlpha = 1.0;
                  } else {
                    const tCon = (normalizedT - expansionFraction) / (1.0 - expansionFraction);
                    const easeCon = Math.cos(tCon * Math.PI / 2); // shrink back to 0
                    m5_layerScale = 2.5 * easeCon;
                    m5_layerAlpha = easeCon;
                  }
                } else {
                  m5_layerScale = 0.0;
                  m5_layerAlpha = 0.0;
                }
              }
            } else if (dotState.state === 'inactive') {
              m5_layerScale = 0.0;
              m5_layerAlpha = 0.0;
            }
          }

          const finalScale = 1.0 - (w3 + w4 + w5) + w3 + w4 * m4_scale * m4_amplitude_scale + w5 * m5_layerScale;

          let targetColorIdx = layerIndex;
          if (w4 > 0.01) {
            if (mode4DotLayerColorMapRef.current[dotIndex] && mode4DotLayerColorMapRef.current[dotIndex][layerIndex] !== undefined) {
              targetColorIdx = mode4DotLayerColorMapRef.current[dotIndex][layerIndex];
            }
          } else if (mode1DotLayerColorMapRef.current[dotIndex] && mode1DotLayerColorMapRef.current[dotIndex][layerIndex] !== undefined) {
            targetColorIdx = mode1DotLayerColorMapRef.current[dotIndex][layerIndex];
          }
          const drawCanvasBaseNormal = layerCanvasesRef.current[targetColorIdx] || cachedCanvas;
          const drawCanvasBaseM5 = layerCanvasesMode5Ref.current[targetColorIdx] || cachedCanvas;
          const drawCanvasBase = (w5 > 0.2) ? drawCanvasBaseM5 : drawCanvasBaseNormal;
          const originalMaxRadius = concentricLayers[targetColorIdx].maxRadius;

          let drawSize = 180.0 * (finalRadius / originalMaxRadius) * finalScale * 0.85;
          if (w4 > 0.01) {
            const m4LayerScaleFactor = 1.0 - (layerIndex * 0.18);
            const blendedM4Scale = (1.0 - w4) * 1.0 + w4 * m4LayerScaleFactor;
            drawSize = drawSize * blendedM4Scale;
          }
          let drawCanvas = drawCanvasBase;

          // Reverted Mode 4 single-circle override so that each random position draws a beautiful nested group of concentric/nested circles with different diameters and colors matching Mode 1/2's original aesthetic and layers

          // Use pre-smoothed running frequency intensity for Mode 5 to completely solve the flicker/rapid-flashing issues from an animation perspective!
          const m5_dot_smoothedHz = mode5DotSmoothedHzRef.current[dotIndex] !== undefined ? mode5DotSmoothedHzRef.current[dotIndex] : 0.0;

          // Reduce shimmer speed and swing amplitude to make it a very slow, premium breathing effect rather than a fast dazzle
          const m5_shimmer = 0.94 + 0.06 * Math.sin(time * 0.005 + dotIndex * 3.0);
          
          // Revert any artificial dimming to preserve original color, vibrancy & saturation as requested.
          // Using full-brightness dynamic mapping but with beautifully smoothed acoustics to be 100% eye-safe!
          const m5DynamicAlpha = Math.min(1.0, (0.05 + m5_dot_smoothedHz * 1.5) * m5_shimmer * m5_layerAlpha);
          
          // Mode 2 custom sound/tone-activated gating presence logic
          let mode2AlphaScale = 1.0;
          if (w2 > 0.01) {
            const audioIntensity = gridIntensities[dotIndex] !== undefined ? gridIntensities[dotIndex] : 0.0;
            const threshold = 0.04;
            let presence = 0.0;
            if (audioIntensity > threshold) {
              presence = Math.min(1.0, (audioIntensity - threshold) / (0.4 - threshold));
            }
            mode2AlphaScale = (1.0 - w2) * 1.0 + w2 * presence;
          }

          // Mode 3 -> Mode 4 staggered random batch transition alpha
          let transitionAlphaScale = 1.0;
          if (isM3ToM4Active) {
            const tTrans = (time - m3ToM4TransitionStartTimeRef.current!) / 1000.0;
            if (tTrans < 0.6) {
              transitionAlphaScale = 1.0 - (tTrans / 0.6);
            } else {
              const batchIdx = (dotIndex * 7 + 13) % 3;
              if (batchIdx === 0) {
                if (tTrans < 0.6) transitionAlphaScale = 0.0;
                else if (tTrans < 0.95) transitionAlphaScale = (tTrans - 0.6) / 0.35;
                else transitionAlphaScale = 1.0;
              } else if (batchIdx === 1) {
                if (tTrans < 0.8) transitionAlphaScale = 0.0;
                else if (tTrans < 1.15) transitionAlphaScale = (tTrans - 0.8) / 0.35;
                else transitionAlphaScale = 1.0;
              } else {
                if (tTrans < 1.0) transitionAlphaScale = 0.0;
                else if (tTrans < 1.35) transitionAlphaScale = (tTrans - 1.0) / 0.35;
                else transitionAlphaScale = 1.0;
              }
            }
          }

          // ---- MODE 6 Sizing & alpha adjustments ----
          let perspectiveFactor = 1.0;
          let m6_alpha = 1.0;
          if (w6 > 0.001) {
            const m6_y_offset = (by - frameCy) / m6_ry; // ranges from -1.0 to 1.0
            const m6_scale = 1.0 + 0.45 * m6_y_offset;
            perspectiveFactor = (1.0 - w6) * 1.0 + w6 * m6_scale;
            
            // Dim the circles slightly at the far back
            const targetAlpha = 0.725 + 0.275 * m6_y_offset;
            m6_alpha = (1.0 - w6) * 1.0 + w6 * targetAlpha;
          }

          drawSize = drawSize * perspectiveFactor;

          const solidAlpha = ((1.0 - w5) * 1.0 + w5 * m5DynamicAlpha) * mode2AlphaScale * transitionAlphaScale * m6_alpha;

          if (w6 > 0.001 && (layerIndex === 3 || layerIndex === 4)) {
            const jumps = mode6JumpStatesRef.current[dotIndex];
            const jumpSelf = jumps ? jumps[layerIndex] : null;

            const drawsToRender: { x_d: number; y_d: number; alpha_d: number; sizeScale: number }[] = [];

            // 1. If self is jumping, add its independent flight render
            if (jumpSelf && jumpSelf.isJumping) {
              const launchYOffset = (jumpSelf.startY - frameCy) / m6_ry;
              const launchM6Scale = 1.0 + 0.45 * launchYOffset;
              const launchM6Alpha = 0.725 + 0.275 * launchYOffset;

              const selfIntensity = mode6DotStatesRef.current[dotIndex] ? mode6DotStatesRef.current[dotIndex].intensity : 0.0;
              const targetAlphaM6 = Math.max(0.35, selfIntensity) * launchM6Alpha;

              drawsToRender.push({
                x_d: jumpSelf.startX,
                y_d: jumpSelf.startY - jumpSelf.floatYOffset,
                alpha_d: targetAlphaM6,
                sizeScale: launchM6Scale,
              });
            }

            // 2. If self is not jumping, does it reside here at home?
            if (jumpSelf && !jumpSelf.isJumping && jumpSelf.attachedDotIndex === dotIndex) {
              const selfIntensity = mode6DotStatesRef.current[dotIndex] ? mode6DotStatesRef.current[dotIndex].intensity : 0.0;
              const targetAlphaM6 = selfIntensity * m6_alpha;

              drawsToRender.push({
                x_d: x,
                y_d: y,
                alpha_d: targetAlphaM6,
                sizeScale: perspectiveFactor,
              });
            }

            // 3. Find any OTHER circles of this layer index that have landed and are currently attached to dotIndex
            for (let otherIdx = 0; otherIdx < 100; otherIdx++) {
              if (otherIdx === dotIndex) continue;
              const jumpOther = mode6JumpStatesRef.current[otherIdx]?.[layerIndex];
              if (jumpOther && !jumpOther.isJumping && jumpOther.attachedDotIndex === dotIndex) {
                const destIntensity = mode6DotStatesRef.current[dotIndex] ? mode6DotStatesRef.current[dotIndex].intensity : 0.0;
                const targetAlphaM6 = destIntensity * m6_alpha;

                drawsToRender.push({
                  x_d: x,
                  y_d: y,
                  alpha_d: targetAlphaM6,
                  sizeScale: perspectiveFactor,
                });
              }
            }

            // Blend and draw each gathered circle!
            drawsToRender.forEach((dItem) => {
              const finalSolidAlpha = (1.0 - w6) * solidAlpha + w6 * dItem.alpha_d;
              const finalDrawSize = drawSize * (dItem.sizeScale / perspectiveFactor);

              if (finalSolidAlpha > 0.01) {
                ctx.save();
                ctx.translate(dItem.x_d, dItem.y_d);
                ctx.globalAlpha = finalSolidAlpha;
                ctx.drawImage(
                  drawCanvas,
                  -finalDrawSize / 2,
                  -finalDrawSize / 2,
                  finalDrawSize,
                  finalDrawSize
                );
                ctx.restore();
              }
            });
          } else {
            // Normal rendering (non-Mode 6, or normal layers 0/1/2)
            const m6Intensity = mode6DotStatesRef.current[dotIndex] ? mode6DotStatesRef.current[dotIndex].intensity : 0.0;
            const m6Ripple = mode6DotStatesRef.current[dotIndex] ? mode6DotStatesRef.current[dotIndex].landingRippleScale : 0.0;
            const m6_alpha_final = m6_alpha * m6Intensity;
            
            const baseSolidAlpha = (1.0 - w6) * solidAlpha + w6 * m6_alpha_final;
            const baseDrawSize = drawSize * (1.0 + m6Ripple * 0.35);

            // Integrate Mode 7 visual presence and note audio synchronization
            const audioIntensity = gridIntensities[dotIndex] !== undefined ? gridIntensities[dotIndex] : 0.0;
            const m7_soundAlpha = Math.min(1.0, audioIntensity * 2.0);
            const finalSolidAlpha = (1.0 - w7) * baseSolidAlpha + w7 * m7_soundAlpha;

            let finalDrawSize = baseDrawSize;
            const m7State = mode7StatesRef.current[dotIndex];
            if (w7 > 0.01 && m7State) {
              const m7BaseRadius = m7State.radius * (concentricLayers[layerIndex].maxRadius / 50.0);
              const soundSizeFactor = 0.15 + 0.85 * Math.min(1.0, audioIntensity * 2.5);
              const m7FinalRadius = m7BaseRadius * soundSizeFactor;
              const m7DrawSize = m7FinalRadius * 3.6;
              finalDrawSize = (1.0 - w7) * baseDrawSize + w7 * m7DrawSize;
            }

            if (finalSolidAlpha > 0.01) {
              ctx.save();
              ctx.translate(x, y);
              ctx.globalAlpha = finalSolidAlpha;
              ctx.drawImage(
                drawCanvas,
                -finalDrawSize / 2,
                -finalDrawSize / 2,
                finalDrawSize,
                finalDrawSize
              );
              ctx.restore();
            }
          }
        });
      });

      // Lastly, draw the central pure white dot-matrix at the absolute top layer
      // Lastly, draw the central pure white dot-matrix at the absolute top layer
      ctx.fillStyle = '#ffffff';
      sortedDotIndices.forEach((dotIndex) => {
        const r = Math.floor(dotIndex / colsCount);
        const c = dotIndex % colsCount;
        
        let w1 = weight1Ref.current[4];
        let w2 = weight2Ref.current[4];
        let w3 = weight3Ref.current[4];
        let w4 = weight4Ref.current[4];
        let w5 = weight5Ref.current[4];
        let w6 = weight6Ref.current[4];
        let w7 = weight7Ref.current[4];

        if (isM3ToM4Active) {
          const tTrans = (time - m3ToM4TransitionStartTimeRef.current!) / 1000.0;
          w1 = 0.0;
          w2 = 0.0;
          w5 = 0.0;
          w6 = 0.0;
          w7 = 0.0;
          if (tTrans < 0.35) {
            w3 = 1.0;
            w4 = 0.0;
          } else {
            w3 = 0.0;
            w4 = 1.0;
          }
        }

        const trans = 1.0 - w1;

        const scramIndex = scrambleMapRef.current[dotIndex] ?? dotIndex;
        const scramR = Math.floor(scramIndex / colsCount);
        const scramC = scramIndex % colsCount;

        // Swap positions on original coordinate axes grid
        const bxOrig = startX + c * spacing;
        const byOrig = startY + r * spacing;

        // ---- RESTOREATIVE MODE 2 SCRAMBLED COORDINATES ----
        const bxScram = startX + scramC * spacing;
        const byScram = startY + scramR * spacing;

        // ---- NEW MODE 3 PERSPECTIVE DEPTH + DIAGONAL SWEEP (layerIndex = 5) ----
        const m3SpacingX = 50; // Align exactly with topmost concentric circle (layerIndex = 4) and Mode 2 positioning (50px)
        const m3SpacingY = 50; // Align exactly with topmost concentric circle (layerIndex = 4) and Mode 2 positioning (50px)
        const m3GridWidthL = (colsCount - 1) * m3SpacingX;
        const m3GridHeightL = (rowsCount - 1) * m3SpacingY;
        const m3StartXL = frameCx - m3GridWidthL / 2;
        const m3StartYL = frameCy - m3GridHeightL / 2;
        const m3bxCentered = m3StartXL + scramC * m3SpacingX;
        const m3byCentered = m3StartYL + scramR * m3SpacingY;

        // Calculate dynamic amplitude matching concentric circles outermost peak constraint
        const halfW = canvas.width / 2;
        const m3LayerAmp = Math.max(20.0, halfW - m3GridWidthL / 2 - 100);

        const m3Time = isM3ToM4Active ? m3ToM4TransitionStartTimeRef.current! : time;
        const m3Elapsed = isM3ToM4Active 
          ? (m3ToM4TransitionStartTimeRef.current! - (mode3StartTimeRef.current ?? m3ToM4TransitionStartTimeRef.current!)) / 1000.0 
          : m3_elapsed;

        const m3Theta = (2.0 * Math.PI * (m3Time / 1000.0)) / 14.0;
        const swingX = Math.sin(m3Theta);
        // Smooth, positive-only interpolation from 0.0 to 1.0 on transition to prevent sudden jerking or visual shrinkage
        const swingEase = Math.pow(Math.min(1.0, m3Elapsed / 2.5), 1.5);

        const bxTarget = m3bxCentered + swingX * m3LayerAmp * swingEase;
        const byTarget = m3byCentered;

        let m3_bx = bxTarget;
        let m3_by = byTarget;

        if (m3Elapsed < 1.5) {
          // Direct natural seamless dispersion from Mode 2 scrambled position
          const progress = Math.min(1.0, m3Elapsed / 1.5);
          const easeOut = 1.0 - Math.pow(1.0 - progress, 3.0);
          m3_bx = bxScram * (1.0 - easeOut) + bxTarget * easeOut;
          m3_by = byScram * (1.0 - easeOut) + byTarget * easeOut;
        }

        // baseline coordinates used as reference for staggered transitions in Mode 4
        const bxReg = frameCx + (c - 4.5) * 100;
        const byReg = frameCy + (r - 4.5) * 70;

        // ---- MODE 4: Staggered Random Jumps ----
        const period_i = 4.0 + (dotIndex % 5) * 0.5; // cycle duration between 4.0s and 6.0s
        const pTime = mode4AccumTimeRef.current[dotIndex];
        const cycleIdx = Math.floor(pTime / period_i);
        const localCycleTime = pTime % period_i;

        let prevX = bxReg;
        let prevY = byReg;
        if (cycleIdx > 0) {
          const prevPos = getPseudorandomPos(dotIndex, cycleIdx - 1, canvas.width, canvas.height);
          prevX = prevPos.x;
          prevY = prevPos.y;
        }

        const currPos = getPseudorandomPos(dotIndex, cycleIdx, canvas.width, canvas.height);
        const currX = currPos.x;
        const currY = currPos.y;

        let m4_bx = currX;
        let m4_by = currY;
        let m4_scale = 1.0;

        const T_peak = 0.9 + 0.75 * (period_i - 0.9);
        const totalDuration = (period_i + 0.4) - T_peak;

        if (localCycleTime < 0.4) {
          m4_bx = prevX;
          m4_by = prevY;
          const timeSincePeak = (period_i - T_peak) + localCycleTime;
          const p = Math.max(0.0, Math.min(1.0, timeSincePeak / totalDuration));
          // Seamlessly contract/fade out to 0.0 with cosine ease from 1.0 peak
          const ease = 0.5 + 0.5 * Math.cos(p * Math.PI);
          m4_scale = ease;
        } else if (localCycleTime < 0.9) {
          m4_bx = currX;
          m4_by = currY;
          const progress = (localCycleTime - 0.4) / 0.5;
          // Rapid peak expansion to 1.0 with sine ease
          m4_scale = Math.sin(progress * Math.PI / 2);
        } else {
          m4_bx = currX;
          m4_by = currY;
          const t2 = (localCycleTime - 0.9) / (period_i - 0.9);
          if (t2 < 0.75) {
            m4_scale = 1.0; // Keep fully expanded
          } else {
            // Smooth final contraction matching the crossover phase
            const timeSincePeak = localCycleTime - T_peak;
            const p = Math.max(0.0, Math.min(1.0, timeSincePeak / totalDuration));
            const ease = 0.5 + 0.5 * Math.cos(p * Math.PI);
            m4_scale = ease;
          }
        }

        // ---- MODE 5: Concentric Ring Orbit for White Dots ----
        const m5_orbitIdx = getMode5OrbitAndIndex(dotIndex).orbit;
        const m5_orbitRef = MODE5_ORBITS[m5_orbitIdx];
        const m5_angleVal = mode5DotAnglesRef.current[dotIndex] !== undefined ? mode5DotAnglesRef.current[dotIndex] : 0.0;
        const m5_cx = frameCx + m5_orbitRef.cxOffset;
        const m5_cy = frameCy + m5_orbitRef.cyOffset;
        const m5_bx = m5_cx + Math.cos(m5_angleVal) * m5_orbitRef.rx;
        const m5_by = m5_cy + Math.sin(m5_angleVal) * m5_orbitRef.ry;

        // ---- MODE 6: Ellipse Orbit Clockwise ----
        const m6_rx = Math.max(100, canvas.width * 0.38);
        const m6_ry = Math.max(40, canvas.height * 0.18);
        const m6_baseAngle = (dotIndex * 2.0 * Math.PI) / 100.0;
        const m6_orbitSpeed = 0.00035;
        const m6_angle = m6_baseAngle + (time * m6_orbitSpeed);
        const m6_bx = frameCx + Math.cos(m6_angle) * m6_rx;
        const m6_by = frameCy + Math.sin(m6_angle) * m6_ry;

        let bx = w1 * bxOrig + w2 * bxScram + w3 * m3_bx + w4 * m4_bx + w5 * m5_bx + w6 * m6_bx;
        let by = w1 * byOrig + w2 * byScram + w3 * m3_by + w4 * m4_by + w5 * m5_by + w6 * m6_by;

        // Tornado-like vortex spiral attraction transition between Mode 4 and Mode 5 ("轨道会像龙卷风一样吸引周边的圆")
        if (w4 > 0.01 && w5 > 0.01) {
          const sumW = w4 + w5;
          const tTransition = w5 / sumW; // 0 -> 1 as we move from Mode 4 to Mode 5
          
          const currentCx = frameCx + m5_orbitRef.cxOffset * tTransition;
          const currentCy = frameCy + m5_orbitRef.cyOffset * tTransition;
          
          const dxCenter = bx - currentCx;
          const dyCenter = by - currentCy;
          const distToCenter = Math.hypot(dxCenter, dyCenter);
          
          if (distToCenter > 1.0) {
            const ratio = tTransition * (1.0 - tTransition); // peaks at 0.25 midway
            const contractionStrength = ratio * 1.55; 
            const targetDist = distToCenter * (1.0 - contractionStrength);
            
            // Spiral/tornado vortex angular twist that decays to 0 as we settle into Mode 5 orbits
            const twistIntensity = (1.0 - tTransition) * 3.6 * (1.0 + (dotIndex % 3) * 0.25);
            const currentAng = Math.atan2(dyCenter, dxCenter);
            const swirledAng = currentAng + twistIntensity;
            
            bx = currentCx + Math.cos(swirledAng) * targetDist;
            by = currentCy + Math.sin(swirledAng) * targetDist;
          }
        }

        // Elastic distortion formula
        const dx = targetPx - bx;
        const dy = targetPy - by;
        const dist = Math.hypot(dx, dy);

        let x = bx;
        let y = by;

        if (dist < pullRadius) {
          const gravityStrength = 0.85 * w1;
          if (gravityStrength > 0.01) {
            const factor = Math.pow(1.0 - dist / pullRadius, 1.8) * gravityStrength;
            x += dx * factor;
            y += dy * factor;
          }
        }

        // Scale center white dots with volume for consistency, restoring original Mode 4 changes
        let bandAmp = 0.0;
        if (dotIndex < 30) {
          bandAmp = vocalsAmp;
        } else if (dotIndex < 70) {
          bandAmp = midAmp;
        } else {
          bandAmp = highStringsAmp;
        }
        const m4_amplitude_scale = 0.3 + bandAmp * 0.65;
        let m5_dotScale = 1.0;
        let m5_dotAlpha = 1.0;
        const dotState = mode5DotStatesRef.current[dotIndex];
        if (dotState) {
          if (dotState.state === 'appearing') {
            m5_dotAlpha = dotState.appearProgress;
            m5_dotScale = dotState.appearProgress;
          } else if (dotState.state === 'disappearing') {
            m5_dotScale = Math.max(0.0, 1.0 - dotState.disappearProgress);
            m5_dotAlpha = Math.max(0.0, 1.0 - dotState.disappearProgress);
          } else if (dotState.state === 'inactive') {
            m5_dotScale = 0.0;
            m5_dotAlpha = 0.0;
          }
        }

        const finalScale = 1.0 - (w3 + w4 + w5) + w3 + w4 * m4_scale * m4_amplitude_scale + w5 * m5_dotScale;

        // ---- MODE 6 Sizing & alpha adjustments ----
        let perspectiveFactor = 1.0;
        let m6_alpha = 1.0;
        if (w6 > 0.001) {
          const m6_y_offset = (by - frameCy) / m6_ry; // ranges from -1.0 to 1.0
          const m6_scale = 1.0 + 0.45 * m6_y_offset;
          perspectiveFactor = (1.0 - w6) * 1.0 + w6 * m6_scale;
          
          const targetAlpha = 0.725 + 0.275 * m6_y_offset;
          m6_alpha = (1.0 - w6) * 1.0 + w6 * targetAlpha;
        }

        const whiteDotRadius = 2.0 * volumeScaleRef.current * finalScale * perspectiveFactor;

        if (whiteDotRadius > 0.1) {
          // Use pre-smoothed running frequency intensity for Mode 5 to completely solve the flicker/rapid-flashing issues from an animation perspective!
          const m5_dot_smoothedHz = mode5DotSmoothedHzRef.current[dotIndex] !== undefined ? mode5DotSmoothedHzRef.current[dotIndex] : 0.0;

          // Reduce shimmer speed and swing amplitude to make it a very slow, premium breathing effect rather than a fast dazzle
          const m5_shimmer = 0.94 + 0.06 * Math.sin(time * 0.005 + dotIndex * 3.0);
          
          // Revert any artificial dimming to preserve original color, vibrancy & saturation as requested.
          // Using full-brightness dynamic mapping but with beautifully smoothed acoustics to be 100% eye-safe!
          const m5DynamicAlpha = Math.min(1.0, (0.05 + m5_dot_smoothedHz * 1.5) * m5_shimmer * m5_dotAlpha);
          
          // Mode 2 custom sound/tone-activated gating presence logic
          let mode2AlphaScale = 1.0;
          if (w2 > 0.01) {
            const audioIntensity = gridIntensities[dotIndex] !== undefined ? gridIntensities[dotIndex] : 0.0;
            const threshold = 0.04;
            let presence = 0.0;
            if (audioIntensity > threshold) {
              presence = Math.min(1.0, (audioIntensity - threshold) / (0.4 - threshold));
            }
            mode2AlphaScale = (1.0 - w2) * 1.0 + w2 * presence;
          }

          // Mode 3 -> Mode 4 staggered random batch transition alpha
          let transitionAlphaScale = 1.0;
          if (isM3ToM4Active) {
            const tTrans = (time - m3ToM4TransitionStartTimeRef.current!) / 1000.0;
            if (tTrans < 0.6) {
              transitionAlphaScale = 1.0 - (tTrans / 0.6);
            } else {
              const batchIdx = (dotIndex * 7 + 13) % 3;
              if (batchIdx === 0) {
                if (tTrans < 0.6) transitionAlphaScale = 0.0;
                else if (tTrans < 0.95) transitionAlphaScale = (tTrans - 0.6) / 0.35;
                else transitionAlphaScale = 1.0;
              } else if (batchIdx === 1) {
                if (tTrans < 0.8) transitionAlphaScale = 0.0;
                else if (tTrans < 1.15) transitionAlphaScale = (tTrans - 0.8) / 0.35;
                else transitionAlphaScale = 1.0;
              } else {
                if (tTrans < 1.0) transitionAlphaScale = 0.0;
                else if (tTrans < 1.35) transitionAlphaScale = (tTrans - 1.0) / 0.35;
                else transitionAlphaScale = 1.0;
              }
            }
          }

          ctx.save();
          const baseWhiteDotAlpha = ((1.0 - w5) * 1.0 + w5 * m5DynamicAlpha) * mode2AlphaScale * transitionAlphaScale * m6_alpha;
          
          const audioIntensity = gridIntensities[dotIndex] !== undefined ? gridIntensities[dotIndex] : 0.0;
          const m7_soundAlpha = Math.min(1.0, audioIntensity * 2.0);
          const whiteDotAlpha = (1.0 - w7) * baseWhiteDotAlpha + w7 * m7_soundAlpha;

          ctx.fillStyle = `rgba(255, 255, 255, ${whiteDotAlpha.toFixed(3)})`;

          ctx.beginPath();
          ctx.arc(x, y, whiteDotRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Render expanding thin white bordered circle in Mode 5 while dotState.state === 'disappearing'
        if (w5 > 0.01 && dotState && dotState.state === 'disappearing') {
          const p = dotState.disappearProgress;
          // The expanding circle's max radius is scaled down to match the new beautiful compact circle sizing
          const maxRadius = 60.0 * 0.3;
          const expandingRadius = p * maxRadius;
          const alpha = 1.0 - p;
          
          if (alpha > 0.01 && expandingRadius > 0.1) {
            ctx.save();
            ctx.strokeStyle = `rgba(255, 255, 255, ${(alpha * w5).toFixed(3)})`;
            ctx.lineWidth = 0.8; // extremely thin (极细框)
            ctx.beginPath();
            ctx.arc(x, y, expandingRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }

        // Draw the solid white radioactive fireworks rays surrounding coordinates (ONLY in Mode 4!)
        const firework = dotFireworksRef.current[dotIndex];
        if (w4 > 0.05 && firework) {
          const age = time - firework.spawnTime;
          if (age < firework.duration) {
            const p = age / firework.duration;

            // Sparks fly outwards from center and gradually fade/dissipate over time
            const innerRadius = p * 60.0 * finalScale;
            const baseDeltaRadius = 15.0;
            const raysCount = firework.raysCount;
            const raysInfo = firework.rays || [];

            ctx.save();
            ctx.lineCap = 'round';

            for (let ray = 0; ray < raysCount; ray++) {
              const rayMeta = raysInfo[ray] || { opacity: 1.0, lengthMult: 1.0 };
              const rayAlpha = rayMeta.opacity * Math.max(0.0, 1.0 - p);
              const rayLen = baseDeltaRadius * rayMeta.lengthMult * (1.1 - p * 0.4);
              const outerRadius = innerRadius + rayLen;

              ctx.strokeStyle = `rgba(255, 255, 255, ${rayAlpha.toFixed(2)})`;
              ctx.lineWidth = 1.4 * (1.0 - p * 0.5); // stays sharp, thinning over progress
              const angle = (2.0 * Math.PI * ray) / raysCount;
              const startX = x + Math.cos(angle) * innerRadius;
              const startY = y + Math.sin(angle) * innerRadius;
              const endX = x + Math.cos(angle) * outerRadius;
              const endY = y + Math.sin(angle) * outerRadius;

              ctx.beginPath();
              ctx.moveTo(startX, startY);
              ctx.lineTo(endX, endY);
              ctx.stroke();
            }
            ctx.restore();
          } else {
            dotFireworksRef.current[dotIndex] = null as any;
          }
        }
      });

      // ---- DRAW MODE 5 ORBIT ELLIPSES DIRECTLY ON CANVAS ----
      const w5_active = weight5Ref.current[4];
      if (w5_active > 0.01) {
        ctx.save();
        ctx.globalAlpha = w5_active * 0.20; // smooth fading in/out timed with transition!
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.0;
        MODE5_ORBITS.forEach(orbit => {
          ctx.beginPath();
          const orbitCx = frameCx + orbit.cxOffset;
          const orbitCy = frameCy + orbit.cyOffset;
          ctx.ellipse(orbitCx, orbitCy, orbit.rx, orbit.ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.restore();
      }

      // Tracking metrics frame rate calculator
      frameCount++;
      fpsTimer += delta;
      lastTime = now;

      if (fpsTimer >= 1000) {
        setMetrics(prev => ({
          ...prev,
          fps: Math.round((frameCount * 1000) / fpsTimer),
          trackingActive: isTracking
        }));
        frameCount = 0;
        fpsTimer = 0;
      }

      requestId = requestAnimationFrame(render);
    };

    requestId = requestAnimationFrame(render);

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(requestId);
    };
  }, [rawLandmarks]);

  // Pointer drag event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isMouseDownRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, time: performance.now() };
    updatePointerCoords(e);

    // Trigger delightful radioactive firework spark bursts on and around clicked grid coordinates (ONLY in Mode 4!)
    const canvas = glCanvasRef.current;
    if (visualModeRef.current === 'random' && canvas) {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const spacingVal = 50;
      const startXVal = canvas.width / 2 - (cols * spacingVal) / 2;
      const startYVal = canvas.height / 2 - (rows * spacingVal) / 2;
      const cellC = Math.max(0, Math.min(cols - 1, Math.round((clickX - startXVal) / spacingVal)));
      const cellR = Math.max(0, Math.min(rows - 1, Math.round((clickY - startYVal) / spacingVal)));
      const centerIdx = cellR * cols + cellC;

      // Splash fireworks from the clicked coordinate center dot and its immediate neighbors
      const burstIndices = [
        centerIdx,
        centerIdx - 1,
        centerIdx + 1,
        centerIdx - cols,
        centerIdx + cols
      ].filter(idx => idx >= 0 && idx < 100);

      const currentTime = performance.now();
      const opacities = [0.25, 0.5, 0.75, 1.0];
      const lengths = [0.4, 0.75, 1.1, 1.4];

      burstIndices.forEach(dotIdx => {
        const raysCount = 8 + Math.floor(Math.random() * 5); // 8 to 12 rays
        const rays = Array.from({ length: raysCount }, () => ({
          opacity: opacities[Math.floor(Math.random() * 4)],
          lengthMult: lengths[Math.floor(Math.random() * 4)]
        }));

        dotFireworksRef.current[dotIdx] = {
          spawnTime: currentTime,
          duration: 350 + Math.random() * 200, // 0.35s to 0.55s for crisper results!
          raysCount,
          rays
        };
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isMouseDownRef.current) {
      updatePointerCoords(e);
    }
  };

  const handlePointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    isMouseDownRef.current = false;
    if (!e) return;

    // Fallback mouse click debugger to toggle visual modes
    const duration = performance.now() - dragStartRef.current.time;
    const distance = Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y);
    if (duration < 280 && distance < 10) {
      let nextMode: 'concentric' | 'scattered' | 'dispersed' | 'random' | 'hyperbolic' | 'orbit' | 'lines' = 'concentric';
      if (visualModeRef.current === 'concentric') {
        nextMode = 'scattered';
      } else if (visualModeRef.current === 'scattered') {
        nextMode = 'dispersed';
      } else if (visualModeRef.current === 'dispersed') {
        nextMode = 'random';
      } else if (visualModeRef.current === 'random') {
        nextMode = 'hyperbolic';
      } else if (visualModeRef.current === 'hyperbolic') {
        nextMode = 'orbit';
      } else if (visualModeRef.current === 'orbit') {
        nextMode = 'concentric';
      } else if (visualModeRef.current === 'lines') {
        nextMode = 'concentric';
      } else {
        nextMode = 'concentric';
      }
      visualModeRef.current = nextMode;
      setVisualMode(nextMode);
    }
  };

  const updatePointerCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = glCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    distortCenterTarget.current = { x, y };
  };

  // Webcam capture stream handlers
  const toggleCamera = () => {
    if (isCameraActive) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const startCamera = async () => {
    if (!window.Hands || !window.Camera) {
      alert('MediaPipe script sources are loading...');
      return;
    }

    try {
      if (!handsTrackerRef.current) {
        const hands = new window.Hands({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          }
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.55,
          minTrackingConfidence: 0.55
        });

        hands.onResults(handleTrackingResults);
        handsTrackerRef.current = hands;
      }

      if (videoRef.current) {
        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (isWebcamActiveRef.current && handsTrackerRef.current && videoRef.current) {
              await handsTrackerRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480
        });

        cameraTrackerRef.current = camera;
        isWebcamActiveRef.current = true;
        await camera.start();
        setIsCameraActive(true);
      }
    } catch (err: any) {
      console.error('Camera stream access failed:', err);
      alert('Camera access denied or webcam device busy.');
      setIsCameraActive(false);
      isWebcamActiveRef.current = false;
    }
  };

  const stopCamera = () => {
    isWebcamActiveRef.current = false;
    if (cameraTrackerRef.current) {
      cameraTrackerRef.current.stop();
    }
    setIsCameraActive(false);
    setRawLandmarks([]);
  };

  useEffect(() => {
    return () => {
      isWebcamActiveRef.current = false;
      if (cameraTrackerRef.current) {
        cameraTrackerRef.current.stop();
      }
      stopActiveAudioSource();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(err => console.error('Error closing AudioContext:', err));
      }
    };
  }, []);

  // Compute hand joint loops for tracking
  const handleTrackingResults = (results: any) => {
    if (!results || !results.multiHandLandmarks) {
      setRawLandmarks([]);
      return;
    }

    const landmarksList = results.multiHandLandmarks;
    const handednessList = results.multiHandedness;
    setRawLandmarks(landmarksList);

    if (landmarksList.length === 0) return;

    let leftHandLM: any = null;
    let rightHandLM: any = null;

    for (let c = 0; c < landmarksList.length; c++) {
      const landmarks = landmarksList[c];
      const info = handednessList[c];
      const isLeft = info.label === 'Right'; // Mirror correction
      if (isLeft) {
        leftHandLM = landmarks;
      } else {
        rightHandLM = landmarks;
      }
    }

    if (landmarksList.length === 1 && !leftHandLM && !rightHandLM) {
      const singleHand = landmarksList[0];
      const label = handednessList[0].label;
      if (label === 'Right') {
        leftHandLM = singleHand;
      } else {
        rightHandLM = singleHand;
      }
    }

    const testFistState = (lm: any) => {
      if (!lm) return false;
      const wrist = lm[0];
      const tips = [lm[8], lm[12], lm[16], lm[20]];
      const bases = [lm[5], lm[9], lm[13], lm[17]];
      
      let flexCount = 0;
      for (let i = 0; i < 4; i++) {
        const dTip = Math.hypot(tips[i].x - wrist.x, tips[i].y - wrist.y);
        const dBase = Math.hypot(bases[i].x - wrist.x, bases[i].y - wrist.y);
        if (dTip < dBase * 1.15) {
          flexCount++;
        }
      }
      return flexCount >= 3;
    };

    const dFistL = testFistState(leftHandLM);
    const dFistR = testFistState(rightHandLM);

    // Double Fist triggers Spring Damped resets
    if (dFistL && dFistR) {
      handleResetGrid();
      distortCenterTarget.current = { x: 0.5, y: 0.5 };
      circleRadiusRef.current = 50.0;
      setMetrics(prev => ({
        ...prev,
        leftDistance: 0.15,
        rightDistance: 0.15,
        isFistLeft: true,
        isFistRight: true,
        circleRadius: 50.0
      }));
      return;
    }

    // Left Hand L1 Pinch controls both the circle radius [0, 50] and the audio volume scale [0, 1]
    let dL1Fraction = 0.15;
    let targetRadius = circleRadiusRef.current;
    if (leftHandLM) {
      const thumbTip = leftHandLM[4];
      const indexTip = leftHandLM[8];
      const distL1 = Math.hypot(
        thumbTip.x - indexTip.x,
        thumbTip.y - indexTip.y,
        thumbTip.z - indexTip.z || 0.0
      );
      dL1Fraction = distL1;

      // Normal ranges of L1 pinch distance in MediaPipe:
      // Minimum thumb-to-index distance: ~0.02
      // Maximum thumb-to-index distance: ~0.28
      // Map [0.02, 0.28] to circular radius [0.0, 50.0] and volume [0.0, 1.0]
      const minPinch = 0.02;
      const maxPinch = 0.28;
      const t = (distL1 - minPinch) / (maxPinch - minPinch);
      const clampedT = Math.max(0, Math.min(1, t));
      targetRadius = clampedT * 50.0;
      circleRadiusRef.current = targetRadius;

      // Control volume scale with left hand pinch (smoothed with low-pass filter to reduce sensitivity/jitter)
      const currentVol = volumeScaleRef.current;
      const smoothedVol = currentVol + (clampedT - currentVol) * 0.12; // smooth damping factor
      if (Math.abs(smoothedVol - volumeScale) > 0.004) {
        setVolumeScale(smoothedVol);
      } else {
        volumeScaleRef.current = smoothedVol;
        if (gainNodeRef.current && audioCtxRef.current) {
          gainNodeRef.current.gain.setValueAtTime(smoothedVol, audioCtxRef.current.currentTime);
        }
      }

      // --- Left Hand L1 Angle Tracking to Trigger Fireworks ---
      const dxL = indexTip.x - thumbTip.x;
      const dyL = indexTip.y - thumbTip.y;
      const angleL = Math.atan2(dyL, dxL);
      let angleDegL = (angleL * 180.0) / Math.PI;
      if (angleDegL < 0) angleDegL += 360.0;

      const currentTime = performance.now();

      // Initialize base angle if null
      if (leftHandBaselineAngleRef.current === null) {
        leftHandBaselineAngleRef.current = angleDegL;
        leftHandAngleChangeStreakRef.current = 0;
      }

      // Shortest angular difference
      let diffL = angleDegL - leftHandBaselineAngleRef.current;
      while (diffL < -180) diffL += 360;
      while (diffL > 180) diffL -= 360;

      // If angle changes by 20 degrees, register one change streak (ONLY in Mode 4!)
      if (visualModeRef.current === 'random' && Math.abs(diffL) >= 20.0) {
        leftHandBaselineAngleRef.current = angleDegL;
        leftHandAngleChangeStreakRef.current += 1;

        // Every two 20-degree variations triggers random fireworks
        if (leftHandAngleChangeStreakRef.current >= 2) {
          leftHandAngleChangeStreakRef.current = 0;

          // Target random number of unique grid dots (e.g., 8 to 22 dots)
          const numFireworks = 8 + Math.floor(Math.random() * 15);
          const indices = Array.from({ length: 100 }, (_, i) => i);
          for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = indices[i];
            indices[i] = indices[j];
            indices[j] = temp;
          }

          const opacities = [0.25, 0.5, 0.75, 1.0];
          const lengths = [0.4, 0.75, 1.1, 1.4];

          const chosenIndices = indices.slice(0, numFireworks);
          chosenIndices.forEach(dotIdx => {
            const raysCount = 8 + Math.floor(Math.random() * 5); // 8 to 12 radiating white lines
            const rays = Array.from({ length: raysCount }, () => ({
              opacity: opacities[Math.floor(Math.random() * 4)],
              lengthMult: lengths[Math.floor(Math.random() * 4)]
            }));

            dotFireworksRef.current[dotIdx] = {
              spawnTime: currentTime,
              duration: 400 + Math.random() * 250, // 0.4s to 0.65s for crisper results!
              raysCount,
              rays
            };
          });
        }
      }
    }

    // Right Hand L2 Pinch pulls the grid intersections
    let dL2Fraction = 0.15;
    if (rightHandLM) {
      const thumbTip = rightHandLM[4];
      const indexTip = rightHandLM[8];
      const distL2 = Math.hypot(
        thumbTip.x - indexTip.x,
        thumbTip.y - indexTip.y,
        thumbTip.z - indexTip.z || 0.0
      );
      dL2Fraction = distL2;

      distortCenterTarget.current = {
        x: 1.0 - indexTip.x,
        y: indexTip.y
      };

      // Right Hand L2 Rotation angle tracking
      const dx = indexTip.x - thumbTip.x;
      const dy = indexTip.y - thumbTip.y;
      const angle = Math.atan2(dy, dx);
      let angleDeg = (angle * 180.0) / Math.PI;
      if (angleDeg < 0) angleDeg += 360.0;

      const currentTime = performance.now();

      // If hand was not tracked previously or was lost for over 1.5 seconds, reset rotation metrics
      if (currentTime - lastRightHandTimeRef.current > 1500 || rightHandBaselineAngleRef.current === null) {
        rightHandBaselineAngleRef.current = angleDeg;
        rightHandAngleChangeStreakRef.current = 0;
        rightHandRotationDirectionRef.current = 0;
      }
      lastRightHandTimeRef.current = currentTime;

      // Calculate shortest angular difference between current angle and baseline angle
      let diff = angleDeg - rightHandBaselineAngleRef.current;
      while (diff < -180) diff += 360;
      while (diff > 180) diff -= 360;

      // Check if angle has rotated beyond 20 degrees threshold
      if (Math.abs(diff) >= 20.0) {
        // Ensure rotation respects a 400ms debounce
        if (currentTime - rightHandLastTriggerTimeRef.current > 400) {
          if (rightHandAngleChangeStreakRef.current === 0) {
            // First 20 degree shift (half of the full swing)
            rightHandAngleChangeStreakRef.current = 1;
            rightHandBaselineAngleRef.current = angleDeg;
            rightHandLastTriggerTimeRef.current = currentTime;
          } else if (rightHandAngleChangeStreakRef.current === 1) {
            // Second consecutive shift (completing the full swing!)
            // Always rotate mode forward sequentially: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 1
            const modeSequence: ('concentric' | 'scattered' | 'dispersed' | 'random' | 'hyperbolic' | 'orbit')[] = [
              'concentric',
              'scattered',
              'dispersed',
              'random',
              'hyperbolic',
              'orbit',
            ];
            const currentIndex = modeSequence.indexOf(visualModeRef.current);
            const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % modeSequence.length;
            const nextMode = modeSequence[nextIndex];
            
            visualModeRef.current = nextMode;
            setVisualMode(nextMode);

            // Reset streak metrics after successful toggle
            rightHandAngleChangeStreakRef.current = 0;
            rightHandBaselineAngleRef.current = angleDeg;
            rightHandLastTriggerTimeRef.current = currentTime;
          }
        }
      } else {
        // If they stay still for more than 1.5 seconds, set a new baseline
        if (currentTime - rightHandLastTriggerTimeRef.current > 1500) {
          rightHandBaselineAngleRef.current = angleDeg;
          rightHandAngleChangeStreakRef.current = 0;
          rightHandRotationDirectionRef.current = 0;
        }
      }
    }

    setMetrics(prev => ({
      ...prev,
      leftDistance: dL1Fraction,
      rightDistance: dL2Fraction,
      isFistLeft: dFistL,
      isFistRight: dFistR,
      circleRadius: targetRadius,
      volumeScale: volumeScaleRef.current
    }));
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a0a0c]" id="app-root">
      {/* Invisible video playback capture */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        id="camera-element"
        style={{ display: 'none' }}
      />

      {/* WebGL2 Main Elastic Graphics Screen with Pointer Actions */}
      <canvas
        ref={glCanvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="absolute inset-0 w-full h-full block z-10 cursor-grab active:cursor-grabbing touch-none"
        id="fluid-glass-canvas"
      />

      {/* Five Static Styled Vector Ellipses Overlay for Mode 5 */}
      <Mode5Ellipses isActive={visualMode === 'hyperbolic'} />

      {/* Wireframe Skeleton graphics overlay */}
      <HandOverlay
        landmarksList={rawLandmarks}
        mode={skeletonMode}
        isActive={isCameraActive}
      />

      {/* Streamlined system Glass Controller Panel */}
      <ControlPanel
        skeletonMode={skeletonMode}
        onSkeletonModeChange={setSkeletonMode}
        isCameraActive={isCameraActive}
        onToggleCamera={toggleCamera}
        trackingMetrics={metrics}
        cols={cols}
        rows={rows}
        onTriggerGrowth={handleTriggerGrowth}
        onResetGrid={handleResetGrid}
        onImageChange={handleImageChange}
        hasImage={!!uploadedImage}
        circleColors={circleColors}
        onCircleColorsChange={setCircleColors}
        audioFileName={audioFileName}
        activeAudioSource={activeAudioSource}
        onSelectAudioSource={handleSelectAudioSource}
        isAudioPlaying={isAudioPlaying}
        onToggleAudioPlayback={handleToggleAudioPlayback}
        volumeScale={volumeScale}
        onVolumeScaleChange={setVolumeScale}
        onAudioUpload={handleAudioUpload}
        visualMode={visualMode}
        onVisualModeChange={(mode) => {
          visualModeRef.current = mode;
          setVisualMode(mode);
        }}
        mode2Settings={mode2Settings}
        onMode2SettingsChange={setMode2Settings}
        mode3Spacings={mode3Spacings}
        onMode3SpacingsChange={setMode3Spacings}
        mode5Settings={mode5Settings}
        onMode5SettingsChange={setMode5Settings}
      />

      {/* Audio Error Glass Notification Dialog Overlay */}
      {audioError && (
        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-md flex items-center justify-center z-[200] p-4 text-center">
          <div className="bg-zinc-950/90 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl relative text-left backdrop-blur-xl animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setAudioError(null)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer p-1 rounded-lg hover:bg-white/5"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex items-center space-x-3 mb-4 text-indigo-400">
              <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="font-sans font-bold text-sm tracking-wide text-zinc-100 uppercase">
                {audioError.title}
              </h3>
            </div>

            <div className="text-zinc-300 font-sans text-xs leading-relaxed space-y-3 mb-6 whitespace-pre-wrap">
              {audioError.message}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              {audioError.isSandbox && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/15 cursor-pointer transition-all flex items-center justify-center space-x-2"
                >
                  <span>在新标签页独立打开本应用</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
              <button
                onClick={() => setAudioError(null)}
                className={`py-2.5 px-4 rounded-xl text-center text-xs font-semibold cursor-pointer transition-all ${
                  audioError.isSandbox 
                    ? 'bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-white/5 sm:w-auto w-full' 
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-bold flex-1'
                }`}
              >
                {audioError.isSandbox ? '留在预览页' : '我知道了'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Splash overlay spinner whilst scripts are fetching */}
      {!isMediaPipeReady && (
        <div className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center z-[100] text-center px-4">
          <div className="space-y-4 max-w-sm">
            <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
            <h2 className="font-sans font-bold text-sm tracking-widest uppercase text-zinc-100">
              Engaging Shader Core
            </h2>
            <p className="text-zinc-500 font-mono text-[10px] leading-normal uppercase">
              Initializing WebGL vertices & MediaPipe kernels...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
