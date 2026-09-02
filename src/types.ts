/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

declare global {
  interface Window {
    Hands: any;
    Camera: any;
  }
}

export interface PresetTheme {
  id: string;
  name: string;
  colors: string[]; // Gradient hex strings array
  emoji: string;
}

export interface GlassParameters {
  gap: number;                  // u_gap (0.01 - 0.15)
  radius: number;               // u_radius (0.0 - 0.5)
  thickness: number;            // u_glass_thickness (0.1 - 2.0)
  refractionStrength: number;   // u_refraction_strength (0.1 - 5.0)
  refractionDepth: number;      // u_refraction_depth (0.01 - 0.25)
  rimIntensity: number;         // u_rim_intensity (0.1 - 3.0)
  rimPower: number;             // u_rim_power (1.0 - 10.0)
  specularIntensity: number;    // u_specular_intensity (0.1 - 5.0)
  specularPower: number;        // u_specular_power (5.0 - 100.0)
}

export interface CircleColors {
  c50: string;
  c40: string;
  c30: string;
  c20: string;
  c10: string;
}

export interface TrackingMetrics {
  leftDistance: number;         // L1 distance (pinch subdivision controller)
  rightDistance: number;        // L2 distance (deformation factor)
  isFistLeft: boolean;          // Left hand fist status
  isFistRight: boolean;         // Right hand fist status
  fps: number;                  // WebGL render cycle framerate
  trackingActive: boolean;      // Hand detect success state
  circleRadius: number;         // Dynamic circle radius [0, 50]
  volumeScale?: number;         // Right hand control volume [0, 1]
}

export const PRESET_THEMES: PresetTheme[] = [
  {
    id: 'deep-space',
    name: 'Deep Space',
    colors: ['#04060d', '#0c1a30', '#1f0d3d', '#050c18'],
    emoji: '🌌'
  },
  {
    id: 'solar-flare',
    name: 'Solar Flare',
    colors: ['#0f0502', '#2a0d04', '#471407', '#170301'],
    emoji: '🔥'
  },
  {
    id: 'aurora',
    name: 'Aurora',
    colors: ['#030f14', '#052a23', '#111b24', '#020f1a'],
    emoji: '🍃'
  },
  {
    id: 'neon-cyber',
    name: 'Cyber Indigo',
    colors: ['#0a0314', '#200533', '#110321', '#06010d'],
    emoji: '⚡'
  },
  {
    id: 'monochrome',
    name: 'Chamber Noir',
    colors: ['#0d0e10', '#1e2124', '#101114', '#0d0e10'],
    emoji: '♟️'
  }
];

export const DEFAULT_PARAMETERS: GlassParameters = {
  gap: 0.05,
  radius: 0.18,
  thickness: 0.65,
  refractionStrength: 1.5,
  refractionDepth: 0.08,
  rimIntensity: 1.6,
  rimPower: 4.5,
  specularIntensity: 2.5,
  specularPower: 32.0
};
