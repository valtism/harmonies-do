import { createFileRoute } from "@tanstack/react-router";
import { startTransition, useState } from "react";
import useLocalStorageState from "use-local-storage-state";
import { GameSocket } from "../components/GameSocket";
import { NameSelect } from "../components/NameSelect";
import { toastQueue } from "../components/toastQueue";
import type { ActionType, Broadcast, PublicState } from "../sharedTypes";
import { useWebSocket } from "../util/useWebSocket";

export interface User {
  id: string;
  name: string;
}

const userId = crypto.randomUUID();

export const Route = createFileRoute("/$roomId")({
  component: Room,
});

function Room() {
  const { roomId } = Route.useParams();

  const [user, setUser] = useLocalStorageState<User | null>(`name-${roomId}`, {
    defaultValue: null,
  });

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

  function sendAction(action: ActionType) {
    sendMessage(JSON.stringify(action));
  }

  if (connectionStatus !== "connected" || !user) {
    return (
      <div>
        <div>Hello from {roomId}!</div>
        <NameSelect
          onNameChange={(name) => {
            setUser({ id: userId, name: name });
            connect();
          }}
          disabled={connectionStatus === "connecting"}
        />
        <div>
          {connectionStatus === "connecting"
            ? "Connecting..."
            : "Not Connected"}
        </div>
      </div>
    );
  }

  return (
    <GameSocket gameState={gameState} user={user} sendAction={sendAction} />
  );
}
