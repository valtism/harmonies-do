import { ring, type Grid, type Hex } from "honeycomb-grid";
import type { ColorType, PlayerGameState, TokenType } from "../sharedTypes";

// Score lookup tables
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

export type PlayerScore = {
  trees: number;
  mountains: number;
  fields: number;
  buildings: number;
  water: number;
  animals: number;
  total: number;
};

type BoardStack = {
  coords: string;
  hex: Hex;
  tokens: TokenType[];
  topColor: ColorType | null;
};

/**
 * Parse board into a more workable format
 */
function parseBoard(
  board: PlayerGameState["board"],
  grid: Grid<Hex>,
): BoardStack[] {
  const stacks: BoardStack[] = [];
  for (const hex of grid) {
    const coords = hex.toString();
    const place = board[coords];
    if (!place) continue;
    const topToken = place.tokens.at(-1);
    stacks.push({
      coords,
      hex,
      tokens: place.tokens,
      topColor: topToken?.color ?? null,
    });
  }
  return stacks;
}

/**
 * Get adjacent stacks for a given stack using Honeycomb traversal
 */
function getAdjacentStacks(
  stack: BoardStack,
  grid: Grid<Hex>,
  stackByCoords: Map<string, BoardStack>,
  allowedCoords?: Set<string>,
): BoardStack[] {
  const neighbors = grid
    .traverse(ring({ center: [stack.hex.q, stack.hex.r], radius: 1 }), {
      bail: false,
    })
    .toArray();
  const adjacent = neighbors
    .map((hex) => stackByCoords.get(hex.toString()))
    .filter((s): s is BoardStack => s !== undefined);
  if (!allowedCoords) return adjacent;
  return adjacent.filter((s) => allowedCoords.has(s.coords));
}

/**
 * Score Trees: green token on top of 0-2 brown tokens
 * - 1 green alone -> 1 point
 * - 1 brown + 1 green -> 3 points
 * - 2 brown + 1 green -> 7 points
 */
