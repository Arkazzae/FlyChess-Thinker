import { useFlyStore, type FlyThought } from "@/state/fly";
import { valueToCentipawns } from "@/ai/fly/planner";
import { useTranslation } from "@/i18n";

const fmt = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
const pawns = (value: number) => {
  const cp = valueToCentipawns(value) / 100;
  return `${cp >= 0 ? "+" : "−"}${Math.abs(cp).toFixed(1)}`;
};

/** What the fly is considering: instinct (policy), imagined value, and the line it expects. */
export function FlyThoughts({ limit = 6, recorded }: { limit?: number; recorded?: FlyThought }) {
  const status = useFlyStore((s) => s.status);
  const thought = useFlyStore((s) => s.thought);
  const thinking = useFlyStore((s) => s.thinking);
  const trace = useFlyStore((s) => s.trace);
  const backend = useFlyStore((s) => s.backend);
  const { t } = useTranslation();
  const decision = recorded ? recorded.decision : (status === "thinking" ? thinking?.decision : undefined) ?? thought?.decision;

  if (!decision) {
    return (
      <div className="thoughts thoughts--empty">
        {status === "thinking" ? t("thoughts.looking") : t("thoughts.empty")}
      </div>
    );
  }
  const maxPrior = Math.max(...decision.candidates.map((c) => c.prior), 1e-6);
  return (
    <div className="thoughts">
      <p className="thoughts__status" role="status">
        {status === "thinking" && !recorded
          ? t("thoughts.live", { depth: decision.depth, count: decision.simulations })
          : t("thoughts.done", { count: decision.simulations, depth: decision.depth, ms: Math.round((recorded ?? thought)?.thinkMs ?? 0) })}
      </p>
      {decision.line.length > 1 && (
        <p className="thoughts__line"><span>{t("thoughts.line")}</span>{decision.line.map((san, i) => <b key={i} className={i % 2 ? "is-reply" : ""}>{san}</b>)}</p>
      )}
      <ol className="thoughts__list">
        {decision.candidates.slice(0, limit).map((candidate) => (
          <li key={candidate.uci} className={candidate.uci === decision.move ? "is-chosen" : ""}>
            <strong>{candidate.san}</strong>
            <span className="thoughts__bar" title={t("thoughts.prior")}>
              <i style={{ width: `${(candidate.prior / maxPrior) * 100}%` }} />
              <em>{Math.round(candidate.prior * 100)}%</em>
            </span>
            <span className={`thoughts__value ${candidate.value >= 0 ? "is-good" : "is-bad"}`} title={t("thoughts.value")}>{pawns(candidate.value)}</span>
          </li>
        ))}
      </ol>
      <div className="thoughts__heads">
        {[t("thoughts.now")].map((label, index) => {
          const v = decision.value[index];
          return (
            <div key={label} className="head">
              <span>{label}</span>
              <div className="head__track"><i style={{ left: `${50 + Math.min(0, v) * 50}%`, width: `${Math.abs(v) * 50}%` }} className={v >= 0 ? "is-good" : "is-bad"} /></div>
              <output>{fmt(v)}</output>
            </div>
          );
        })}
      </div>
      <p className="thoughts__meta">
        {t("thoughts.rules", { percent: (decision.legalMass * 100).toFixed(1) })}
        {trace ? t("thoughts.trace", { ms: Math.round(trace.traceMs) }) : ""}
        {backend ? ` · ${backend.backend === "webgpu" ? `WebGPU (${backend.adapter})` : "CPU"}` : ""}
      </p>
    </div>
  );
}
