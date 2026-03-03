// OfficeChat.tsx
// Drop into your Vite + TypeScript + ShadCN project.
// Peer deps: three, @types/three
// ShadCN components used: Card, ScrollArea, Input, Button, Badge
//
// Usage:
//   <OfficeChat currentUserEmail="taryn@merchanthaus.io" />
//
// Wire up:
//   - Replace `mockMessages` / `sendMessage` with your real CRM chat API
//   - Replace `USERS[x].online` with live presence from your backend
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── TYPES ─────────────────────────────────────────────────────────────────────

export interface CRMUser {
  email: string;
  name: string;
  title: string;
  shirtColor: number;
  hairColor: number;
  skinColor: number;
  scale?: number;
  beard?: boolean;
  beardColor?: number;
  stubble?: boolean;
  stubbleColor?: number;
  hairstyle?: "bob" | "default";
  prostheticLeg?: boolean;
  /** Controlled externally — swap with live presence */
  online?: boolean;
}

export interface ChatMessage {
  id: string;
  fromEmail: string;
  toEmail: string;
  body: string;
  timestamp: Date;
}

interface OfficeChatProps {
  /** Email of the authenticated user */
  currentUserEmail: string;
  /**
   * Provide real messages from your CRM here.
   * Re-render with updated array to refresh the panel.
   */
  messages?: ChatMessage[];
  /**
   * Called when the user sends a message.
   * Integrate with your CRM send endpoint here.
   */
  onSendMessage?: (to: string, body: string) => void;
  /**
   * Map of email → online status from your presence system.
   * Falls back to `true` for everyone if omitted.
   */
  presence?: Record<string, boolean>;
}

// ── USER DEFINITIONS ──────────────────────────────────────────────────────────

const USERS: CRMUser[] = [
  {
    email: "taryn@merchanthaus.io",
    name: "Taryn",
    title: "Operations",
    shirtColor: 0xe05a2b,
    hairColor: 0x3a1a08,
    skinColor: 0xffcba8,
    hairstyle: "bob",
    scale: 1.0,
  },
  {
    email: "admin@merchanthaus.io",
    name: "Jamie",
    title: "Admin",
    shirtColor: 0x3a7bd5,
    hairColor: 0xd4b96a,
    skinColor: 0xffe0bb,
    stubble: true,
    stubbleColor: 0xc8aa70,
    scale: 1.0,
  },
  {
    email: "sales@merchanthaus.io",
    name: "Dylan",
    title: "Sales",
    shirtColor: 0x2eaa5e,
    hairColor: 0x1a3a1a,
    skinColor: 0xffdbac,
    prostheticLeg: true,
    scale: 1.15,
  },
  {
    email: "support@merchanthaus.io",
    name: "Sheiky",
    title: "Support",
    shirtColor: 0x9b30d0,
    hairColor: 0x2a1a40,
    skinColor: 0xd4a574,
    beard: true,
    beardColor: 0x9a9a9a,
    scale: 1.08,
  },
  {
    email: "darryn@merchanthaus.io",
    name: "Darryn",
    title: "Dev",
    shirtColor: 0xd03060,
    hairColor: 0x3a1010,
    skinColor: 0xffdbac,
    scale: 1.0,
  },
];

// ── SPAWN POSITIONS ───────────────────────────────────────────────────────────

const SPAWN: Record<string, THREE.Vector3> = {
  "taryn@merchanthaus.io":   new THREE.Vector3(-2.5, 0, -1),
  "admin@merchanthaus.io":   new THREE.Vector3(0,    0, -1),
  "sales@merchanthaus.io":   new THREE.Vector3(2.5,  0, -1),
  "support@merchanthaus.io": new THREE.Vector3(-1.5, 0,  3),
  "darryn@merchanthaus.io":  new THREE.Vector3(1.5,  0,  3),
};

// ── THREE HELPERS ─────────────────────────────────────────────────────────────

const ROOM = 5.5; // half-extent of room
const INTERACT_DIST = 2.2;

