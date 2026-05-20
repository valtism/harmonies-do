import { describe, expect, test } from "bun:test";
import type { ImmutablePrivateGameState, TokenType } from "../../sharedTypes";
import { createPersonalBoardView } from "../personalBoard";
import {
  calculateFinalScore,
  scoreBuildings,
  scoreFields,
  scoreIslands,
  scoreMountains,
  scoreRiver,
  scoreTrees,
} from "../finalScoring";

const grid = [
  [0, 0],
  [1, 0],
  [2, 0],
  [0, 1],
  [1, 1],
  [2, 1],
] as const;

function state(tokens: TokenType[]): ImmutablePrivateGameState {
  return {
    personalBoardSide: "A",
    playerIdList: ["player-1"],
    currentPlayerId: "player-1",
    animalCards: [],
    animalCubes: [],
    tokens,
  };
}

function token(
  id: string,
  color: TokenType["color"],
  coords: string,
  stackPosition = 0,
): TokenType {
  return {
    id,
    color,
    type: "personalBoard",
    position: {
      player: "player-1",
      hex: {
        coords,
        stackPosition,
      },
    },
  };
}

function board(
  tokens: TokenType[],
  boardGrid: readonly (readonly [number, number])[] = grid,
) {
  return createPersonalBoardView({
    privateGameState: state(tokens),
    playerId: "player-1",
    grid: boardGrid,
  });
}

describe("Final Scoring", () => {
  test("scores Trees by brown trunk height under a green top", () => {
    expect(
      scoreTrees(
        board([
          token("trunk-1", "brown", "(0,0)", 0),
          token("trunk-2", "brown", "(0,0)", 1),
          token("top", "green", "(0,0)", 2),
          token("green", "green", "(1,0)", 0),
        ]),
      ),
    ).toBe(8);
  });

  test("scores only Mountains adjacent to another Mountain", () => {
    expect(
      scoreMountains(
        board([
          token("mountain-1", "gray", "(0,0)"),
          token("mountain-2a", "gray", "(1,0)", 0),
          token("mountain-2b", "gray", "(1,0)", 1),
          token("lone-mountain", "gray", "(2,1)"),
        ]),
      ),
    ).toBe(4);
  });

  test("scores each Field group of two or more yellow top Tokens", () => {
    expect(
      scoreFields(
        board([
          token("field-1", "yellow", "(0,0)"),
          token("field-2", "yellow", "(1,0)"),
          token("field-3", "yellow", "(2,1)"),
        ]),
      ),
    ).toBe(5);
  });

  test("scores Buildings with three or more adjacent top-token colors", () => {
    expect(
      scoreBuildings(
        board([
          token("foundation", "brown", "(1,0)", 0),
          token("building", "red", "(1,0)", 1),
          token("adjacent-blue", "blue", "(0,0)"),
          token("adjacent-green", "green", "(2,0)"),
          token("adjacent-yellow", "yellow", "(1,1)"),
        ]),
      ),
    ).toBe(5);
  });

  test("scores Side A Water Feature as the longest River path", () => {
    expect(
      scoreRiver(
        board([
          token("river-1", "blue", "(0,0)"),
          token("river-2", "blue", "(1,0)"),
          token("river-3", "blue", "(2,0)"),
        ]),
      ),
    ).toBe(5);
  });

  test("scores Side B Water Feature as Islands", () => {
    expect(
      scoreIslands(
        board([
          token("land-1", "green", "(0,0)"),
          token("water-1", "blue", "(1,0)"),
          token("land-2", "green", "(2,0)"),
        ], [[0, 0], [1, 0], [2, 0]]),
      ),
    ).toBe(10);
  });

  test("calculates Final Scoring totals with animal points", () => {
    expect(
      calculateFinalScore({
        personalBoard: board([
          token("tree", "green", "(0,0)"),
          token("water-1", "blue", "(1,0)"),
          token("water-2", "blue", "(2,0)"),
        ]),
        side: "A",
        animalPoints: 9,
      }),
    ).toEqual({
      trees: 1,
      mountains: 0,
      fields: 0,
      buildings: 0,
      water: 2,
      animals: 9,
      total: 12,
    });
  });
});
