import alligatorCard from "../assets/animalCards/alligator.webp";
import alpacaCard from "../assets/animalCards/alpaca.webp";
import arcticFoxCard from "../assets/animalCards/arctic_fox.webp";
import batCard from "../assets/animalCards/bat.webp";
import bearCard from "../assets/animalCards/bear.webp";
import beeCard from "../assets/animalCards/bee.webp";
import boarCard from "../assets/animalCards/boar.webp";
import crowCard from "../assets/animalCards/crow.webp";
import duckCard from "../assets/animalCards/duck.webp";
import falconCard from "../assets/animalCards/falcon.webp";
import fennicFoxCard from "../assets/animalCards/fennic_fox.webp";
import fishCard from "../assets/animalCards/fish.webp";
import flamingoCard from "../assets/animalCards/flamingo.webp";
import frogCard from "../assets/animalCards/frog.webp";
import headgehogCard from "../assets/animalCards/headgehog.webp";
import kingfisherCard from "../assets/animalCards/kingfisher.webp";
import koalaCard from "../assets/animalCards/koala.webp";
import ladybugCard from "../assets/animalCards/ladybug.webp";
import lizardCard from "../assets/animalCards/lizard.webp";
import macaqueCard from "../assets/animalCards/macaque.webp";
import macawCard from "../assets/animalCards/macaw.webp";
import meerkatCard from "../assets/animalCards/meerkat.webp";
import otterCard from "../assets/animalCards/otter.webp";
import pantherCard from "../assets/animalCards/panther.webp";
import peacockCard from "../assets/animalCards/peacock.webp";
import penguinCard from "../assets/animalCards/penguin.webp";
import rabbitCard from "../assets/animalCards/rabbit.webp";
import raccoonCard from "../assets/animalCards/raccoon.webp";
import rayCard from "../assets/animalCards/ray.webp";
import shrewCard from "../assets/animalCards/shrew.webp";
import squirrelCard from "../assets/animalCards/squirrel.webp";
import wolfCard from "../assets/animalCards/wolf.webp";

export const animalCardImages = {
  alligator: alligatorCard,
  alpaca: alpacaCard,
  arctic_fox: arcticFoxCard,
  bat: batCard,
  bear: bearCard,
  bee: beeCard,
  boar: boarCard,
  crow: crowCard,
  duck: duckCard,
  falcon: falconCard,
  fennic_fox: fennicFoxCard,
  fish: fishCard,
  flamingo: flamingoCard,
  frog: frogCard,
  headgehog: headgehogCard,
  kingfisher: kingfisherCard,
  koala: koalaCard,
  ladybug: ladybugCard,
  lizard: lizardCard,
  macaque: macaqueCard,
  macaw: macawCard,
  meerkat: meerkatCard,
  otter: otterCard,
  panther: pantherCard,
  peacock: peacockCard,
  penguin: penguinCard,
  rabbit: rabbitCard,
  raccoon: raccoonCard,
  ray: rayCard,
  shrew: shrewCard,
  squirrel: squirrelCard,
  wolf: wolfCard,
} as const satisfies Record<string, string>;
