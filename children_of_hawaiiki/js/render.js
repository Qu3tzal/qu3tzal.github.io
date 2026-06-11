"use strict";

const W = 960, H = 640;
let ctx = null;

// Cached per-island decoration layout (positions are stable per island)
let layoutKey = null;
let layout = null;

function initRender(canvas) {
  ctx = canvas.getContext("2d");
  requestAnimationFrame(frame);
}

function frame(t) {
  if (G && ctx) {
    if (G.phase === "voyage") drawVoyage(t / 1000);
    else drawIsland(t / 1000);
  }
  requestAnimationFrame(frame);
}

// Island outline radius at angle a, seeded wobble
function shoreR(a, R, s1, s2) {
  return R * (0.78 + 0.14 * Math.sin(3 * a + s1) + 0.09 * Math.sin(5 * a + s2) + 0.05 * Math.sin(8 * a + s1 * 2));
}

function islandPath(cx, cy, R, s1, s2, squash) {
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r = shoreR(a, R, s1, s2);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * squash;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function buildLayout(isl) {
  const rng = mulberry32(isl.shapeSeed);
  const L = {
    s1: rng() * 6.28, s2: rng() * 6.28,
    palms: [], huts: [], taro: [], rocks: [],
  };
  // Palms: scattered inside the vegetated area
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const f = 0.25 + rng() * 0.6;
    L.palms.push({ a, f, sway: rng() * 6.28, size: 0.8 + rng() * 0.5 });
  }
  // Huts: along a beach arc on the lower side
  for (let i = 0; i < 14; i++) {
    const a = 1.0 + rng() * 1.4; // south-ish angles
    L.huts.push({ a, f: 0.86 + rng() * 0.08, size: 0.9 + rng() * 0.3 });
  }
  // Taro patches: a cluster inland
  const ta = rng() * Math.PI * 2;
  for (let i = 0; i < 10; i++) {
    L.taro.push({ a: ta + (rng() - 0.5) * 1.2, f: 0.35 + rng() * 0.25 });
  }
  for (let i = 0; i < 6; i++) L.rocks.push({ a: rng() * 6.28, f: 1.1 + rng() * 0.25, size: 2 + rng() * 3 });
  return L;
}

function pos(cx, cy, R, squash, a, f, s1, s2) {
  const r = shoreR(a, R, s1, s2) * f;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * squash };
}

