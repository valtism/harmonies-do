import type {
  ActionType,
  CanPerformAction,
  GameState,
  History,
  ImmutablePrivateGameState,
  TokenType,
} from "../sharedTypes";
import { grids } from "../constants/grids";
import {
  refillCentralBoard,
  takeZoneTokens,
  zoneHasTokens,
} from "./centralBoard";
import {
  coordsToString,
  createPersonalBoardView,
  placeTokenOnPersonalBoard,
} from "./personalBoard";
import {
  canPlaceCube,
  getHighestIndexCubeOnCard,
  placeCube,
  replenishAnimalCardSpread,
  takeAnimalCard,
} from "./playerCards";
import { simulateEndBoardState } from "../util/simulateEndBoardState";

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

type ActiveGameState = Extract<GameState, { type: "active" }>;
type TurnAction = Exclude<
  ActionType,
  { type: "joinGame" } | { type: "startGame" }
>;
type TurnActionType = TurnAction["type"];

export type TurnActionContext = {
  action: TurnAction;
  playerId: string;
  gameState: GameState;
  randomHeight: () => number;
  shuffleTokens: (tokens: TokenType[]) => TokenType[];
};

type TurnActionHandlers = {
  [K in TurnActionType]: {
    validate: (context: TurnActionContext) => CanPerformAction;
    apply: (context: TurnActionContext) => ActiveGameState;
    canUndo?: boolean;
  };
};

type ApplyTurnActionResult =
  | { ok: true; gameState: GameState }
  | { ok: false; message: string };

export function applyTurnAction(
  context: TurnActionContext,
): ApplyTurnActionResult {
  const handler = turnActionHandlers[context.action.type];
  const validation = handler.validate(context);
  if (!validation.ok) {
    return validation;
  }

  const nextGameState = handler.apply(context);
  return {
    ok: true,
    gameState: shouldPushHistory(context.action.type)
      ? pushHistory({
          gameState: nextGameState,
          previousPrivateGameState: activeGameState(context).privateGameState,
          action: context.action,
          canUndo: handler.canUndo ?? true,
        })
      : nextGameState,
  };
}

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

const turnActionHandlers: TurnActionHandlers = {
  takeTokens: {
    validate: validateTakeTokens,
    apply: applyTakeTokens,
  },
  placeToken: {
    validate: validatePlaceToken,
    apply: applyPlaceToken,
  },
  takeAnimalCard: {
    validate: validateTakeAnimalCard,
    apply: applyTakeAnimalCard,
  },
  placeCube: {
    validate: validatePlaceCube,
    apply: applyPlaceCube,
  },
  endTurn: {
    validate: validateEndTurn,
    apply: applyEndTurn,
    canUndo: false,
  },
  undo: {
    validate: validateUndo,
    apply: applyUndo,
  },
  simulateEndBoardState: {
    validate: validateActiveGame,
    apply: applySimulateEndBoardState,
  },
  resetGame: {
    validate: validateActiveGame,
    apply: applyResetGame,
  },
};

function validateActiveGame(
  context: TurnActionContext,
): CanPerformAction {
  if (context.gameState.type !== "active") {
    return { ok: false, message: "Game is not active" };
  }
  return { ok: true };
}

function validateCurrentPlayer(
  context: TurnActionContext,
): CanPerformAction {
  const active = validateActiveGame(context);
  if (!active.ok) return active;

  if (
    activeGameState(context).privateGameState.currentPlayerId !==
    context.playerId
  ) {
    return { ok: false, message: "Not your turn" };
  }

  return { ok: true };
}

function activeGameState(context: TurnActionContext): ActiveGameState {
  if (context.gameState.type !== "active") {
    throw new Error("Game is not active");
  }
  return context.gameState;
}

function actionOf<T extends TurnActionType>(
  context: TurnActionContext,
  type: T,
): Extract<TurnAction, { type: T }> {
  if (context.action.type !== type) {
    throw new Error(`Expected ${type} action`);
  }
  return context.action as Extract<TurnAction, { type: T }>;
}

function validateTakeTokens(
  context: TurnActionContext,
): CanPerformAction {
  const currentPlayer = validateCurrentPlayer(context);
  if (!currentPlayer.ok) return currentPlayer;

  const gameState = activeGameState(context);
  const { privateGameState } = gameState;
  const turn = createTurnState({
    history: gameState.history,
    privateGameState,
    playerId: context.playerId,
  });

  if (turn.hasTakenTokens) {
    return { ok: false, message: "Already taken tokens" };
  }

  const action = actionOf(context, "takeTokens");
  if (!zoneHasTokens(privateGameState, action.payload)) {
    return { ok: false, message: "No tokens in that zone" };
  }

  return { ok: true };
}

