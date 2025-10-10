import { spiritCards } from "../constants/spiritCards";
import type { SpiritCardId } from "../sharedTypes";

interface SpiritCardProps {
  spiritCardId: SpiritCardId;
}
export function SpiritCard({ spiritCardId }: SpiritCardProps) {
  const spiritCard = spiritCards[spiritCardId];

  return <img src={spiritCard.imageSrc} alt={spiritCardId} />;
}
