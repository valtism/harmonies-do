import type { ColorType, PlayerScore } from "../sharedTypes";
import type { BoardStack, PersonalBoardView } from "./personalBoard";

const TREE_SCORES: Record<number, number> = { 0: 1, 1: 3, 2: 7 };
const MOUNTAIN_SCORES: Record<number, number> = { 1: 1, 2: 3, 3: 7 };
const RIVER_SCORES: Record<number, number> = {
  1: 0,
  2: 2,
  3: 5,
  4: 8,
  5: 11,
  6: 15,
};

type ScoringFeature =
  | "trees"
  | "mountains"
  | "fields"
  | "buildings"
  | "water";

type ScoringFeatureAdapter = {
  feature: ScoringFeature;
  score: (personalBoard: PersonalBoardView, side: "A" | "B") => number;
};

export function calculateFinalScore({
  personalBoard,
  side,
  animalPoints = 0,
}: {
  personalBoard: PersonalBoardView;
  side: "A" | "B";
  animalPoints?: number;
}): PlayerScore {
  const scores = Object.fromEntries(
    scoringFeatureAdapters.map((adapter) => [
      adapter.feature,
      adapter.score(personalBoard, side),
    ]),
  ) as Record<ScoringFeature, number>;

  return {
    trees: scores.trees,
    mountains: scores.mountains,
    fields: scores.fields,
    buildings: scores.buildings,
    water: scores.water,
    animals: animalPoints,
    total:
      scores.trees +
      scores.mountains +
      scores.fields +
      scores.buildings +
      scores.water +
      animalPoints,
  };
}

const scoringFeatureAdapters: ScoringFeatureAdapter[] = [
  {
    feature: "trees",
    score: scoreTrees,
  },
  {
    feature: "mountains",
    score: scoreMountains,
  },
  {
    feature: "fields",
    score: scoreFields,
  },
  {
    feature: "buildings",
    score: scoreBuildings,
  },
  {
    feature: "water",
    score: (personalBoard, side) =>
      side === "A" ? scoreRiver(personalBoard) : scoreIslands(personalBoard),
  },
];

export function scoreTrees(personalBoard: PersonalBoardView): number {
  let total = 0;

  for (const stack of personalBoard.stacks()) {
    if (stack.topColor !== "green") continue;

    const greenIndex = stack.tokens.length - 1;
    let brownCount = 0;
    let validTree = true;

    for (let i = 0; i < greenIndex; i++) {
      if (stack.tokens[i]?.color === "brown") {
        brownCount++;
      } else {
        validTree = false;
        break;
      }
    }

    if (validTree && brownCount <= 2) {
      total += TREE_SCORES[brownCount] ?? 0;
    }
  }

  return total;
}

export function scoreMountains(personalBoard: PersonalBoardView): number {
  let total = 0;

  for (const mountain of mountainStacks(personalBoard.stacks())) {
    const hasAdjacentMountain = adjacentStacks(personalBoard, mountain).some(
      isMountain,
    );

    if (hasAdjacentMountain) {
      total += MOUNTAIN_SCORES[mountain.tokens.length] ?? 0;
    }
  }

  return total;
}

export function scoreFields(personalBoard: PersonalBoardView): number {
  const yellowCoords = new Set(
    personalBoard
      .stacks()
      .filter((stack) => stack.topColor === "yellow")
      .map((stack) => stack.coords),
  );
  const visited = new Set<string>();
  let groupCount = 0;

  for (const coords of yellowCoords) {
    if (visited.has(coords)) continue;

    const group = collectConnectedCoords(personalBoard, coords, yellowCoords);
    for (const groupCoords of group) {
      visited.add(groupCoords);
    }

    if (group.size >= 2) {
      groupCount++;
    }
  }

  return groupCount * 5;
}

