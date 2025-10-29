// import usePartySocket from "partysocket/react";
import { useState } from "react";
import type {
  ActionType,
  DerivedPublicGameState,
  PlayersById,
  User,
} from "../sharedTypes";
import { useWebSocket } from "../util/useWebSocket";
import { Game } from "./Game";

interface GameSocketProps {
  roomId: string;
  user: User;
}
export function GameSocket({ roomId, user }: GameSocketProps) {
  const [gameState, setGameState] = useState<DerivedPublicGameState | null>(
    null,
  );
  const { connect, sendMessage, connectionStatus } = useWebSocket({
    durableObjectId: roomId,
    onMessage: (message) => {
      console.log(message);
      // const broadcast = JSON.parse(message.data) as Broadcast;
      // switch (broadcast.type) {
      //   case "players":
      //     setPlayersById(broadcast.players);
      //     break;
      //   case "gameState":
      //     startTransition(() => {
      //       setGameState(broadcast.gameState);
      //     });
      //     break;
      //   case "error":
      //     if (broadcast.playerId !== user.id) return;
      //     toastQueue.add(
      //       {
      //         type: "error",
      //         message: broadcast.message,
      //       },
      //       { timeout: 5000 },
      //     );
      //     break;
      //   default:
      //     broadcast satisfies never;
    },
  });

  const [playersById, setPlayersById] = useState<PlayersById | null>(null);

  function sendAction(action: ActionType) {
    // return socket.send(JSON.stringify(action));
  }

  if (!gameState) {
    return (
      <div>
        <button
          className="px-2 py-1 rounded bg-stone-200 hover:bg-stone-300"
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
          <button onClick={() => sendMessage("Hello from client!")}>
            Send Test Message
          </button>
        )}
        <div>Players:</div>
        {/*{Object.values(playersById).map((player) => (
          <div key={player.id}>{player.name}</div>
        ))}*/}
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

  if (!gameState) return null;

  return (
    <Game gameState={gameState} sendAction={sendAction} playerId={user.id} />
  );
}
