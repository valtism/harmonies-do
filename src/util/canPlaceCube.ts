import { fromCoordinates, Grid, Hex } from "honeycomb-grid";
import type {
  Coords,
  DerivedAnimalCardType,
  PlayerGameState,
} from "../sharedTypes";

export function canPlaceCube(
  animalCard: DerivedAnimalCardType | undefined | null,
  grid: Grid<Hex>,
  hex: Coords,
  playerBoard: PlayerGameState["board"],
) {
  if (!animalCard) return false;
  if (playerBoard[`(${hex.q},${hex.r})`]?.cube) return false;

  const positions = animalCard.shape.map((tile) => tile.coordinates);
  const rotations = [0, 1, 2, 3, 4, 5].map((rotation) =>
    positions.map((position) => rotate(position, rotation)),
  );
  const relativePositions = rotations.map((roatation) =>
    roatation.map((coords) => translate(coords, { q: hex.q, r: hex.r })),
  );
  const traversers = relativePositions.map((positions) =>
    fromCoordinates(...positions),
  );

  const matches = traversers.map((traverser) => {
    const trav = grid.traverse(traverser, { bail: false }).toArray();
    // TODO: Make me dynamic
    // if (trav.length !== 4) return false;

    return trav.reduce((isMatch, hex, index) => {
      const place = playerBoard[`(${hex.q},${hex.r})`];
      if (!place) return false;
      const placeTokens = place.tokens;
      const topPlaceToken = placeTokens.at(-1);
      if (!topPlaceToken) return false;
      const topToken = animalCard.shape[index]!.topToken;
      const stackMatch =
        placeTokens.length - 1 === topToken.index &&
        topPlaceToken.color === topToken.color;
      return isMatch && stackMatch;
    }, true);
  });
  return matches.some((match) => match);
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
