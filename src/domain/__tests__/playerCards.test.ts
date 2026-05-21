import { describe, expect, test } from "bun:test";
import { Grid, Hex } from "honeycomb-grid";
import type {
  AnimalCardType,
  AnimalCubeType,
  DerivedAnimalCardType,
  ImmutablePrivateGameState,
} from "../../sharedTypes";
import { createPublicPersonalBoardView } from "../personalBoard";
import {
  canPlaceCube,
  getCompletedCards,
  getHeldCardAtIndex,
  getHeldCards,
  getNextFreeHeldIndex,
  placeCube,
  replenishAnimalCardSpread,
  takeAnimalCard,
} from "../playerCards";

function baseAnimalCard(
  id: AnimalCardType["id"],
  scores: number[],
): Omit<AnimalCardType, "type" | "position"> {
  return {
    id,
    scores,
    pattern: [
      { coordinates: { q: 0, r: 0 }, topColor: "blue", stackHeight: 1 },
      { coordinates: { q: 1, r: 0 }, topColor: "green", stackHeight: 1 },
    ],
  };
}

function animalCard(
  id: AnimalCardType["id"],
  scores: number[],
  type: "deck" | "spread" | "held" | "completed",
  position?: { index?: number; playerId?: string },
): AnimalCardType {
  const base = baseAnimalCard(id, scores);
  if (type === "deck") {
    return { ...base, type: "deck" };
  }
  if (type === "spread") {
    return { ...base, type: "spread", position: { index: position?.index ?? 0 } };
  }
  if (type === "held") {
    return {
      ...base,
      type: "held",
      position: { playerId: position?.playerId ?? "player-1", index: position?.index ?? 0 },
    };
  }
  return {
    ...base,
    type: "completed",
    position: { playerId: position?.playerId ?? "player-1" },
  };
}

function cube(
  id: string,
  type: "supply" | "card" | "personalBoard",
  position?: { cardId?: AnimalCardType["id"]; index?: number; coords?: string },
): AnimalCubeType {
  if (type === "supply") {
    return { id, type: "supply" };
  }
  if (type === "card") {
    return {
      id,
      type: "card",
      position: { cardId: position?.cardId ?? "frog", index: position?.index ?? 0 },
    };
  }
  return {
    id,
    type: "personalBoard",
    position: { coords: position?.coords ?? "(0,0)" },
  };
}

function gameState(overrides: Partial<ImmutablePrivateGameState> = {}): ImmutablePrivateGameState {
  return {
    personalBoardSide: "A",
    playerIdList: ["player-1", "player-2"],
    currentPlayerId: "player-1",
    tokens: [],
    animalCards: [],
    animalCubes: [],
    ...overrides,
  };
}

