<script setup>
import { computed as vueComputed, markRaw } from 'vue';
import {
  DoorOpen,
  ArrowUp,
  Footprints,
  CircleArrowUp,
  Bath,
  Landmark,
  Info,
  UtensilsCrossed,
  Coffee,
  Cake,
  ShoppingBag,
  Shirt,
  Film,
  Gamepad2,
  Star,
  ParkingCircle,
  CreditCard,
  Music,
  Sparkles
} from 'lucide-vue-next';

const props = defineProps({
  type: { type: String, required: true },
  size: { type: Number, default: 16 },
  color: { type: String, default: 'currentColor' }
});

// Map POI types to Lucide icons
const iconMap = {
  entrance: DoorOpen,
  escalator: ArrowUp,
  stairs: Footprints,
  lift: CircleArrowUp,
  toilet: Bath,
  atm: CreditCard,
  info: Info,
  food: UtensilsCrossed,
  cafe: Coffee,
  dessert: Cake,
  shop: ShoppingBag,
  fashion: Shirt,
  cinema: Film,
  entertainment: Gamepad2,
  landmark: Star,
  parking: ParkingCircle,
  music: Music,
  default: Sparkles
};

const iconComponent = vueComputed(() => {
  return markRaw(iconMap[props.type] || iconMap.default);
});
</script>

<template>
  <component 
    :is="iconComponent" 
    :size="size" 
    :color="color"
    :stroke-width="2"
  />
</template>
