# Harmonies Implementation TODO

Based on the official game rules from https://officialgamerules.org/game-rules/harmonies/

## Core Gameplay (Partially Implemented)

### ✅ Implemented

- [x] Basic WebSocket infrastructure with Durable Objects
- [x] Player join/start game flow
- [x] Central board with 5 zones, 3 tokens each
- [x] Token placement mechanics (3 tokens per turn)
- [x] Personal board hex grid (Side A - The River)
- [x] Animal card system (32 cards defined)
- [x] Taking animal cards (max 4 per player)
- [x] Animal cube placement on cards and board
- [x] Token stacking rules (buildings, mountains, trees)
- [x] Turn-based gameplay with current player tracking
- [x] Undo functionality
- [x] End turn with token/animal card replenishment

### 🚧 Partially Implemented / Needs Work

- [ ] **Board Side B (The Islands)** - Grid B needs proper hex coordinates (currently uses Grid A)
- [ ] **Animal Card Completion** - Cards should move to "completed" area when all cubes placed
- [ ] **Scoring System** - Functions exist but need integration into end-game flow

## Missing Core Features

### Game End Conditions

- [ ] **Game end triggers:**
  - [ ] Pouch is empty and Central board cannot be refilled
  - [ ] Player has 2 or fewer unoccupied spaces at end of turn
- [ ] **End game flow:** Current round finishes so all players play equal turns
- [ ] **Final scoring trigger** when game ends

### Scoring (Functions exist but not wired up)

- [ ] **End-game score calculation:**
  - [ ] Trees: Score based on height (1 green=1pt, 1 brown+1 green=3pts, 2 brown+1 green=7pts)
  - [ ] Mountains: Score only if adjacent to another mountain (1 gray=1pt, 2 gray=3pts, 3 gray=7pts)
  - [ ] Fields: Groups of 2+ contiguous yellow tokens = 5 points each
  - [ ] Buildings: Red on brown/gray/red, 5 points if surrounded by 3+ different colors
  - [ ] Water scoring:
    - [ ] Side A (River): Longest consecutive blue path scoring (1→0, 2→2, 3→5, 4→8, 5→11, 6→15, 6+n→15+4n)
    - [ ] Side B (Islands): Count non-blue regions separated by blue, 5 points each (minimum 1)
  - [ ] Animal cards: Score based on topmost uncovered space (cards with all cubes = 0 points)

### Advanced Features

- [ ] **Nature's Spirit Cards (10 cards):**
  - [ ] Setup: Deal 2 to each player, choose 1 to keep
  - [ ] Spirit cube placement (follows same rules as animal cubes)
  - [ ] Spirit card scoring at end of game
  - [ ] Counts toward 4-card limit until completed

### UI/UX Improvements

- [ ] **Score display:** Show current scores during gameplay
- [ ] **Game end screen:** Display final scores and winner
- [ ] **Visual indicators:**
  - [ ] Highlight valid placement locations
  - [ ] Show which tokens can be placed where
  - [ ] Visual feedback for completed animal cards
- [ ] **Board selection:** Allow choosing Side A or B at game start
- [ ] **Reminder cards:** Show board-specific scoring rules

### Missing Animal Card Data

- [ ] **Verify all 32 animal cards have correct:**
  - [ ] Habitat patterns (shape coordinates)
  - [ ] Token color requirements
  - [ ] Stack height requirements
  - [ ] Scoring tiers

## Known Issues

- [ ] Grid B coordinates need to be defined for Islands board

## Nice to Have

- [ ] Solo mode implementation
- [ ] Animations for token placement and cube placement
- [ ] Sound effects
- [ ] Player avatars
- [ ] Chat functionality
- [ ] Game history/replay
- [ ] Spectator mode
