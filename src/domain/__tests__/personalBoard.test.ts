import { describe, expect, test } from "bun:test";
import { defineHex, Grid, Orientation } from "honeycomb-grid";
import type { ImmutablePrivateGameState, TokenType } from "../../sharedTypes";
import {
  coordsToString,
  createPersonalBoardView,
  placeCubeOnPersonalBoard,
  placeTokenOnPersonalBoard,
} from "../personalBoard";

function token(
  id: string,
  color: TokenType["color"],
  stackPosition: number,
): TokenType {
  return {
    id,
    color,
    type: "personalBoard",
    position: {
      player: "player-1",
      hex: {
        coords: "(0,0)",
        stackPosition,
      },
    },
  };
}

function takenToken(id: string, color: TokenType["color"]): TokenType {
  return {
    id,
    color,
    type: "taken",
    position: {
      player: "player-1",
      slot: 0,
    },
  };
}

function state(tokens: TokenType[] = []): ImmutablePrivateGameState {
  return {
    personalBoardSide: "A",
    playerIdList: ["player-1"],
    currentPlayerId: "player-1",
    animalCards: [],
    animalCubes: [
      {
        id: "cube-1",
        type: "personalBoard",
        position: { coords: "(1,0)" },
      },
    ],
    tokens,
  };
}

describe("createPersonalBoardView", () => {
  test("reconstructs stacks in stack-position order without leaking gaps", () => {
    const board = createPersonalBoardView({
      privateGameState: state([
        token("top-token", "green", 2),
        token("base-token", "brown", 0),
      ]),
      playerId: "player-1",
      grid: [[0, 0]],
    });

    expect(board.stackAt("(0,0)").map((token) => token.id)).toEqual([
      "base-token",
      "top-token",
    ]);
    expect(board.stacks()[0]).toMatchObject({
      coords: "(0,0)",
      topColor: "green",
    });
  });

  test("reports Hex state with Stack and Cube occupancy", () => {
    const board = createPersonalBoardView({
      privateGameState: state([token("base-token", "brown", 0)]),
      playerId: "player-1",
      grid: [
        [0, 0],
        [1, 0],
      ],
    });

    expect(board.hexAt("(0,0)")).toMatchObject({
      cube: null,
      cubeId: null,
      tokens: [{ id: "base-token" }],
    });
    expect(board.hexAt("(1,0)")).toMatchObject({
      cube: "animal",
      cubeId: "cube-1",
      tokens: [],
    });
    expect(board.cubeAt("(1,0)")).toEqual({
      id: "cube-1",
      type: "animal",
    });
  });

  test("knows whether coords belong to the Personal Board", () => {
    const board = createPersonalBoardView({
      privateGameState: state(),
      playerId: "player-1",
      grid: [[0, 0]],
    });

    expect(board.hasHex("(0,0)")).toBe(true);
    expect(board.hasHex("(2,0)")).toBe(false);
    expect(board.hexAt("(2,0)")).toBeNull();
  });

  test("uses honeycomb-grid adjacency when a Grid is provided", () => {
    const Hex = defineHex({
      dimensions: 1,
      orientation: Orientation.FLAT,
      origin: "topLeft",
    });
    const grid = new Grid(Hex, [
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    const board = createPersonalBoardView({
      privateGameState: state(),
      playerId: "player-1",
      grid,
    });

    expect(board.adjacentCoords(coordsToString({ q: 0, r: 0 })).sort()).toEqual(
      ["(0,1)", "(1,0)"],
    );
  });
});

describe("placeTokenOnPersonalBoard", () => {
  test("returns next state with the Token placed at the next Stack position", () => {
    const result = placeTokenOnPersonalBoard({
      privateGameState: state([
        token("base-token", "brown", 0),
        takenToken("green-token", "green"),
      ]),
      playerId: "player-1",
      grid: [[0, 0]],
      tokenId: "green-token",
      coords: "(0,0)",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const placedToken = result.value.tokens.find(
      (token) => token.id === "green-token",
    );
    expect(placedToken).toMatchObject({
      type: "personalBoard",
      position: {
        player: "player-1",
        hex: {
          coords: "(0,0)",
          stackPosition: 1,
        },
      },
    });
  });

  test("rejects placement onto a Hex with a Cube", () => {
    const result = placeTokenOnPersonalBoard({
      privateGameState: state([takenToken("blue-token", "blue")]),
      playerId: "player-1",
      grid: [
        [0, 0],
        [1, 0],
      ],
      tokenId: "blue-token",
      coords: "(1,0)",
    });

    expect(result).toEqual({
      ok: false,
      message: "Cannot place token on a hex with a cube",
    });
  });
});

describe("placeCubeOnPersonalBoard", () => {
  test("returns next state with the Cube placed on the Hex", () => {
    const result = placeCubeOnPersonalBoard({
      privateGameState: {
        ...state(),
        animalCubes: [
          {
            id: "cube-2",
            type: "card",
            position: {
              cardId: "alligator",
              index: 0,
            },
          },
        ],
      },
      grid: [[0, 0]],
      cubeId: "cube-2",
      coords: "(0,0)",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.animalCubes[0]).toEqual({
      id: "cube-2",
      type: "personalBoard",
      position: { coords: "(0,0)" },
    });
  });

  test("rejects placement onto a Hex that already has a Cube", () => {
    const result = placeCubeOnPersonalBoard({
      privateGameState: {
        ...state(),
        animalCubes: [
          {
            id: "cube-1",
            type: "personalBoard",
            position: { coords: "(0,0)" },
          },
          {
            id: "cube-2",
            type: "card",
            position: {
              cardId: "alligator",
              index: 0,
            },
          },
        ],
      },
      grid: [[0, 0]],
      cubeId: "cube-2",
      coords: "(0,0)",
    });

    expect(result).toEqual({
      ok: false,
      message: "This hex already has a cube",
    });
  });
});
