/**
 * Smash Pro — Competitive AI Opponent Engine
 * Models tactical badminton footwork, flight anticipation, and lethal attacking smashes.
 */

class BadmintonAI {
  constructor(racket, shuttlecock) {
    this.racket = racket;
    this.shuttle = shuttlecock;

    this.difficulty = 'pro';
    this.courtBasePos = new THREE.Vector3(0, 1.4, -4.5);
    this.moveSpeed = 7.0;
    this.smashTendency = 0.65;
    this.dropTendency = 0.35;
    this.hitCooldown = 0;

    this.setDifficulty(this.difficulty);
  }

  setDifficulty(level) {
    this.difficulty = level;
    if (level === 'rookie') {
      this.moveSpeed = 5.0;
      this.smashTendency = 0.25;
      this.dropTendency = 0.25;
      this.reachRadius = 1.1;
    } else if (level === 'legend') {
      // BWF World Champion Viktor Axelsen
      this.moveSpeed = 9.5;
      this.smashTendency = 0.85;
      this.dropTendency = 0.45;
      this.reachRadius = 1.4;
    } else {
      // Pro Contender
      this.moveSpeed = 7.5;
      this.smashTendency = 0.60;
      this.dropTendency = 0.35;
      this.reachRadius = 1.25;
    }
  }

  update(dt, matchState) {
    if (this.hitCooldown > 0) {
      this.hitCooldown -= dt;
    }

    if (matchState !== 'playing') {
      // Reset to T-center base position
      this.racket.targetPos.lerp(this.courtBasePos, dt * 3.5);
      return;
    }

    const sPos = this.shuttle.position;
    const sVel = this.shuttle.velocity;

    // Is shuttle heading toward AI court? (Z < 0 and moving with negative Z velocity)
    const isHeadingToAI = (sVel.z < 0 && sPos.z < 2.0);

    if (isHeadingToAI) {
      // Flight Trajectory Intercept Prediction
      // Predict where the shuttle will be at z ≈ -4.2
      const timeToPlane = (sPos.z - (-4.2)) / Math.max(0.1, -sVel.z);
      const predictedX = sPos.x + sVel.x * timeToPlane;
      const predictedY = Math.max(1.1, sPos.y + sVel.y * timeToPlane + 0.5 * this.shuttle.gravity * timeToPlane * timeToPlane);

      // Clamp target within singles boundary
      const targetX = Math.max(-2.3, Math.min(2.3, predictedX));
      const targetY = Math.max(1.0, Math.min(2.8, predictedY));
      const targetZ = Math.max(-6.2, Math.min(-2.2, sPos.z));

      const interceptTarget = new THREE.Vector3(targetX, targetY, targetZ);
      this.racket.targetPos.lerp(interceptTarget, dt * this.moveSpeed);

      // Hit zone check: distance between AI racket and shuttlecock
      const dist = this.racket.position.distanceTo(sPos);
      const inStrikeZone = (sPos.z <= -1.8 && sPos.z >= -6.4);

      if (dist < this.reachRadius && inStrikeZone && !this.racket.isSwinging && this.hitCooldown <= 0 && this.shuttle.lastHitter === 'player') {
        this.executeTacticalShot();
      }
    } else {
      // Recovery to central base position on AI court
      const baseRecovery = new THREE.Vector3(0, 1.4, -4.5);
      this.racket.targetPos.lerp(baseRecovery, dt * 3.0);
    }
  }

  executeTacticalShot() {
    this.hitCooldown = 0.4;
    const sPos = this.shuttle.position;

    let shotType = 'clear';

    // 1. High Floater -> Attacking SMASH!
    if (sPos.y >= 2.1 && Math.random() < this.smashTendency) {
      shotType = 'smash';
    } 
    // 2. Net Tumbler -> Delicate Drop Shot
    else if (sPos.z > -2.8 && Math.random() < this.dropTendency) {
      shotType = 'drop';
    } 
    // 3. Flat baseline rally -> Fast Drive or High Deep Clear
    else {
      shotType = (Math.random() < 0.45) ? 'drive' : 'clear';
    }

    // Strategic Target Placement on Player's Court (Z = 1.0 to 6.5)
    // Aim cross-court or down the line to challenge player's reach
    const crossCourtDirection = (this.racket.position.x > 0) ? -1 : 1;
    const targetX = crossCourtDirection * (1.2 + Math.random() * 1.1);
    const target = new THREE.Vector3(targetX, 0, 4.5);

    // AI Swing Animation & Physics Strike
    this.racket.swing(shotType);
    this.shuttle.hit(shotType, 'ai', target, 1.0);

    // Register shot with statistics engine
    if (window.BadmintonStats) {
      window.BadmintonStats.recordShot('ai', shotType, this.shuttle.currentSpeedKmh);
    }
  }
}