function drawIsland(t) {
  const isl = G.island;
  const key = isl.name + ":" + isl.shapeSeed;
  if (key !== layoutKey) { layoutKey = key; layout = buildLayout(isl); }
  const L = layout;
  const cx = W * 0.46, cy = H * 0.48, squash = 0.82;
  const R = isl.type === "atoll" ? 175 : 150 + isl.forestMax * 0.35;

  // Deep ocean
  const og = ctx.createLinearGradient(0, 0, 0, H);
  og.addColorStop(0, "#0d3a55");
  og.addColorStop(1, "#0a2c44");
  ctx.fillStyle = og;
  ctx.fillRect(0, 0, W, H);

  // Open-water glints
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1.5;
  const grng = mulberry32(isl.shapeSeed + 7);
  for (let i = 0; i < 26; i++) {
    const x = grng() * W, y = grng() * H, ph = grng() * 6.28;
    const o = Math.sin(t * 0.8 + ph) * 4;
    ctx.beginPath();
    ctx.arc(x + o, y, 9 + grng() * 9, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  // Shallow lagoon halo
  const lg = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.5);
  lg.addColorStop(0, "rgba(64,190,200,0.55)");
  lg.addColorStop(0.75, "rgba(50,160,185,0.25)");
  lg.addColorStop(1, "rgba(40,130,170,0)");
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.ellipse(cx, cy, R * 1.5, R * 1.5 * squash, 0, 0, 6.29); ctx.fill();

  // Breaking surf ring (animated)
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const pulse = 1.12 + 0.025 * Math.sin(t * 1.6 + a * 4);
    const r = shoreR(a, R, L.s1, L.s2) * pulse;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * squash;
    if (i % 2 === 0) { ctx.beginPath(); ctx.moveTo(x, y); }
    else { ctx.lineTo(x, y); ctx.stroke(); }
  }

  // Sand
  islandPath(cx, cy, R, L.s1, L.s2, squash);
  ctx.fillStyle = "#e6d29b";
  ctx.fill();

  if (isl.type === "atoll") {
    // Lagoon in the middle of the ring
    islandPath(cx, cy, R * 0.62, L.s1, L.s2, squash);
    ctx.fillStyle = "#3ec3c9";
    ctx.fill();
    // Thin vegetation ring
    ctx.save();
    islandPath(cx, cy, R * 0.92, L.s1, L.s2, squash);
    ctx.clip();
    islandPath(cx, cy, R * 0.92, L.s1, L.s2, squash);
    ctx.fillStyle = "#4e8a3d";
    ctx.fill();
    islandPath(cx, cy, R * 0.7, L.s1, L.s2, squash);
    ctx.fillStyle = "#e6d29b";
    ctx.fill();
    islandPath(cx, cy, R * 0.62, L.s1, L.s2, squash);
    ctx.fillStyle = "#3ec3c9";
    ctx.fill();
    ctx.restore();
  } else {
    // Vegetated interior, denser when forest is healthy
    const green = forestFactor(isl);
    islandPath(cx, cy, R * 0.82, L.s1, L.s2, squash);
    ctx.fillStyle = green > 0.7 ? "#3f7d33" : green > 0.5 ? "#5c8a3c" : "#8a9148";
    ctx.fill();
    islandPath(cx, cy, R * 0.55, L.s1, L.s2, squash);
    ctx.fillStyle = green > 0.7 ? "#356b2b" : "#4c7634";
    ctx.fill();
    if (isl.type === "volcanic") {
      // Central peak
      const px = cx, py = cy - 8;
      ctx.fillStyle = "#4a5a40";
      ctx.beginPath();
      ctx.moveTo(px - 55, py + 30); ctx.lineTo(px - 8, py - 48); ctx.lineTo(px + 18, py - 30);
      ctx.lineTo(px + 60, py + 28); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#6b7163";
      ctx.beginPath();
      ctx.moveTo(px - 22, py - 24); ctx.lineTo(px - 8, py - 48); ctx.lineTo(px + 18, py - 30);
      ctx.lineTo(px + 8, py - 18); ctx.closePath(); ctx.fill();
    }
  }

  // Drought tint
  if (isl.drought > 0) {
    islandPath(cx, cy, R * 0.82, L.s1, L.s2, squash);
    ctx.fillStyle = "rgba(190,160,60,0.25)";
    ctx.fill();
  }

  // Taro patches (one per farmer, up to layout slots)
  const taroN = Math.min(G.jobs.farmer, L.taro.length);
  for (let i = 0; i < taroN; i++) {
    const p = pos(cx, cy, R, squash, L.taro[i].a, L.taro[i].f, L.s1, L.s2);
    ctx.fillStyle = "#79b34a";
    ctx.fillRect(p.x - 7, p.y - 5, 14, 10);
    ctx.strokeStyle = "#2f5424";
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x - 7, p.y - 5, 14, 10);
  }

  // Palms (count tracks forest stock)
  const palmN = Math.min(L.palms.length, Math.max(3, Math.round(isl.forestStock / 4)));
  for (let i = 0; i < palmN; i++) {
    const pm = L.palms[i];
    const f = isl.type === "atoll" ? 0.78 + (pm.f % 0.12) : pm.f * 0.7 + 0.1;
    const p = pos(cx, cy, R, squash, pm.a, f, L.s1, L.s2);
    drawPalm(p.x, p.y, pm.size * 1.35, Math.sin(t * 1.2 + pm.sway) * 2);
  }

  // Huts (count tracks population)
  const hutN = Math.min(L.huts.length, Math.ceil(G.pop / 3));
  for (let i = 0; i < hutN; i++) {
    const h = L.huts[i];
    const p = pos(cx, cy, R, squash, h.a, isl.type === "atoll" ? 0.8 : h.f, L.s1, L.s2);
    drawHut(p.x, p.y, h.size);
  }

  // Fishing canoes in the lagoon
  const fishN = Math.min(G.jobs.fisher, 6);
  for (let i = 0; i < fishN; i++) {
    const a = 1.1 + i * 0.35;
    const r = shoreR(a, R, L.s1, L.s2) * 1.22;
    const bob = Math.sin(t * 1.5 + i * 2) * 2;
    drawCanoeTop(cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash + bob, a + 1.57);
  }

  // Scout canoes ranging far offshore
  const scoutN = Math.min(G.jobs.scout, 3);
  for (let i = 0; i < scoutN; i++) {
    const a = -0.5 - i * 0.8;
    const range = 1.5 + 0.25 * Math.sin(t * 0.3 + i * 2.1);
    const r = shoreR(a, R, L.s1, L.s2) * range;
    drawCanoeTop(cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash, a, true);
  }

  // The great voyaging canoe on the south beach
  drawGreatCanoeBuild(cx - 30, cy + R * squash * 0.9, t);

  // Rocks offshore
  for (const rk of L.rocks) {
    const p = pos(cx, cy, R, squash, rk.a, rk.f, L.s1, L.s2);
    ctx.fillStyle = "#5d6a70";
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rk.size, rk.size * 0.6, 0, 0, 6.29); ctx.fill();
  }
}

