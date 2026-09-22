import { AnimalCard } from "../components/AnimalCard";
import type { DerivedPublicGameState } from "../sharedTypes";

interface AnimalCardSpreadProps {
  spread: DerivedPublicGameState["animalCardSpread"];
  onClick: (index: number) => void;
}

export function AnimalCardSpread({ spread, onClick }: AnimalCardSpreadProps) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="animal-card-spread grid">
        {spread.map((card, index) => {
          if (!card) return null;
          return (
            <button key={index} onClick={() => onClick(index)}>
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
    </div>
  );
}
