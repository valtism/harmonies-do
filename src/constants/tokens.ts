import type { ColorType } from "../sharedTypes";

export const allTokens: ColorType[] = [
  ...Array.from({ length: 23 }).map(() => "blue" as const),
  ...Array.from({ length: 23 }).map(() => "gray" as const),
  ...Array.from({ length: 21 }).map(() => "brown" as const),
  ...Array.from({ length: 19 }).map(() => "green" as const),
  ...Array.from({ length: 19 }).map(() => "yellow" as const),
  ...Array.from({ length: 15 }).map(() => "red" as const),
];