function drawPalm(x, y, s, sway) {
  ctx.strokeStyle = "#7a5a36";
  ctx.lineWidth = 2.2 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 2 * s, y - 8 * s, x + sway * 0.4 + 3 * s, y - 15 * s);
  ctx.stroke();
  const tx = x + sway * 0.4 + 3 * s, ty = y - 15 * s;
  ctx.strokeStyle = "#56b04a";
  ctx.lineWidth = 1.8 * s;
  for (let i = 0; i < 5; i++) {
    const a = -2.6 + i * 1.05;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 6 * s, ty + Math.sin(a) * 4 * s - 3 * s,
      tx + Math.cos(a) * 11 * s + sway * 0.3, ty + Math.sin(a) * 7 * s);
    ctx.stroke();
  }
}

function drawHut(x, y, s) {
  ctx.fillStyle = "#9a7544";
  ctx.fillRect(x - 6 * s, y - 4 * s, 12 * s, 6 * s);
  ctx.fillStyle = "#caa86a";
  ctx.beginPath();
  ctx.moveTo(x - 8 * s, y - 4 * s);
  ctx.lineTo(x, y - 11 * s);
  ctx.lineTo(x + 8 * s, y - 4 * s);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#6e5430";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawCanoeTop(x, y, angle, far) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const s = far ? 0.8 : 1;
  ctx.fillStyle = "#5e4426";
  ctx.beginPath();
  ctx.ellipse(0, 0, 9 * s, 2.2 * s, 0, 0, 6.29);
  ctx.fill();
  // Outrigger
  ctx.strokeStyle = "#5e4426";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-3 * s, 0); ctx.lineTo(-3 * s, 6 * s); ctx.moveTo(3 * s, 0); ctx.lineTo(3 * s, 6 * s); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 6.5 * s, 6 * s, 1.2 * s, 0, 0, 6.29); ctx.fill();
  ctx.restore();
}

