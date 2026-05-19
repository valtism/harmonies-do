import type {
  ActionType,
  History,
  ImmutablePrivateGameState,
} from "../sharedTypes";

type CreateTurnStateInput = {
  history: readonly History[];
  privateGameState: ImmutablePrivateGameState;
  playerId: string;
};

export type TurnState = {
  isCurrentPlayer: boolean;
  hasTakenTokens: boolean;
  hasTakenAnimalCard: boolean;
  hasPlacedAllTakenTokens: boolean;
  canEndTurn: boolean;
  canUndo: boolean;
};

export function createTurnState({
  history,
  privateGameState,
  playerId,
}: CreateTurnStateInput): TurnState {
  const currentTurn = currentTurnHistory(history);
  const hasTakenTokens = hasAction(currentTurn, "takeTokens");
  const hasTakenAnimalCard = hasAction(currentTurn, "takeAnimalCard");
  const hasPlacedAllTakenTokens = privateGameState.tokens.every(
    (token) => !(token.type === "taken" && token.position.player === playerId),
  );

  return {
    isCurrentPlayer: privateGameState.currentPlayerId === playerId,
    hasTakenTokens,
    hasTakenAnimalCard,
    hasPlacedAllTakenTokens,
    canEndTurn: hasTakenTokens && hasPlacedAllTakenTokens,
    canUndo: history.at(-1)?.action.canUndo ?? false,
  };
}

function currentTurnHistory(history: readonly History[]): readonly History[] {
  const entries: History[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.action.type === "endTurn") break;
    entries.push(entry);
  }

  return entries;
}

function hasAction(
  history: readonly History[],
  actionType: ActionType["type"],
): boolean {
  return history.some((entry) => entry.action.type === actionType);
}
