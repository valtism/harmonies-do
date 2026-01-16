import { DurableObject } from "cloudflare:workers";
import { grids } from "../src/constants/grids";
import {
  actionSchema,
  type Broadcast,
  type DerivedPublicGameState,
  type GameState,
  type User,
} from "../src/sharedTypes";

export interface Env {
  HARMONIES: DurableObjectNamespace<HarmoniesGame>;
}

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
  sessions: Map<WebSocket, { id: string }>;

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
    // Parse the message as a game action
    try {
      const data = actionSchema.parse(JSON.parse(message));
      console.log(data);

      // Handle different game actions
      switch (data.type) {
        case "joinGame":
          this.handlePlayerJoin(data.payload);
          break;
        default: {
          const error: Broadcast = {
            type: "error",
            message: "Unknown action type",
          };
          ws.send(JSON.stringify(error));
        }
      }
    } catch (error) {
      console.error(error);
      // If parsing fails, fall back to parent behavior
      super.handleWebSocketMessage(ws, message);
    } finally {
      this.broadcastGameState();
    }
  }

  // Your game logic methods
  handlePlayerJoin(player: User) {
    this.gameState.players.set(player.id, player);
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
      this.gameState.players.delete(connection.id);
      this.broadcastGameState();
    }

    // Call parent method to clean up the session
    super.handleConnectionClose(ws);
  }
}
