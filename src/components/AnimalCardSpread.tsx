import { AnimalCard } from "../components/AnimalCard";
import type { DerivedPublicGameState } from "../sharedTypes";

interface AnimalCardSpreadProps {
  spread: DerivedPublicGameState["animalCardSpread"];
  onClick: (index: number) => void;
}

export function AnimalCardSpread({ spread, onClick }: AnimalCardSpreadProps) {
  return (
    <div className="flex w-80 gap-2">
      {spread.map((card, index) => {
        if (!card) return null;
        return (
          <button key={index} onClick={() => onClick(index)} className="flex-1">
            <AnimalCard
              card={{
                ...card,
                scores: card.scores.map((score) => ({
                  points: score,
                  cubeId: null,
                })),
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
