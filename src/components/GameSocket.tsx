import type { ActionType, PublicState, User } from "../sharedTypes";
import { Game } from "./Game";

interface GameSocketProps {
  gameState: PublicState;
  user: User;
  sendAction: (action: ActionType) => void;
}
export function GameSocket({ gameState, user, sendAction }: GameSocketProps) {
  if (gameState.type === "idle") {
    return (
      <div>
        
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
