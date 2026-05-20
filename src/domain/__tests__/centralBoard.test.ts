import { describe, expect, test } from "bun:test";
import type { ImmutablePrivateGameState, TokenType } from "../../sharedTypes";
import {
  refillCentralBoard,
  takeZoneTokens,
  TOKENS_PER_ZONE,
  zoneHasTokens,
} from "../centralBoard";

function token(
  id: string,
  type: TokenType["type"],
  position?: Extract<TokenType, { type: "centralBoard" }>["position"],
): TokenType {
  if (type === "centralBoard") {
    return {
      id,
      color: "blue",
      type,
      position: position ?? { zone: 0, index: 0 },
    };
  }

  if (type === "supply") {
    return {
      id,
      color: "blue",
      type,
    };
  }

  throw new Error(`Unsupported token type in test: ${type}`);
}

function gameState(tokens: TokenType[]): ImmutablePrivateGameState {
  return {
    personalBoardSide: "A",
    playerIdList: ["player-1"],
    currentPlayerId: "player-1",
    animalCards: [],
    animalCubes: [],
    tokens,
  };
}

describe("centralBoard", () => {
  test("detects whether a Zone contains Tokens", () => {
    const state = gameState([
      token("token-1", "centralBoard", { zone: 2, index: 0 }),
    ]);

    expect(zoneHasTokens(state, 2)).toBe(true);
    expect(zoneHasTokens(state, 1)).toBe(false);
  });

  test("moves all Tokens from a Zone into Taken Tokens Slots", () => {
    const state = gameState([
      token("token-1", "centralBoard", { zone: 1, index: 0 }),
      token("token-2", "centralBoard", { zone: 1, index: 1 }),
      token("token-3", "centralBoard", { zone: 1, index: 2 }),
      token("token-4", "centralBoard", { zone: 2, index: 0 }),
    ]);

    const nextState = takeZoneTokens({
      privateGameState: state,
      playerId: "player-1",
      zone: 1,
    });

    const takenTokens = nextState.tokens.filter(
      (nextToken) => nextToken.type === "taken",
    );
    expect(takenTokens).toHaveLength(TOKENS_PER_ZONE);
    expect(
      takenTokens.map((nextToken) =>
        nextToken.type === "taken" ? nextToken.position.slot : null,
      ),
    ).toEqual([0, 1, 2]);
    expect(zoneHasTokens(nextState, 2)).toBe(true);
  });

  test("refills exactly one empty Zone from the Pouch", () => {
    const state = gameState([
      token("zone-1", "centralBoard", { zone: 1, index: 0 }),
      token("zone-2", "centralBoard", { zone: 2, index: 0 }),
      token("zone-3", "centralBoard", { zone: 3, index: 0 }),
      token("zone-4", "centralBoard", { zone: 4, index: 0 }),
      token("pouch-1", "supply"),
      token("pouch-2", "supply"),
      token("pouch-3", "supply"),
    ]);

    const result = refillCentralBoard(state);

    expect(result.endGameTriggered).toBe(false);
    expect(
      result.privateGameState.tokens
        .filter(
          (nextToken) =>
            nextToken.type === "centralBoard" && nextToken.position.zone === 0,
        )
        .map((nextToken) =>
          nextToken.type === "centralBoard" ? nextToken.position.index : null,
        ),
    ).toEqual([0, 1, 2]);
  });

  test("partially refills the empty Zone and triggers End Game", () => {
    const state = gameState([
      token("zone-1", "centralBoard", { zone: 1, index: 0 }),
      token("zone-2", "centralBoard", { zone: 2, index: 0 }),
      token("zone-3", "centralBoard", { zone: 3, index: 0 }),
      token("zone-4", "centralBoard", { zone: 4, index: 0 }),
      token("pouch-1", "supply"),
      token("pouch-2", "supply"),
    ]);

    const result = refillCentralBoard(state);

    expect(result.endGameTriggered).toBe(true);
    expect(
      result.privateGameState.tokens.filter(
        (nextToken) =>
          nextToken.type === "centralBoard" && nextToken.position.zone === 0,
      ),
    ).toHaveLength(2);
  });

  test("throws when zero or multiple Zones are empty", () => {
    const fullState = gameState([
      token("zone-0", "centralBoard", { zone: 0, index: 0 }),
      token("zone-1", "centralBoard", { zone: 1, index: 0 }),
      token("zone-2", "centralBoard", { zone: 2, index: 0 }),
      token("zone-3", "centralBoard", { zone: 3, index: 0 }),
      token("zone-4", "centralBoard", { zone: 4, index: 0 }),
    ]);
    const multipleEmptyZonesState = gameState([
      token("zone-3", "centralBoard", { zone: 3, index: 0 }),
      token("zone-4", "centralBoard", { zone: 4, index: 0 }),
    ]);

    expect(() => refillCentralBoard(fullState)).toThrow(
      "Invalid central board state",
    );
    expect(() => refillCentralBoard(multipleEmptyZonesState)).toThrow(
      "Invalid central board state",
    );
  });
});
