import { useEffect, useState } from "react";
import { Token } from "../components/Token";
import type { TokenType } from "../sharedTypes";

interface PlacingTokenProps {
  token: TokenType | null;
}
export function PlacingToken({ token }: PlacingTokenProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    document.body.style.cursor = token ? "none" : "default";
    return () => {
      document.body.style.cursor = "default";
    };
  }, [token]);

  if (!token) return;

  return (
    <Token
      token={token}
      className="-translate-1/2"
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: 40,
        height: 40,
        pointerEvents: "none",
      }}
    />
  );
}
