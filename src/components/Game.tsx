import { AnimalCardSpread } from "../components/AnimalCardSpread";
import { CentralBoard } from "../components/CentralBoard";
import { PlayerBoard } from "../components/PlayerBoard";
import type { ActionType, DerivedPublicGameState } from "../sharedTypes";

interface GameProps {
  gameState: DerivedPublicGameState;
  sendAction: (action: ActionType) => void;
  playerId: string;
}
export function Game({ gameState, sendAction, playerId }: GameProps) {
  console.log(gameState);

  return (
    <div className="mb-60 flex flex-col items-start">
      {gameState.currentPlayerId === playerId && (
        <div className="fixed top-2 right-4">Your turn!</div>
      )}
      <button
        className="rounded bg-stone-100 px-2 py-1 text-stone-900 hover:bg-stone-300"
        onClick={() => {
          sendAction({
            type: "undo",
          });
        }}
      >
        Undo
      </button>
      <button
        className="rounded bg-stone-100 px-2 py-1 text-stone-900 hover:bg-stone-300"
        onClick={() => {
          sendAction({
            type: "endTurn",
          });
        }}
      >
        End turn
      </button>
      <button
        className="rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-700"
        onClick={() => {
          sendAction({
            type: "simulateEndBoardState",
          });
        }}
      >
        🐛 Simulate End Board
      </button>
      <CentralBoard
        state={gameState.centralBoard}
        onClick={(zone) => {
          sendAction({
            type: "takeTokens",
            payload: zone,
          });
        }}
      />

      <AnimalCardSpread
        spread={gameState.animalCardSpread}
        onClick={(index) => {
          sendAction({ type: "takeAnimalCard", payload: { index: index } });
        }}
      />

      {Object.values(gameState.players).map((player) => (
        <div key={player.id} style={{ width: 400 }}>
          <PlayerBoard
            playerId={player.id}
            gameState={gameState}
            sendAction={sendAction}
          />
        </div>
      ))}

      <div className="text-white">
        <div className="font-bold">Players:</div>
        {Object.values(gameState.players).map((player) => (
          <div key={player.id}>{player.name}</div>
        ))}
      </div>
    </div>
  );
}