export function scoreBuildings(personalBoard: PersonalBoardView): number {
  let total = 0;

  for (const stack of personalBoard.stacks()) {
    if (stack.topColor !== "red" || stack.tokens.length < 2) continue;

    const foundation = stack.tokens[stack.tokens.length - 2];
    if (!foundation || !["brown", "gray", "red"].includes(foundation.color)) {
      continue;
    }

    const adjacentColors = new Set<ColorType>();
    for (const adjacent of adjacentStacks(personalBoard, stack)) {
      if (adjacent.topColor) {
        adjacentColors.add(adjacent.topColor);
      }
    }

    if (adjacentColors.size >= 3) {
      total += 5;
    }
  }

  return total;
}

export function scoreRiver(personalBoard: PersonalBoardView): number {
  const blueCoords = new Set(
    personalBoard
      .stacks()
      .filter((stack) => stack.topColor === "blue")
      .map((stack) => stack.coords),
  );

  if (blueCoords.size === 0) return 0;

  let longestPath = 0;
  const visited = new Set<string>();

  for (const start of blueCoords) {
    if (visited.has(start)) continue;

    const component = collectConnectedCoords(personalBoard, start, blueCoords);
    for (const coords of component) {
      visited.add(coords);
    }

    let componentMaxEdges = 0;
    for (const root of component) {
      const distances = shortestDistances(personalBoard, root, component);
      for (const distance of distances.values()) {
        componentMaxEdges = Math.max(componentMaxEdges, distance);
      }
    }

    longestPath = Math.max(longestPath, componentMaxEdges + 1);
  }

  if (longestPath <= 6) {
    return RIVER_SCORES[longestPath] ?? 0;
  }

  return 15 + (longestPath - 6) * 4;
}

export function scoreIslands(personalBoard: PersonalBoardView): number {
  const nonBlueCoords = new Set(
    personalBoard
      .stacks()
      .filter((stack) => stack.topColor !== "blue")
      .map((stack) => stack.coords),
  );
  const visited = new Set<string>();
  let islandCount = 0;

  for (const coords of nonBlueCoords) {
    if (visited.has(coords)) continue;

    const island = collectConnectedCoords(personalBoard, coords, nonBlueCoords);
    for (const islandCoords of island) {
      visited.add(islandCoords);
    }
    islandCount++;
  }

  return Math.max(islandCount, 1) * 5;
}

function mountainStacks(stacks: BoardStack[]): BoardStack[] {
  return stacks.filter(isMountain);
}

function isMountain(stack: BoardStack): boolean {
  return (
    stack.tokens.length > 0 &&
    stack.tokens.length <= 3 &&
    stack.tokens.every((token) => token.color === "gray")
  );
}

function adjacentStacks(
  personalBoard: PersonalBoardView,
  stack: BoardStack,
): BoardStack[] {
  return personalBoard
    .adjacentCoords(stack.coords)
    .map((coords) => ({
      coords,
      tokens: personalBoard.stackAt(coords),
      topColor: personalBoard.stackAt(coords).at(-1)?.color ?? null,
    }));
}

function collectConnectedCoords(
  personalBoard: PersonalBoardView,
  start: string,
  allowedCoords: Set<string>,
): Set<string> {
  const connected = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const coords = queue.shift()!;
    if (connected.has(coords)) continue;
    connected.add(coords);

    for (const adjacent of personalBoard.adjacentCoords(coords)) {
      if (allowedCoords.has(adjacent) && !connected.has(adjacent)) {
        queue.push(adjacent);
      }
    }
  }

  return connected;
}

function shortestDistances(
  personalBoard: PersonalBoardView,
  start: string,
  allowedCoords: Set<string>,
): Map<string, number> {
  const distances = new Map<string, number>();
  const queue = [start];
  distances.set(start, 0);

  while (queue.length > 0) {
    const coords = queue.shift()!;
    const distance = distances.get(coords) ?? 0;

    for (const adjacent of personalBoard.adjacentCoords(coords)) {
      if (!allowedCoords.has(adjacent) || distances.has(adjacent)) continue;
      distances.set(adjacent, distance + 1);
      queue.push(adjacent);
    }
  }

  return distances;
}
