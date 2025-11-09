import { DurableObject } from "cloudflare:workers";

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

    // A stub is a client used to invoke methods on the Durable Object
    const stub = env.HARMONIES.getByName(durableObjectId);

    // Methods on the Durable Object are invoked via the stub
    const rpcResponse = await stub.sayHello();

    return new Response(rpcResponse);
  },
} satisfies ExportedHandler<Env>;

// Durable Object
export class Harmonies extends DurableObject {
  // Keeps track of all WebSocket connections
  sessions: Map<WebSocket, Record<string, string>>;

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
    // this.sessions.forEach((_, session) => {
    //   session.send(
    //     `[Durable Object] message: ${message}, from: ${connection.id}`,
    //   );
    // });
  }

  async handleConnectionClose(ws: WebSocket) {
    this.sessions.delete(ws);
    ws.close(1000, "Durable Object is closing WebSocket");
  }

  async sayHello(): Promise<string> {
    return "Hello, World!";
  }
}

// Game-specific Durable Object - extends Harmonies with game logic
export class HarmoniesGame extends Harmonies {
  // Add your game state here
  gameState: {
    players: Map<string, any>;
    board: any;
    currentTurn: string | null;
    // ... other game state
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Initialize game state
    this.gameState = {
      players: new Map(),
      board: null,
      currentTurn: null,
    };
  }

  // Override the message handler to add game logic
  async handleWebSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const connection = this.sessions.get(ws)!;

    // Parse the message as a game action
    try {
      const data = JSON.parse(message as string);

      // Handle different game actions
      switch (data.type) {
        case "JOIN_GAME":
          this.handlePlayerJoin(ws, connection.id, data.payload);
          break;
        case "MAKE_MOVE":
          this.handlePlayerMove(ws, connection.id, data.payload);
          break;
        case "CHAT":
          // For chat messages, use the parent class behavior
          super.handleWebSocketMessage(ws, message);
          break;
        default:
          ws.send(JSON.stringify({ error: "Unknown action type" }));
      }
    } catch (error) {
      // If parsing fails, fall back to parent behavior
      super.handleWebSocketMessage(ws, message);
    }
  }

  // Your game logic methods
  handlePlayerJoin(ws: WebSocket, playerId: string, payload: any) {
    this.gameState.players.set(playerId, payload);

    // Broadcast to all players
    this.broadcastGameState();
  }

  handlePlayerMove(ws: WebSocket, playerId: string, payload: any) {
    // Validate it's the player's turn
    if (this.gameState.currentTurn !== playerId) {
      ws.send(JSON.stringify({ error: "Not your turn" }));
      return;
    }

    // Apply the move to your game state
    // ... your game logic here ...

    // Broadcast updated state
    this.broadcastGameState();
  }

  broadcastGameState() {
    const state = JSON.stringify({
      type: "GAME_STATE_UPDATE",
      payload: {
        players: Array.from(this.gameState.players.entries()),
        board: this.gameState.board,
        currentTurn: this.gameState.currentTurn,
      },
    });

    this.sessions.forEach((_, session) => {
      session.send(state);
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
