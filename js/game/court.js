/**
 * Smash Pro - 3D Badminton Court & Stadium Environment
 * Built with Three.js (1 Unit = 1 Meter)
 */

class BadmintonCourt {
  constructor(scene) {
    this.scene = scene;
    this.courtWidth = 6.1;       // Doubles width
    this.singlesWidth = 5.18;    // Singles width
    this.courtLength = 13.4;     // Full length
    this.halfLength = 6.7;
    this.netHeight = 1.55;       // At posts
    this.shortServiceDist = 1.98;// From net
    this.longServiceDoubles = 5.94; // 0.76m from back

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.theme = 'bwf-green'; // 'bwf-green', 'neon-cyber', 'wooden-classic'
    this.buildStadium();
    this.buildCourt();
    this.buildNet();
    this.setupLighting();
  }

  buildStadium() {
    // Outer Arena Floor (Wood / Dark Sports Hall)
    const floorGeo = new THREE.PlaneGeometry(36, 42);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090f1d,
      roughness: 0.6,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Stadium Wall Surrounding with BWF LED boards
    this.buildAdBoards();

    // Stadium Grandstand Silhouettes / Roof Truss
    this.buildStadiumStructure();
  }

  buildCourt() {
    // Regulation Court Mat
    const matGeo = new THREE.PlaneGeometry(this.courtWidth + 1.2, this.courtLength + 1.8);
    this.courtMatMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d5c3a, // BWF emerald green mat
      roughness: 0.75,
      metalness: 0.05
    });
    this.courtMesh = new THREE.Mesh(matGeo, this.courtMatMaterial);
    this.courtMesh.rotation.x = -Math.PI / 2;
    this.courtMesh.position.y = 0;
    this.courtMesh.receiveShadow = true;
    this.group.add(this.courtMesh);

    // Regulation Court Line Markings using dynamic canvas texture or line strips
    this.createCourtMarkings();
  }

  createCourtMarkings() {
    // Draw precise official BWF lines on a high-res canvas texture for crisp rendering
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');

    // Background court color
    ctx.fillStyle = '#0f6e45';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border padding
    const padX = 70;
    const padY = 90;
    const w = canvas.width - padX * 2;
    const h = canvas.height - padY * 2;

    const scaleX = w / this.courtWidth;
    const scaleY = h / this.courtLength;

    const toCanvasX = (x) => padX + (x + this.courtWidth / 2) * scaleX;
    const toCanvasY = (z) => padY + (z + this.courtLength / 2) * scaleY;

    // Line style (crisp 4cm regulation white lines)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.lineCap = 'square';

    // 1. Doubles boundary (Outer rectangle)
    ctx.strokeRect(toCanvasX(-this.courtWidth / 2), toCanvasY(-this.courtLength / 2), w, h);

    // 2. Singles sidelines
    const sLeft = toCanvasX(-this.singlesWidth / 2);
    const sRight = toCanvasX(this.singlesWidth / 2);
    ctx.beginPath();
    ctx.moveTo(sLeft, toCanvasY(-this.halfLength));
    ctx.lineTo(sLeft, toCanvasY(this.halfLength));
    ctx.moveTo(sRight, toCanvasY(-this.halfLength));
    ctx.lineTo(sRight, toCanvasY(this.halfLength));
    ctx.stroke();

    // 3. Short service lines (1.98m from net on both sides)
    const ssY1 = toCanvasY(-this.shortServiceDist);
    const ssY2 = toCanvasY(this.shortServiceDist);
    ctx.beginPath();
    ctx.moveTo(toCanvasX(-this.courtWidth / 2), ssY1);
    ctx.lineTo(toCanvasX(this.courtWidth / 2), ssY1);
    ctx.moveTo(toCanvasX(-this.courtWidth / 2), ssY2);
    ctx.lineTo(toCanvasX(this.courtWidth / 2), ssY2);
    ctx.stroke();

    // 4. Doubles long service lines (0.76m inside back boundary)
    const lsY1 = toCanvasY(-this.longServiceDoubles);
    const lsY2 = toCanvasY(this.longServiceDoubles);
    ctx.beginPath();
    ctx.moveTo(toCanvasX(-this.courtWidth / 2), lsY1);
    ctx.lineTo(toCanvasX(this.courtWidth / 2), lsY1);
    ctx.moveTo(toCanvasX(-this.courtWidth / 2), lsY2);
    ctx.lineTo(toCanvasX(this.courtWidth / 2), lsY2);
    ctx.stroke();

    // 5. Center lines (running from short service line to back boundary)
    const midX = toCanvasX(0);
    ctx.beginPath();
    // Opponent side
    ctx.moveTo(midX, toCanvasY(-this.halfLength));
    ctx.lineTo(midX, ssY1);
    // Player side
    ctx.moveTo(midX, ssY2);
    ctx.lineTo(midX, toCanvasY(this.halfLength));
    ctx.stroke();

    // 6. Net indicator line
    const netY = toCanvasY(0);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(toCanvasX(-this.courtWidth / 2), netY);
    ctx.lineTo(toCanvasX(this.courtWidth / 2), netY);
    ctx.stroke();

    const courtTexture = new THREE.CanvasTexture(canvas);
    courtTexture.anisotropy = 16;

    // Apply texture to court plane
    const planeGeo = new THREE.PlaneGeometry(this.courtWidth + 0.8, this.courtLength + 0.8);
    const planeMat = new THREE.MeshStandardMaterial({
      map: courtTexture,
      roughness: 0.65,
      metalness: 0.05
    });
    this.linesMesh = new THREE.Mesh(planeGeo, planeMat);
    this.linesMesh.rotation.x = -Math.PI / 2;
    this.linesMesh.position.y = 0.005; // slightly above mat
    this.linesMesh.receiveShadow = true;
    this.group.add(this.linesMesh);
  }

  buildNet() {
    const netGroup = new THREE.Group();

    // Net Posts (left and right)
    const postGeo = new THREE.CylinderGeometry(0.04, 0.04, this.netHeight, 16);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.8,
      roughness: 0.2
    });

    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-this.courtWidth / 2 - 0.05, this.netHeight / 2, 0);
    leftPost.castShadow = true;
    netGroup.add(leftPost);

    const rightPost = new THREE.Mesh(postGeo, postMat);
    rightPost.position.set(this.courtWidth / 2 + 0.05, this.netHeight / 2, 0);
    rightPost.castShadow = true;
    netGroup.add(rightPost);

    // Net Mesh (Semi-transparent with grid texture)
    const netCanvas = document.createElement('canvas');
    netCanvas.width = 128;
    netCanvas.height = 128;
    const nCtx = netCanvas.getContext('2d');
    nCtx.fillStyle = '#1e293b';
    nCtx.fillRect(0, 0, 128, 128);
    nCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    nCtx.lineWidth = 2;
    for (let i = 0; i < 128; i += 16) {
      nCtx.beginPath();
      nCtx.moveTo(i, 0); nCtx.lineTo(i, 128);
      nCtx.moveTo(0, i); nCtx.lineTo(128, i);
      nCtx.stroke();
    }
    const netTex = new THREE.CanvasTexture(netCanvas);
    netTex.wrapS = THREE.RepeatWrapping;
    netTex.wrapT = THREE.RepeatWrapping;
    netTex.repeat.set(32, 4);

    const netDepth = 0.76; // Net vertical span
    const netY = this.netHeight - netDepth / 2;
    const netMeshGeo = new THREE.PlaneGeometry(this.courtWidth + 0.1, netDepth);
    const netMeshMat = new THREE.MeshStandardMaterial({
      map: netTex,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    });
    const netPlane = new THREE.Mesh(netMeshGeo, netMeshMat);
    netPlane.position.set(0, netY, 0);
    netPlane.castShadow = true;
    netGroup.add(netPlane);

    // Top White Tape of Net (7.5cm width)
    const tapeGeo = new THREE.BoxGeometry(this.courtWidth + 0.12, 0.075, 0.03);
    const tapeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3
    });
    const topTape = new THREE.Mesh(tapeGeo, tapeMat);
    topTape.position.set(0, this.netHeight - 0.03, 0);
    topTape.castShadow = true;
    netGroup.add(topTape);

    this.group.add(netGroup);
    this.netTopY = this.netHeight;
  }

  buildAdBoards() {
    // LED Advertising Boards around court
    const adWidth = 14;
    const adHeight = 0.8;
    const adGeo = new THREE.BoxGeometry(adWidth, adHeight, 0.2);

    const createAdTexture = (text, bg, fg) => {
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = bg;
      x.fillRect(0, 0, 1024, 128);
      x.font = 'bold 44px sans-serif';
      x.fillStyle = fg;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(text, 512, 64);
      return new THREE.CanvasTexture(c);
    };

    const adTex1 = createAdTexture('✦ BWF WORLD TOUR ✦ SMASH PRO ESPORTS ARENA ✦', '#0f172a', '#00e676');
    const adTex2 = createAdTexture('GEMMA AI COACHING • MEDIAPIPE GESTURE ENGINE', '#090d16', '#00d2ff');

    const adMat1 = new THREE.MeshBasicMaterial({ map: adTex1 });
    const adMat2 = new THREE.MeshBasicMaterial({ map: adTex2 });

    // Far end board
    const boardFar = new THREE.Mesh(adGeo, adMat1);
    boardFar.position.set(0, adHeight / 2, -this.halfLength - 3.5);
    this.group.add(boardFar);

    // Near end board
    const boardNear = new THREE.Mesh(adGeo, adMat2);
    boardNear.position.set(0, adHeight / 2, this.halfLength + 3.5);
    this.group.add(boardNear);

    // Side boards
    const sideGeo = new THREE.BoxGeometry(this.courtLength + 4, adHeight, 0.2);
    const sideBoardLeft = new THREE.Mesh(sideGeo, adMat1);
    sideBoardLeft.rotation.y = Math.PI / 2;
    sideBoardLeft.position.set(-this.courtWidth / 2 - 2.8, adHeight / 2, 0);
    this.group.add(sideBoardLeft);

    const sideBoardRight = new THREE.Mesh(sideGeo, adMat2);
    sideBoardRight.rotation.y = -Math.PI / 2;
    sideBoardRight.position.set(this.courtWidth / 2 + 2.8, adHeight / 2, 0);
    this.group.add(sideBoardRight);
  }

  buildStadiumStructure() {
    // Atmospheric stadium stands / lights
    const standGeo = new THREE.BoxGeometry(32, 8, 10);
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x050914,
      roughness: 0.9
    });

    const standFar = new THREE.Mesh(standGeo, standMat);
    standFar.position.set(0, 4, -this.halfLength - 9);
    this.group.add(standFar);

    const standNear = new THREE.Mesh(standGeo, standMat);
    standNear.position.set(0, 4, this.halfLength + 9);
    this.group.add(standNear);
  }

  setupLighting() {
    // Ambient Light for soft fill
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);

    // Main Arena Overhead Floodlights (Badminton hall lighting)
    const light1 = new THREE.DirectionalLight(0xffffff, 1.2);
    light1.position.set(0, 12, 4);
    light1.castShadow = true;
    light1.shadow.mapSize.width = 2048;
    light1.shadow.mapSize.height = 2048;
    light1.shadow.camera.near = 0.5;
    light1.shadow.camera.far = 30;
    light1.shadow.camera.left = -8;
    light1.shadow.camera.right = 8;
    light1.shadow.camera.top = 10;
    light1.shadow.camera.bottom = -10;
    this.scene.add(light1);

    const light2 = new THREE.DirectionalLight(0xa5f3fc, 0.6);
    light2.position.set(0, 10, -5);
    this.scene.add(light2);

    // Accent Sports rim lights
    const rimLeft = new THREE.PointLight(0x00e676, 1.5, 20);
    rimLeft.position.set(-8, 6, 0);
    this.scene.add(rimLeft);

    const rimRight = new THREE.PointLight(0x00d2ff, 1.5, 20);
    rimRight.position.set(8, 6, 0);
    this.scene.add(rimRight);
  }

  setTheme(themeName) {
    this.theme = themeName;
    if (themeName === 'neon-cyber') {
      this.courtMatMaterial.color.setHex(0x050b18);
    } else if (themeName === 'wooden-classic') {
      this.courtMatMaterial.color.setHex(0xb45309);
    } else {
      this.courtMatMaterial.color.setHex(0x0d5c3a); // BWF green
    }
  }
}

