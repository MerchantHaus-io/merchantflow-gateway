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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";

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
  {
    email: "atria@merchanthaus.io",
    name: "Atria",
    title: "AI Assistant",
    shirtColor: 0x7c3aed,
    hairColor: 0xc0c0ff,
    skinColor: 0xe8d8f0,
    hairstyle: "bob",
    scale: 0.95,
    online: true, // Atria is always online
  },
];

// ── SPAWN POSITIONS (desk positions — NPCs sit here) ──────────────────────────

const DESK_POS: Record<string, THREE.Vector3> = {
  "taryn@merchanthaus.io":   new THREE.Vector3(-4, 0, -5),
  "admin@merchanthaus.io":   new THREE.Vector3(0,  0, -5),
  "sales@merchanthaus.io":   new THREE.Vector3(4,  0, -5),
  "support@merchanthaus.io": new THREE.Vector3(-2, 0,  2),
  "darryn@merchanthaus.io":  new THREE.Vector3(2,  0,  2),
  "atria@merchanthaus.io":   new THREE.Vector3(0,  0,  5.5),
};

// Aliases so existing SPAWN references still work for the player
const SPAWN: Record<string, THREE.Vector3> = { ...DESK_POS };

// ── THREE HELPERS ─────────────────────────────────────────────────────────────

