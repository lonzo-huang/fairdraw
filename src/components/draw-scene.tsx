import { useEffect, useRef } from "react";

export function DrawScene({ handle = "MirrortekUK", avatarUrl }: { handle?: string; avatarUrl: string }) {
  const host = useRef<HTMLDivElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let cleanup = () => {};
    import("three").then((T) => {
      if (disposed) return;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const css = getComputedStyle(element);
      const color = (token: string) => {
        if (!ctx) return new T.Color();
        ctx.fillStyle = css.getPropertyValue(token).trim(); ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return new T.Color().setRGB((r ?? 0) / 255, (g ?? 0) / 255, (b ?? 0) / 255, T.SRGBColorSpace);
      };
      let renderer: InstanceType<typeof T.WebGLRenderer>;
      try { renderer = new T.WebGLRenderer({ alpha: true, antialias: true }); } catch { return; }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
      element.appendChild(renderer.domElement);
      // Gold core, cyber shell: everything inside the glass stays gold, while the lid, base and
      // the ground under the box go back to neon blue/violet so the gold reads as the treasure.
      const gold = new T.Color().setRGB(1, 0.72, 0.18, T.SRGBColorSpace), white = color("--foreground"), violet = color("--cyber");
      const green = new T.Color().setRGB(1, 0.62, 0.12, T.SRGBColorSpace).multiplyScalar(1.6);
      const blue = new T.Color().setRGB(0.97, 0.86, 0.62, T.SRGBColorSpace);
      const cyberBlue = new T.Color().setRGB(0.11, 0.63, 0.95, T.SRGBColorSpace).multiplyScalar(1.4);
      const cyberViolet = new T.Color().setRGB(0.54, 0.17, 0.89, T.SRGBColorSpace).multiplyScalar(1.3);
      const obsidian = new T.Color().setRGB(0.05, 0.045, 0.04, T.SRGBColorSpace);
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(35, 1, 0.1, 80);
      camera.position.set(0, 1.8, 13); camera.lookAt(0, 0, 0);
      // High-contrast studio: near-black room with narrow bright strips, so polished gold shows sharp highlights instead of a flat wash.
      const studio = new T.Scene();
      studio.background = obsidian.clone();
      const softbox = (x: number, y: number, z: number, w: number, h: number, c: InstanceType<typeof T.Color>, strength: number) => {
        const panel = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c.clone().multiplyScalar(strength), side: T.DoubleSide }));
        panel.position.set(x, y, z); panel.lookAt(0, 0, 0); studio.add(panel);
      };
      const warmWhite = new T.Color().setRGB(1, 0.94, 0.82, T.SRGBColorSpace);
      softbox(-5, 3, 2, 1, 9, warmWhite, 9); softbox(5, 1, 2, 0.7, 9, warmWhite, 7); softbox(0, 6, 0, 8, 0.6, warmWhite, 8);
      softbox(2, -1, -5, 4, 1, gold, 4); softbox(-3, -4, -2, 2, 0.5, blue, 4);
      // Cool strips above and below so the anodised lid/base reflect neon instead of the warm room.
      softbox(-2, 3.4, -6, 7, 0.45, cyberBlue, 4); softbox(3, -4.6, -3, 6, 0.5, cyberViolet, 3.5);
      // Horizon strips: the camera meets the lid almost edge-on, so only low, far panels
      // reflect back into a flat top surface as visible streaks.
      softbox(0, -0.7, -9, 14, 0.35, warmWhite, 11); softbox(-7, -0.4, -5, 7, 0.3, cyberBlue, 8); softbox(6, -0.5, -6, 6, 0.3, cyberViolet, 7);
      const pmrem = new T.PMREMGenerator(renderer);
      const environment = pmrem.fromScene(studio, 0.01); scene.environment = environment.texture;
      scene.add(new T.AmbientLight(warmWhite, 0.15));
      for (const [x, y, z, c, power] of [[-3, 5, 5, warmWhite, 140], [5, 1, 3, blue, 60], [3, -2, 2, gold, 50], [-5, 4, -1.5, cyberBlue, 45], [5, -3.6, -2.5, cyberViolet, 32]] as const) {
        const light = new T.PointLight(c, power); light.position.set(x, y, z); scene.add(light);
      }
      const stage = new T.Group(); scene.add(stage);
      const vault = new T.Group(); stage.add(vault);
      const metal = new T.MeshPhysicalMaterial({ color: obsidian, metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2 });
      // Lid and base plate: dark anodised metal with a cool tint, so the neon comes from the trim
      // lines and the reflections rather than from flat coloured sheets.
      // Partly dielectric so the gold core's own light actually tints them warm instead of
      // leaving cold, disconnected slabs.
      const lidMetal = new T.MeshPhysicalMaterial({ color: new T.Color().setRGB(0.028, 0.045, 0.075, T.SRGBColorSpace), emissive: cyberBlue, emissiveIntensity: 0.05, metalness: 0.72, roughness: 0.17, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.6 });
      const baseMetal = new T.MeshPhysicalMaterial({ color: new T.Color().setRGB(0.045, 0.028, 0.075, T.SRGBColorSpace), emissive: cyberViolet, emissiveIntensity: 0.042, metalness: 0.7, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.6 });
      const lidGlow = new T.MeshBasicMaterial({ color: cyberBlue, toneMapped: false });
      const baseGlow = new T.MeshBasicMaterial({ color: cyberViolet, toneMapped: false });
      const glow = new T.MeshBasicMaterial({ color: green, toneMapped: false });
      const edgeGlow = new T.MeshBasicMaterial({ color: green, transparent: true, opacity: 0.72, toneMapped: false });
      const glassMaterial = new T.MeshPhysicalMaterial({ color: warmWhite, metalness: 0, roughness: 0.03, transmission: 0.97, thickness: 0.12, ior: 1.45, transparent: true, opacity: 0.12, envMapIntensity: 1, side: T.DoubleSide, depthWrite: false });
      vault.add(new T.Mesh(new T.BoxGeometry(2.7, 2.7, 2.7), glassMaterial));
      const rail = (x: number, y: number, z: number, w: number, h: number, d: number, mat: InstanceType<typeof T.Material> = metal) => {
        const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat); mesh.position.set(x, y, z); vault.add(mesh); return mesh;
      };
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        rail(a * 1.4, 0, b * 1.4, 0.11, 2.9, 0.11);
        rail(0, a * 1.4, b * 1.4, 2.9, 0.11, 0.11);
        rail(a * 1.4, b * 1.4, 0, 0.11, 0.11, 2.9);
        rail(a * 1.34, 0, b * 1.34, 0.027, 2.7, 0.027, edgeGlow);
        rail(0, a * 1.34, b * 1.34, 2.7, 0.027, 0.027, edgeGlow);
        rail(a * 1.34, b * 1.34, 0, 0.027, 0.027, 2.7, edgeGlow);
      }
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        const corner = new T.Mesh(new T.BoxGeometry(0.29, 0.29, 0.29), metal); corner.position.set(x * 1.4, y * 1.4, z * 1.4); vault.add(corner);
      }
      // Lid and base: grooved plates. The ribs give the near-edge-on camera many small facets to
      // catch light on, so the plates read as machined metal rather than flat coloured sheets.
      rail(0, 1.48, 0, 3.1, 0.15, 3.1, lidMetal);
      for (const z of [-1.15, -0.75, -0.35, 0.35, 0.75, 1.15]) rail(0, 1.575, z, 2.95, 0.04, 0.06, lidMetal);
      rail(0, 1.585, 0, 1.65, 0.03, 0.16, lidGlow);
      rail(0, -1.49, 0, 3.05, 0.18, 3.05, baseMetal);
      for (const z of [-1.15, -0.75, -0.35, 0.35, 0.75, 1.15]) rail(0, -1.375, z, 2.9, 0.04, 0.06, baseMetal);
      for (const z of [-1.05, -0.6, 0.6, 1.05]) rail(0, -1.6, z, 2.9, 0.04, 0.06, baseMetal);
      // Neon trims tracing the lid and base silhouettes.
      const trim = (y: number, half: number, t: number, mat: InstanceType<typeof T.Material>) => {
        rail(0, y, half, half * 2, t, t, mat); rail(0, y, -half, half * 2, t, t, mat);
        rail(half, y, 0, t, t, half * 2, mat); rail(-half, y, 0, t, t, half * 2, mat);
      };
      trim(1.565, 1.55, 0.03, lidGlow);
      trim(-1.585, 1.525, 0.032, baseGlow);
      const coinMaterial = new T.MeshPhysicalMaterial({ color: gold, emissive: gold, emissiveIntensity: 0.04, metalness: 1, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.2 });
      // Energy core: small coins ride two symmetric tilted orbits around one central coin.
      const coinCount = 16;
      const scatter = (i: number) => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
      const ringRadius = 0.98;
      const ringTilts = [new T.Quaternion().setFromEuler(new T.Euler(1.15, 0, 0.5)), new T.Quaternion().setFromEuler(new T.Euler(1.15, 0, -0.5))];
      const orbitPoint = new T.Vector3();
      const coinLayouts = Array.from({ length: coinCount }, (_, i) => ({ ring: i % 2, angle: Math.floor(i / 2) / (coinCount / 2) * Math.PI * 2 + (i % 2) * 0.39, scale: 0.42, phase: i * 0.7 }));
      for (const tilt of ringTilts) {
        const path = new T.Mesh(new T.TorusGeometry(ringRadius, 0.006, 6, 128), edgeGlow);
        path.quaternion.copy(tilt).multiply(new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0))); vault.add(path);
      }
      const diskGeometry = new T.CylinderGeometry(0.31, 0.31, 0.075, 32); diskGeometry.rotateX(Math.PI / 2);
      const rimGeometry = new T.TorusGeometry(0.264, 0.013, 6, 32);
      const barGeometry = new T.BoxGeometry(0.24, 0.028, 0.018), stemGeometry = new T.BoxGeometry(0.03, 0.2, 0.018);
      const parts: { mesh: InstanceType<typeof T.InstancedMesh>; offset: InstanceType<typeof T.Matrix4> }[] = [];
      const coinPart = (geometry: import("three").BufferGeometry<import("three").NormalBufferAttributes>, x = 0, y = 0, z = 0) => {
        const mesh = new T.InstancedMesh(geometry, coinMaterial, coinCount);
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false; vault.add(mesh);
        parts.push({ mesh, offset: new T.Matrix4().makeTranslation(x, y, z) });
      };
      coinPart(diskGeometry);
      for (const side of [-1, 1]) { coinPart(rimGeometry, 0, 0, side * 0.044); coinPart(barGeometry, 0, 0.08, side * 0.05); coinPart(stemGeometry, 0, 0, side * 0.05); }
      const coinTransform = new T.Object3D(), partMatrix = new T.Matrix4();
      const focusMaterial = new T.MeshPhysicalMaterial({ color: gold, emissive: gold, emissiveIntensity: 0.22, metalness: 1, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.4 });
      const focusCoin = new T.Group(); focusCoin.position.set(0, 0, 0); focusCoin.scale.setScalar(1.9); vault.add(focusCoin);
      const coreLight = new T.PointLight(green, 10, 3.5); vault.add(coreLight);
      focusCoin.add(new T.Mesh(diskGeometry, focusMaterial));
      for (const side of [-1, 1]) {
        const rim = new T.Mesh(new T.TorusGeometry(0.273, 0.022, 12, 96), focusMaterial); rim.position.z = side * 0.044; focusCoin.add(rim);
      }
      const avatarTexture = new T.TextureLoader().load(avatarUrl);
      avatarTexture.colorSpace = T.SRGBColorSpace;
      // A polished inset, not a billboard: the portrait catches the same studio highlights
      // as the gold rim and rotates with the whole coin on both sides.
      const avatarMaterial = new T.MeshPhysicalMaterial({ map: avatarTexture, color: warmWhite, metalness: 0.48, roughness: 0.13, clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.2 });
      for (const side of [-1, 1]) {
        const avatarFace = new T.Mesh(new T.CircleGeometry(0.235, 64), avatarMaterial);
        avatarFace.position.z = side * 0.059;
        avatarFace.rotation.y = side === -1 ? Math.PI : 0;
        focusCoin.add(avatarFace);
      }
      // Fine milled edge facets catch narrow specular strips during the turn.
      for (let i = 0; i < 64; i++) {
        const a = i / 64 * Math.PI * 2;
        const ridge = new T.Mesh(new T.BoxGeometry(0.008, 0.018, 0.065), focusMaterial);
        ridge.position.set(Math.cos(a) * 0.307, Math.sin(a) * 0.307, 0);
        ridge.rotation.z = a - Math.PI / 2; focusCoin.add(ridge);
      }
      const spinQuaternion = new T.Quaternion(), spinAxis = new T.Vector3(0, 1, 0);
      const parentQuaternion = new T.Quaternion();
      const screenCenter = new T.Vector3(), screenEdge = new T.Vector3();
      const focusOrbit = new T.Mesh(new T.TorusGeometry(0.57, 0.009, 6, 64), glow); focusOrbit.rotation.x = 0.7; focusCoin.add(focusOrbit);
      const dustCount = 96, dustPositions = new Float32Array(dustCount * 3);
      const dustGeometry = new T.BufferGeometry(); dustGeometry.setAttribute("position", new T.BufferAttribute(dustPositions, 3));
      const dustMaterial = new T.ShaderMaterial({
        uniforms: { tint: { value: green }, brightness: { value: 0.8 }, pixelRatio: { value: renderer.getPixelRatio() } },
        vertexShader: "uniform float pixelRatio; void main(){ vec4 p = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(25.0 * pixelRatio / -p.z, 1.5, 5.0); gl_Position = projectionMatrix * p; }",
        fragmentShader: "uniform vec3 tint; uniform float brightness; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if(d > 1.0) discard; gl_FragColor = vec4(tint, pow(1.0 - d, 1.6) * brightness); }",
        transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      });
      vault.add(new T.Points(dustGeometry, dustMaterial));
      // Warm bloom halo behind the central token (additive sprite, no post-processing pass).
      const haloCanvas = document.createElement("canvas"); haloCanvas.width = haloCanvas.height = 128;
      const hctx = haloCanvas.getContext("2d");
      if (hctx) { const g = hctx.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(255,214,130,0.95)"); g.addColorStop(0.25, "rgba(255,170,50,0.45)"); g.addColorStop(1, "rgba(255,140,20,0)"); hctx.fillStyle = g; hctx.fillRect(0, 0, 128, 128); }
      const haloTexture = new T.CanvasTexture(haloCanvas); haloTexture.colorSpace = T.SRGBColorSpace;
      const halo = new T.Sprite(new T.SpriteMaterial({ map: haloTexture, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
      halo.position.set(0, 0, -0.1); halo.renderOrder = -1; vault.add(halo);
      // God-rays emitted by the central coin: rays start dim at the core (weak inside the box)
      // and brighten as they spill past the vault edges. One canvas-textured plane, no post-processing.
      const rayCanvas = document.createElement("canvas"); rayCanvas.width = rayCanvas.height = 512;
      const rctx = rayCanvas.getContext("2d");
      if (rctx) {
        const cx = 256, cy = 256;
        const inner = 92; // ~ radius of the vault on this plane: keep the glow faint inside the box
        // Radial burst without visible spikes: many wide, low-alpha rays overlap, then a blur pass fuses them.
        for (let i = 0; i < 72; i++) {
          const a = (i / 72) * Math.PI * 2 + scatter(i + 900) * 0.05;
          const len = 200 + scatter(i + 950) * 56;
          const x0 = cx + Math.cos(a) * inner, y0 = cy + Math.sin(a) * inner;
          const x1 = cx + Math.cos(a) * len, y1 = cy + Math.sin(a) * len;
          const grad = rctx.createLinearGradient(x0, y0, x1, y1);
          const alpha = 0.09 + scatter(i + 1000) * 0.09;
          grad.addColorStop(0, `rgba(255,205,110,${alpha * 0.4})`);
          grad.addColorStop(0.4, `rgba(255,195,95,${alpha})`);
          grad.addColorStop(1, "rgba(255,150,40,0)");
          rctx.strokeStyle = grad; rctx.lineWidth = 12 + scatter(i + 1050) * 14; rctx.lineCap = "round";
          rctx.beginPath(); rctx.moveTo(x0, y0); rctx.lineTo(x1, y1); rctx.stroke();
        }
        // Blur pass: redraw the canvas onto itself so individual rays melt into one radiant burst.
        rctx.filter = "blur(7px)";
        rctx.drawImage(rayCanvas, 0, 0);
        rctx.filter = "none";
        // Soft bloom ring just outside the box silhouette.
        const rim = rctx.createRadialGradient(cx, cy, inner * 0.7, cx, cy, 250);
        rim.addColorStop(0, "rgba(255,210,120,0.06)");
        rim.addColorStop(0.3, "rgba(255,208,115,0.3)");
        rim.addColorStop(0.6, "rgba(255,185,80,0.14)");
        rim.addColorStop(1, "rgba(255,150,40,0)");
        rctx.fillStyle = rim; rctx.fillRect(0, 0, 512, 512);
      }
      const rayTexture = new T.CanvasTexture(rayCanvas); rayTexture.colorSpace = T.SRGBColorSpace;
      const rays = new T.Mesh(
        new T.PlaneGeometry(11.5, 11.5),
        new T.MeshBasicMaterial({ map: rayTexture, transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, side: T.DoubleSide }),
      );
      // The plane sits 2.2 units behind the vault; with the raised camera, a plane at y=0 would
      // project above the box. y=-0.3 puts the glow's center exactly on the vault's center on screen.
      rays.renderOrder = -3; stage.add(rays);
      // Each frame the plane is placed on the camera ray through the big T coin, so its center always sits exactly behind the coin on screen.
      const coinWorld = new T.Vector3(), rayWorld = new T.Vector3();
      const alignRays = () => {
        scene.updateMatrixWorld(); focusCoin.getWorldPosition(coinWorld);
        const d = coinWorld.distanceTo(camera.position);
        rayWorld.copy(coinWorld).sub(camera.position).multiplyScalar((d + 2.6) / d).add(camera.position);
        rays.position.copy(stage.worldToLocal(rayWorld));
      };
      // Twinkling golden glints floating inside the glass.
      const glintCount = 70, glintPos = new Float32Array(glintCount * 3), glintPhase = new Float32Array(glintCount);
      for (let i = 0; i < glintCount; i++) { glintPos[i * 3] = (scatter(i + 500) - 0.5) * 2.4; glintPos[i * 3 + 1] = (scatter(i + 600) - 0.5) * 2.4; glintPos[i * 3 + 2] = (scatter(i + 700) - 0.5) * 2.4; glintPhase[i] = scatter(i + 800) * 6.28; }
      const glintGeometry = new T.BufferGeometry(); glintGeometry.setAttribute("position", new T.BufferAttribute(glintPos, 3)); glintGeometry.setAttribute("phase", new T.BufferAttribute(glintPhase, 1));
      const glintMaterial = new T.ShaderMaterial({
        uniforms: { time: { value: 0 }, tint: { value: new T.Color().setRGB(1, 0.85, 0.5) }, pixelRatio: { value: renderer.getPixelRatio() } },
        vertexShader: "uniform float time; uniform float pixelRatio; attribute float phase; varying float vTw; void main(){ vec4 p = modelViewMatrix * vec4(position, 1.0); vTw = pow(max(0.0, sin(time * 2.2 + phase * 3.0)), 6.0); gl_PointSize = (2.0 + vTw * 14.0) * pixelRatio * 8.0 / -p.z; gl_Position = projectionMatrix * p; }",
        fragmentShader: "uniform vec3 tint; varying float vTw; void main(){ vec2 c = gl_PointCoord - 0.5; float core = smoothstep(0.5, 0.0, length(c)); float star = max(smoothstep(0.06, 0.0, abs(c.x)) * smoothstep(0.5, 0.0, abs(c.y)), smoothstep(0.06, 0.0, abs(c.y)) * smoothstep(0.5, 0.0, abs(c.x))); float a = (pow(core, 3.0) * 0.6 + star * vTw) * (0.25 + vTw); gl_FragColor = vec4(tint * (1.0 + vTw), a); }",
        transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      });
      const glints = new T.Points(glintGeometry, glintMaterial); vault.add(glints);
      const orbit = new T.Group(); stage.add(orbit);
      for (let i = 0; i < 3; i++) {
        const ring = new T.Mesh(new T.TorusGeometry(2.35 + i * 0.35, 0.012, 8, 120, Math.PI * (1.3 + i * 0.2)), new T.MeshBasicMaterial({ color: i === 1 ? cyberViolet : cyberBlue, transparent: true, opacity: 0.4 - i * 0.1 }));
        ring.rotation.x = Math.PI / 2; ring.rotation.z = i * 1.7; ring.position.y = -2; orbit.add(ring);
      }
      const pulses = Array.from({ length: 3 }, (_, i) => {
        const material = new T.MeshBasicMaterial({ color: i === 1 ? cyberViolet : cyberBlue, transparent: true, opacity: 0.2, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
        const ring = new T.Mesh(new T.RingGeometry(0.98, 1, 96), material);
        ring.rotation.x = -Math.PI / 2; ring.position.y = -2.04; stage.add(ring); return ring;
      });
      // Warm bounce under the box: the gold core lights the cyber floor it floats over.
      const bounceCanvas = document.createElement("canvas"); bounceCanvas.width = bounceCanvas.height = 256;
      const bctx = bounceCanvas.getContext("2d");
      // The bright part of the pool has to fall just outside the base plate's footprint, since
      // everything directly under the box is hidden behind that plate from this camera angle.
      if (bctx) { const g = bctx.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, "rgba(255,180,70,0.45)"); g.addColorStop(0.42, "rgba(255,172,62,0.9)"); g.addColorStop(0.62, "rgba(255,150,45,0.5)"); g.addColorStop(1, "rgba(255,130,30,0)"); bctx.fillStyle = g; bctx.fillRect(0, 0, 256, 256); }
      const bounceTexture = new T.CanvasTexture(bounceCanvas); bounceTexture.colorSpace = T.SRGBColorSpace;
      const bounce = new T.Mesh(new T.PlaneGeometry(10, 10), new T.MeshBasicMaterial({ map: bounceTexture, transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
      bounce.rotation.x = -Math.PI / 2; bounce.position.y = -1.95; bounce.renderOrder = -2; stage.add(bounce);
      // Warm spill pooling out from under the box: a camera-facing glow, so the opaque base
      // plate can never clip it the way it clips the flat floor ring.
      const spill = new T.Sprite(new T.SpriteMaterial({ map: haloTexture, transparent: true, opacity: 0.48, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
      spill.scale.set(7.5, 2.8, 1); spill.position.set(0, -1.62, 0.7); spill.renderOrder = -1; stage.add(spill);
      const particleCount = 380;
      const positions = new Float32Array(particleCount * 3), origins = new Float32Array(particleCount * 3);
      for (let i = 0; i < positions.length; i += 3) { positions[i] = (Math.random() - 0.5) * 22; positions[i + 1] = (Math.random() - 0.5) * 9; positions[i + 2] = -Math.random() * 7; }
      origins.set(positions);
      const geometry = new T.BufferGeometry(); geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
      const particles = new T.Points(geometry, new T.PointsMaterial({ color: cyberBlue, size: 0.025, transparent: true, opacity: 0.6 })); scene.add(particles);
      let pointerX = 0, pointerY = 0, frame = 0;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const parent = element.parentElement;
      const pointer = (e: PointerEvent) => { if (reduced || e.pointerType === "touch") return; const bounds = element.getBoundingClientRect(); pointerX = (e.clientX - bounds.left) / bounds.width - 0.5; pointerY = (e.clientY - bounds.top) / bounds.height - 0.5; };
      const reset = () => { pointerX = 0; pointerY = 0; };
      parent?.addEventListener("pointermove", pointer); parent?.addEventListener("pointerleave", reset);
      const resize = () => {
        const w = element.clientWidth, h = element.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
        stage.position.x = w > 700 ? 2.7 : 0; stage.scale.setScalar(w > 700 ? 1.18 : 0.85);
      };
      const observer = new ResizeObserver(resize); observer.observe(element); resize();
      const animate = (time: number) => {
        const t = reduced ? 0 : time * 0.001;
        vault.rotation.y += ((-0.55 + Math.sin(t * 0.25) * 0.15 + pointerX * 0.45) - vault.rotation.y) * 0.04;
        vault.rotation.x += ((0.12 + pointerY * 0.18) - vault.rotation.x) * 0.04;
        vault.position.y = Math.sin(t * 0.9) * 0.12;
        coinLayouts.forEach((coin, i) => {
          const a = coin.angle + t * 0.35 * (coin.ring ? -1 : 1);
          orbitPoint.set(Math.cos(a) * ringRadius, 0, Math.sin(a) * ringRadius).applyQuaternion(ringTilts[coin.ring] ?? new T.Quaternion());
          coinTransform.position.copy(orbitPoint);
          coinTransform.rotation.set(0, coin.phase + t * 0.8, 0);
          coinTransform.scale.setScalar(coin.scale); coinTransform.updateMatrix();
          parts.forEach(({ mesh, offset }) => { partMatrix.multiplyMatrices(coinTransform.matrix, offset); mesh.setMatrixAt(i, partMatrix); });
        });
        parts.forEach(({ mesh }) => { mesh.instanceMatrix.needsUpdate = true; });
        vault.updateWorldMatrix(true, false); vault.getWorldQuaternion(parentQuaternion);
        spinQuaternion.setFromAxisAngle(spinAxis, t * 0.52);
        focusCoin.quaternion.copy(parentQuaternion.invert()).multiply(camera.quaternion).multiply(spinQuaternion);
        focusCoin.position.y = Math.sin(t * 0.8) * 0.03;
        focusOrbit.rotation.z = t * 0.22;
        focusMaterial.emissiveIntensity = 0.22 + Math.sin(t * 1.3) * 0.06;
        halo.material.opacity = 0.75 + Math.sin(t * 1.3) * 0.15; halo.scale.setScalar(2.6 + Math.sin(t * 1.3) * 0.12);
        rays.rotation.z = t * 0.06;
        rays.material.opacity = 0.68 + Math.sin(t * 0.9) * 0.14;
        rays.scale.setScalar(1 + Math.sin(t * 0.9) * 0.04);
        edgeGlow.opacity = 0.7 + Math.sin(t * 1.6) * 0.13;
        pulses.forEach((ring, i) => { const phase = (t * 0.23 + i / 3) % 1; ring.scale.setScalar(1.65 + phase * 1.5); ring.material.opacity = Math.sin(phase * Math.PI) * 0.26; });
        bounce.material.opacity = 0.8 + Math.sin(t * 1.1) * 0.16;
        spill.material.opacity = 0.42 + Math.sin(t * 1.1) * 0.12;
        for (let i = 0; i < dustCount; i++) {
          const ring = i % 2, a = (i / dustCount) * Math.PI * 2 * 2 + t * 0.5 * (ring ? -1 : 1);
          const r = ringRadius + (scatter(i + 260) - 0.5) * 0.08;
          orbitPoint.set(Math.cos(a) * r, (scatter(i + 360) - 0.5) * 0.05, Math.sin(a) * r).applyQuaternion(ringTilts[ring] ?? new T.Quaternion());
          dustPositions[i * 3] = orbitPoint.x; dustPositions[i * 3 + 1] = orbitPoint.y; dustPositions[i * 3 + 2] = orbitPoint.z;
        }
        dustGeometry.getAttribute("position").needsUpdate = true;
        if (glintMaterial.uniforms["time"]) glintMaterial.uniforms["time"].value = t;
        glints.rotation.y = t * 0.05;
        orbit.rotation.y = t * 0.07;
        for (let i = 0; i < particleCount; i++) {
          const k = i * 3, x = origins[k] ?? 0, y = origins[k + 1] ?? 0;
          const dx = x - pointerX * 18, dy = y + pointerY * 8, dist = Math.sqrt(dx * dx + dy * dy);
          const force = reduced ? 0 : Math.max(0, 2 - dist) * 0.5;
          positions[k] = x + dx * force; positions[k + 1] = y + dy * force + Math.sin(t * 0.3 + i) * 0.04;
        }
        const attribute = geometry.getAttribute("position");
        attribute.needsUpdate = true;
        alignRays(); renderer.render(scene, camera);
        const target = link.current;
        if (target) {
          focusCoin.getWorldPosition(screenCenter); screenCenter.project(camera);
          focusCoin.getWorldPosition(screenEdge); screenEdge.addScaledVector(new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), 0.31 * 1.9 * stage.scale.x); screenEdge.project(camera);
          const size = Math.max(24, Math.abs(screenEdge.x - screenCenter.x) * element.clientWidth);
          target.style.left = `${(screenCenter.x + 1) / 2 * element.clientWidth}px`;
          target.style.top = `${(1 - screenCenter.y) / 2 * element.clientHeight}px`;
          target.style.width = `${size}px`; target.style.height = `${size}px`;
        }
        element.dataset["sceneReady"] = "true"; element.dataset["coinRotation"] = String(reduced ? 0 : t * 0.52); element.dataset["coinCount"] = String(coinCount + 1); frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
      cleanup = () => {
        cancelAnimationFrame(frame); observer.disconnect(); parent?.removeEventListener("pointermove", pointer); parent?.removeEventListener("pointerleave", reset);
        for (const root of [scene, studio]) root.traverse((object) => { if (object instanceof T.Mesh || object instanceof T.Points) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((m) => m.dispose()); } });
        avatarTexture.dispose(); haloTexture.dispose(); rayTexture.dispose(); bounceTexture.dispose();
        environment.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
        delete element.dataset["sceneReady"]; delete element.dataset["coinCount"]; delete element.dataset["coinRotation"];
      };
    });
    return () => { disposed = true; cleanup(); };
  }, [avatarUrl]);
  return <div ref={host} className="draw-scene"><a ref={link} className="coin-profile-link" href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer" aria-label={`@${handle}`} title={`@${handle}`} /></div>;
}
