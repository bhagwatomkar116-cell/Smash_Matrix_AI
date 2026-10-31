# 🏸 SMASH PRO - 3D Gesture Badminton & Gemma AI Arena

An esports-grade web badminton game featuring 3D Three.js court physics, hand gesture control bridge, and post-match AI coaching powered by Google Gemma (Ollama).

Inspired by the award-winning Hacktoberfest sports web showcases, with complete tournament progression, ranking leaderboards, procedural Web Audio acoustics, and telemetry analytics.

---

## 🚀 Quick Start (Running Locally)

You can launch the web application immediately using Python's built-in web server:

```bash
# In the project directory:
python3 -m http.server 8000
```

Then open your browser at:
👉 **`http://localhost:8000`**

*(Or simply open `index.html` directly in any modern browser).*

---

## 🎮 How to Play

### Controls:
- **Court Movement:** Move your **Mouse** or use your **Hand** in front of your webcam.
- **Smash Shot:** **Left Click** or **Up Arrow / W** (Fast, steep downward attack).
- **Drop Shot:** **Right Click** or **Down Arrow / S** (Delicate feather drop skimming over the net).
- **Clear / Lob:** **Spacebar** (Deep defensive arc to opponent baseline).
- **Drive:** **D key** or **Right Arrow** (Flat fast bullet drive).
- **Camera Switch:** Toggle between **Player Cam**, **TV Broadcast**, and **Tactical Top** using the HUD pill buttons.

---

## 🖐️ Teammate Guide: Hand Gesture Integration

The game contains a dedicated global bridge: **`window.BadmintonGestureBridge`**.

Whether your friend is using **MediaPipe Hands** in JavaScript, **OpenCV Python via WebSockets**, or Python OSC:

### 1. Update Hand Position
```javascript
// X ranges from -1.0 (far left) to 1.0 (far right)
// Y ranges from 0.0 (low court) to 1.0 (high reach)
window.BadmintonGestureBridge.onHandPosition(normX, normY);

// Or dispatch standard DOM event:
window.dispatchEvent(new CustomEvent('badminton-gesture-move', {
  detail: { x: normX, y: normY }
}));
```

### 2. Trigger Shot Gestures
```javascript
// Supported shot types: 'smash', 'drop', 'clear', 'drive'
window.BadmintonGestureBridge.triggerShot('smash');

// Or dispatch standard DOM event:
window.dispatchEvent(new CustomEvent('badminton-gesture-shot', {
  detail: { type: 'smash', power: 1.0 }
}));
```

### 3. Built-in Webcam Fallback
Click the **"📹 Hand Gestures"** button in the top navigation or bottom-right PIP window. It opens the webcam and tracks skin-motion centroids with visual indicators out of the box.

---

## 🤖 Teammate Guide: Ollama Gemma Backend Integration

After every match, the game sends match telemetry to Ollama's local Gemma endpoint:

- **Default Endpoint:** `http://localhost:11434/api/generate`
- **Default Model:** `gemma2` (also supports `gemma:2b`, `gemma:7b`)

### Enabling Ollama CORS (if connecting from web browser):
When running Ollama locally, enable CORS so the browser can query it:
```bash
# macOS / Linux terminal:
OLLAMA_ORIGINS="*" ollama serve
```

And in another terminal:
```bash
ollama run gemma2
```

### Telemetry Payload Format Sent to Gemma:
```json
{
  "finalScore": { "player": 11, "ai": 8 },
  "winner": "player",
  "totalRallies": 19,
  "averageRallyShots": 6.4,
  "player": {
    "shots": 62,
    "smashes": 14,
    "drops": 7,
    "clears": 22,
    "maxSpeed": 348,
    "averageSpeed": 210
  },
  "ai": {
    "shots": 58,
    "smashes": 9,
    "drops": 4,
    "clears": 26,
    "maxSpeed": 312
  }
}
```

*Note: If Ollama is not running, the built-in AI simulator automatically produces professional tactical feedback with typewriter animations so your presentation never fails!*

---

## 🏆 Project Structure

```
Badminton Game/
├── index.html                 # Main App Interface (Dashboard, 3D Arena, Analytics, Practice)
├── css/
│   └── style.css              # Cyber sports theme, HUD glassmorphism, responsive styling
├── js/
│   ├── app.js                 # App router, Leaderboard progression, Player profile state
│   ├── audio.js               # Procedural Web Audio API sound generator (smashes, whistles, crowd)
│   ├── game/
│   │   ├── court.js           # Three.js 3D court, official markings, net mesh, stadium lighting
│   │   ├── shuttlecock.js     # Aerodynamic drag physics, cork base, feather skirt, trajectory trails
│   │   ├── racket.js          # Carbon fiber racket models, swing kinematics, sweet spot hitbox
│   │   ├── ai.js              # Intelligent AI opponent (Rookie, Pro, Legend)
│   │   └── engine.js          # Core BWF match game loop, service rotation, line calls
│   ├── gestures/
│   │   └── gestureBridge.js   # Hand gesture tracking bridge, PIP webcam HUD, open API
│   └── analytics/
│       ├── stats.js           # Real-time statistics collector, rally logger, court heatmap
│       └── gemmaClient.js     # Ollama Gemma AI backend client & streaming typewriter
└── README.md
```

# Smash_Matrix_AI
