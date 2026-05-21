import { describe, expect, test } from "bun:test";
import { defineHex, Grid, Orientation } from "honeycomb-grid";
import type {
  AnimalCardType,
  AnimalCubeType,
  ImmutablePrivateGameState,
  TokenType,
  User,
} from "../../sharedTypes";
import {
  derivePublicActiveState,
  derivePublicGameState,
  derivePublicIdleState,
} from "../publicGameState";

const gridCoords: [number, number][] = [
  [0, 0],
  [1, 0],
];

const Hex = defineHex({
  dimensions: 1,
  orientation: Orientation.FLAT,
  origin: "topLeft",
});
const grid = new Grid(Hex, gridCoords);

function token(token: TokenType): TokenType {
  return token;
}

function animalCard(card: AnimalCardType): AnimalCardType {
  return card;
}

function cube(cube: AnimalCubeType): AnimalCubeType {
  return cube;
}

function privateGameState(
  overrides: Partial<ImmutablePrivateGameState> = {},
): ImmutablePrivateGameState {
  return {
    personalBoardSide: "A",
    playerIdList: ["player-1"],
    currentPlayerId: "player-1",
    tokens: [],
    animalCards: [],
    animalCubes: [],
    ...overrides,
  };
}

function players(): Map<string, User> {
  return new Map([["player-1", { id: "player-1", name: "Ada" }]]);
}

describe("publicGameState", () => {
  test("derives idle public state from player metadata", () => {
    expect(derivePublicIdleState(players())).toEqual({
      type: "idle",
      players: {
        "player-1": { id: "player-1", name: "Ada" },
      },
    });
  });

  test("projects Central Board, Taken Tokens, Personal Board, and cards", () => {
    const state = privateGameState({
      tokens: [
        token({
          id: "central-token",
          color: "blue",
          type: "centralBoard",
          position: { zone: 2, index: 1 },
        }),
        token({
          id: "taken-token",
          color: "green",
          type: "taken",
          position: { player: "player-1", slot: 0 },
        }),
        token({
          id: "board-token",
          color: "green",
          type: "personalBoard",
          position: {
            player: "player-1",
            hex: { coords: "(0,0)", stackPosition: 0 },
          },
        }),
      ],
      animalCards: [
        animalCard({
          id: "frog",
          scores: [2],
          pattern: [
            { coordinates: { q: 0, r: 0 }, topColor: "green", stackHeight: 1 },
          ],
          type: "held",
          position: { playerId: "player-1", index: 0 },
        }),
        animalCard({
          id: "duck",
          scores: [3],
          pattern: [],
          type: "spread",
          position: { index: 1 },
        }),
        animalCard({
          id: "bear",
          scores: [5],
          pattern: [],
          type: "completed",
          position: { playerId: "player-1" },
        }),
      ],
      animalCubes: [
        cube({
          id: "card-cube",
          type: "card",
          position: { cardId: "frog", index: 0 },
        }),
        cube({
          id: "board-cube",
          type: "personalBoard",
          position: { coords: "(1,0)" },
        }),
      ],
    });

    const publicGameState = derivePublicGameState({
      privateGameState: state,
      players: players(),
      grid,
      gridCoords,
    });

    expect(publicGameState.centralBoard[2][1]?.id).toBe("central-token");
    expect(publicGameState.animalCardSpread[1]?.id).toBe("duck");
    expect(publicGameState.players["player-1"].takenTokens[0]?.id).toBe(
      "taken-token",
    );
    expect(
      publicGameState.players["player-1"].board["(0,0)"].tokens[0]?.id,
    ).toBe("board-token");
    expect(publicGameState.players["player-1"].board["(1,0)"]).toMatchObject({
      cube: "animal",
      cubeId: "board-cube",
    });
    expect(publicGameState.players["player-1"].playerCards[0]?.scores).toEqual([
      { points: 2, cubeId: "card-cube" },
    ]);
    expect(publicGameState.players["player-1"].completedAnimalCards[0]?.id).toBe(
      "bear",
    );
    expect(publicGameState.players["player-1"].score?.animals).toBe(5);
  });

  test("derives active public state without leaking private game state", () => {
    const publicState = derivePublicActiveState({
      privateGameState: privateGameState(),
      players: players(),
      grid,
      gridCoords,
    });

    expect(publicState.type).toBe("active");
    if (publicState.type !== "active") return;
    expect("TODO_REMOVE_privateGameState" in publicState.gameState).toBe(false);
  });
});
