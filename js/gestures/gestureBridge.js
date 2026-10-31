/**
 * Smash Pro — Computer Vision Hand Tracking Engine
 * Powered by Google MediaPipe Hands (21 3D Skeletal Landmark Nodes)
 * Renders full geometric web mesh and detects kinetic swings (Smash / Drop / Clear).
 */

class GestureBridge {
  constructor() {
    this.isActive = false;
    this.handsInstance = null;
    this.cameraInstance = null;
    this.stream = null;

    // Elements
    this.videoElements = [];
    this.canvasElements = [];

    // Telemetry state
    this.handDetected = false;
    this.lastHandX = 0;
    this.lastHandY = 0.5;
    this.wristYHistory = [];
    this.HISTORY_LIMIT = 8;
    this.lastTriggerTime = 0;
    this.COOLDOWN_MS = 550;

    // Bone connectivity graph for 21-node hand skeleton
    this.CONNECTIONS = [
      // Thumb
      [0, 1], [1, 2], [2, 3], [3, 4],
      // Index finger (wrist → MCP → PIP → DIP → tip)
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Middle finger (wrist → MCP → PIP → DIP → tip)
      [0, 9], [9, 10], [10, 11], [11, 12],
      // Ring finger (wrist → MCP → PIP → DIP → tip)
      [0, 13], [13, 14], [14, 15], [15, 16],
      // Pinky
      [0, 17], [17, 18], [18, 19], [19, 20],
      // Knuckle Cross-Web (MCP arch across all fingers)
      [5, 9], [9, 13], [13, 17]
    ];

    window.BadmintonGestureBridge = this;
  }

  init() {
    // Collect video and canvas references across dashboard and arena
    this.pipVideo = document.getElementById('pip-webcam-video');
    this.pipCanvas = document.getElementById('pip-hand-canvas');

    this.diagVideo = document.getElementById('diag-preview-video');
    this.diagCanvas = document.getElementById('diag-preview-canvas');

    this.videoElements = [this.pipVideo, this.diagVideo].filter(Boolean);
    this.canvasElements = [this.pipCanvas, this.diagCanvas].filter(Boolean);
  }

  async startWebcam() {
    if (this.isActive) return true;

    try {
      this.updateStatusUI(true, 'Initializing MediaPipe Hands...');

      // Check if MediaPipe is available in global namespace
      if (!window.Hands || !window.Camera) {
        console.warn("MediaPipe Hands scripts not yet loaded, waiting...");
        await this.waitForMediaPipe();
      }

      // Initialize MediaPipe Hands solution
      this.handsInstance = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      this.handsInstance.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65
      });

      this.handsInstance.onResults((results) => this.onMediaPipeResults(results));

      // Acquire camera stream
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create continuous offscreen worker video so view switches (display:none) never interrupt processing
      if (!this.workerVideo) {
        this.workerVideo = document.createElement('video');
        this.workerVideo.playsInline = true;
        this.workerVideo.muted = true;
        this.workerVideo.autoplay = true;
        this.workerVideo.style.display = 'none';
        document.body.appendChild(this.workerVideo);
      }
      this.workerVideo.srcObject = this.stream;
      await this.workerVideo.play().catch(e => console.warn(e));

      // Also mirror stream to UI preview video elements
      this.videoElements.forEach(vid => {
        vid.srcObject = this.stream;
        vid.play().catch(e => console.warn(e));
      });

      // Camera instance feeds from persistent worker video
      this.cameraInstance = new window.Camera(this.workerVideo, {
        onFrame: async () => {
          if (this.isActive && this.workerVideo && this.handsInstance) {
            await this.handsInstance.send({ image: this.workerVideo });
          }
        },
        width: 640,
        height: 480
      });
      await this.cameraInstance.start();

      this.isActive = true;
      this.updateStatusUI(true, 'Tracking 21 Nodes');

      // Hide placeholder in dashboard
      const placeholder = document.getElementById('diag-placeholder');
      if (placeholder) placeholder.classList.add('hidden');

