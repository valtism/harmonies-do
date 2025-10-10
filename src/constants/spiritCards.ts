import butterflySpiritCard from ".../assets/spiritCards/butterfly_spirit.webp";
import catSpiritCard from ".../assets/spiritCards/cat_spirit.webp";
import craneSpiritCard from ".../assets/spiritCards/crane_spirit.webp";
import deerSpiritCard from ".../assets/spiritCards/deer_spirit.webp";
import dragonflySpiritCard from ".../assets/spiritCards/dragonfly_spirit.webp";
import lionSpiritCard from ".../assets/spiritCards/lion_spirit.webp";
import marmotSpiritCard from ".../assets/spiritCards/marmot_spirit.webp";
import owlSpiritCard from ".../assets/spiritCards/owl_spirit.webp";
import ramSpiritCard from ".../assets/spiritCards/ram_spirit.webp";
import tortiseSpiritCard from ".../assets/spiritCards/tortise_spirit.webp";
import type { SpiritCard } from "../sharedTypes";

export const spiritCards = {
  butterflySpirit: {
    imageSrc: butterflySpiritCard,
  },
  catSpirit: {
    imageSrc: catSpiritCard,
  },
  craneSpirit: {
    imageSrc: craneSpiritCard,
  },
  deerSpirit: {
    imageSrc: deerSpiritCard,
  },
  dragonflySpirit: {
    imageSrc: dragonflySpiritCard,
  },
  lionSpirit: {
    imageSrc: lionSpiritCard,
  },
  marmotSpirit: {
    imageSrc: marmotSpiritCard,
  },
  owlSpirit: {
    imageSrc: owlSpiritCard,
  },
  ramSpirit: {
    imageSrc: ramSpiritCard,
  },
  tortiseSpirit: {
    imageSrc: tortiseSpiritCard,
  },
} as const satisfies Record<string, SpiritCard>;
