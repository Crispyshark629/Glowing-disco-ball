# Audio Visualizer & Interactive Gesture Canvas

An experimental interactive audio-visual platform combining multi-layered concentric circle particle systems, real-time Web Audio analysis, and MediaPipe AI hand gesture tracking.

<img width="1538" height="974" alt="image" src="https://github.com/user-attachments/assets/a069fb8b-5781-4730-b117-2c1f0cc5d459" />

---

## ✨ Features

- 🎵 **Real-Time Audio Reactivity**: Powered by the Web Audio API with microphone input and local audio file parsing. 100 multi-layer concentric circle nodes react synchronously to frequency bands and beat intensities.
- 🌀 **6 Seamless Visual Modes**:
  - Mode 1 (Concentric Grid): Structured 10×10 concentric circle layout with clean rhythmic pulsing.
  - Mode 2 (Scattered Grid): Organic staggered positioning with customizable spacing offsets.
  - Mode 3 (Dispersed Particles): Fluid, outward-drifting particle dynamics.
  - Mode 4 (Random Vortex): Randomized positions with rotational vortex swirls.
  - Mode 5 (Hyperbolic Stream): Edge-blurred hyperbolic perspective with dynamic luminance tracking.
  - Mode 6 (Orbit Jump): Elliptical orbit rotation with physics-based circle jumping, air hovering, landing ripples, and destination clustering.
- 🖐️ **AI Hand Gesture Control**: Real-time webcam tracking via Google MediaPipe. Interactive hand palm rotation, pinch distortion, and two-stroke wrist rotation gestures to cycle through visual modes seamlessly.
- 🎨 **Deep Customization**: 5-layer concentric palette customization, hue offset sliders, dynamic motion blur, and particle force-field adjustments.

---

## 🚀 Getting Started

### 1. Clone the repository and install dependencies

```bash
git clone <your-repo-url>
cd <your-repo-name>
npm install
```

### 2. Start the local development server

```bash
npm run dev
```

### 3. Build for production

```bash
npm run build
```

---

## 🛠️ Tech Stack

- **Framework**: React 18, TypeScript, Vite
- **Graphics & UI**: HTML5 Canvas (2D Context), Tailwind CSS, Lucide Icons
- **Computer Vision**: Google MediaPipe Tasks Vision (Hand Landmark Detection)
- **Audio Processing**: Web Audio API (AudioContext, AnalyserNode)

---

## 📄 License

MIT © Eugene Yu
