import { ViewTransition } from "react";
import AnimalCubeIcon from "../assets/animalCube.webp";
import SpiritCubeIcon from "../assets/spiritCube.webp";

interface CubeProps extends React.ComponentProps<"img"> {
  id: string;
  type: "animal" | "spirit";
}
export function Cube({ id, type, ...props }: CubeProps) {
  const icon = type === "animal" ? AnimalCubeIcon : SpiritCubeIcon;
  return (
    <ViewTransition name={id}>
      <img src={icon} alt={`${type} cube`} {...props} />
    </ViewTransition>
  );
}
