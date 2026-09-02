/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Creates and compiles a WebGL shader.
 */
export function compileShader(gl: WebGL2RenderingContext, source: string, type: number): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Could not create WebGL shader object.');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!ok) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation error: ${log}`);
  }

  return shader;
}

/**
 * Creates and links a WebGL program.
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vShader: WebGLShader,
  fShader: WebGLShader
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Could not create WebGL program.');
  }

  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);

  const ok = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!ok) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }

  return program;
}

/**
 * Generates an elegant background texture. If an uploaded image is provided,
 * it is drawn to fit the background canvas perfectly. Otherwise, a premium dark 
 * slate gradient is rendered.
 */
export function generateConstructivistBackdrop(
  cols: number,
  rows: number,
  backgroundImage?: HTMLImageElement | null
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const w = 1024;
  const h = 1024;

  if (backgroundImage) {
    // Beautiful cover-style scaling to fit the 1024x1024 canvas perfectly.
    const imgW = backgroundImage.naturalWidth || backgroundImage.width;
    const imgH = backgroundImage.naturalHeight || backgroundImage.height;
    
    const scale = Math.max(w / imgW, h / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = (w - drawW) / 2;
    const drawY = (h - drawH) / 2;
    
    ctx.fillStyle = '#111215'; // Backing fallback
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(backgroundImage, drawX, drawY, drawW, drawH);
  } else {
    // Premium dark radial gradient default background
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, h * 0.72);
    gradient.addColorStop(0, '#1c1e24'); // subtle deep grey center
    gradient.addColorStop(1, '#08090b'); // crisp deep black borders/edges
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  return canvas;
}

/**
 * Creates flat subdivided vertex buffers mapping [0, 1] texture bounds
 * ensures that NO TRIANGLE crosses a cell boundary (which would cause
 * interpolation artifacts like odd extra boxes at borders).
 * Each cell is represented by exactly 1 clean quad (2 triangles).
 */
export function createSubdividedGridBuffer(
  cols: number,
  rows: number,
  subdivsPerCell: number = 1
): Float32Array {
  const vertices: number[] = [];
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (let y = 0; y < subdivsPerCell; y++) {
        for (let x = 0; x < subdivsPerCell; x++) {
          // Local uvs inside the cell, range [0, 1]
          const tx0 = x / subdivsPerCell;
          const ty0 = y / subdivsPerCell;
          const tx1 = (x + 1) / subdivsPerCell;
          const ty1 = (y + 1) / subdivsPerCell;
          
          // Global uvs in the whole grid, range [0, 1]
          const gx0 = (c + tx0) / cols;
          const gy0 = (r + ty0) / rows;
          const gx1 = (c + tx1) / cols;
          const gy1 = (r + ty1) / rows;
          
          // Triangle 1 (BottomLeft, BottomRight, TopLeft)
          // Vertex 1
          vertices.push(gx0, gy0, tx0, ty0);
          // Vertex 2
          vertices.push(gx1, gy0, tx1, ty0);
          // Vertex 3
          vertices.push(gx0, gy1, tx0, ty1);
          
          // Triangle 2 (TopLeft, BottomRight, TopRight)
          // Vertex 1
          vertices.push(gx0, gy1, tx0, ty1);
          // Vertex 2
          vertices.push(gx1, gy0, tx1, ty0);
          // Vertex 3
          vertices.push(gx1, gy1, tx1, ty1);
        }
      }
    }
  }
  
  return new Float32Array(vertices);
}

/**
 * Vertex shader: Warps geometry smoothly based on CPU physics joint nodes.
 */
