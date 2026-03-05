// OfficeChat.tsx — Upgraded office simulator with expanded world, collisions,
// articulated characters, and interaction system.
// Peer deps: three, @types/three

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
  online?: boolean;
}

export interface ChatMessage {
  id: string;
  fromEmail: string;
  toEmail: string;
  body: string;
  timestamp: Date;
}

export interface RemotePosition {
  email: string;
  x: number;
  z: number;
  yaw: number;
  timestamp: number;
}

interface OfficeChatProps {
  currentUserEmail: string;
  messages?: ChatMessage[];
  onSendMessage?: (to: string, body: string) => void;
  presence?: Record<string, boolean>;
  onPositionUpdate?: (pos: { x: number; z: number; yaw: number }) => void;
  remotePositions?: Record<string, RemotePosition>;
}

// ── USERS ─────────────────────────────────────────────────────────────────────

const USERS: CRMUser[] = [
  { email: "taryn@merchanthaus.io", name: "Taryn", title: "Operations", shirtColor: 0xe05a2b, hairColor: 0x3a1a08, skinColor: 0xffcba8, hairstyle: "bob", scale: 1.0 },
  { email: "admin@merchanthaus.io", name: "Jamie", title: "Admin", shirtColor: 0x3a7bd5, hairColor: 0xd4b96a, skinColor: 0xffe0bb, stubble: true, stubbleColor: 0xc8aa70, scale: 1.0 },
  { email: "sales@merchanthaus.io", name: "Dylan", title: "Sales", shirtColor: 0x2eaa5e, hairColor: 0x1a3a1a, skinColor: 0xffdbac, prostheticLeg: true, scale: 1.15 },
  { email: "support@merchanthaus.io", name: "Sheiky", title: "Support", shirtColor: 0x9b30d0, hairColor: 0x2a1a40, skinColor: 0xd4a574, beard: true, beardColor: 0x9a9a9a, scale: 1.08 },
  { email: "darryn@merchanthaus.io", name: "Darryn", title: "Dev", shirtColor: 0xd03060, hairColor: 0x3a1010, skinColor: 0xffdbac, scale: 1.0 },
  { email: "atria@merchanthaus.io", name: "Atria", title: "AI Assistant", shirtColor: 0x7c3aed, hairColor: 0xc0c0ff, skinColor: 0xe8d8f0, hairstyle: "bob", scale: 0.95, online: true },
];

// ── WORLD LAYOUT ──────────────────────────────────────────────────────────────

const ROOM = 22; // half-extent of world

// Desk positions (cubicle area — top of map)
const DESK_POS: Record<string, THREE.Vector3> = {
  "taryn@merchanthaus.io":   new THREE.Vector3(-10, 0, -16),
  "admin@merchanthaus.io":   new THREE.Vector3(-2,  0, -16),
  "sales@merchanthaus.io":   new THREE.Vector3(6,   0, -16),
  "support@merchanthaus.io": new THREE.Vector3(-6,  0, -8),
  "darryn@merchanthaus.io":  new THREE.Vector3(2,   0, -8),
  "atria@merchanthaus.io":   new THREE.Vector3(10,  0, -8),
};
const SPAWN: Record<string, THREE.Vector3> = { ...DESK_POS };

// ── COLLISION SYSTEM (AABB) ───────────────────────────────────────────────────

interface AABB { minX: number; maxX: number; minZ: number; maxZ: number; }

const COLLIDERS: AABB[] = [];

function addCollider(cx: number, cz: number, hw: number, hd: number) {
  COLLIDERS.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });
}

function resolveCollision(pos: THREE.Vector3, radius: number): THREE.Vector3 {
  const resolved = pos.clone();
  // World bounds
  resolved.x = Math.max(-ROOM + radius, Math.min(ROOM - radius, resolved.x));
  resolved.z = Math.max(-ROOM + radius, Math.min(ROOM - radius, resolved.z));

  for (const c of COLLIDERS) {
    const nearX = Math.max(c.minX, Math.min(c.maxX, resolved.x));
    const nearZ = Math.max(c.minZ, Math.min(c.maxZ, resolved.z));
    const dx = resolved.x - nearX;
    const dz = resolved.z - nearZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < radius && dist > 0.001) {
      const push = radius - dist;
      resolved.x += (dx / dist) * push;
      resolved.z += (dz / dist) * push;
    } else if (dist < 0.001) {
      // Player is inside AABB — push out along shortest axis
      const pushX1 = c.maxX - resolved.x + radius;
      const pushX2 = resolved.x - c.minX + radius;
      const pushZ1 = c.maxZ - resolved.z + radius;
      const pushZ2 = resolved.z - c.minZ + radius;
      const minPush = Math.min(pushX1, pushX2, pushZ1, pushZ2);
      if (minPush === pushX1) resolved.x = c.maxX + radius;
      else if (minPush === pushX2) resolved.x = c.minX - radius;
      else if (minPush === pushZ1) resolved.z = c.maxZ + radius;
      else resolved.z = c.minZ - radius;
    }
  }
  return resolved;
}

const PLAYER_RADIUS = 0.35;

// ── NPC WANDER ────────────────────────────────────────────────────────────────

interface NPCWanderState {
  currentTarget: THREE.Vector3;
  atDesk: boolean;
  deskTimer: number;
  wanderTimer: number;
  speed: number;
  idleTimer: number;
  state: "walking" | "idle_at_waypoint" | "at_desk";
}

function randomWanderTarget(): THREE.Vector3 {
  // Wander in common areas (lobby / break room / meeting room corridors)
  const zones = [
    { cx: 0, cz: 2, hw: 8, hd: 4 },      // Lobby
    { cx: -14, cz: 6, hw: 5, hd: 5 },     // Break room
    { cx: 14, cz: 6, hw: 4, hd: 4 },      // Meeting room corridor
    { cx: 0, cz: 14, hw: 6, hd: 4 },      // Reception
  ];
  const zone = zones[Math.floor(Math.random() * zones.length)];
  return new THREE.Vector3(
    zone.cx + (Math.random() - 0.5) * zone.hw * 2,
    0,
    zone.cz + (Math.random() - 0.5) * zone.hd * 2,
  );
}

function createWanderState(): NPCWanderState {
  return {
    currentTarget: randomWanderTarget(),
    atDesk: false,
    deskTimer: Math.random() * 20 + 10,
    wanderTimer: Math.random() * 15 + 8,
    speed: 1.2 + Math.random() * 0.8,
    idleTimer: 0,
    state: "walking",
  };
}

// ── INTERACTION POINTS ────────────────────────────────────────────────────────

interface InteractionPoint {
  id: string;
  pos: THREE.Vector3;
  label: string;
  action: string; // "sit" | "whiteboard" | "coffee" | "terminal" | "tv"
  radius: number;
}

const INTERACT_POINTS: InteractionPoint[] = [
  // Break room chairs
  { id: "chair-1", pos: new THREE.Vector3(-16, 0, 4), label: "Sit down", action: "sit", radius: 1.5 },
  { id: "chair-2", pos: new THREE.Vector3(-12, 0, 4), label: "Sit down", action: "sit", radius: 1.5 },
  // Coffee machine
  { id: "coffee", pos: new THREE.Vector3(-18, 0, 10), label: "Get coffee ☕", action: "coffee", radius: 2 },
  // Whiteboard
  { id: "whiteboard", pos: new THREE.Vector3(0, 0, -20.5), label: "Use whiteboard", action: "whiteboard", radius: 2.5 },
  // Meeting room table
  { id: "meeting-sit", pos: new THREE.Vector3(16, 0, 8), label: "Join meeting", action: "sit", radius: 2 },
  // TV
  { id: "tv", pos: new THREE.Vector3(20, 0, 6), label: "Toggle TV", action: "tv", radius: 3.5 },
];

const INTERACT_DIST = 2.5;
const TV_POS = new THREE.Vector3(20, 0, 6);  // East wall, visible from open floor

// ── CHARACTER BUILDER ─────────────────────────────────────────────────────────

