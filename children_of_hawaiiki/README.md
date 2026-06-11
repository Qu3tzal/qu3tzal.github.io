# Children of Hawaiki

A management/exploration game about the Polynesian conquest of the Pacific.
Settle islands, raise voyaging canoes, learn the stars, and island-hop across
five ocean crossings from legendary Hawaiki to the paradise of Hawaiʻi.

## How to play

Open `index.html` in any browser. No build step, no dependencies, no network —
everything (including the art) is procedural. Progress auto-saves to
localStorage.

## The loop

Each island plays in two alternating phases, following the rhythm of the
historical voyagers:

**Settle & prepare (moons).** Assign your people to tasks:

| Task | Effect |
|---|---|
| Fishers / Farmers | Food — each person eats 1 per moon. Fishing grounds crowd, droughts strike. |
| Woodcutters | Wood — fells the island's forest, which slowly regrows. |
| Builders | Spend wood to raise (or repair) the great voyaging canoe. |
| Scouts | Gather sea-lore about candidate islands beyond the horizon (3 tiers: distance estimate → quality of land → a memorized star path that makes the crossing surer). |
| Navigators | Accumulate star lore, which persists for the whole journey and keeps the canoe on course at sea. |

Each island has its own fertility, fishing grounds, forest, and a population
ceiling — rich volcanic islands, modest high islands, and timber-poor atolls.
Events (cyclones, fish runs, droughts, beached whales…) punctuate the moons.

**The crossing (days).** When the canoe is ready, choose a destination, a crew
(those who stay become permanent settlers — your legacy), and provisions. At
sea, each day brings wayfinding rolls against your star lore and scouting, and
event choices in the spirit of the old voyages: run before the storm or lash
down, follow the frigate birds, chase the land-cloud, stop for the tuna school.
Run out of food and the ocean starts taking the crew.

The game is a wager, by design: sail prepared (scouted route, fat provisions,
trained navigators) and the crossing is nearly safe; sail the moment the hull
floats and roughly half of all lineages end at sea or starving on a poorly
chosen rock.

## Dev notes

- `js/data.js` — tuning constants, legs, name generator
- `js/game.js` — state, island simulation, island events, save/load
- `js/voyage.js` — sea crossing simulation and voyage events
- `js/render.js` — procedural canvas scenes (island map, night crossing)
- `js/ui.js`, `js/main.js` — panel, modals, wiring
- `test/sim.js` — headless balance harness: `node test/sim.js 500` plays full
  games with a bot policy and reports win rates (careful play ≈100%,
  reckless departures ≈47%)
- `test/shot.html` — screenshot harness for visual states
  (`?state=island|atoll|voyage|storm|depart`)

Keyboard: Space/Enter advances a moon (or a day at sea).
