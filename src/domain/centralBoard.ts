import type { ImmutablePrivateGameState, TokenType } from "../sharedTypes";

export const ZONE_COUNT = 5;
export const TOKENS_PER_ZONE = 3;

export function zoneHasTokens(
  privateGameState: ImmutablePrivateGameState,
  zone: number,
): boolean {
  return privateGameState.tokens.some(
    (token) => token.type === "centralBoard" && token.position.zone === zone,
  );
}

export function takeZoneTokens({
  privateGameState,
  playerId,
  zone,
}: {
  privateGameState: ImmutablePrivateGameState;
  playerId: string;
  zone: number;
}): ImmutablePrivateGameState {
  let slot = 0;
  const tokens = privateGameState.tokens.map((token) => {
    if (token.type !== "centralBoard" || token.position.zone !== zone) {
      return token;
    }

    const takenToken: TokenType = {
      id: token.id,
      color: token.color,
      type: "taken",
      position: { player: playerId, slot },
    };
    slot += 1;
    return takenToken;
  });

  return {
    ...privateGameState,
    tokens,
  };
}

export function refillCentralBoard(
  privateGameState: ImmutablePrivateGameState,
): {
  privateGameState: ImmutablePrivateGameState;
  endGameTriggered: boolean;
} {
  const zonesToReplenish = Array.from({ length: ZONE_COUNT }, (_, zone) =>
    zone,
  ).filter((zone) => !zoneHasTokens(privateGameState, zone));

  if (zonesToReplenish.length !== 1) {
    throw new Error("Invalid central board state");
  }

  const zone = zonesToReplenish[0]!;
  let tokensToAllocate = TOKENS_PER_ZONE;

  const tokens = privateGameState.tokens.map((token) => {
    if (tokensToAllocate <= 0 || token.type !== "supply") {
      return token;
    }

    const centralBoardToken: TokenType = {
      ...token,
      type: "centralBoard",
      position: {
        zone,
        index: TOKENS_PER_ZONE - tokensToAllocate,
      },
    };
    tokensToAllocate -= 1;
    return centralBoardToken;
  });

  return {
    privateGameState: {
      ...privateGameState,
      tokens,
    },
    endGameTriggered: tokensToAllocate > 0,
  };
}
