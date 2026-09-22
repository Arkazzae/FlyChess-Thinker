import { useEffect, useRef } from "react";
import { useGameStore } from "@/state/game";
import type { MoveClass } from "@/ai/review";

const MARKS: Partial<Record<MoveClass, string>> = { best: "★", inaccuracy: "?!", mistake: "?", blunder: "??" };

const FIGURINES_WHITE: Record<string, string> = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
const FIGURINES_BLACK: Record<string, string> = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞" };

function San({ san, white }: { san: string; white: boolean }) {
  const piece = san[0];
  const table = white ? FIGURINES_WHITE : FIGURINES_BLACK;
  if (table[piece]) return <><span className="figurine">{table[piece]}</span>{san.slice(1)}</>;
  const promotion = san.match(/=([QRBN])/);
  if (promotion) {
    const [before, after] = san.split(promotion[0]);
    return <>{before}=<span className="figurine">{table[promotion[1]]}</span>{after}</>;
  }
  return <>{san}</>;
}

/** The move list; in a review each move can carry its class (★ best, ?! inaccuracy, ? mistake, ?? blunder). */
export function MoveTable({ classes }: { classes?: (MoveClass | null | undefined)[] } = {}) {
  const moves = useGameStore((s) => s.moves);
  const viewPly = useGameStore((s) => s.viewPly);
  const setViewPly = useGameStore((s) => s.setViewPly);
  const current = viewPly ?? moves.length;
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Scroll the list itself: scrollIntoView would also scroll the page and push the board away on phones.
    const active = list.querySelector<HTMLElement>(".is-current");
    if (!active) {
      list.scrollTop = list.scrollHeight;
      return;
    }
    const top = active.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + active.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + active.offsetHeight - list.clientHeight;
  }, [moves.length, current]);

  const rows = [];
  for (let i = 0; i < moves.length; i += 2) rows.push(i);
  return (
    <div className="move-table" ref={listRef}>
      {rows.map((i) => (
        <div className="move-table__row" key={i}>
          <span className="move-table__no">{i / 2 + 1}.</span>
          {[i, i + 1].map((ply) => moves[ply] !== undefined ? (
            <button key={ply} type="button" className={`move-table__move${current === ply + 1 ? " is-current" : ""}${classes?.[ply] ? ` is-${classes[ply]}` : ""}`} onClick={() => setViewPly(ply + 1)}>
              <San san={moves[ply]} white={ply % 2 === 0} />
              {classes?.[ply] && MARKS[classes[ply]!] && <span className="move-mark">{MARKS[classes[ply]!]}</span>}
            </button>
          ) : <span key={ply} />)}
        </div>
      ))}
    </div>
  );
}
