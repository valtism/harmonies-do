import { describe, expect, test } from "bun:test";
import { defineHex, Grid, Orientation } from "honeycomb-grid";
import type { ImmutablePrivateGameState, TokenType } from "../../sharedTypes";
import {
  coordsToString,
  createPersonalBoardView,
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
