import { fromCoordinates, Grid, Hex } from "honeycomb-grid";
import type {
  AnimalCardType,
  AnimalCubeType,
  Coords,
  ImmutablePrivateGameState,
} from "../sharedTypes";
import type { PersonalBoardView } from "./personalBoard";

type PlayerCardsResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

type TakeAnimalCardInput = {
  privateGameState: ImmutablePrivateGameState;
  playerId: string;
  spreadIndex: number;
};

type PlaceCubeInput = {
  privateGameState: ImmutablePrivateGameState;
  animalCardId: string;
  cubeId: string;
  coords: string;
};

type CompleteAnimalCardInput = {
  animalCards: readonly AnimalCardType[];
  animalCubes: readonly AnimalCubeType[];
  animalCardId: string;
  playerId: string;
};

type CanPlaceCubeInput = {
  animalCard: { pattern: AnimalCardType["pattern"] } | undefined | null;
  grid: Grid<Hex>;
  hex: Coords;
  personalBoard: PersonalBoardView;
};

export function takeAnimalCard({
  privateGameState,
  playerId,
  spreadIndex,
}: TakeAnimalCardInput): PlayerCardsResult<{
  animalCards: AnimalCardType[];
  animalCubes: AnimalCubeType[];
  selectedCard: AnimalCardType;
}> {
  if (spreadIndex < 0 || spreadIndex >= 5) {
    return { ok: false, message: "Invalid card index" };
  }

  const cardAtSpread = privateGameState.animalCards.find(
    (card) => card.type === "spread" && card.position.index === spreadIndex,
  );

  if (!cardAtSpread) {
    return { ok: false, message: "No card at that index" };
  }

  const takenIndexes = privateGameState.animalCards.reduce(
    (takenIndexes, card) => {
      if (card.type === "held" && card.position.playerId === playerId) {
        takenIndexes.push(card.position.index);
      }
      return takenIndexes;
    },
    [] as number[],
  );

  if (takenIndexes.length >= 4) {
    return { ok: false, message: "All animal card slots are full" };
  }

  let personalBoardFreeIndex = 0;
  for (let i = 0; i <= 3; i++) {
    if (!takenIndexes.includes(i)) {
      personalBoardFreeIndex = i;
      break;
    }
  }

  const animalCards = privateGameState.animalCards.map((card) => {
    if (
      card.type === "spread" &&
      card.position.index === spreadIndex
    ) {
      return {
        ...card,
        type: "held" as const,
        position: {
          playerId,
          index: personalBoardFreeIndex,
        },
      };
    }
    return card;
  });

  const selectedCard = animalCards.find(
    (card) =>
      card.type === "held" &&
      card.position.playerId === playerId &&
      card.position.index === personalBoardFreeIndex,
  );

  if (!selectedCard) {
    throw new Error("Selected card not found");
  }

  const animalCubes = allocateCubesToCard(
    privateGameState.animalCubes,
    selectedCard,
  );

  return { ok: true, value: { animalCards, animalCubes, selectedCard } };
}

export function placeCube({
  privateGameState,
  animalCardId,
  cubeId,
  coords,
}: PlaceCubeInput): PlayerCardsResult<ImmutablePrivateGameState> {
  const cubeToPlace = privateGameState.animalCubes.find(
    (cube) => cube.id === cubeId,
  );

  if (!cubeToPlace) {
    return { ok: false, message: "No cube found" };
  }

  if (cubeToPlace.type !== "card") {
    return { ok: false, message: "Invalid cube" };
  }

  if (cubeToPlace.position.cardId !== animalCardId) {
    return { ok: false, message: "Cube does not belong to this animal card" };
  }

  const animalCard = privateGameState.animalCards.find(
    (card) => card.id === animalCardId,
  );

  if (
    !animalCard ||
    animalCard.type !== "held"
  ) {
    return { ok: false, message: "Animal card not found or not held" };
  }

  const animalCubes = privateGameState.animalCubes.map((cube) => {
    if (cube.id !== cubeId) return cube;
    return {
      id: cube.id,
      type: "personalBoard" as const,
      position: { coords },
    };
  });

  const completionResult = completeAnimalCardIfEmpty({
    animalCards: privateGameState.animalCards,
    animalCubes,
    animalCardId,
    playerId: animalCard.position.playerId,
  });

  return {
    ok: true,
    value: {
      ...privateGameState,
      animalCubes: completionResult.animalCubes,
      animalCards: completionResult.animalCards,
    },
  };
}

export function replenishAnimalCardSpread(
  animalCards: readonly AnimalCardType[],
): AnimalCardType[] {
  const emptySpreadIndexes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const hasCard = animalCards.some(
      (card) => card.type === "spread" && card.position.index === i,
    );
    if (!hasCard) {
      emptySpreadIndexes.push(i);
    }
  }

  if (emptySpreadIndexes.length === 0) {
    return [...animalCards];
  }

  let emptyIndexCursor = 0;
  return animalCards.map((card) => {
    if (
      card.type === "deck" &&
      emptyIndexCursor < emptySpreadIndexes.length
    ) {
      const newCard: AnimalCardType = {
        ...card,
        type: "spread",
        position: { index: emptySpreadIndexes[emptyIndexCursor] },
      };
      emptyIndexCursor++;
      return newCard;
    }
    return card;
  });
}

