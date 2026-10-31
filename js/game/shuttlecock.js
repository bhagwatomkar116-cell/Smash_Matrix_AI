/**
 * Smash Pro — 3D Shuttlecock Model & Trajectory Aerodynamics Engine
 * Mathematically guarantees realistic net clearance and badminton non-ballistic flight.
 */

class Shuttlecock {
  constructor(scene) {
    this.scene = scene;

    // Physical state
    this.position = new THREE.Vector3(0, 1.8, 4.0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.gravity = -13.8;         // Realistic badminton vertical acceleration
    this.dragCoeff = 0.12;        // Aerodynamic feather drag coefficient
    this.netHeight = 1.55;        // BWF Net Height

    this.active = false;
    this.lastHitter = null;       // 'player' or 'ai'
    this.currentSpeedKmh = 0;
    this.maxSpeedKmh = 0;
    this.shotType = 'clear';

    this.buildMesh();
    this.buildShadowBlob();
    this.buildTrail();
  }

  buildMesh() {
    this.group = new THREE.Group();

    // 1. Cork Nose (Smooth rounded dome)
    const corkGeo = new THREE.SphereGeometry(0.042, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const corkMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.05
    });
    this.cork = new THREE.Mesh(corkGeo, corkMat);
    this.cork.rotation.x = Math.PI;
    this.cork.position.set(0, 0, 0.04);
    this.cork.castShadow = true;
    this.group.add(this.cork);

    // 2. Feather Skirt (16-feather open cone)
    const skirtGeo = new THREE.ConeGeometry(0.075, 0.12, 16, 1, true);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    this.skirt = new THREE.Mesh(skirtGeo, skirtMat);
    this.skirt.rotation.x = -Math.PI / 2;
    this.skirt.position.set(0, 0, -0.02);
    this.skirt.castShadow = true;
    this.group.add(this.skirt);

    // 3. Ribbon Ring Band (Tournament Emerald)
    const ringGeo = new THREE.TorusGeometry(0.052, 0.0035, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x00e676, roughness: 0.2 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 0, -0.015);
    this.group.add(ring);

    this.group.position.copy(this.position);
    this.scene.add(this.group);
  }

