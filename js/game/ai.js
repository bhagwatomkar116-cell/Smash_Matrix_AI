/**
 * Smash Pro - AI Opponent Brain
 * Tactical court positioning, flight anticipation, and shot selection
 */

class BadmintonAI {
  constructor(racket, shuttlecock) {
    this.racket = racket;
    this.shuttle = shuttlecock;

    this.difficulty = 'pro'; // 'rookie', 'pro', 'legend'
    this.courtBasePos = new THREE.Vector3(0, 1.4, -4.5);
    this.hasHitThisRally = false;
    this.reactionDelayTimer = 0;

    // Tactical stats
    this.reactionSpeed = 0.12; // lower is faster
    this.smashTendency = 0.5;
    this.dropTendency = 0.3;
    this.errorRate = 0.08;

    this.setDifficulty(this.difficulty);
  }

  setDifficulty(level) {
    this.difficulty = level;
    if (level === 'rookie') {
      this.reactionSpeed = 0.22;
      this.smashTendency = 0.2;
      this.dropTendency = 0.2;
      this.errorRate = 0.22;
      this.moveSpeed = 4.2;
    } else if (level === 'legend') {
      this.reactionSpeed = 0.05;
      this.smashTendency = 0.75;
      this.dropTendency = 0.4;
      this.errorRate = 0.02;
      this.moveSpeed = 8.5;
    } else {
      // Pro
      this.reactionSpeed = 0.12;
      this.smashTendency = 0.5;
      this.dropTendency = 0.3;
      this.errorRate = 0.06;
      this.moveSpeed = 6.2;
    }
  }

  update(dt, matchState) {
    if (matchState !== 'playing') {
      // Return to baseline stance
      this.racket.targetPos.lerp(this.courtBasePos, dt * 3);
      return;
    }

    const sPos = this.shuttle.position;
    const sVel = this.shuttle.velocity;

    // Is shuttle heading toward AI court? (z < 0)
    const isHeadingToAI = (sVel.z < 0 && sPos.z < 1.0);

    if (isHeadingToAI) {
      // Estimate intercept position
      // Predict where shuttle will be at z = -4.0
      let interceptX = sPos.x;
      let interceptY = Math.max(1.1, sPos.y);
      let interceptZ = Math.min(-1.5, Math.max(-6.2, sPos.z));

      // Target position for AI racket
      const target = new THREE.Vector3(
        Math.max(-2.4, Math.min(2.4, interceptX)),
        Math.max(1.0, Math.min(2.8, interceptY)),
        interceptZ
      );

      // Move toward intercept
      this.racket.targetPos.lerp(target, dt * this.moveSpeed);

      // Check if shuttle is within AI strike zone
      const dist = this.racket.position.distanceTo(sPos);
      const isCloseZ = (sPos.z <= -2.5 && sPos.z >= -6.2);

      if (dist < 1.1 && isCloseZ && !this.racket.isSwinging && this.shuttle.lastHitter === 'player') {
        this.executeShot();
      }
    } else {
      // Recover to T-center court position
      const recoveryPos = new THREE.Vector3(0, 1.4, -4.5);
      this.racket.targetPos.lerp(recoveryPos, dt * 2.5);
    }
  }

  executeShot() {
    // Select tactical shot based on shuttle height and AI profile
    let shot = 'clear';
    const sPos = this.shuttle.position;

    // High floating shuttle -> Opportunity for a smash!
    if (sPos.y > 2.2 && Math.random() < this.smashTendency) {
      shot = 'smash';
    } else if (sPos.z > -3.0 && Math.random() < this.dropTendency) {
      // Near the net -> Drop shot
      shot = 'drop';
    } else {
      shot = (Math.random() < 0.35) ? 'drive' : 'clear';
    }

    // Pick a strategic target on player's court
    // Aim away from player's current X position
    const targetX = (Math.random() > 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.0);
    const target = new THREE.Vector3(targetX, 0, 4.5);

    // AI Swing
    this.racket.swing(shot);
    this.shuttle.hit(shot, 'ai', target, 1.0);

    // Register event with analytics
    if (window.BadmintonStats) {
      window.BadmintonStats.recordShot('ai', shot, this.shuttle.currentSpeedKmh);
    }
  }
}

