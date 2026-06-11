# ⚽ World Cup 26 — Arcade Football & Manager

A browser soccer game with two ways to play:

- **World Cup / Friendly (arcade)** — 5-a-side, you control the players.
- **Manager Cup** — the real thing: 11v11 on a full FIFA-proportioned pitch
  (100m × 64m international minimum, drawn to scale). You don't kick a ball —
  you pick the XI, set the tactics, manage fitness and make the big calls
  from the dugout.

No build, no dependencies, no server: **double-click `index.html` and play.**
All sprites are embedded into the page (Kenney's CC0 packs, recolored per
nation at load time), and every sound is synthesized live with WebAudio.

## Arcade controls

| Action | Keys |
|---|---|
| Move | Arrow keys / WASD (physical position — works on AZERTY too) |
| Pass / Tackle | `Space` (also `K`) |
| Shoot / Slide | `X` (also `L`) — hold ↑/↓ while shooting to aim |
| Sprint | `Shift` |
| Switch player | `C` |
| Pause | `Esc` / `P` |
| Mute | `M` |

You control the white-ringed player (triangle overhead). 5v5, two 45' halves
(~1 min each), kick-ins/corners/goal kicks, diving keepers, golden-goal
extra time in the knockouts.

## Manager Cup

Pick a nation and take its real 2025/26 squad through the knockout bracket.

**Before each match** — the squad screen:
- Your XI laid out on the pitch in your formation; swap anyone with the
  bench (FIFA-style player cards: rating, club, PAC/ATT/DEF, preferred
  position, fitness).
- **Formation**: 4-4-2, 4-3-3 or 5-3-2. Players have systems they love (♥ +4)
  and systems they hate (✗ −4) — building around your stars matters.
- **Mentality** (defensive/balanced/attacking) and **pressing**
  (low/normal/high). High pressing wins the ball higher but burns fitness.

**During the match** (it plays out 11v11 in front of you):
- `TAB` — management panel: change tactics live, make substitutions (max 5).
- `R` — **RALLY**: 18 seconds of extra pace and aggression, 75s cooldown.
- `F` — fast-forward ×2.5.
- **Knocks**: tired players pick up knocks mid-match. Sub them off, or
  gamble — leave them on and they might run it off… or break down.
- Fitness carries over between rounds (partial recovery), so rotation is a
  real decision deep in the bracket. The opposing coach subs, shifts
  mentality and rallies too.

| Manager keys | |
|---|---|
| `TAB` / `E` / `Esc` | Management panel (pauses play) |
| `R` | Rally | 
| `F` | Fast-forward toggle |

## The squads

Each nation ships 16 real internationals with their 2025/26 club, stats and
formation affinities (e.g. Mbappé — Real Madrid, loves 4-3-3; De Bruyne —
Napoli; Modrić — AC Milan). Accurate as of early 2026 — football moves fast,
treat it as flavor, not gospel. No likenesses are used, names only.

## Development

Plain ES5-style JavaScript on a shared `WC` namespace, Canvas 2D rendering.
The match simulation is DOM-free and runs headless:

```bash
node tools/sim_test.js 10            # arcade 5v5 sim health check
node tools/sim_test.js 10 --manager  # 11v11 manager sim (fatigue, subs, knocks)
python3 tools/embed_assets.py        # regenerate js/assetData.js from assets/
```

`tools/probe.html` runs the full real pipeline synchronously for headless
browser inspection; `tools/nanhunt.html` watches for sim corruption under
real rAF timing. `index.html#action`, `#squad`, `#maction`, `#mpanel`,
`#bracket`, `#champion` jump straight to a screen for quick testing.

## Credits

- Sprites & flags: [Kenney](https://kenney.nl) — Sports Pack, Flag Pack (CC0)
- Everything else: generated code, no external assets fetched at runtime
