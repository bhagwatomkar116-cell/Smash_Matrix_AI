/**
 * Smash Pro - Badminton 3D Game Engine & BWF Match Rules
 */

class BadmintonEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    // Three.js Core
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060913);
    this.scene.fog = new THREE.FogExp2(0x060913, 0.025);

    this.camera = new THREE.PerspectiveCamera(55, this.width / this.height, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Setup Court & Entities
    this.court = new BadmintonCourt(this.scene);
    this.shuttle = new Shuttlecock(this.scene);
    this.playerRacket = new BadmintonRacket(this.scene, true);
    this.aiRacket = new BadmintonRacket(this.scene, false);
    this.ai = new BadmintonAI(this.aiRacket, this.shuttle);

    // Match State
    this.state = 'idle'; // 'idle', 'serving', 'playing', 'rally-ended', 'match-over'
    this.playerScore = 0;
    this.aiScore = 0;
    this.targetScore = 11; // 11 or 21
    this.currentServer = 'player'; // 'player' or 'ai'
    this.rallyShots = 0;

    // Controls & Camera Settings
    this.cameraMode = 'behind'; // 'behind', 'broadcast', 'top'
    this.mouse = { x: 0, y: 0 };
    this.isMouseDown = false;
    this.keys = {};

    this.clock = new THREE.Clock();
    this.setupCameras();
    this.bindEvents();
    this.setupGestureListeners();

    // Start loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupCameras() {
    this.updateCameraPosition();
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
    this.updateCameraPosition();
  }

  updateCameraPosition() {
    if (this.cameraMode === 'behind') {
      // Dynamic third-person behind player
      this.camera.position.set(0, 3.2, 8.8);
      this.camera.lookAt(0, 1.4, -1.0);
    } else if (this.cameraMode === 'broadcast') {
      // TV Broadcast sideline angle
      this.camera.position.set(8.5, 5.0, 0.5);
      this.camera.lookAt(0, 1.2, 0);
    } else if (this.cameraMode === 'top') {
      // Birds-eye tactical view
      this.camera.position.set(0, 13.5, 1.0);
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
      // Normalize -1 to 1 within container
      const rect = this.container.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Update player racket target position
      if (this.state === 'playing' || this.state === 'serving') {
        const targetX = this.mouse.x * 2.6;
        const targetY = Math.max(0.8, Math.min(2.8, (this.mouse.y + 1) * 1.5));
        this.playerRacket.targetPos.x = targetX;
        this.playerRacket.targetPos.y = targetY;
      }
    });

    // Mouse click -> swing or serve
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click
        this.handlePlayerAction('clear');
      } else if (e.button === 2) { // Right click -> Drop shot
        this.handlePlayerAction('drop');
      }
    });

    window.addEventListener('contextmenu', (e) => {
      // Prevent context menu inside game arena
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

  setupGestureListeners() {
    // Listen for events from gestureBridge.js
    window.addEventListener('badminton-gesture-move', (e) => {
      if (!e.detail) return;
      const { x, y } = e.detail; // normalized -1 to 1
      const targetX = x * 2.6;
      const targetY = Math.max(0.8, Math.min(2.8, y * 2.0));
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

    // Official BWF service positioning: Right court if score is even, left court if odd
    const isPlayerServer = (this.currentServer === 'player');
    const score = isPlayerServer ? this.playerScore : this.aiScore;
    const isRightCourt = (score % 2 === 0);
    const serveX = isRightCourt ? 1.0 : -1.0;

    if (isPlayerServer) {
      this.playerRacket.targetPos.set(serveX, 1.2, 4.8);
      this.shuttle.reset(serveX, 1.2, 4.6);
      this.showShotBanner('YOUR SERVE • CLICK / SWIPE TO HIT', 'clear');
    } else {
      this.aiRacket.targetPos.set(-serveX, 1.2, -4.8);
      this.shuttle.reset(-serveX, 1.2, -4.6);
      this.showShotBanner('OPPONENT SERVING...', 'clear');

      // AI serves after a short natural delay
      setTimeout(() => {
        if (this.state === 'serving' && this.currentServer === 'ai') {
          this.executeAIServe();
        }
      }, 1200);
    }

    this.updateScoreboardHUD();
  }

  executePlayerServe() {
    this.state = 'playing';
    this.playerRacket.swing('clear');
    const targetX = (Math.random() - 0.5) * 3.0;
    this.shuttle.serve('player', targetX, -5.5);
    this.rallyShots++;

    if (window.BadmintonStats) {
      window.BadmintonStats.recordShot('player', 'serve', this.shuttle.currentSpeedKmh);
    }
  }

  executeAIServe() {
    this.state = 'playing';
    this.aiRacket.swing('clear');
    const targetX = (Math.random() - 0.5) * 3.0;
    this.shuttle.serve('ai', targetX, 5.5);
    this.rallyShots++;

    if (window.BadmintonStats) {
      window.BadmintonStats.recordShot('ai', 'serve', this.shuttle.currentSpeedKmh);
    }
  }

  attemptPlayerHit(shotType = 'clear') {
    const sPos = this.shuttle.position;
    const rPos = this.playerRacket.getSweetSpot();
    const dist = rPos.distanceTo(sPos);

    // Strike zone: in front of player on player side
    const inReach = (dist < 1.35) && (sPos.z > 0.5);

    this.playerRacket.swing(shotType);

    if (inReach && this.shuttle.lastHitter !== 'player') {
      // Calculate shot direction based on racket offset and chosen shot
      const aimX = this.playerRacket.position.x * -0.7; // Cross court or straight
      const target = new THREE.Vector3(aimX, 0, -4.5);

      this.shuttle.hit(shotType, 'player', target, 1.0);
      this.rallyShots++;

      this.showShotBanner(shotType.toUpperCase() + `! ${this.shuttle.currentSpeedKmh} KM/H`, shotType);

      if (window.BadmintonStats) {
        window.BadmintonStats.recordShot('player', shotType, this.shuttle.currentSpeedKmh);
      }
    }
  }

  checkGameCollisions() {
    if (this.state !== 'playing') return;

    const sPos = this.shuttle.position;

    // 1. Net Collision Check (Net is at Z = 0, height = 1.55m)
    if (Math.abs(sPos.z) < 0.15 && sPos.y < this.court.netTopY) {
      // Hit the net tape or mesh!
      if (window.BadmintonAudio) window.BadmintonAudio.playDrop();
      this.shuttle.velocity.z *= -0.2; // Bounce back
      this.shuttle.velocity.y *= 0.5;

      const faultPlayer = (this.shuttle.lastHitter === 'player') ? 'player' : 'ai';
      this.awardPoint(faultPlayer === 'player' ? 'ai' : 'player', 'NET FAULT');
      return;
    }

    // 2. Court Floor Landing Check (Y <= 0.05)
    if (sPos.y <= 0.05) {
      sPos.y = 0.05;
      if (window.BadmintonAudio) window.BadmintonAudio.playFloorTap();

      this.evaluateLanding(sPos.x, sPos.z);
    }
  }

  evaluateLanding(x, z) {
    // Official Badminton Singles dimensions: |x| <= 2.59m, |z| <= 6.7m
    const isInsideWidth = Math.abs(x) <= (this.court.singlesWidth / 2);
    const isInsideLength = Math.abs(z) <= this.court.halfLength;
    const isInside = isInsideWidth && isInsideLength;

    const lastHitter = this.shuttle.lastHitter;

    if (isInside) {
      // Shuttle landed in! The player on the receiving side failed to return it.
      if (z > 0) {
        // Landed on player side -> AI wins rally
        this.awardPoint('ai', 'IN! WINNER');
      } else {
        // Landed on AI side -> Player wins rally
        this.awardPoint('player', 'IN! WINNER');
      }
    } else {
      // Shuttle landed OUT! The last hitter made an error.
      if (lastHitter === 'player') {
        this.awardPoint('ai', 'OUT!');
      } else {
        this.awardPoint('player', 'OUT!');
      }
    }
  }

  awardPoint(winner, reason) {
    this.state = 'rally-ended';
    this.shuttle.active = false;

    if (winner === 'player') {
      this.playerScore++;
      this.currentServer = 'player';
      this.showShotBanner(`POINT PLAYER! (${reason})`, 'drop');
      if (window.BadmintonAudio) window.BadmintonAudio.playCheer();
    } else {
      this.aiScore++;
      this.currentServer = 'ai';
      this.showShotBanner(`POINT AI! (${reason})`, 'smash');
      if (window.BadmintonAudio) window.BadmintonAudio.playWhistle();
    }

    this.updateScoreboardHUD();

    if (window.BadmintonStats) {
      window.BadmintonStats.recordRallyEnd(winner, this.rallyShots, this.shuttle.position);
    }

    // Check for match conclusion
    if (this.checkMatchOver()) {
      return;
    }

    // Prepare next rally after 1.8s
    setTimeout(() => {
      this.prepareServe();
    }, 1800);
  }

  checkMatchOver() {
    const p = this.playerScore;
    const a = this.aiScore;
    const target = this.targetScore;

    // Must win by 2 or first to reach 30
    const playerWon = (p >= target && p - a >= 2) || (p >= 30);
    const aiWon = (a >= target && a - p >= 2) || (a >= 30);

    if (playerWon || aiWon) {
      this.state = 'match-over';
      const matchWinner = playerWon ? 'player' : 'ai';

      if (window.BadmintonStats) {
        window.BadmintonStats.finalizeMatch(matchWinner, this.playerScore, this.aiScore);
      }

      // Trigger post-match Gemma AI Analysis view!
      setTimeout(() => {
        if (window.SmashApp) {
          window.SmashApp.showPostMatchAnalytics(matchWinner, this.playerScore, this.aiScore);
        }
      }, 1500);

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

  showShotBanner(text, type = 'clear') {
    const banner = document.getElementById('arena-shot-banner');
    if (!banner) return;

    banner.innerText = text;
    banner.className = `shot-banner show ${type}`;
    clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => {
      banner.classList.remove('show');
    }, 1400);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const dt = this.clock.getDelta();

    // 1. Update entities
    this.shuttle.update(dt);
    this.playerRacket.update(dt);
    this.aiRacket.update(dt);
    this.ai.update(dt, this.state);

    // 2. Collision checks
    this.checkGameCollisions();

    // 3. Update Speedometer
    const speedEl = document.getElementById('arena-speed-val');
    if (speedEl && this.shuttle) {
      speedEl.innerText = this.shuttle.currentSpeedKmh;
    }

    // 4. Render
    this.renderer.render(this.scene, this.camera);
  }
}