      return true;
    } catch (err) {
      console.error("Failed to start MediaPipe Hand Tracker:", err);
      this.updateStatusUI(false, 'Camera Error / Blocked');
      return false;
    }
  }

  async waitForMediaPipe() {
    let attempts = 0;
    while ((!window.Hands || !window.Camera) && attempts < 20) {
      await new Promise(r => setTimeout(r, 200));
      attempts++;
    }
  }

  stopWebcam() {
    this.isActive = false;
    if (this.cameraInstance && this.cameraInstance.stop) {
      this.cameraInstance.stop();
      this.cameraInstance = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.workerVideo) {
      this.workerVideo.srcObject = null;
    }
    this.videoElements.forEach(vid => {
      vid.srcObject = null;
    });
    if (this.handsInstance && this.handsInstance.close) {
      this.handsInstance.close();
      this.handsInstance = null;
    }

    // Clear canvases
    this.canvasElements.forEach(canvas => {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    this.updateStatusUI(false, 'Standby');

    const placeholder = document.getElementById('diag-placeholder');
    if (placeholder) placeholder.classList.remove('hidden');
  }

  toggleWebcam() {
    if (this.isActive) {
      this.stopWebcam();
      return false;
    } else {
      return this.startWebcam();
    }
  }

  /**
   * MediaPipe Hands Callback
   * Renders the 21-node geometric skeletal web and calculates kinetic swing vectors
   */
  onMediaPipeResults(results) {
    if (!this.isActive) return;

    const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

    // Render on all active canvas displays
    this.canvasElements.forEach(canvas => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (hasHand) {
        const landmarks = results.multiHandLandmarks[0];
        this.renderGeometricHandWeb(ctx, landmarks, canvas.width, canvas.height);
      }
    });

    if (hasHand) {
      const landmarks = results.multiHandLandmarks[0];
      this.handDetected = true;

      // 1. Position Tracking: Wrist & Palm Center
      const wrist = landmarks[0];
      const middleBase = landmarks[9];
      const palmX = (wrist.x + middleBase.x) * 0.5;
      const palmY = (wrist.y + middleBase.y) * 0.5;

      // Normalize X: Camera is mirrored (1 - palmX), mapped to -1.0 .. +1.0
      const normX = ((1 - palmX) - 0.5) * 2.2;
      const normY = (1 - palmY); // 0 at bottom, 1 at top

      // Smooth position
      this.lastHandX = this.lastHandX * 0.65 + normX * 0.35;
      this.lastHandY = this.lastHandY * 0.65 + normY * 0.35;

      this.onHandPosition(this.lastHandX, this.lastHandY);

      // 2. Kinetic Swing Motion Vector Analysis
      this.analyzeSwingVector(landmarks);

      this.updateStatusUI(true, 'Hand Mesh Locked');
    } else {
      this.handDetected = false;
      this.wristYHistory.length = 0;
      this.updateStatusUI(true, 'Searching Hand...');
    }
  }

  /**
   * Render High-Tech 21-Joint Geometric Skeletal Web
   */
  renderGeometricHandWeb(ctx, landmarks, w, h) {
    // 1. Semi-transparent Palm Polygon Webbing
    const palmIndices = [0, 1, 5, 9, 13, 17];
    ctx.fillStyle = 'rgba(0, 230, 118, 0.08)';
    ctx.beginPath();
    palmIndices.forEach((idx, i) => {
      const pt = landmarks[idx];
      const px = pt.x * w;
      const py = pt.y * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();

    // 2. Geometric Connecting Bones (Laser Strands)
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00e676';
    ctx.shadowBlur = 4;

    ctx.beginPath();
    this.CONNECTIONS.forEach(([start, end]) => {
      const p1 = landmarks[start];
      const p2 = landmarks[end];
      if (p1 && p2) {
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
      }
    });
    ctx.stroke();
    ctx.shadowBlur = 0; // reset

    // 3. Knuckle Joint Nodes (All 21 Points)
    landmarks.forEach((joint, i) => {
      const x = joint.x * w;
      const y = joint.y * h;

      // Outer ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.stroke();

      // Inner core
      ctx.fillStyle = '#060a12';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. Highlight 5 Fingertips & Wrist in High-Contrast Brilliant White
    const keyTips = [4, 8, 12, 16, 20];
    keyTips.forEach(tipIdx => {
      const tip = landmarks[tipIdx];
      if (tip) {
        const x = tip.x * w;
        const y = tip.y * h;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Wrist Base Indicator
    const wrist = landmarks[0];
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(wrist.x * w, wrist.y * h, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Kinetic Velocity Analysis for Smashing, Clearing, and Dropping
   */
  analyzeSwingVector(landmarks) {
    const wrist = landmarks[0];
    const indexTip = landmarks[8];

    // MediaPipe Y: 0 is top of camera, 1 is bottom
    const currentWristY = wrist.y;
    this.wristYHistory.push(currentWristY);
    if (this.wristYHistory.length > this.HISTORY_LIMIT) {
      this.wristYHistory.shift();
    }

    const now = Date.now();
    if (now - this.lastTriggerTime > this.COOLDOWN_MS && this.wristYHistory.length >= 4) {
      // Compare current wrist position to 3 frames ago
      const prevWristY = this.wristYHistory[this.wristYHistory.length - 4];
      const velocityDelta = currentWristY - prevWristY; // Positive = DOWNWARD whip, Negative = UPWARD lift

      // Is hand in elevated position? (Index tip higher than wrist)
      const isElevated = indexTip.y < wrist.y;

      if (isElevated && velocityDelta > 0.08) {
        // High rapid downward flick -> SMASH!
        this.triggerShot('smash', 1.0);
        this.lastTriggerTime = now;
        this.wristYHistory.length = 0;
      } else if (velocityDelta < -0.09) {
        // Upward sweep from low to high -> CLEAR / LOB!
        this.triggerShot('clear', 1.0);
        this.lastTriggerTime = now;
        this.wristYHistory.length = 0;
      } else if (velocityDelta > 0.03 && velocityDelta < 0.07 && isElevated) {
        // Delicate, soft downward slice -> DROP SHOT!
        this.triggerShot('drop', 0.8);
        this.lastTriggerTime = now;
        this.wristYHistory.length = 0;
      }
    }
  }

  // =========================================================================
  // PUBLIC TELEMETRY API
  // =========================================================================

  onHandPosition(x, y) {
    this.lastHandX = Math.max(-1.0, Math.min(1.0, x));
    this.lastHandY = Math.max(0.0, Math.min(1.0, y));

    window.dispatchEvent(new CustomEvent('badminton-gesture-move', {
      detail: { x: this.lastHandX, y: this.lastHandY }
    }));
  }

  triggerShot(shotType = 'clear', power = 1.0) {
    window.dispatchEvent(new CustomEvent('badminton-gesture-shot', {
      detail: { type: shotType, power: power }
    }));

    // In-game HUD Flash feedback
    const badge = document.getElementById('pip-gesture-feedback');
    if (badge) {
      badge.innerText = `GESTURE: ${shotType.toUpperCase()}`;
      badge.style.color = (shotType === 'smash') ? 'var(--accent-red)' : 'var(--accent-green)';
      clearTimeout(this.badgeTimer);
      this.badgeTimer = setTimeout(() => {
        badge.innerText = 'TRACKING 21 NODES';
        badge.style.color = 'var(--text-tertiary)';
      }, 900);
    }
  }

  updateStatusUI(active, text) {
    const el = document.getElementById('pip-hand-status');
    if (el) el.innerText = text;

    const navBtn = document.getElementById('nav-gesture-toggle');
    if (navBtn) navBtn.classList.toggle('active', this.isActive);

    const diagChip = document.getElementById('vision-diagnostic-chip');
    if (diagChip) {
      diagChip.innerText = this.isActive ? 'MESH ONLINE' : 'STANDBY';
      diagChip.className = this.isActive ? 'status-chip chip-ready' : 'status-chip';
    }
  }
}

// Global Singleton
window.BadmintonGestureBridge = new GestureBridge();
