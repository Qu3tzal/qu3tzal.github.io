'use strict';

/* Static game data: components, tech, competitors, balance constants. */
const DATA = {

  LEVELS: {
    junior:    { label: 'Junior',    mult: 0.7, salary: 18000 },
    senior:    { label: 'Senior',    mult: 1.0, salary: 35000 },
    principal: { label: 'Principal', mult: 1.4, salary: 60000 },
  },

  SPECS: ['aerodynamics', 'propulsion', 'avionics', 'structures', 'maintenance'],

  SPEC_LABELS: {
    aerodynamics: 'Aerodynamics',
    propulsion:   'Propulsion',
    avionics:     'Avionics',
    structures:   'Structures',
    maintenance:  'Maintenance',
  },

  OVERHEAD: 200000,          // facility upkeep, rubles/month
  PROTO_MULT: 3,             // development cost = unit cost × this, spread over the project
  CREDIT_LIMIT: -5000000,    // state credit line; below this = liquidation
  START_FUNDS: 50000000,
  END_YEAR: 1965,            // reaching Jan of this year ends the game with a review

  /* Technology tree. Nodes form a DAG: `requires` lists prerequisite node ids
     (possibly across branches), `unlocks` lists component ids, `specs` lists
     engineer specializations that research the node 1.5× faster.
     row/col position the node in the Research tab visualization. */
  TECH_ROWS: ['Fighters', 'Bombers', 'Propulsion', 'Transports', 'Avionics', 'Armament'],

  TECH_NODES: [
    // Fighter aerodynamics
    { id: 'swept_wings',       name: 'Swept Wings',              row: 0, col: 0, cost: 1200000, work: 6,  specs: ['aerodynamics', 'structures'], requires: [],                              unlocks: ['af_f2'] },
    { id: 'transonic',         name: 'Transonic Aerodynamics',   row: 0, col: 1, cost: 2500000, work: 10, specs: ['aerodynamics', 'structures'], requires: ['swept_wings'],                 unlocks: ['af_f3'] },
    { id: 'delta_wings',       name: 'Delta Wings',              row: 0, col: 2, cost: 5000000, work: 15, specs: ['aerodynamics', 'structures'], requires: ['transonic', 'afterburner'],    unlocks: ['af_f4'] },
    { id: 'variable_geometry', name: 'Variable Geometry',        row: 0, col: 3, cost: 8000000, work: 22, specs: ['aerodynamics', 'structures'], requires: ['delta_wings'],                 unlocks: ['af_f5'] },
    // Bomber aerodynamics
    { id: 'swept_bomber',      name: 'Swept-Wing Bombers',       row: 1, col: 0, cost: 1200000, work: 6,  specs: ['aerodynamics', 'structures'], requires: [],                              unlocks: ['af_b2'] },
    { id: 'large_bomber',      name: 'Large Bomber Structures',  row: 1, col: 1, cost: 2500000, work: 10, specs: ['aerodynamics', 'structures'], requires: ['swept_bomber'],                unlocks: ['af_b3'] },
    { id: 'supersonic_bomber', name: 'Supersonic Bomber',        row: 1, col: 2, cost: 5000000, work: 15, specs: ['aerodynamics', 'structures'], requires: ['large_bomber', 'transonic'],   unlocks: ['af_b4'] },
    { id: 'strategic_bomber',  name: 'Strategic Delta Bomber',   row: 1, col: 3, cost: 8000000, work: 22, specs: ['aerodynamics', 'structures'], requires: ['supersonic_bomber'],           unlocks: ['af_b5'] },
    // Propulsion
    { id: 'axial_flow',        name: 'Axial-Flow Turbojets',     row: 2, col: 0, cost: 1200000, work: 6,  specs: ['propulsion'],                 requires: [],                              unlocks: ['en_2'] },
    { id: 'afterburner',       name: 'Afterburners',             row: 2, col: 1, cost: 2500000, work: 10, specs: ['propulsion'],                 requires: ['axial_flow'],                  unlocks: ['en_3'] },
    { id: 'high_thrust',       name: 'High-Thrust Engines',      row: 2, col: 2, cost: 5000000, work: 15, specs: ['propulsion'],                 requires: ['afterburner'],                 unlocks: ['en_4'] },
    { id: 'turbofan',          name: 'Turbofan Engines',         row: 2, col: 3, cost: 8000000, work: 22, specs: ['propulsion'],                 requires: ['high_thrust'],                 unlocks: ['en_5'] },
    // Transport aerodynamics
    { id: 'cargo_design',      name: 'Cargo Airframes',          row: 3, col: 0, cost: 1200000, work: 6,  specs: ['aerodynamics', 'structures'], requires: [],                              unlocks: ['af_t2'] },
    { id: 'four_engine',       name: 'Four-Engine Transports',   row: 3, col: 1, cost: 2500000, work: 10, specs: ['aerodynamics', 'structures'], requires: ['cargo_design'],                unlocks: ['af_t3'] },
    { id: 'heavy_lift',        name: 'Heavy Lifters',            row: 3, col: 2, cost: 5000000, work: 15, specs: ['aerodynamics', 'structures'], requires: ['four_engine'],                 unlocks: ['af_t4'] },
    { id: 'jet_freighter',     name: 'Jet Freighters',           row: 3, col: 3, cost: 8000000, work: 22, specs: ['aerodynamics', 'structures'], requires: ['heavy_lift', 'turbofan'],      unlocks: ['af_t5'] },
    // Avionics
    { id: 'search_radar',      name: 'Search Radar',             row: 4, col: 0, cost: 1200000, work: 6,  specs: ['avionics'],                   requires: [],                              unlocks: ['av_2'] },
    { id: 'gun_radar',         name: 'Gun-Laying Radar',         row: 4, col: 1, cost: 2500000, work: 10, specs: ['avionics'],                   requires: ['search_radar'],                unlocks: ['av_3'] },
    { id: 'irst',              name: 'Infrared Search & Track',  row: 4, col: 2, cost: 5000000, work: 15, specs: ['avionics'],                   requires: ['gun_radar'],                   unlocks: ['av_4'] },
    { id: 'pulse_doppler',     name: 'Pulse-Doppler Radar',      row: 4, col: 3, cost: 8000000, work: 22, specs: ['avionics'],                   requires: ['irst'],                        unlocks: ['av_5'] },
    // Armament
    { id: 'rocket_pods',       name: 'Rocket Pods',              row: 5, col: 0, cost: 1200000, work: 6,  specs: ['structures', 'avionics'],     requires: [],                              unlocks: ['wp_2'] },
    { id: 'guided_missiles',   name: 'Guided Missiles',          row: 5, col: 1, cost: 2500000, work: 10, specs: ['structures', 'avionics'],     requires: ['rocket_pods', 'search_radar'], unlocks: ['wp_3'] },
    { id: 'lr_missiles',       name: 'Long-Range Missiles',      row: 5, col: 2, cost: 5000000, work: 15, specs: ['structures', 'avionics'],     requires: ['guided_missiles', 'gun_radar'], unlocks: ['wp_4'] },
    { id: 'standoff_weapons',  name: 'Standoff Weapons',         row: 5, col: 3, cost: 8000000, work: 22, specs: ['structures', 'avionics'],     requires: ['lr_missiles', 'irst'],         unlocks: ['wp_5'] },
  ],

  /* ---- Components ---- */

  AIRFRAMES: [
    // fighters
    { id: 'af_f1', name: 'Straight-Wing Fighter',     role: 'fighter',   tech: 1, baseSpeed: 880,  baseRange: 1300, payload: 1000,  cost: 2200000,  rel: 0.92 },
    { id: 'af_f2', name: 'Swept-Wing Fighter',        role: 'fighter',   tech: 2, baseSpeed: 1060, baseRange: 1450, payload: 1500,  cost: 3500000,  rel: 0.88 },
    { id: 'af_f3', name: 'Heavy Interceptor',         role: 'fighter',   tech: 3, baseSpeed: 1240, baseRange: 1900, payload: 2500,  cost: 5500000,  rel: 0.85 },
    { id: 'af_f4', name: 'Delta-Wing Fighter',        role: 'fighter',   tech: 4, baseSpeed: 1500, baseRange: 1750, payload: 3000,  cost: 7500000,  rel: 0.83 },
    { id: 'af_f5', name: 'Variable-Geometry Fighter', role: 'fighter',   tech: 5, baseSpeed: 1680, baseRange: 2300, payload: 4000,  cost: 10000000, rel: 0.80 },
    // bombers
    { id: 'af_b1', name: 'Straight-Wing Bomber',      role: 'bomber',    tech: 1, baseSpeed: 700,  baseRange: 2800, payload: 4500,  cost: 6000000,  rel: 0.90 },
    { id: 'af_b2', name: 'Swept-Wing Bomber',         role: 'bomber',    tech: 2, baseSpeed: 860,  baseRange: 3600, payload: 6000,  cost: 9000000,  rel: 0.87 },
    { id: 'af_b3', name: 'Heavy Jet Bomber',          role: 'bomber',    tech: 3, baseSpeed: 950,  baseRange: 6000, payload: 9000,  cost: 14000000, rel: 0.85 },
    { id: 'af_b4', name: 'Supersonic Bomber',         role: 'bomber',    tech: 4, baseSpeed: 1300, baseRange: 4800, payload: 8000,  cost: 18000000, rel: 0.82 },
    { id: 'af_b5', name: 'Strategic Delta Bomber',    role: 'bomber',    tech: 5, baseSpeed: 1850, baseRange: 6500, payload: 11000, cost: 24000000, rel: 0.80 },
    // transports
    { id: 'af_t1', name: 'Light Transport',           role: 'transport', tech: 1, baseSpeed: 480,  baseRange: 1600, payload: 3500,  cost: 3000000,  rel: 0.93 },
    { id: 'af_t2', name: 'Twin-Engine Transport',     role: 'transport', tech: 2, baseSpeed: 560,  baseRange: 2600, payload: 6000,  cost: 5000000,  rel: 0.91 },
    { id: 'af_t3', name: 'Four-Engine Transport',     role: 'transport', tech: 3, baseSpeed: 650,  baseRange: 4200, payload: 12000, cost: 9000000,  rel: 0.89 },
    { id: 'af_t4', name: 'Heavy Lifter',              role: 'transport', tech: 4, baseSpeed: 740,  baseRange: 5200, payload: 20000, cost: 14000000, rel: 0.87 },
    { id: 'af_t5', name: 'Jet Freighter',             role: 'transport', tech: 5, baseSpeed: 860,  baseRange: 6200, payload: 30000, cost: 20000000, rel: 0.86 },
  ],

  ENGINES: [
    { id: 'en_1', name: 'RD-10 Turbojet',       tech: 1, speedMult: 1.00, rangeMult: 1.00, cost: 600000,  rel: 0.90 },
    { id: 'en_2', name: 'VK-1 Turbojet',        tech: 2, speedMult: 1.12, rangeMult: 1.05, cost: 1000000, rel: 0.88 },
    { id: 'en_3', name: 'AM-5 Afterburning',    tech: 3, speedMult: 1.28, rangeMult: 0.98, cost: 1600000, rel: 0.84 },
    { id: 'en_4', name: 'AL-7F Afterburning',   tech: 4, speedMult: 1.45, rangeMult: 1.04, cost: 2400000, rel: 0.82 },
    { id: 'en_5', name: 'D-25 Turbofan',        tech: 5, speedMult: 1.58, rangeMult: 1.22, cost: 3600000, rel: 0.86 },
  ],

  AVIONICS: [
    { id: 'av_1', name: 'Radio & Optical Sight', tech: 1, combat: 0,  cost: 150000,  rel: 0.95 },
    { id: 'av_2', name: 'Basic Radar',           tech: 2, combat: 5,  cost: 450000,  rel: 0.90 },
    { id: 'av_3', name: 'Gun-Laying Radar',      tech: 3, combat: 10, cost: 900000,  rel: 0.87 },
    { id: 'av_4', name: 'Radar + IRST',          tech: 4, combat: 16, cost: 1500000, rel: 0.85 },
    { id: 'av_5', name: 'Pulse-Doppler Suite',   tech: 5, combat: 24, cost: 2400000, rel: 0.84 },
  ],

  WEAPONS: [
    { id: 'wp_0', name: 'None (unarmed)',          tech: 1, firepower: 0,  drag: 0, cost: 0,       rel: 1.00 },
    { id: 'wp_1', name: 'Autocannons',             tech: 1, firepower: 10, drag: 0, cost: 250000,  rel: 0.93 },
    { id: 'wp_2', name: 'Rocket Pods',             tech: 2, firepower: 16, drag: 1, cost: 400000,  rel: 0.90 },
    { id: 'wp_3', name: 'Short-Range Missiles',    tech: 3, firepower: 24, drag: 1, cost: 800000,  rel: 0.85 },
    { id: 'wp_4', name: 'Long-Range Missiles',     tech: 4, firepower: 34, drag: 2, cost: 1400000, rel: 0.82 },
    { id: 'wp_5', name: 'Standoff Guided Weapons', tech: 5, firepower: 46, drag: 2, cost: 2200000, rel: 0.80 },
  ],

  /* ---- Aircraft types (contract roles) ---- */
  TYPES: {
    fighter:   { label: 'Fighter',   baseUnits: 700, unitsPerEng: 300, rate: 400 },
    bomber:    { label: 'Bomber',    baseUnits: 160, unitsPerEng: 80,  rate: 1600 },
    transport: { label: 'Transport', baseUnits: 280, unitsPerEng: 160, rate: 800 },
  },

  /* ---- AI competitor bureaus ---- */
  COMPETITORS: [
    { name: 'Mikoyan-Gurevich', specialty: 'fighter',   aggression: 0.80, techOffset: 1, rep: 0.75 },
    { name: 'Sukhoi',           specialty: 'fighter',   aggression: 0.60, techOffset: 0, rep: 0.60 },
    { name: 'Tupolev',          specialty: 'bomber',    aggression: 0.70, techOffset: 1, rep: 0.85 },
    { name: 'Ilyushin',         specialty: 'bomber',    aggression: 0.50, techOffset: 0, rep: 0.70 },
    { name: 'Antonov',          specialty: 'transport', aggression: 0.60, techOffset: 0, rep: 0.65 },
  ],

  /* Conflicts of the era. While active, aircraft in service may be engaged each
     month: roles maps aircraft type → how heavily that type is drawn into the
     fighting (0..1, multiplied by intensity for the monthly engagement chance). */
  CONFLICTS: [
    { id: 'korea',    name: 'Korean War',            start: { y: 1950, m: 7 },  months: 37, intensity: 0.90,
      roles: { fighter: 1.0, bomber: 0.6, transport: 0.4 },
      theater: 'over MiG Alley', enemy: 'Sabre interceptors',
      announce: 'War erupts on the Korean peninsula. Fraternal air forces will fly our aircraft into battle — results will reflect on the bureau.',
      end: 'Armistice signed at Panmunjom. The Korean front falls quiet.' },
    { id: 'taiwan1',  name: 'Taiwan Strait Crisis',  start: { y: 1954, m: 9 },  months: 8,  intensity: 0.50,
      roles: { fighter: 1.0, bomber: 0.3, transport: 0.2 },
      theater: 'over the Strait', enemy: 'Nationalist F-86s',
      announce: 'Artillery thunders across the Taiwan Strait. Allied squadrons scramble our fighters.',
      end: 'The Strait crisis subsides.' },
    { id: 'suez',     name: 'Suez Crisis',           start: { y: 1956, m: 10 }, months: 4,  intensity: 0.65,
      roles: { fighter: 0.8, bomber: 0.7, transport: 0.5 },
      theater: 'over the Canal Zone', enemy: 'Anglo-French raiders',
      announce: 'Invasion at Suez. Client air forces equipped with our aircraft are thrown into the defense.',
      end: 'Ceasefire at Suez. The canal smolders.' },
    { id: 'taiwan2',  name: 'Second Strait Crisis',  start: { y: 1958, m: 8 },  months: 5,  intensity: 0.60,
      roles: { fighter: 1.0, bomber: 0.2, transport: 0.2 },
      theater: 'over the Strait', enemy: 'Sabres armed with heat-seeking missiles',
      announce: 'The Strait flares up again — and this time the enemy carries heat-seeking missiles.',
      end: 'The second Strait crisis winds down.' },
    { id: 'congo',    name: 'Congo Airlift',         start: { y: 1960, m: 7 },  months: 18, intensity: 0.35,
      roles: { fighter: 0.1, bomber: 0.0, transport: 1.0 },
      theater: 'into Stanleyville', enemy: 'ground fire',
      announce: 'Crisis in the Congo. The UN and allied governments beg for airlift capacity.',
      end: 'The Congo airlift stands down.' },
    { id: 'himalaya', name: 'Himalayan Border War',  start: { y: 1962, m: 10 }, months: 2,  intensity: 0.45,
      roles: { fighter: 0.3, bomber: 0.2, transport: 0.9 },
      theater: 'across the high passes', enemy: 'mountain weather and ground fire',
      announce: 'War in the Himalayas. Supply by air is the only way over the passes.',
      end: 'Ceasefire in the mountains.' },
    { id: 'yemen',    name: 'Yemen Expedition',      start: { y: 1962, m: 11 }, months: 26, intensity: 0.50,
      roles: { fighter: 0.4, bomber: 0.8, transport: 0.6 },
      theater: 'over the Yemeni highlands', enemy: 'royalist anti-aircraft guns',
      announce: 'Republican forces in Yemen call for air support. Our bombers will carry the weight.',
      end: 'The Yemen expedition is wound down.' },
    { id: 'tonkin',   name: 'Indochina Crisis',      start: { y: 1964, m: 8 },  months: 6,  intensity: 0.70,
      roles: { fighter: 0.7, bomber: 0.4, transport: 0.6 },
      theater: 'over the Red River delta', enemy: 'carrier-based raiders',
      announce: 'Incident in the Gulf of Tonkin. The air war over Indochina begins.',
      end: 'A pause in the Indochina fighting.' },
  ],

  BATTLE_TEXTS: {
    fighter: [
      '{name} squadrons clashed with {enemy} {theater}: {kills} confirmed victories for {losses} losses.',
      'Our {name}s intercepted {enemy} {theater} — {kills} kills, {losses} of ours failed to return.',
    ],
    bomber: [
      '{name} strike groups hit positions {theater}: {targets} targets destroyed, {losses} lost to {enemy}.',
      'Raids by our {name}s {theater} destroyed {targets} targets; {losses} aircraft fell to {enemy}.',
    ],
    transport: [
      '{name}s flew the airlift {theater}: {tons} tonnes delivered, {losses} lost to {enemy}.',
      'Supply runs {theater} by our {name}s delivered {tons} tonnes of cargo; {losses} aircraft lost.',
    ],
  },

  CONTRACT_NAMES: {
    fighter: [
      'Frontline Fighter Program', 'Interceptor Directive', 'Air Superiority Initiative',
      'All-Weather Interceptor', 'Point-Defense Fighter', 'Escort Fighter Requirement',
    ],
    bomber: [
      'Strategic Bomber Program', 'Frontline Bomber Directive', 'Long-Range Strike Initiative',
      'Naval Strike Bomber', 'Theater Bomber Requirement',
    ],
    transport: [
      'Military Airlift Program', 'Arctic Supply Transport', 'Paratroop Carrier Directive',
      'Strategic Lifter Initiative', 'Frontline Cargo Requirement',
    ],
  },

  FIRST_NAMES: [
    'Ivan', 'Sergei', 'Mikhail', 'Andrei', 'Dmitri', 'Nikolai', 'Pavel', 'Viktor',
    'Yuri', 'Boris', 'Anatoly', 'Oleg', 'Vladimir', 'Galina', 'Tatyana', 'Olga',
    'Natalya', 'Irina', 'Lyudmila', 'Valentina',
  ],

  LAST_NAMES: [
    'Petrov', 'Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Sokolov', 'Lebedev',
    'Kozlov', 'Novikov', 'Morozov', 'Volkov', 'Fedorov', 'Mikhailov', 'Belyaev',
    'Orlov', 'Kiselyov', 'Makarov', 'Andreev', 'Zaitsev', 'Pavlov',
  ],

  MONTHS: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};
