'use client';

import React, { useState } from 'react';

const faqs = [
  {
    q: 'Is practical assistance free for eligible beneficiaries?',
    a: 'Yes. Eligible beneficiaries receive approved assistance without needing or spending time credits. This protection is part of the project’s core rules.',
  },
  {
    q: 'What happens if I move to another municipality?',
    a: 'The platform is designed around one universal time-credit wallet for each person. Where the wallet is available, credits are intended to stay with the member across participating municipalities. Ask your local program whether this feature is active before relying on it.',
  },
  {
    q: 'Can time credits be exchanged for money or merchant discounts?',
    a: 'No. Time credits represent volunteer service; they cannot be traded for cash or used to pay for merchant goods. Any merchant rewards use a separate system and never convert volunteer hours into money or discounts.',
  },
  {
    q: 'What safeguards are in place for requests?',
    a: 'Request safeguards include organization-scoped API access, a service location entered for each request, and checks for eligibility, membership roles, request limits, and caregiver authorization. The program rules also require someone other than the volunteer to confirm completed service before time credits are awarded. Feature availability depends on local rollout.',
  },
  {
    q: 'Can someone request help for a person who does not use an app?',
    a: 'The request flow supports authorized caregivers and coordinator-created requests on behalf of eligible beneficiaries. Caregiver access must be explicitly authorized and can be revoked.',
  },
  {
    q: 'Can local businesses offer volunteer discounts now?',
    a: 'The platform design allows merchants to fund offers, with local approval before publication and redemption through a supported in-store method. Ask your local municipality whether merchant offers are currently available.',
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="section" style={{ background: 'linear-gradient(180deg, #FAF5EE 0%, #F3ECE2 25%, #F0E8DC 80%, #E8DFD3 100%)', borderTop: 'none', borderBottom: 'none' }}>
      <style>{`
        .faq-layout { display: grid; grid-template-columns: minmax(240px, 0.72fr) minmax(0, 1.28fr); gap: clamp(1.5rem, 4vw, 4rem); align-items: start; }
        .faq-list { display: flex; flex-direction: column; gap: 0.7rem; }
        .faq-item { border: 1px solid #E2D7C7; border-radius: 16px; background: rgba(255,255,255,0.94); box-shadow: 0 5px 18px rgba(45,30,15,0.045); overflow: hidden; transition: border-color 160ms ease, box-shadow 160ms ease; }
        .faq-item[data-open="true"] { border-color: #F1A5A8; box-shadow: 0 8px 22px rgba(255,90,95,0.09); }
        .faq-trigger { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.1rem; color: #111827; text-align: left; font: inherit; cursor: pointer; }
        .faq-trigger:focus-visible { outline: 3px solid #181A22; outline-offset: -3px; }
        .faq-answer { padding: 0 1.1rem 1rem; color: #4B5563; font-size: 0.82rem; line-height: 1.65; }
        @media (max-width: 800px) { .faq-layout { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; } }
      `}</style>

      <div className="container" style={{ maxWidth: '1500px' }}>
        <div className="faq-layout">
          <header style={{ paddingTop: '0.4rem' }}>
            <div style={{ color: '#047857', fontSize: '0.75rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.65rem' }}>Questions & answers</div>
            <h2 className="section-title" style={{ fontSize: 'clamp(2rem, 3.2vw, 2.75rem)' }}>A few things worth knowing.</h2>
            <p style={{ maxWidth: '460px', color: '#4B5563', fontSize: '0.91rem', lineHeight: 1.7, marginTop: '0.75rem' }}>
              Learn how local requests work, what time credits are for, and which safeguards guide the platform.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '1.25rem' }}>
              {['Getting started', 'Free assistance', 'Time credits', 'Local offers'].map((topic) => (
                <span key={topic} style={{ padding: '0.38rem 0.62rem', borderRadius: '999px', border: '1px solid #E0D4C3', background: 'rgba(255,255,255,0.65)', color: '#5B6577', fontSize: '0.68rem', fontWeight: 750 }}>{topic}</span>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '1.6rem', paddingTop: '1rem', borderTop: '1px solid #D9CBB9', color: '#6B7280', fontSize: '0.72rem', fontWeight: 700 }}>
              <span style={{ width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#FFF0F0', color: '#D34F63', fontWeight: 900 }}>?</span>
              <span>{faqs.length} common questions</span>
            </div>
          </header>

          <div className="faq-list" role="list" aria-label="Frequently asked questions">
            {faqs.map((faq, idx) => {
              const isOpen = openIndex === idx;
              const answerId = `faq-answer-${idx}`;
              return (
                <article className="faq-item" data-open={isOpen} role="listitem" key={faq.q}>
                  <h3 style={{ margin: 0 }}>
                    <button
                      type="button"
                      className="faq-trigger"
                      aria-expanded={isOpen}
                      aria-controls={answerId}
                      onClick={() => setOpenIndex(isOpen ? null : idx)}
                    >
                      <span style={{ fontSize: '0.89rem', lineHeight: 1.45, fontWeight: 850 }}>{faq.q}</span>
                      <span aria-hidden="true" style={{ width: '27px', height: '27px', flex: '0 0 27px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: isOpen ? '#FFF0F0' : '#F7F4EF', color: isOpen ? '#D34F63' : '#667085', fontSize: '1rem', fontWeight: 800, transition: 'transform 160ms ease', transform: isOpen ? 'rotate(45deg)' : 'none' }}>+</span>
                    </button>
                  </h3>
                  <div id={answerId} className="faq-answer" hidden={!isOpen}>{faq.a}</div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
