# Red Star Bureau - Web MVP Technical Specification

## Project Overview

**Game Type:** Soviet Aircraft Design Bureau Management Simulation  
**Platform:** Web Browser (HTML5/CSS3/JavaScript)  
**Target:** Proof of Concept / Minimum Viable Product  
**Development Framework:** React.js or Vue.js recommended  
**Estimated Complexity:** Medium (2-4 weeks for experienced developer)

## Core Game Loop

1. **View Available Contracts** → Select and bid on government aircraft contracts
2. **Allocate Resources** → Assign engineers and budget to design projects
3. **Design Aircraft** → Choose components and specifications within constraints
4. **Submit Proposal** → Compete against AI bureaus for contract award
5. **Manage Production** → Handle won contracts and assign maintenance engineers
6. **Monitor Performance** → Track aircraft effectiveness and revenue streams
7. **Research Technology** → Unlock new components and capabilities
8. **Repeat** → Take on new contracts while managing legacy aircraft

## Game Mechanics

### 1. Contract System

#### Contract Structure
```javascript
const contract = {
  id: "CONTRACT_001",
  name: "Frontline Fighter Program",
  type: "fighter", // fighter, bomber, transport
  requirements: {
    speed: { min: 800, target: 1000, unit: "km/h" },
    range: { min: 1200, target: 1500, unit: "km" },
    payload: { min: 2000, target: 3000, unit: "kg" },
    cost: { max: 15000000, unit: "rubles" }
  },
  deadline: 12, // months
  budget: 25000000, // rubles
  difficulty: "medium",
  description: "Design a modern interceptor for homeland defense"
}
```

#### Bidding Process
- 3-4 AI competitors per contract
- Player submits: proposed specs, cost, timeline
- Evaluation: 60% technical compliance, 25% cost, 15% timeline
- Results announced after 1 game month

### 2. Aircraft Design System

#### Component Categories
```javascript
const componentTypes = {
  engine: {
    available: ["Turbojet-1", "Turbojet-2", "Turbofan-1"],
    properties: ["thrust", "fuel_consumption", "weight", "cost", "reliability"]
  },
  airframe: {
    available: ["Light-Fighter", "Heavy-Fighter", "Delta-Wing"],
    properties: ["max_speed", "maneuverability", "weight", "cost", "stealth"]
  },
  avionics: {
    available: ["Basic-Radar", "Advanced-Radar", "IRST"],
    properties: ["detection_range", "accuracy", "weight", "cost", "reliability"]
  },
  weapons: {
    available: ["Cannons", "Short-Range-Missiles", "Long-Range-Missiles"],
    properties: ["firepower", "range", "weight", "cost", "accuracy"]
  }
}
```

#### Performance Calculation
```javascript
function calculatePerformance(components) {
  const aircraft = {
    speed: calculateSpeed(components.engine, components.airframe),
    range: calculateRange(components.engine, components.airframe),
    payload: calculatePayload(components.airframe, components.weapons),
    cost: sumComponentCosts(components),
    reliability: calculateReliability(components),
    combat_effectiveness: calculateCombatValue(components)
  }
  return aircraft;
}
```

### 3. Bureau Management

#### Staff System
```javascript
const engineer = {
  id: "ENG_001",
  name: "Ivan Petrov",
  level: "senior", // junior, senior, principal
  specialization: "aerodynamics", // aerodynamics, propulsion, avionics, structures, maintenance
  experience: 75, // 0-100
  salary: 5000, // rubles/month
  current_assignment: "PROJECT_A", // or "MAINTENANCE_MIG15"
  efficiency: 0.85 // performance modifier
}
```

#### Department Structure
- **Design Engineering:** Work on new aircraft projects
- **Maintenance Engineering:** Support aircraft in service
- **Research Division:** Unlock new technologies
- **Administration:** Overall bureau efficiency

### 4. Technology Tree

#### Research Categories
```javascript
const techTree = {
  aerodynamics: {
    current_level: 1,
    max_level: 5,
    unlocked: ["basic_wings", "swept_wings"],
    next_tier: ["delta_wings", "variable_geometry"], // n+1 visibility
    research_cost: 500000, // rubles
    research_time: 6 // months
  },
  propulsion: {
    current_level: 2,
    max_level: 5,
    unlocked: ["turbojet_basic", "turbojet_advanced"],
    next_tier: ["turbofan_early", "afterburner"],
    research_cost: 750000,
    research_time: 8
  }
  // ... other categories
}
```

### 5. Production & Maintenance

#### Aircraft Lifecycle
```javascript
const aircraftInService = {
  design_id: "MIG_15_CUSTOM",
  name: "MiG-15bis Custom",
  production_year: 1952,
  units_built: 1500,
  maintenance_engineers: 3, // assigned engineers
  maintenance_cost: 50000, // rubles/month
  revenue_stream: 75000, // rubles/month from parts/support
  combat_record: {
    deployment: "Korean War",
    effectiveness: 0.85, // based on how well specs were met
    reputation_impact: "positive"
  },
  service_years_remaining: 8
}
```

#### Maintenance Decision System
- Each aircraft design requires ongoing engineering support
- Player must decide when to discontinue support for older designs
- Discontinuing saves engineering resources but loses revenue stream
- Keeping too many aircraft in service spreads engineers too thin

### 6. AI Competition

#### Competitor AI Bureaus
```javascript
const aiBureaus = [
  {
    name: "Mikoyan-Gurevich",
    specialty: "fighters",
    aggression: 0.8, // bidding behavior
    tech_level: 3,
    reputation: 0.75
  },
  {
    name: "Sukhoi",
    specialty: "ground_attack",
    aggression: 0.6,
    tech_level: 2,
    reputation: 0.65
  },
  {
    name: "Tupolev",
    specialty: "bombers",
    aggression: 0.7,
    tech_level: 4,
    reputation: 0.85
  }
]
```

