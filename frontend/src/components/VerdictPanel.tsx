import type { GenLayerVerdict } from '@wagr/shared'

export function VerdictPanel({ verdict }: { verdict?: GenLayerVerdict }) {
  if (!verdict) {
    return (
      <section className="panel verdict-panel">
        <div className="panel-heading">
          <span>GenLayer Verdict</span>
          <strong>Pending</strong>
        </div>
        <p className="muted">This duel has not received a GenLayer resolution yet.</p>
      </section>
    )
  }

  return (
    <section className="panel verdict-panel">
      <div className="panel-heading">
        <span>GenLayer Verdict</span>
        <strong className={`verdict verdict-${verdict.verdict.toLowerCase()}`}>{verdict.verdict}</strong>
      </div>

      <div className="confidence">
        <div style={{ width: `${verdict.confidence}%` }} />
      </div>
      <p className="confidence-label">{verdict.confidence}% confidence</p>

      <h4>Evidence summary</h4>
      <p>{verdict.evidence_summary}</p>

      <h4>Sources checked</h4>
      <ul className="source-list">
        {verdict.sources_checked.map((source) => (
          <li key={source.url}>
            <span>{source.url}</span>
            <strong>{source.supports}</strong>
          </li>
        ))}
      </ul>

      <h4>Reasoning</h4>
      <p>{verdict.reasoning}</p>

      {verdict.invalid_reason ? (
        <>
          <h4>Ruling note</h4>
          <p>{verdict.invalid_reason}</p>
        </>
      ) : null}
    </section>
  )
}
