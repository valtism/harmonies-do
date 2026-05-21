import clsx from "clsx";
import { defineHex, Grid, Orientation } from "honeycomb-grid";
import { startTransition, useEffect, useRef, useState } from "react";
import BoardSideA from "../assets/boardSideA.webp";
import { animalCardImages } from "../constants/animalCardImages";
import { AnimalCard } from "../components/AnimalCard";
import { PlacingToken } from "../components/PlacingToken";
import { Token } from "../components/Token";
import { Cube } from "../components/Cube";
import { createPublicPersonalBoardView } from "../domain/personalBoard";
import type {
  ActionType,
  DerivedPublicGameState,
  TokenType,
} from "../sharedTypes";
import { canPlaceCube } from "../domain/playerCards";
import { tokenPlacable } from "../util/tokenPlaceable";

const debug = true;

interface PersonalBoardProps {
  playerId: string;
  gameState: DerivedPublicGameState;
  sendAction: (action: ActionType) => void;
}
export function PersonalBoard({
  playerId,
  gameState,
  sendAction,
}: PersonalBoardProps) {
  const player = gameState.players[playerId];
  if (!player) throw new Error("Player not found");

  const [selectedAnimalCardId, setSelectedAnimalCardId] = useState<
    string | null
  >(null);

  const [placingToken, setPlacingToken] = useState<TokenType | null>(null);
  // Unset placingToken only once server has placed the token on the board
  // Need to do this to make ViewTransition work smoothly.
  if (
    Object.values(player.board).some(({ tokens }) =>
      tokens.some((token) => token.id === placingToken?.id),
    )
  ) {
    setPlacingToken(null);
  }

  useEffect(() => {
    const handleKey = ({ key }: KeyboardEvent) => {
      if (key === "Escape" && placingToken) {
        setPlacingToken(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [placingToken]);

  const [width, setWidth] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const divRef = ref.current;
    const updateWidth = () => {
      const rect = divRef.getBoundingClientRect();
      setWidth(rect.width);
    };
    updateWidth();
    divRef.addEventListener("resize", updateWidth);
    return () => {
      divRef.removeEventListener("resize", updateWidth);
    };
  }, []);

  const Hex = defineHex({
    dimensions: width / 14,
    orientation: Orientation.FLAT,
    origin: "topLeft",
  });

  const grid = new Grid(Hex, gameState.grid);
  const personalBoard = createPublicPersonalBoardView({
    board: player.board,
    grid,
  });

  return (
    <div>
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold text-white">{player.name}</div>
          {player.score && (
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-amber-400">
                {player.score.total}
              </div>
              <div className="text-sm text-stone-400">pts</div>
            </div>
          )}
        </div>
        {player.score && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-400">
            <span className="text-green-400">Trees: {player.score.trees}</span>
            <span className="text-stone-300">Mountains: {player.score.mountains}</span>
            <span className="text-yellow-400">Fields: {player.score.fields}</span>
            <span className="text-orange-400">Buildings: {player.score.buildings}</span>
            <span className="text-blue-400">Water: {player.score.water}</span>
            <span className="text-purple-400">Animals: {player.score.animals}</span>
          </div>
        )}
      </div>
      {debug && (
        <div className="flex">
          <div>Animal Card Id:</div>
          <div>{selectedAnimalCardId}</div>
        </div>
      )}
      <div className="my-2 flex gap-2">
        {player.playerCards.map((card, index) => (
          <div
            key={card?.id || index}
            className="flex-1"
            style={{ aspectRatio: "140/240" }}
          >
            {card ? (
              <button
                onClick={() => {
                  if (selectedAnimalCardId === card.id) {
                    setSelectedAnimalCardId(null);
                  } else {
                    setSelectedAnimalCardId(card.id);
                  }
                }}
                className={clsx(
                  selectedAnimalCardId === card.id &&
                    "rounded ring-3 ring-green-500",
                )}
              >
                <AnimalCard card={card} />
              </button>
            ) : (
              <div className="h-full rounded-lg border border-dotted" />
            )}
          </div>
        ))}
      </div>
      <div ref={ref} className="relative inline-block">
        <img src={BoardSideA} alt="personal board" />

        <div className="absolute inset-0 rotate-[0.5deg]">
          {Array.from(grid).map((hex) => {
            const key = hex.toString();
            const tile = player.board[key];
            const tokens = tile?.tokens || [];
            const isTokenPlacable = tokenPlacable(placingToken, tokens);

            const hasMatch = canPlaceCube({
              animalCard: player.playerCards.find(
                (card) => card?.id === selectedAnimalCardId,
              ),
              grid,
              hex,
              personalBoard,
            });

            return (
              <div
                key={key}
                style={{
                  position: "absolute",
                  top: hex.r * (width / 242) + width / 182 + hex.y,
                  left: hex.q * (width / 242) + width / 7.5 + hex.x,
                  width: hex.width,
                  height: hex.height,
                }}
              >
                <div className="relative flex size-full items-end justify-center pb-4">
                  {tokens.map((token, index) => (
                    <Token
                      key={token.id}
                      token={token}
                      style={{
                        position: "absolute",
                        width: "50%",
                        height: "50%",
                        translate: `0 -${index * 30}%`,
                      }}
                    />
                  ))}
                  {tile?.cube && tile.cubeId && (
                    <Cube
                      id={tile.cubeId}
                      type={tile.cube}
                      style={{
                        position: "absolute",
                        height: "40%",
                        translate: `0 -${tokens.length * 30}%`,
                      }}
                    />
                  )}
                  {debug && (
                    <div className="pointer-events-none z-10 font-black text-white text-shadow-lg">
                      {key}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      if (selectedAnimalCardId && hasMatch) {
                        sendAction({
                          type: "placeCube",
                          payload: {
                            animalCardId: selectedAnimalCardId,
                            hex: hex,
                          },
                        });
                        setSelectedAnimalCardId(null);
                      }

                      if (!placingToken || !isTokenPlacable) return;
                      startTransition(() => {
                        sendAction({
                          type: "placeToken",
                          payload: {
                            coords: key,
                            tokenId: placingToken.id,
                          },
                        });
                      });
                    }}
                    className={clsx(
                      "hexagon absolute inset-0 cursor-[unset] hover:bg-black/20",
                      isTokenPlacable && "bg-white/20",
                    )}
                  />
                  {hasMatch && (
                    <div className="pointer-events-none absolute inset-0 size-full bg-green-500/20" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div
          className="absolute flex flex-col gap-2 bg-black/20"
          style={{
            width: "7%",
            height: "20%",
            left: "84%",
            top: "10%",
          }}
        >
          {player.takenTokens.map((token, index) => {
            if (!token) return;
            if (token.id === placingToken?.id) return null;
            return (
              <button
                key={token.id}
                onClick={() => setPlacingToken(token)}
                style={{
                  position: "absolute",
                  top: `${index * (100 / 3)}%`,
                }}
              >
                <Token token={token} />
              </button>
            );
          })}
        </div>
        <PlacingToken token={placingToken} />
      </div>

      <div className="mt-4">
        <div className="mb-1 text-sm font-semibold text-stone-400">
          Completed
        </div>
        <div className="flex gap-2">
          {player.completedAnimalCards.map((card) => (
            <div
              key={card.id}
              className="flex-1"
              style={{ aspectRatio: "140/240" }}
            >
              <img
                src={animalCardImages[card.id]}
                alt={card.id}
                className="size-full rounded-lg"
              />
            </div>
          ))}
          {player.completedAnimalCards.length === 0 && (
            <div
              className="flex-1 rounded-lg border border-dotted border-stone-600"
              style={{ aspectRatio: "140/240" }}
            />
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 text-sm font-semibold text-stone-400">
          Spirit Cards
        </div>
        <div className="flex gap-2">
          <div
            className="flex-1 rounded-lg border border-dotted border-stone-600"
            style={{ aspectRatio: "140/240" }}
          />
        </div>
      </div>
    </div>
  );
}
