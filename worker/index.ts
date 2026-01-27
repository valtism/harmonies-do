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
import { canPlaceCube } from "../src/util/canPlaceCube";
import { tokenPlacable } from "../src/util/tokenPlaceable";

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

    const hasTakenTokens = this.findInTurnHistory(
      (entry) => entry.action.type === "takeTokens",
    );

    if (hasTakenTokens) {
      return {
        ok: false,
        message: "Already taken tokens",
      };
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
      };
    }

    return { ok: true };
  }

  applyTakeTokens(context: ActionContext<"takeTokens">): GameState {
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
    const placingToken = privateGameState.tokens.find(
      (token) => token.id === tokenId,
    );

    if (!placingToken) {
      return { ok: false, message: "No token found" };
    }

    if (
      placingToken.type !== "taken" ||
      placingToken.position.player !== context.playerId
    ) {
      return { ok: false, message: "Invalid token" };
    }

    const hasTakenTokens = privateGameState.tokens.some(
      (token) =>
        token.type === "taken" && token.position.player === context.playerId,
    );

    if (!hasTakenTokens) {
      return { ok: false, message: "No taken tokens" };
    }

    const isValidCoords = grid
      .toArray()
      .some((hex) => hex.toString() === coords);
    if (!isValidCoords) {
      return { ok: false, message: "Invalid board location" };
    }

    const stack: TokenType[] = [];
    privateGameState.tokens.forEach((token) => {
      if (
        token.type === "playerBoard" &&
        token.position.player === context.playerId &&
        token.position.place.coords === coords
      ) {
        stack[token.position.place.stackPostion] = token;
      }
    });

    const canPlace = tokenPlacable(placingToken, stack);
    if (!canPlace) {
      return { ok: false, message: "Cannot place token" };
    }

    return { ok: true };
  }

  applyPlaceToken(context: ActionContext<"placeToken">) {
    if (context.gameState.type !== "active") {
      return context.gameState;
    }

    const { tokenId, coords } = context.action.payload;
    const { privateGameState } = context.gameState;
    const placingToken = privateGameState.tokens.find(
      (token) => token.id === tokenId,
    );

    if (!placingToken) {
      return context.gameState;
    }

    const stack: TokenType[] = [];
    privateGameState.tokens.forEach((token) => {
      if (
        token.type === "playerBoard" &&
        token.position.player === context.playerId &&
        token.position.place.coords === coords
      ) {
        stack[token.position.place.stackPostion] = token;
      }
    });

    const tokens: PrivateGameState["tokens"] = privateGameState.tokens.map(
      (token) => {
        if (token.id === tokenId) {
          const newToken: TokenType = {
            ...placingToken,
            type: "playerBoard",
            position: {
              player: context.playerId,
              place: {
                coords,
                stackPostion: stack.length,
              },
            },
          };
          return newToken;
        }
        return token;
      },
    );

    const nextPrivateGameState: ImmutablePrivateGameState = {
      ...privateGameState,
      tokens,
    };

    return this.pushHistory(
      context.gameState,
      context.action,
      nextPrivateGameState,
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
          card.type === "playerBoard" &&
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

    const hasTakenAnimalCard = this.findInTurnHistory(
      (entry) => entry.action.type === "takeAnimalCard",
    );

    if (hasTakenAnimalCard) {
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

    const { privateGameState } = context.gameState;
    const takenIndexes = privateGameState.animalCards.reduce(
      (takenIndexes, card) => {
        if (
          card.type === "playerBoard" &&
          card.position.playerId === context.playerId
        ) {
          takenIndexes.push(card.position.index);
        }
        return takenIndexes;
      },
      [] as number[],
    );

    let playerBoardFreeIndex = 0;
    for (let i = 0; i <= 3; i++) {
      if (!takenIndexes.includes(i)) {
        playerBoardFreeIndex = i;
        break;
      }
    }

    const animalCards = privateGameState.animalCards.map((card) => {
      if (
        card.type === "spread" &&
        card.position.index === context.action.payload.index
      ) {
        return {
          ...card,
          type: "playerBoard" as const,
          position: {
            playerId: context.playerId,
            index: playerBoardFreeIndex,
          },
        };
      } else {
        return card;
      }
    });

    const selectedCard = animalCards.find(
      (card) =>
        card.type === "playerBoard" &&
        card.position.playerId === context.playerId &&
        card.position.index === playerBoardFreeIndex,
    );

    if (!selectedCard) {
      throw new Error("Selected card not found");
    }

    let scoreIndex = selectedCard.scores.length - 1;
    const animalCubes = privateGameState.animalCubes.map((cube) => {
      if (scoreIndex < 0) return cube;
      const newCube = {
        ...cube,
        type: "card" as const,
        position: {
          cardId: selectedCard.id,
          index: scoreIndex,
        },
      };
      scoreIndex--;
      return newCube;
    });

    const nextPrivateGameState: ImmutablePrivateGameState = {
      ...privateGameState,
      animalCards,
      animalCubes,
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
      animalCard.type !== "playerBoard" ||
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

    // Check if hex is on the board
    const hexExists = grid
      .toArray()
      .some((h) => h.q === hex.q && h.r === hex.r);
    if (!hexExists) {
      return { ok: false, message: "Invalid hex coordinates" };
    }

    // Check if hex already has a cube
    const cubeOnHex = privateGameState.animalCubes.find(
      (cube) =>
        cube.type === "playerBoard" &&
        cube.position.coords === `(${hex.q},${hex.r})`,
    );
    if (cubeOnHex) {
      return { ok: false, message: "This hex already has a cube" };
    }

    // Derive the public state to get the player's board (needed by canPlaceCube)
    const publicState = this.derivePublicGameState();
    const playerBoard = publicState.players[context.playerId].board;
    const derivedAnimalCards =
      publicState.players[context.playerId].animalCards;
    const derivedAnimalCard = derivedAnimalCards.find(
      (c) => c?.id === animalCardId,
    );

    if (!canPlaceCube(derivedAnimalCard, grid, hex, playerBoard)) {
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

    // Find the cube with the highest index on this card
    const cubesOnCard = privateGameState.animalCubes
      .filter(
        (cube) => cube.type === "card" && cube.position.cardId === animalCardId,
      )
      .sort(
        (a, b) =>
          (b.type === "card" ? b.position.index : 0) -
          (a.type === "card" ? a.position.index : 0),
      );

    const cubeToPlace = cubesOnCard[0];
    if (!cubeToPlace) {
      return context.gameState;
    }

    const animalCubes = privateGameState.animalCubes.map((cube) => {
      if (cube.id === cubeToPlace.id) {
        return {
          id: cube.id,
          type: "playerBoard" as const,
          position: { coords: `(${hex.q},${hex.r})` },
        };
      }
      return cube;
    });

    const nextPrivateGameState: ImmutablePrivateGameState = {
      ...privateGameState,
      animalCubes,
    };

    return this.pushHistory(
      context.gameState,
      context.action,
      nextPrivateGameState,
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

    // Check if all taken tokens have been placed
    const hasPlacedAllTokens = privateGameState.tokens.every(
      (token) =>
        !(token.type === "taken" && token.position.player === context.playerId),
    );

    // Check if the player has taken tokens this turn
    const hasTakenTokens = this.findInTurnHistory(
      (entry) => entry.action.type === "takeTokens",
    );

    if (!hasTakenTokens || !hasPlacedAllTokens) {
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

    // Find the zone that needs replenishing (the empty zone)
    const zoneToReplenish = [0, 1, 2, 3, 4].filter((zone) =>
      privateGameState.tokens.every((token) => {
        const zoneHasTokens =
          token.type === "centralBoard" && token.position.zone === zone;
        return !zoneHasTokens;
      }),
    );

    if (zoneToReplenish.length !== 1) {
      throw new Error("Invalid central board state");
    }

    // Move 3 tokens from pouch to the empty zone
    let tokensToAllocate = 3;
    const tokens = privateGameState.tokens.map((token) => {
      if (tokensToAllocate > 0 && token.type === "pouch") {
        const newToken: TokenType = {
          ...token,
          type: "centralBoard",
          position: { zone: zoneToReplenish[0], place: 3 - tokensToAllocate },
        };
        tokensToAllocate--;
        return newToken;
      } else {
        return token;
      }
    });

    // Find empty slots in the animal card spread and replenish from deck
    const emptySpreadIndexes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const hasCard = privateGameState.animalCards.some(
        (card) => card.type === "spread" && card.position.index === i,
      );
      if (!hasCard) {
        emptySpreadIndexes.push(i);
      }
    }

    let emptyIndexCursor = 0;
    const animalCards = privateGameState.animalCards.map((card) => {
      if (
        card.type === "deck" &&
        emptyIndexCursor < emptySpreadIndexes.length
      ) {
        const newCard: AnimalCardType = {
          ...card,
          type: "spread",
          position: { index: emptySpreadIndexes[emptyIndexCursor] },
        };
        emptyIndexCursor++;
        return newCard;
      }
      return card;
    });

    const nextPrivateGameState: ImmutablePrivateGameState = {
      ...privateGameState,
      tokens,
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
    if (context.gameState.history.length === 0) {
      return {
        ok: false,
        message: "No actions to undo",
      };
    }
    const lastEntry = context.gameState.history.at(-1);
    if (!lastEntry?.action.canUndo) {
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
    };
  }

  /**
   * Search through history for the current turn.
   * Iterates backwards through history until it finds an endTurn action.
   * Returns true if the callback returns true for any entry.
   */
  findInTurnHistory(callback: (entry: HistoryEntry) => boolean): boolean {
    if (!this.gameState.history) {
      return false;
    }

    for (let i = this.gameState.history.length; i > 0; i--) {
      const entry = this.gameState.history[i - 1];
      if (entry.action.type === "endTurn") {
        break;
      }
      if (callback(entry)) {
        return true;
      }
    }
    return false;
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
            const cubeOnHex = privateGameState.animalCubes.find(
              (cube) =>
                cube.type === "playerBoard" && cube.position.coords === key,
            );
            board[key] = {
              cube: cubeOnHex ? "animal" : null,
              cubeId: cubeOnHex ? cubeOnHex.id : null,
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
      TODO_REMOVE_privateGameState: this.gameState.privateGameState,
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
