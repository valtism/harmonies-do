import type { ImmutablePrivateGameState, TokenType } from "../sharedTypes";
import { tokenPlacable } from "./tokenPlaceable";

export function simulateEndBoardState({
  privateGameState,
  playerId,
  gridCoords,
  randomHeight,
  shuffleTokens,
}: {
  privateGameState: ImmutablePrivateGameState;
  playerId: string;
  gridCoords: [number, number][];
  randomHeight: () => number;
  shuffleTokens: (tokens: TokenType[]) => TokenType[];
}): ImmutablePrivateGameState {
  const availableTokens = shuffleTokens(
    privateGameState.tokens.filter((token) => token.type === "supply"),
  );

  const tokensToPlace: {
    token: TokenType;
    coords: string;
    stackPosition: number;
  }[] = [];

  const usedTokenIds = new Set<string>();

  for (const [q, r] of gridCoords) {
    const coords = `(${q},${r})`;
    const maxStackHeight = randomHeight();
    const hasAnimalCube = privateGameState.animalCubes.some(
      (cube) => cube.type === "personalBoard" && cube.position.coords === coords,
    );

    if (hasAnimalCube) {
      continue;
    }

    const existingTokens: TokenType[] = [];
    privateGameState.tokens.forEach((token) => {
      if (
        token.type === "personalBoard" &&
        token.position.player === playerId &&
        token.position.hex.coords === coords
      ) {
        existingTokens[token.position.hex.stackPosition] = token as TokenType;
      }
    });
    const currentStack = existingTokens.filter(
      (token): token is TokenType => token !== undefined,
    );

    while (currentStack.length < maxStackHeight && currentStack.length < 3) {
      const placeableToken = availableTokens.find(
        (token) =>
          !usedTokenIds.has(token.id) && tokenPlacable(token, currentStack),
      );

      if (!placeableToken) {
        break;
      }

      usedTokenIds.add(placeableToken.id);
      tokensToPlace.push({
        token: placeableToken,
        coords,
        stackPosition: currentStack.length,
      });
      currentStack.push(placeableToken);
    }
  }

  const tokens = privateGameState.tokens.map((token) => {
    const placement = tokensToPlace.find((p) => p.token.id === token.id);
    if (!placement) {
      return token;
    }

    const newToken: TokenType = {
      ...token,
      type: "personalBoard",
      position: {
        player: playerId,
        hex: {
          coords: placement.coords,
          stackPosition: placement.stackPosition,
        },
      },
    };
    return newToken;
  });

  return {
    ...privateGameState,
    tokens,
  };
}
