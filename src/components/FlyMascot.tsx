import { useId, useMemo } from "react";
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
 * The animated fly. `thinking` makes its wings buzz and its eyes glow; `still` stops the idle
 * animation (hovering, blinking) so only real thinking moves it. `variant` picks the level's look.
 */
export function FlyMascot({ thinking = false, still = false, variant = "plain", className = "" }: {
  thinking?: boolean;
  still?: boolean;
  variant?: FlyVariant;
  className?: string;
}) {
  ensureStyle();
  const id = "fly" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const markup = useMemo(() => flySvg(id, { variant }), [id, variant]);
  return <span className={`fly-mascot${thinking ? " is-thinking" : ""}${still ? " fly-still" : ""}${className ? ` ${className}` : ""}`} dangerouslySetInnerHTML={{ __html: markup }} />;
}
