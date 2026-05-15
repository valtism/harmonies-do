# Context — Harmonies

Shared language for the Harmonies digital implementation. This is a glossary, not a spec. Implementation details belong in code and ADRs.

## Glossary

### Hex
A single addressable cell on a **Personal Board**. A Hex holds a **Stack** of **Tokens** and optionally a **Cube**. Use "place a token on a hex" as the verb form. Use *Slot* (not Hex) for positions in the taken-token tray.

In code, the geometric/coordinate side of a Hex is honeycomb-grid's `Hex` class; the *state at* a hex (its tokens and cube) is the `HexState` interface in `sharedTypes.ts`.

### Slot
A fixed position (0, 1, or 2) in a player's three-token **Taken Tokens** tray — the holding area for tokens drawn from the **Central Board** before they are placed onto the **Personal Board**.

### Central Board
The shared token market: 5 **Zones**, each holding 3 **Tokens**. Tokens are drawn from here into a player's **Taken Tokens** tray. Distinct from any *board* a player owns.

### Zone
One of the 5 sub-regions of the **Central Board**, each holding up to 3 **Tokens**. A player draws tokens by selecting a Zone, taking all tokens currently in it. The 3 positions within a Zone are not named in domain language.

### Personal Board
A single player's hex grid where tokens are stacked and cubes are placed. Each Personal Board has a **Side** (A or B); the side determines the grid shape and which water-scoring rule applies.

### Side
The variant of a Personal Board: **Side A** is *The River*, **Side B** is *The Islands*. Chosen at game start; affects grid geometry and water scoring only.

### Animal Spread
The row of up to 5 face-up **Animal Cards** available to take. Distinct from a player's held animal cards and from the deck.

### Taken Tokens
A player's three-slot tray holding tokens drawn from the **Central Board** for the current turn. Tokens must move from here onto the **Personal Board** before the turn ends.

### Token
A colored game piece (blue, gray, brown, green, yellow, red) drawn from the **Central Board** and stacked on a **Hex**. Tokens form the **Stacks** that satisfy **Habitat Patterns**.

### Stack
The ordered tower of **Tokens** on a single **Hex**. Has a **Stack Height** (count) and a top-token color. Stacking rules restrict which colors may be stacked on top of which.

### Cube
A scoring marker placed on a **Hex** once its **Stack** matches a card's **Habitat Pattern**. Two kinds: **Animal Cube** (from an **Animal Card**) and **Spirit Cube** (from a **Spirit Card**). A Hex holds at most one Cube.

### Animal Card
A card with a **Habitat Pattern** and a tier of point values. When the pattern is realised on the **Personal Board**, an **Animal Cube** moves from the card onto a matching **Hex**. A card with all its cubes placed becomes **Completed**.

An Animal Card is in one of four locations: **Deck**, **Animal Spread**, **Held** (in a player's **Player Cards** row), or **Completed**.

### Spirit Card
A card dealt during setup that, like an **Animal Card**, has a pattern and scores via **Spirit Cubes**. A Spirit Card occupies a **Player Cards** slot — counting toward the 4-card limit — until it is **Completed**.

### Player Cards
A player's row of up to 4 face-up card slots, shared between **Held** **Animal Cards** and any active **Spirit Card**. Completed cards leave this row.

### Habitat Pattern
The shape an **Animal Card** requires on the **Personal Board** before its cubes can be placed. A list of **Habitat Requirements**, one per hex in the pattern.

### Habitat Requirement
The condition on one hex of a **Habitat Pattern**: an exact **Stack Height** *and* a required color for the topmost **Token**. Both must hold simultaneously — a taller stack does not satisfy the requirement.

### Completed (Animal Card)
An Animal Card with all its **Animal Cubes** placed onto the **Personal Board**. Completed cards score 0 from the card itself; their points come from the cubes already placed.

### Turn
One player's full sequence of actions, from the start of their go until they end the turn (token draw, token placement, optional card take/place, refill). Harmonies has no named intra-turn phases — order within a turn is flexible.

### Round
One cycle in which every player takes one **Turn**. Used only to describe the end-game rule: once an end-game trigger fires, the current Round finishes so all players have taken an equal number of Turns.

### End Game
The state entered when either end-game trigger fires (pouch empty and **Central Board** cannot refill, OR a player ends a Turn with 2 or fewer empty **Hexes**). The current **Round** completes, then **Final Scoring** runs.

### Final Scoring
The end-of-game score calculation across all categories: trees, mountains, fields, buildings, water (rule depends on **Side**), and animals (held + completed). Produces each player's total.

### Pouch
The bag from which tokens are drawn to refill the **Central Board**. When the Pouch is empty and the Central Board cannot be fully refilled at end-of-turn, the first **End Game** trigger fires.

### Scoring Feature
A pattern of **Tokens** on the **Personal Board** that scores during **Final Scoring**. Scoring Features are not the same as raw token colors — a lone green token is not a **Tree**, a lone red token is not a **Building**. The features are: **Tree**, **Mountain**, **Field**, **Building**, **Water Feature**. Animal scoring is separate (from cubes and held cards).

### Tree
A **Stack** scored as foliage: green token(s) crowning zero or more brown trunk tokens. Only stacks with a green top qualify; brown alone is not a Tree.

### Mountain
A **Stack** of gray tokens, scored only when adjacent (on the hex grid) to at least one other Mountain.

### Field
A contiguous group of yellow tokens on the **Personal Board**. A group of 2 or more qualifies as a Field; a lone yellow token does not score.

### Building
A red token placed atop a qualifying base **Stack** (brown, gray, or red). Bonus scoring depends on the variety of distinct token colors among adjacent **Hexes**.

### Water Feature
The blue-token **Scoring Feature**. The qualifying shape depends on **Side**: on **Side A** (River) it is the longest consecutive blue path; on **Side B** (Islands) it is determined by the number of **Islands** that blue separates.

### Island
On a **Side B** **Personal Board**, a maximal contiguous region of non-blue **Hexes** bordered by blue tokens (or the board edge). Islands are the unit counted for Side B water scoring.

### Undo
Reverts a single prior action within the current **Turn** (e.g. one token placement, one card take), not the whole Turn. Multiple Undos walk back the Turn one action at a time. Actions from earlier Turns are not undoable.

