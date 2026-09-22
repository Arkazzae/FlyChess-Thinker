import { useMemo } from "react";
import { useFlyStore } from "@/state/fly";
import { useGameStore } from "@/state/game";
import { useTranslation } from "@/i18n";
import { encodeFen } from "@/ai/fly/encoding";

const GLYPHS = ["♟", "♞", "♝", "♜", "♛", "♚"];
const CHANNELS = 14;

/** The 64 × 14 stimulus the fly receives: its pieces, the opponent's, and both attack maps (mover frame). */
export function FlyRetina() {
  const thought = useFlyStore((s) => s.thought);
  const fen = useGameStore((s) => s.fen);
  const { t } = useTranslation();
  // Before the fly has thought about anything, show the board on screen encoded the same way,
  // as the stimulus its eyes would get.
  const preview = useMemo(() => (thought ? null : encodeFen(fen).squares), [thought, fen]);
  const retina = thought?.retina ?? preview!;
  return (
    <div className="retina-wrap">
      <div className="retina" role="img" aria-label={t("retina.aria")}>
        {Array.from({ length: 64 }, (_, cell) => {
          // Row 0 on screen is the far rank of the side to move.
          const square = (7 - Math.floor(cell / 8)) * 8 + (cell % 8);
          const base = square * CHANNELS;
          let own = -1;
          let theirs = -1;
          for (let p = 0; p < 6; p++) {
            if (retina[base + p]) own = p;
            if (retina[base + 6 + p]) theirs = p;
          }
          const ownAttack = retina[base + 12] > 0;
          const theirAttack = retina[base + 13] > 0;
          const dark = (Math.floor(cell / 8) + cell) % 2 === 1;
          return (
            <i key={cell} className={[dark ? "d" : "l", ownAttack && "oa", theirAttack && "ta", own >= 0 && "own", theirs >= 0 && "theirs"].filter(Boolean).join(" ")}>
              {own >= 0 ? GLYPHS[own] : theirs >= 0 ? GLYPHS[theirs] : ""}
            </i>
          );
        })}
      </div>
      <ul className="retina__legend">
        <li><i className="own" />{t("retina.own")}</li>
        <li><i className="theirs" />{t("retina.theirs")}</li>
        <li><i className="oa" />{t("retina.ownAttack")}</li>
        <li><i className="ta" />{t("retina.theirAttack")}</li>
      </ul>
      <p className="retina__note">{thought ? t("retina.note") : t("retina.preview")}</p>
    </div>
  );
}