describe("playerCards", () => {
  describe("takeAnimalCard", () => {
    test("moves card from spread to held and allocates cubes", () => {
      const state = gameState({
        animalCards: [
          animalCard("frog", [2, 4, 6, 10, 15], "spread", { index: 2 }),
          animalCard("duck", [2, 4, 8, 13], "deck"),
        ],
        animalCubes: [
          cube("cube-1", "supply"),
          cube("cube-2", "supply"),
          cube("cube-3", "supply"),
          cube("cube-4", "supply"),
          cube("cube-5", "supply"),
        ],
      });

      const result = takeAnimalCard({
        privateGameState: state,
        playerId: "player-1",
        spreadIndex: 2,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.animalCards.find((c) => c.id === "frog")?.type).toBe("held");
        expect(result.value.animalCubes.filter((c) => c.type === "card")).toHaveLength(5);
      }
    });

    test("rejects invalid spread index", () => {
      const state = gameState({
        animalCards: [animalCard("frog", [2, 4], "spread", { index: 0 })],
      });

      const result = takeAnimalCard({
        privateGameState: state,
        playerId: "player-1",
        spreadIndex: 7,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toBe("Invalid card index");
      }
    });

    test("rejects when all held slots are full", () => {
      const state = gameState({
        animalCards: [
          animalCard("frog", [2, 4], "held", { index: 0, playerId: "player-1" }),
          animalCard("duck", [2, 4], "held", { index: 1, playerId: "player-1" }),
          animalCard("bear", [2, 4], "held", { index: 2, playerId: "player-1" }),
          animalCard("wolf", [2, 4], "held", { index: 3, playerId: "player-1" }),
          animalCard("otter", [2, 4], "spread", { index: 0 }),
        ],
      });

      const result = takeAnimalCard({
        privateGameState: state,
        playerId: "player-1",
        spreadIndex: 0,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toBe("All animal card slots are full");
      }
    });

    test("uses first available held slot", () => {
      const state = gameState({
        animalCards: [
          animalCard("frog", [2, 4], "held", { index: 0, playerId: "player-1" }),
          animalCard("duck", [2, 4], "held", { index: 2, playerId: "player-1" }),
          animalCard("bear", [2, 4], "spread", { index: 1 }),
        ],
        animalCubes: [cube("cube-1", "supply"), cube("cube-2", "supply")],
      });

      const result = takeAnimalCard({
        privateGameState: state,
        playerId: "player-1",
        spreadIndex: 1,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const heldCard = result.value.animalCards.find((c) => c.id === "bear");
        expect(heldCard?.type).toBe("held");
        if (heldCard?.type === "held") {
          expect(heldCard.position.index).toBe(1);
        }
      }
    });
  });

  describe("placeCube", () => {
    test("moves cube from card to personalBoard", () => {
      const state = gameState({
        animalCards: [
          animalCard("frog", [2, 4, 6], "held", { index: 0, playerId: "player-1" }),
        ],
        animalCubes: [
          cube("cube-1", "card", { cardId: "frog", index: 2 }),
          cube("cube-2", "card", { cardId: "frog", index: 1 }),
          cube("cube-3", "card", { cardId: "frog", index: 0 }),
        ],
      });

      const result = placeCube({
        privateGameState: state,
        animalCardId: "frog",
        cubeId: "cube-1",
        coords: "(1,1)",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const placedCube = result.value.animalCubes.find((c) => c.id === "cube-1");
        expect(placedCube?.type).toBe("personalBoard");
        if (placedCube?.type === "personalBoard") {
          expect(placedCube.position.coords).toBe("(1,1)");
        }
      }
    });

    test("completes card when last cube is placed", () => {
      const state = gameState({
        animalCards: [
          animalCard("frog", [2, 4], "held", { index: 1, playerId: "player-1" }),
          animalCard("bear", [5, 11], "held", { index: 2, playerId: "player-1" }),
        ],
        animalCubes: [
          cube("cube-1", "card", { cardId: "frog", index: 0 }),
        ],
      });

      const result = placeCube({
        privateGameState: state,
        animalCardId: "frog",
        cubeId: "cube-1",
        coords: "(2,2)",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const frogCard = result.value.animalCards.find((c) => c.id === "frog");
        expect(frogCard?.type).toBe("completed");

        const bearCard = result.value.animalCards.find((c) => c.id === "bear");
        expect(bearCard?.type).toBe("held");
        if (bearCard?.type === "held") {
          expect(bearCard.position.index).toBe(1);
        }
      }
    });

    test("rejects if cube does not belong to the card", () => {
      const state = gameState({
        animalCards: [
          animalCard("frog", [2, 4], "held", { index: 0, playerId: "player-1" }),
        ],
        animalCubes: [
          cube("cube-1", "card", { cardId: "duck", index: 0 }),
        ],
      });

      const result = placeCube({
        privateGameState: state,
        animalCardId: "frog",
        cubeId: "cube-1",
        coords: "(0,0)",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toBe("Cube does not belong to this animal card");
      }
    });
  });

  describe("replenishAnimalCardSpread", () => {
    test("fills empty spread slots from deck", () => {
      const cards = [
        animalCard("frog", [2, 4], "spread", { index: 0 }),
        animalCard("duck", [2, 4], "spread", { index: 2 }),
        animalCard("bear", [5, 10], "deck"),
        animalCard("wolf", [5, 10], "deck"),
      ];

      const result = replenishAnimalCardSpread(cards);

      const spreadCards = result.filter((c) => c.type === "spread");
      expect(spreadCards).toHaveLength(4);
      expect(spreadCards.find((c) => c.id === "bear")?.type).toBe("spread");
      expect(spreadCards.find((c) => c.id === "wolf")?.type).toBe("spread");
    });

    test("does nothing when spread is full", () => {
      const cards = [
        animalCard("frog", [2, 4], "spread", { index: 0 }),
        animalCard("duck", [2, 4], "spread", { index: 1 }),
        animalCard("bear", [2, 4], "spread", { index: 2 }),
        animalCard("wolf", [2, 4], "spread", { index: 3 }),
        animalCard("otter", [2, 4], "spread", { index: 4 }),
        animalCard("panther", [5, 10], "deck"),
      ];

      const result = replenishAnimalCardSpread(cards);

      expect(result).toEqual(cards);
    });
  });

  describe("canPlaceCube", () => {
    test("returns false when animalCard is null", () => {
      const result = canPlaceCube({
        animalCard: null,
        grid: undefined as unknown as Grid<Hex>,
        hex: { q: 0, r: 0 },
        personalBoard: createPublicPersonalBoardView({
          board: {},
          grid: [],
        }),
      });

      expect(result).toBe(false);
    });

    test("returns false when hex already has a cube", () => {
      const animalCard = {
        id: "frog" as AnimalCardType["id"],
        scores: [
          { points: 2, cubeId: null },
          { points: 4, cubeId: null },
        ],
        pattern: [
          { coordinates: { q: 0, r: 0 }, topColor: "blue", stackHeight: 1 },
        ],
        type: "held" as const,
        position: { playerId: "player-1", index: 0 },
      } as DerivedAnimalCardType;

      const result = canPlaceCube({
        animalCard,
        grid: undefined as unknown as Grid<Hex>,
        hex: { q: 0, r: 0 },
        personalBoard: createPublicPersonalBoardView({
          board: {
            "(0,0)": { cube: "animal", cubeId: "cube-1", tokens: [] },
          },
          grid: [[0, 0]],
        }),
      });

      expect(result).toBe(false);
    });
  });

  describe("getHeldCards", () => {
    test("returns held cards sorted by index", () => {
      const cards = [
        animalCard("duck", [2, 4], "held", { index: 2, playerId: "player-1" }),
        animalCard("frog", [2, 4], "held", { index: 0, playerId: "player-1" }),
        animalCard("bear", [2, 4], "held", { index: 1, playerId: "player-1" }),
        animalCard("wolf", [2, 4], "spread", { index: 0 }),
      ];

      const result = getHeldCards(cards, "player-1");

      expect(result).toHaveLength(3);
      expect(result[0]?.id).toBe("frog");
      expect(result[1]?.id).toBe("bear");
      expect(result[2]?.id).toBe("duck");
    });
  });

  describe("getCompletedCards", () => {
    test("returns only completed cards for the player", () => {
      const cards = [
        animalCard("frog", [2, 4], "completed", { playerId: "player-1" }),
        animalCard("duck", [2, 4], "completed", { playerId: "player-2" }),
        animalCard("bear", [2, 4], "held", { index: 0, playerId: "player-1" }),
      ];

      const result = getCompletedCards(cards, "player-1");

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("frog");
    });
  });

  describe("getNextFreeHeldIndex", () => {
    test("returns first available index", () => {
      const cards = [
        animalCard("frog", [2, 4], "held", { index: 0, playerId: "player-1" }),
        animalCard("duck", [2, 4], "held", { index: 2, playerId: "player-1" }),
      ];

      const result = getNextFreeHeldIndex(cards, "player-1");

      expect(result).toBe(1);
    });

    test("returns null when all slots are full", () => {
      const cards = [
        animalCard("frog", [2, 4], "held", { index: 0, playerId: "player-1" }),
        animalCard("duck", [2, 4], "held", { index: 1, playerId: "player-1" }),
        animalCard("bear", [2, 4], "held", { index: 2, playerId: "player-1" }),
        animalCard("wolf", [2, 4], "held", { index: 3, playerId: "player-1" }),
      ];

      const result = getNextFreeHeldIndex(cards, "player-1");

      expect(result).toBeNull();
    });
  });

  describe("getHeldCardAtIndex", () => {
    test("returns card at the specified index", () => {
      const cards = [
        animalCard("frog", [2, 4], "held", { index: 0, playerId: "player-1" }),
        animalCard("duck", [2, 4], "held", { index: 2, playerId: "player-1" }),
      ];

      const result = getHeldCardAtIndex(cards, "player-1", 2);

      expect(result?.id).toBe("duck");
    });

    test("returns undefined when no card at index", () => {
      const cards = [
        animalCard("frog", [2, 4], "held", { index: 0, playerId: "player-1" }),
      ];

      const result = getHeldCardAtIndex(cards, "player-1", 3);

      expect(result).toBeUndefined();
    });
  });
});
