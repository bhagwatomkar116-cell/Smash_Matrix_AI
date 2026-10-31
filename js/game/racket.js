/**
 * Smash Pro - 3D Badminton Racket & Swing Kinematics
 * Carbon fiber frame, strung head, and smooth reactive swing animations
 */

class BadmintonRacket {
  constructor(scene, isPlayer = true) {
    this.scene = scene;
    this.isPlayer = isPlayer;

    this.position = new THREE.Vector3(0, 1.2, isPlayer ? 4.5 : -4.5);
    this.targetPos = this.position.clone();

    this.isSwinging = false;
    this.swingProgress = 0;
    this.swingType = 'clear'; // 'smash', 'drop', 'clear', 'drive'

    this.buildMesh();
  }

  buildMesh() {
    this.group = new THREE.Group();

    // Racket Materials
    const frameColor = this.isPlayer ? 0x00e676 : 0xff2a5f;
    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      metalness: 0.8,
      roughness: 0.2
    });

    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.9
    });

    // 1. Grip Handle
    const handleGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.22, 16);
    const handle = new THREE.Mesh(handleGeo, gripMat);
    handle.position.y = -0.35;
    this.group.add(handle);

    // 2. Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.35, 12);
    const shaft = new THREE.Mesh(shaftGeo, frameMat);
    shaft.position.y = -0.07;
    this.group.add(shaft);

    // 3. T-Joint
    const tJointGeo = new THREE.SphereGeometry(0.012, 12, 12);
    const tJoint = new THREE.Mesh(tJointGeo, frameMat);
    tJoint.position.y = 0.11;
    this.group.add(tJoint);

    // 4. Head Frame (Isometric Oval)
    const curve = new THREE.EllipseCurve(
      0, 0,            // ax, aY
      0.13, 0.17,      // xRadius, yRadius
      0, 2 * Math.PI,  // aStartAngle, aEndAngle
      false,           // aClockwise
      0                // aRotation
    );
    const points = curve.getPoints(36);
    const shape = new THREE.Shape(points);
    const frameExtrudeGeo = new THREE.TorusGeometry(0.14, 0.008, 12, 32);
    this.head = new THREE.Mesh(frameExtrudeGeo, frameMat);
    this.head.position.y = 0.26;
    this.head.scale.set(0.9, 1.15, 1.0); // badminton oval
    this.group.add(this.head);

    // 5. String Bed (Semi-transparent grid)
    const stringGeo = new THREE.CircleGeometry(0.135, 32);
    const stringMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.1
    });
    this.strings = new THREE.Mesh(stringGeo, stringMat);
    this.strings.position.y = 0.26;
    this.strings.scale.set(0.9, 1.15, 1.0);
    this.group.add(this.strings);

    this.group.position.copy(this.position);
    this.group.castShadow = true;
    this.scene.add(this.group);
  }

  swing(shotType = 'clear') {
    if (this.isSwinging) return;
    this.isSwinging = true;
    this.swingProgress = 0;
    this.swingType = shotType;

    if (window.BadmintonAudio) {
      if (shotType === 'smash') window.BadmintonAudio.playSmash();
      else if (shotType === 'drop') window.BadmintonAudio.playDrop();
      else window.BadmintonAudio.playHit();
      window.BadmintonAudio.playWhoosh();
    }
  }

  update(dt) {
    // Smooth movement interpolation toward target
    this.position.lerp(this.targetPos, 0.25);
    this.group.position.copy(this.position);

    // Dynamic Swing Animation Kinematics
    if (this.isSwinging) {
      this.swingProgress += dt * 6.5; // swing speed

      if (this.swingProgress < 1.0) {
        // Forward strike arc
        const p = this.swingProgress;
        const arc = Math.sin(p * Math.PI);

        if (this.swingType === 'smash') {
          // Overhead downward whip
          this.group.rotation.x = (this.isPlayer ? -1 : 1) * (arc * 1.6 - 0.4);
          this.group.rotation.z = Math.sin(p * Math.PI * 2) * 0.4;
        } else if (this.swingType === 'drop') {
          // Delicate slicing push
          this.group.rotation.x = (this.isPlayer ? -1 : 1) * (arc * 0.8);
          this.group.rotation.y = arc * 0.3;
        } else {
          // Clear / Drive forward follow-through
          this.group.rotation.x = (this.isPlayer ? -1 : 1) * (arc * 1.2);
          this.group.rotation.z = arc * 0.3;
        }
      } else {
        // Reset swing
        this.isSwinging = false;
        this.swingProgress = 0;
        this.group.rotation.set(0, 0, 0);
      }
    } else {
      // Idle ready stance tilt
      const idleTilt = this.isPlayer ? -0.2 : 0.2;
      this.group.rotation.x = idleTilt;
      this.group.rotation.y = 0;
      this.group.rotation.z = 0;
    }
  }

  // Get current world coordinate of racket sweet spot
  getSweetSpot() {
    const v = new THREE.Vector3(0, 0.26, 0);
    this.group.localToWorld(v);
    return v;
  }
}

