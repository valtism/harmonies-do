import { DurableObject } from "cloudflare:workers";
import { defineHex, Grid, Orientation } from "honeycomb-grid";
import { allAnimalCards } from "../src/constants/animalCards";
import { grids } from "../src/constants/grids";
import { allTokens } from "../src/constants/tokens";
import {
  actionSchema,
  type ActionKeys,
  type ActionType,
  type AnimalCardType,
  type Broadcast,
  type CanPerformAction,
  type GameState,
  type History,
  type ImmutablePrivateGameState,
  type PrivateGameState,
  type TokenType,
} from "../src/sharedTypes";
import {
  coordsToString,
  createPersonalBoardView,
  placeTokenOnPersonalBoard,
} from "../src/domain/personalBoard";
import {
  canPlaceCube,
  getHighestIndexCubeOnCard,
  placeCube,
  replenishAnimalCardSpread,
  takeAnimalCard,
} from "../src/domain/playerCards";
import {
  refillCentralBoard,
  takeZoneTokens,
  zoneHasTokens,
} from "../src/domain/centralBoard";
import { createTurnState } from "../src/domain/turn";
import {
  derivePublicActiveState,
  derivePublicIdleState,
} from "../src/domain/publicGameState";
import { simulateEndBoardState } from "../src/util/simulateEndBoardState";

export interface Env {
  HARMONIES: DurableObjectNamespace<HarmoniesGame>;
}

export type ActionContext<K extends ActionKeys> = {
  action: Extract<ActionType, { type: K }>;
  playerId: string;
  gameState: GameState;
};

type ActionHandlers = {
  [K in ActionKeys]: {
    validate: (context: ActionContext<K>) => CanPerformAction;
    apply: (context: ActionContext<K>) => GameState;
  };
};

type StoredConnection = {
  id: string;
  playerId?: string;
};

// Worker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const durableObjectId = url.searchParams.get("durableObjectId");
    if (!durableObjectId) {
      return new Response("Missing durableObjectId parameter", {
        status: 400,
      });
    }

    if (url.pathname.endsWith("/websocket")) {
      // Expect to receive a WebSocket Upgrade request.
      // If there is one, accept the request and return a WebSocket Response.
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Worker expected Upgrade: websocket", {
          status: 426,
        });
      }

      if (request.method !== "GET") {
        return new Response("Worker expected GET method", {
          status: 400,
        });
      }

      // Since we are hard coding the Durable Object ID by providing the constant name 'foo',
      // all requests to this Worker will be sent to the same Durable Object instance.
      const id = env.HARMONIES.idFromName(durableObjectId);
      const stub = env.HARMONIES.get(id);

      return stub.fetch(request);
    }

    return new Response("Only WebSocket connections are supported.", {
      status: 400,
    });
  },
} satisfies ExportedHandler<Env>;

