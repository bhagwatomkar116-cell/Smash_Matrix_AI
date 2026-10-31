/**
 * Smash Pro - 3D Shuttlecock Model & Aerodynamics Physics Engine
 * Authentic feather skirt + cork base with high drag non-ballistic physics
 */

class Shuttlecock {
  constructor(scene) {
    this.scene = scene;

    // Physical state
    this.position = new THREE.Vector3(0, 2.0, 4.0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.gravity = -14.5;         // m/s^2 (slightly higher for crisp badminton pacing)
    this.dragCoeff = 0.16;        // Aerodynamic drag factor
    this.mass = 0.005;            // 5 grams
    this.radius = 0.08;           // Hitbox radius

    this.active = false;
    this.lastHitter = null;       // 'player' or 'ai'
    this.currentSpeedKmh = 0;
    this.maxSpeedKmh = 0;
    this.shotType = 'clear';      // 'smash', 'drop', 'clear', 'drive', 'serve'

    this.buildMesh();
    this.buildShadowBlob();
    this.buildTrail();
  }

  buildMesh() {
    this.group = new THREE.Group();

    // 1. Cork Base (Rounded hemisphere nose)
    const corkGeo = new THREE.SphereGeometry(0.04, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const corkMat = new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      roughness: 0.35,
      metalness: 0.1
    });
    this.cork = new THREE.Mesh(corkGeo, corkMat);
    this.cork.rotation.x = Math.PI; // Point forward
    this.cork.position.set(0, 0, 0.04);
    this.cork.castShadow = true;
    this.group.add(this.cork);

    // 2. Feather Skirt (Cone shape with open flare)
    const skirtGeo = new THREE.ConeGeometry(0.07, 0.11, 16, 1, true);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    this.skirt = new THREE.Mesh(skirtGeo, skirtMat);
    this.skirt.rotation.x = -Math.PI / 2;
    this.skirt.position.set(0, 0, -0.02);
    this.skirt.castShadow = true;
    this.group.add(this.skirt);

    // 3. Ribbon band ring (classic badminton skirt thread rings)
    const ringGeo = new THREE.TorusGeometry(0.05, 0.004, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x00e676 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 0, -0.015);
    this.group.add(ring);

    this.group.position.copy(this.position);
    this.scene.add(this.group);
  }

  buildShadowBlob() {
    // Projective floor shadow blob to help player judge 3D height
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
    // High-speed smash ribbon trail
    const trailCount = 14;
    this.trailPoints = [];
    for (let i = 0; i < trailCount; i++) {
      this.trailPoints.push(this.position.clone());
    }
    const trailGeo = new THREE.BufferGeometry().setFromPoints(this.trailPoints);
    this.trailMat = new THREE.LineBasicMaterial({
      color: 0x00e676,
      transparent: true,
      opacity: 0.7,
      linewidth: 3
    });
    this.trailLine = new THREE.Line(trailGeo, this.trailMat);
    this.scene.add(this.trailLine);
  }

  serve(serverSide, targetX = 0, targetZ = 0) {
    this.active = true;
    this.lastHitter = serverSide; // 'player' or 'ai'

    if (serverSide === 'player') {
      this.position.set(0.8, 1.1, 4.8);
      // Gentle high service arc towards AI's back court or short service line
      const dirZ = -1;
      const speed = 12.0;
      this.velocity.set((targetX - this.position.x) * 1.5, 6.2, -speed);
    } else {
      this.position.set(-0.8, 1.1, -4.8);
      const speed = 12.0;
      this.velocity.set((targetX - this.position.x) * 1.5, 6.2, speed);
    }

    this.shotType = 'serve';
    this.updateSpeedMetrics();
  }

  hit(shotType, hitter, dirTarget, power = 1.0) {
    this.active = true;
    this.lastHitter = hitter;
    this.shotType = shotType;

    const isPlayer = (hitter === 'player');
    const zDir = isPlayer ? -1 : 1;

    let targetZ, targetY, horizSpeed, upSpeed;

    switch (shotType) {
      case 'smash':
        // Fast, steep downward trajectory
        horizSpeed = (22 + Math.random() * 6) * power;
        upSpeed = -1.2 + (this.position.y - 2.5) * 1.2;
        targetZ = isPlayer ? -3.5 : 3.5;
        this.trailMat.color.setHex(0xff2a5f); // Red trail for smash
        break;

      case 'drop':
        // Soft drop right over the net
        horizSpeed = 8.5 * power;
        upSpeed = 2.4;
        targetZ = isPlayer ? -1.4 : 1.4;
        this.trailMat.color.setHex(0x00e676);
        break;

      case 'clear':
        // High defensive arc deep to back line
        horizSpeed = 16.0 * power;
        upSpeed = 9.5;
        targetZ = isPlayer ? -6.0 : 6.0;
        this.trailMat.color.setHex(0x00d2ff);
        break;

      case 'drive':
      default:
        // Flat fast shot
        horizSpeed = 17.0 * power;
        upSpeed = 1.6;
        targetZ = isPlayer ? -4.5 : 4.5;
        this.trailMat.color.setHex(0xffb703);
        break;
    }

    const dx = dirTarget.x - this.position.x;
    const dz = targetZ - this.position.z;
    const dist = Math.hypot(dx, dz);

    this.velocity.x = (dx / dist) * horizSpeed;
    this.velocity.y = upSpeed;
    this.velocity.z = (dz / dist) * horizSpeed;

    this.updateSpeedMetrics();
  }

  update(dt) {
    if (!this.active) return;

    // Clamp dt to avoid tunneling
    const delta = Math.min(dt, 0.04);

    // 1. Aerodynamic Drag: F_drag = -k * v * |v|
    const speed = this.velocity.length();
    const dragMag = this.dragCoeff * speed * speed;
    const dragForce = this.velocity.clone().normalize().multiplyScalar(-dragMag);

    this.velocity.addScaledVector(dragForce, delta);

    // 2. Gravity
    this.velocity.y += this.gravity * delta;

    // 3. Position update
    this.position.addScaledVector(this.velocity, delta);

    // Keep Three.js group synchronized
    this.group.position.copy(this.position);

    // 4. Shuttle orientation (Cork leads velocity vector)
    if (this.velocity.lengthSq() > 0.1) {
      const targetLook = this.position.clone().add(this.velocity);
      this.group.lookAt(targetLook);
    }

    // 5. Update ground shadow blob
    this.shadowBlob.position.x = this.position.x;
    this.shadowBlob.position.z = this.position.z;
    // Scale and fade shadow based on height
    const heightNorm = Math.max(0.1, 1 - this.position.y / 7);
    this.shadowBlob.scale.set(heightNorm, heightNorm, 1);
    this.shadowMat.opacity = Math.max(0.1, 0.5 * heightNorm);

    // 6. Update Trail
    this.trailPoints.unshift(this.position.clone());
    this.trailPoints.pop();
    this.trailLine.geometry.setFromPoints(this.trailPoints);

    this.updateSpeedMetrics();
  }

  updateSpeedMetrics() {
    // Convert m/s to km/h (speed * 3.6)
    // Multiply by realistic badminton factor for spectator realism
    const rawSpeedKmh = Math.round(this.velocity.length() * 3.6 * 2.8);
    this.currentSpeedKmh = Math.min(420, rawSpeedKmh);
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