function drawGreatCanoeBuild(x, y, t) {
  const frac = G.canoe.progress / G.canoe.required;
  const w = 110, h = 16;
  // Shadow on sand
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath(); ctx.ellipse(x, y + 10, w * 0.6, 6, 0, 0, 6.29); ctx.fill();
  // Hull outline (ghost) then built portion
  ctx.save();
  ctx.translate(x, y);
  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -2);
    ctx.quadraticCurveTo(-w / 2 + 12, -h, -w / 4, -h + 2);
    ctx.lineTo(w / 4, -h + 2);
    ctx.quadraticCurveTo(w / 2 - 8, -h - 4, w / 2, -h + 6);
    ctx.quadraticCurveTo(w / 2 - 6, 4, 0, 6);
    ctx.quadraticCurveTo(-w / 2 + 10, 4, -w / 2, -2);
    ctx.closePath();
  };
  hull();
  ctx.strokeStyle = "#7a5a36";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#8a5f30";
  ctx.fillRect(-w / 2, 8 - (h + 14) * frac, w, (h + 14) * frac);
  ctx.restore();
  if (frac >= 1) {
    // Mast and furled sail when complete
    ctx.strokeStyle = "#6e5430";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -h + 2); ctx.lineTo(6, -h - 38); ctx.stroke();
    ctx.fillStyle = "#e8dcb8";
    ctx.beginPath();
    ctx.moveTo(6, -h - 38);
    ctx.quadraticCurveTo(26, -h - 22, 14, -h + 0);
    ctx.quadraticCurveTo(12, -h - 18, 6, -h - 38);
    ctx.closePath(); ctx.fill();
  } else if (frac > 0) {
    // Scaffold poles
    ctx.strokeStyle = "#6e5430";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w / 3, 6); ctx.lineTo(-w / 3 - 8, -h - 10);
    ctx.moveTo(w / 3, 6); ctx.lineTo(w / 3 + 8, -h - 10);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- Voyage scene ----------

function drawVoyage(t) {
  const v = G.voyage;
  const storm = v && v.weather === "storm";

  // Night sky
  const sg = ctx.createLinearGradient(0, 0, 0, H * 0.7);
  if (storm) { sg.addColorStop(0, "#10141f"); sg.addColorStop(1, "#1b2433"); }
  else { sg.addColorStop(0, "#0a1030"); sg.addColorStop(1, "#1b3050"); }
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, W, H * 0.7);

  // Stars
  if (!storm) {
    const srng = mulberry32(424242);
    for (let i = 0; i < 130; i++) {
      const x = srng() * W, y = srng() * H * 0.55;
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + srng() * 2) + srng() * 6.28);
      ctx.fillStyle = `rgba(255,255,240,${0.25 + 0.6 * tw * srng()})`;
      ctx.fillRect(x, y, srng() > 0.92 ? 2 : 1.3, srng() > 0.92 ? 2 : 1.3);
    }
    // A guiding star, low ahead
    ctx.fillStyle = "rgba(255,240,200,0.95)";
    ctx.beginPath(); ctx.arc(W * 0.82, H * 0.18, 2.6, 0, 6.29); ctx.fill();
    ctx.strokeStyle = "rgba(255,240,200,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.82 - 8, H * 0.18); ctx.lineTo(W * 0.82 + 8, H * 0.18);
    ctx.moveTo(W * 0.82, H * 0.18 - 8); ctx.lineTo(W * 0.82, H * 0.18 + 8);
    ctx.stroke();
    // Moon
    ctx.fillStyle = "#e9e4cf";
    ctx.beginPath(); ctx.arc(W * 0.18, H * 0.15, 26, 0, 6.29); ctx.fill();
    ctx.fillStyle = "#0e1936";
    ctx.beginPath(); ctx.arc(W * 0.18 - 11, H * 0.15 - 4, 23, 0, 6.29); ctx.fill();
  }

  // Destination island silhouette when close
  if (v && v.dist - v.progress < 2.5) {
    ctx.fillStyle = storm ? "#151c28" : "#11203a";
    ctx.beginPath();
    ctx.moveTo(W * 0.78, H * 0.7);
    ctx.quadraticCurveTo(W * 0.85, H * 0.55, W * 0.92, H * 0.7);
    ctx.closePath(); ctx.fill();
  }

  // Sea: layered animated waves
  const seaTop = H * 0.62;
  const layers = [
    { y: seaTop, amp: storm ? 14 : 6, sp: 0.9, col: storm ? "#1d2c3c" : "#16405e" },
    { y: seaTop + 45, amp: storm ? 18 : 8, sp: 1.3, col: storm ? "#16222f" : "#0f3450" },
    { y: seaTop + 95, amp: storm ? 22 : 10, sp: 1.7, col: storm ? "#101a24" : "#0a2840" },
  ];
  for (const ly of layers) {
    ctx.fillStyle = ly.col;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) {
      ctx.lineTo(x, ly.y + Math.sin(x * 0.012 + t * ly.sp) * ly.amp + Math.sin(x * 0.03 - t * ly.sp * 0.7) * ly.amp * 0.4);
    }
    ctx.lineTo(W, H);
    ctx.closePath(); ctx.fill();
  }

  // The voyaging canoe rides the middle wave layer
  const cxp = W * 0.42;
  const wy = layers[1].y + Math.sin(cxp * 0.012 + t * layers[1].sp) * layers[1].amp;
  const tilt = Math.cos(cxp * 0.012 + t * layers[1].sp) * (storm ? 0.1 : 0.05);
  drawVoyagingCanoe(cxp, wy - 6, tilt, storm);

  // Rain
  if (storm) {
    ctx.strokeStyle = "rgba(180,200,220,0.25)";
    ctx.lineWidth = 1;
    const rrng = mulberry32(Math.floor(t * 10));
    for (let i = 0; i < 60; i++) {
      const x = rrng() * W, y = rrng() * H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 14); ctx.stroke();
    }
  }

  // Progress track
  if (v) {
    const px0 = 70, px1 = W - 70, py = 40;
    ctx.strokeStyle = "rgba(232,201,122,0.5)";
    ctx.setLineDash([4, 7]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px0, py); ctx.lineTo(px1, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#e8c97a";
    ctx.beginPath(); ctx.arc(px0, py, 5, 0, 6.29); ctx.fill();
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(G.legacy.islands[G.legacy.islands.length - 1], px0 - 10, py + 20);
    ctx.textAlign = "right";
    ctx.fillText(v.dest.tier > 0 || v.dest.final ? v.dest.name : "?", px1 + 10, py + 20);
    ctx.strokeStyle = "#e8c97a";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px1, py, 6, 0, 6.29); ctx.stroke();
    // Canoe marker: estimated position (the crew can't be sure either)
    const frac = clamp(v.progress / v.dist, 0, 1);
    const mx = px0 + (px1 - px0) * frac;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(mx - 7, py + 3); ctx.lineTo(mx + 7, py + 3); ctx.lineTo(mx + 3, py - 4); ctx.lineTo(mx - 4, py - 4);
    ctx.closePath(); ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(216,231,240,0.8)";
    ctx.fillText(`Day ${v.day}`, mx, py - 12);
    ctx.textAlign = "left";
  }
}

