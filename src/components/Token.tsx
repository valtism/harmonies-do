import { ViewTransition } from "react";
import TokenBlue from ".../assets/tokens/tokenBlue.webp";
import TokenBrown from ".../assets/tokens/tokenBrown.webp";
import TokenGray from ".../assets/tokens/tokenGray.webp";
import TokenGreen from ".../assets/tokens/tokenGreen.webp";
import TokenRed from ".../assets/tokens/tokenRed.webp";
import TokenYellow from ".../assets/tokens/tokenYellow.webp";
import type { TokenType } from "../sharedTypes";

const tokenImage = {
  blue: TokenBlue,
  brown: TokenBrown,
  gray: TokenGray,
  green: TokenGreen,
  red: TokenRed,
  yellow: TokenYellow,
};

interface TokenProps extends React.ComponentProps<"img"> {
  token: TokenType;
}
export function Token({ token, ...props }: TokenProps) {
  return (
    <ViewTransition name={token.id}>
      <img
        alt={`${token.color} token`}
        {...props}
        src={tokenImage[token.color]}
      />
    </ViewTransition>
  );
}
