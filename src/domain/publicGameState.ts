import type { Grid, Hex } from "honeycomb-grid";
import type {
  AnimalCardType,
  DerivedPublicGameState,
  HexState,
  ImmutablePrivateGameState,
  PlayerGameState,
  PublicState,
  User,
} from "../sharedTypes";
import { calculateFinalScore } from "./finalScoring";
import { createPersonalBoardView } from "./personalBoard";

type DerivePublicGameStateInput = {
  privateGameState: ImmutablePrivateGameState;
  players: ReadonlyMap<string, User>;
  grid: Grid<Hex>;
  gridCoords: [number, number][];
};

export function derivePublicIdleState(
  players: ReadonlyMap<string, User>,
): PublicState {
  return {
    type: "idle",
    players: Object.fromEntries(players),
  };
}

export function derivePublicActiveState(
  input: DerivePublicGameStateInput,
): PublicState {
  return {
    type: "active",
    players: Object.fromEntries(input.players),
    gameState: derivePublicGameState(input),
  };
}

export function derivePublicGameState({
  privateGameState,
  players: playerMeta,
  grid,
  gridCoords,
}: DerivePublicGameStateInput): DerivedPublicGameState {
  const centralBoard = emptyCentralBoard();
  const players = derivePlayers({
    privateGameState,
    playerMeta,
    gridCoords,
  });
  const animalCardSpread = emptyAnimalCardSpread();

  for (const token of privateGameState.tokens) {
    switch (token.type) {
      case "supply":
        break;
      case "centralBoard":
        centralBoard[token.position.zone][token.position.index] = token;
        break;
      case "taken":
        players[token.position.player].takenTokens[token.position.slot] = token;
        break;
      case "personalBoard":
        players[token.position.player].board[
          token.position.hex.coords
        ].tokens[token.position.hex.stackPosition] = token;
        break;
      default:
        token satisfies never;
    }
  }

  for (const animalCard of privateGameState.animalCards) {
    switch (animalCard.type) {
      case "deck":
        break;
      case "spread":
        animalCardSpread[animalCard.position.index] = animalCard;
        break;
      case "held":
        players[animalCard.position.playerId].playerCards[
          animalCard.position.index
        ] = deriveHeldAnimalCard(animalCard, privateGameState);
        break;
      case "completed":
        players[animalCard.position.playerId].completedAnimalCards.push(
          animalCard,
        );
        break;
      default:
        animalCard satisfies never;
    }
  }

  for (const playerId of privateGameState.playerIdList) {
    const player = players[playerId];
    const completedCardPoints = player.completedAnimalCards.reduce(
      (sum, card) => sum + (card.scores[0] ?? 0),
      0,
    );
    const personalBoard = createPersonalBoardView({
      privateGameState,
      playerId,
      grid,
    });
    player.score = calculateFinalScore({
      personalBoard,
      side: privateGameState.personalBoardSide,
      animalPoints: completedCardPoints,
    });
  }

  return {
    grid: gridCoords,
    currentPlayerId: privateGameState.currentPlayerId,
    players,
    centralBoard,
    animalCardSpread,
  };
}

function derivePlayers({
  privateGameState,
  playerMeta,
  gridCoords,
}: {
  privateGameState: ImmutablePrivateGameState;
  playerMeta: ReadonlyMap<string, User>;
  gridCoords: [number, number][];
}): DerivedPublicGameState["players"] {
  return privateGameState.playerIdList.reduce<DerivedPublicGameState["players"]>(
    (players, playerId) => {
      const player = playerMeta.get(playerId);
      if (!player) {
        throw new Error(`Missing player metadata for ${playerId}`);
      }

      players[playerId] = {
        id: playerId,
        name: player.name,
        takenTokens: [null, null, null],
        playerCards: [null, null, null, null],
        completedAnimalCards: [],
        board: gridCoords.reduce<Record<string, HexState>>((board, [q, r]) => {
          const key = `(${q},${r})`;
          const cubeOnHex = privateGameState.animalCubes.find(
            (cube) =>
              cube.type === "personalBoard" && cube.position.coords === key,
          );
          board[key] = {
            cube: cubeOnHex ? "animal" : null,
            cubeId: cubeOnHex ? cubeOnHex.id : null,
            tokens: [],
          };
          return board;
        }, {}),
      };

      return players;
    },
    {},
  );
}

function deriveHeldAnimalCard(
  animalCard: Extract<AnimalCardType, { type: "held" }>,
  privateGameState: ImmutablePrivateGameState,
): NonNullable<PlayerGameState["playerCards"][number]> {
  return {
    ...animalCard,
    scores: animalCard.scores.map((score, index) => ({
      points: score,
      cubeId:
        privateGameState.animalCubes.find(
          (cube) =>
            cube.type === "card" &&
            cube.position.cardId === animalCard.id &&
            cube.position.index === index,
        )?.id ?? null,
    })),
  };
}

function emptyAnimalCardSpread(): DerivedPublicGameState["animalCardSpread"] {
  return [null, null, null, null, null];
}

function emptyCentralBoard(): DerivedPublicGameState["centralBoard"] {
  return [
    [null, null, null],
    [null, null, null],
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
}
