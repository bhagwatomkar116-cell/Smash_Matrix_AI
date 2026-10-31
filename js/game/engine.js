/**
 * Smash Pro — Badminton Match Engine & BWF Tournament Rules
 */

class BadmintonEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    // Three.js Core Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050811);
    this.scene.fog = new THREE.FogExp2(0x050811, 0.022);

    this.camera = new THREE.PerspectiveCamera(54, this.width / this.height, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Court, Shuttle, Rackets & Opponent AI
    this.court = new BadmintonCourt(this.scene);
    this.shuttle = new Shuttlecock(this.scene);
    this.playerRacket = new BadmintonRacket(this.scene, true);
    this.aiRacket = new BadmintonRacket(this.scene, false);
    this.ai = new BadmintonAI(this.aiRacket, this.shuttle);

    // Match Rules & State
    this.state = 'idle'; // 'idle', 'serving', 'playing', 'rally-ended', 'match-over'
    this.playerScore = 0;
    this.aiScore = 0;
    this.targetScore = 11;
    this.currentServer = 'player';
    this.rallyShots = 0;
    this.cameraMode = 'behind';

    this.mouse = { x: 0, y: 0 };
    this.keys = {};
    this.clock = new THREE.Clock();

    this.setupCamera();
    this.bindEvents();
    this.bindGestureEvents();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupCamera() {
    this.updateCameraPosition();
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
    this.updateCameraPosition();
  }

  updateCameraPosition() {
    if (this.cameraMode === 'behind') {
      // Third-person broadcast view behind player
      this.camera.position.set(0, 3.4, 8.6);
      this.camera.lookAt(0, 1.4, -0.8);
    } else if (this.cameraMode === 'broadcast') {
      // Sideline TV broadcast angle
      this.camera.position.set(8.5, 5.2, 0.4);
      this.camera.lookAt(0, 1.2, 0);
    } else if (this.cameraMode === 'top') {
      // Tactical top-down angle
      this.camera.position.set(0, 13.8, 0.5);
      this.camera.lookAt(0, 0, 0);
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      if (!this.container) return;
      this.width = this.container.clientWidth;
      this.height = this.container.clientHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
    });

    // Mouse movement
    window.addEventListener('mousemove', (e) => {
      const rect = this.container.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.state === 'playing' || this.state === 'serving') {
        const targetX = this.mouse.x * 2.6;
        const targetY = Math.max(0.85, Math.min(2.7, (this.mouse.y + 1) * 1.4));
        this.playerRacket.targetPos.x = targetX;
        this.playerRacket.targetPos.y = targetY;
      }
    });

    // Clicks for shots
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.handlePlayerAction('clear');
      } else if (e.button === 2) {
        this.handlePlayerAction('drop');
      }
    });

    window.addEventListener('contextmenu', (e) => {
      if (e.target.closest('#three-canvas-container')) {
        e.preventDefault();
      }
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        this.handlePlayerAction('clear');
      } else if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        this.handlePlayerAction('smash');
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        this.handlePlayerAction('drop');
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        this.handlePlayerAction('drive');
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  bindGestureEvents() {
    window.addEventListener('badminton-gesture-move', (e) => {
      if (!e.detail) return;
      const { x, y } = e.detail;
      const targetX = x * 2.6;
      const targetY = Math.max(0.85, Math.min(2.7, y * 2.2));
      this.playerRacket.targetPos.x = targetX;
      this.playerRacket.targetPos.y = targetY;
    });

    window.addEventListener('badminton-gesture-shot', (e) => {
      const type = e.detail ? e.detail.type : 'clear';
      this.handlePlayerAction(type);
    });
  }

  handlePlayerAction(shotType = 'clear') {
    if (this.state === 'serving') {
      if (this.currentServer === 'player') {
        this.executePlayerServe();
      }
    } else if (this.state === 'playing') {
      this.attemptPlayerHit(shotType);
    }
  }

  startMatch(options = {}) {
    this.targetScore = options.targetScore || 11;
    this.playerScore = 0;
    this.aiScore = 0;
    this.currentServer = 'player';
    this.state = 'serving';

    if (options.difficulty) {
      this.ai.setDifficulty(options.difficulty);
    }
    if (options.theme) {
      this.court.setTheme(options.theme);
    }

    if (window.BadmintonStats) {
      window.BadmintonStats.startMatch();
    }

    this.updateScoreboardHUD();
    this.prepareServe();
  }

  prepareServe() {
    this.state = 'serving';
    this.rallyShots = 0;

    // Official BWF service positioning: Right service court if score is even, Left if odd
    const isPlayerServer = (this.currentServer === 'player');
    const score = isPlayerServer ? this.playerScore : this.aiScore;
    const isRightCourt = (score % 2 === 0);
    const serveX = isRightCourt ? 1.0 : -1.0;

    if (isPlayerServer) {
      this.playerRacket.targetPos.set(serveX, 1.2, 4.6);
      this.shuttle.reset(serveX, 1.2, 4.4);
      this.showShotCallout('YOUR SERVE • SWING / FLICK TO HIT', 'clear');
    } else {
      this.aiRacket.targetPos.set(-serveX, 1.2, -4.6);
      this.shuttle.reset(-serveX, 1.2, -4.4);
      this.showShotCallout('VIKTOR AI SERVING...', 'clear');

      setTimeout(() => {
        if (this.state === 'serving' && this.currentServer === 'ai') {
          this.executeAIServe();
        }
      }, 1300);
    }

    this.updateScoreboardHUD();
  }

  executePlayerServe() {
    this.state = 'playing';
    this.playerRacket.swing('clear');
    const targetX = (Math.random() - 0.5) * 2.8;
    this.shuttle.serve('player', targetX, -5.2);
    this.rallyShots++;

    if (window.BadmintonStats) {
      window.BadmintonStats.recordShot('player', 'serve', this.shuttle.currentSpeedKmh);
    }
  }

  executeAIServe() {
    this.state = 'playing';
    this.aiRacket.swing('clear');
    const targetX = (Math.random() - 0.5) * 2.8;
    this.shuttle.serve('ai', targetX, 5.2);
    this.rallyShots++;

    if (window.BadmintonStats) {
      window.BadmintonStats.recordShot('ai', 'serve', this.shuttle.currentSpeedKmh);
    }
  }

  attemptPlayerHit(shotType = 'clear') {
    const sPos = this.shuttle.position;
    const rPos = this.playerRacket.getSweetSpot();
    const dist = rPos.distanceTo(sPos);

    const inStrikeRange = (dist < 1.45) && (sPos.z > 0.4);

    this.playerRacket.swing(shotType);

    if (inStrikeRange && this.shuttle.lastHitter !== 'player') {
      const crossAimX = this.playerRacket.position.x * -0.7;
      const target = new THREE.Vector3(crossAimX, 0, -4.6);

      this.shuttle.hit(shotType, 'player', target, 1.0);
      this.rallyShots++;

      this.showShotCallout(`${shotType.toUpperCase()} — ${this.shuttle.currentSpeedKmh} KM/H`, shotType);

      if (window.BadmintonStats) {
        window.BadmintonStats.recordShot('player', shotType, this.shuttle.currentSpeedKmh);
      }
    }
  }

  checkGameCollisions() {
    if (this.state !== 'playing') return;

    const sPos = this.shuttle.position;

    // 1. Net Collision
    if (Math.abs(sPos.z) < 0.12 && sPos.y < this.court.netTopY) {
      if (window.BadmintonAudio) window.BadmintonAudio.playDrop();
      this.shuttle.velocity.z *= -0.2;
      this.shuttle.velocity.y *= 0.4;

      const faultPlayer = (this.shuttle.lastHitter === 'player') ? 'player' : 'ai';
      this.awardPoint(faultPlayer === 'player' ? 'ai' : 'player', 'NET FAULT');
      return;
    }

    // 2. Court Floor Landing Check
    if (sPos.y <= 0.05) {
      sPos.y = 0.05;
      if (window.BadmintonAudio) window.BadmintonAudio.playFloorTap();
      this.evaluateLanding(sPos.x, sPos.z);
    }
  }

  evaluateLanding(x, z) {
    const isInsideWidth = Math.abs(x) <= (this.court.singlesWidth / 2);
    const isInsideLength = Math.abs(z) <= this.court.halfLength;
    const isInside = isInsideWidth && isInsideLength;

    const lastHitter = this.shuttle.lastHitter;

    if (isInside) {
      if (z > 0) {
        this.awardPoint('ai', 'IN — WINNER');
      } else {
        this.awardPoint('player', 'IN — WINNER');
      }
    } else {
      if (lastHitter === 'player') {
        this.awardPoint('ai', 'OUT');
      } else {
        this.awardPoint('player', 'OUT');
      }
    }
  }

  awardPoint(winner, reason) {
    this.state = 'rally-ended';
    this.shuttle.active = false;

    if (winner === 'player') {
      this.playerScore++;
      this.currentServer = 'player';
      this.showShotCallout(`POINT PLAYER (${reason})`, 'drop');
      if (window.BadmintonAudio) window.BadmintonAudio.playCheer();
    } else {
      this.aiScore++;
      this.currentServer = 'ai';
      this.showShotCallout(`POINT VIKTOR AI (${reason})`, 'smash');
      if (window.BadmintonAudio) window.BadmintonAudio.playWhistle();
    }

    this.updateScoreboardHUD();

    if (window.BadmintonStats) {
      window.BadmintonStats.recordRallyEnd(winner, this.rallyShots, this.shuttle.position);
    }

    if (this.checkMatchOver()) {
      return;
    }

    setTimeout(() => {
      this.prepareServe();
    }, 1800);
  }

  checkMatchOver() {
    const p = this.playerScore;
    const a = this.aiScore;
    const target = this.targetScore;

    const playerWon = (p >= target && p - a >= 2) || (p >= 30);
    const aiWon = (a >= target && a - p >= 2) || (a >= 30);

    if (playerWon || aiWon) {
      this.state = 'match-over';
      const winner = playerWon ? 'player' : 'ai';

      if (window.BadmintonStats) {
        window.BadmintonStats.finalizeMatch(winner, this.playerScore, this.aiScore);
      }

      setTimeout(() => {
        if (window.SmashApp) {
          window.SmashApp.showPostMatchAnalytics(winner, this.playerScore, this.aiScore);
        }
      }, 1400);

      return true;
    }
    return false;
  }

  updateScoreboardHUD() {
    const elPlayerScore = document.getElementById('sc-player-score');
    const elAiScore = document.getElementById('sc-ai-score');
    const elPlayerDot = document.getElementById('sc-player-dot');
    const elAiDot = document.getElementById('sc-ai-dot');

    if (elPlayerScore) {
      elPlayerScore.innerText = this.playerScore;
      elPlayerScore.classList.toggle('leading', this.playerScore > this.aiScore);
    }
    if (elAiScore) {
      elAiScore.innerText = this.aiScore;
      elAiScore.classList.toggle('leading', this.aiScore > this.playerScore);
    }
    if (elPlayerDot) {
      elPlayerDot.classList.toggle('active', this.currentServer === 'player');
    }
    if (elAiDot) {
      elAiDot.classList.toggle('active', this.currentServer === 'ai');
    }
  }

  showShotCallout(text, type = 'clear') {
    const banner = document.getElementById('arena-shot-banner');
    if (!banner) return;

    banner.innerText = text;
    banner.className = `shot-callout show ${type}`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      banner.classList.remove('show');
    }, 1400);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const dt = this.clock.getDelta();

    this.shuttle.update(dt);
    this.playerRacket.update(dt);
    this.aiRacket.update(dt);
    this.ai.update(dt, this.state);

    this.checkGameCollisions();

    const speedEl = document.getElementById('arena-speed-val');
    if (speedEl && this.shuttle) {
      speedEl.innerText = this.shuttle.currentSpeedKmh;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