function applyTakeTokens(
  context: TurnActionContext,
): ActiveGameState {
  const gameState = activeGameState(context);
  return {
    ...gameState,
    privateGameState: takeZoneTokens({
      privateGameState: gameState.privateGameState,
      playerId: context.playerId,
      zone: actionOf(context, "takeTokens").payload,
    }),
  };
}

function validatePlaceToken(
  context: TurnActionContext,
): CanPerformAction {
  const currentPlayer = validateCurrentPlayer(context);
  if (!currentPlayer.ok) return currentPlayer;

  const gameState = activeGameState(context);
  const { tokenId, coords } = actionOf(context, "placeToken").payload;
  const hasTakenTokens = gameState.privateGameState.tokens.some(
    (token) =>
      token.type === "taken" && token.position.player === context.playerId,
  );

  if (!hasTakenTokens) {
    return { ok: false, message: "No taken tokens" };
  }

  const result = placeTokenOnPersonalBoard({
    privateGameState: gameState.privateGameState,
    playerId: context.playerId,
    grid: gameState.grid,
    tokenId,
    coords,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return { ok: true };
}

function applyPlaceToken(
  context: TurnActionContext,
): ActiveGameState {
  const gameState = activeGameState(context);
  const result = placeTokenOnPersonalBoard({
    privateGameState: gameState.privateGameState,
    playerId: context.playerId,
    grid: gameState.grid,
    tokenId: actionOf(context, "placeToken").payload.tokenId,
    coords: actionOf(context, "placeToken").payload.coords,
  });

  if (!result.ok) {
    return gameState;
  }

  return { ...gameState, privateGameState: result.value };
}

function validateTakeAnimalCard(
  context: TurnActionContext,
): CanPerformAction {
  const currentPlayer = validateCurrentPlayer(context);
  if (!currentPlayer.ok) return currentPlayer;

  const gameState = activeGameState(context);
  const { privateGameState } = gameState;
  const result = takeAnimalCard({
    privateGameState,
    playerId: context.playerId,
    spreadIndex: actionOf(context, "takeAnimalCard").payload.index,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const turn = createTurnState({
    history: gameState.history,
    privateGameState,
    playerId: context.playerId,
  });

  if (turn.hasTakenAnimalCard) {
    return {
      ok: false,
      message: "Already taken an animal card this turn",
    };
  }

  return { ok: true };
}

function applyTakeAnimalCard(
  context: TurnActionContext,
): ActiveGameState {
  const gameState = activeGameState(context);
  const result = takeAnimalCard({
    privateGameState: gameState.privateGameState,
    playerId: context.playerId,
    spreadIndex: actionOf(context, "takeAnimalCard").payload.index,
  });

  if (!result.ok) {
    return gameState;
  }

  return {
    ...gameState,
    privateGameState: {
      ...gameState.privateGameState,
      animalCards: result.value.animalCards,
      animalCubes: result.value.animalCubes,
    },
  };
}

function validatePlaceCube(
  context: TurnActionContext,
): CanPerformAction {
  const currentPlayer = validateCurrentPlayer(context);
  if (!currentPlayer.ok) return currentPlayer;

  const gameState = activeGameState(context);
  const { privateGameState, grid } = gameState;
  const { animalCardId, hex } = actionOf(context, "placeCube").payload;
  const animalCard = privateGameState.animalCards.find(
    (card) => card.id === animalCardId,
  );

  if (
    !animalCard ||
    animalCard.type !== "held" ||
    animalCard.position.playerId !== context.playerId
  ) {
    return { ok: false, message: "Animal card not found on your board" };
  }

  const cubesOnCard = privateGameState.animalCubes.filter(
    (cube) => cube.type === "card" && cube.position.cardId === animalCardId,
  );

  if (cubesOnCard.length === 0) {
    return { ok: false, message: "No cubes remaining on this animal card" };
  }

  const coords = coordsToString(hex);
  const board = createPersonalBoardView({
    privateGameState,
    playerId: context.playerId,
    grid,
  });

  if (!board.hasHex(coords)) {
    return { ok: false, message: "Invalid hex coordinates" };
  }

  if (board.cubeAt(coords)) {
    return { ok: false, message: "This hex already has a cube" };
  }

  if (!canPlaceCube({ animalCard, grid, hex, personalBoard: board })) {
    return { ok: false, message: "Animal pattern does not match the board" };
  }

  return { ok: true };
}

function applyPlaceCube(
  context: TurnActionContext,
): ActiveGameState {
  const gameState = activeGameState(context);
  const { animalCardId, hex } = actionOf(context, "placeCube").payload;
  const cubeToPlace = getHighestIndexCubeOnCard(
    gameState.privateGameState.animalCubes,
    animalCardId,
  );

  if (!cubeToPlace) {
    return gameState;
  }

  const result = placeCube({
    privateGameState: gameState.privateGameState,
    animalCardId,
    cubeId: cubeToPlace.id,
    coords: coordsToString(hex),
  });

  if (!result.ok) {
    return gameState;
  }

  return { ...gameState, privateGameState: result.value };
}

function validateEndTurn(
  context: TurnActionContext,
): CanPerformAction {
  const currentPlayer = validateCurrentPlayer(context);
  if (!currentPlayer.ok) return currentPlayer;

  const gameState = activeGameState(context);
  const turn = createTurnState({
    history: gameState.history,
    privateGameState: gameState.privateGameState,
    playerId: context.playerId,
  });

  if (!turn.canEndTurn) {
    return { ok: false, message: "Unfinished turn" };
  }

  return { ok: true };
}

function applyEndTurn(
  context: TurnActionContext,
): ActiveGameState {
  const gameState = activeGameState(context);
  const { privateGameState } = gameState;
  const index = privateGameState.playerIdList.indexOf(context.playerId);
  const nextPlayerId =
    privateGameState.playerIdList[
      (index + 1) % privateGameState.playerIdList.length
    ];

  const refill = refillCentralBoard(privateGameState);
  const animalCards = replenishAnimalCardSpread(privateGameState.animalCards);

  return {
    ...gameState,
    privateGameState: {
      ...refill.privateGameState,
      animalCards,
      currentPlayerId: nextPlayerId,
    },
  };
}

function validateUndo(
  context: TurnActionContext,
): CanPerformAction {
  const active = validateActiveGame(context);
  if (!active.ok) return active;

  const gameState = activeGameState(context);
  const turn = createTurnState({
    history: gameState.history,
    privateGameState: gameState.privateGameState,
    playerId: context.playerId,
  });

  if (gameState.history.length === 0) {
    return { ok: false, message: "No actions to undo" };
  }

  if (!turn.canUndo) {
    return { ok: false, message: "Cannot undo this action" };
  }

  return { ok: true };
}

function applyUndo(
  context: TurnActionContext,
): ActiveGameState {
  const gameState = activeGameState(context);
  const history = [...gameState.history];
  const lastEntry = history.pop();

  if (!lastEntry) {
    return gameState;
  }

  return {
    ...gameState,
    privateGameState: lastEntry.gameState,
    history,
  };
}

function applySimulateEndBoardState(
  context: TurnActionContext,
): ActiveGameState {
  const gameState = activeGameState(context);
  const { privateGameState } = gameState;
  return {
    ...gameState,
    privateGameState: simulateEndBoardState({
      privateGameState,
      playerId: context.playerId,
      gridCoords: grids[privateGameState.personalBoardSide],
      randomHeight: context.randomHeight,
      shuffleTokens: context.shuffleTokens,
    }),
  };
}

function applyResetGame(
  context: TurnActionContext,
): ActiveGameState {
  const gameState = activeGameState(context);
  return {
    ...gameState,
    privateGameState:
      gameState.history[0]?.gameState ?? gameState.privateGameState,
    history: [],
  };
}

function shouldPushHistory(actionType: TurnActionType): boolean {
  return actionType !== "undo" && actionType !== "resetGame";
}

function pushHistory({
  gameState,
  previousPrivateGameState,
  action,
  canUndo,
}: {
  gameState: ActiveGameState;
  previousPrivateGameState: ImmutablePrivateGameState;
  action: TurnAction;
  canUndo: boolean;
}): ActiveGameState {
  const historyEntry: History = {
    action: { ...action, canUndo },
    gameState: previousPrivateGameState,
  };

  return {
    ...gameState,
    history: [...gameState.history, historyEntry],
  };
}
