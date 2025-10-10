import { z } from "zod/v4";
import type { animalCardImages } from "./constants/animalCardImages";
import type { spiritCards } from "./constants/spiritCards";

export type DeepImmutable<T> =
  T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepImmutable<K>, DeepImmutable<V>>
    : T extends Set<infer S>
      ? ReadonlySet<DeepImmutable<S>>
      : T extends object
        ? { readonly [K in keyof T]: DeepImmutable<T[K]> }
        : T;

export type ColorType = "blue" | "gray" | "brown" | "green" | "yellow" | "red";

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type User = z.infer<typeof userSchema>;

export type Coords = { q: number; r: number };

type BaseToken = {
  id: string;
  color: ColorType;
};
export type TokenType =
  | (BaseToken & {
      type: "pouch";
    })
  | (BaseToken & {
      type: "centralBoard";
      position: { zone: number; place: number };
    })
  | (BaseToken & {
      type: "taken";
      position: { player: string; place: number };
    })
  | (BaseToken & {
      type: "playerBoard";
      position: {
        player: string;
        place: { coords: string; stackPostion: number };
      };
    });

export type AnimalCardType =
  | (BaseAnimalCard & {
      type: "deck";
    })
  | (BaseAnimalCard & {
      type: "spread";
      position: { index: number };
    })
  | (BaseAnimalCard & {
      type: "playerBoard";
      position: { playerId: string; index: number };
    })
  | (BaseAnimalCard & {
      type: "playerCompleted";
      position: { playerId: string };
    });

export type DerivedAnimalCardType = Omit<AnimalCardType, "scores"> & {
  scores: {
    points: number;
    cubeId: string | null;
  }[];
};

export type AnimalCubeType =
  | {
      id: string;
      type: "pouch";
    }
  | {
      id: string;
      type: "card";
      position: { cardId: AnimalCardId; index: number };
    }
  | {
      id: string;
      type: "playerBoard";
      position: { coords: string };
    };

export interface Place {
  tokens: TokenType[];
  cube: "animal" | "spirit" | null;
}

export interface PrivateGameState {
  tokens: TokenType[];
  animalCards: AnimalCardType[];
  animalCubes: AnimalCubeType[];
  boardType: "A" | "B";
  playerIdList: string[];
  currentPlayerId: string | null;
}

export type ImmutablePrivateGameState = DeepImmutable<PrivateGameState>;

export interface PlayerState {
  id: string;
  name: string;
  takenTokens: [TokenType | null, TokenType | null, TokenType | null];
  animalCards: [
    DerivedAnimalCardType | null,
    DerivedAnimalCardType | null,
    DerivedAnimalCardType | null,
    DerivedAnimalCardType | null,
  ];
  completedAnimalCards: AnimalCardType[];
  board: Record<string, Place>;
}

export interface DerivedPublicGameState {
  grid: [number, number][];
  currentPlayerId: string;
  players: Record<string, PlayerState>;
  animalCardSpread: [
    AnimalCardType | null,
    AnimalCardType | null,
    AnimalCardType | null,
    AnimalCardType | null,
    AnimalCardType | null,
  ];
  centralBoard: [
    [TokenType | null, TokenType | null, TokenType | null],
    [TokenType | null, TokenType | null, TokenType | null],
    [TokenType | null, TokenType | null, TokenType | null],
    [TokenType | null, TokenType | null, TokenType | null],
    [TokenType | null, TokenType | null, TokenType | null],
  ];
}

const startGameActionSchema = z.object({
  type: z.literal("startGame"),
});

const takeTokensSchema = z.object({
  type: z.literal("takeTokens"),
  payload: z.number(),
});

const placeTokenSchema = z.object({
  type: z.literal("placeToken"),
  payload: z.object({
    tokenId: z.string(),
    coords: z.string(),
  }),
});

const takeAnimalCard = z.object({
  type: z.literal("takeAnimalCard"),
  payload: z.object({
    index: z.number(),
  }),
});

const testSchema = z.object({
  type: z.literal("test"),
  payload: z.object({
    animalCardId: z.string(),
    hex: z.object({
      q: z.number(),
      r: z.number(),
    }),
  }),
});

const endTurnSchema = z.object({
  type: z.literal("endTurn"),
});

const undoSchema = z.object({
  type: z.literal("undo"),
});

export const actionSchema = z.union([
  startGameActionSchema,
  takeTokensSchema,
  placeTokenSchema,
  takeAnimalCard,
  testSchema,
  endTurnSchema,
  undoSchema,
]);

export type ActionType = z.infer<typeof actionSchema>;

type ActionHistory = ActionType & {
  // playerId: string;
  canUndo: boolean;
};

export interface History {
  action: ActionHistory;
  gameState: ImmutablePrivateGameState;
}

export type PlayersById = Record<string, User>;

export type Broadcast =
  | {
      type: "players";
      players: PlayersById;
    }
  | {
      type: "gameState";
      gameState: DerivedPublicGameState;
    }
  | {
      type: "error";
      playerId: string;
      message: string;
    };

export type CanPerformAction = { ok: true } | { ok: false; message: string };

export type BaseAnimalCard = {
  id: AnimalCardId;
  scores: readonly number[];
  shape: readonly Shape[];
};

export type SpiritCard = {
  imageSrc: string;
  // shape: Shape[];
};

type Shape = {
  coordinates: { q: number; r: number };
  topToken: {
    color: ColorType;
    index: number;
  };
};

export type AnimalCardId = keyof typeof animalCardImages;

export type SpiritCardId = keyof typeof spiritCards;
