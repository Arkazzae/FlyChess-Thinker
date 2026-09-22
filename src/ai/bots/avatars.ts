import type { FlyLevelId } from "./levels";

/** Generated portrait shared by the picker, game and player metadata. */
export function flyAvatarUrl(level: FlyLevelId): string {
  return `avatars/flies/${level}.webp`;
}
