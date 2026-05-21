import { ring, type Grid, type Hex } from "honeycomb-grid";
import type {
  ColorType,
  HexState,
  ImmutablePrivateGameState,
  PrivateGameState,
  PlayerGameState,
  TokenType,
} from "../sharedTypes";
import { tokenPlacable } from "../util/tokenPlaceable";

type GridCoords = readonly (readonly [number, number])[];

export type BoardCoords = string;

export type BoardStack = {
  coords: BoardCoords;
  tokens: TokenType[];
  topColor: ColorType | null;
};

type BoardCube = {
  id: string;
  type: "animal" | "spirit";
};

export type PersonalBoardView = {
  hasHex: (coords: BoardCoords) => boolean;
  hexAt: (coords: BoardCoords) => HexState | null;
  stackAt: (coords: BoardCoords) => TokenType[];
  cubeAt: (coords: BoardCoords) => BoardCube | null;
  adjacentCoords: (coords: BoardCoords) => BoardCoords[];
  stacks: () => BoardStack[];
};

type CreatePersonalBoardViewInput = {
  privateGameState: ImmutablePrivateGameState;
  playerId: string;
  grid: Grid<Hex> | GridCoords;
};

type PersonalBoardResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

type PlaceTokenOnPersonalBoardInput = {
  privateGameState: ImmutablePrivateGameState;
  playerId: string;
  grid: Grid<Hex> | GridCoords;
  tokenId: string;
  coords: BoardCoords;
};

type PlaceCubeOnPersonalBoardInput = {
  privateGameState: ImmutablePrivateGameState;
  grid: Grid<Hex> | GridCoords;
  cubeId: string;
  coords: BoardCoords;
};

export function createPersonalBoardView({
  privateGameState,
  playerId,
  grid,
}: CreatePersonalBoardViewInput): PersonalBoardView {
  const coords = coordsFromGrid(grid);
  const validCoords = new Set(coords.map(([q, r]) => coordsToString({ q, r })));
  const stackByCoords = buildStackByCoords(privateGameState, playerId);
  const cubeByCoords = buildCubeByCoords(privateGameState.animalCubes);

  return {
    hasHex: (coords) => validCoords.has(coords),
    hexAt: (coords) => {
      if (!validCoords.has(coords)) return null;
      const cube = cubeByCoords.get(coords) ?? null;
      return {
        tokens: stackByCoords.get(coords) ?? [],
        cube: cube?.type ?? null,
        cubeId: cube?.id ?? null,
      };
    },
    stackAt: (coords) => stackByCoords.get(coords) ?? [],
    cubeAt: (coords) => cubeByCoords.get(coords) ?? null,
    adjacentCoords: (coords) => adjacentCoords(grid, coords),
    stacks: () =>
      coords.map(([q, r]) => {
        const coords = coordsToString({ q, r });
        const tokens = stackByCoords.get(coords) ?? [];
        return {
          coords,
          tokens,
          topColor: tokens.at(-1)?.color ?? null,
        };
      }),
  };
}

export function createPublicPersonalBoardView({
  board,
  grid,
}: {
  board: PlayerGameState["board"];
  grid: Grid<Hex> | GridCoords;
}): PersonalBoardView {
  const coords = coordsFromGrid(grid);
  const validCoords = new Set(coords.map(([q, r]) => coordsToString({ q, r })));

  return {
    hasHex: (coords) => validCoords.has(coords),
    hexAt: (coords) => {
      if (!validCoords.has(coords)) return null;
      return board[coords] ?? { tokens: [], cube: null, cubeId: null };
    },
    stackAt: (coords) => board[coords]?.tokens ?? [],
    cubeAt: (coords) => {
      const hex = board[coords];
      if (!hex?.cube || !hex.cubeId) return null;
      return {
        id: hex.cubeId,
        type: hex.cube,
      };
    },
    adjacentCoords: (coords) => adjacentCoords(grid, coords),
    stacks: () =>
      coords.map(([q, r]) => {
        const coords = coordsToString({ q, r });
        const tokens = board[coords]?.tokens ?? [];
        return {
          coords,
          tokens,
          topColor: tokens.at(-1)?.color ?? null,
        };
      }),
  };
}

export function placeTokenOnPersonalBoard({
  privateGameState,
  playerId,
  grid,
  tokenId,
  coords,
}: PlaceTokenOnPersonalBoardInput): PersonalBoardResult<ImmutablePrivateGameState> {
  const tokenToPlace = privateGameState.tokens.find(
    (token) => token.id === tokenId,
  );

  if (!tokenToPlace) {
    return { ok: false, message: "No token found" };
  }

  if (tokenToPlace.type !== "taken" || tokenToPlace.position.player !== playerId) {
    return { ok: false, message: "Invalid token" };
  }

  const board = createPersonalBoardView({
    privateGameState,
    playerId,
    grid,
  });

  if (!board.hasHex(coords)) {
    return { ok: false, message: "Invalid board location" };
  }

  if (board.cubeAt(coords)) {
    return { ok: false, message: "Cannot place token on a hex with a cube" };
  }

  const stack = board.stackAt(coords);

  if (stack.length >= 3) {
    return { ok: false, message: "Stack cannot exceed 3 tokens" };
  }

  if (!tokenPlacable(tokenToPlace, stack)) {
    return { ok: false, message: "Cannot place token" };
  }

  const tokens: PrivateGameState["tokens"] = privateGameState.tokens.map(
    (token) => {
      if (token.id !== tokenId) return token;

      return {
        ...tokenToPlace,
        type: "personalBoard",
        position: {
          player: playerId,
          hex: {
            coords,
            stackPosition: stack.length,
          },
        },
      };
    },
  );

  return {
    ok: true,
    value: {
      ...privateGameState,
      tokens,
    },
  };
}