## User Interface Requirements

### 1. Main Dashboard
- **Bureau Overview Panel**
  - Current funds, monthly income/expenses
  - Active projects status
  - Staff summary (total engineers, assignments)
  - Reputation meter

- **Quick Actions**
  - View available contracts
  - Access design workshop
  - Manage staff assignments
  - Research progress

### 2. Contract Board
- **Available Contracts List**
  - Contract name, type, deadline
  - Requirements summary
  - Estimated difficulty
  - Competition level (number of bidders)

- **Active Projects Panel**
  - Current design projects
  - Progress indicators
  - Engineer assignments
  - Budget consumption

### 3. Design Workshop
- **Component Selection Interface**
  - Drag-and-drop or dropdown selection
  - Real-time performance updates
  - Cost calculator
  - Requirement compliance indicators

- **Performance Dashboard**
  - Speed, range, payload gauges
  - Cost breakdown
  - Requirement comparison (met/exceeded/failed)
  - Timeline estimation

### 4. Staff Management
- **Engineer Roster**
  - Name, level, specialization, experience
  - Current assignment
  - Efficiency rating
  - Salary

- **Assignment Matrix**
  - Projects vs. Engineers grid
  - Maintenance assignments
  - Research team allocation

### 5. Research Lab
- **Technology Tree Visualization**
  - Current unlocked technologies
  - Next tier preview (n+1 visibility only)
  - Research progress bars
  - Cost and time requirements

### 6. Financial Management
- **Revenue Streams**
  - Contract payments
  - Maintenance income
  - Spare parts sales
  - Export earnings

- **Expense Tracking**
  - Staff salaries
  - Research costs
  - Facility maintenance
  - Project development costs

## Data Structures

### Game State
```javascript
const gameState = {
  player: {
    bureau_name: "Red Star Design Bureau",
    funds: 50000000, // rubles
    reputation: 0.5, // 0-1
    game_date: "1950-01-01"
  },
  staff: [], // array of engineer objects
  contracts: {
    available: [], // open contracts for bidding
    active: [], // won contracts in development
    completed: [] // finished projects
  },
  aircraft_designs: [], // player's aircraft designs
  aircraft_in_service: [], // deployed aircraft requiring maintenance
  technology: {}, // tech tree state
  competitors: [], // AI bureau states
  research_projects: [] // ongoing research
}
```

### Save System
- Local storage for MVP
- JSON serialization of game state
- Auto-save every game month
- Manual save/load functionality

## Game Balance Parameters

### Starting Conditions
- **Initial Funds:** 50,000,000 rubles
- **Starting Staff:** 15 engineers (mix of junior/senior)
- **Tech Level:** Basic 1950s technology
- **Available Contracts:** 3-4 starter contracts

### Time Progression
- **Game Speed:** 1 real minute = 1 game month
- **Contract Frequency:** 2-3 new contracts per game month
- **Research Duration:** 3-12 game months per technology

### Difficulty Scaling
- **Early Game:** Simple requirements, forgiving deadlines
- **Mid Game:** Complex multi-role aircraft, tighter constraints
- **Late Game:** Cutting-edge technology, international competition

## Victory Conditions

### Primary Objectives
- **Market Leadership:** Win 60% of available contracts over 5 years
- **Technological Supremacy:** Unlock top-tier technologies first
- **Financial Success:** Maintain positive cash flow while expanding

### Failure States
- **Bankruptcy:** Funds reach zero
- **Reputation Collapse:** Too many failed contracts
- **Technical Obsolescence:** Can't compete with advanced AI bureaus

## Implementation Notes

### Technical Requirements
- **Frontend:** React/Vue.js with component-based architecture
- **State Management:** Redux/Vuex for complex game state
- **Styling:** CSS Grid/Flexbox for responsive dashboard layouts
- **Charts:** Chart.js or D3.js for performance visualizations
- **Data Persistence:** LocalStorage for MVP, consider IndexedDB for larger saves

### Performance Considerations
- Optimize for 60fps on modern browsers
- Lazy load heavy components (tech tree, detailed aircraft stats)
- Efficient re-rendering for frequently updated dashboard elements
- Consider Web Workers for complex calculations (aircraft performance, AI decisions)

### Accessibility
- Keyboard navigation for all interactive elements
- Screen reader support for important game information
- Color-blind friendly palette for status indicators
- Scalable UI for different screen sizes

## Development Phases

### Phase 1: Core Loop (Week 1)
- Basic contract system (view, bid, win/lose)
- Simple aircraft design (component selection)
- Staff assignment mechanics
- Win/loss conditions

### Phase 2: Depth (Week 2)
- Technology research system
- AI competitor behavior
- Financial management
- Production/maintenance phase

### Phase 3: Polish (Week 3-4)
- UI improvements and animations
- Balance testing and adjustments
- Save/load system
- Tutorial and help system

## Success Metrics

### Player Engagement
- Session length (target: 20+ minutes)
- Return rate (target: 60% day-2 retention)
- Completion rate (target: 40% reach late game)

### Gameplay Balance
- Contract win rate (target: 30-40% for balanced difficulty)
- Technology progression (target: steady unlock every 2-3 sessions)
- Financial sustainability (target: 80% of players remain solvent)

This specification provides a complete foundation for developing a web-based MVP of Red Star Bureau that captures the core management simulation gameplay while remaining technically feasible for rapid prototyping.