function buildCharacterMesh(user: CRMUser, isPlayer: boolean): THREE.Group {
  const g = new THREE.Group();
  const s = user.scale ?? 1;

  const skin  = new THREE.MeshStandardMaterial({ color: user.skinColor });
  const shirt = new THREE.MeshStandardMaterial({ color: user.shirtColor });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
  const hair  = new THREE.MeshStandardMaterial({ color: user.hairColor });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.3, metalness: 0.8 });
  const carbon= new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 });

  // Legs
  if (user.prostheticLeg) {
    // Natural right leg
    const rl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), pants);
    rl.position.set(0.15, 0.4, 0); rl.castShadow = true; g.add(rl);
    // Prosthetic left
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.4, 8), pants);
    upper.position.set(-0.15, 0.6, 0); upper.castShadow = true; g.add(upper);
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.38, 8), metal);
    pylon.position.set(-0.15, 0.26, 0); pylon.castShadow = true; g.add(pylon);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), metal);
    knee.position.set(-0.15, 0.42, 0); g.add(knee);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.28), carbon);
    blade.position.set(-0.15, 0.07, 0.06); g.add(blade);
  } else {
    ([-0.15, 0.15] as number[]).forEach(x => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), pants);
      leg.position.set(x, 0.4, 0); leg.castShadow = true; g.add(leg);
    });
  }

  // Torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.8, 8), shirt);
  torso.position.y = 0.6; torso.castShadow = true; g.add(torso);

  // Arms
  const lA = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6), shirt);
  lA.position.set(-0.32, 0.7, 0); lA.rotation.z = Math.PI / 8; lA.castShadow = true; g.add(lA);
  const rA = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6), shirt);
  rA.position.set(0.32, 0.7, 0); rA.rotation.z = -Math.PI / 8; rA.castShadow = true; g.add(rA);
  g.userData.leftArm = lA;
  g.userData.rightArm = rA;

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.25; head.castShadow = true; g.add(head);

  // Hair
  if (user.hairstyle === "bob") {
    const bobMat = hair;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), bobMat);
    cap.position.y = 1.36; cap.scale.y = 0.55; g.add(cap);
    const side = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 8), bobMat);
    side.position.y = 1.18; side.scale.set(1.15, 0.7, 1.05); g.add(side);
    const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.22, 10), bobMat);
    bk.position.set(0, 1.05, -0.03); g.add(bk);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), bobMat);
    bun.position.set(0, 1.08, -0.27); g.add(bun);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    band.position.set(0, 1.08, -0.27); band.rotation.x = Math.PI / 2; g.add(band);
  } else {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), hair);
    h.position.y = 1.36; h.scale.y = 0.55; g.add(h);
  }

  // Eyes
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x111111 });
  ([-0.08, 0.08] as number[]).forEach(x => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), eyeM);
    e.position.set(x, 1.25, 0.22); g.add(e);
  });

  // Beard / stubble
  if (user.beard) {
    const bMat = new THREE.MeshStandardMaterial({ color: user.beardColor ?? 0x555555, roughness: 0.9 });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), bMat);
    b.position.set(0, 1.1, 0.18); b.scale.set(1, 0.55, 0.7); g.add(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), bMat);
    m.position.set(0, 1.19, 0.24); g.add(m);
  }
  if (user.stubble) {
    const sMat = new THREE.MeshStandardMaterial({ color: user.stubbleColor ?? 0xc8b89a, roughness: 1 });
    const st = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), sMat);
    st.position.set(0, 1.1, 0.19); st.scale.set(1, 0.45, 0.65); g.add(st);
  }

  // "YOU" indicator ring for the player
  if (isPlayer) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.04, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.6 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
  }

  // Name label sprite
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "rgba(20,20,20,0.85)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = isPlayer ? "#ffd700" : "#ffffff";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "center";
  ctx.fillText(isPlayer ? `${user.name} (You)` : user.name, 128, 24);
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "14px Arial";
  ctx.fillText(user.title, 128, 46);
  const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv) }));
  lbl.position.y = 1.9 / s;
  lbl.scale.set(2.2 / s, 0.6 / s, 1);
  g.add(lbl);

  g.scale.setScalar(s);
  return g;
}

