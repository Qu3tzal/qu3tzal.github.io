# Red Star Bureau

A Soviet aircraft design bureau management sim for the browser, 1950–1965.
Win state tenders, design aircraft from researched components, keep your
engineers busy and your fleet flying — and survive the Ministry's
fifteen-year review.

## Run it

No build step, no dependencies. Either open `index.html` directly in a
browser, or serve the folder:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

Progress autosaves to localStorage every month. "New Game" wipes the save.

## How to play

Each turn is one month — press **End Month** to advance.

1. **Contracts** — bid on open tenders: pick one of your designs, set a price
   and a promised timeline. The commission weighs technical compliance 60%,
   price 25%, timeline 15%; your reputation colors everything. Decisions
   arrive the following month.
2. **Workshop** — assemble designs from an airframe, engine, avionics, and
   armament. Over-engineering is a trap: development costs ~3× the unit cost
   of the design, so a gold-plated bird can eat the whole contract budget.
3. **Staff** — assign engineers to projects (unstaffed projects don't move and
   late projects bleed reputation), research, or the maintenance pool.
   Specialists are worth more in their field. Hire from the candidate pool;
   severance costs three months' pay.
4. **Research** — a 24-node technology tree in six branches (fighter, bomber,
   and transport aerodynamics, propulsion, avionics, armament) with
   cross-branch prerequisites: delta wings need afterburners, guided missiles
   need radar. Costs are paid up front, progress comes from assigned
   engineers, and several projects can run in parallel. Fall behind the times
   and you can't meet contract requirements at all.
5. **Fleet** — delivered aircraft generate monthly support income, but only
   to the extent the fleet is maintained. Undermaintained fleets earn little
   and crash, staining your reputation. Retire aging types when the engineer
   cost outweighs the income.
6. **War** — the conflicts of the era (Korea, the Strait crises, Suez, the
   Congo airlift, Yemen, Indochina…) erupt on their historical dates. While
   they burn, your aircraft in service get engaged: fighters score aerial
   victories or get shot down, bombers destroy targets, transports fly the
   airlift. Results depend on the design's speed, firepower, reliability and
   current maintenance coverage versus era-appropriate opposition — combat
   losses permanently shrink the fleet, outcomes move your reputation both
   ways, and a strong showing can attract export orders. An obsolete fighter
   that still earns support income becomes a liability the day a war starts:
   withdraw it, or let it bleed your name over MiG Alley.

You lose by exhausting the State Bank's credit (−₽5M) or by reputation
collapse. Reach January 1965 and the Ministry grades your career, from
*Hero of Socialist Labor* down to *Reassignment to Siberia*.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | page shell |
| `style.css` | Soviet drafting-office styling |
| `data.js` | components, tech tree, conflicts, competitors, balance constants |
| `planes.js` | procedural top-down aircraft silhouettes (SVG) from component ids |
| `game.js` | simulation: state, monthly tick, bidding, projects, fleet, save/load |
| `ui.js` | all rendering and event handling |
| `test_sim.js` | headless balance harness: `node test_sim.js 20` plays 20 bot games |
| `GDD.MD` | original design document |

## Deviations from the GDD

The GDD was treated as direction, not contract. Main changes:

- **Turn-based, not real-time.** The GDD's "1 real minute = 1 game month"
  fights the genre; a deliberate End-Month turn suits bidding and staffing
  decisions far better.
- **Vanilla JS instead of React/Redux.** ~1,500 lines total; a framework and
  build pipeline would add weight without benefit at this size.
- **Contract requirements are generated from a reference design** buildable
  with era-appropriate components, so every tender is physically winnable —
  the GDD's hand-rolled ranges couldn't guarantee that.
- **Development cost scales with the bid design's unit cost** (~3×), creating
  the core pricing tension: under-bid and you build at a loss, over-spec and
  the prototype eats your margin. The bid form shows the projected margin.
- **Five AI bureaus** (added Ilyushin and Antonov) so bombers and transports
  have natural rivals; AI strength scales with the era.
- **The tech tree is a real DAG**, not the GDD's per-category level ladders:
  24 named technologies with cross-branch prerequisites, drawn as a
  node-and-edge tree in the Research tab.
- **Aircraft are visualized** as procedurally generated blueprint silhouettes
  built from the actual components: the airframe sets the planform, avionics
  size the radome, afterburners add exhaust flames, missiles hang under the
  wings.
- Balance was tuned with the headless bot harness: a near-optimal bot ends
  1965 with roughly ₽350–450M and a ~55% bid win rate; a passive bureau goes
  bankrupt around 1957.
