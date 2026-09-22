/**
 * ECO opening book lookup, keyed by full FEN.
 * Data is fetched lazily from the bundled ECO tables and cached in memory
 * for the life of the tab.
 */

export interface OpeningInfo {
  eco: string;
  name: string;
}

const ECO_FILES = ["ecoA", "ecoB", "ecoC", "ecoD", "ecoE"];

type RawEcoEntry = { eco: string; name: string };

let ecoMap: Map<string, OpeningInfo> | null = null;
let loadPromise: Promise<Map<string, OpeningInfo>> | null = null;

export function loadOpeningBook(): Promise<Map<string, OpeningInfo>> {
  if (ecoMap) return Promise.resolve(ecoMap);
  if (!loadPromise) {
    loadPromise = Promise.all(
      ECO_FILES.map((name) =>
        fetch(new URL(`./libraries/${name}.json`, document.baseURI).href).then((res) => res.json() as Promise<Record<string, RawEcoEntry>>),
      ),
    ).then((files) => {
      const map = new Map<string, OpeningInfo>();
      for (const file of files) {
        for (const [fen, entry] of Object.entries(file)) {
          map.set(fen, { eco: entry.eco, name: entry.name });
        }
      }
      ecoMap = map;
      return map;
    });
  }
  return loadPromise;
}

export function lookupOpening(map: Map<string, OpeningInfo>, fen: string): OpeningInfo | undefined {
  return map.get(fen);
}