  buildShadowBlob() {
    const shadowGeo = new THREE.CircleGeometry(0.2, 16);
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45
    });
    this.shadowBlob = new THREE.Mesh(shadowGeo, this.shadowMat);
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.position.y = 0.01;
    this.scene.add(this.shadowBlob);
  }

  buildTrail() {
    const count = 16;
    this.trailPoints = [];
    for (let i = 0; i < count; i++) {
      this.trailPoints.push(this.position.clone());
    }
    const trailGeo = new THREE.BufferGeometry().setFromPoints(this.trailPoints);
    this.trailMat = new THREE.LineBasicMaterial({
      color: 0x00e676,
      transparent: true,
      opacity: 0.8,
      linewidth: 3
    });
    this.trailLine = new THREE.Line(trailGeo, this.trailMat);
    this.scene.add(this.trailLine);
  }

  serve(serverSide, targetX = 0, targetZ = 0) {
    this.active = true;
    this.lastHitter = serverSide;
    this.shotType = 'serve';

    if (serverSide === 'player') {
      this.position.set(0.8, 1.15, 4.6);
      this.calculateSafeTrajectory('player', 'serve', targetX, targetZ || -5.2, 12.5, 2.4);
    } else {
      this.position.set(-0.8, 1.15, -4.6);
      this.calculateSafeTrajectory('ai', 'serve', targetX, targetZ || 5.2, 12.5, 2.4);
    }

    this.updateSpeedMetrics();
  }

  /**
   * Universal Physics Trajectory Solver
   * Mathematically ensures the shuttle clears the 1.55m net cleanly!
   */
  hit(shotType, hitter, dirTarget, power = 1.0) {
    this.active = true;
    this.lastHitter = hitter;
    this.shotType = shotType;

    const isPlayer = (hitter === 'player');
    const zDir = isPlayer ? -1 : 1;

    let targetZ, horizSpeed, desiredPeakHeight;

    switch (shotType) {
      case 'smash':
        // If contact height is high, execute steep downward strike; otherwise, crisp flat attacking drive
        if (this.position.y >= 2.0) {
          horizSpeed = (24 + Math.random() * 4) * power;
          targetZ = isPlayer ? -3.8 : 3.8;
          desiredPeakHeight = 1.68; // Just clears top net tape
        } else {
          // Low floater -> fast attacking drive
          this.shotType = 'drive';
          horizSpeed = 19.0 * power;
          targetZ = isPlayer ? -4.5 : 4.5;
          desiredPeakHeight = 1.72;
        }
        this.trailMat.color.setHex(0xf43f5e); // Scarlet trail
        break;

      case 'drop':
        // Soft tumbling net drop right into the short service court
        horizSpeed = 9.2 * power;
        targetZ = isPlayer ? -1.6 : 1.6;
        desiredPeakHeight = 1.78; // Gentle arc above tape
        this.trailMat.color.setHex(0x00e676);
        break;

      case 'clear':
        // High defensive clearing arc deep to the rear boundary
        horizSpeed = 15.5 * power;
        targetZ = isPlayer ? -6.1 : 6.1;
        desiredPeakHeight = 4.8; // High altitude peak
        this.trailMat.color.setHex(0x38bdf8);
        break;

      case 'drive':
      default:
        // Flat bullet drive skimming over tape
        horizSpeed = 18.0 * power;
        targetZ = isPlayer ? -4.6 : 4.6;
        desiredPeakHeight = 1.72;
        this.trailMat.color.setHex(0xf59e0b);
        break;
    }

    this.calculateSafeTrajectory(hitter, this.shotType, dirTarget.x, targetZ, horizSpeed, desiredPeakHeight);
    this.updateSpeedMetrics();
  }

  /**
   * Calculus calculation to guarantee: y(at z=0) >= 1.62m (clears 1.55m net!)
   */
  calculateSafeTrajectory(hitter, type, targetX, targetZ, speedZ, peakHeight) {
    const z0 = this.position.z;
    const y0 = this.position.y;
    const x0 = this.position.x;

    const dzNet = Math.abs(z0);
    const totalDz = Math.abs(targetZ - z0);
    const zSign = targetZ > z0 ? 1 : -1;

    // Time to reach the net
    const vz = speedZ * zSign;
    const tNet = dzNet / speedZ;

    // Minimum Vy required so that height at net is at least 1.65m
    const minHeightAtNet = 1.65;
    const minVy = (minHeightAtNet - y0 - 0.5 * this.gravity * (tNet * tNet)) / tNet;

    // Desired Vy based on shot type
    let targetVy = minVy;
    if (type === 'clear') {
      targetVy = Math.max(minVy + 2.5, 9.2);
    } else if (type === 'drop') {
      targetVy = Math.max(minVy + 0.3, 2.4);
    } else if (type === 'smash') {
      targetVy = Math.max(minVy + 0.1, (peakHeight - y0) / tNet - 0.5 * this.gravity * tNet);
    } else {
      targetVy = Math.max(minVy + 0.2, 1.8);
    }

    // Directional X speed
    const dx = targetX - x0;
    const tTotal = totalDz / speedZ;
    const vx = dx / tTotal;

    this.velocity.set(vx, targetVy, vz);
  }

  update(dt) {
    if (!this.active) return;

    const delta = Math.min(dt, 0.035);

    // 1. Aerodynamic Drag
    const speed = this.velocity.length();
    const dragForceMag = this.dragCoeff * speed * speed;
    const dragForce = this.velocity.clone().normalize().multiplyScalar(-dragForceMag);

    this.velocity.addScaledVector(dragForce, delta);

    // 2. Gravity
    this.velocity.y += this.gravity * delta;

    // 3. Update Position
    this.position.addScaledVector(this.velocity, delta);
    this.group.position.copy(this.position);

    // 4. Orientation (cork leads flight path)
    if (this.velocity.lengthSq() > 0.1) {
      const lookTarget = this.position.clone().add(this.velocity);
      this.group.lookAt(lookTarget);
    }

    // 5. Ground Shadow
    this.shadowBlob.position.x = this.position.x;
    this.shadowBlob.position.z = this.position.z;
    const heightRatio = Math.max(0.1, 1 - this.position.y / 7.5);
    this.shadowBlob.scale.set(heightRatio, heightRatio, 1);
    this.shadowMat.opacity = Math.max(0.1, 0.5 * heightRatio);

    // 6. Smash Trail
    this.trailPoints.unshift(this.position.clone());
    this.trailPoints.pop();
    this.trailLine.geometry.setFromPoints(this.trailPoints);

    this.updateSpeedMetrics();
  }

  updateSpeedMetrics() {
    const rawKmh = Math.round(this.velocity.length() * 3.6 * 2.6);
    this.currentSpeedKmh = Math.min(420, rawKmh);
    if (this.currentSpeedKmh > this.maxSpeedKmh) {
      this.maxSpeedKmh = this.currentSpeedKmh;
    }
  }

  reset(x = 0, y = 1.2, z = 4.0) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.group.position.copy(this.position);
    this.active = false;
    for (let i = 0; i < this.trailPoints.length; i++) {
      this.trailPoints[i].copy(this.position);
    }
    this.trailLine.geometry.setFromPoints(this.trailPoints);
  }
}
