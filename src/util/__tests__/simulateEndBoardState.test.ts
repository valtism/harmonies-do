import { describe, expect, test } from "bun:test";
import type { ImmutablePrivateGameState, TokenType } from "../../sharedTypes";
import { simulateEndBoardState } from "../simulateEndBoardState";

function supplyToken(id: string, color: TokenType["color"]): TokenType {
  return {
    id,
    color,
    type: "supply",
  };
}

function placementKeys(tokens: TokenType[]): string[] {
  return tokens
    .filter((token) => token.type === "personalBoard")
    .map(
      (token) =>
        `${token.position.player}:${token.position.hex.coords}:${token.position.hex.stackPosition}`,
    );
}

describe("simulateEndBoardState", () => {
  test("does not assign duplicate stack positions when run repeatedly", () => {
    const initialState: ImmutablePrivateGameState = {
      personalBoardSide: "A",
      playerIdList: ["player-1"],
      currentPlayerId: "player-1",
      animalCards: [],
      animalCubes: [],
      tokens: [
        supplyToken("blue-token", "blue"),
        supplyToken("brown-token", "brown"),
        supplyToken("green-token", "green"),
      ],
    };

    const firstState = simulateEndBoardState({
      privateGameState: initialState,
      playerId: "player-1",
      gridCoords: [[0, 0]],
      randomHeight: () => 1,
      shuffleTokens: (tokens) => tokens,
    });

    const secondState = simulateEndBoardState({
      privateGameState: firstState,
      playerId: "player-1",
      gridCoords: [[0, 0]],
      randomHeight: () => 2,
      shuffleTokens: (tokens) => tokens,
    });

    const keys = placementKeys([...secondState.tokens]);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
