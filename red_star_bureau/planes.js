'use strict';

/* Procedural top-down aircraft silhouettes as SVG, generated from a design's
   component ids. The airframe sets the shape; engine, avionics, and armament
   add decorations (afterburner flame, radome, missiles, nacelles). */
const Planes = (() => {

  /* Airframe geometry, viewBox 0..200, nose up at y=12.
     wing/tail: y = leading-edge root, span = full span, sweep = tip drop,
     root/tip = chord lengths. nacelles = engine pods as fractions along the wing. */
  const SHAPES = {
    // fighters
    af_f1: { len: 150, fw: 15, nose: 34, canopy: 48, wing: { y: 64, span: 146, sweep: 6,  root: 26, tip: 13 }, tail: { y: 140, span: 60, sweep: 5,  root: 12, tip: 7 } },
    af_f2: { len: 152, fw: 15, nose: 36, canopy: 47, wing: { y: 60, span: 132, sweep: 34, root: 30, tip: 11 }, tail: { y: 138, span: 56, sweep: 18, root: 11, tip: 6 } },
    af_f3: { len: 166, fw: 19, nose: 40, canopy: 50, wing: { y: 64, span: 148, sweep: 44, root: 36, tip: 12 }, tail: { y: 148, span: 60, sweep: 24, root: 12, tip: 6 } },
    af_f4: { len: 168, fw: 17, nose: 42, canopy: 48, wing: { y: 58, span: 128, sweep: 64, root: 78, tip: 6 },  tail: null },
    af_f5: { len: 172, fw: 18, nose: 44, canopy: 50, wing: { y: 62, span: 138, sweep: 52, root: 34, tip: 10 }, tail: { y: 152, span: 62, sweep: 30, root: 12, tip: 6 } },
    // bombers
    af_b1: { len: 158, fw: 21, nose: 26, wing: { y: 58, span: 188, sweep: 3,  root: 30, tip: 16 }, tail: { y: 144, span: 80, sweep: 4,  root: 13, tip: 8 }, nacelles: [0.30] },
    af_b2: { len: 162, fw: 21, nose: 28, wing: { y: 56, span: 178, sweep: 26, root: 34, tip: 14 }, tail: { y: 146, span: 78, sweep: 14, root: 13, tip: 8 }, nacelles: [0.28] },
    af_b3: { len: 176, fw: 25, nose: 30, wing: { y: 56, span: 188, sweep: 34, root: 40, tip: 13 }, tail: { y: 158, span: 84, sweep: 18, root: 14, tip: 8 }, nacelles: [0.22, 0.50] },
    af_b4: { len: 182, fw: 17, nose: 46, wing: { y: 74, span: 124, sweep: 54, root: 56, tip: 8 },  tail: { y: 164, span: 56, sweep: 26, root: 11, tip: 6 }, nacelles: [0.14] },
    af_b5: { len: 184, fw: 23, nose: 40, wing: { y: 60, span: 158, sweep: 66, root: 88, tip: 8 },  tail: null, nacelles: [0.18, 0.36] },
    // transports
    af_t1: { len: 148, fw: 25, nose: 20, wing: { y: 56, span: 170, sweep: 2,  root: 32, tip: 18 }, tail: { y: 134, span: 76, sweep: 3,  root: 13, tip: 9 },  nacelles: [0.32] },
    af_t2: { len: 154, fw: 28, nose: 22, wing: { y: 56, span: 182, sweep: 2,  root: 34, tip: 18 }, tail: { y: 140, span: 80, sweep: 3,  root: 14, tip: 9 },  nacelles: [0.30] },
    af_t3: { len: 168, fw: 31, nose: 22, wing: { y: 58, span: 192, sweep: 3,  root: 36, tip: 18 }, tail: { y: 152, span: 86, sweep: 4,  root: 15, tip: 10 }, nacelles: [0.24, 0.52] },
    af_t4: { len: 178, fw: 35, nose: 24, wing: { y: 60, span: 196, sweep: 4,  root: 40, tip: 20 }, tail: { y: 160, span: 90, sweep: 4,  root: 16, tip: 10 }, nacelles: [0.22, 0.50] },
    af_t5: { len: 176, fw: 31, nose: 26, wing: { y: 58, span: 186, sweep: 20, root: 38, tip: 16 }, tail: { y: 158, span: 84, sweep: 12, root: 15, tip: 9 },  nacelles: [0.24, 0.50] },
  };

  /* Blueprint palette */
  const BODY = '#b9c7d4', WING = '#a9b8c6', DETAIL = '#8fa0af', STROKE = '#e8f1f8';

  const lerp = (a, b, t) => a + (b - a) * t;

  function poly(pts, fill, opts = '') {
    const d = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    return `<polygon points="${d}" fill="${fill}" stroke="${STROKE}" stroke-width="1" stroke-linejoin="round" ${opts}/>`;
  }

  const mirror = (pts) => pts.map(([x, y]) => [200 - x, y]);

  /* Wing pair (also used for tailplanes). */
  function wings(w, fw) {
    const fw2 = fw / 2 - 1;
    const right = [
      [100 + fw2, w.y],
      [100 + w.span / 2, w.y + w.sweep],
      [100 + w.span / 2, w.y + w.sweep + w.tip],
      [100 + fw2, w.y + w.root],
    ];
    return poly(right, WING) + poly(mirror(right), WING);
  }

  /* x-position of a point at fraction f along the wing, per side. */
  function wingX(p, f, side) {
    return 100 + side * (p.fw / 2 + (p.wing.span / 2 - p.fw / 2) * f);
  }

  function svg(ids, px) {
    const p = SHAPES[ids.airframe];
    if (!p) return '';
    const isFighter = ids.airframe.startsWith('af_f');
    const tailY = 12 + p.len;
    const parts = [];

    // wings & tailplane under the fuselage
    parts.push(wings(p.wing, p.fw));
    if (p.tail) parts.push(wings(p.tail, p.fw * 0.8));

    // engine nacelles on the wings (bombers & transports)
    for (const f of p.nacelles || []) {
      for (const s of [1, -1]) {
        const x = wingX(p, f, s), y = p.wing.y + p.wing.sweep * f;
        parts.push(`<rect x="${(x - 3.5).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="7" height="22" rx="2.5" fill="${DETAIL}" stroke="${STROKE}" stroke-width="1"/>`);
      }
    }

    // fuselage
    const fw2 = p.fw / 2;
    const right = [
      [100, 12],
      [100 + fw2, 12 + p.nose],
      [100 + fw2 * 0.92, 12 + p.len * 0.82],
      [100 + p.fw * 0.16, tailY],
    ];
    parts.push(poly(right.concat(mirror(right).reverse()), BODY));

    // radome grows with avionics tier
    const avTier = Number(ids.avionics.slice(3)) - 1;
    if (avTier > 0) {
      parts.push(poly([[100, 12.5], [100 + fw2 * 0.75, 12 + 7 + avTier * 3], [100 - fw2 * 0.75, 12 + 7 + avTier * 3]], '#51616e'));
    }

    // canopy on fighters
    if (isFighter) {
      parts.push(`<ellipse cx="100" cy="${p.canopy}" rx="4.5" ry="9" fill="#2f3e49" stroke="${STROKE}" stroke-width="0.8"/>`);
    }

    // armament
    const wp = ids.weapon;
    if (wp === 'wp_1') {
      for (const s of [1, -1]) {
        parts.push(`<line x1="${100 + s * (fw2 + 1)}" y1="${12 + p.nose - 4}" x2="${100 + s * (fw2 + 1)}" y2="${12 + p.nose + 8}" stroke="#3a444c" stroke-width="1.6"/>`);
      }
    } else if (wp !== 'wp_0' && wp !== undefined) {
      const tier = Number(wp.slice(3));
      const racks = tier >= 4 ? [0.35, 0.58] : [0.45];
      const mlen = tier === 2 ? 9 : 11 + tier * 2.5;
      for (const f of racks) {
        for (const s of [1, -1]) {
          const x = wingX(p, f, s);
          const yTE = p.wing.y + p.wing.sweep * f + lerp(p.wing.root, p.wing.tip, f);
          parts.push(
            `<rect x="${(x - 1.4).toFixed(1)}" y="${(yTE - 4).toFixed(1)}" width="2.8" height="${mlen}" fill="#5a6168" stroke="${STROKE}" stroke-width="0.6"/>` +
            `<polygon points="${(x - 1.4).toFixed(1)},${(yTE - 4).toFixed(1)} ${(x + 1.4).toFixed(1)},${(yTE - 4).toFixed(1)} ${x.toFixed(1)},${(yTE - 8).toFixed(1)}" fill="#5a6168"/>`);
        }
      }
    }

    // exhaust: afterburners flame orange, turbofans glow blue
    const en = ids.engine;
    if (en === 'en_3' || en === 'en_4') {
      parts.push(`<polygon points="96,${tailY - 2} 104,${tailY - 2} 100,${tailY + 10}" fill="#e07b2a" opacity="0.9"/>`);
    } else if (en === 'en_5') {
      parts.push(`<polygon points="95,${tailY - 2} 105,${tailY - 2} 100,${tailY + 7}" fill="#7da7c4" opacity="0.8"/>`);
    }

    // red stars on the wings
    for (const s of [1, -1]) {
      const x = wingX(p, 0.62, s);
      const y = p.wing.y + p.wing.sweep * 0.62 + lerp(p.wing.root, p.wing.tip, 0.62) * 0.55;
      parts.push(`<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="13" fill="#c8362e" text-anchor="middle">★</text>`);
    }

    return `<svg viewBox="0 0 200 200" width="${px}" height="${px}" role="img" aria-label="aircraft silhouette">${parts.join('')}</svg>`;
  }

  return { svg };
})();