export function canPlaceCube({
  animalCard,
  grid,
  hex,
  personalBoard,
}: CanPlaceCubeInput): boolean {
  if (!animalCard) return false;
  if (personalBoard.cubeAt(`(${hex.q},${hex.r})`)) return false;

  const positions = animalCard.pattern.map((tile) => tile.coordinates);
  const rotations = [0, 1, 2, 3, 4, 5].map((rotation) =>
    positions.map((position) => rotate(position, rotation)),
  );
  const relativePositions = rotations.map((rotation) =>
    rotation.map((coords) => translate(coords, { q: hex.q, r: hex.r })),
  );
  const traversers = relativePositions.map((positions) =>
    fromCoordinates(...positions),
  );

  const matches = traversers.map((traverser) => {
    const trav = grid.traverse(traverser, { bail: false }).toArray();
    if (trav.length !== animalCard.pattern.length) return false;

    return trav.reduce((isMatch, hex, index) => {
      const place = personalBoard.hexAt(`(${hex.q},${hex.r})`);
      if (!place) return false;
      const placeTokens = place.tokens;
      const topPlaceToken = placeTokens.at(-1);
      if (!topPlaceToken) return false;
      const requirement = animalCard.pattern[index]!;
      const stackMatch =
        placeTokens.length === requirement.stackHeight &&
        topPlaceToken.color === requirement.topColor;
      return isMatch && stackMatch;
    }, true);
  });

  return matches.some((match) => match);
}

export function getCubesOnCard(
  animalCubes: readonly AnimalCubeType[],
  cardId: string,
): AnimalCubeType[] {
  return animalCubes.filter(
    (cube) => cube.type === "card" && cube.position.cardId === cardId,
  );
}

export function getHighestIndexCubeOnCard(
  animalCubes: readonly AnimalCubeType[],
  cardId: string,
): AnimalCubeType | undefined {
  const cubesOnCard = [...animalCubes]
    .filter(
      (cube) => cube.type === "card" && cube.position.cardId === cardId,
    )
    .sort(
      (a, b) =>
        (b.type === "card" ? b.position.index : 0) -
        (a.type === "card" ? a.position.index : 0),
    );

  return cubesOnCard[0];
}

export function getHeldCardAtIndex(
  animalCards: readonly AnimalCardType[],
  playerId: string,
  index: number,
): AnimalCardType | undefined {
  return animalCards.find(
    (card) =>
      card.type === "held" &&
      card.position.playerId === playerId &&
      card.position.index === index,
  );
}

export function getCompletedCards(
  animalCards: readonly AnimalCardType[],
  playerId: string,
): AnimalCardType[] {
  return animalCards.filter(
    (card) =>
      card.type === "completed" && card.position.playerId === playerId,
  );
}

export function getHeldCards(
  animalCards: readonly AnimalCardType[],
  playerId: string,
): AnimalCardType[] {
  return [...animalCards]
    .filter(
      (card): card is Extract<AnimalCardType, { type: "held" }> =>
        card.type === "held" && card.position.playerId === playerId,
    )
    .sort((a, b) => a.position.index - b.position.index);
}

export function getNextFreeHeldIndex(
  animalCards: readonly AnimalCardType[],
  playerId: string,
): number | null {
  const takenIndexes = animalCards.reduce(
    (takenIndexes, card) => {
      if (card.type === "held" && card.position.playerId === playerId) {
        takenIndexes.push(card.position.index);
      }
      return takenIndexes;
    },
    [] as number[],
  );

  for (let i = 0; i <= 3; i++) {
    if (!takenIndexes.includes(i)) {
      return i;
    }
  }

  return null;
}

function allocateCubesToCard(
  animalCubes: readonly AnimalCubeType[],
  card: AnimalCardType,
): AnimalCubeType[] {
  let scoreIndex = card.scores.length - 1;
  return animalCubes.map((cube) => {
    if (scoreIndex < 0) return cube;
    const newCube: AnimalCubeType = {
      ...cube,
      type: "card" as const,
      position: {
        cardId: card.id,
        index: scoreIndex,
      },
    };
    scoreIndex--;
    return newCube;
  });
}

function completeAnimalCardIfEmpty({
  animalCards,
  animalCubes,
  animalCardId,
  playerId,
}: CompleteAnimalCardInput): {
  animalCards: AnimalCardType[];
  animalCubes: AnimalCubeType[];
} {
  const remainingCubes = animalCubes.filter(
    (cube) => cube.type === "card" && cube.position.cardId === animalCardId,
  );

  if (remainingCubes.length > 0) {
    return { animalCards: [...animalCards], animalCubes: [...animalCubes] };
  }

  const completedCard = animalCards.find(
    (card) =>
      card.id === animalCardId &&
      card.type === "held" &&
      card.position.playerId === playerId,
  );

  if (!completedCard || completedCard.type !== "held") {
    return { animalCards: [...animalCards], animalCubes: [...animalCubes] };
  }

  const completedIndex = completedCard.position.index;

  const updatedAnimalCards = animalCards.map((card) => {
    if (card.id === animalCardId) {
      return {
        ...card,
        type: "completed" as const,
        position: { playerId },
      };
    }
    if (
      card.type === "held" &&
      card.position.playerId === playerId &&
      card.position.index > completedIndex
    ) {
      return {
        ...card,
        position: {
          ...card.position,
          index: card.position.index - 1,
        },
      };
    }
    return card;
  });

  return { animalCards: updatedAnimalCards, animalCubes: [...animalCubes] };
}

function rotate(coords: Readonly<Coords>, steps: number): Coords {
  let newCoords = coords;
  for (let i = 0; i < steps; i++) {
    newCoords = rotateOnce(newCoords);
  }
  return newCoords;
}

function rotateOnce(coords: Readonly<Coords>): Coords {
  const s = -coords.q - coords.r;
  return { q: -coords.r, r: -s };
}

function translate(coords: Readonly<Coords>, delta: Readonly<Coords>): Coords {
  return { q: coords.q + delta.q, r: coords.r + delta.r };
}
