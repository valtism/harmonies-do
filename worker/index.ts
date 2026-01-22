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
  type DerivedPublicGameState,
  type GameState,
  type ImmutablePrivateGameState,
  type PrivateGameState,
  type TokenType,
} from "../src/sharedTypes";

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

type HistoryEntry = {
  action: ActionType & { canUndo: boolean };
  gameState: ImmutablePrivateGameState;
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
      takeAnimalCard: {
        validate: (context) => this.validateTakeAnimalCard(context),
        apply: (context) => this.applyTakeAnimalCard(context),
      },
      test: {
        validate: (context) => this.validateTest(context),
        apply: (context) => this.applyTest(context),
      },
      endTurn: {
        validate: (context) => this.validateEndTurn(context),
        apply: (context) => this.applyEndTurn(context),
      },
      undo: {
        validate: (context) => this.validateUndo(context),
        apply: (context) => this.applyUndo(context),
      },
    };
  }

  // Override the message handler to add game logic
  async handleWebSocketMessage(ws: WebSocket, message: string) {
    try {
      const action = actionSchema.parse(JSON.parse(message));
      const connection = this.sessions.get(ws);
      invariant(connection, "Connection not found");

      if (action.type === "joinGame") {
        connection.playerId = action.payload.id;
      }
      const playerId = connection.playerId;
      invariant(playerId, "Missing player id for action");

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

  validateJoinGame(_context: ActionContext<"joinGame">) {
    return { ok: true } satisfies CanPerformAction;
  }

  applyJoinGame(context: ActionContext<"joinGame">) {
    const players = new Map(context.gameState.players);
    players.set(context.action.payload.id, context.action.payload);

    return {
      ...context.gameState,
      players,
    };
  }

  validateStartGame(context: ActionContext<"startGame">) {
    if (context.gameState.type !== "idle") {
      return {
        ok: false,
        message: "Game already started",
      } satisfies CanPerformAction;
    }

    if (context.gameState.players.size === 0) {
      return {
        ok: false,
        message: "No players found",
      } satisfies CanPerformAction;
    }

    return { ok: true } satisfies CanPerformAction;
  }

  applyStartGame(context: ActionContext<"startGame">) {
    // TODO make boardType dynamic
    const boardType = "A";

    const Hex = defineHex({
      dimensions: 1,
      orientation: Orientation.FLAT,
      origin: "topLeft",
    });
    const grid = new Grid(Hex, grids[boardType]);

    const playerIdList = shuffle(Array.from(context.gameState.players.keys()));

    const tokens = shuffle([...allTokens]).map((color, index) => {
      if (index < 15) {
        const zone = Math.floor(index / 3);
        const place = index % 3;
        const token: TokenType = {
          id: `token-${crypto.randomUUID()}`,
          color,
          type: "centralBoard",
          position: { zone, place },
        };
        return token;
      } else {
        const token: TokenType = {
          id: `token-${crypto.randomUUID()}`,
          color,
          type: "pouch",
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
      type: "pouch",
    }));

    const currentPlayerId = playerIdList[0];
    if (!currentPlayerId) {
      throw new Error("No players found");
    }

    const privateGameState: ImmutablePrivateGameState = {
      boardType: boardType,
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
    } satisfies GameState;
  }

  validateTakeTokens(context: ActionContext<"takeTokens">) {
    if (context.gameState.type !== "active") {
      return {
        ok: false,
        message: "Game is not active",
      } satisfies CanPerformAction;
    }

    const { history, privateGameState } = context.gameState;

    if (privateGameState.currentPlayerId !== context.playerId) {
      return { ok: false, message: "Not your turn" } satisfies CanPerformAction;
    }

    for (let i = history.length; i > 0; i--) {
      const entry = history[i - 1];
      if (entry.gameState.currentPlayerId !== context.playerId) {
        break;
      }
      if (entry.action.type === "takeTokens") {
        return {
          ok: false,
          message: "Already taken tokens",
        } satisfies CanPerformAction;
      }
    }

    const hasTokens = privateGameState.tokens.some(
      (token) =>
        token.type === "centralBoard" &&
        token.position.zone === context.action.payload,
    );

    if (!hasTokens) {
      return {
        ok: false,
        message: "No tokens in that zone",
      } satisfies CanPerformAction;
    }

    return { ok: true } satisfies CanPerformAction;
  }

  applyTakeTokens(context: ActionContext<"takeTokens">) {
    if (context.gameState.type !== "active") {
      return context.gameState;
    }

    const zone = context.action.payload;
    let place = 0;

    const tokens = context.gameState.privateGameState.tokens.map((token) => {
      if (token.type === "centralBoard" && token.position.zone === zone) {
        const newToken: TokenType = {
          id: token.id,
          color: token.color,
          type: "taken",
          position: { player: context.playerId, place: place },
        };
        place += 1;
        return newToken;
      }
      return token;
    });

    const nextPrivateGameState: ImmutablePrivateGameState = {
      ...context.gameState.privateGameState,
      tokens,
    };

    return this.pushHistory(
      context.gameState,
      context.action,
      nextPrivateGameState,
    );
  }

  validatePlaceToken(_context: ActionContext<"placeToken">) {
    // TODO: Implement validation
    // - Check game is active
    // - Check it's the player's turn
    // - Check player has taken tokens
    // - Check tokenId is in player's taken tokens
    // - Check coords is a valid hex on the player's board
    // - Check placement rules (stacking, adjacency, etc.)
    return { ok: true } satisfies CanPerformAction;
  }

  applyPlaceToken(context: ActionContext<"placeToken">) {
    // TODO: Implement token placement
    // - Move token from taken to playerBoard
    // - Update token position with coords and stack position
    return context.gameState;
  }

  validateTakeAnimalCard(_context: ActionContext<"takeAnimalCard">) {
    // TODO: Implement validation
    // - Check game is active
    // - Check it's the player's turn
    // - Check player has placed all tokens (or turn conditions met)
    // - Check index is valid (0-4)
    // - Check there's a card at that index
    // - Check player has fewer than 4 animal cards
    return { ok: true } satisfies CanPerformAction;
  }

  applyTakeAnimalCard(context: ActionContext<"takeAnimalCard">) {
    // TODO: Implement taking animal card
    // - Move card from spread to player's hand
    // - Draw new card from deck to fill spread
    return context.gameState;
  }

  validateTest(_context: ActionContext<"test">) {
    // TODO: Implement validation for testing animal card placement
    // - Check game is active
    // - Check it's the player's turn
    // - Check animalCardId is valid
    // - Check hex is on player's board
    return { ok: true } satisfies CanPerformAction;
  }

  applyTest(context: ActionContext<"test">) {
    // TODO: Implement test action
    // - Check if animal card pattern matches at given hex
    // - Return result (potentially mark card as completed)
    return context.gameState;
  }

  validateEndTurn(context: ActionContext<"endTurn">) {
    // TODO: Implement validation
    // - Check game is active
    // - Check it's the player's turn
    // - Check player has completed required actions (placed tokens, etc.)
    if (context.gameState.type !== "active") {
      return {
        ok: false,
        message: "Game is not active",
      } satisfies CanPerformAction;
    }
    if (
      context.gameState.privateGameState.currentPlayerId !== context.playerId
    ) {
      return { ok: false, message: "Not your turn" } satisfies CanPerformAction;
    }
    return { ok: true } satisfies CanPerformAction;
  }

  applyEndTurn(context: ActionContext<"endTurn">) {
    // TODO: Implement end turn
    // - Refill central board from pouch
    // - Advance to next player
    // - Check for end game conditions
    if (context.gameState.type !== "active") {
      return context.gameState;
    }

    const { privateGameState } = context.gameState;
    const currentIndex = privateGameState.playerIdList.indexOf(
      context.playerId,
    );
    const nextIndex = (currentIndex + 1) % privateGameState.playerIdList.length;
    const nextPlayerId = privateGameState.playerIdList[nextIndex];

    const nextPrivateGameState: ImmutablePrivateGameState = {
      ...privateGameState,
      currentPlayerId: nextPlayerId,
    };

    return this.pushHistory(
      context.gameState,
      context.action,
      nextPrivateGameState,
    );
  }

  validateUndo(context: ActionContext<"undo">) {
    // TODO: Implement validation
    // - Check game is active
    // - Check there's history to undo
    // - Check the last action was by this player
    // - Check the last action is marked as canUndo
    if (context.gameState.type !== "active") {
      return {
        ok: false,
        message: "Game is not active",
      } satisfies CanPerformAction;
    }
    if (context.gameState.history.length === 0) {
      return {
        ok: false,
        message: "No actions to undo",
      } satisfies CanPerformAction;
    }
    const lastEntry =
      context.gameState.history[context.gameState.history.length - 1];
    if (!lastEntry.action.canUndo) {
      return {
        ok: false,
        message: "Cannot undo this action",
      } satisfies CanPerformAction;
    }
    return { ok: true } satisfies CanPerformAction;
  }

  applyUndo(context: ActionContext<"undo">) {
    // TODO: Implement undo
    // - Pop the last history entry
    // - Restore the previous game state
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
    } satisfies GameState;
  }

  pushHistory(
    gameState: Extract<GameState, { type: "active" }>,
    action: ActionType,
    privateGameState: ImmutablePrivateGameState,
  ): GameState {
    const historyEntry: HistoryEntry = {
      action: { ...action, canUndo: true },
      gameState: gameState.privateGameState,
    };

    return {
      ...gameState,
      privateGameState,
      history: [...gameState.history, historyEntry],
    } satisfies GameState;
  }

  broadcastGameState() {
    const state: Broadcast = {
      type: "gameState",
      payload:
        this.gameState.type === "idle"
          ? {
              type: "idle",
              players: Object.fromEntries(this.gameState.players),
            }
          : {
              type: "active",
              players: Object.fromEntries(this.gameState.players),
              gameState: this.derivePublicGameState(),
            },
    };

    this.broadcast(state);
  }

  derivePublicGameState(): DerivedPublicGameState {
    if (this.gameState.type === "idle") {
      throw new Error("Game is not active");
    }

    const privateGameState = this.gameState.privateGameState;

    const grid = grids[privateGameState.boardType];

    const centralBoard: DerivedPublicGameState["centralBoard"] = [
      [null, null, null],
      [null, null, null],
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ];

    const players = privateGameState.playerIdList.reduce<
      DerivedPublicGameState["players"]
    >((players, playerId) => {
      players[playerId] = {
        id: playerId,
        name: this.gameState.players.get(playerId)!.name,
        takenTokens: [null, null, null],
        animalCards: [null, null, null, null],
        completedAnimalCards: [],
        board: grid.reduce<DerivedPublicGameState["players"][string]["board"]>(
          (board, [q, r]) => {
            const key = `(${q},${r})`;
            board[key] = {
              cube: null,
              tokens: [],
            };
            return board;
          },
          {},
        ),
      };
      return players;
    }, {});

    // Iterate over the tokens and distribute them
    privateGameState.tokens.forEach((token) => {
      switch (token.type) {
        case "pouch":
          break;
        case "centralBoard":
          centralBoard[token.position.zone][token.position.place] = token;
          break;
        case "taken":
          players[token.position.player].takenTokens[token.position.place] =
            token;
          break;
        case "playerBoard":
          players[token.position.player].board[
            token.position.place.coords
          ].tokens[token.position.place.stackPostion] = token;
          break;
        default:
          token satisfies never;
      }
    });

    const currentPlayerId = privateGameState.currentPlayerId;
    if (!currentPlayerId) throw new Error("No current player");

    const animalCardSpread: DerivedPublicGameState["animalCardSpread"] = [
      null,
      null,
      null,
      null,
      null,
    ];
    privateGameState.animalCards.forEach((animalCard) => {
      switch (animalCard.type) {
        case "deck":
          // TODO
          break;
        case "spread":
          animalCardSpread[animalCard.position.index] = animalCard;
          break;
        case "playerBoard":
          players[animalCard.position.playerId].animalCards[
            animalCard.position.index
          ] = {
            ...animalCard,
            scores: animalCard.scores.map((score, index) => ({
              points: score,
              cubeId:
                privateGameState.animalCubes.find(
                  (cube) =>
                    cube.type === "card" &&
                    cube.position.cardId === animalCard.id &&
                    cube.position.index === index,
                )?.id ?? null,
            })),
          };
          break;
        case "playerCompleted":
          players[animalCard.position.playerId].completedAnimalCards.push(
            animalCard,
          );
          break;
        default:
          animalCard satisfies never;
      }
    });

    return {
      grid: grid,
      currentPlayerId: privateGameState.currentPlayerId,
      players: players,
      centralBoard: centralBoard,
      animalCardSpread: animalCardSpread,
    };
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

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
