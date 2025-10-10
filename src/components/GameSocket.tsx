import usePartySocket from "partysocket/react";
import { startTransition, useState } from "react";
import { toastQueue } from "../components/toastQueue";
import type {
  ActionType,
  Broadcast,
  DerivedPublicGameState,
  PlayersById,
  User,
} from "../sharedTypes";
import { Game } from "./Game";

interface GameSocketProps {
  roomId: string;
  user: User;
}
export function GameSocket({ roomId, user }: GameSocketProps) {
  const [gameState, setGameState] = useState<DerivedPublicGameState | null>(
    null,
  );

  const [playersById, setPlayersById] = useState<PlayersById | null>(null);

  const socket = usePartySocket({
    // host defaults to the current URL if not set
    // host: process.env.PARTYKIT_HOST,
    // we could use any room name here
    host: "localhost:1999",
    room: roomId,
    query: () => ({
      player: JSON.stringify(user),
    }),
    onMessage(evt) {
      console.log(evt);
      const broadcast = JSON.parse(evt.data) as Broadcast;
      switch (broadcast.type) {
        case "players":
          setPlayersById(broadcast.players);
          break;
        case "gameState":
          startTransition(() => {
            setGameState(broadcast.gameState);
          });
          break;
        case "error":
          if (broadcast.playerId !== user.id) return;
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
    return socket.send(JSON.stringify(action));
  }

  if (playersById && !gameState) {
    return (
      <div>
        <div>Players:</div>
        {Object.values(playersById).map((player) => (
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

  if (!gameState) return null;

  return (
    <Game gameState={gameState} sendAction={sendAction} playerId={user.id} />
  );
}
