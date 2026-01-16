import { startTransition, useState } from "react";
import type { ActionType, Broadcast, PublicState, User } from "../sharedTypes";
import { useWebSocket } from "../util/useWebSocket";
import { Game } from "./Game";
import { toastQueue } from "./toastQueue";

interface GameSocketProps {
  roomId: string;
  user: User;
}
export function GameSocket({ roomId, user }: GameSocketProps) {
  const [gameState, setGameState] = useState<PublicState>({
    type: "idle",
    players: {},
  });
  const { connect, sendMessage, connectionStatus } = useWebSocket({
    durableObjectId: roomId,
    onMessage: (message) => {
      const broadcast = JSON.parse(message) as Broadcast;
      console.log(broadcast);
      switch (broadcast.type) {
        // case "players":
        //   setPlayersById(broadcast.players);
        //   break;
        case "gameState":
          startTransition(() => {
            setGameState(broadcast.payload);
          });
          break;
        case "error":
          // if (broadcast.playerId !== user.id) return;
          console.log("here")
          toastQueue.add(
            {
              type: "error",
              message: broadcast.message,
            },
            { timeout: 5000 },
          );
          break;
        default:
          broadcast satisfies never;
      }
    },
  });

  // const [playersById, setPlayersById] = useState<PlayersById | null>(null);

  function sendAction(action: ActionType) {
    sendMessage(JSON.stringify(action));
  }

  if (gameState.type === "idle") {
    return (
      <div>
        <button
          className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700"
          onClick={connect}
          disabled={connectionStatus === "connecting"}
        >
          {connectionStatus === "connected"
            ? "Connected"
            : connectionStatus === "connecting"
              ? "Connecting..."
              : "Connect to Server"}
        </button>
        {connectionStatus === "connected" && (
          <button
            onClick={() =>
              sendAction({
                type: "joinGame",
                payload: {
                  id: user.id,
                  name: user.name,
                },
              })
            }
          >
            Send Test Message
          </button>
        )}
        <div>Players:</div>
        {Object.values(gameState.players).map((player) => (
          <div key={player.id}>{player.name}</div>
        ))}
        <button
          onClick={() => {
            sendAction({
              type: "startGame",
            });
          }}
          className="rounded bg-stone-200 px-2 py-1 text-stone-900 hover:bg-stone-300 active:bg-stone-400"
        >
          Start Game
        </button>
      </div>
    );
  }

  return (
    <Game
      gameState={gameState.gameState}
      sendAction={sendAction}
      playerId={user.id}
    />
  );
}
