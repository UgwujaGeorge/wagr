import { Link } from 'react-router-dom'
import { BrainCircuit, Landmark, Scale, Swords, TimerReset, Trophy } from 'lucide-react'
import { DuelCard } from '../components/DuelCard'
import { demoDuels } from '../lib/duels'

export function LandingPage() {
  return (
    <div className="page landing-page">
      <section className="hero cinematic-hero brand-hero">
        <div className="hero-copy brand-hero-copy">
          <h1>WAGR</h1>
          <p>PvP prediction battles settled by GenLayer and built on Base.</p>
        </div>
        <div className="brand-visual" aria-hidden="true">
          <div className="verdict-frame">
            <div className="verdict-line verdict-line-top" />
            <div className="verdict-line verdict-line-bottom" />
            <div className="side-mark side-mark-yes">YES</div>
            <div className="side-mark side-mark-no">NO</div>
            <div className="verdict-core">
              <span>Stake</span>
              <strong>Verdict</strong>
              <span>Settle</span>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <div><Swords /><strong>1v1</strong><span>Challenge one counterparty, not a crowd.</span></div>
        <div><TimerReset /><strong>Deadline</strong><span>Every duel waits for a clear expiry.</span></div>
        <div><BrainCircuit /><strong>Verdict</strong><span>GenLayer reads the public evidence.</span></div>
        <div><Trophy /><strong>Settlement</strong><span>Base releases the escrowed pot.</span></div>
      </section>

      <section className="story-grid">
        <div className="story-panel">
          <span className="eyebrow">How it works</span>
          <h2>A formal wager, not a market.</h2>
          <p>
            A creator writes a claim, chooses YES or NO, and locks stake. A counterparty takes the opposite side with
            matching stake. After expiry, the evidence is sent to GenLayer for a final ruling.
          </p>
        </div>
        <div className="process-list">
          <div><Scale /><strong>Terms</strong><span>Claim, evidence URLs, rules, stake, and expiry.</span></div>
          <div><Swords /><strong>Duel</strong><span>Both sides lock equal funds into the Base escrow.</span></div>
          <div><Landmark /><strong>Ruling</strong><span>GenLayer determines YES, NO, or INVALID from public sources.</span></div>
        </div>
      </section>

      <section className="section-head">
        <div>
          <span className="eyebrow">Featured duels</span>
          <h2>Challenges awaiting judgment.</h2>
        </div>
        <Link to="/explore">See all</Link>
      </section>

      <div className="duel-grid">
        {demoDuels.slice(0, 3).map((duel) => <DuelCard key={duel.id} duel={duel} />)}
      </div>

      <section className="settlement-band">
        <div>
          <span className="eyebrow">Settlement stack</span>
          <h2>Base holds the stake. GenLayer settles the question.</h2>
        </div>
        <p>
          Wagr keeps the financial layer simple: equal stake, clear sides, escrowed funds. The hard part is the
          claim itself, so verdicts are resolved against public evidence instead of a price feed or a central admin.
        </p>
      </section>

      <section className="final-cta">
        <span className="eyebrow">Ready the terms</span>
        <h2>Turn the next disputed claim into a duel.</h2>
        <Link to="/create" className="primary-action">Create a Wagr duel</Link>
      </section>
    </div>
  )
}
