import { FlyMascot } from "@/components/FlyMascot";
import { useTranslation } from "@/i18n";
import { useGameStore } from "@/state/game";
import { useFlyStore } from "@/state/fly";
import { useUiStore } from "@/state/ui";
import { getFlyLevel } from "@/ai/bots/levels";
import { Clock } from "@/components/Clock";
import type { PieceColor, PieceType } from "@/engine/types";

const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER: PieceType[] = ["p", "n", "b", "r", "q"];

function Captured({ pieces, color }: { pieces: PieceType[]; color: PieceColor }) {
  const groups = ORDER.map((type) => ({ type, count: pieces.filter((p) => p === type).length })).filter((g) => g.count);
  return (
    <span className="captured">
      {groups.map(({ type, count }) => (
        <span key={type} className="captured__group">
          {Array.from({ length: count }, (_, i) => <img key={i} src={`pieces/${color}${type}.png`} alt="" />)}
        </span>
      ))}
    </span>
  );
}

/** The player's flag follows the interface language. */
function Flag({ locale, title }: { locale: string; title: string }) {
  if (locale === "pl") return <span className="flag flag--pl" title={title} />;
  return (
    <svg className="flag" viewBox="0 0 60 30" role="img" aria-label={title}>
      <title>{title}</title>
      <clipPath id="flag-gb"><path d="M0 0v30h60V0z" /></clipPath>
      <g clipPath="url(#flag-gb)">
        <path d="M0 0v30h60V0z" fill="#012169" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

export function PlayerBar({ side }: { side: PieceColor }) {
  const myColor = useGameStore((s) => s.myColor);
  const phase = useGameStore((s) => s.phase);
  const captured = useGameStore((s) => s.capturedPieces);
  const chess = useGameStore((s) => s.chess);
  useGameStore((s) => s.fen);
  const levelId = useUiStore((s) => s.level);
  const uiSide = useUiStore((s) => s.side);
  const status = useFlyStore((s) => s.status);
  const level = getFlyLevel(levelId);
  const { t, locale } = useTranslation();

  // Before the game the player sits at the bottom of the board as the chosen colour.
  const mine = phase === "lobby" ? (uiSide === "b" ? side === "b" : side === "w") : side === myColor;
  const opponent: PieceColor = side === "w" ? "b" : "w";
  // Pieces this side has taken are the opponent's lost pieces.
  const taken = captured[opponent];
  let material = 0;
  for (const row of chess.board()) for (const piece of row) if (piece) material += (piece.color === side ? 1 : -1) * VALUE[piece.type as PieceType];
  const thinking = !mine && phase === "playing" && status === "thinking" && chess.turn() === side;

  return (
    <div className={`player-bar${thinking ? " is-thinking" : ""}`}>
      <div className="player-bar__avatar" style={mine ? undefined : { background: level.tint }}>
        {mine ? <img src="avatars/player.svg" alt="" /> : <FlyMascot still variant={level.id} />}
      </div>
      <div className="player-bar__info">
        <div className="player-bar__name">
          <strong>{mine ? t("player.you") : level.name}</strong>
          {!mine && <span className="player-bar__rating">DROSO-1</span>}
          {mine && <Flag locale={locale} title={t("player.country")} />}
          {thinking && <span className="player-bar__thinking">{t("player.thinking")}…</span>}
        </div>
        <div className="player-bar__material">
          <Captured pieces={taken} color={opponent} />
          {material > 0 && <span className="player-bar__adv">+{material}</span>}
        </div>
      </div>
      {phase !== "lobby" && <Clock side={side} />}
    </div>
  );
}