function buildCharacterMesh(user: CRMUser, isPlayer: boolean): THREE.Group {
  const g = new THREE.Group();
  const s = user.scale ?? 1;
  const skin  = new THREE.MeshStandardMaterial({ color: user.skinColor });
  const shirt = new THREE.MeshStandardMaterial({ color: user.shirtColor });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
  const hair  = new THREE.MeshStandardMaterial({ color: user.hairColor });
  const shoes = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.3, metalness: 0.8 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 });

  // ── Articulated legs (separate upper/lower for walk cycle) ──
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.12, 0.78, 0);
  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.12, 0.78, 0);

  if (user.prostheticLeg) {
    // Right leg (natural)
    const rUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.4, 6), pants);
    rUpper.position.y = -0.2; rightLegGroup.add(rUpper);
    const rLower = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.4, 6), pants);
    rLower.position.y = -0.58; rightLegGroup.add(rLower);
    const rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.22), shoes);
    rShoe.position.set(0, -0.8, 0.03); rightLegGroup.add(rShoe);

    // Left leg (prosthetic)
    const lUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.4, 6), pants);
    lUpper.position.y = -0.2; leftLegGroup.add(lUpper);
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.35, 8), metal);
    pylon.position.y = -0.55; leftLegGroup.add(pylon);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), metal);
    knee.position.y = -0.38; leftLegGroup.add(knee);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.24), carbon);
    blade.position.set(0, -0.76, 0.04); leftLegGroup.add(blade);
  } else {
    [leftLegGroup, rightLegGroup].forEach(lg => {
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.4, 6), pants);
      upper.position.y = -0.2; lg.add(upper);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.4, 6), pants);
      lower.position.y = -0.58; lg.add(lower);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.22), shoes);
      shoe.position.set(0, -0.8, 0.03); lg.add(shoe);
    });
  }

  g.add(leftLegGroup, rightLegGroup);
  g.userData.leftLeg = leftLegGroup;
  g.userData.rightLeg = rightLegGroup;

  // ── Torso with slight taper ──
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8), shirt);
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);

  // Shoulders
  const shoulderGeo = new THREE.SphereGeometry(0.1, 6, 6);
  const lShoulder = new THREE.Mesh(shoulderGeo, shirt);
  lShoulder.position.set(-0.3, 1.45, 0); g.add(lShoulder);
  const rShoulder = new THREE.Mesh(shoulderGeo, shirt);
  rShoulder.position.set(0.3, 1.45, 0); g.add(rShoulder);

  // ── Articulated arms ──
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.3, 1.42, 0);
  const lUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.3, 6), shirt);
  lUpperArm.position.y = -0.18; leftArmGroup.add(lUpperArm);
  const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.28, 6), skin);
  lForearm.position.y = -0.42; leftArmGroup.add(lForearm);
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 5), skin);
  lHand.position.y = -0.58; leftArmGroup.add(lHand);
  g.add(leftArmGroup);
  g.userData.leftArm = leftArmGroup;

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.3, 1.42, 0);
  const rUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.3, 6), shirt);
  rUpperArm.position.y = -0.18; rightArmGroup.add(rUpperArm);
  const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.28, 6), skin);
  rForearm.position.y = -0.42; rightArmGroup.add(rForearm);
  const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 5), skin);
  rHand.position.y = -0.58; rightArmGroup.add(rHand);
  g.add(rightArmGroup);
  g.userData.rightArm = rightArmGroup;

  // ── Head ──
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.72; head.castShadow = true; g.add(head);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 6), skin);
  neck.position.y = 1.54; g.add(neck);

  // Hair
  if (user.hairstyle === "bob") {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), hair);
    cap.position.y = 1.82; cap.scale.y = 0.55; g.add(cap);
    const side = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), hair);
    side.position.y = 1.66; side.scale.set(1.1, 0.65, 1.0); g.add(side);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), hair);
    bun.position.set(0, 1.56, -0.24); g.add(bun);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    band.position.set(0, 1.56, -0.24); band.rotation.x = Math.PI / 2; g.add(band);
  } else {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), hair);
    h.position.y = 1.82; h.scale.y = 0.55; g.add(h);
  }

  // Eyes
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x111111 });
  ([-0.07, 0.07] as number[]).forEach(x => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 5, 5), eyeM);
    e.position.set(x, 1.73, 0.19); g.add(e);
  });

  // Beard / stubble
  if (user.beard) {
    const bMat = new THREE.MeshStandardMaterial({ color: user.beardColor ?? 0x555555, roughness: 0.9 });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bMat);
    b.position.set(0, 1.58, 0.15); b.scale.set(1, 0.5, 0.65); g.add(b);
  }
  if (user.stubble) {
    const sMat = new THREE.MeshStandardMaterial({ color: user.stubbleColor ?? 0xc8b89a, roughness: 1 });
    const st = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), sMat);
    st.position.set(0, 1.58, 0.16); st.scale.set(1, 0.4, 0.6); g.add(st);
  }

  // Player ring
  if (isPlayer) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.04, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.6 })
    );
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  }

  // Name label
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = isPlayer ? "#ffd700" : "#ffffff";
  ctx.font = "bold 20px Arial"; ctx.textAlign = "center";
  ctx.fillText(isPlayer ? `${user.name} (You)` : user.name, 128, 24);
  ctx.fillStyle = "#aaaaaa"; ctx.font = "14px Arial";
  ctx.fillText(user.title, 128, 46);
  const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv) }));
  lbl.position.y = 2.2 / s; lbl.scale.set(2.2 / s, 0.6 / s, 1); g.add(lbl);

  g.scale.setScalar(s);
  return g;
}

// ── ANIMATE CHARACTER ─────────────────────────────────────────────────────────

function animateCharacter(mesh: THREE.Group, t: number, isMoving: boolean, isSitting: boolean) {
  const leftLeg = mesh.userData.leftLeg as THREE.Group | undefined;
  const rightLeg = mesh.userData.rightLeg as THREE.Group | undefined;
  const leftArm = mesh.userData.leftArm as THREE.Group | undefined;
  const rightArm = mesh.userData.rightArm as THREE.Group | undefined;

  if (isSitting) {
    // Seated pose
    if (leftLeg) leftLeg.rotation.x = -Math.PI / 2;
    if (rightLeg) rightLeg.rotation.x = -Math.PI / 2;
    if (leftArm) leftArm.rotation.x = -0.3;
    if (rightArm) rightArm.rotation.x = -0.3;
    return;
  }

  if (isMoving) {
    const walkCycle = t * 0.008;
    // Leg swing
    if (leftLeg) leftLeg.rotation.x = Math.sin(walkCycle) * 0.5;
    if (rightLeg) rightLeg.rotation.x = -Math.sin(walkCycle) * 0.5;
    // Arm swing (opposite to legs)
    if (leftArm) leftArm.rotation.x = -Math.sin(walkCycle) * 0.4;
    if (rightArm) rightArm.rotation.x = Math.sin(walkCycle) * 0.4;
    // Body bob
    mesh.position.y = Math.abs(Math.sin(walkCycle * 2)) * 0.06;
  } else {
    // Idle breathing
    const breath = Math.sin(t * 0.002) * 0.01;
    mesh.position.y = breath;
    // Ease limbs back to rest
    if (leftLeg) leftLeg.rotation.x *= 0.9;
    if (rightLeg) rightLeg.rotation.x *= 0.9;
    if (leftArm) leftArm.rotation.x *= 0.9;
    if (rightArm) rightArm.rotation.x *= 0.9;
  }
}

// ── BUILD WORLD ───────────────────────────────────────────────────────────────