function buildRoom(): THREE.Group {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0x2e2e2e, roughness: 0.85 });
  const winG  = new THREE.MeshStandardMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.35 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x0a0a0a });
  const wood  = new THREE.MeshStandardMaterial({ color: 0x9b7a4a, roughness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.3, metalness: 0.8 });
  const dark  = new THREE.MeshStandardMaterial({ color: 0x111111 });

  const addPlane = (w: number, h: number, x: number, y: number, z: number, ry = 0, mat = wall) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m);
  };

  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshStandardMaterial({ color: 0xe8e0d4, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const t1 = new THREE.MeshStandardMaterial({ color: 0xf2ece4 });
  const t2 = new THREE.MeshStandardMaterial({ color: 0xe4ddd4 });
  for (let x = -5; x < 6; x += 2) for (let z = -5; z < 6; z += 2) {
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ((x + z) / 2) % 2 === 0 ? t1 : t2);
    tile.position.set(x + 1, 0.01, z + 1); tile.rotation.x = -Math.PI / 2; g.add(tile);
  }

  // Walls
  addPlane(11, 5, 0, 2.5, -5.5);
  addPlane(11, 5, -5.5, 2.5, 0, Math.PI / 2);
  addPlane(11, 5,  5.5, 2.5, 0, -Math.PI / 2);
  addPlane(11, 5, 0, 2.5,  5.5, Math.PI);

  // Windows
  ([-2, 2] as number[]).forEach(x => {
    addPlane(2, 1.4, x, 2.8, -5.45, 0, winG);
    ([1.1, -1.1] as number[]).forEach(oy => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.07, 0.05), frame);
      b.position.set(x, 2.8 + oy * 0.5, -5.42); g.add(b);
    });
    ([-1.15, 1.15] as number[]).forEach(ox => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.5, 0.05), frame);
      b.position.set(x + ox, 2.8, -5.42); g.add(b);
    });
  });

  // Whiteboard
  const wb = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.4, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
  wb.position.set(0, 2.2, -5.4); g.add(wb);

  // Desks
  const makeDesk = (x: number, z: number) => {
    const dg = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 1.2), wood);
    top.position.y = 0.75; top.castShadow = true; top.receiveShadow = true; dg.add(top);
    ([-1.05, 1.05] as number[]).forEach(lx => ([-0.55, 0.55] as number[]).forEach(lz => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), metal);
      leg.position.set(lx, 0.35, lz); leg.castShadow = true; dg.add(leg);
    }));
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.05), dark);
    screen.position.set(0, 1.25, 0); dg.add(screen);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.14), metal);
    kb.position.set(0, 0.81, 0.25); dg.add(kb);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
    seat.position.set(0, 0.5, 0.75); dg.add(seat);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.06), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
    bk.position.set(0, 0.8, 0.98); dg.add(bk);
    dg.position.set(x, 0, z);
    return dg;
  };

  g.add(makeDesk(-2.5, -3), makeDesk(0, -3), makeDesk(2.5, -3), makeDesk(-1.5, 1.5), makeDesk(1.5, 1.5));

  // Plants
  ([[-4.5, -4.5], [4.5, -4.5], [0, 4.5]] as [number, number][]).forEach(([px, pz]) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x7a4f2a }));
    pot.position.set(px, 0.15, pz); g.add(pot);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), new THREE.MeshStandardMaterial({ color: 0x2d7a2d }));
    leaves.position.set(px, 0.65, pz); g.add(leaves);
  });

  return g;
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export default function OfficeChat({
  currentUserEmail,
  messages = [],
  onSendMessage,
  presence = {},
}: OfficeChatProps) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const stateRef   = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    playerMesh: THREE.Group;
    npcMeshes: Map<string, THREE.Group>;
    yaw: number;
    pitch: number;
    locked: boolean;
    keys: Set<string>;
    playerPos: THREE.Vector3;
    raf: number;
    onlineIndicators: Map<string, THREE.Mesh>;
  } | null>(null);

  const [activeChat, setActiveChat] = useState<CRMUser | null>(null);
  const [inputVal,   setInputVal]   = useState("");
  const [locked,     setLocked]     = useState(false);
  const [nearby,     setNearby]     = useState<CRMUser | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentUser = USERS.find(u => u.email === currentUserEmail)!;
  const others      = USERS.filter(u => u.email !== currentUserEmail);

  // Scroll chat to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, activeChat]);

  // ── THREE SETUP ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current || !currentUser) return;

    const W = mountRef.current.clientWidth;
    const H = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 6, 18);

    const camera = new THREE.PerspectiveCamera(70, W / H, 0.1, 100);
    camera.position.set(
      SPAWN[currentUserEmail].x,
      1.6,
      SPAWN[currentUserEmail].z + 1.5
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xfff8f0, 0.7);
    sun.position.set(4, 10, 4); sun.castShadow = true; scene.add(sun);

    scene.add(buildRoom());

    // Player mesh
    const playerMesh = buildCharacterMesh(currentUser, true);
    playerMesh.position.copy(SPAWN[currentUserEmail]);
    scene.add(playerMesh);

    // NPC meshes + online indicators
    const npcMeshes = new Map<string, THREE.Group>();
    const onlineIndicators = new Map<string, THREE.Mesh>();

    others.forEach(u => {
      const mesh = buildCharacterMesh(u, false);
      mesh.position.copy(SPAWN[u.email]);
      scene.add(mesh);
      npcMeshes.set(u.email, mesh);

      // Online/offline dot above head
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x22cc44, emissive: 0x22cc44, emissiveIntensity: 1 })
      );
      dot.position.set(0, 2.1 / (u.scale ?? 1), 0);
      mesh.add(dot);
      onlineIndicators.set(u.email, dot);
    });

    const state = {
      renderer, scene, camera, playerMesh, npcMeshes,
      yaw: 0, pitch: 0, locked: false,
      keys: new Set<string>(),
      playerPos: SPAWN[currentUserEmail].clone(),
      raf: 0,
      onlineIndicators,
    };
    stateRef.current = state;

    // Pointer lock
    renderer.domElement.addEventListener("click", () => {
      if (!activeChat) renderer.domElement.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      state.locked = document.pointerLockElement === renderer.domElement;
      setLocked(state.locked);
    });
    document.addEventListener("mousemove", (e) => {
      if (!state.locked) return;
      state.yaw   -= e.movementX * 0.002;
      state.pitch  = Math.max(-1.1, Math.min(1.1, state.pitch - e.movementY * 0.002));
    });

    // Keys
    const onDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      state.keys.add(e.key.toLowerCase());
      if (e.key === "Escape") {
        document.exitPointerLock();
        setActiveChat(null);
      }
    };
    const onUp = (e: KeyboardEvent) => state.keys.delete(e.key.toLowerCase());
    document.addEventListener("keydown", onDown);
    document.addEventListener("keyup",   onUp);

    // Click on NPC to chat
    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);
    renderer.domElement.addEventListener("click", () => {
      raycaster.setFromCamera(center, camera);
      const meshList = Array.from(npcMeshes.values());
      const hits = raycaster.intersectObjects(meshList, true);
      if (hits.length) {
        const hitObj = hits[0].object;
        let root: THREE.Object3D | null = hitObj;
        while (root && !root.userData.email) root = root.parent;
        // fallback: find which npc group contains this object
        npcMeshes.forEach((mesh, email) => {
          if (mesh === root || mesh.getObjectById(hitObj.id)) {
            const user = USERS.find(u => u.email === email);
            if (user) setActiveChat(user);
          }
        });
      }
    });

    // Tag npc meshes for raycasting
    npcMeshes.forEach((mesh, email) => { mesh.userData.email = email; });

    // Resize
    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ── LOOP ────────────────────────────────────────────────────────────────
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    let lastT = 0;

    const loop = (t: number) => {
      state.raf = requestAnimationFrame(loop);
      const dt = Math.min((t - lastT) / 1000, 0.05);
      lastT = t;

      // Camera rotation
      euler.set(state.pitch, state.yaw, 0, "YXZ");
      camera.quaternion.setFromEuler(euler);

      // Movement (yaw-relative, no vertical drift)
      const yawEuler = new THREE.Euler(0, state.yaw, 0, "YXZ");
      const fwd = new THREE.Vector3(0, 0, -1).applyEuler(yawEuler);
      const rgt = new THREE.Vector3(1, 0,  0).applyEuler(yawEuler);
      const spd = 3.5 * dt;

      if (state.keys.has("w")) state.playerPos.addScaledVector(fwd,  spd);
      if (state.keys.has("s")) state.playerPos.addScaledVector(fwd, -spd);
      if (state.keys.has("a")) state.playerPos.addScaledVector(rgt, -spd);
      if (state.keys.has("d")) state.playerPos.addScaledVector(rgt,  spd);

      state.playerPos.x = Math.max(-ROOM, Math.min(ROOM, state.playerPos.x));
      state.playerPos.z = Math.max(-ROOM, Math.min(ROOM, state.playerPos.z));

      camera.position.set(state.playerPos.x, 1.6, state.playerPos.z);
      playerMesh.position.copy(state.playerPos);

      // Face camera direction (yaw only)
      playerMesh.rotation.y = state.yaw + Math.PI;

      // NPC idle bob
      npcMeshes.forEach((mesh) => {
        mesh.position.y = Math.abs(Math.sin(t * 0.0008 + mesh.position.x)) * 0.03;
      });

      // Nearby detection — "E to chat" hint
      let closestUser: CRMUser | null = null;
      let closestD = Infinity;
      npcMeshes.forEach((mesh, email) => {
        const d = state.playerPos.distanceTo(mesh.position);
        if (d < INTERACT_DIST && d < closestD) {
          closestD = d;
          closestUser = USERS.find(u => u.email === email) ?? null;
        }
      });
      setNearby(closestUser);

      renderer.render(scene, camera);
    };
    state.raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(state.raf);
      document.removeEventListener("keydown", onDown);
      document.removeEventListener("keyup",   onUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = "";
      stateRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserEmail]);

  // "E" key opens chat with nearby NPC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key.toLowerCase() === "e" && nearby && !activeChat) {
        setActiveChat(nearby);
        document.exitPointerLock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nearby, activeChat]);

  // Update online indicators when presence changes
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.onlineIndicators.forEach((dot, email) => {
      const isOnline = presence[email] ?? true;
      (dot.material as THREE.MeshStandardMaterial).color.setHex(isOnline ? 0x22cc44 : 0x666666);
      (dot.material as THREE.MeshStandardMaterial).emissive.setHex(isOnline ? 0x22cc44 : 0x333333);
    });
  }, [presence]);

  const handleSend = useCallback(() => {
    if (!inputVal.trim() || !activeChat) return;
    onSendMessage?.(activeChat.email, inputVal.trim());
    setInputVal("");
  }, [inputVal, activeChat, onSendMessage]);

  const chatMessages = activeChat
    ? messages.filter(
        m =>
          (m.fromEmail === currentUserEmail && m.toEmail === activeChat.email) ||
          (m.fromEmail === activeChat.email  && m.toEmail === currentUserEmail)
      )
    : [];

  return (
    <div className="relative w-full h-full select-none">
      {/* Three.js canvas */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Lock hint */}
      {!locked && !activeChat && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Badge variant="secondary" className="text-sm px-4 py-2 bg-black/70 text-white border-0">
            🖱️ Click to look around
          </Badge>
        </div>
      )}

      {/* Crosshair */}
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-4 h-4 relative">
            <div className="absolute left-1/2 top-0 w-px h-full bg-white/70 -translate-x-1/2" />
            <div className="absolute top-1/2 left-0 h-px w-full bg-white/70 -translate-y-1/2" />
          </div>
        </div>
      )}

      {/* Nearby prompt */}
      {nearby && !activeChat && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <Badge className="bg-black/80 text-white border-0 text-sm px-4 py-2">
            Press <kbd className="mx-1 px-1 bg-white/20 rounded">E</kbd> or click to chat with {nearby.name}
          </Badge>
        </div>
      )}

      {/* Chat panel */}
      {activeChat && (
        <div className="absolute bottom-4 right-4 w-80 z-10">
          <Card className="flex flex-col shadow-2xl border border-white/10 bg-black/90 text-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: (presence[activeChat.email] ?? true) ? "#22cc44" : "#666" }}
                />
                <span className="font-semibold text-sm">{activeChat.name}</span>
                <span className="text-xs text-white/40">{activeChat.title}</span>
              </div>
              <button
                onClick={() => setActiveChat(null)}
                className="text-white/40 hover:text-white text-lg leading-none"
              >×</button>
            </div>

            {/* Messages */}
            <ScrollArea className="h-56 px-4 py-3">
              <div ref={scrollRef} className="flex flex-col gap-2">
                {chatMessages.length === 0 && (
                  <p className="text-xs text-white/30 text-center mt-8">
                    No messages yet — say hi! 👋
                  </p>
                )}
                {chatMessages.map(msg => {
                  const isMe = msg.fromEmail === currentUserEmail;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          isMe
                            ? "bg-indigo-600 text-white rounded-br-sm"
                            : "bg-white/10 text-white rounded-bl-sm"
                        }`}
                      >
                        {msg.body}
                      </div>
                      <span className="text-[10px] text-white/25 mt-0.5 px-1">
                        {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="flex gap-2 px-3 py-3 border-t border-white/10">
              <Input
                className="flex-1 bg-white/10 border-white/10 text-white placeholder:text-white/30 text-sm h-9"
                placeholder={`Message ${activeChat.name}…`}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
                autoFocus
              />
              <Button
                size="sm"
                className="h-9 bg-indigo-600 hover:bg-indigo-500 text-white"
                onClick={handleSend}
              >
                Send
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <Badge variant="outline" className="bg-black/60 text-white/60 border-white/10 text-xs">
          WASD move · Mouse look · E / click to chat · ESC release
        </Badge>
      </div>
    </div>
  );
}