const ROOM = 7.5; // half-extent of room (larger)
const INTERACT_DIST = 2.2;
const TV_POS = new THREE.Vector3(7.2, 0, 0); // right wall TV

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
  ctx.clearRect(0, 0, 256, 64);
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
  const FS = 15;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FS, FS), new THREE.MeshStandardMaterial({ color: 0xe8e0d4, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const t1 = new THREE.MeshStandardMaterial({ color: 0xf2ece4 });
  const t2 = new THREE.MeshStandardMaterial({ color: 0xe4ddd4 });
  for (let x = -7; x < 8; x += 2) for (let z = -7; z < 8; z += 2) {
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ((x + z) / 2) % 2 === 0 ? t1 : t2);
    tile.position.set(x + 1, 0.01, z + 1); tile.rotation.x = -Math.PI / 2; g.add(tile);
  }

  // Walls
  const wOff = FS / 2;
  addPlane(FS, 5, 0, 2.5, -wOff);
  addPlane(FS, 5, -wOff, 2.5, 0, Math.PI / 2);
  addPlane(FS, 5,  wOff, 2.5, 0, -Math.PI / 2);
  addPlane(FS, 5, 0, 2.5,  wOff, Math.PI);

  // Windows
  ([-3, 3] as number[]).forEach(x => {
    addPlane(2, 1.4, x, 2.8, -(wOff - 0.05), 0, winG);
    ([1.1, -1.1] as number[]).forEach(oy => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.07, 0.05), frame);
      b.position.set(x, 2.8 + oy * 0.5, -(wOff - 0.08)); g.add(b);
    });
    ([-1.15, 1.15] as number[]).forEach(ox => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.5, 0.05), frame);
      b.position.set(x + ox, 2.8, -(wOff - 0.08)); g.add(b);
    });
  });

  // Whiteboard
  const wb = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.4, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
  wb.position.set(0, 2.2, -(wOff - 0.1)); g.add(wb);

  // Cubicle builder
  const cubWall = new THREE.MeshStandardMaterial({ color: 0x7a8a9a, roughness: 0.9 });
  const cubTrim = new THREE.MeshStandardMaterial({ color: 0x555555 });

  const makeCubicle = (cx: number, cz: number) => {
    const cg = new THREE.Group();
    const pH = 1.4;
    const pT = 0.06;

    // Left partition
    const lp = new THREE.Mesh(new THREE.BoxGeometry(pT, pH, 1.6), cubWall);
    lp.position.set(-1.2, pH / 2, 0); lp.castShadow = true; cg.add(lp);
    const lt = new THREE.Mesh(new THREE.BoxGeometry(pT + 0.02, 0.04, 1.64), cubTrim);
    lt.position.set(-1.2, pH, 0); cg.add(lt);

    // Right partition
    const rp = new THREE.Mesh(new THREE.BoxGeometry(pT, pH, 1.6), cubWall);
    rp.position.set(1.2, pH / 2, 0); rp.castShadow = true; cg.add(rp);
    const rt = new THREE.Mesh(new THREE.BoxGeometry(pT + 0.02, 0.04, 1.64), cubTrim);
    rt.position.set(1.2, pH, 0); cg.add(rt);

    // Back partition
    const bp = new THREE.Mesh(new THREE.BoxGeometry(2.46, pH, pT), cubWall);
    bp.position.set(0, pH / 2, -0.8); bp.castShadow = true; cg.add(bp);
    const bt = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.04, pT + 0.02), cubTrim);
    bt.position.set(0, pH, -0.8); cg.add(bt);

    // Desk surface
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 1.0), wood);
    top.position.y = 0.75; top.castShadow = true; top.receiveShadow = true; cg.add(top);
    ([-1.0, 1.0] as number[]).forEach(lx => ([-0.45, 0.45] as number[]).forEach(lz => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), metal);
      leg.position.set(lx, 0.36, lz); leg.castShadow = true; cg.add(leg);
    }));

    // Monitor
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), dark);
    scr.position.set(0, 1.2, -0.3); cg.add(scr);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), metal);
    stand.position.set(0, 0.9, -0.3); cg.add(stand);

    // Keyboard
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.12), metal);
    kb.position.set(0, 0.79, 0.1); cg.add(kb);

    // Chair
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
    seat.position.set(0, 0.5, 0.65); cg.add(seat);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
    bk.position.set(0, 0.78, 0.88); cg.add(bk);

    cg.position.set(cx, 0, cz);
    return cg;
  };

  // Place cubicles at desk positions
  g.add(makeCubicle(-4, -5), makeCubicle(0, -5), makeCubicle(4, -5));
  g.add(makeCubicle(-2, 2), makeCubicle(2, 2));
  g.add(makeCubicle(0, 5.5)); // Atria's cubicle

  // Plants
  ([[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]] as [number, number][]).forEach(([px, pz]) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x7a4f2a }));
    pot.position.set(px, 0.15, pz); g.add(pot);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), new THREE.MeshStandardMaterial({ color: 0x2d7a2d }));
    leaves.position.set(px, 0.65, pz); g.add(leaves);
  });

  // Wall-mounted TV on right wall
  const tvBezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.6, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a })
  );
  tvBezel.position.set(wOff - 0.06, 2.4, 0); g.add(tvBezel);
  const tvScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 1.4, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0x111133, emissiveIntensity: 0.3 })
  );
  tvScreen.position.set(wOff - 0.09, 2.4, 0); g.add(tvScreen);
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.1, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 })
  );
  bracket.position.set(wOff - 0.02, 1.55, 0); g.add(bracket);

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

  const isMobile = useIsMobile();
  const [activeChat, setActiveChat] = useState<CRMUser | null>(null);
  const [inputVal,   setInputVal]   = useState("");
  const [locked,     setLocked]     = useState(false);
  const [nearby,     setNearby]     = useState<CRMUser | null>(null);
  const [nearDesk,   setNearDesk]   = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [nearTV,      setNearTV]      = useState(false);
  const [tvUnmuted,   setTvUnmuted]   = useState(false);
  const showTerminalRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 3D speech bubble sprites mapped by NPC email
  const speechBubblesRef = useRef<Map<string, { sprite: THREE.Sprite; timeout: ReturnType<typeof setTimeout> }>>(new Map());
  const prevMsgCountRef = useRef<number>(0);

  // Mobile touch refs
  const joystickRef = useRef({ x: 0, y: 0, active: false });
  const touchLookRef = useRef({ lastX: 0, lastY: 0, active: false });

  const currentUser = USERS.find(u => u.email === currentUserEmail)!;
  const others      = USERS.filter(u => u.email !== currentUserEmail);

  // Keep terminal ref in sync with state
  useEffect(() => { showTerminalRef.current = showTerminal; }, [showTerminal]);

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
    scene.fog = new THREE.Fog(0x1a1a1a, 8, 25);

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
      const deskPos = DESK_POS[u.email] || new THREE.Vector3(0, 0, 0);
      mesh.position.copy(deskPos);
      // Start hidden — presence effect will show online users
      mesh.visible = false;
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

    // Pointer lock (desktop only)
    if (!isMobile) {
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
    } else {
      // Mobile: always "locked" for rendering crosshair-free
      state.locked = true;
      setLocked(true);

      // Touch look — right side of screen
      const onTouchStart = (e: TouchEvent) => {
        const t = e.changedTouches[0];
        if (!t) return;
        // Only handle touches on the right half (look) that aren't on UI
        if ((e.target as HTMLElement).closest('.mobile-joystick, .mobile-interact-btn, [class*="Card"], button, input')) return;
        touchLookRef.current = { lastX: t.clientX, lastY: t.clientY, active: true };
      };
      const onTouchMove = (e: TouchEvent) => {
        if (!touchLookRef.current.active) return;
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - touchLookRef.current.lastX;
        const dy = t.clientY - touchLookRef.current.lastY;
        state.yaw -= dx * 0.004;
        state.pitch = Math.max(-1.1, Math.min(1.1, state.pitch - dy * 0.004));
        touchLookRef.current.lastX = t.clientX;
        touchLookRef.current.lastY = t.clientY;
      };
      const onTouchEnd = () => { touchLookRef.current.active = false; };
      renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
      renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: true });
      renderer.domElement.addEventListener("touchend", onTouchEnd, { passive: true });
    }

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
        // fallback: find which npc group contains this object — only if visible (online)
        npcMeshes.forEach((mesh, email) => {
          if (!mesh.visible) return; // skip offline users
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

      // Movement (yaw-relative, no vertical drift) — disabled when terminal is open
      const yawEuler = new THREE.Euler(0, state.yaw, 0, "YXZ");
      const fwd = new THREE.Vector3(0, 0, -1).applyEuler(yawEuler);
      const rgt = new THREE.Vector3(1, 0,  0).applyEuler(yawEuler);
      const spd = 3.5 * dt;
      const jx = joystickRef.current.x;
      const jy = joystickRef.current.y;
      const isMoving = state.keys.has("w") || state.keys.has("s") || state.keys.has("a") || state.keys.has("d") || joystickRef.current.active;

      if (isMoving && showTerminalRef.current) {
        showTerminalRef.current = false;
        setShowTerminal(false);
      }

      if (!showTerminalRef.current) {
        if (state.keys.has("w")) state.playerPos.addScaledVector(fwd,  spd);
        if (state.keys.has("s")) state.playerPos.addScaledVector(fwd, -spd);
        if (state.keys.has("a")) state.playerPos.addScaledVector(rgt, -spd);
        if (state.keys.has("d")) state.playerPos.addScaledVector(rgt,  spd);
        // Mobile joystick input
        if (joystickRef.current.active) {
          state.playerPos.addScaledVector(fwd, -jy * spd);
          state.playerPos.addScaledVector(rgt,  jx * spd);
        }
      }

      state.playerPos.x = Math.max(-ROOM, Math.min(ROOM, state.playerPos.x));
      state.playerPos.z = Math.max(-ROOM, Math.min(ROOM, state.playerPos.z));

      camera.position.set(state.playerPos.x, 1.6, state.playerPos.z);
      playerMesh.position.copy(state.playerPos);

      // Face camera direction (yaw only)
      playerMesh.rotation.y = state.yaw + Math.PI;

      // NPC idle bob (only visible/online ones)
      npcMeshes.forEach((mesh) => {
        if (!mesh.visible) return;
        mesh.position.y = Math.abs(Math.sin(t * 0.0008 + mesh.position.x)) * 0.03;
      });

      // Nearby detection — only consider visible (online) NPCs
      let closestUser: CRMUser | null = null;
      let closestD = Infinity;
      npcMeshes.forEach((mesh, email) => {
        if (!mesh.visible) return;
        const d = state.playerPos.distanceTo(mesh.position);
        if (d < INTERACT_DIST && d < closestD) {
          closestD = d;
          closestUser = USERS.find(u => u.email === email) ?? null;
        }
      });
      setNearby(closestUser);

      // Desk proximity — check if near any desk without an online NPC
      if (!closestUser) {
        let deskNear = false;
        Object.entries(DESK_POS).forEach(([email, pos]) => {
          if (email === currentUserEmail) return;
          const isOnline = npcMeshes.get(email)?.visible ?? false;
          if (isOnline) return; // occupied desk — NPC is there
          const d = state.playerPos.distanceTo(pos);
          if (d < INTERACT_DIST) deskNear = true;
        });
        setNearDesk(deskNear);
      } else {
        setNearDesk(false);
      }

      // TV proximity
      const tvDist = state.playerPos.distanceTo(TV_POS);
      setNearTV(tvDist < INTERACT_DIST && !closestUser);

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

  // "E" key opens chat with nearby NPC, terminal at empty desk, or toggles TV
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key.toLowerCase() === "e") {
        if (nearby && !activeChat && !showTerminal) {
          setActiveChat(nearby);
          document.exitPointerLock();
        } else if (nearTV && !activeChat && !showTerminal) {
          setTvUnmuted(prev => !prev);
        } else if (nearDesk && !activeChat && !showTerminal) {
          setShowTerminal(true);
          document.exitPointerLock();
        }
      }
      if (e.key === "Escape" && showTerminal) {
        setShowTerminal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nearby, activeChat, nearDesk, showTerminal, nearTV]);

  // Update online indicators + visibility when presence changes
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.npcMeshes.forEach((mesh, email) => {
      // Atria is always online
      const isOnline = email === "atria@merchanthaus.io" ? true : (presence[email] ?? false);
      mesh.visible = isOnline;
    });
    s.onlineIndicators.forEach((dot, email) => {
      const isOnline = email === "atria@merchanthaus.io" ? true : (presence[email] ?? false);
      (dot.material as THREE.MeshStandardMaterial).color.setHex(isOnline ? 0x22cc44 : 0x666666);
      (dot.material as THREE.MeshStandardMaterial).emissive.setHex(isOnline ? 0x22cc44 : 0x333333);
    });
  }, [presence]);

  // 3D speech bubbles above NPCs when new messages arrive
  useEffect(() => {
    const s = stateRef.current;
    if (!s || messages.length <= prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      return;
    }
    // Find new messages
    const newMsgs = messages.slice(prevMsgCountRef.current);
    prevMsgCountRef.current = messages.length;

    newMsgs.forEach(msg => {
      const senderEmail = msg.fromEmail;
      if (senderEmail === currentUserEmail) return; // don't show own messages as 3D bubbles
      const npcMesh = s.npcMeshes.get(senderEmail);
      if (!npcMesh || !npcMesh.visible) return;

      // Remove old bubble for this NPC
      const existing = speechBubblesRef.current.get(senderEmail);
      if (existing) {
        npcMesh.remove(existing.sprite);
        clearTimeout(existing.timeout);
      }

      // Create speech bubble sprite
      const cv = document.createElement("canvas");
      cv.width = 512; cv.height = 128;
      const ctx = cv.getContext("2d")!;
      // Bubble background
      const pad = 16;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      const w = cv.width - pad * 2, h = cv.height - pad * 2;
      const r = 20;
      ctx.beginPath();
      ctx.moveTo(pad + r, pad);
      ctx.lineTo(pad + w - r, pad);
      ctx.quadraticCurveTo(pad + w, pad, pad + w, pad + r);
      ctx.lineTo(pad + w, pad + h - r);
      ctx.quadraticCurveTo(pad + w, pad + h, pad + w - r, pad + h);
      // Tail
      ctx.lineTo(pad + w * 0.35, pad + h);
      ctx.lineTo(pad + w * 0.25, pad + h + 14);
      ctx.lineTo(pad + w * 0.2, pad + h);
      ctx.lineTo(pad + r, pad + h);
      ctx.quadraticCurveTo(pad, pad + h, pad, pad + h - r);
      ctx.lineTo(pad, pad + r);
      ctx.quadraticCurveTo(pad, pad, pad + r, pad);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Text
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "bold 22px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const text = msg.body.length > 40 ? msg.body.slice(0, 37) + "…" : msg.body;
      ctx.fillText(text, cv.width / 2, cv.height / 2);

      const tex = new THREE.CanvasTexture(cv);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      const userScale = USERS.find(u => u.email === senderEmail)?.scale ?? 1;
      sprite.position.y = 2.4 / userScale;
      sprite.scale.set(3 / userScale, 0.8 / userScale, 1);
      npcMesh.add(sprite);

      const timeout = setTimeout(() => {
        npcMesh.remove(sprite);
        speechBubblesRef.current.delete(senderEmail);
      }, 8000);

      speechBubblesRef.current.set(senderEmail, { sprite, timeout });
    });
  }, [messages, currentUserEmail]);

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

      {/* Lock hint (desktop only) */}
      {!isMobile && !locked && !activeChat && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Badge variant="secondary" className="text-sm px-4 py-2 bg-black/70 text-white border-0">
            🖱️ Click to look around
          </Badge>
        </div>
      )}

      {/* Crosshair (desktop only) */}
      {!isMobile && locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-4 h-4 relative">
            <div className="absolute left-1/2 top-0 w-px h-full bg-white/70 -translate-x-1/2" />
            <div className="absolute top-1/2 left-0 h-px w-full bg-white/70 -translate-y-1/2" />
          </div>
        </div>
      )}

      {/* Nearby desk prompt (empty desk) */}
      {nearDesk && !activeChat && !showTerminal && !isMobile && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <Badge className="bg-black/80 text-white border-0 text-sm px-4 py-2">
            Press <kbd className="mx-1 px-1 bg-white/20 rounded">E</kbd> to use terminal
          </Badge>
        </div>
      )}

      {/* Near TV prompt */}
      {nearTV && !activeChat && !showTerminal && !isMobile && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <Badge className="bg-black/80 text-white border-0 text-sm px-4 py-2">
            Press <kbd className="mx-1 px-1 bg-white/20 rounded">E</kbd> to {tvUnmuted ? "mute" : "unmute"} TV
          </Badge>
        </div>
      )}

      {/* Nearby NPC prompt */}
      {nearby && !activeChat && !showTerminal && !isMobile && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <Badge className="bg-black/80 text-white border-0 text-sm px-4 py-2">
            Press <kbd className="mx-1 px-1 bg-white/20 rounded">E</kbd> or click to chat with {nearby.name}
          </Badge>
        </div>
      )}

      {/* Speech bubble chat — floating at bottom */}
      {activeChat && (
        <div className={`absolute z-10 ${isMobile ? "inset-x-2 bottom-2" : "bottom-4 left-1/2 -translate-x-1/2 w-[480px] max-w-[90vw]"}`}>
          {/* Recent messages as floating speech bubbles (last 4) */}
          <div ref={scrollRef} className="flex flex-col gap-1.5 mb-2 max-h-40 overflow-hidden">
            {chatMessages.slice(-4).map(msg => {
              const isMe = msg.fromEmail === currentUserEmail;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`relative max-w-[80%] px-3 py-1.5 text-sm leading-snug ${
                    isMe
                      ? "bg-primary/90 text-primary-foreground rounded-2xl rounded-br-sm"
                      : "bg-black/80 text-white rounded-2xl rounded-bl-sm"
                  }`}
                  style={{ backdropFilter: "blur(8px)" }}
                  >
                    {!isMe && (
                      <span className="text-[10px] font-semibold text-white/60 block -mb-0.5">{activeChat.name}</span>
                    )}
                    <span className="line-clamp-2">{msg.body}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compact input bar */}
          <div className="flex gap-2 items-center bg-black/80 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10">
            <span className="text-xs text-white/40 shrink-0">{activeChat.name}</span>
            <Input
              className="flex-1 bg-transparent border-0 text-white placeholder:text-white/30 text-sm h-7 focus-visible:ring-0 px-1"
              placeholder="Type a message…"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
              autoFocus
            />
            <Button
              size="sm"
              className="h-7 px-3 rounded-full bg-primary hover:bg-primary/80 text-primary-foreground text-xs"
              onClick={handleSend}
            >
              Send
            </Button>
            <button
              onClick={() => setActiveChat(null)}
              className="text-white/40 hover:text-white text-sm leading-none ml-1"
            >✕</button>
          </div>
        </div>
      )}

      {/* Fake monitor — OPS Terminal */}
      {showTerminal && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="relative flex flex-col items-center">
            <div
              className="rounded-xl overflow-hidden shadow-2xl"
              style={{
                background: "linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #0e0e0e 100%)",
                padding: "18px 18px 8px 18px",
                border: "2px solid #333",
              }}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] font-bold tracking-widest text-white/30 uppercase">OPS Terminal</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[9px] text-white/20">ONLINE</span>
                </div>
              </div>
              <div
                className="relative rounded-sm overflow-hidden"
                style={{
                  width: "min(75vw, 900px)",
                  height: "min(65vh, 560px)",
                  boxShadow: "inset 0 0 60px rgba(0,0,0,0.5), 0 0 20px rgba(100,130,255,0.08)",
                }}
              >
                <div
                  className="absolute inset-0 z-10 pointer-events-none"
                  style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)" }}
                />
                <div
                  className="absolute inset-0 z-10 pointer-events-none"
                  style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 50%, rgba(255,255,255,0.02) 100%)" }}
                />
                <iframe
                  src={window.location.origin + "/dashboard"}
                  className="w-full h-full border-0"
                  title="OPS Terminal"
                  style={{ borderRadius: "2px" }}
                />
              </div>
              <div className="flex items-center justify-center pt-2 pb-1">
                <div className="w-8 h-1 rounded-full bg-white/10" />
              </div>
            </div>
            <div className="w-16 h-8" style={{ background: "linear-gradient(180deg, #1a1a1a, #111)", clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)" }} />
            <div className="w-28 h-2 rounded-full" style={{ background: "linear-gradient(180deg, #222, #0e0e0e)" }} />
          </div>
          <button
            onClick={() => setShowTerminal(false)}
            className="absolute top-6 right-6 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors backdrop-blur-sm"
          >
            ESC to close
          </button>
        </div>
      )}

      {/* Always-on YouTube TV — MrBallen playlist (hidden on mobile — conflicts with joystick) */}
      {!isMobile && (
        <div className="absolute bottom-3 left-3 z-10" style={{ width: 220 }}>
          <div className="rounded-lg overflow-hidden shadow-lg" style={{ background: "#0a0a0a", padding: "4px 4px 2px 4px", border: "1px solid #333" }}>
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[8px] font-bold tracking-widest text-white/30 uppercase">Office TV</span>
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${tvUnmuted ? "bg-green-500" : "bg-red-500/60"}`} />
                <span className="text-[8px] text-white/20">{tvUnmuted ? "🔊" : "🔇"}</span>
              </div>
            </div>
            <iframe
              key={tvUnmuted ? "unmuted" : "muted"}
              src={`https://www.youtube.com/embed/videoseries?list=PLgRgJShyo_y6TjE1Sfyrh0ljWQcHutPOg&autoplay=1&${tvUnmuted ? "" : "mute=1&"}loop=1&controls=0&modestbranding=1&rel=0`}
              className="w-full border-0 rounded-sm"
              style={{ aspectRatio: "16/9" }}
              title="Office TV"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* Controls hint (desktop) */}
      {!isMobile && (
        <div className="absolute top-3 left-3 pointer-events-none">
          <Badge variant="outline" className="bg-black/60 text-white/60 border-white/10 text-xs">
            WASD move · Mouse look · E to interact · ESC release
          </Badge>
        </div>
      )}

      {/* ── MOBILE CONTROLS ── */}
      {isMobile && !activeChat && !showTerminal && (
        <>
          {/* Virtual Joystick — bottom left */}
          <div
            className="mobile-joystick absolute bottom-6 left-6 z-20"
            style={{ width: 120, height: 120 }}
            onTouchStart={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              const t = e.touches[0];
              const dx = (t.clientX - cx) / (rect.width / 2);
              const dy = (t.clientY - cy) / (rect.height / 2);
              joystickRef.current = { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)), active: true };
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              const t = e.touches[0];
              const dx = (t.clientX - cx) / (rect.width / 2);
              const dy = (t.clientY - cy) / (rect.height / 2);
              joystickRef.current = { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)), active: true };
            }}
            onTouchEnd={() => { joystickRef.current = { x: 0, y: 0, active: false }; }}
          >
            {/* Joystick base */}
            <div className="w-full h-full rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
              {/* Joystick knob */}
              <div className="w-12 h-12 rounded-full bg-white/30 border border-white/40" />
            </div>
          </div>

          {/* Interact button — bottom right */}
          {(nearby || nearDesk || nearTV) && (
            <button
              className="mobile-interact-btn absolute bottom-8 right-8 z-20 w-16 h-16 rounded-full bg-primary/80 text-white font-bold text-xs flex items-center justify-center border-2 border-white/30 active:scale-90 transition-transform"
              onTouchStart={(e) => {
                e.stopPropagation();
                if (nearby) {
                  setActiveChat(nearby);
                } else if (nearTV) {
                  setTvUnmuted(prev => !prev);
                } else if (nearDesk) {
                  setShowTerminal(true);
                }
              }}
            >
              {nearby ? `Chat\n${nearby.name}` : nearTV ? (tvUnmuted ? "Mute" : "Unmute") : "Terminal"}
            </button>
          )}

          {/* Mobile proximity indicator */}
          {(nearby || nearDesk || nearTV) && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-none z-20">
              <Badge className="bg-black/80 text-white border-0 text-xs px-3 py-1">
                {nearby ? `Near ${nearby.name}` : nearTV ? "Near TV" : "Near Terminal"}
              </Badge>
            </div>
          )}

          {/* Mobile hint */}
          <div className="absolute top-3 left-3 pointer-events-none z-20">
            <Badge variant="outline" className="bg-black/60 text-white/60 border-white/10 text-[10px]">
              Drag to look · Joystick to move
            </Badge>
          </div>
        </>
      )}

      {/* Mobile close button for terminal */}
      {isMobile && showTerminal && (
        <button
          onClick={() => setShowTerminal(false)}
          className="absolute top-4 right-4 z-30 px-3 py-2 rounded-lg bg-white/10 text-white text-xs font-medium backdrop-blur-sm"
        >
          ✕ Close
        </button>
      )}
    </div>
  );
}
