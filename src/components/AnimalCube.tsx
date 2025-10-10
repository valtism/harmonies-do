import { ViewTransition } from "react";
import AnimalCubeIcon from ".../assets/animalCube.webp";

interface AnimalCubeProps extends React.ComponentProps<"img"> {
  id: string;
}
export function AnimalCube({ id, ...props }: AnimalCubeProps) {
  return (
    <ViewTransition name={id}>
      <img src={AnimalCubeIcon} alt="animal cube" {...props} />
    </ViewTransition>
  );
}
