import { useEffect, useState } from "react";
import { loadOpeningBook, lookupOpening, type OpeningInfo } from "@/engine/openings";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Resolves the current position's ECO opening name. Keeps the last matched
 * name once the game leaves the book instead of clearing it.
 */
export function useOpeningName(fen: string): OpeningInfo | null {
  const [map, setMap] = useState<Map<string, OpeningInfo> | null>(null);
  const [current, setCurrent] = useState<OpeningInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadOpeningBook().then((loaded) => {
      if (!cancelled) setMap(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (fen === STARTING_FEN) {
      setCurrent(null);
      return;
    }
    if (!map) return;
    const found = lookupOpening(map, fen);
    if (found) setCurrent(found);
  }, [map, fen]);

  return current;
}