export const VERTEX_SHADER_SRC = `#version 300 es
in vec4 position; // x: gx, y: gy, z: tx, w: ty (4 components!)
out vec2 v_uv;
out vec2 v_cell_uv;
out float v_glass_mask;

uniform vec2 u_grid_vertices[81]; // Up to 9x9 joint coordinates array
uniform int u_cols;
uniform int u_rows;
uniform float u_growth_progress;
uniform float u_grow_direction; // 0.0: cols, 1.0: rows, -1.0: static

void main() {
    v_uv = vec2(position.x, position.y);
    v_cell_uv = vec2(position.z, position.w);
    
    // Now we can find cell_x and cell_y accurately from the position.x, position.y coordinates
    float cell_x_f = position.x * float(u_cols);
    float cell_y_f = position.y * float(u_rows);
    int cell_x = int(floor(cell_x_f + 0.001)); // add tiny tolerance to avoid precision floor errors
    int cell_y = int(floor(cell_y_f + 0.001));
    
    // Safety clamping bounds
    if (cell_x >= u_cols) cell_x = u_cols - 1;
    if (cell_y >= u_rows) cell_y = u_rows - 1;
    if (cell_x < 0) cell_x = 0;
    if (cell_y < 0) cell_y = 0;
    
    float tx = position.z;
    float ty = position.w;
    
    int stride = u_cols + 1;
    vec2 v00 = u_grid_vertices[cell_x + cell_y * stride];
    vec2 v10 = u_grid_vertices[(cell_x + 1) + cell_y * stride];
    vec2 v11 = u_grid_vertices[(cell_x + 1) + (cell_y + 1) * stride];
    vec2 v01 = u_grid_vertices[cell_x + (cell_y + 1) * stride];
    
    // Bilinear blending of joint positions
    vec2 pos = mix(mix(v00, v10, tx), mix(v01, v11, tx), ty);
    
    // Fade growth grids during dynamic transitions
    float g_mask = 1.0;
    if (u_grow_direction == 0.0 && cell_x == u_cols - 1) {
        g_mask = u_growth_progress;
    } else if (u_grow_direction == 1.0 && cell_y == u_rows - 1) {
        g_mask = u_growth_progress;
    }
    v_glass_mask = g_mask;
    
    gl_Position = vec4(pos, 0.0, 1.0);
}
`;

/**
 * Fragment shader: Renders glass panels, refraction, and realistic metallic rim shadows.
 */
export const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec2 v_cell_uv;
in float v_glass_mask;

out vec4 fragColor;

uniform vec2 u_resolution;

// Custom styling parameters
uniform float u_gap;
uniform float u_radius;
uniform float u_glass_thickness;
uniform float u_refraction_strength;
uniform float u_refraction_depth;

// Highlighting values
uniform float u_rim_intensity;
uniform float u_rim_power;
uniform float u_specular_intensity;
uniform float u_specular_power;

// Background sampler
uniform sampler2D u_background_tex;

// Rounded box SDF generator (relative to coordinate bounds)
float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + vec2(r);
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
    // map coordinate inside cell from [0, 1] to [-0.5, 0.5]
    vec2 p = v_cell_uv - vec2(0.5);
    
    float gap_val = 0.035;
    vec2 box_size = vec2(0.5 - gap_val);
    float radius_val = 0.09;
    
    float d = sdRoundedBox(p, box_size, radius_val);
    
    // Premium flat transparency mask
    float glass_mask = smoothstep(0.015, -0.015, d) * v_glass_mask;
    
    // Sample the solid un-refracted background texture directly
    vec4 base_color = texture(u_background_tex, v_uv);
    
    // Create an elegant flat translucent glass overlay (a clean, soft white/grey tint)
    vec4 glass_color = base_color;
    glass_color.rgb = mix(glass_color.rgb, vec3(1.0), 0.16); // 16% flat white addition for premium translucency
    
    vec4 final_color = mix(base_color, glass_color, glass_mask);
    
    // Faint flat ambient drop shadow to separate panels smoothly
    float base_shadow = smoothstep(0.06, -0.03, d);
    float shadow_mask = (1.0 - glass_mask) * base_shadow * 0.18;
    final_color.rgb = mix(final_color.rgb, vec3(0.0), shadow_mask);
    
    fragColor = vec4(final_color.rgb, 1.0);
}
`;
