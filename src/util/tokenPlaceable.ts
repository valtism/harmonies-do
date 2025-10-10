import type { TokenType } from "../sharedTypes";

export function tokenPlacable(
  token: TokenType | null,
  stack: TokenType[],
): boolean {
  if (!token) return false;
  const topToken = stack.at(-1);

  if (!topToken) {
    return true;
  }

  if (stack.length === 1) {
    switch (token.color) {
      case "blue":
      case "yellow":
        return false;
      case "gray":
        return topToken.color === "gray";
      case "brown":
        return topToken.color === "brown";
      case "green":
        return topToken.color === "brown";
      case "red":
        return ["gray", "brown", "red"].includes(topToken.color);
      default:
        token.color satisfies never;
        return false;
    }
  }

  if (stack.length === 2) {
    switch (token.color) {
      case "blue":
      case "yellow":
      case "brown":
      case "red":
        return false;
      case "gray":
        return topToken.color === "gray";
      case "green":
        return topToken.color === "brown";
      default:
        token.color satisfies never;
        return false;
    }
  }

  return false;
}
