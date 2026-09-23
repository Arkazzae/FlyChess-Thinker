import { flyAvatarUrl } from "@/ai/bots/avatars";
import type { FlyLevelId } from "@/ai/bots/levels";

/** Reference-based DROSO-1 portraits, shared across every opponent surface. */
export function FlyMascot({ thinking = false, still = false, variant = "thinker", className = "" }: {
  thinking?: boolean;
  still?: boolean;
  variant?: FlyLevelId;
  className?: string;
}) {
  return (
    <span className={`fly-mascot fly-mascot--portrait${thinking ? " is-thinking" : ""}${still ? " fly-still" : ""}${className ? ` ${className}` : ""}`}>
      <img src={flyAvatarUrl(variant)} width={512} height={512} alt="" decoding="async" draggable={false} />
    </span>
  );
}
