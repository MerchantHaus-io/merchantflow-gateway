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

export interface ActionItemNote {
  id: string;
  title: string;
  completed: boolean;
  created_by_email: string;
}

interface OfficeChatProps {
  currentUserEmail: string;
  messages?: ChatMessage[];
  onSendMessage?: (to: string, body: string) => void;
  presence?: Record<string, boolean>;
  onPositionUpdate?: (pos: { x: number; z: number; yaw: number }) => void;
  remotePositions?: Record<string, RemotePosition>;
  actionItems?: ActionItemNote[];
}

// ── USERS ─────────────────────────────────────────────────────────────────────

const USERS: CRMUser[] = [
  { email: "taryn@merchanthaus.io", name: "Taryn", title: "Operations", shirtColor: 0xe05a2b, hairColor: 0x3a1a08, skinColor: 0xffcba8, hairstyle: "bob", scale: 1.0 },
  { email: "admin@merchanthaus.io", name: "Jamie", title: "Admin", shirtColor: 0x3a7bd5, hairColor: 0xd4b96a, skinColor: 0xffe0bb, stubble: true, stubbleColor: 0xc8aa70, scale: 1.0 },
  { email: "sales@merchanthaus.io", name: "Wesley", title: "Sales", shirtColor: 0x2eaa5e, hairColor: 0x1a3a1a, skinColor: 0xffdbac, prostheticLeg: true, scale: 1.15 },
  { email: "support@merchanthaus.io", name: "Sheiky", title: "Support", shirtColor: 0x9b30d0, hairColor: 0x2a1a40, skinColor: 0xd4a574, beard: true, beardColor: 0x9a9a9a, scale: 1.08 },
  { email: "onboarding@merchanthaus.io", name: "Darryn", title: "Dev", shirtColor: 0xd03060, hairColor: 0x3a1010, skinColor: 0xffdbac, scale: 1.0 },
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
  "onboarding@merchanthaus.io":  new THREE.Vector3(2,   0, -8),
  "atria@merchanthaus.io":   new THREE.Vector3(10,  0, -8),
};
// Chair offset: chairs sit at z+0.65 relative to cubicle center
const CHAIR_OFFSET = new THREE.Vector3(0, 0, 0.65);
function chairPos(email: string): THREE.Vector3 {
  const d = DESK_POS[email];
  return d ? d.clone().add(CHAIR_OFFSET) : new THREE.Vector3(0, 0, 0);
}
const SPAWN: Record<string, THREE.Vector3> = {};
Object.keys(DESK_POS).forEach(email => { SPAWN[email] = chairPos(email); });

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
  state: "walking" | "idle_at_waypoint" | "at_desk" | "walking_to_user" | "at_whiteboard" | "getting_coffee" | "visiting";
  intentState?: AtriaIntent | null;
  lastIdleStart?: number;
  speechBubble?: THREE.Sprite | null;
  speechTimer?: number;
}

interface AtriaIntent {
  priority: number;
  targetPos: THREE.Vector3;
  reason: "chat" | "thinking" | "coffee" | "visit" | "wander";
  targetEmail?: string;
  message?: string;
  duration: number; // seconds to stay at destination
  elapsed: number;
}

function randomWanderTarget(): THREE.Vector3 {
  const zones = [
    { cx: 0, cz: 2, hw: 8, hd: 4 },
    { cx: -14, cz: 6, hw: 5, hd: 5 },
    { cx: 14, cz: 6, hw: 4, hd: 4 },
    { cx: 0, cz: 14, hw: 6, hd: 4 },
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
    intentState: null,
    lastIdleStart: Date.now(),
    speechBubble: null,
    speechTimer: 0,
  };
}

// ── ATRIA INTENT QUEUE ────────────────────────────────────────────────────────

const atriaIntentQueue: AtriaIntent[] = [];

function queueAtriaIntent(intent: AtriaIntent) {
  // Remove lower-priority intents of same reason
  const idx = atriaIntentQueue.findIndex(i => i.reason === intent.reason);
  if (idx >= 0) atriaIntentQueue.splice(idx, 1);
  atriaIntentQueue.push(intent);
  atriaIntentQueue.sort((a, b) => a.priority - b.priority);
}

function popAtriaIntent(): AtriaIntent | null {
  return atriaIntentQueue.shift() ?? null;
}

// ── SPEECH BUBBLE ─────────────────────────────────────────────────────────────