// Durable Object
export class Harmonies extends DurableObject {
  // Keeps track of all WebSocket connections
  sessions: Map<WebSocket, StoredConnection>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sessions = new Map();
  }

  async fetch(): Promise<Response> {
    // Creates two ends of a WebSocket connection.
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Calling `accept()` tells the runtime that this WebSocket is to begin terminating
    // request within the Durable Object. It has the effect of "accepting" the connection,
    // and allowing the WebSocket to send and receive messages.
    server.accept();

    // Generate a random UUID for the session.
    const id = crypto.randomUUID();
    // Add the WebSocket connection to the map of active sessions.
    this.sessions.set(server, { id });

    server.addEventListener("message", (event) => {
      this.handleWebSocketMessage(server, event.data);
    });

    // If the client closes the connection, the runtime will close the connection too.
    server.addEventListener("close", () => {
      this.handleConnectionClose(server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleWebSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const connection = this.sessions.get(ws)!;

    // Reply back with the same message to the connection
    ws.send(`[Durable Object] message: ${message}, from: ${connection.id}`);

    // Broadcast the message to all the connections,
    // except the one that sent the message.
    this.sessions.forEach((_, session) => {
      if (session !== ws) {
        session.send(
          `[Durable Object] message: ${message}, from: ${connection.id}`,
        );
      }
    });

    // Broadcast the message to all the connections,
    // including the one that sent the message.
    this.sessions.forEach((_, session) => {
      session.send(
        `[Durable Object] message: ${message}, from: ${connection.id}`,
      );
    });
  }

  async handleConnectionClose(ws: WebSocket) {
    this.sessions.delete(ws);
    ws.close(1000, "Durable Object is closing WebSocket");
  }
}

// Game-specific Durable Object - extends Harmonies with game logic
export class HarmoniesGame extends Harmonies {
  gameState: GameState;
  actionHandlers: ActionHandlers;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.gameState = {
      players: new Map(),
      type: "idle",
      privateGameState: null,
      history: null,
      grid: null,
    };

    this.actionHandlers = {
      joinGame: {
        validate: (context) => this.validateJoinGame(context),
        apply: (context) => this.applyJoinGame(context),
      },
      startGame: {
        validate: (context) => this.validateStartGame(context),
        apply: (context) => this.applyStartGame(context),
      },
      takeTokens: {
        validate: (context) => this.validateTakeTokens(context),
        apply: (context) => this.applyTakeTokens(context),
      },
      placeToken: {
        validate: (context) => this.validatePlaceToken(context),
        apply: (context) => this.applyPlaceToken(context),
      },
      placeCube: {
        validate: (context) => this.validatePlaceCube(context),
        apply: (context) => this.applyPlaceCube(context),
      },
      takeAnimalCard: {
        validate: (context) => this.validateTakeAnimalCard(context),
        apply: (context) => this.applyTakeAnimalCard(context),
      },
      endTurn: {
        validate: (context) => this.validateEndTurn(context),
        apply: (context) => this.applyEndTurn(context),
      },
      undo: {
        validate: (context) => this.validateUndo(context),
        apply: (context) => this.applyUndo(context),
      },
      simulateEndBoardState: {
        validate: (context) => this.validateSimulateEndBoardState(context),
        apply: (context) => this.applySimulateEndBoardState(context),
      },
      resetGame: {
        validate: (context) => this.validateResetGame(context),
        apply: (context) => this.applyResetGame(context),
      },
    };
  }

  // Override the message handler to add game logic
  async handleWebSocketMessage(ws: WebSocket, message: string) {
    try {
      const action = actionSchema.parse(JSON.parse(message));
      const connection = this.sessions.get(ws);
      assert(connection, "Connection not found");

      if (action.type === "joinGame") {
        connection.playerId = action.payload.id;
      }
      const playerId = connection.playerId;
      assert(playerId, "Missing player id for action");

      this.applyAction(ws, action, playerId);
    } catch (error) {
      console.error(error);
      // If parsing fails, fall back to parent behavior
      super.handleWebSocketMessage(ws, message);
    } finally {
      this.broadcastGameState();
    }
  }

  applyAction<K extends ActionKeys>(
    ws: WebSocket,
    action: Extract<ActionType, { type: K }>,
    playerId: string,
  ) {
    const handler = this.actionHandlers[action.type];

    if (!handler) {
      this.sendError(ws, "Unknown action type");
      return;
    }

    const context = {
      action,
      playerId,
      gameState: this.gameState,
    } as ActionContext<K>;

    this.beforeAction(context);

    const validation = handler.validate(context);
    if (!validation.ok) {
      // this.onReject(context, validation.message);
      this.sendError(ws, validation.message);
      return;
    }

    const nextState = handler.apply(context);
    this.gameState = nextState;
    this.afterAction(context, nextState);
  }

  beforeAction<K extends ActionKeys>(_context: ActionContext<K>) {}

  afterAction<K extends ActionKeys>(
    _context: ActionContext<K>,
    _nextState: GameState,
  ) {}

  onReject<K extends ActionKeys>(
    _context: ActionContext<K>,
    _message: string,
  ) {}

  sendError(ws: WebSocket, message: string) {
    const error: Broadcast = {
      type: "error",
      message,
    };
    ws.send(JSON.stringify(error));
  }

  validateJoinGame(_context: ActionContext<"joinGame">): CanPerformAction {
    return { ok: true };
  }

  applyJoinGame(context: ActionContext<"joinGame">): GameState {
    const players = new Map(context.gameState.players);
    players.set(context.action.payload.id, context.action.payload);

    return {
      ...context.gameState,
      players,
    };
  }

  validateStartGame(context: ActionContext<"startGame">): CanPerformAction {
    if (context.gameState.type !== "idle") {
      return {
        ok: false,
        message: "Game already started",
      };
    }

    if (context.gameState.players.size === 0) {
      return {
        ok: false,
        message: "No players found",
      };
    }

    return { ok: true };
  }

  applyStartGame(context: ActionContext<"startGame">): GameState {
    // TODO make personalBoardSide dynamic
    const personalBoardSide = "A";

    const Hex = defineHex({
      dimensions: 1,
      orientation: Orientation.FLAT,
      origin: "topLeft",
    });
    const grid = new Grid(Hex, grids[personalBoardSide]);

    const playerIdList = shuffle(Array.from(context.gameState.players.keys()));

    const tokens = shuffle([...allTokens]).map((color, index) => {
      if (index < 15) {
        const zone = Math.floor(index / 3);
        const indexInZone = index % 3;
        const token: TokenType = {
          id: `token-${crypto.randomUUID()}`,
          color,
          type: "centralBoard",
          position: { zone, index: indexInZone },
        };
        return token;
      } else {
        const token: TokenType = {
          id: `token-${crypto.randomUUID()}`,
          color,
          type: "supply",
        };
        return token;
      }
    });

    const animalCards: PrivateGameState["animalCards"] = shuffle(
      Object.values(allAnimalCards),
    ).map((animalCard, index) => {
      if (index < 5) {
        const card: AnimalCardType = {
          ...animalCard,
          type: "spread",
          position: { index: index },
        };
        return card;
      } else {
        const card: AnimalCardType = {
          ...animalCard,
          type: "deck",
        };
        return card;
      }
    });

    const animalCubes: PrivateGameState["animalCubes"] = Array.from({
      length: 66,
    }).map(() => ({
      id: `animal-cube-${crypto.randomUUID()}`,
      type: "supply",
    }));

    const currentPlayerId = playerIdList[0];
    if (!currentPlayerId) {
      throw new Error("No players found");
    }

    const privateGameState: ImmutablePrivateGameState = {
      personalBoardSide: personalBoardSide,
      playerIdList: playerIdList,
      currentPlayerId: currentPlayerId,
      tokens: tokens,
      animalCards: animalCards,
      animalCubes: animalCubes,
    };

    return {
      players: context.gameState.players,
      type: "active",
      grid,
      privateGameState,
      history: [],
    };
  }

  validateTakeTokens(context: ActionContext<"takeTokens">): CanPerformAction {
    if (context.gameState.type !== "active") {
      return {
        ok: false,
        message: "Game is not active",
      };
    }

    const { privateGameState } = context.gameState;

    if (privateGameState.currentPlayerId !== context.playerId) {
      return { ok: false, message: "Not your turn" };
    }

    const turn = createTurnState({
      history: context.gameState.history,
      privateGameState,
      playerId: context.playerId,
    });

    if (turn.hasTakenTokens) {
      return {
        ok: false,
        message: "Already taken tokens",
      };
    }

    const hasTokens = zoneHasTokens(privateGameState, context.action.payload);

    if (!hasTokens) {
      return {
        ok: false,
        message: "No tokens in that zone",
      };
    }

    return { ok: true };
  }

  applyTakeTokens(context: ActionContext<"takeTokens">): GameState {
    if (context.gameState.type !== "active") {
      return context.gameState;
    }

    const nextPrivateGameState = takeZoneTokens({
      privateGameState: context.gameState.privateGameState,
      playerId: context.playerId,
      zone: context.action.payload,
    });

    return this.pushHistory(
      context.gameState,
      context.action,
      nextPrivateGameState,
    );
  }

  validatePlaceToken(context: ActionContext<"placeToken">): CanPerformAction {
    if (context.gameState.type !== "active") {
      return {
        ok: false,
        message: "Game is not active",
      };
    }

    const { privateGameState, grid } = context.gameState;
    if (privateGameState.currentPlayerId !== context.playerId) {
      return { ok: false, message: "Not your turn" };
    }

    const { tokenId, coords } = context.action.payload;

    const hasTakenTokens = privateGameState.tokens.some(
      (token) =>
        token.type === "taken" && token.position.player === context.playerId,
    );

    if (!hasTakenTokens) {
      return { ok: false, message: "No taken tokens" };
    }

    const result = placeTokenOnPersonalBoard({
      privateGameState,
      playerId: context.playerId,
      grid,
      tokenId,
      coords,
    });

    if (!result.ok) {
      return { ok: false, message: result.message };
    }

    return { ok: true };
  }

  applyPlaceToken(context: ActionContext<"placeToken">) {
    if (context.gameState.type !== "active") {
      return context.gameState;
    }

    const result = placeTokenOnPersonalBoard({
      privateGameState: context.gameState.privateGameState,
      playerId: context.playerId,
      grid: context.gameState.grid,
      tokenId: context.action.payload.tokenId,
      coords: context.action.payload.coords,
    });

    if (!result.ok) {
      return context.gameState;
    }

    return this.pushHistory(
      context.gameState,
      context.action,
      result.value,
    );
  }

  validateTakeAnimalCard(
    context: ActionContext<"takeAnimalCard">,
  ): CanPerformAction {
    if (context.gameState.type !== "active") {
      return {
        ok: false,
        message: "Game is not active",
      };
    }

    const { privateGameState } = context.gameState;

    if (privateGameState.currentPlayerId !== context.playerId) {
      return { ok: false, message: "Not your turn" };
    }

    const takenIndexes = privateGameState.animalCards.reduce(
      (takenIndexes, card) => {
        if (
          card.type === "held" &&
          card.position.playerId === context.playerId
        ) {
          takenIndexes.push(card.position.index);
        }
        return takenIndexes;
      },
      [] as number[],
    );

    if (takenIndexes.length >= 4) {
      return { ok: false, message: "All animal card slots are full" };
    }

    const index = context.action.payload.index;
    if (index < 0 || index >= 5) {
      return { ok: false, message: "Invalid card index" };
    }

    const cardExists = privateGameState.animalCards.some(
      (card) => card.type === "spread" && card.position.index === index,
    );
    if (!cardExists) {
      return { ok: false, message: "No card at that index" };
    }

    const turn = createTurnState({
      history: context.gameState.history,
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

  applyTakeAnimalCard(context: ActionContext<"takeAnimalCard">) {
    if (context.gameState.type !== "active") {
      return context.gameState;
    }

    const result = takeAnimalCard({
      privateGameState: context.gameState.privateGameState,
      playerId: context.playerId,
      spreadIndex: context.action.payload.index,
    });

    if (!result.ok) {
      return context.gameState;
    }

    const nextPrivateGameState: ImmutablePrivateGameState = {
      ...context.gameState.privateGameState,
      animalCards: result.value.animalCards,
      animalCubes: result.value.animalCubes,
    };

    return this.pushHistory(
      context.gameState,
      context.action,
      nextPrivateGameState,
    );
  }

  validatePlaceCube(context: ActionContext<"placeCube">): CanPerformAction {
    if (context.gameState.type !== "active") {
      return { ok: false, message: "Game is not active" };
    }

    const { privateGameState, grid } = context.gameState;
    if (privateGameState.currentPlayerId !== context.playerId) {
      return { ok: false, message: "Not your turn" };
    }

    const { animalCardId, hex } = context.action.payload;
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

    // Check if there are cubes left on the card
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

  applyPlaceCube(context: ActionContext<"placeCube">): GameState {
    if (context.gameState.type !== "active") {
      return context.gameState;
    }

    const { animalCardId, hex } = context.action.payload;
    const { privateGameState } = context.gameState;

    const cubeToPlace = getHighestIndexCubeOnCard(
      privateGameState.animalCubes,
      animalCardId,
    );

    if (!cubeToPlace) {
      return context.gameState;
    }

    const result = placeCube({
      privateGameState,
      animalCardId,
      cubeId: cubeToPlace.id,
      coords: coordsToString(hex),
    });

    if (!result.ok) {
      return context.gameState;
    }

    return this.pushHistory(
      context.gameState,
      context.action,
      result.value,
    );
  }

  validateEndTurn(context: ActionContext<"endTurn">): CanPerformAction {
    if (context.gameState.type !== "active") {
      return { ok: false, message: "Game is not active" };
    }

    const { privateGameState } = context.gameState;

    if (privateGameState.currentPlayerId !== context.playerId) {
      return { ok: false, message: "Not your turn" };
    }

    const turn = createTurnState({
      history: context.gameState.history,
      privateGameState,
      playerId: context.playerId,
    });

    if (!turn.canEndTurn) {
      return { ok: false, message: "Unfinished turn" };
    }

    return { ok: true };
  }

  applyEndTurn(context: ActionContext<"endTurn">): GameState {
    if (context.gameState.type !== "active") {
      return context.gameState;
    }

    const { privateGameState } = context.gameState;

    // Change to next player
    const index = privateGameState.playerIdList.indexOf(context.playerId);
    const nextPlayerId =
      privateGameState.playerIdList[
        (index + 1) % privateGameState.playerIdList.length
      ];

    const refill = refillCentralBoard(privateGameState);

    const animalCards = replenishAnimalCardSpread(privateGameState.animalCards);

    const nextPrivateGameState: ImmutablePrivateGameState = {
      ...refill.privateGameState,
      animalCards,
      currentPlayerId: nextPlayerId,
    };

    return this.pushHistory(
      context.gameState,
      context.action,
      nextPrivateGameState,
    );
  }

  validateUndo(context: ActionContext<"undo">): CanPerformAction {
    if (context.gameState.type !== "active") {
      return {
        ok: false,
        message: "Game is not active",
      };
    }
    const turn = createTurnState({
      history: context.gameState.history,
      privateGameState: context.gameState.privateGameState,
      playerId: context.playerId,
    });

    if (context.gameState.history.length === 0) {
      return {
        ok: false,
        message: "No actions to undo",
      };
    }
    if (!turn.canUndo) {
      return {
        ok: false,
        message: "Cannot undo this action",
      };
    }
    return { ok: true };
  }

  applyUndo(context: ActionContext<"undo">): GameState {
    if (context.gameState.type !== "active") {
      return context.gameState;
    }

    const history = [...context.gameState.history];
    const lastEntry = history.pop();

    if (!lastEntry) {
      return context.gameState;
    }

    return {
      ...context.gameState,
      privateGameState: lastEntry.gameState,
      history,
    };
  }

  validateSimulateEndBoardState(
    context: ActionContext<"simulateEndBoardState">,
  ): CanPerformAction {
    if (context.gameState.type !== "active") {
      return { ok: false, message: "Game is not active" };
    }

    return { ok: true };
  }

  applySimulateEndBoardState(
    context: ActionContext<"simulateEndBoardState">,
  ): GameState {
    if (context.gameState.type !== "active") {
      return context.gameState;
    }

    const { privateGameState } = context.gameState;
    const nextPrivateGameState = simulateEndBoardState({
      privateGameState,
      playerId: context.playerId,
      gridCoords: grids[privateGameState.personalBoardSide],
      randomHeight: weightedRandomHeight,
      shuffleTokens: shuffle,
    });

    return this.pushHistory(
      context.gameState,
      context.action,
      nextPrivateGameState,
    );
  }

  validateResetGame(context: ActionContext<"resetGame">): CanPerformAction {
    if (context.gameState.type !== "active") {
      return { ok: false, message: "Game is not active" };
    }

    return { ok: true };
  }

  applyResetGame(context: ActionContext<"resetGame">): GameState {
    if (context.gameState.type !== "active") {
      return context.gameState;
    }

    return {
      ...context.gameState,
      privateGameState:
        context.gameState.history[0]?.gameState ??
        context.gameState.privateGameState,
      history: [],
    };
  }

  pushHistory(
    gameState: Extract<GameState, { type: "active" }>,
    action: ActionType,
    privateGameState: ImmutablePrivateGameState,
  ): GameState {
    const historyEntry: History = {
      action: { ...action, canUndo: true },
      gameState: gameState.privateGameState,
    };

    return {
      ...gameState,
      privateGameState,
      history: [...gameState.history, historyEntry],
    };
  }

  broadcastGameState() {
    const state: Broadcast = {
      type: "gameState",
      payload:
        this.gameState.type === "idle"
          ? derivePublicIdleState(this.gameState.players)
          : derivePublicActiveState({
              privateGameState: this.gameState.privateGameState,
              players: this.gameState.players,
              grid: this.gameState.grid,
              gridCoords: grids[this.gameState.privateGameState.personalBoardSide],
            }),
    };

    this.broadcast(state);
  }

  broadcast(broadcast: Broadcast) {
    this.sessions.forEach((_, session) => {
      session.send(JSON.stringify(broadcast));
    });
  }

  // Override connection close to handle player leaving
  async handleConnectionClose(ws: WebSocket) {
    const connection = this.sessions.get(ws);
    if (connection) {
      const playerId = connection.playerId ?? connection.id;
      this.gameState.players.delete(playerId);
      this.broadcastGameState();
    }

    // Call parent method to clean up the session
    super.handleConnectionClose(ws);
  }
}

function shuffle<T>(array: T[]) {
  return array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Returns a random stack height (0-3) with weighted distribution:
 * - 0: 10% chance (empty hex)
 * - 1: 30% chance
 * - 2: 35% chance
 * - 3: 25% chance
 * This creates varied board states for end-game testing
 */
function weightedRandomHeight(): number {
  const rand = Math.random();
  if (rand < 0.1) return 0;
  if (rand < 0.4) return 1;
  if (rand < 0.75) return 2;
  return 3;
}
