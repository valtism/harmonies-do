import { ViewTransition } from "react";
import { animalCardImages } from "../constants/animalCardImages";
import type { DerivedPublicGameState } from "../sharedTypes";
import { AnimalCube } from "./AnimalCube";

interface AnimalCardProps extends React.ComponentProps<"img"> {
  card: DerivedPublicGameState["players"][number]["animalCards"][number];
}
export function AnimalCard({ card, ...props }: AnimalCardProps) {
  if (!card) return null;
  return (
    <ViewTransition name={card.id}>
      <div className="relative w-40">
        <img
          src={animalCardImages[card.id]}
          alt={card.id}
          className="size-full"
          {...props}
        />
        {card.scores.map((score, index) => {
          if (!score.cubeId) return null;
          return (
            <AnimalCube
              key={score.cubeId}
              id={score.cubeId}
              className="absolute right-1"
              style={{ width: "13%", top: `${1 + index * 15.5}%` }}
            />
          );
        })}
      </div>
    </ViewTransition>
  );
}