function createSpeechBubbleTexture(text: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  // Rounded rect background
  const pad = 16;
  const r = 20;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(pad + r, pad);
  ctx.lineTo(canvas.width - pad - r, pad);
  ctx.quadraticCurveTo(canvas.width - pad, pad, canvas.width - pad, pad + r);
  ctx.lineTo(canvas.width - pad, canvas.height - pad - r);
  ctx.quadraticCurveTo(canvas.width - pad, canvas.height - pad, canvas.width - pad - r, canvas.height - pad);
  ctx.lineTo(pad + r, canvas.height - pad);
  ctx.quadraticCurveTo(pad, canvas.height - pad, pad, canvas.height - pad - r);
  ctx.lineTo(pad, pad + r);
  ctx.quadraticCurveTo(pad, pad, pad + r, pad);
  ctx.closePath();
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(124,58,237,0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Text
  ctx.fillStyle = "#1a1a2e";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const displayText = text.length > 30 ? text.slice(0, 28) + "…" : text;
  ctx.fillText(displayText, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function showSpeechBubble(mesh: THREE.Group, ws: NPCWanderState, text: string, scene: THREE.Scene) {
  // Remove existing
  if (ws.speechBubble) {
    scene.remove(ws.speechBubble);
    ws.speechBubble.material.dispose();
    (ws.speechBubble.material as THREE.SpriteMaterial).map?.dispose();
    ws.speechBubble = null;
  }

  const mat = new THREE.SpriteMaterial({
    map: createSpeechBubbleTexture(text),
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3, 0.75, 1);
  sprite.position.copy(mesh.position);
  sprite.position.y = 2.4;
  scene.add(sprite);
  ws.speechBubble = sprite;
  ws.speechTimer = 4; // seconds to display
}

function updateSpeechBubble(ws: NPCWanderState, mesh: THREE.Group, dt: number, scene: THREE.Scene) {
  if (!ws.speechBubble) return;
  ws.speechTimer = (ws.speechTimer ?? 0) - dt;
  ws.speechBubble.position.x = mesh.position.x;
  ws.speechBubble.position.z = mesh.position.z;
  ws.speechBubble.position.y = 2.4;
  if (ws.speechTimer! <= 0) {
    // Fade out
    const mat = ws.speechBubble.material as THREE.SpriteMaterial;
    mat.opacity -= dt * 2;
    if (mat.opacity <= 0) {
      scene.remove(ws.speechBubble);
      mat.dispose();
      mat.map?.dispose();
      ws.speechBubble = null;
    }
  }
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
  // TV (east wall)
  { id: "tv", pos: new THREE.Vector3(20, 0, 6), label: "Toggle TV", action: "tv", radius: 3.5 },
  // TV2 (north wall, near desks)
  { id: "tv2", pos: new THREE.Vector3(0, 0, -20), label: "Toggle News", action: "tv2", radius: 3.5 },
];

const INTERACT_DIST = 2.5;
const TV_POS = new THREE.Vector3(20, 0, 6);   // East wall
const TV2_POS = new THREE.Vector3(0, 0, -20); // North wall, near desks

/**
 * Compute a CSS matrix3d string that maps a rectangle (0,0)-(w,h)
 * to an arbitrary quadrilateral defined by 4 destination points [TL, TR, BR, BL].
 * Uses a projective (homography) transform so the overlay follows perspective correctly.
 */
function computeMatrix3d(
  w: number, h: number,
  dst: { x: number; y: number }[]
): string | null {
  // Source corners: TL(0,0), TR(w,0), BR(w,h), BL(0,h)
  // Destination corners: dst[0]=TL, dst[1]=TR, dst[2]=BR, dst[3]=BL
  // Solve for 3x3 homography matrix H such that H * src_i = dst_i (in homogeneous coords)
  const [tl, tr, br, bl] = dst;

  // Build 8x8 system for homography (a,b,c,d,e,f,g,h) where i=1
  // Each point gives 2 equations:
  // x'(1+g*x+h*y) = a*x + b*y + c
  // y'(1+g*x+h*y) = d*x + e*y + f
  const srcPts = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const dstPts = [tl, tr, br, bl];

  // Construct matrix A and vector b for Ax = b
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const sx = srcPts[i].x, sy = srcPts[i].y;
    const dx = dstPts[i].x, dy = dstPts[i].y;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    B.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    B.push(dy);
  }

  // Gaussian elimination
  const n = 8;
  const M = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-10) return null;
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = M[row][n];
    for (let col = row + 1; col < n; col++) x[row] -= M[row][col] * x[col];
    x[row] /= M[row][row];
    if (!Number.isFinite(x[row])) return null;
  }

  const [a, b, c, d, e, f, g, hh] = x;
  // CSS matrix3d maps (x,y,0,1) → column-major 4x4
  // H = [[a,b,c],[d,e,f],[g,h,1]] in row-major
  // CSS matrix3d is column-major: matrix3d(m11,m21,m31,m41, m12,m22,m32,m42, ...)
  return `matrix3d(${a},${d},0,${g}, ${b},${e},0,${hh}, 0,0,1,0, ${c},${f},0,1)`;
}

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
  // New premium materials
  const accentWallWest = new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.75 });
  const accentWallEast = new THREE.MeshStandardMaterial({ color: 0x3a2a28, roughness: 0.75 });
  const baseBoardMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
  const artFrameMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
  const bookMat1 = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
  const bookMat2 = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7 });
  const bookMat3 = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.7 });
  const bookMat4 = new THREE.MeshStandardMaterial({ color: 0x1e3a3a, roughness: 0.7 });

  COLLIDERS.length = 0;

  const FS = ROOM * 2;
  const wOff = ROOM;

  // ── Floor ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FS, FS), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);

  // Floor tiles — herringbone pattern in lobby
  for (let x = -ROOM; x < ROOM; x += 2) for (let z = -ROOM; z < ROOM; z += 2) {
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ((x + z) / 2) % 2 === 0 ? tileMat1 : tileMat2);
    tile.position.set(x + 1, 0.01, z + 1); tile.rotation.x = -Math.PI / 2; g.add(tile);
  }

  // ── Outer walls with accent colors ──
  const addWall = (w: number, h: number, x: number, y: number, z: number, ry: number, mat?: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat || wallMat);
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m);
  };
  addWall(FS, 5, 0, 2.5, -wOff, 0);                              // North
  addWall(FS, 5, -wOff, 2.5, 0, Math.PI / 2, accentWallWest);   // West (accent)
  addWall(FS, 5, wOff, 2.5, 0, -Math.PI / 2, accentWallEast);   // East (accent)
  addWall(FS, 5, 0, 2.5, wOff, Math.PI);                          // South

  // Wall colliders
  addCollider(0, -wOff, wOff, 0.3);
  addCollider(0, wOff, wOff, 0.3);
  addCollider(-wOff, 0, 0.3, wOff);
  addCollider(wOff, 0, 0.3, wOff);

  // ── Baseboards (all 4 walls) ──
  const bbH = 0.15, bbD = 0.04;
  const bbNorth = new THREE.Mesh(new THREE.BoxGeometry(FS, bbH, bbD), baseBoardMat);
  bbNorth.position.set(0, bbH / 2, -wOff + bbD / 2); g.add(bbNorth);
  const bbSouth = new THREE.Mesh(new THREE.BoxGeometry(FS, bbH, bbD), baseBoardMat);
  bbSouth.position.set(0, bbH / 2, wOff - bbD / 2); g.add(bbSouth);
  const bbWest = new THREE.Mesh(new THREE.BoxGeometry(bbD, bbH, FS), baseBoardMat);
  bbWest.position.set(-wOff + bbD / 2, bbH / 2, 0); g.add(bbWest);
  const bbEast = new THREE.Mesh(new THREE.BoxGeometry(bbD, bbH, FS), baseBoardMat);
  bbEast.position.set(wOff - bbD / 2, bbH / 2, 0); g.add(bbEast);

  // ── Ceiling panels ──
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95 });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(FS, FS), ceilingMat);
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 5; g.add(ceiling);
  // Ceiling grid lines (acoustic tile effect)
  for (let cx = -ROOM; cx <= ROOM; cx += 4) {
    const gridLine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, FS), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    gridLine.position.set(cx, 4.99, 0); g.add(gridLine);
  }
  for (let cz = -ROOM; cz <= ROOM; cz += 4) {
    const gridLine = new THREE.Mesh(new THREE.BoxGeometry(FS, 0.02, 0.04), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    gridLine.position.set(0, 4.99, cz); g.add(gridLine);
  }

  // ── Windows (north wall) ──
  ([-6, 0, 6] as number[]).forEach(x => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.6), winG);
    win.position.set(x, 3, -(wOff - 0.05)); g.add(win);
    ([-0.85, 0.85] as number[]).forEach(oy => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.06, 0.05), frameMat);
      b.position.set(x, 3 + oy, -(wOff - 0.08)); g.add(b);
    });
    ([-1.35, 1.35] as number[]).forEach(ox => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.05), frameMat);
      b.position.set(x + ox, 3, -(wOff - 0.08)); g.add(b);
    });
    // Window sill
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.06, 0.15), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 }));
    sill.position.set(x, 2.1, -(wOff - 0.1)); g.add(sill);
    // Daylight glow behind window
    const wLight = new THREE.PointLight(0xddeeff, 0.3, 8);
    wLight.position.set(x, 3, -(wOff - 0.5)); g.add(wLight);
  });

  // ── Wall Art (west wall — 3 abstract pieces) ──
  const artColors = [0x3b82f6, 0xef4444, 0x22c55e];
  ([-12, 0, 12] as number[]).forEach((az, i) => {
    // Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 2.8), artFrameMat);
    frame.position.set(-wOff + 0.08, 2.8, az); g.add(frame);
    // Canvas
    const canvas = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 1.7, 2.4),
      new THREE.MeshStandardMaterial({ color: artColors[i], roughness: 0.6, emissive: artColors[i], emissiveIntensity: 0.05 })
    );
    canvas.position.set(-wOff + 0.12, 2.8, az); g.add(canvas);
    // Accent light
    const artLight = new THREE.SpotLight(0xfff8f0, 0.3, 4, Math.PI / 8, 0.8, 2);
    artLight.position.set(-wOff + 0.5, 4.5, az);
    artLight.target.position.set(-wOff + 0.1, 2.8, az);
    g.add(artLight); g.add(artLight.target);
  });

  // ── Bookshelf (meeting room east wall) ──
  const shelfX = wOff - 0.5, shelfZ = 4;
  const shelfFrame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 2.0), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.6 }));
  shelfFrame.position.set(shelfX, 1.3, shelfZ); g.add(shelfFrame);
  addCollider(shelfX, shelfZ, 0.3, 1);
  // Shelves
  for (let sy = 0.5; sy <= 2.3; sy += 0.6) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 2.02), wood);
    shelf.position.set(shelfX, sy, shelfZ); g.add(shelf);
  }
  // Books on shelves
  const bookMats = [bookMat1, bookMat2, bookMat3, bookMat4];
  for (let sy = 0.55; sy <= 2.0; sy += 0.6) {
    for (let bz = shelfZ - 0.8; bz < shelfZ + 0.8; bz += 0.14 + Math.random() * 0.06) {
      const bh = 0.3 + Math.random() * 0.18;
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, bh, 0.1),
        bookMats[Math.floor(Math.random() * bookMats.length)]
      );
      book.position.set(shelfX, sy + bh / 2, bz);
      g.add(book);
    }
  }

  // ── Whiteboard (north wall center) ──
  const wb = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
  wb.position.set(0, 2.2, -(wOff - 0.1)); g.add(wb);
  const wbTray = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.05, 0.12), metalM);
  wbTray.position.set(0, 1.28, -(wOff - 0.08)); g.add(wbTray);
  // Whiteboard marker dots
  ([0xef4444, 0x3b82f6, 0x22c55e, 0x111111] as number[]).forEach((mc, i) => {
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6), new THREE.MeshStandardMaterial({ color: mc }));
    marker.rotation.z = Math.PI / 2;
    marker.position.set(-1.2 + i * 0.15, 1.3, -(wOff - 0.05)); g.add(marker);
  });

  // ── DESK TOY DEFINITIONS (per-user personalisation) ──
  type DeskToyBuilder = (cg: THREE.Group) => void;

  const deskToys: Record<string, DeskToyBuilder> = {
    // Taryn: small succulent plant
    "taryn@merchanthaus.io": (cg) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.06, 8), new THREE.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.7 }));
      pot.position.set(0.75, 0.81, 0.05); cg.add(pot);
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.01, 8), new THREE.MeshStandardMaterial({ color: 0x3e2723 }));
      soil.position.set(0.75, 0.84, 0.05); cg.add(soil);
      [0, 1.2, 2.4, 3.6, 5.0].forEach(a => {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshStandardMaterial({ color: 0x4caf50 }));
        leaf.scale.set(1, 0.5, 1.3);
        leaf.position.set(0.75 + Math.cos(a) * 0.015, 0.86 + Math.random() * 0.015, 0.05 + Math.sin(a) * 0.015);
        cg.add(leaf);
      });
    },
    // Jamie: small rubber duck
    "admin@merchanthaus.io": (cg) => {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfdd835 }));
      body.scale.set(1, 0.85, 1.1);
      body.position.set(0.75, 0.81, 0.05); cg.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfdd835 }));
      head.position.set(0.75, 0.86, 0.03); cg.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.015, 6), new THREE.MeshStandardMaterial({ color: 0xff8f00 }));
      beak.rotation.x = -Math.PI / 2; beak.position.set(0.75, 0.855, 0.01); cg.add(beak);
      const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.003, 4, 4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      eye1.position.set(0.74, 0.868, 0.015); cg.add(eye1);
      const eye2 = eye1.clone(); eye2.position.set(0.76, 0.868, 0.015); cg.add(eye2);
    },
    // Wesley: mini trophy
    "sales@merchanthaus.io": (cg) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 }));
      base.position.set(0.75, 0.79, 0.05); cg.add(base);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.05, 6), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 }));
      stem.position.set(0.75, 0.82, 0.05); cg.add(stem);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.015, 0.03, 8), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 }));
      cup.position.set(0.75, 0.86, 0.05); cg.add(cup);
    },
    // Sheiky: stress ball
    "support@merchanthaus.io": (cg) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.9 }));
      ball.position.set(0.75, 0.81, 0.05); cg.add(ball);
    },
    // Darryn: mini globe
    "onboarding@merchanthaus.io": (cg) => {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0x5d4037 }));
      stand.position.set(0.75, 0.79, 0.05); cg.add(stand);
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 4), new THREE.MeshStandardMaterial({ color: 0x9e9e9e, metalness: 0.6 }));
      axle.position.set(0.75, 0.83, 0.05); cg.add(axle);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), new THREE.MeshStandardMaterial({ color: 0x42a5f5, roughness: 0.4 }));
      globe.position.set(0.75, 0.85, 0.05); cg.add(globe);
    },
    // Atria: crystal / holographic orb
    "atria@merchanthaus.io": (cg) => {
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.028, 1), new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.8 }));
      orb.position.set(0.75, 0.84, 0.05); cg.add(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.003, 6, 16), new THREE.MeshStandardMaterial({ color: 0xc0c0ff, metalness: 0.6 }));
      ring.position.set(0.75, 0.84, 0.05); ring.rotation.x = Math.PI / 3; cg.add(ring);
    },
  };

  // ── CUBICLE BUILDER ──
  const makeCubicle = (cx: number, cz: number, email?: string) => {
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
    const monStand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), metalM);
    monStand.position.set(0, 0.9, -0.3); cg.add(monStand);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.12), metalM);
    kb.position.set(0, 0.79, 0.1); cg.add(kb);

    // Chair (with armrests and wheels)
    const seatM = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), seatM);
    seat.position.set(0, 0.5, 0.65); cg.add(seat);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.05), seatM);
    bk.position.set(0, 0.78, 0.88); cg.add(bk);
    // Chair armrests
    ([-0.27, 0.27] as number[]).forEach(ax => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.35), seatM);
      arm.position.set(ax, 0.62, 0.72); cg.add(arm);
    });
    // Chair base (star)
    const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.46, 6), metalM);
    chairBase.position.set(0, 0.25, 0.65); cg.add(chairBase);

    // ── Photo frame on desk ──
    const frameBorder = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.03), new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.5 }));
    frameBorder.position.set(-0.7, 1.0, -0.2); frameBorder.rotation.x = -0.15; cg.add(frameBorder);
    const framePhoto = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.01), new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.4 }));
    framePhoto.position.set(-0.7, 1.0, -0.185); framePhoto.rotation.x = -0.15; cg.add(framePhoto);

    // ── Pen holder ──
    const penHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0x444444 }));
    penHolder.position.set(0.65, 0.83, -0.1); cg.add(penHolder);
    // Pens
    ([0.01, -0.015, 0.02] as number[]).forEach((px, i) => {
      const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 4), new THREE.MeshStandardMaterial({ color: [0x2255aa, 0xaa2222, 0x222222][i] }));
      pen.position.set(0.65 + px, 0.93, -0.1 + (i - 1) * 0.012); cg.add(pen);
    });

    // ── Coffee mug ──
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.3 }));
    mug.position.set(0.4, 0.82, 0.2); cg.add(mug);
    const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 8, Math.PI), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
    mugHandle.position.set(0.435, 0.82, 0.2); mugHandle.rotation.z = Math.PI / 2; cg.add(mugHandle);

    // ── Nameplate ──
    if (email) {
      const usr = USERS.find(u => u.email === email);
      if (usr) {
        // Nameplate base (dark wood wedge)
        const npBase = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.06, 0.1),
          new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.4 })
        );
        npBase.position.set(0, 0.81, 0.4); cg.add(npBase);

        // Nameplate label (brass plate)
        const npLabel = new THREE.Mesh(
          new THREE.BoxGeometry(0.36, 0.04, 0.005),
          new THREE.MeshStandardMaterial({ color: 0xd4a843, metalness: 0.7, roughness: 0.3 })
        );
        npLabel.position.set(0, 0.85, 0.35); npLabel.rotation.x = -0.3; cg.add(npLabel);

        // Name text via canvas texture
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 48;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#3e2723";
        ctx.fillRect(0, 0, 256, 48);
        ctx.fillStyle = "#f5e6c8";
        ctx.font = "bold 22px Georgia, serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(usr.name.toUpperCase(), 128, 24);
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        const npText = new THREE.Mesh(
          new THREE.PlaneGeometry(0.34, 0.038),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true })
        );
        npText.position.set(0, 0.852, 0.347); npText.rotation.x = -0.3; cg.add(npText);
      }
    }

    // ── Desk toy (unique per user) ──
    if (email && deskToys[email]) {
      deskToys[email](cg);
    }

    // ── Sticky notes ──
    const stickyColors = [0xffeb3b, 0xff9800, 0x4caf50];
    stickyColors.forEach((col, i) => {
      const sticky = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.002), new THREE.MeshStandardMaterial({ color: col }));
      sticky.position.set(-0.35 + i * 0.14, 0.79, 0.3);
      sticky.rotation.x = -Math.PI / 2;
      sticky.rotation.z = (i - 1) * 0.15;
      cg.add(sticky);
    });

    cg.position.set(cx, 0, cz);

    // Collider for the desk only (not the chair area so player can sit)
    addCollider(cx, cz - 0.2, 1.3, 0.6);

    return cg;
  };

  // Place cubicles
  Object.entries(DESK_POS).forEach(([email, pos]) => {
    g.add(makeCubicle(pos.x, pos.z, email));
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

  // ── MEETING ROOM (south-east area, against east wall) ──
  // Room spans roughly x:11→22(east wall), z:3→13
  const meetCarpet = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x3a3a5a, roughness: 0.95 }));
  meetCarpet.rotation.x = -Math.PI / 2; meetCarpet.position.set(16, 0.02, 8); g.add(meetCarpet);

  // West glass wall (x=11, z:3→13) with doorway gap at z=7→9
  const meetWestA = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.5, 4), glassMat);
  meetWestA.position.set(11, 1.75, 5); g.add(meetWestA); // z:3→7
  addCollider(11, 5, 0.12, 2);
  const meetWestB = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.5, 4), glassMat);
  meetWestB.position.set(11, 1.75, 11); g.add(meetWestB); // z:9→13
  addCollider(11, 11, 0.12, 2);
  // Frame strips on west wall
  const meetFrameWA = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 4), frameMat);
  meetFrameWA.position.set(11, 3.5, 5); g.add(meetFrameWA);
  const meetFrameWB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 4), frameMat);
  meetFrameWB.position.set(11, 3.5, 11); g.add(meetFrameWB);
  // Doorway header
  const meetDoorHeader = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 2), glassMat);
  meetDoorHeader.position.set(11, 3.1, 8); g.add(meetDoorHeader);

  // South glass wall (z=3, x:11→21)
  const meetSouth = new THREE.Mesh(new THREE.BoxGeometry(10, 3.5, 0.12), glassMat);
  meetSouth.position.set(16, 1.75, 3); g.add(meetSouth);
  addCollider(16, 3, 5, 0.12);
  const meetFrameS = new THREE.Mesh(new THREE.BoxGeometry(10, 0.06, 0.14), frameMat);
  meetFrameS.position.set(16, 3.5, 3); g.add(meetFrameS);

  // North glass wall (z=13, x:11→21)
  const meetNorth = new THREE.Mesh(new THREE.BoxGeometry(10, 3.5, 0.12), glassMat);
  meetNorth.position.set(16, 1.75, 13); g.add(meetNorth);
  addCollider(16, 13, 5, 0.12);
  const meetFrameN = new THREE.Mesh(new THREE.BoxGeometry(10, 0.06, 0.14), frameMat);
  meetFrameN.position.set(16, 3.5, 13); g.add(meetFrameN);

  // East side is the outer wall — no glass needed

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

  // Presentation screen on east wall inside meeting room
  const presScreen = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 3), darkM);
  presScreen.position.set(wOff - 0.05, 2.5, 10); g.add(presScreen);

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
  // Bezel glow — thin emissive strip around inner edge
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, emissive: 0x2266aa, emissiveIntensity: 0.45, transparent: true, opacity: 0.7 });
  const glowTop = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 4.05), glowMat);
  glowTop.position.set(wOff - 0.14, 2.8 + 1.17, 6); g.add(glowTop);
  const glowBot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 4.05), glowMat);
  glowBot.position.set(wOff - 0.14, 2.8 - 1.17, 6); g.add(glowBot);
  const glowLeft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.3, 0.04), glowMat);
  glowLeft.position.set(wOff - 0.14, 2.8, 6 - 2.03); g.add(glowLeft);
  const glowRight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.3, 0.04), glowMat);
  glowRight.position.set(wOff - 0.14, 2.8, 6 + 2.03); g.add(glowRight);
  // Ambient glow light behind TV
  const tvGlow = new THREE.PointLight(0x2266aa, 0.6, 6);
  tvGlow.position.set(wOff - 0.5, 2.8, 6); g.add(tvGlow);
  // Screen
  const tvScreen = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 4.0), new THREE.MeshStandardMaterial({ color: 0x0d1117, emissive: 0x1a2a3a, emissiveIntensity: 0.6 }));
  tvScreen.position.set(wOff - 0.12, 2.8, 6); g.add(tvScreen);
  // TV bottom strip
  const tvStrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 4.2), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  tvStrip.position.set(wOff - 0.08, 1.55, 6); g.add(tvStrip);

  // ── TV2 (north wall, facing south into cubicle area) ──
  const nWall = -ROOM; // z = -22
  const tv2X = 0;
  const tv2Y = 2.8;
  const tv2Z = nWall + 0.12;
  // Mount bracket
  const tv2Bracket = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 }));
  tv2Bracket.position.set(tv2X, 2.4, nWall + 0.3); g.add(tv2Bracket);
  // Bezel
  const tv2Bezel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
  tv2Bezel.position.set(tv2X, tv2Y, tv2Z + 0.04); g.add(tv2Bezel);
  // Bezel glow strips
  const glow2Mat = new THREE.MeshStandardMaterial({ color: 0x2a1a1a, emissive: 0xaa4422, emissiveIntensity: 0.4, transparent: true, opacity: 0.7 });
  const g2Top = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.04, 0.02), glow2Mat);
  g2Top.position.set(tv2X, tv2Y + 1.02, tv2Z + 0.1); g.add(g2Top);
  const g2Bot = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.04, 0.02), glow2Mat);
  g2Bot.position.set(tv2X, tv2Y - 1.02, tv2Z + 0.1); g.add(g2Bot);
  const g2Left = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.02), glow2Mat);
  g2Left.position.set(tv2X - 1.73, tv2Y, tv2Z + 0.1); g.add(g2Left);
  const g2Right = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.02), glow2Mat);
  g2Right.position.set(tv2X + 1.73, tv2Y, tv2Z + 0.1); g.add(g2Right);
  // Ambient glow behind TV2
  const tv2Glow = new THREE.PointLight(0xaa4422, 0.5, 5);
  tv2Glow.position.set(tv2X, tv2Y, nWall - 0.3); g.add(tv2Glow);
  // Screen
  const tv2Screen = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.0, 0.06), new THREE.MeshStandardMaterial({ color: 0x0d1117, emissive: 0x2a1a1a, emissiveIntensity: 0.5 }));
  tv2Screen.position.set(tv2X, tv2Y, tv2Z + 0.08); g.add(tv2Screen);
  // Bottom strip
  const tv2Strip = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  tv2Strip.position.set(tv2X, tv2Y - 1.1, tv2Z + 0.04); g.add(tv2Strip);

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

  // ── Water cooler (enhanced) ──
  const coolerBase = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.45), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4 }));
  coolerBase.position.set(-6, 0.04, 0); g.add(coolerBase);
  const coolerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.85, 12), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3 }));
  coolerBody.position.set(-6, 0.505, 0); g.add(coolerBody);
  const coolerJug = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.38, 12), new THREE.MeshStandardMaterial({ color: 0x88ccee, transparent: true, opacity: 0.35 }));
  coolerJug.position.set(-6, 1.15, 0); g.add(coolerJug);
  // Water level inside jug
  const waterLevel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.25, 12), new THREE.MeshStandardMaterial({ color: 0x4488cc, transparent: true, opacity: 0.2 }));
  waterLevel.position.set(-6, 1.08, 0); g.add(waterLevel);
  // Spout
  const spout = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.12), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.5, roughness: 0.3 }));
  spout.position.set(-6, 0.6, 0.18); g.add(spout);
  addCollider(-6, 0, 0.3, 0.3);

  // ── Area rug — lobby center ──
  const lobbyRug = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshStandardMaterial({ color: 0x4a3a5a, roughness: 0.98 }));
  lobbyRug.rotation.x = -Math.PI / 2; lobbyRug.position.set(0, 0.015, 14); g.add(lobbyRug);
  // Rug border
  const rugBorder = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 5.4), new THREE.MeshStandardMaterial({ color: 0x3a2a4a, roughness: 0.98 }));
  rugBorder.rotation.x = -Math.PI / 2; rugBorder.position.set(0, 0.012, 14); g.add(rugBorder);

  // ── Ceiling spotlights (warm downlighters) ──
  const lightPositions: [number, number][] = [
    [-10, -14], [0, -14], [10, -14],
    [-14, 6], [0, 0], [16, 8],
    [0, 16], [-10, 10], [10, -6],
  ];
  lightPositions.forEach(([lx, lz]) => {
    // Small recessed housing — dark, nearly invisible
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.18, 0.06, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 })
    );
    housing.position.set(lx, 4.97, lz); g.add(housing);
    // Warm bulb glow dot
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xffcc66, emissiveIntensity: 0.5 })
    );
    bulb.position.set(lx, 4.94, lz); g.add(bulb);
    // Spotlight pointing down
    const spot = new THREE.SpotLight(0xffe8c0, 0.6, 12, Math.PI / 5, 0.6, 1.5);
    spot.position.set(lx, 4.9, lz);
    spot.target.position.set(lx, 0, lz);
    g.add(spot);
    g.add(spot.target);
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
  actionItems = [],
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
  const [deskView, setDeskView] = useState<"computer" | "photo" | null>(null);
  const [photoFrameUrl, setPhotoFrameUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [nearTV, setNearTV] = useState(false);
  const tvOverlayRef = useRef<HTMLDivElement>(null);
  const tvIframeRef = useRef<HTMLIFrameElement>(null);
  const tvOverlayVisibleRef = useRef(false);
  const tvVolumeRef = useRef(-1); // last sent volume (0-100)

  // TV2 state (north wall, live feed)
  const [nearTV2, setNearTV2] = useState(false);
  const tv2OverlayRef = useRef<HTMLDivElement>(null);
  const tv2IframeRef = useRef<HTMLIFrameElement>(null);
  const tv2OverlayVisibleRef = useRef(false);
  const tv2OverlayRectRef = useRef({ x: -1, y: -1, w: -1, h: -1 });
  const tv2VolumeRef = useRef(-1);

  // Randomised YouTube playlist for the office TV
  const TV_PLAYLIST = useRef(['T0C9d8anDT4', 'oM9WfDBRNcg']).current;
  const [tvVideoId] = useState(() => TV_PLAYLIST[Math.floor(Math.random() * TV_PLAYLIST.length)]);
  const TV2_VIDEO_ID = '9siH2meEaGI'; // Live feed

  // Unmute both TVs on first load so proximity volume works
  const tvInitRef = useRef(false);
  useEffect(() => {
    if (tvInitRef.current) return;
    const timer = setTimeout(() => {
      tvInitRef.current = true;
      [tvIframeRef, tv2IframeRef].forEach(ref => {
        const iframe = ref.current;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [0] }), '*');
        }
      });
    }, 3000); // wait for iframes to load
    return () => clearTimeout(timer);
  }, []);

  const tvOverlayRectRef = useRef({ x: -1, y: -1, w: -1, h: -1 });
  const [nearInteract, setNearInteract] = useState<InteractionPoint | null>(null);
  const [isSitting, setIsSitting] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [coffeeEmote, setCoffeeEmote] = useState(false);
  const [currentZone, setCurrentZone] = useState("Office");
  const [selectedStickyIndex, setSelectedStickyIndex] = useState<number | null>(null);
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

    // Lighting — warmer, more atmospheric
    scene.add(new THREE.AmbientLight(0xfff5e8, 0.35));
    const sun = new THREE.DirectionalLight(0xfff0d0, 0.55);
    sun.position.set(8, 15, 8); sun.castShadow = true;
    sun.shadow.mapSize.setScalar(2048);
    sun.shadow.camera.left = -ROOM; sun.shadow.camera.right = ROOM;
    sun.shadow.camera.top = ROOM; sun.shadow.camera.bottom = -ROOM;
    scene.add(sun);
    // Fill light (cool complement)
    const fill = new THREE.DirectionalLight(0x8899cc, 0.12);
    fill.position.set(-10, 8, -5); scene.add(fill);
    // Warm rim light from south (reception area glow)
    const rim = new THREE.DirectionalLight(0xffddaa, 0.15);
    rim.position.set(0, 6, 20); scene.add(rim);
    // Hemisphere light for natural sky/ground bounce
    const hemi = new THREE.HemisphereLight(0xddeeff, 0x443322, 0.2);
    scene.add(hemi);

    // ── Plumbob (classic Sims diamond above player) ──
    const plumbobGeo = new THREE.OctahedronGeometry(0.15, 0);
    const plumbobMat = new THREE.MeshStandardMaterial({
      color: 0x22cc44, emissive: 0x22cc44, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.8, metalness: 0.3, roughness: 0.2
    });
    const plumbob = new THREE.Mesh(plumbobGeo, plumbobMat);
    plumbob.scale.set(1, 1.6, 1);
    scene.add(plumbob);

    // ── Click-to-move marker ──
    const moveMarkerGeo = new THREE.RingGeometry(0.2, 0.35, 4);
    const moveMarkerMat = new THREE.MeshBasicMaterial({ color: 0x22cc44, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const moveMarker = new THREE.Mesh(moveMarkerGeo, moveMarkerMat);
    moveMarker.rotation.x = -Math.PI / 2;
    moveMarker.rotation.z = Math.PI / 4;
    moveMarker.visible = false;
    scene.add(moveMarker);
    let clickMoveTarget: THREE.Vector3 | null = null;
    let moveMarkerLife = 0;

    // Raycaster for click-to-move
    const raycaster = new THREE.Raycaster();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const clickHandler = (e: MouseEvent) => {
      if (state.locked || activeChat) return; // only in unlocked free-cam mode
      if (e.button !== 2) return; // right-click to move
      e.preventDefault();
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(floorPlane, hit)) {
        // Clamp to room bounds
        hit.x = Math.max(-ROOM + 1, Math.min(ROOM - 1, hit.x));
        hit.z = Math.max(-ROOM + 1, Math.min(ROOM - 1, hit.z));
        clickMoveTarget = hit;
        moveMarker.position.set(hit.x, 0.05, hit.z);
        moveMarker.visible = true;
        moveMarkerLife = 3; // seconds
      }
    };
    renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
    renderer.domElement.addEventListener("mousedown", clickHandler);

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
      const cp = chairPos(u.email);
      mesh.position.copy(cp);
      mesh.rotation.y = Math.PI; // face toward monitor (negative Z)
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
    const npcRaycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);
    renderer.domElement.addEventListener("click", () => {
      npcRaycaster.setFromCamera(center, camera);
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

      // Cancel click-to-move if player uses keyboard/joystick
      if (isPlayerMoving) clickMoveTarget = null;

      if (isPlayerMoving && showTerminalRef.current) {
        showTerminalRef.current = false;
        setShowTerminal(false);
      }
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

        // Click-to-move autopilot
        if (clickMoveTarget) {
          const dx = clickMoveTarget.x - state.playerPos.x;
          const dz = clickMoveTarget.z - state.playerPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 0.5) {
            clickMoveTarget = null;
            moveMarker.visible = false;
          } else {
            const ms = spd * 0.8;
            state.playerPos.x += (dx / dist) * ms;
            state.playerPos.z += (dz / dist) * ms;
            // Face toward target
            state.yaw = Math.atan2(dx, dz);
          }
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
          // ── ATRIA: autonomous AI with intent-driven behavior ──
          const ws = state.npcWander.get(email);
          if (!ws) return;
          const deskPos = DESK_POS[email] || new THREE.Vector3(0, 0, 0);

          // Update speech bubble position / fade
          updateSpeechBubble(ws, mesh, dt, state.scene);

          // Check intent queue if idle
          if (!ws.intentState && (ws.state === "at_desk" || ws.state === "idle_at_waypoint" || ws.state === "walking")) {
            const nextIntent = popAtriaIntent();
            if (nextIntent) {
              ws.intentState = nextIntent;
              ws.currentTarget = nextIntent.targetPos.clone();
              ws.state = nextIntent.reason === "chat" ? "walking_to_user"
                : nextIntent.reason === "thinking" ? "walking" // walk to whiteboard
                : nextIntent.reason === "coffee" ? "getting_coffee"
                : nextIntent.reason === "visit" ? "visiting"
                : "walking";
            }
          }

          // Idle timeout → queue coffee or visit
          if (!ws.intentState && ws.state === "at_desk") {
            const idleSec = (now - (ws.lastIdleStart ?? now)) / 1000;
            if (idleSec > 60 && Math.random() < 0.002) {
              // Visit a random team desk
              const otherEmails = Object.keys(DESK_POS).filter(e => e !== email);
              const pick = otherEmails[Math.floor(Math.random() * otherEmails.length)];
              queueAtriaIntent({
                priority: 4,
                targetPos: DESK_POS[pick].clone().add(new THREE.Vector3(1, 0, 1)),
                reason: "visit",
                targetEmail: pick,
                duration: 4,
                elapsed: 0,
              });
            } else if (idleSec > 30 && Math.random() < 0.003) {
              // Get coffee
              const coffeePt = INTERACT_POINTS.find(p => p.action === "coffee");
              if (coffeePt) {
                queueAtriaIntent({
                  priority: 3,
                  targetPos: coffeePt.pos.clone(),
                  reason: "coffee",
                  duration: 4,
                  elapsed: 0,
                });
              }
            }
          }

          // State machine
          if (ws.state === "at_desk") {
            const cp = chairPos(email);
            mesh.position.x = cp.x;
            mesh.position.z = cp.z;
            mesh.rotation.y = Math.PI;
            animateCharacter(mesh, t, false, true);
            ws.deskTimer -= dt;
            if (ws.deskTimer <= 0) {
              ws.state = "walking";
              ws.currentTarget = randomWanderTarget();
              ws.wanderTimer = Math.random() * 15 + 8;
              ws.lastIdleStart = now;
            }
          } else if (ws.state === "idle_at_waypoint" || ws.state === "at_whiteboard") {
            animateCharacter(mesh, t, false, false);
            if (ws.intentState) {
              ws.intentState.elapsed += dt;
              if (ws.intentState.elapsed >= ws.intentState.duration) {
                // Show response snippet if chat
                if (ws.intentState.reason === "chat" && ws.intentState.message) {
                  showSpeechBubble(mesh, ws, ws.intentState.message, state.scene);
                }
                ws.intentState = null;
                ws.state = "walking";
                ws.currentTarget = chairPos(email);
              }
            } else {
              ws.idleTimer -= dt;
              if (ws.idleTimer <= 0) {
                ws.state = "walking";
                ws.currentTarget = randomWanderTarget();
              }
            }
          } else if (ws.state === "getting_coffee" || ws.state === "walking_to_user" || ws.state === "visiting") {
            // Walking toward an intent target
            const wdx = ws.currentTarget.x - mesh.position.x;
            const wdz = ws.currentTarget.z - mesh.position.z;
            const dist = Math.sqrt(wdx * wdx + wdz * wdz);
            if (dist < 0.5) {
              // Arrived at intent destination
              if (ws.state === "walking_to_user") {
                showSpeechBubble(mesh, ws, "...", state.scene);
              }
              ws.state = ws.state === "getting_coffee" ? "idle_at_waypoint" : ws.state === "walking_to_user" ? "idle_at_waypoint" : "idle_at_waypoint";
            } else {
              const moveSpeed = ws.speed * dt;
              mesh.position.x += (wdx / dist) * moveSpeed;
              mesh.position.z += (wdz / dist) * moveSpeed;
              const npcResolved = resolveCollision(mesh.position, 0.3);
              mesh.position.copy(npcResolved);
              mesh.rotation.y = Math.atan2(wdx / dist, wdz / dist);
              animateCharacter(mesh, t, true, false);
            }
          } else {
            // Default walking state
            const wdx = ws.currentTarget.x - mesh.position.x;
            const wdz = ws.currentTarget.z - mesh.position.z;
            const dist = Math.sqrt(wdx * wdx + wdz * wdz);
            if (dist < 0.3) {
              ws.wanderTimer -= dt;
              if (ws.wanderTimer <= 0) {
                ws.state = "at_desk";
                ws.deskTimer = Math.random() * 20 + 10;
                ws.lastIdleStart = now;
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
          // ── REAL USER: offline — sitting in chair at desk ──
          const cp = chairPos(email);
          mesh.position.lerp(cp, 4 * dt);
          mesh.rotation.y = Math.PI; // face toward monitor (negative Z)
          animateCharacter(mesh, t, false, true); // sitting in chair
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
            // Skip desks where an NPC is currently sitting (occupied)
            if (email !== currentUserEmail) {
              const ws = state.npcWander.get(email);
              const npcMesh = npcMeshes.get(email);
              const npcAtDesk = npcMesh?.visible && ws?.state === "at_desk";
              if (npcAtDesk) return;
            }
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
      // TV2 proximity
      {
        const nextNearTV2 = state.playerPos.distanceTo(TV2_POS) < 3.5 && !closestUser;
        setNearTV2(prev => prev === nextNearTV2 ? prev : nextNearTV2);
      }

      // ── Proximity-based TV volume ──
      // TV1 (boardroom, east wall): audible within ~12 units, full at <3
      // TV2 (office, north wall): audible within ~15 units, full at <3
      {
        const distTV1 = state.playerPos.distanceTo(TV_POS);
        const distTV2 = state.playerPos.distanceTo(TV2_POS);

        // TV1: starts audible at 12 units, full volume at 3 units
        const tv1Vol = Math.round(Math.max(0, Math.min(100, (1 - (distTV1 - 3) / 9) * 80)));
        // TV2: starts audible at 15 units, full volume at 3 units  
        const tv2Vol = Math.round(Math.max(0, Math.min(100, (1 - (distTV2 - 3) / 12) * 80)));

        if (Math.abs(tv1Vol - tvVolumeRef.current) >= 3) {
          tvVolumeRef.current = tv1Vol;
          const iframe = tvIframeRef.current;
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [tv1Vol] }), '*');
          }
        }
        if (Math.abs(tv2Vol - tv2VolumeRef.current) >= 3) {
          tv2VolumeRef.current = tv2Vol;
          const iframe = tv2IframeRef.current;
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [tv2Vol] }), '*');
          }
        }
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

      // Project TV screen onto 2D overlay with perspective-correct matrix3d
      {
        const tvEl = tvOverlayRef.current;
        if (tvEl) {
          const screenX = ROOM - 0.12;
          const screenY = 2.8;
          const screenZ = 6;
          const halfH = 1.1;
          const halfW = 1.92;
          const tvCenter = new THREE.Vector3(screenX, screenY, screenZ);
          // 4 corners in 3D: TL, TR, BR, BL (TV faces west, so Z- is left, Z+ is right)
          const corners3D = [
            new THREE.Vector3(screenX, screenY + halfH, screenZ - halfW), // TL
            new THREE.Vector3(screenX, screenY + halfH, screenZ + halfW), // TR
            new THREE.Vector3(screenX, screenY - halfH, screenZ + halfW), // BR
            new THREE.Vector3(screenX, screenY - halfH, screenZ - halfW), // BL
          ];

          const toTV = tvCenter.clone().sub(camera.position);
          const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          const dot = toTV.normalize().dot(camDir);
          const dist = camera.position.distanceTo(tvCenter);

          const nearClipBuffer = camera.near + 0.06;
          const allInFront = corners3D.every(c => {
            const cam = c.clone().applyMatrix4(camera.matrixWorldInverse);
            return cam.z < -nearClipBuffer;
          });
          const tooCloseToProject = dist < 2.6;

          if (dot > 0.12 && dist < 30 && !tooCloseToProject && allInFront) {
            const cw = renderer.domElement.clientWidth;
            const ch = renderer.domElement.clientHeight;

            // Project all 4 corners to screen space
            const screenPts = corners3D.map(c => {
              const p = c.clone().project(camera);
              return {
                x: (p.x * 0.5 + 0.5) * cw,
                y: (-p.y * 0.5 + 0.5) * ch,
                z: p.z,
              };
            });

            const clipValid = screenPts.every(p => p.z >= -1 && p.z <= 1);
            const allFinite = screenPts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y));
            // Bounding box checks
            const xs = screenPts.map(p => p.x);
            const ys = screenPts.map(p => p.y);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            const bw = maxX - minX, bh = maxY - minY;
            const onScreen = minX >= -10 && minY >= -10 && maxX <= cw + 10 && maxY <= ch + 10;
            const bigEnough = bw > 20 && bh > 12;
            const notFullscreenSized = bw < cw * 0.95 && bh < ch * 0.95;

            if (clipValid && allFinite && onScreen && bigEnough && notFullscreenSized) {
              // Compute CSS matrix3d to map a fixed-size div to the 4 projected corners
              // The div is sized as the bounding box; we use transform-origin: 0 0
              // and a matrix3d that maps (0,0), (bw,0), (bw,bh), (0,bh) to the 4 screen points
              // offset relative to (minX, minY)
              const dstPts = screenPts.map(p => ({ x: p.x - minX, y: p.y - minY }));
              // [TL, TR, BR, BL] → map from unit rect (0,0)-(bw,bh) to dst
              const sw = bw, sh = bh;
              // Solve perspective transform: src corners (0,0),(sw,0),(sw,sh),(0,sh) → dst
              const m = computeMatrix3d(sw, sh, dstPts);

              if (m) {
                const nx = Math.round(minX);
                const ny = Math.round(minY);
                const nw = Math.round(bw);
                const nh = Math.round(bh);
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
                  tvEl.style.transformOrigin = '0 0';
                  tvEl.style.transform = m;
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
          } else if (tvOverlayVisibleRef.current) {
            tvOverlayVisibleRef.current = false;
            tvEl.style.visibility = 'hidden';
            tvEl.style.opacity = '0';
          }
        }
      }

      // ── TV2 projection (north wall, facing south) ──
      {
        const tv2El = tv2OverlayRef.current;
        if (tv2El) {
          const t2X = 0, t2Y = 2.8, t2Z = -ROOM + 0.20; // screen z slightly in front of wall
          const halfH2 = 0.96, halfW2 = 1.64;
          const tv2Center = new THREE.Vector3(t2X, t2Y, t2Z);
          // TL, TR, BR, BL — TV faces south (+Z), so X- is left from viewer
          const corners2 = [
            new THREE.Vector3(t2X - halfW2, t2Y + halfH2, t2Z),
            new THREE.Vector3(t2X + halfW2, t2Y + halfH2, t2Z),
            new THREE.Vector3(t2X + halfW2, t2Y - halfH2, t2Z),
            new THREE.Vector3(t2X - halfW2, t2Y - halfH2, t2Z),
          ];
          const toTV2 = tv2Center.clone().sub(camera.position);
          const camDir2 = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          const dot2 = toTV2.normalize().dot(camDir2);
          const dist2 = camera.position.distanceTo(tv2Center);
          const nearClipBuffer2 = camera.near + 0.06;
          const allInFront2 = corners2.every(c => c.clone().applyMatrix4(camera.matrixWorldInverse).z < -nearClipBuffer2);
          const tooClose2 = dist2 < 2.6;

          if (dot2 > 0.12 && dist2 < 30 && !tooClose2 && allInFront2) {
            const cw = renderer.domElement.clientWidth;
            const ch = renderer.domElement.clientHeight;
            const screenPts2 = corners2.map(c => {
              const p = c.clone().project(camera);
              return { x: (p.x * 0.5 + 0.5) * cw, y: (-p.y * 0.5 + 0.5) * ch, z: p.z };
            });
            const clipValid2 = screenPts2.every(p => p.z >= -1 && p.z <= 1);
            const allFinite2 = screenPts2.every(p => Number.isFinite(p.x) && Number.isFinite(p.y));
            const xs2 = screenPts2.map(p => p.x), ys2 = screenPts2.map(p => p.y);
            const minX2 = Math.min(...xs2), maxX2 = Math.max(...xs2);
            const minY2 = Math.min(...ys2), maxY2 = Math.max(...ys2);
            const bw2 = maxX2 - minX2, bh2 = maxY2 - minY2;
            const onScreen2 = minX2 >= -10 && minY2 >= -10 && maxX2 <= cw + 10 && maxY2 <= ch + 10;
            const bigEnough2 = bw2 > 20 && bh2 > 12;
            const notFull2 = bw2 < cw * 0.95 && bh2 < ch * 0.95;

            if (clipValid2 && allFinite2 && onScreen2 && bigEnough2 && notFull2) {
              const dstPts2 = screenPts2.map(p => ({ x: p.x - minX2, y: p.y - minY2 }));
              const m2 = computeMatrix3d(bw2, bh2, dstPts2);
              if (m2) {
                const nx2 = Math.round(minX2), ny2 = Math.round(minY2), nw2 = Math.round(bw2), nh2 = Math.round(bh2);
                const prev2 = tv2OverlayRectRef.current;
                if (Math.abs(prev2.x - nx2) > 1 || Math.abs(prev2.y - ny2) > 1 || Math.abs(prev2.w - nw2) > 1 || Math.abs(prev2.h - nh2) > 1) {
                  tv2El.style.left = `${nx2}px`;
                  tv2El.style.top = `${ny2}px`;
                  tv2El.style.width = `${nw2}px`;
                  tv2El.style.height = `${nh2}px`;
                  tv2El.style.transformOrigin = '0 0';
                  tv2El.style.transform = m2;
                  tv2OverlayRectRef.current = { x: nx2, y: ny2, w: nw2, h: nh2 };
                }
                if (!tv2OverlayVisibleRef.current) {
                  tv2OverlayVisibleRef.current = true;
                  tv2El.style.visibility = 'visible';
                  tv2El.style.opacity = '1';
                }
              } else if (tv2OverlayVisibleRef.current) {
                tv2OverlayVisibleRef.current = false;
                tv2El.style.visibility = 'hidden'; tv2El.style.opacity = '0';
              }
            } else if (tv2OverlayVisibleRef.current) {
              tv2OverlayVisibleRef.current = false;
              tv2El.style.visibility = 'hidden'; tv2El.style.opacity = '0';
            }
          } else if (tv2OverlayVisibleRef.current) {
            tv2OverlayVisibleRef.current = false;
            tv2El.style.visibility = 'hidden'; tv2El.style.opacity = '0';
          }
        }
      }

      // ── Plumbob animation ──
      plumbob.position.set(state.playerPos.x, 2.6 + Math.sin(t * 2) * 0.08, state.playerPos.z);
      plumbob.rotation.y = t * 1.5;

      // ── Move marker fade ──
      if (moveMarker.visible) {
        moveMarkerLife -= dt;
        moveMarker.rotation.z += dt * 2;
        moveMarkerMat.opacity = Math.max(0, moveMarkerLife / 3) * 0.7;
        if (moveMarkerLife <= 0 && !clickMoveTarget) moveMarker.visible = false;
      }

      // ── Zone detection ──
      const px = state.playerPos.x, pz = state.playerPos.z;
      let zoneName = "Office";
      if (px < -8 && pz > 1 && pz < 11) zoneName = "Break Room";
      else if (px > 11 && pz > 3 && pz < 13) zoneName = "Meeting Room";
      else if (pz > 12) zoneName = "Reception";
      else if (pz < -5) zoneName = "Cubicles";
      else if (px > -8 && px < 8 && pz > -2 && pz < 6) zoneName = "Lobby";
      // Store for UI — debounced to avoid re-renders every frame
      if ((state as any)._lastZone !== zoneName) {
        (state as any)._lastZone = zoneName;
        setCurrentZone(zoneName);
      }

      renderer.render(scene, camera);
    };
    state.raf = requestAnimationFrame(loop);

    // Listen for atriaIntent events from AtriaFAB
    const handleAtriaIntent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const { targetEmail, reason, message } = detail;

      if (reason === "chat" && targetEmail) {
        // Walk to the sender's desk
        const deskTarget = DESK_POS[targetEmail] || DESK_POS[currentUserEmail];
        if (deskTarget) {
          queueAtriaIntent({
            priority: 1,
            targetPos: deskTarget.clone().add(new THREE.Vector3(1.5, 0, 0.5)),
            reason: "chat",
            targetEmail,
            message,
            duration: 5,
            elapsed: 0,
          });
        }
      } else if (reason === "thinking") {
        const wb = INTERACT_POINTS.find(p => p.action === "whiteboard");
        if (wb) {
          queueAtriaIntent({
            priority: 2,
            targetPos: wb.pos.clone().add(new THREE.Vector3(0, 0, 1.5)),
            reason: "thinking",
            duration: 8,
            elapsed: 0,
          });
        }
      }
    };
    window.addEventListener("atriaIntent", handleAtriaIntent);

    return () => {
      cancelAnimationFrame(state.raf);
      document.removeEventListener("keydown", onDown);
      document.removeEventListener("keyup", onUp);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("atriaIntent", handleAtriaIntent);
      renderer.domElement.removeEventListener("mousedown", clickHandler);
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
        } else if (nearDesk && !activeChat && !showTerminal) {
          setShowTerminal(true); setDeskView("computer");
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
          }
        }
      }
      if (e.key === "Escape") {
        if (showTerminal) { setShowTerminal(false); setDeskView(null); }
        if (showWhiteboard) setShowWhiteboard(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nearby, activeChat, nearDesk, showTerminal, nearInteract, showWhiteboard]);

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
      {!isMobile && interactPrompt && !nearby && !nearDesk && !nearTV && !nearTV2 && (
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
            Press <kbd className="mx-1 px-1 bg-white/20 rounded">E</kbd> to sit at your desk
          </Badge>
        </div>
      )}

      {/* TV prompts removed — volume is now proximity-based */}

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

      {/* Desk View — first-person desk experience */}
      {showTerminal && (
        <div className="absolute inset-0 z-20 overflow-hidden">
          {/* Hidden file input for photo frame */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const url = URL.createObjectURL(file);
                setPhotoFrameUrl(url);
                setDeskView("photo");
              }
            }}
          />

          {/* Office ceiling / wall behind desk */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(180deg, #1a1815 0%, #252018 25%, #302820 45%, #302820 45.1%, transparent 45.1%)"
          }} />

          {/* Back wall with subtle texture */}
          <div className="absolute left-0 right-0 top-0" style={{ height: "45%", background: "linear-gradient(180deg, #2a2520 0%, #353025 80%, #3d352a 100%)" }}>
            {/* Partition walls left & right */}
            <div className="absolute left-0 top-0 bottom-0 w-[8%]" style={{ background: "linear-gradient(90deg, #28231e, #302a22)" }} />
            <div className="absolute right-0 top-0 bottom-0 w-[8%]" style={{ background: "linear-gradient(-90deg, #28231e, #302a22)" }} />
            {/* Overhead cubicle light */}
            <div className="absolute left-1/2 -translate-x-1/2 top-2 w-32 h-1 rounded-full" style={{ background: "rgba(255,230,180,0.15)", boxShadow: "0 0 40px 15px rgba(255,220,160,0.06)" }} />
          </div>

          {/* Desk surface — wood grain with perspective */}
          <div className="absolute left-0 right-0 bottom-0" style={{
            height: "58%",
            background: "linear-gradient(180deg, #5a4630 0%, #6b5438 15%, #7a6040 40%, #8a6d48 70%, #8a6d48 100%)",
            borderTop: "3px solid #4a3a28",
          }}>
            {/* Wood grain lines */}
            <div className="absolute inset-0 opacity-[0.08]" style={{
              backgroundImage: "repeating-linear-gradient(95deg, transparent, transparent 30px, rgba(0,0,0,0.3) 30px, rgba(0,0,0,0.3) 31px)",
            }} />
            {/* Desk edge highlight */}
            <div className="absolute top-0 left-[6%] right-[6%] h-[2px]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,230,180,0.12) 30%, rgba(255,230,180,0.12) 70%, transparent)" }} />

            {/* Desk items placed on the surface */}
            <div className="absolute left-[8%] sm:left-[12%] bottom-[8%] flex items-end gap-4 sm:gap-6">
              {/* Coffee mug */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="w-7 h-8 rounded-b-md bg-white/90 border border-white/60" style={{ boxShadow: "2px 3px 6px rgba(0,0,0,0.3)" }}>
                    <div className="absolute top-1 left-1 right-1 h-2 rounded-sm bg-amber-800/60" />
                  </div>
                  <div className="absolute top-1 -right-1.5 w-2 h-3 rounded-r-full border-r-2 border-t border-b border-white/60" />
                </div>
                {/* Steam */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-white/10 text-xs animate-pulse">~</div>
              </div>

              {/* Pen holder with pens */}
              <div className="flex flex-col items-center">
                <div className="relative w-5 h-7 rounded-b-sm bg-zinc-600 border border-zinc-500/50" style={{ boxShadow: "1px 2px 4px rgba(0,0,0,0.3)" }}>
                  <div className="absolute -top-3 left-0.5 w-[2px] h-4 bg-blue-700 rounded-t-full" style={{ transform: "rotate(-4deg)" }} />
                  <div className="absolute -top-2.5 left-1.5 w-[2px] h-3.5 bg-red-700 rounded-t-full" style={{ transform: "rotate(2deg)" }} />
                  <div className="absolute -top-3 left-2.5 w-[2px] h-4 bg-zinc-800 rounded-t-full" style={{ transform: "rotate(-1deg)" }} />
                </div>
              </div>

              {/* Sticky notes — notice board items */}
              <div className="flex -space-x-1">
                {(() => {
                  const stickyStyles = [
                    { bg: "bg-yellow-400/90", rot: "-5deg", text: "text-yellow-900" },
                    { bg: "bg-orange-400/80", rot: "3deg", text: "text-orange-900" },
                    { bg: "bg-green-500/70", rot: "-2deg", text: "text-green-900" },
                  ];
                  return stickyStyles.map((s, i) => {
                    const item = actionItems[i];
                    return (
                      <div
                        key={i}
                        className={`w-10 h-10 ${s.bg} rounded-sm shadow-md cursor-pointer transition-transform hover:scale-125 hover:z-10 relative`}
                        style={{ transform: `rotate(${s.rot})` }}
                        onClick={() => item && setSelectedStickyIndex(i)}
                        title={item ? item.title : "Empty"}
                      >
                        {item && (
                          <>
                            <div className={`absolute inset-0.5 overflow-hidden ${s.text}`}>
                              <p className="text-[4px] leading-[5px] font-medium break-words">{item.title}</p>
                            </div>
                            {item.completed && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[10px] opacity-60">✓</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Keyboard at the bottom center */}
            <div className="absolute bottom-[6%] left-1/2 -translate-x-1/2">
              <div className="w-28 sm:w-36 h-8 sm:h-10 rounded-md bg-zinc-800/80 border border-zinc-600/40" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
                {/* Key rows */}
                <div className="flex flex-wrap gap-[1px] p-1 opacity-30">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i} className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-[1px] bg-zinc-500/60" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sticky note detail popup */}
          {selectedStickyIndex !== null && actionItems[selectedStickyIndex] && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedStickyIndex(null)}>
              <div
                className={`relative w-64 min-h-48 p-5 rounded shadow-2xl ${
                  selectedStickyIndex === 0 ? "bg-yellow-300" : selectedStickyIndex === 1 ? "bg-orange-300" : "bg-green-400"
                }`}
                style={{ transform: "rotate(-1deg)", fontFamily: "'Caveat', 'Patrick Hand', cursive" }}
                onClick={(e) => e.stopPropagation()}
              >
                <button className="absolute top-2 right-2 text-black/40 hover:text-black/80 text-lg" onClick={() => setSelectedStickyIndex(null)}>✕</button>
                <p className="text-xs text-black/40 font-sans mb-2 uppercase tracking-wide">📌 Notice Board</p>
                <p className={`text-lg text-black/80 font-bold leading-snug ${actionItems[selectedStickyIndex].completed ? "line-through opacity-60" : ""}`}>
                  {actionItems[selectedStickyIndex].title}
                </p>
                <div className="mt-4 pt-3 border-t border-black/10">
                  <p className="text-xs text-black/40 font-sans">Posted by {actionItems[selectedStickyIndex].created_by_email.split("@")[0]}</p>
                  {actionItems[selectedStickyIndex].completed && <p className="text-xs text-black/50 font-sans mt-1">✓ Completed</p>}
                </div>
              </div>
            </div>
          )}

          {/* Active desk panel */}
          {deskView === "computer" && (
            <div className="absolute inset-8 flex items-center justify-center">
              <div className="relative flex flex-col items-center">
                <div className="rounded-xl overflow-hidden shadow-2xl" style={{ background: "linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #0e0e0e 100%)", padding: "18px 18px 8px 18px", border: "2px solid #333" }}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[10px] font-bold tracking-widest text-white/30 uppercase">OPS Terminal</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[9px] text-white/20">ONLINE</span>
                    </div>
                  </div>
                  <div className="relative rounded-sm overflow-hidden" style={{ width: "min(70vw, 860px)", height: "min(55vh, 500px)", boxShadow: "inset 0 0 60px rgba(0,0,0,0.5)" }}>
                    <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)" }} />
                    <iframe src={window.location.origin + "/dashboard"} className="w-full h-full border-0" title="OPS Terminal" />
                  </div>
                </div>
                <div className="w-16 h-8" style={{ background: "linear-gradient(180deg, #1a1a1a, #111)", clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)" }} />
                <div className="w-28 h-2 rounded-full" style={{ background: "linear-gradient(180deg, #222, #0e0e0e)" }} />
              </div>

              {/* Photo frame visible on the desk beside the monitor */}
              <div
                className="absolute bottom-16 right-8 flex flex-col items-center gap-1 cursor-pointer group transition-transform hover:scale-105"
                onClick={() => {
                  if (!photoFrameUrl) { photoInputRef.current?.click(); }
                  else { setDeskView("photo"); }
                }}
                title={photoFrameUrl ? "View photo" : "Upload photo"}
              >
                <div className="rounded-md overflow-hidden shadow-xl" style={{
                  background: "linear-gradient(145deg, #7a5a3a, #5a3a1a)",
                  padding: "5px",
                  border: "2px solid #4a3020",
                  transform: "perspective(200px) rotateY(-8deg) rotateX(2deg)",
                }}>
                  {photoFrameUrl ? (
                    <img src={photoFrameUrl} alt="Desk photo" className="w-16 h-20 sm:w-20 sm:h-24 object-cover rounded-sm" />
                  ) : (
                    <div className="w-16 h-20 sm:w-20 sm:h-24 bg-black/30 rounded-sm flex items-center justify-center">
                      <span className="text-white/20 text-2xl">🖼️</span>
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-white/30 font-medium tracking-wider uppercase group-hover:text-white/50 transition-colors">Photo</span>
              </div>
            </div>
          )}

          {deskView === "photo" && (
            <div className="absolute inset-8 flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="relative rounded-lg overflow-hidden shadow-2xl" style={{
                  background: "linear-gradient(145deg, #7a5a3a, #5a3a1a)",
                  padding: "16px",
                  border: "3px solid #4a3020"
                }}>
                  {photoFrameUrl ? (
                    <img src={photoFrameUrl} alt="My photo" className="max-w-[60vw] max-h-[50vh] object-contain rounded" />
                  ) : (
                    <div className="w-64 h-48 bg-black/20 rounded flex items-center justify-center">
                      <span className="text-white/40 text-sm">No photo yet</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors backdrop-blur-sm"
                  >
                    {photoFrameUrl ? "Change Photo" : "Upload Photo"}
                  </button>
                  <button
                    onClick={() => setDeskView("computer")}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors backdrop-blur-sm"
                  >
                    ← Back to Desk
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Close / stand up button */}
          <button
            onClick={() => { setShowTerminal(false); setDeskView(null); }}
            className="absolute top-6 right-6 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors backdrop-blur-sm z-30"
          >
            🚶 Stand Up {!isMobile && <span className="text-white/40 ml-2">(ESC)</span>}
          </button>

          {/* Sitting indicator */}
          <div className="absolute top-6 left-6 z-30">
            <Badge className="bg-primary/20 text-primary-foreground border-primary/30 text-xs px-3 py-1.5">
              🪑 Sitting at your desk
            </Badge>
          </div>
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
        className="absolute z-10 overflow-hidden pointer-events-none"
        style={{ visibility: 'hidden', opacity: 0, transition: 'opacity 120ms linear', willChange: 'transform, width, height', backgroundColor: '#0d1117' }}
      >
        <iframe
          ref={tvIframeRef}
          src={`https://www.youtube-nocookie.com/embed/${tvVideoId}?autoplay=1&mute=1&loop=1&playlist=${TV_PLAYLIST.join(',')}&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`}
          className="w-full h-full border-0 pointer-events-none"
          title="Office TV"
          allow="autoplay; encrypted-media; picture-in-picture"
          style={{ pointerEvents: "none", backgroundColor: "#0d1117" }}
        />
        {/* Scanline overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
          mixBlendMode: 'multiply',
        }} />
        {/* Subtle vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)',
        }} />
        {/* Inner bezel glow edge */}
        <div className="absolute inset-0 pointer-events-none rounded-sm" style={{
          boxShadow: 'inset 0 0 8px 2px rgba(34,102,170,0.25), inset 0 0 20px 4px rgba(0,0,0,0.4)',
        }} />
      </div>

      {/* TV2 — projected onto north wall via ref */}
      <div
        ref={tv2OverlayRef}
        className="absolute z-10 overflow-hidden pointer-events-none"
        style={{ visibility: 'hidden', opacity: 0, transition: 'opacity 120ms linear', willChange: 'transform, width, height', backgroundColor: '#0d1117' }}
      >
        <iframe
          ref={tv2IframeRef}
          src={`https://www.youtube-nocookie.com/embed/${TV2_VIDEO_ID}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`}
          className="w-full h-full border-0 pointer-events-none"
          title="Office TV2 - Live Feed"
          allow="autoplay; encrypted-media; picture-in-picture"
          style={{ pointerEvents: "none", backgroundColor: "#0d1117" }}
        />
        {/* Scanline overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
          mixBlendMode: 'multiply',
        }} />
        {/* Subtle vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)',
        }} />
        {/* Inner bezel glow edge — warm tint */}
        <div className="absolute inset-0 pointer-events-none rounded-sm" style={{
          boxShadow: 'inset 0 0 8px 2px rgba(170,68,34,0.25), inset 0 0 20px 4px rgba(0,0,0,0.4)',
        }} />
      </div>

      {/* Sims-style HUD — zone name + controls */}
      {!isMobile && (
        <div className="absolute top-3 left-3 pointer-events-none flex flex-col gap-1.5">
          {/* Zone indicator */}
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10">
              <span className="text-xs font-semibold text-emerald-400 tracking-wide">📍 {currentZone}</span>
            </div>
          </div>
          <Badge variant="outline" className="bg-black/60 text-white/50 border-white/10 text-[10px] w-fit">
            WASD move · R-click walk · Mouse look · E interact · ESC release
          </Badge>
        </div>
      )}

      {/* Enhanced Minimap with NPC dots */}
      {!isMobile && locked && (
        <div className="absolute top-3 right-3 z-10">
          <div className="w-40 h-40 rounded-xl bg-black/80 backdrop-blur-sm border border-white/15 overflow-hidden relative shadow-lg">
            <div className="absolute top-1 left-2 right-2 flex items-center justify-between">
              <span className="text-[8px] text-white/40 uppercase tracking-widest font-semibold">Floor Plan</span>
              <span className="text-[7px] text-emerald-400/60">{currentZone}</span>
            </div>
            {/* Room zones */}
            <div className="absolute border border-white/8" style={{ left: "2%", top: "2%", width: "96%", height: "96%" }} />
            {/* Cubicle area */}
            <div className="absolute border border-white/6 bg-white/3" style={{ left: "15%", top: "5%", width: "70%", height: "25%" }}>
              <span className="text-[5px] text-white/15 absolute top-0.5 left-0.5">Cubicles</span>
            </div>
            {/* Break room */}
            <div className="absolute border border-white/6 bg-emerald-500/5" style={{ left: "3%", top: "34%", width: "30%", height: "28%" }}>
              <span className="text-[5px] text-white/15 absolute top-0.5 left-0.5">Break</span>
            </div>
            {/* Meeting room */}
            <div className="absolute border border-white/6 bg-blue-500/5" style={{ left: "67%", top: "34%", width: "30%", height: "28%" }}>
              <span className="text-[5px] text-white/15 absolute top-0.5 left-0.5">Meeting</span>
            </div>
            {/* Reception */}
            <div className="absolute border border-white/6 bg-amber-500/5" style={{ left: "20%", top: "72%", width: "60%", height: "22%" }}>
              <span className="text-[5px] text-white/15 absolute top-0.5 left-0.5">Reception</span>
            </div>
            {/* Player dot (diamond / plumbob shape) */}
            <div className="absolute w-3 h-3" style={{
              left: `${((stateRef.current?.playerPos.x ?? 0) / ROOM + 1) * 50}%`,
              top: `${(1 - (stateRef.current?.playerPos.z ?? 0) / ROOM) * 50}%`,
              transform: "translate(-50%, -50%) rotate(45deg)",
            }}>
              <div className="w-full h-full bg-emerald-400 shadow-sm shadow-emerald-400/60 animate-pulse" style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
            </div>
            {/* NPC dots */}
            {USERS.filter(u => u.email !== currentUserEmail).map(u => {
              const npcMesh = stateRef.current?.npcMeshes.get(u.email);
              if (!npcMesh) return null;
              const isOnline = u.email === "atria@merchanthaus.io" || (presence[u.email] ?? false);
              return (
                <div
                  key={u.email}
                  className="absolute w-1.5 h-1.5 rounded-full"
                  style={{
                    left: `${((npcMesh.position.x) / ROOM + 1) * 50}%`,
                    top: `${(1 - (npcMesh.position.z) / ROOM) * 50}%`,
                    transform: "translate(-50%, -50%)",
                    backgroundColor: isOnline ? `#${u.shirtColor.toString(16).padStart(6, '0')}` : '#555555',
                    boxShadow: isOnline ? `0 0 4px #${u.shirtColor.toString(16).padStart(6, '0')}40` : 'none',
                  }}
                  title={u.name}
                />
              );
            })}
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

          {(nearby || nearDesk || nearInteract) && (
            <button
              className="mobile-interact-btn absolute bottom-8 right-8 z-20 w-16 h-16 rounded-full bg-primary/80 text-white font-bold text-xs flex items-center justify-center border-2 border-white/30 active:scale-90 transition-transform"
              onTouchStart={(e) => {
                e.stopPropagation();
                if (nearby) setActiveChat(nearby);
                else if (nearDesk) { setShowTerminal(true); setDeskView("computer"); }
                else if (nearInteract) {
                  if (nearInteract.action === "sit") setIsSitting(prev => !prev);
                  else if (nearInteract.action === "whiteboard") setShowWhiteboard(true);
                  else if (nearInteract.action === "coffee") { setCoffeeEmote(true); setTimeout(() => setCoffeeEmote(false), 3000); }
                }
              }}
            >
              {nearby ? `Chat\n${nearby.name}` : nearDesk ? "Terminal" : nearInteract?.label ?? "Interact"}
            </button>
          )}

          {(nearby || nearDesk || nearInteract) && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-none z-20">
              <Badge className="bg-black/80 text-white border-0 text-xs px-3 py-1">
                {nearby ? `Near ${nearby.name}` : nearDesk ? "Near Terminal" : nearInteract?.label ?? ""}
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
        <button onClick={() => { setShowTerminal(false); setDeskView(null); }} className="absolute top-4 right-4 z-30 px-3 py-2 rounded-lg bg-white/10 text-white text-xs font-medium backdrop-blur-sm">✕ Stand Up</button>
      )}
      {isMobile && showWhiteboard && (
        <button onClick={() => setShowWhiteboard(false)} className="absolute top-4 right-4 z-30 px-3 py-2 rounded-lg bg-white/10 text-white text-xs font-medium backdrop-blur-sm">✕ Close</button>
      )}
    </div>
  );
}
