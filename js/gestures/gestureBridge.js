/**
 * Smash Pro - Hand Gesture Bridge
 * Modular connector for hand tracking (MediaPipe / OpenCV / Custom CV backend)
 * Allows friend's gesture script or webcam CV to drive player actions seamlessly.
 */

class GestureBridge {
  constructor() {
    this.videoElement = null;
    this.canvasElement = null;
    this.canvasCtx = null;
    this.stream = null;
    this.isActive = false;

    // Hand tracking state
    this.handDetected = false;
    this.lastHandX = 0;
    this.lastHandY = 0;
    this.lastMoveTime = 0;
    this.prevY = 0.5;
    this.velocityHistory = [];

    // Settings
    this.sensitivity = 1.2;
    this.flipHorizontal = true;

    // Expose globally for teammate integration
    window.BadmintonGestureBridge = this;
  }

  init(videoElId, canvasElId) {
    this.videoElement = document.getElementById(videoElId);
    this.canvasElement = document.getElementById(canvasElId);
    if (this.canvasElement) {
      this.canvasCtx = this.canvasElement.getContext('2d');
    }
  }

  async startWebcam() {
    if (this.isActive) return true;

    try {
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
      }

      this.isActive = true;
      this.updateStatusUI(true, 'Webcam Active');

      // Start optical tracking loop
      this.startTrackingLoop();
      return true;
    } catch (err) {
      console.warn("Webcam access error or denied:", err);
      this.updateStatusUI(false, 'Webcam Disabled');
      return false;
    }
  }

  stopWebcam() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.isActive = false;
    this.updateStatusUI(false, 'Standby');
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
   * Fast, reliable optical skin-motion centroid tracker
   * Serves as default out-of-the-box hand tracker before friend integrates MediaPipe
   */
  startTrackingLoop() {
    if (!this.isActive) return;

    const processFrame = () => {
      if (!this.isActive) return;

      if (this.videoElement && this.videoElement.readyState >= 2 && this.canvasCtx) {
        const w = this.canvasElement.width;
        const h = this.canvasElement.height;

        this.canvasCtx.save();
        if (this.flipHorizontal) {
          this.canvasCtx.scale(-1, 1);
          this.canvasCtx.drawImage(this.videoElement, -w, 0, w, h);
        } else {
          this.canvasCtx.drawImage(this.videoElement, 0, 0, w, h);
        }
        this.canvasCtx.restore();

        // Sample pixel motion or bright skin tone centroid
        this.detectHandMotion(w, h);
      }

      requestAnimationFrame(processFrame);
    };

    requestAnimationFrame(processFrame);
  }

  detectHandMotion(w, h) {
    try {
      const frame = this.canvasCtx.getImageData(0, 0, w, h);
      const data = frame.data;

      let sumX = 0;
      let sumY = 0;
      let count = 0;

      // Sample every 8th pixel for 60fps performance
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 8) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          // Simple skin tone heuristic
          if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
            sumX += x;
            sumY += y;
            count++;
          }
        }
      }

      if (count > 25) {
        this.handDetected = true;
        const normX = ((sumX / count) / w) * 2 - 1; // -1 to 1
        const normY = 1 - ((sumY / count) / h);    // 0 (bottom) to 1 (top)

        // Smooth
        const smoothedX = this.lastHandX * 0.7 + normX * 0.3;
        const smoothedY = this.lastHandY * 0.7 + normY * 0.3;

        this.onHandPosition(smoothedX, smoothedY);

        // Analyze vertical velocity for flick / smash / drop gestures
        const deltaY = smoothedY - this.prevY;
        this.prevY = smoothedY;

        const now = performance.now();
        if (now - this.lastMoveTime > 300) {
          if (deltaY < -0.18) {
            // Fast downward flick -> SMASH!
            this.triggerShot('smash');
            this.lastMoveTime = now;
          } else if (deltaY > 0.18) {
            // Rapid upward lift -> CLEAR!
            this.triggerShot('clear');
            this.lastMoveTime = now;
          }
        }

        // Draw tracking marker
        this.canvasCtx.fillStyle = '#00e676';
        this.canvasCtx.beginPath();
        this.canvasCtx.arc((smoothedX + 1) * 0.5 * w, (1 - smoothedY) * h, 8, 0, Math.PI * 2);
        this.canvasCtx.fill();

        this.updateStatusUI(true, 'Hand Detected');
      } else {
        this.handDetected = false;
        this.updateStatusUI(true, 'Searching Hand...');
      }
    } catch (e) {
      // In case canvas is tainted or context error
    }
  }

  // =========================================================================
  // PUBLIC API FOR TEAMMATE (GESTURE CV DEVELOPER)
  // Call these methods from your MediaPipe / OpenCV / Python WebSocket script!
  // =========================================================================

  /**
   * Report normalized hand position to game
   * @param {number} x - Normalized X (-1.0 to 1.0)
   * @param {number} y - Normalized Y (0.0 to 1.0)
   */
  onHandPosition(x, y) {
    this.lastHandX = Math.max(-1, Math.min(1, x));
    this.lastHandY = Math.max(0, Math.min(1, y));

    window.dispatchEvent(new CustomEvent('badminton-gesture-move', {
      detail: { x: this.lastHandX, y: this.lastHandY }
    }));
  }

  /**
   * Trigger shot action directly from gesture recognizer
   * @param {'smash'|'drop'|'clear'|'drive'} shotType
   * @param {number} power - Optional 0.0 to 1.0
   */
  triggerShot(shotType = 'clear', power = 1.0) {
    window.dispatchEvent(new CustomEvent('badminton-gesture-shot', {
      detail: { type: shotType, power: power }
    }));

    // Flash UI feedback
    const badge = document.getElementById('pip-gesture-feedback');
    if (badge) {
      badge.innerText = `GESTURE: ${shotType.toUpperCase()}!`;
      badge.style.color = (shotType === 'smash') ? '#ff2a5f' : '#00e676';
      clearTimeout(this.badgeTimer);
      this.badgeTimer = setTimeout(() => {
        badge.innerText = 'Tracking Active';
        badge.style.color = '#94a3b8';
      }, 1000);
    }
  }

  updateStatusUI(active, text) {
    const el = document.getElementById('pip-hand-status');
    if (el) {
      el.innerText = text;
      el.className = active ? 'detected' : '';
    }

    const navBtn = document.getElementById('nav-gesture-toggle');
    if (navBtn) {
      navBtn.classList.toggle('active', this.isActive);
    }
  }
}

// Global Singleton
window.BadmintonGestureBridge = new GestureBridge();