function buildRoom(): THREE.Group {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2e2e2e, roughness: 0.85 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d4, roughness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x9b7a4a, roughness: 0.6 });
  const metalM = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.3, metalness: 0.8 });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const winG = new THREE.MeshStandardMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.35 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a });
  const cubWall = new THREE.MeshStandardMaterial({ color: 0x7a8a9a, roughness: 0.9 });
  const cubTrim = new THREE.MeshStandardMaterial({ color: 0x555555 });
  const couchMat = new THREE.MeshStandardMaterial({ color: 0x4a4a6a, roughness: 0.8 });
  const partitionMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.25 });
  const carpetMat = new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.95 });
  const tileMat1 = new THREE.MeshStandardMaterial({ color: 0xf2ece4 });
  const tileMat2 = new THREE.MeshStandardMaterial({ color: 0xe4ddd4 });

  // Clear colliders for fresh build
  COLLIDERS.length = 0;

  const FS = ROOM * 2;
  const wOff = ROOM;

  // ── Floor ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FS, FS), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);

  // Floor tiles
  for (let x = -ROOM; x < ROOM; x += 2) for (let z = -ROOM; z < ROOM; z += 2) {
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ((x + z) / 2) % 2 === 0 ? tileMat1 : tileMat2);
    tile.position.set(x + 1, 0.01, z + 1); tile.rotation.x = -Math.PI / 2; g.add(tile);
  }

  // ── Outer walls ──
  const addWall = (w: number, h: number, x: number, y: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m);
  };
  addWall(FS, 5, 0, 2.5, -wOff, 0);        // North
  addWall(FS, 5, -wOff, 2.5, 0, Math.PI / 2);  // West
  addWall(FS, 5, wOff, 2.5, 0, -Math.PI / 2);  // East
  addWall(FS, 5, 0, 2.5, wOff, Math.PI);    // South

  // Wall colliders (thin)
  addCollider(0, -wOff, wOff, 0.3);   // North
  addCollider(0, wOff, wOff, 0.3);    // South
  addCollider(-wOff, 0, 0.3, wOff);   // West
  addCollider(wOff, 0, 0.3, wOff);    // East

  // ── Windows (north wall) ──
  ([-6, 0, 6] as number[]).forEach(x => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.6), winG);
    win.position.set(x, 3, -(wOff - 0.05)); g.add(win);
    // Frame
    ([-0.85, 0.85] as number[]).forEach(oy => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.06, 0.05), frameMat);
      b.position.set(x, 3 + oy, -(wOff - 0.08)); g.add(b);
    });
    ([-1.35, 1.35] as number[]).forEach(ox => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.05), frameMat);
      b.position.set(x + ox, 3, -(wOff - 0.08)); g.add(b);
    });
  });

  // ── Whiteboard (north wall center) ──
  const wb = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
  wb.position.set(0, 2.2, -(wOff - 0.1)); g.add(wb);
  // Whiteboard tray
  const wbTray = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.05, 0.12), metalM);
  wbTray.position.set(0, 1.28, -(wOff - 0.08)); g.add(wbTray);

  // ── CUBICLE BUILDER ──
  const makeCubicle = (cx: number, cz: number) => {
    const cg = new THREE.Group();
    const pH = 1.4, pT = 0.06;

    // Partitions: left, right, back
    const lp = new THREE.Mesh(new THREE.BoxGeometry(pT, pH, 1.6), cubWall);
    lp.position.set(-1.3, pH / 2, 0); cg.add(lp);
    const lt = new THREE.Mesh(new THREE.BoxGeometry(pT + 0.02, 0.04, 1.64), cubTrim);
    lt.position.set(-1.3, pH, 0); cg.add(lt);
    const rp = new THREE.Mesh(new THREE.BoxGeometry(pT, pH, 1.6), cubWall);
    rp.position.set(1.3, pH / 2, 0); cg.add(rp);
    const rt = new THREE.Mesh(new THREE.BoxGeometry(pT + 0.02, 0.04, 1.64), cubTrim);
    rt.position.set(1.3, pH, 0); cg.add(rt);
    const bp = new THREE.Mesh(new THREE.BoxGeometry(2.66, pH, pT), cubWall);
    bp.position.set(0, pH / 2, -0.8); cg.add(bp);

    // Desk
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.0), wood);
    top.position.y = 0.75; top.castShadow = true; cg.add(top);
    ([-1.0, 1.0] as number[]).forEach(lx => ([-0.45, 0.45] as number[]).forEach(lz => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), metalM);
      leg.position.set(lx, 0.36, lz); cg.add(leg);
    }));

    // Monitor
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), darkM);
    scr.position.set(0, 1.2, -0.3); cg.add(scr);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), metalM);
    stand.position.set(0, 0.9, -0.3); cg.add(stand);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.12), metalM);
    kb.position.set(0, 0.79, 0.1); cg.add(kb);

    // Chair
    const seatM = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), seatM);
    seat.position.set(0, 0.5, 0.65); cg.add(seat);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.05), seatM);
    bk.position.set(0, 0.78, 0.88); cg.add(bk);

    cg.position.set(cx, 0, cz);

    // Collider for the desk
    addCollider(cx, cz - 0.2, 1.3, 0.8);

    return cg;
  };

  // Place cubicles
  Object.values(DESK_POS).forEach(pos => {
    g.add(makeCubicle(pos.x, pos.z));
  });

  // ── BREAK ROOM (south-west area) ──
  // Floor carpet
  const breakCarpet = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), carpetMat);
  breakCarpet.rotation.x = -Math.PI / 2; breakCarpet.position.set(-14, 0.02, 6); g.add(breakCarpet);

  // Partition walls separating break room
  const breakWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 12), partitionMat);
  breakWall1.position.set(-8, 1.75, 6); g.add(breakWall1);
  addCollider(-8, 6, 0.15, 6);
  // Glass top section
  const breakGlass1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 12), glassMat);
  breakGlass1.position.set(-8, 4, 6); g.add(breakGlass1);

  // Doorway gap in south partition (leave opening at z=2)
  const breakWall2a = new THREE.Mesh(new THREE.BoxGeometry(12, 3.5, 0.15), partitionMat);
  breakWall2a.position.set(-14, 1.75, 1); g.add(breakWall2a);
  addCollider(-14, 1, 6, 0.15);

  // Couches
  const makeCouch = (cx: number, cz: number, ry: number) => {
    const cg = new THREE.Group();
    const seatC = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.85), couchMat);
    seatC.position.y = 0.32; cg.add(seatC);
    const backC = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.65, 0.18), couchMat);
    backC.position.set(0, 0.62, -0.38); cg.add(backC);
    // Armrests
    ([-1.15, 1.15] as number[]).forEach(ax => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.85), couchMat);
      arm.position.set(ax, 0.45, 0); cg.add(arm);
    });
    cg.position.set(cx, 0, cz); cg.rotation.y = ry;
    addCollider(cx, cz, 1.3, 0.6);
    return cg;
  };
  g.add(makeCouch(-16, 4, 0));
  g.add(makeCouch(-12, 4, 0));
  g.add(makeCouch(-14, 8, Math.PI));

  // Coffee table
  const ct = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.8), wood);
  ct.position.set(-14, 0.38, 6); g.add(ct);
  addCollider(-14, 6, 0.9, 0.4);
  ([[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]] as [number, number][]).forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 4), metalM);
    leg.position.set(-14 + lx, 0.18, 6 + lz); g.add(leg);
  });

  // Coffee machine
  const coffeeMachine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.6 }));
  coffeeMachine.position.set(-18, 0.9, 10); g.add(coffeeMachine);
  const coffeeCounter = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 0.8), wood);
  coffeeCounter.position.set(-18, 0.5, 10); g.add(coffeeCounter);
  addCollider(-18, 10, 1, 0.5);
  // Coffee cups
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  ([-0.3, 0.3] as number[]).forEach(ox => {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 8), cupMat);
    cup.position.set(-18 + ox, 0.58, 10); g.add(cup);
  });

  // ── MEETING ROOM (south-east area) ──
  const meetCarpet = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x3a3a5a, roughness: 0.95 }));
  meetCarpet.rotation.x = -Math.PI / 2; meetCarpet.position.set(16, 0.02, 8); g.add(meetCarpet);

  // Glass partition walls
  const meetWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.5, 10), glassMat);
  meetWall1.position.set(11, 1.75, 8); g.add(meetWall1);
  // Frame strips
  const meetFrame1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 10), frameMat);
  meetFrame1.position.set(11, 3.5, 8); g.add(meetFrame1);
  addCollider(11, 8, 0.12, 5);

  // Doorway opening at z=4
  const meetWall2a = new THREE.Mesh(new THREE.BoxGeometry(10, 3.5, 0.12), glassMat);
  meetWall2a.position.set(16, 1.75, 3); g.add(meetWall2a);
  addCollider(16, 3, 5, 0.12);

  // Meeting table
  const meetTable = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 2), wood);
  meetTable.position.set(16, 0.75, 8); g.add(meetTable);
  addCollider(16, 8, 2, 1);
  // Table legs
  ([[-1.8, -0.8], [1.8, -0.8], [-1.8, 0.8], [1.8, 0.8]] as [number, number][]).forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), metalM);
    leg.position.set(16 + lx, 0.36, 8 + lz); g.add(leg);
  });

  // Meeting chairs (around table)
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a });
  ([[-1.5, -1.5], [0, -1.5], [1.5, -1.5], [-1.5, 1.5], [0, 1.5], [1.5, 1.5]] as [number, number][]).forEach(([cx, cz]) => {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), chairMat);
    seat.position.set(16 + cx, 0.48, 8 + cz); g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), chairMat);
    back.position.set(16 + cx, 0.73, 8 + cz + (cz > 0 ? 0.27 : -0.27)); g.add(back);
  });

  // Presentation screen in meeting room
  const presScreen = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 0.06), darkM);
  presScreen.position.set(16, 2.5, 12.9); g.add(presScreen);

  // ── RECEPTION / LOBBY (south center) ──
  const receptionDesk = new THREE.Mesh(new THREE.BoxGeometry(4, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.6 }));
  receptionDesk.position.set(0, 0.55, 16); g.add(receptionDesk);
  addCollider(0, 16, 2, 0.6);
  // Reception sign
  const signCv = document.createElement("canvas");
  signCv.width = 512; signCv.height = 128;
  const signCtx = signCv.getContext("2d")!;
  signCtx.fillStyle = "#1a1a2e";
  signCtx.fillRect(0, 0, 512, 128);
  signCtx.fillStyle = "#ffd700";
  signCtx.font = "bold 36px Arial";
  signCtx.textAlign = "center";
  signCtx.fillText("MERCHANT HAUS", 256, 55);
  signCtx.fillStyle = "#888";
  signCtx.font = "18px Arial";
  signCtx.fillText("Operations Terminal", 256, 90);
  const signTex = new THREE.CanvasTexture(signCv);
  const signSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex }));
  signSprite.position.set(0, 3.5, wOff - 0.5);
  signSprite.scale.set(5, 1.25, 1);
  g.add(signSprite);

  // ── TV (east wall, facing west into the office) ──
  // Mount bracket
  const tvBracket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.15), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 }));
  tvBracket.position.set(wOff - 0.3, 2.4, 6); g.add(tvBracket);
  // Bezel
  const tvBezel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 4.2), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
  tvBezel.position.set(wOff - 0.08, 2.8, 6); g.add(tvBezel);
  // Screen
  const tvScreen = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 4.0), new THREE.MeshStandardMaterial({ color: 0x0d1117, emissive: 0x1a2a3a, emissiveIntensity: 0.6 }));
  tvScreen.position.set(wOff - 0.12, 2.8, 6); g.add(tvScreen);
  // TV bottom strip
  const tvStrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 4.2), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  tvStrip.position.set(wOff - 0.08, 1.55, 6); g.add(tvStrip);

  // ── Plants ──
  const plantPositions: [number, number][] = [
    [-20, -20], [20, -20], [-20, 20], [20, 20],
    [-10, 0], [10, 0], [0, -5], [0, 10],
    [-18, -10], [18, -10], [-5, 16], [5, 16],
    [-14, -16], [14, -16],
  ];
  plantPositions.forEach(([px, pz]) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0x7a4f2a }));
    pot.position.set(px, 0.175, pz); g.add(pot);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a1a }));
    trunk.position.set(px, 0.55, pz); g.add(trunk);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 6), new THREE.MeshStandardMaterial({ color: 0x2d7a2d }));
    leaves.position.set(px, 0.95, pz); g.add(leaves);
    addCollider(px, pz, 0.3, 0.3);
  });

  // ── Water cooler ──
  const coolerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3 }));
  coolerBody.position.set(-6, 0.55, 0); g.add(coolerBody);
  const coolerJug = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.4 }));
  coolerJug.position.set(-6, 1.2, 0); g.add(coolerJug);
  addCollider(-6, 0, 0.3, 0.3);

  // ── Ceiling lights ──
  const lightPositions: [number, number][] = [
    [-10, -14], [0, -14], [10, -14],
    [-14, 6], [0, 0], [16, 8],
    [0, 16], [-10, 10], [10, -6],
  ];
  lightPositions.forEach(([lx, lz]) => {
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0xeeeedd, emissive: 0xffffee, emissiveIntensity: 0.3 }));
    fixture.position.set(lx, 4.9, lz); g.add(fixture);
  });

  return g;
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export default function OfficeChat({
  currentUserEmail,
  messages = [],
  onSendMessage,
  presence = {},
  onPositionUpdate,
  remotePositions = {},
}: OfficeChatProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
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
    npcWander: Map<string, NPCWanderState>;
  } | null>(null);

  const isMobile = useIsMobile();
  const [activeChat, setActiveChat] = useState<CRMUser | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [locked, setLocked] = useState(false);
  const [nearby, setNearby] = useState<CRMUser | null>(null);
  const [nearDesk, setNearDesk] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [nearTV, setNearTV] = useState(false);
  const [tvUnmuted, setTvUnmuted] = useState(false);
  const tvOverlayRef = useRef<HTMLDivElement>(null);
  const tvOverlayVisibleRef = useRef(false);
  const tvOverlayRectRef = useRef({ x: -1, y: -1, w: -1, h: -1 });
  const [nearInteract, setNearInteract] = useState<InteractionPoint | null>(null);
  const [isSitting, setIsSitting] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [coffeeEmote, setCoffeeEmote] = useState(false);
  const showTerminalRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speechBubblesRef = useRef<Map<string, { sprite: THREE.Sprite; timeout: ReturnType<typeof setTimeout> }>>(new Map());
  const prevMsgCountRef = useRef<number>(0);
  const joystickRef = useRef({ x: 0, y: 0, active: false });
  const touchLookRef = useRef({ lastX: 0, lastY: 0, active: false });
  const onPositionUpdateRef = useRef(onPositionUpdate);
  onPositionUpdateRef.current = onPositionUpdate;
  const remotePositionsRef = useRef(remotePositions);
  remotePositionsRef.current = remotePositions;
  const lastBroadcastRef = useRef(0);

  const currentUser = USERS.find(u => u.email === currentUserEmail)!;
  const others = USERS.filter(u => u.email !== currentUserEmail);

  useEffect(() => { showTerminalRef.current = showTerminal; }, [showTerminal]);
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
    scene.fog = new THREE.Fog(0x1a1a1a, 20, 55);

    const camera = new THREE.PerspectiveCamera(78, W / H, 0.1, 120); // 78 FOV = more natural FPS
    camera.position.set(SPAWN[currentUserEmail].x, 1.65, SPAWN[currentUserEmail].z + 2.0); // slightly behind desk

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    // Cap pixel ratio — chat view doesn't need retina rendering at full resolution
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sun = new THREE.DirectionalLight(0xfff8f0, 0.65);
    sun.position.set(8, 15, 8); sun.castShadow = true;
    sun.shadow.mapSize.setScalar(1024);
    sun.shadow.camera.left = -ROOM; sun.shadow.camera.right = ROOM;
    sun.shadow.camera.top = ROOM; sun.shadow.camera.bottom = -ROOM;
    scene.add(sun);
    // Fill light
    const fill = new THREE.DirectionalLight(0x8888ff, 0.15);
    fill.position.set(-10, 8, -5); scene.add(fill);

    scene.add(buildRoom());

    // Player mesh hidden in FP view (camera IS the player)
    const playerMesh = buildCharacterMesh(currentUser, true);
    playerMesh.position.copy(SPAWN[currentUserEmail]);
    playerMesh.visible = false;
    scene.add(playerMesh);

    // NPCs
    const npcMeshes = new Map<string, THREE.Group>();
    const onlineIndicators = new Map<string, THREE.Mesh>();

    others.forEach(u => {
      const mesh = buildCharacterMesh(u, false);
      const deskPos = DESK_POS[u.email] || new THREE.Vector3(0, 0, 0);
      mesh.position.copy(deskPos);
      mesh.visible = false;
      scene.add(mesh);
      npcMeshes.set(u.email, mesh);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x22cc44, emissive: 0x22cc44, emissiveIntensity: 1 })
      );
      dot.position.set(0, 2.4 / (u.scale ?? 1), 0);
      mesh.add(dot);
      onlineIndicators.set(u.email, dot);
    });

    // NPC wander — only Atria is autonomous; real users tracked via remotePositions
    const npcWander = new Map<string, NPCWanderState>();
    others.forEach(u => {
      if (u.email === "atria@merchanthaus.io") {
        npcWander.set(u.email, createWanderState());
      }
    });

    const state = {
      renderer, scene, camera, playerMesh, npcMeshes,
      yaw: 0, pitch: 0, locked: false,
      keys: new Set<string>(),
      playerPos: SPAWN[currentUserEmail].clone(),
      raf: 0, onlineIndicators, npcWander,
    };
    stateRef.current = state;

    // Pointer lock (desktop)
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
        state.yaw -= e.movementX * 0.002;
        state.pitch = Math.max(-1.1, Math.min(1.1, state.pitch - e.movementY * 0.002));
      });
    } else {
      state.locked = true; setLocked(true);
      const onTouchStart = (e: TouchEvent) => {
        const t = e.changedTouches[0]; if (!t) return;
        if ((e.target as HTMLElement).closest('.mobile-joystick, .mobile-interact-btn, [class*="Card"], button, input')) return;
        touchLookRef.current = { lastX: t.clientX, lastY: t.clientY, active: true };
      };
      const onTouchMove = (e: TouchEvent) => {
        if (!touchLookRef.current.active) return;
        const t = e.changedTouches[0]; if (!t) return;
        state.yaw -= (t.clientX - touchLookRef.current.lastX) * 0.004;
        state.pitch = Math.max(-1.1, Math.min(1.1, state.pitch - (t.clientY - touchLookRef.current.lastY) * 0.004));
        touchLookRef.current.lastX = t.clientX; touchLookRef.current.lastY = t.clientY;
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
      if (e.key === "Escape") { document.exitPointerLock(); setActiveChat(null); }
    };
    const onUp = (e: KeyboardEvent) => state.keys.delete(e.key.toLowerCase());
    document.addEventListener("keydown", onDown);
    document.addEventListener("keyup", onUp);

    // Raycaster for clicking NPCs
    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);
    renderer.domElement.addEventListener("click", () => {
      raycaster.setFromCamera(center, camera);
      const hits = raycaster.intersectObjects(Array.from(npcMeshes.values()), true);
      if (hits.length) {
        npcMeshes.forEach((mesh, email) => {
          if (!mesh.visible) return;
          if (mesh === hits[0].object || mesh.getObjectById(hits[0].object.id)) {
            const user = USERS.find(u => u.email === email);
            if (user) setActiveChat(user);
          }
        });
      }
    });
    npcMeshes.forEach((mesh, email) => { mesh.userData.email = email; });

    // Resize
    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    };
    window.addEventListener("resize", onResize);

    // ── GAME LOOP ──
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    let lastT = 0;

    const loop = (t: number) => {
      state.raf = requestAnimationFrame(loop);
      const dt = Math.min((t - lastT) / 1000, 0.05);
      lastT = t;

      // Camera
      euler.set(state.pitch, state.yaw, 0, "YXZ");
      camera.quaternion.setFromEuler(euler);

      // Movement
      const yawEuler = new THREE.Euler(0, state.yaw, 0, "YXZ");
      const fwd = new THREE.Vector3(0, 0, -1).applyEuler(yawEuler);
      const rgt = new THREE.Vector3(1, 0, 0).applyEuler(yawEuler);
      const spd = 4.5 * dt;
      const jx = joystickRef.current.x;
      const jy = joystickRef.current.y;
      const isPlayerMoving = state.keys.has("w") || state.keys.has("s") || state.keys.has("a") || state.keys.has("d") || joystickRef.current.active;

      if (isPlayerMoving && showTerminalRef.current) {
        showTerminalRef.current = false;
        setShowTerminal(false);
      }
      // Stand up if sitting and moving
      if (isPlayerMoving) {
        setIsSitting(false);
        setShowWhiteboard(false);
      }

      if (!showTerminalRef.current) {
        if (state.keys.has("w")) state.playerPos.addScaledVector(fwd, spd);
        if (state.keys.has("s")) state.playerPos.addScaledVector(fwd, -spd);
        if (state.keys.has("a")) state.playerPos.addScaledVector(rgt, -spd);
        if (state.keys.has("d")) state.playerPos.addScaledVector(rgt, spd);
        if (joystickRef.current.active) {
          state.playerPos.addScaledVector(fwd, -jy * spd);
          state.playerPos.addScaledVector(rgt, jx * spd);
        }
      }

      // Apply collision
      const resolved = resolveCollision(state.playerPos, PLAYER_RADIUS);
      state.playerPos.copy(resolved);

      camera.position.set(state.playerPos.x, 1.65, state.playerPos.z);
      playerMesh.position.set(state.playerPos.x, 0, state.playerPos.z);
      playerMesh.rotation.y = state.yaw + Math.PI;

      // Broadcast position (~10fps)
      if (t - lastBroadcastRef.current > 100) {
        lastBroadcastRef.current = t;
        onPositionUpdateRef.current?.({ x: state.playerPos.x, z: state.playerPos.z, yaw: state.yaw });
      }

      // NPC movement
      const remotePos = remotePositionsRef.current;
      const now = Date.now();

      npcMeshes.forEach((mesh, email) => {
        if (!mesh.visible) return;
        const remote = remotePos[email];
        const isRemoteActive = remote && (now - remote.timestamp < 5000);
        const isAtria = email === "atria@merchanthaus.io";

        if (isAtria) {
          // ── ATRIA: fully autonomous AI wander ──
          const ws = state.npcWander.get(email);
          if (!ws) return;
          const deskPos = DESK_POS[email] || new THREE.Vector3(0, 0, 0);
          if (ws.state === "at_desk") {
            mesh.position.x = deskPos.x;
            mesh.position.z = deskPos.z;
            animateCharacter(mesh, t, false, true);
            ws.deskTimer -= dt;
            if (ws.deskTimer <= 0) {
              ws.state = "walking";
              ws.currentTarget = randomWanderTarget();
              ws.wanderTimer = Math.random() * 15 + 8;
            }
          } else if (ws.state === "idle_at_waypoint") {
            animateCharacter(mesh, t, false, false);
            ws.idleTimer -= dt;
            if (ws.idleTimer <= 0) {
              ws.state = "walking";
              ws.currentTarget = randomWanderTarget();
            }
          } else {
            const wdx = ws.currentTarget.x - mesh.position.x;
            const wdz = ws.currentTarget.z - mesh.position.z;
            const dist = Math.sqrt(wdx * wdx + wdz * wdz);
            if (dist < 0.3) {
              ws.wanderTimer -= dt;
              if (ws.wanderTimer <= 0) {
                ws.state = "at_desk";
                ws.deskTimer = Math.random() * 20 + 10;
              } else {
                ws.state = "idle_at_waypoint";
                ws.idleTimer = Math.random() * 3 + 1;
                ws.currentTarget = randomWanderTarget();
              }
            } else {
              const moveSpeed = ws.speed * dt;
              mesh.position.x += (wdx / dist) * moveSpeed;
              mesh.position.z += (wdz / dist) * moveSpeed;
              const npcResolved = resolveCollision(mesh.position, 0.3);
              mesh.position.copy(npcResolved);
              mesh.rotation.y = Math.atan2(wdx / dist, wdz / dist);
              animateCharacter(mesh, t, true, false);
              ws.wanderTimer -= dt;
            }
          }
        } else if (isRemoteActive) {
          // ── REAL USER: live position from Supabase presence ──
          const lerpSpeed = 8 * dt;
          mesh.position.x += (remote.x - mesh.position.x) * lerpSpeed;
          mesh.position.z += (remote.z - mesh.position.z) * lerpSpeed;
          const dx = remote.x - mesh.position.x;
          const dz = remote.z - mesh.position.z;
          const moving = Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05;
          animateCharacter(mesh, t, moving, false);
          mesh.rotation.y = remote.yaw + Math.PI;
        } else {
          // ── REAL USER: offline — stand idle at desk ──
          const deskPos = DESK_POS[email] || new THREE.Vector3(0, 0, 0);
          mesh.position.lerp(deskPos, 4 * dt);
          animateCharacter(mesh, t, false, true); // sitting at desk
        }
      });

      // Nearby NPC detection
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
      // Only trigger re-render when the nearby user actually changes
      setNearby(prev => {
        const prevEmail = prev?.email ?? null;
        const nextEmail = closestUser?.email ?? null;
        return prevEmail === nextEmail ? prev : closestUser;
      });

      // Desk proximity — only update React state when value changes
      {
        let deskNear = false;
        if (!closestUser) {
          Object.entries(DESK_POS).forEach(([email, pos]) => {
            if (email === currentUserEmail) return;
            const ws = state.npcWander.get(email);
            const npcMesh = npcMeshes.get(email);
            const npcAtDesk = npcMesh?.visible && ws?.state === "at_desk";
            if (npcAtDesk) return;
            if (state.playerPos.distanceTo(pos) < INTERACT_DIST) deskNear = true;
          });
        }
        setNearDesk(prev => prev === deskNear ? prev : deskNear);
      }

      // TV proximity
      {
        const nextNearTV = state.playerPos.distanceTo(TV_POS) < 3.5 && !closestUser;
        setNearTV(prev => prev === nextNearTV ? prev : nextNearTV);
      }

      // Interaction point proximity
      let closestIP: InteractionPoint | null = null;
      let closestIPDist = Infinity;
      for (const ip of INTERACT_POINTS) {
        const d = state.playerPos.distanceTo(ip.pos);
        if (d < ip.radius && d < closestIPDist) {
          closestIPDist = d;
          closestIP = ip;
        }
      }
      setNearInteract(prev => {
        // Compare by id to avoid unnecessary re-renders
        if (prev?.id === closestIP?.id) return prev;
        return closestIP;
      });

      // Project TV screen onto 2D overlay — direct DOM manipulation to avoid re-renders
      {
        const tvEl = tvOverlayRef.current;
        if (tvEl) {
          // Match exact tvScreen mesh: pos (wOff-0.12, 2.8, 6), size (0.06, 2.3, 4.0)
          // wOff = ROOM = 22, so screen x = 21.88, half-h = 1.15, half-w = 2.0
          // Shrink projection corners slightly inward to crop tightly to visible screen area
          const screenX = ROOM - 0.12;
          const screenY = 2.8;
          const screenZ = 6;
          const halfH = 1.1;  // slightly less than 1.15 to crop bezel overlap
          const halfW = 1.92; // slightly less than 2.0 to crop bezel overlap
          const tvCenter = new THREE.Vector3(screenX, screenY, screenZ);
          const tvTL = new THREE.Vector3(screenX, screenY + halfH, screenZ - halfW);
          const tvBR = new THREE.Vector3(screenX, screenY - halfH, screenZ + halfW);

          const toTV = tvCenter.clone().sub(camera.position);
          const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          const dot = toTV.normalize().dot(camDir);
          const dist = camera.position.distanceTo(tvCenter);

          const centerCam = tvCenter.clone().applyMatrix4(camera.matrixWorldInverse);
          const tlCam = tvTL.clone().applyMatrix4(camera.matrixWorldInverse);
          const brCam = tvBR.clone().applyMatrix4(camera.matrixWorldInverse);
          const nearClipBuffer = camera.near + 0.06;
          const fullyInFrontOfNearPlane =
            centerCam.z < -nearClipBuffer &&
            tlCam.z < -nearClipBuffer &&
            brCam.z < -nearClipBuffer;

          const tooCloseToProject = dist < 2.6;

          if (dot > 0.12 && dist < 30 && !tooCloseToProject && fullyInFrontOfNearPlane) {
            const tl = tvTL.clone().project(camera);
            const br = tvBR.clone().project(camera);
            const cw = renderer.domElement.clientWidth;
            const ch = renderer.domElement.clientHeight;

            const sx1 = (tl.x * 0.5 + 0.5) * cw;
            const sy1 = (-tl.y * 0.5 + 0.5) * ch;
            const sx2 = (br.x * 0.5 + 0.5) * cw;
            const sy2 = (-br.y * 0.5 + 0.5) * ch;

            const x = Math.min(sx1, sx2);
            const y = Math.min(sy1, sy2);
            const w = Math.abs(sx2 - sx1);
            const h = Math.abs(sy2 - sy1);

            // Reject unstable/off-screen projections instead of clamping (prevents edge bars/flashes)
            const clipValid = tl.z >= -1 && tl.z <= 1 && br.z >= -1 && br.z <= 1;
            const onScreen = x >= 0 && y >= 0 && (x + w) <= cw && (y + h) <= ch;
            const bigEnough = w > 20 && h > 12;
            const notFullscreenSized = w < cw * 0.95 && h < ch * 0.95;

            if (clipValid && onScreen && bigEnough && notFullscreenSized && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h)) {
              const nx = Math.round(x);
              const ny = Math.round(y);
              const nw = Math.round(w);
              const nh = Math.round(h);
              const prev = tvOverlayRectRef.current;

              if (
                Math.abs(prev.x - nx) > 1 ||
                Math.abs(prev.y - ny) > 1 ||
                Math.abs(prev.w - nw) > 1 ||
                Math.abs(prev.h - nh) > 1
              ) {
                tvEl.style.left = `${nx}px`;
                tvEl.style.top = `${ny}px`;
                tvEl.style.width = `${nw}px`;
                tvEl.style.height = `${nh}px`;
                tvOverlayRectRef.current = { x: nx, y: ny, w: nw, h: nh };
              }

              if (!tvOverlayVisibleRef.current) {
                tvOverlayVisibleRef.current = true;
                tvEl.style.visibility = 'visible';
                tvEl.style.opacity = '1';
              }
            } else if (tvOverlayVisibleRef.current) {
              tvOverlayVisibleRef.current = false;
              tvEl.style.visibility = 'hidden';
              tvEl.style.opacity = '0';
            }
          } else if (tvOverlayVisibleRef.current) {
            tvOverlayVisibleRef.current = false;
            tvEl.style.visibility = 'hidden';
            tvEl.style.opacity = '0';
          }
        }
      }

      renderer.render(scene, camera);
    };
    state.raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(state.raf);
      document.removeEventListener("keydown", onDown);
      document.removeEventListener("keyup", onUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = "";
      stateRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserEmail]);

  // "E" key interactions
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
        } else if (nearInteract && !activeChat && !showTerminal) {
          if (nearInteract.action === "sit") {
            setIsSitting(prev => !prev);
          } else if (nearInteract.action === "whiteboard") {
            setShowWhiteboard(true);
            document.exitPointerLock();
          } else if (nearInteract.action === "coffee") {
            setCoffeeEmote(true);
            setTimeout(() => setCoffeeEmote(false), 3000);
          } else if (nearInteract.action === "tv") {
            setTvUnmuted(prev => !prev);
          }
        }
      }
      if (e.key === "Escape") {
        if (showTerminal) setShowTerminal(false);
        if (showWhiteboard) setShowWhiteboard(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nearby, activeChat, nearDesk, showTerminal, nearTV, nearInteract, showWhiteboard]);

  // Presence sync
  useEffect(() => {
    const s = stateRef.current; if (!s) return;
    // Real users are ALWAYS visible — greyed out when offline, full color when online
    // Only Atria is always "online" as she's an AI agent
    s.npcMeshes.forEach((mesh, email) => {
      mesh.visible = true; // Always show — offline state shown via grey material tint
      // Dim offline users by traversing and adjusting material opacity
      const isOnline = email === "atria@merchanthaus.io" ? true : (presence[email] ?? false);
      mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat && typeof mat.opacity !== undefined) {
            mat.opacity = isOnline ? 1.0 : 0.45;
            mat.transparent = !isOnline;
          }
        }
      });
    });
    s.onlineIndicators.forEach((dot, email) => {
      const isOnline = email === "atria@merchanthaus.io" ? true : (presence[email] ?? false);
      (dot.material as THREE.MeshStandardMaterial).color.setHex(isOnline ? 0x22cc44 : 0x555555);
      (dot.material as THREE.MeshStandardMaterial).emissive.setHex(isOnline ? 0x22cc44 : 0x222222);
      dot.visible = true;
    });
  }, [presence]);

  // 3D speech bubbles
  useEffect(() => {
    const s = stateRef.current;
    if (!s || messages.length <= prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length; return;
    }
    const newMsgs = messages.slice(prevMsgCountRef.current);
    prevMsgCountRef.current = messages.length;

    newMsgs.forEach(msg => {
      const senderEmail = msg.fromEmail;
      if (senderEmail === currentUserEmail) return;
      const npcMesh = s.npcMeshes.get(senderEmail);
      if (!npcMesh || !npcMesh.visible) return;
      const existing = speechBubblesRef.current.get(senderEmail);
      if (existing) { npcMesh.remove(existing.sprite); clearTimeout(existing.timeout); }
      const cv = document.createElement("canvas");
      cv.width = 512; cv.height = 128;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      const pad = 16, w = cv.width - pad * 2, h = cv.height - pad * 2, r = 20;
      ctx.beginPath();
      ctx.moveTo(pad + r, pad); ctx.lineTo(pad + w - r, pad);
      ctx.quadraticCurveTo(pad + w, pad, pad + w, pad + r);
      ctx.lineTo(pad + w, pad + h - r);
      ctx.quadraticCurveTo(pad + w, pad + h, pad + w - r, pad + h);
      ctx.lineTo(pad + w * 0.35, pad + h); ctx.lineTo(pad + w * 0.25, pad + h + 14);
      ctx.lineTo(pad + w * 0.2, pad + h); ctx.lineTo(pad + r, pad + h);
      ctx.quadraticCurveTo(pad, pad + h, pad, pad + h - r);
      ctx.lineTo(pad, pad + r); ctx.quadraticCurveTo(pad, pad, pad + r, pad);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#1a1a1a"; ctx.font = "bold 22px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(msg.body.length > 40 ? msg.body.slice(0, 37) + "…" : msg.body, cv.width / 2, cv.height / 2);
      const tex = new THREE.CanvasTexture(cv);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      const userScale = USERS.find(u => u.email === senderEmail)?.scale ?? 1;
      sprite.position.y = 2.8 / userScale; sprite.scale.set(3 / userScale, 0.8 / userScale, 1);
      npcMesh.add(sprite);
      const timeout = setTimeout(() => { npcMesh.remove(sprite); speechBubblesRef.current.delete(senderEmail); }, 8000);
      speechBubblesRef.current.set(senderEmail, { sprite, timeout });
    });
  }, [messages, currentUserEmail]);

  const handleSend = useCallback(() => {
    if (!inputVal.trim() || !activeChat) return;
    onSendMessage?.(activeChat.email, inputVal.trim());
    setInputVal("");
  }, [inputVal, activeChat, onSendMessage]);

  const chatMessages = activeChat
    ? messages.filter(m =>
        (m.fromEmail === currentUserEmail && m.toEmail === activeChat.email) ||
        (m.fromEmail === activeChat.email && m.toEmail === currentUserEmail)
      )
    : [];

  // Determine current interaction prompt
  const interactPrompt = nearInteract && !activeChat && !showTerminal && !showWhiteboard
    ? nearInteract.label
    : null;

  return (
    <div className="relative w-full h-full select-none">
      <div ref={mountRef} className="w-full h-full" />

      {/* Lock hint */}
      {!isMobile && !locked && !activeChat && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Badge variant="secondary" className="text-sm px-4 py-2 bg-black/70 text-white border-0">
            🖱️ Click to look around
          </Badge>
        </div>
      )}

      {/* Crosshair */}
      {!isMobile && locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-4 h-4 relative">
            <div className="absolute left-1/2 top-0 w-px h-full bg-white/70 -translate-x-1/2" />
            <div className="absolute top-1/2 left-0 h-px w-full bg-white/70 -translate-y-1/2" />
          </div>
        </div>
      )}

      {/* Coffee emote */}
      {coffeeEmote && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 pointer-events-none z-30 animate-bounce">
          <span className="text-5xl">☕</span>
        </div>
      )}

      {/* Sitting indicator */}
      {isSitting && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <Badge className="bg-primary/80 text-primary-foreground border-0 text-xs px-3 py-1">
            🪑 Sitting — move to stand up
          </Badge>
        </div>
      )}

      {/* Interaction prompt (generic) */}
      {!isMobile && interactPrompt && !nearby && !nearDesk && !nearTV && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <Badge className="bg-black/80 text-white border-0 text-sm px-4 py-2">
            Press <kbd className="mx-1 px-1 bg-white/20 rounded">E</kbd> {interactPrompt}
          </Badge>
        </div>
      )}

      {/* Nearby desk prompt */}
      {nearDesk && !activeChat && !showTerminal && !isMobile && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <Badge className="bg-black/80 text-white border-0 text-sm px-4 py-2">
            Press <kbd className="mx-1 px-1 bg-white/20 rounded">E</kbd> to use terminal
          </Badge>
        </div>
      )}

      {/* Near TV */}
      {nearTV && !activeChat && !showTerminal && !isMobile && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <Badge className="bg-black/80 text-white border-0 text-sm px-4 py-2">
            Press <kbd className="mx-1 px-1 bg-white/20 rounded">E</kbd> to {tvUnmuted ? "mute" : "unmute"} TV
          </Badge>
        </div>
      )}

      {/* Near NPC */}
      {nearby && !activeChat && !showTerminal && !isMobile && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <Badge className="bg-black/80 text-white border-0 text-sm px-4 py-2">
            Press <kbd className="mx-1 px-1 bg-white/20 rounded">E</kbd> or click to chat with {nearby.name}
          </Badge>
        </div>
      )}

      {/* Chat UI */}
      {activeChat && (
        <div className={`absolute z-10 ${isMobile ? "inset-x-2 bottom-2" : "bottom-4 left-1/2 -translate-x-1/2 w-[480px] max-w-[90vw]"}`}>
          <div ref={scrollRef} className="flex flex-col gap-1.5 mb-2 max-h-40 overflow-hidden">
            {chatMessages.slice(-4).map(msg => {
              const isMe = msg.fromEmail === currentUserEmail;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`relative max-w-[80%] px-3 py-1.5 text-sm leading-snug ${
                    isMe ? "bg-primary/90 text-primary-foreground rounded-2xl rounded-br-sm" : "bg-black/80 text-white rounded-2xl rounded-bl-sm"
                  }`} style={{ backdropFilter: "blur(8px)" }}>
                    {!isMe && <span className="text-[10px] font-semibold text-white/60 block -mb-0.5">{activeChat.name}</span>}
                    <span className="line-clamp-2">{msg.body}</span>
                  </div>
                </div>
              );
            })}
          </div>
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
            <Button size="sm" className="h-7 px-3 rounded-full bg-primary hover:bg-primary/80 text-primary-foreground text-xs" onClick={handleSend}>
              Send
            </Button>
            <button onClick={() => setActiveChat(null)} className="text-white/40 hover:text-white text-sm leading-none ml-1">✕</button>
          </div>
        </div>
      )}

      {/* Terminal */}
      {showTerminal && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="relative flex flex-col items-center">
            <div className="rounded-xl overflow-hidden shadow-2xl" style={{ background: "linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #0e0e0e 100%)", padding: "18px 18px 8px 18px", border: "2px solid #333" }}>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] font-bold tracking-widest text-white/30 uppercase">OPS Terminal</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[9px] text-white/20">ONLINE</span>
                </div>
              </div>
              <div className="relative rounded-sm overflow-hidden" style={{ width: "min(75vw, 900px)", height: "min(65vh, 560px)", boxShadow: "inset 0 0 60px rgba(0,0,0,0.5)" }}>
                <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)" }} />
                <iframe src={window.location.origin + "/dashboard"} className="w-full h-full border-0" title="OPS Terminal" />
              </div>
            </div>
            <div className="w-16 h-8" style={{ background: "linear-gradient(180deg, #1a1a1a, #111)", clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)" }} />
            <div className="w-28 h-2 rounded-full" style={{ background: "linear-gradient(180deg, #222, #0e0e0e)" }} />
          </div>
          <button onClick={() => setShowTerminal(false)} className="absolute top-6 right-6 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors backdrop-blur-sm">
            ESC to close
          </button>
        </div>
      )}

      {/* Whiteboard overlay */}
      {showWhiteboard && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-xl shadow-2xl p-6" style={{ width: "min(80vw, 700px)", height: "min(60vh, 500px)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-900">📋 Whiteboard</h3>
              <button onClick={() => setShowWhiteboard(false)} className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm text-gray-700">Close</button>
            </div>
            <div className="w-full h-[calc(100%-48px)] bg-gray-50 rounded border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
              <p className="text-center">Whiteboard — collaborative space coming soon<br/><span className="text-xs">Use the chat to share ideas with your team</span></p>
            </div>
          </div>
        </div>
      )}

      {/* TV — projected onto 3D wall via ref (no React re-renders) */}
      <div
        ref={tvOverlayRef}
        className="absolute z-10 overflow-hidden pointer-events-none bg-black"
        style={{ visibility: 'hidden', opacity: 0, transition: 'opacity 120ms linear', willChange: 'transform, width, height' }}
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/T0C9d8anDT4?autoplay=1&mute=${tvUnmuted ? "0" : "1"}&loop=1&playlist=T0C9d8anDT4&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`}
          className="w-full h-full border-0 pointer-events-none bg-black"
          title="Office TV"
          allow="autoplay; encrypted-media; picture-in-picture"
          style={{ pointerEvents: "none", backgroundColor: "#000" }}
        />
      </div>

      {/* Controls hint */}
      {!isMobile && (
        <div className="absolute top-3 left-3 pointer-events-none">
          <Badge variant="outline" className="bg-black/60 text-white/60 border-white/10 text-xs">
            WASD move · Mouse look · E interact · ESC release
          </Badge>
        </div>
      )}

      {/* Minimap */}
      {!isMobile && locked && (
        <div className="absolute top-3 right-3 z-10">
          <div className="w-32 h-32 rounded-lg bg-black/70 border border-white/10 overflow-hidden relative">
            <span className="absolute top-0.5 left-1 text-[7px] text-white/30 uppercase tracking-wider">Map</span>
            {/* Player dot */}
            <div className="absolute w-2 h-2 rounded-full bg-yellow-400 shadow-sm shadow-yellow-400/50" style={{
              left: `${((stateRef.current?.playerPos.x ?? 0) / ROOM + 1) * 50}%`,
              top: `${(1 - (stateRef.current?.playerPos.z ?? 0) / ROOM) * 50}%`,
              transform: "translate(-50%, -50%)",
            }} />
            {/* Room outlines */}
            <div className="absolute border border-white/10" style={{ left: "2%", top: "2%", width: "96%", height: "96%" }} />
            {/* Break room */}
            <div className="absolute border border-white/8 bg-white/5" style={{ left: "4%", top: "36%", width: "30%", height: "30%" }} />
            {/* Meeting room */}
            <div className="absolute border border-white/8 bg-white/5" style={{ left: "66%", top: "36%", width: "30%", height: "30%" }} />
          </div>
        </div>
      )}

      {/* Mobile controls */}
      {isMobile && !activeChat && !showTerminal && !showWhiteboard && (
        <>
          <div
            className="mobile-joystick absolute bottom-6 left-6 z-20"
            style={{ width: 120, height: 120 }}
            onTouchStart={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
              const t = e.touches[0];
              joystickRef.current = { x: Math.max(-1, Math.min(1, (t.clientX - cx) / (rect.width / 2))), y: Math.max(-1, Math.min(1, (t.clientY - cy) / (rect.height / 2))), active: true };
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
              const t = e.touches[0];
              joystickRef.current = { x: Math.max(-1, Math.min(1, (t.clientX - cx) / (rect.width / 2))), y: Math.max(-1, Math.min(1, (t.clientY - cy) / (rect.height / 2))), active: true };
            }}
            onTouchEnd={() => { joystickRef.current = { x: 0, y: 0, active: false }; }}
          >
            <div className="w-full h-full rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/30 border border-white/40" />
            </div>
          </div>

          {(nearby || nearDesk || nearTV || nearInteract) && (
            <button
              className="mobile-interact-btn absolute bottom-8 right-8 z-20 w-16 h-16 rounded-full bg-primary/80 text-white font-bold text-xs flex items-center justify-center border-2 border-white/30 active:scale-90 transition-transform"
              onTouchStart={(e) => {
                e.stopPropagation();
                if (nearby) setActiveChat(nearby);
                else if (nearTV) setTvUnmuted(prev => !prev);
                else if (nearDesk) setShowTerminal(true);
                else if (nearInteract) {
                  if (nearInteract.action === "sit") setIsSitting(prev => !prev);
                  else if (nearInteract.action === "whiteboard") setShowWhiteboard(true);
                  else if (nearInteract.action === "coffee") { setCoffeeEmote(true); setTimeout(() => setCoffeeEmote(false), 3000); }
                }
              }}
            >
              {nearby ? `Chat\n${nearby.name}` : nearTV ? (tvUnmuted ? "Mute" : "Unmute") : nearDesk ? "Terminal" : nearInteract?.label ?? "Interact"}
            </button>
          )}

          {(nearby || nearDesk || nearTV || nearInteract) && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-none z-20">
              <Badge className="bg-black/80 text-white border-0 text-xs px-3 py-1">
                {nearby ? `Near ${nearby.name}` : nearTV ? "Near TV" : nearDesk ? "Near Terminal" : nearInteract?.label ?? ""}
              </Badge>
            </div>
          )}

          <div className="absolute top-3 left-3 pointer-events-none z-20">
            <Badge variant="outline" className="bg-black/60 text-white/60 border-white/10 text-[10px]">
              Drag to look · Joystick to move
            </Badge>
          </div>
        </>
      )}

      {/* Mobile close buttons */}
      {isMobile && showTerminal && (
        <button onClick={() => setShowTerminal(false)} className="absolute top-4 right-4 z-30 px-3 py-2 rounded-lg bg-white/10 text-white text-xs font-medium backdrop-blur-sm">✕ Close</button>
      )}
      {isMobile && showWhiteboard && (
        <button onClick={() => setShowWhiteboard(false)} className="absolute top-4 right-4 z-30 px-3 py-2 rounded-lg bg-white/10 text-white text-xs font-medium backdrop-blur-sm">✕ Close</button>
      )}
    </div>
  );
}
