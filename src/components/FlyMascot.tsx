import { useId, useMemo } from "react";
import { flyAvatarUrl } from "@/ai/bots/avatars";
import { FLY_CSS, flySvg, type FlyVariant } from "./flySvg";

let styled = false;
function ensureStyle(): void {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const style = document.createElement("style");
  style.dataset.fly = "";
  style.textContent = FLY_CSS;
  document.head.append(style);
}

/**
 * Each level has an illustrated portrait; `thinking` highlights activity. The
 * optional plain variant preserves the legacy animated SVG for standalone use.
 */
export function FlyMascot({ thinking = false, still = false, variant = "thinker", className = "" }: {
  thinking?: boolean;
  still?: boolean;
  variant?: FlyVariant;
  className?: string;
}) {
  ensureStyle();
  const id = "fly" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const markup = useMemo(() => variant === "plain" ? flySvg(id) : "", [id, variant]);
  const classes = `fly-mascot${variant !== "plain" ? " fly-mascot--portrait" : ""}${thinking ? " is-thinking" : ""}${still ? " fly-still" : ""}${className ? ` ${className}` : ""}`;
  if (variant !== "plain") {
    return (
      <span className={classes}>
        <img src={flyAvatarUrl(variant)} width={512} height={512} alt="" decoding="async" draggable={false} />
      </span>
    );
  }
  return <span className={classes} dangerouslySetInnerHTML={{ __html: markup }} />;
}
