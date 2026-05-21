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
  type PrivateGameState,
  type TokenType,
} from "../src/sharedTypes";
import { applyTurnAction } from "../src/domain/turn";
import {
  derivePublicActiveState,
  derivePublicIdleState,
} from "../src/domain/publicGameState";

export interface Env {
  HARMONIES: DurableObjectNamespace<HarmoniesGame>;
}

export type ActionContext<K extends ActionKeys> = {
  action: Extract<ActionType, { type: K }>;
  playerId: string;
  gameState: GameState;
};

type JoinGameAction = Extract<ActionType, { type: "joinGame" }>;
type StartGameAction = Extract<ActionType, { type: "startGame" }>;
type SetupAction = JoinGameAction | StartGameAction;

type SetupActionContext = {
  action: SetupAction;
  playerId: string;
  gameState: GameState;
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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.gameState = {
      players: new Map(),
      type: "idle",
      privateGameState: null,
      history: null,
      grid: null,
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

  applyAction(
    ws: WebSocket,
    action: ActionType,
    playerId: string,
  ) {
    if (action.type !== "joinGame" && action.type !== "startGame") {
      const result = applyTurnAction({
        action,
        playerId,
        gameState: this.gameState,
        randomHeight: weightedRandomHeight,
        shuffleTokens: shuffle,
      });

      if (!result.ok) {
        this.sendError(ws, result.message);
        return;
      }

      this.gameState = result.gameState;
      return;
    }

    if (action.type === "joinGame") {
      this.applySetupAction(ws, {
        action,
        playerId,
        gameState: this.gameState,
      });
      return;
    }

    this.applySetupAction(ws, {
      action,
      playerId,
      gameState: this.gameState,
    });
  }

  applySetupAction(
    ws: WebSocket,
    context: SetupActionContext,
  ) {
    this.beforeAction(context);

    const validation =
      context.action.type === "joinGame"
        ? this.validateJoinGame(context as ActionContext<"joinGame">)
        : this.validateStartGame(context as ActionContext<"startGame">);
    if (!validation.ok) {
      this.onReject(context, validation.message);
      this.sendError(ws, validation.message);
      return;
    }

    const nextState =
      context.action.type === "joinGame"
        ? this.applyJoinGame(context as ActionContext<"joinGame">)
        : this.applyStartGame(context as ActionContext<"startGame">);
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

    const privateGameState: PrivateGameState = {
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