function drawVoyagingCanoe(x, y, tilt, storm) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  const col = "#241a10";
  // Two hulls
  ctx.fillStyle = col;
  for (const off of [0, 10]) {
    ctx.beginPath();
    ctx.moveTo(-70, off);
    ctx.quadraticCurveTo(-78, off - 14, -62, off - 16);
    ctx.lineTo(58, off - 8);
    ctx.quadraticCurveTo(82, off - 22, 78, off - 4);
    ctx.quadraticCurveTo(70, off + 6, 0, off + 7);
    ctx.quadraticCurveTo(-60, off + 6, -70, off);
    ctx.closePath(); ctx.fill();
  }
  // Deck platform
  ctx.fillRect(-40, -14, 80, 8);
  // Crew silhouettes
  const n = Math.min(G.voyage ? G.voyage.crew : 0, 7);
  for (let i = 0; i < n; i++) {
    const px = -32 + i * 11;
    ctx.beginPath(); ctx.arc(px, -18, 3.4, 0, 6.29); ctx.fill();
    ctx.fillRect(px - 3, -16, 6, 6);
  }
  // Mast + crab-claw sail
  ctx.strokeStyle = col;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(8, -12); ctx.lineTo(20, -95); ctx.stroke();
  ctx.fillStyle = storm ? col : "#d9c89a";
  ctx.beginPath();
  ctx.moveTo(20, -95);
  ctx.quadraticCurveTo(64, -64, 46, -14);
  ctx.quadraticCurveTo(34, -58, 20, -95);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(20, -95); ctx.quadraticCurveTo(64, -64, 46, -14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, -95); ctx.quadraticCurveTo(30, -55, 46, -14); ctx.stroke();
  // Steering oar
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-58, -12); ctx.lineTo(-74, 12); ctx.stroke();
  ctx.restore();
}
