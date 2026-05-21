import { describe, expect, test } from "bun:test";
import type {
  ActionType,
  History,
  GameState,
  ImmutablePrivateGameState,
  TokenType,
} from "../../sharedTypes";
import { applyTurnAction, createTurnState } from "../turn";

function state(tokens: TokenType[] = []): ImmutablePrivateGameState {
  return {
    personalBoardSide: "A",
    playerIdList: ["player-1", "player-2"],
    currentPlayerId: "player-1",
    animalCards: [],
    animalCubes: [],
    tokens,
  };
}

function takenToken(player: string): TokenType {
  return {
    id: `${player}-token`,
    color: "blue",
    type: "taken",
    position: { player, slot: 0 },
  };
}

function historyEntry(action: ActionType, canUndo = true): History {
  return {
    action: {
      ...action,
      canUndo,
    },
    gameState: state(),
  };
}

describe("createTurnState", () => {
  test("reports current player and whether Taken Tokens are placed", () => {
    const turn = createTurnState({
      history: [
        historyEntry({
          type: "takeTokens",
          payload: 0,
        }),
      ],
      privateGameState: state([takenToken("player-1")]),
      playerId: "player-1",
    });

    expect(turn).toMatchObject({
      isCurrentPlayer: true,
      hasTakenTokens: true,
      hasPlacedAllTakenTokens: false,
      canEndTurn: false,
      canUndo: true,
    });
  });

  test("allows ending the Turn after Tokens were taken and placed", () => {
    const turn = createTurnState({
      history: [
        historyEntry({
          type: "takeTokens",
          payload: 0,
        }),
      ],
      privateGameState: state(),
      playerId: "player-1",
    });

    expect(turn.hasTakenTokens).toBe(true);
    expect(turn.hasPlacedAllTakenTokens).toBe(true);
    expect(turn.canEndTurn).toBe(true);
  });

  test("only scans actions from the current Turn", () => {
    const turn = createTurnState({
      history: [
        historyEntry({
          type: "takeAnimalCard",
          payload: { index: 0 },
        }),
        historyEntry({
          type: "endTurn",
        }),
      ],
      privateGameState: state(),
      playerId: "player-1",
    });

    expect(turn.hasTakenAnimalCard).toBe(false);
    expect(turn.hasTakenTokens).toBe(false);
  });

  test("uses the latest action to answer Undo availability", () => {
    const turn = createTurnState({
      history: [
        historyEntry({
          type: "takeTokens",
          payload: 0,
        }),
        historyEntry(
          {
            type: "endTurn",
          },
          false,
        ),
      ],
      privateGameState: state(),
      playerId: "player-1",
    });

    expect(turn.canUndo).toBe(false);
  });
});

describe("applyTurnAction", () => {
  test("records End Turn as not undoable", () => {
    const privateGameState = state([
      centralBoardToken("zone-1", 1),
      centralBoardToken("zone-2", 2),
      centralBoardToken("zone-3", 3),
      centralBoardToken("zone-4", 4),
      supplyToken("supply-1"),
      supplyToken("supply-2"),
      supplyToken("supply-3"),
    ]);
    const gameState: GameState = {
      type: "active",
      players: new Map(),
      privateGameState,
      history: [
        historyEntry({
          type: "takeTokens",
          payload: 0,
        }),
      ],
      grid: undefined as never,
    };

    const result = applyTurnAction({
      action: { type: "endTurn" },
      playerId: "player-1",
      gameState,
      randomHeight: () => 0,
      shuffleTokens: (tokens) => tokens,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.gameState.type === "active") {
      expect(result.gameState.history.at(-1)?.action).toMatchObject({
        type: "endTurn",
        canUndo: false,
      });
    }
  });
});

function centralBoardToken(id: string, zone: number): TokenType {
  return {
    id,
    color: "blue",
    type: "centralBoard",
    position: { zone, index: 0 },
  };
}

function supplyToken(id: string): TokenType {
  return {
    id,
    color: "blue",
    type: "supply",
  };
}