export function scoreTrees(
  board: PlayerGameState["board"],
  grid: Grid<Hex>,
): number {
  const stacks = parseBoard(board, grid);
  let total = 0;

  for (const stack of stacks) {
    if (stack.topColor !== "green") continue;

    // Count brown tokens below the green
    const tokens = stack.tokens;
    const greenIndex = tokens.length - 1;

    // Check that all tokens below are brown
    let brownCount = 0;
    let validTree = true;
    for (let i = 0; i < greenIndex; i++) {
      if (tokens[i].color === "brown") {
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

/**
 * Score Mountains: stacks of 1-3 gray tokens
 * Only scores if adjacent to another mountain
 * - 1 gray -> 1 point
 * - 2 gray -> 3 points
 * - 3 gray -> 7 points
 */
export function scoreMountains(
  board: PlayerGameState["board"],
  grid: Grid<Hex>,
): number {
  const stacks = parseBoard(board, grid);
  const stackByCoords = new Map(stacks.map((stack) => [stack.coords, stack]));
  let total = 0;

  // Find all mountain stacks (all gray, 1-3 tokens)
  const mountains = stacks.filter((stack) => {
    if (stack.tokens.length === 0 || stack.tokens.length > 3) return false;
    return stack.tokens.every((t) => t.color === "gray");
  });

  for (const mountain of mountains) {
    // Check if adjacent to another mountain
    const adjacent = getAdjacentStacks(mountain, grid, stackByCoords);
    const hasAdjacentMountain = adjacent.some((adj) => {
      if (adj.tokens.length === 0 || adj.tokens.length > 3) return false;
      return adj.tokens.every((t) => t.color === "gray");
    });

    if (hasAdjacentMountain) {
      total += MOUNTAIN_SCORES[mountain.tokens.length] ?? 0;
    }
  }

  return total;
}

/**
 * Score Fields: contiguous groups of 2+ yellow top tokens
 * Each qualifying group -> 5 points
 */
export function scoreFields(
  board: PlayerGameState["board"],
  grid: Grid<Hex>,
): number {
  const stacks = parseBoard(board, grid);
  const yellowStacks = stacks.filter((s) => s.topColor === "yellow");
  const stackByCoords = new Map(stacks.map((stack) => [stack.coords, stack]));
  const yellowCoords = new Set(yellowStacks.map((stack) => stack.coords));
  const visited = new Set<string>();
  let groupCount = 0;

  for (const stack of yellowStacks) {
    if (visited.has(stack.coords)) continue;

    // BFS to find contiguous yellow group
    const group: BoardStack[] = [];
    const queue = [stack];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.coords)) continue;
      visited.add(current.coords);
      group.push(current);

      const adjacent = getAdjacentStacks(
        current,
        grid,
        stackByCoords,
        yellowCoords,
      );
      for (const adj of adjacent) {
        if (!visited.has(adj.coords)) {
          queue.push(adj);
        }
      }
    }

    // Group of 2+ yellow -> 5 points
    if (group.length >= 2) {
      groupCount++;
    }
  }

  return groupCount * 5;
}

/**
 * Score Buildings: red on top of brown/gray/red (stack of 2+)
 * Scores 5 points if surrounded by 3+ different colored top tokens
 */
export function scoreBuildings(
  board: PlayerGameState["board"],
  grid: Grid<Hex>,
): number {
  const stacks = parseBoard(board, grid);
  const stackByCoords = new Map(stacks.map((stack) => [stack.coords, stack]));
  let total = 0;

  for (const stack of stacks) {
    // Must have red on top and at least 2 tokens
    if (stack.topColor !== "red" || stack.tokens.length < 2) continue;

    // Foundation must be brown, gray, or red
    const foundation = stack.tokens[stack.tokens.length - 2];
    if (!["brown", "gray", "red"].includes(foundation.color)) continue;

    // Check adjacent colors
    const adjacent = getAdjacentStacks(stack, grid, stackByCoords);
    const adjacentColors = new Set<ColorType>();

    for (const adj of adjacent) {
      if (adj.topColor) {
        adjacentColors.add(adj.topColor);
      }
    }

    // 3+ different colors -> 5 points
    if (adjacentColors.size >= 3) {
      total += 5;
    }
  }

  return total;
}

/**
 * Score River (Side A): longest path of consecutive blue top tokens
 * Scoring: 1->0, 2->2, 3->5, 4->8, 5->11, 6->15, 6+n->15+4n
 */
export function scoreRiver(
  board: PlayerGameState["board"],
  grid: Grid<Hex>,
): number {
  const stacks = parseBoard(board, grid);
  const blueStacks = stacks.filter((s) => s.topColor === "blue");
  const stackByCoords = new Map(stacks.map((stack) => [stack.coords, stack]));
  const blueCoords = new Set(blueStacks.map((stack) => stack.coords));

  if (blueStacks.length === 0) return 0;

  // Find the longest of all shortest paths (graph diameter) per component
  let longestPath = 0;
  const visited = new Set<string>();

  for (const start of blueStacks) {
    if (visited.has(start.coords)) continue;

    // Collect connected component
    const component: BoardStack[] = [];
    const queue = [start];
    visited.add(start.coords);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      const adjacent = getAdjacentStacks(
        current,
        grid,
        stackByCoords,
        blueCoords,
      );
      for (const adj of adjacent) {
        if (!visited.has(adj.coords)) {
          visited.add(adj.coords);
          queue.push(adj);
        }
      }
    }

    if (component.length === 0) continue;

    const componentCoords = new Set(component.map((stack) => stack.coords));
    let componentMaxEdges = 0;

    // BFS from each node to find maximum shortest path length (edges)
    for (const root of component) {
      const distances = new Map<string, number>();
      const bfsQueue = [root];
      distances.set(root.coords, 0);

      while (bfsQueue.length > 0) {
        const current = bfsQueue.shift()!;
        const currentDistance = distances.get(current.coords) ?? 0;

        const adjacent = getAdjacentStacks(
          current,
          grid,
          stackByCoords,
          componentCoords,
        );
        for (const adj of adjacent) {
          if (!distances.has(adj.coords)) {
            const nextDistance = currentDistance + 1;
            distances.set(adj.coords, nextDistance);
            componentMaxEdges = Math.max(componentMaxEdges, nextDistance);
            bfsQueue.push(adj);
          }
        }
      }
    }

    // Convert edge length to tile count
    longestPath = Math.max(longestPath, componentMaxEdges + 1);
  }

  // Calculate score based on path length
  if (longestPath <= 6) {
    return RIVER_SCORES[longestPath] ?? 0;
  }
  // 6+ tokens: 15 + 4 for each beyond 6
  return 15 + (longestPath - 6) * 4;
}

/**
 * Score Islands (Side B): count regions of non-blue hexes separated by blue
 * Each island -> 5 points
 * Minimum 1 island always exists
 */
export function scoreIslands(
  board: PlayerGameState["board"],
  grid: Grid<Hex>,
): number {
  const stacks = parseBoard(board, grid);
  const nonBlueStacks = stacks.filter((s) => s.topColor !== "blue");
  const stackByCoords = new Map(stacks.map((stack) => [stack.coords, stack]));
  const nonBlueCoords = new Set(nonBlueStacks.map((stack) => stack.coords));
  const visited = new Set<string>();
  let islandCount = 0;

  for (const stack of nonBlueStacks) {
    if (visited.has(stack.coords)) continue;

    // BFS to find contiguous non-blue region
    const queue = [stack];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.coords)) continue;
      visited.add(current.coords);

      const adjacent = getAdjacentStacks(
        current,
        grid,
        stackByCoords,
        nonBlueCoords,
      );
      for (const adj of adjacent) {
        if (!visited.has(adj.coords)) {
          queue.push(adj);
        }
      }
    }

    islandCount++;
  }

  // Minimum 1 island
  return Math.max(islandCount, 1) * 5;
}

/**
 * Calculate total score for a player
 */
export function calculatePlayerScore(
  board: PlayerGameState["board"],
  grid: Grid<Hex>,
  boardType: "A" | "B",
  completedAnimalCardPoints: number = 0,
): PlayerScore {
  const trees = scoreTrees(board, grid);
  const mountains = scoreMountains(board, grid);
  const fields = scoreFields(board, grid);
  const buildings = scoreBuildings(board, grid);
  const water =
    boardType === "A" ? scoreRiver(board, grid) : scoreIslands(board, grid);
  const animals = completedAnimalCardPoints;

  return {
    trees,
    mountains,
    fields,
    buildings,
    water,
    animals,
    total: trees + mountains + fields + buildings + water + animals,
  };
}