export function placeCubeOnPersonalBoard({
  privateGameState,
  grid,
  cubeId,
  coords,
}: PlaceCubeOnPersonalBoardInput): PersonalBoardResult<ImmutablePrivateGameState> {
  const cubeToPlace = privateGameState.animalCubes.find(
    (cube) => cube.id === cubeId,
  );

  if (!cubeToPlace) {
    return { ok: false, message: "No cube found" };
  }

  if (cubeToPlace.type !== "card") {
    return { ok: false, message: "Invalid cube" };
  }

  const board = createPersonalBoardView({
    privateGameState,
    playerId: "",
    grid,
  });

  if (!board.hasHex(coords)) {
    return { ok: false, message: "Invalid hex coordinates" };
  }

  if (board.cubeAt(coords)) {
    return { ok: false, message: "This hex already has a cube" };
  }

  const animalCubes: PrivateGameState["animalCubes"] =
    privateGameState.animalCubes.map((cube) => {
      if (cube.id !== cubeId) return cube;

      return {
        id: cube.id,
        type: "personalBoard",
        position: { coords },
      };
    });

  return {
    ok: true,
    value: {
      ...privateGameState,
      animalCubes,
    },
  };
}

export function coordsToString({ q, r }: { q: number; r: number }): BoardCoords {
  return `(${q},${r})`;
}

function coordsFromString(coords: BoardCoords): { q: number; r: number } | null {
  const match = /^\((-?\d+),(-?\d+)\)$/.exec(coords);
  if (!match) return null;
  return { q: Number(match[1]), r: Number(match[2]) };
}

function coordsFromGrid(grid: Grid<Hex> | GridCoords): [number, number][] {
  if (isGridCoords(grid)) {
    return grid.map(([q, r]) => [q, r]);
  }
  return grid.toArray().map((hex) => [hex.q, hex.r]);
}

function buildStackByCoords(
  privateGameState: ImmutablePrivateGameState,
  playerId: string,
): Map<BoardCoords, TokenType[]> {
  const sparseStacks = new Map<BoardCoords, TokenType[]>();

  for (const token of privateGameState.tokens) {
    if (
      token.type !== "personalBoard" ||
      token.position.player !== playerId
    ) {
      continue;
    }

    const stack = sparseStacks.get(token.position.hex.coords) ?? [];
    stack[token.position.hex.stackPosition] = token;
    sparseStacks.set(token.position.hex.coords, stack);
  }

  return new Map(
    Array.from(sparseStacks, ([coords, stack]) => [
      coords,
      stack.filter((token): token is TokenType => token !== undefined),
    ]),
  );
}

function buildCubeByCoords(
  animalCubes: ImmutablePrivateGameState["animalCubes"],
): Map<BoardCoords, BoardCube> {
  const cubeByCoords = new Map<BoardCoords, BoardCube>();

  for (const cube of animalCubes) {
    if (cube.type !== "personalBoard") continue;
    cubeByCoords.set(cube.position.coords, {
      id: cube.id,
      type: "animal",
    });
  }

  return cubeByCoords;
}

function adjacentCoords(
  grid: Grid<Hex> | GridCoords,
  coords: BoardCoords,
): BoardCoords[] {
  if (isGridCoords(grid)) {
    return adjacentCoordsFromList(grid, coords);
  }

  const parsedCoords = coordsFromString(coords);
  if (!parsedCoords) return [];

  return grid
    .traverse(
      ring({ center: [parsedCoords.q, parsedCoords.r], radius: 1 }),
      { bail: false },
    )
    .toArray()
    .filter((hex) => hex.toString() !== coords)
    .map((hex) => hex.toString());
}

function isGridCoords(grid: Grid<Hex> | GridCoords): grid is GridCoords {
  return Array.isArray(grid);
}

function adjacentCoordsFromList(
  gridCoords: GridCoords,
  coords: BoardCoords,
): BoardCoords[] {
  const parsedCoords = coordsFromString(coords);
  if (!parsedCoords) return [];

  const validCoords = new Set(
    gridCoords.map(([q, r]) => coordsToString({ q, r })),
  );
  const q = parsedCoords.q;
  const r = parsedCoords.r;
  const candidates = [
    { q: q + 1, r },
    { q: q + 1, r: r - 1 },
    { q, r: r - 1 },
    { q: q - 1, r },
    { q: q - 1, r: r + 1 },
    { q, r: r + 1 },
  ];

  return candidates
    .map(coordsToString)
    .filter((coords) => validCoords.has(coords));
}
