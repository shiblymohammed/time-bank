'use client';

import React from 'react';

const timeCreditFeatures = [
  { icon: '◷', title: 'Earned through service', text: 'One verified hour of volunteering equals one time credit.' },
  { icon: '▱', title: 'One universal wallet', text: 'Designed to follow a member across participating municipalities.' },
  { icon: '∞', title: 'Lifetime value', text: 'Credits are intended to remain valid for life.' },
];

const loyaltyFeatures = [
  { icon: '▣', title: 'Local merchant offers', text: 'Businesses fund discounts and other volunteer appreciation.' },
  { icon: '☷', title: 'Offer rules set by merchants', text: 'Offers and limits are subject to municipal approval.' },
  { icon: '▦', title: 'Clear redemption rules', text: 'Participating offers can be checked in-store using an approved method.' },
];

export function TwoCurrencies() {
  return (
    <section id="currencies" className="section" style={{ background: 'linear-gradient(180deg, #FAF5EE 0%, #F3ECE2 18%, #F3ECE2 82%, #FAF5EE 100%)', borderTop: 'none', borderBottom: 'none' }}>
      <style>{`
        .currency-ecosystem {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 210px minmax(0, 1fr);
          align-items: stretch;
          gap: clamp(1rem, 2.2vw, 2rem);
        }
        .currency-panel {
          height: 100%;
          min-width: 0;
          padding: clamp(1.25rem, 2.4vw, 2rem);
          border-radius: 28px;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          box-shadow: 0 18px 42px rgba(45,30,15,0.08);
        }
        .currency-panel-blue {
          background: linear-gradient(145deg, #EAF4FF 0%, #F6FAFF 55%, #FFFFFF 100%);
          border: 1.5px solid #BCD9FA;
        }
        .currency-panel-gold {
          background: linear-gradient(145deg, #FFF3DE 0%, #FFFAF1 55%, #FFFFFF 100%);
          border: 1.5px solid #F6D8A5;
        }
        .currency-panel::after {
          content: '';
          position: absolute;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          right: -95px;
          bottom: -100px;
          background: currentColor;
          opacity: 0.035;
          pointer-events: none;
        }
        .currency-center {
          min-height: 310px;
          padding: 1rem 0.7rem;
          border: 1px solid rgba(217,203,185,0.8);
          border-radius: 22px;
          background: rgba(255,255,255,0.54);
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 0.7rem;
          position: relative;
        }
        .currency-center-heading {
          color: #6B7280;
          text-align: center;
          font-size: 0.62rem;
          line-height: 1.3;
          font-weight: 900;
          letter-spacing: 0.08em;
        }
        .currency-center-row {
          padding: 0.7rem 0.5rem;
          border-radius: 14px;
          text-align: center;
          background: #FFFFFF;
          box-shadow: 0 5px 14px rgba(45,30,15,0.06);
        }
        .currency-center-row-time { border: 1px solid #C7DFFA; }
        .currency-center-row-loyalty { border: 1px solid #F6DCA8; }
        .currency-center-marker {
          width: 25px;
          height: 5px;
          display: block;
          margin: 0 auto 0.45rem;
          border-radius: 99px;
        }
        .currency-separation {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          color: #6B7280;
          font-size: 0.56rem;
          font-weight: 900;
          letter-spacing: 0.055em;
          white-space: nowrap;
        }
        .currency-separation::before,
        .currency-separation::after {
          content: '';
          height: 1px;
          flex: 1;
          background: #D9CBB9;
        }
        .currency-center-note {
          color: #7B8798;
          text-align: center;
          font-size: 0.62rem;
          line-height: 1.4;
          font-weight: 700;
        }
        .currency-feature {
          display: flex;
          align-items: flex-start;
          gap: 0.7rem;
        }
        .currency-feature-icon {
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          display: inline-flex;
          justify-content: center;
          align-items: center;
          border-radius: 12px;
          font-size: 1.1rem;
          font-weight: 900;
        }
        @media (max-width: 900px) {
          .currency-ecosystem { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
          .currency-center { grid-column: 1 / -1; grid-row: 2; min-height: 235px; }
          .currency-panel-blue { grid-column: 1; grid-row: 1; }
          .currency-panel-gold { grid-column: 2; grid-row: 1; }
          .currency-center { min-height: 210px; padding: 1rem; }
          .currency-center-row { width: min(100%, 340px); margin: 0 auto; }
        }
        @media (max-width: 620px) {
          .currency-ecosystem { grid-template-columns: minmax(0, 1fr); }
          .currency-panel-blue { grid-column: 1; grid-row: 1; }
          .currency-center { grid-column: 1; grid-row: 2; min-height: 220px; }
          .currency-panel-gold { grid-column: 1; grid-row: 3; }
        }
      `}</style>

      <div className="container" style={{ maxWidth: '1500px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 className="section-title" style={{ maxWidth: '850px', margin: '0 auto 0.8rem' }}>
            Two currencies. Two clear purposes.
          </h2>
          <p className="section-subtitle" style={{ margin: '0 auto' }}>
            Time credits recognize community service. Loyalty coins support merchant-funded offers. Each has its own rules and ledger; local availability depends on the participating program.
          </p>
        </div>

        <div className="currency-ecosystem">
          <article className="currency-panel currency-panel-blue" style={{ color: '#0867C5' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span style={{ display: 'inline-flex', padding: '0.35rem 0.7rem', borderRadius: '999px', background: '#DCEEFF', border: '1px solid #BDD9F7', color: '#0759A8', fontSize: '0.72rem', fontWeight: 850 }}>UNIVERSAL CIVIC CURRENCY</span>
              <span style={{ color: '#6B7280', fontSize: '0.66rem', fontWeight: 800 }}>COMMUNITY SERVICE</span>
            </div>
            <h3 style={{ fontSize: 'clamp(1.45rem, 2.4vw, 1.9rem)', lineHeight: 1.1, fontWeight: 950, color: '#111827', letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>Universal<br />Time Credits</h3>
            <p style={{ color: '#374151', fontSize: '0.87rem', lineHeight: 1.6, marginBottom: '1rem' }}>A non-commercial record of time contributed to community service.</p>
            <div style={{ padding: '0.65rem 0.8rem', background: 'rgba(255,255,255,0.82)', border: '1px solid #C7DFFA', borderRadius: '12px', color: '#0759A8', fontSize: '0.8rem', fontWeight: 900, marginBottom: '1rem' }}>1 verified service hour = 1 time credit</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {timeCreditFeatures.map((feature) => (
                <div className="currency-feature" key={feature.title}>
                  <span className="currency-feature-icon" style={{ color: '#0759A8', background: '#DCEEFF' }}>{feature.icon}</span>
                  <div style={{ minWidth: 0 }}><div style={{ color: '#111827', fontSize: '0.82rem', fontWeight: 900 }}>{feature.title}</div><p style={{ color: '#4B5563', fontSize: '0.74rem', lineHeight: 1.5 }}>{feature.text}</p></div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderTop: '1px solid #C7DFFA', color: '#0759A8', fontSize: '0.73rem', fontWeight: 800, lineHeight: 1.5 }}>Cannot be traded, converted to cash, or used to pay for merchant goods. Eligible beneficiaries receive assistance without spending credits.</div>
          </article>

          <div className="currency-center" role="group" aria-label="The two ledgers stay separate">
            <div className="currency-center-heading">TWO PURPOSES<br />ONE COMMUNITY</div>
            <div className="currency-center-row currency-center-row-time">
              <span className="currency-center-marker" style={{ background: '#1682D4' }} />
              <div style={{ color: '#0759A8', fontSize: '0.67rem', fontWeight: 900, letterSpacing: '0.035em' }}>TIME CREDITS</div>
              <div style={{ color: '#4B5563', fontSize: '0.64rem', marginTop: '0.15rem' }}>Recognize service</div>
            </div>
            <div className="currency-separation">NO CONVERSION</div>
            <div className="currency-center-row currency-center-row-loyalty">
              <span className="currency-center-marker" style={{ background: '#D88A16' }} />
              <div style={{ color: '#99520B', fontSize: '0.67rem', fontWeight: 900, letterSpacing: '0.035em' }}>LOYALTY COINS</div>
              <div style={{ color: '#4B5563', fontSize: '0.64rem', marginTop: '0.15rem' }}>Unlock local offers</div>
            </div>
            <div className="currency-center-note">Separate records.<br />Separate rules.</div>
          </div>

          <article className="currency-panel currency-panel-gold" style={{ color: '#B45309' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span style={{ display: 'inline-flex', padding: '0.35rem 0.7rem', borderRadius: '999px', background: '#FFF1D6', border: '1px solid #F6DCA8', color: '#99520B', fontSize: '0.72rem', fontWeight: 850 }}>MERCHANT & CIVIC REWARDS</span>
              <span style={{ color: '#6B7280', fontSize: '0.66rem', fontWeight: 800 }}>MERCHANT-FUNDED</span>
            </div>
            <h3 style={{ fontSize: 'clamp(1.45rem, 2.4vw, 1.9rem)', lineHeight: 1.1, fontWeight: 950, color: '#111827', letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>Civic Loyalty<br />Coins</h3>
            <p style={{ color: '#374151', fontSize: '0.87rem', lineHeight: 1.6, marginBottom: '1rem' }}>A separate, merchant-funded reward for volunteer participation.</p>
            <div style={{ padding: '0.65rem 0.8rem', background: 'rgba(255,255,255,0.82)', border: '1px solid #F6DCA8', borderRadius: '12px', color: '#99520B', fontSize: '0.8rem', fontWeight: 900, marginBottom: '1rem' }}>Use for eligible participating-store offers</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {loyaltyFeatures.map((feature) => (
                <div className="currency-feature" key={feature.title}>
                  <span className="currency-feature-icon" style={{ color: '#99520B', background: '#FFF1D6' }}>{feature.icon}</span>
                  <div style={{ minWidth: 0 }}><div style={{ color: '#111827', fontSize: '0.82rem', fontWeight: 900 }}>{feature.title}</div><p style={{ color: '#4B5563', fontSize: '0.74rem', lineHeight: 1.5 }}>{feature.text}</p></div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderTop: '1px solid #F6DCA8', color: '#99520B', fontSize: '0.73rem', fontWeight: 800, lineHeight: 1.5 }}>Loyalty coins do not replace time credits. Offers require local municipal approval before publication.</div>
          </article>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.55rem', margin: '1.5rem auto 0', color: '#4B5563', fontSize: '0.77rem', fontWeight: 750, textAlign: 'center' }}>
          <span aria-hidden="true" style={{ color: '#059669' }}>✓</span>
          <span>Time credits are never exchanged for loyalty coins, cash, or merchant discounts.</span>
        </div>
      </div>
    </section>
  );
}
