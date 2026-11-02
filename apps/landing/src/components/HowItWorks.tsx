'use client';

import React, { useState } from 'react';

const steps = [
  {
    title: 'Create your profile',
    summary: 'One verified account',
    description: 'Sign in with a mobile number and complete identity verification. The goal is one permanent account for use across participating municipalities.',
    detail: 'A person has one global identity. Access to each local municipality is handled through a separate membership request.',
    icon: '👤',
    color: '#0284C7',
    tint: '#E0F2FE',
    marker: '01',
  },
  {
    title: 'Join your local community',
    summary: 'Your local team reviews your request',
    description: 'Choose your municipality and apply to take part. A local coordinator reviews the application and confirms which platform roles are appropriate.',
    detail: 'Your role depends on how you want to take part, such as volunteering or requesting eligible support.',
    icon: '🏛️',
    color: '#059669',
    tint: '#D1FAE5',
    marker: '02',
  },
  {
    title: 'Ask for help or offer time',
    summary: 'Find a suitable local match',
    description: 'An eligible person, authorized caregiver, or coordinator can submit a request. Matching considers the local organization, request location, approved volunteer skills, and availability.',
    detail: 'A suitable volunteer receives an offer and can choose to accept or decline it. If a request remains unfilled, the system can widen its search and escalate it to a coordinator.',
    icon: '🤝',
    color: '#B45309',
    tint: '#FEF3C7',
    marker: '03',
  },
  {
    title: 'Confirm service and record time',
    summary: 'Independent confirmation before credits',
    description: 'The intended process records one time credit for each independently verified hour of volunteer service in a universal wallet.',
    detail: 'The beneficiary, an authorized caregiver, or a coordinator may confirm completion; the volunteer cannot verify their own service. Eligible beneficiaries receive assistance without spending credits. Availability depends on the local program.',
    icon: '⏱️',
    color: '#E04348',
    tint: '#FFEAEB',
    marker: '04',
  },
];

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const active = steps[activeStep] ?? steps[0];
  if (!active) return null;

  return (
    <section
      id="how-it-works"
      className="section"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#FAF5EE',
        borderTop: 'none',
        borderBottom: 'none',
        padding: '5.5rem 0 6rem 0',
      }}
    >
      {/* 100% Width Background Image Layer with Edge Fade */}
      <div
        className="how-it-works-bg-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          backgroundImage: "url('/sectionbg-1.png')",
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          pointerEvents: 'none',
          zIndex: 0,
          maskImage: 'linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.35) 10%, rgba(0, 0, 0, 1) 25%, rgba(0, 0, 0, 1) 75%, rgba(0, 0, 0, 0.35) 90%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.35) 10%, rgba(0, 0, 0, 1) 25%, rgba(0, 0, 0, 1) 75%, rgba(0, 0, 0, 0.35) 90%, transparent 100%)',
        }}
      />

      {/* Top Edge Feather Dissolve */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '150px',
          background: 'linear-gradient(180deg, #FAF5EE 0%, rgba(250, 245, 238, 0.85) 45%, rgba(250, 245, 238, 0) 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Bottom Edge Feather Dissolve */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '150px',
          background: 'linear-gradient(0deg, #FAF5EE 0%, rgba(250, 245, 238, 0.85) 45%, rgba(250, 245, 238, 0) 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      <style>{`
        @media (max-width: 1024px) {
          .how-it-works-bg-layer {
            background-size: 100% auto !important;
            background-position: center top !important;
          }
        }
        .how-flow {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.8rem;
          position: relative;
          margin-bottom: 1.25rem;
        }
        .how-flow::before {
          content: '';
          position: absolute;
          top: 26px;
          left: 12.5%;
          right: 12.5%;
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(90deg, #0284C7, #059669, #D97706, #E04348);
          opacity: 0.42;
        }
        .how-flow-button {
          position: relative;
          z-index: 1;
          min-width: 0;
          padding: 0.8rem 0.65rem 0.9rem;
          border: 1.5px solid rgba(226, 215, 199, 0.7);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.78);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #374151;
          text-align: center;
          transition: transform 180ms ease, background 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .how-flow-button:hover { transform: translateY(-3px); background: rgba(255,255,255,0.95); }
        .how-flow-button:focus-visible { outline: 3px solid #111827; outline-offset: 3px; }
        .how-flow-button[aria-pressed="true"] { background: #FFFFFF; border-color: #E2D7C7; box-shadow: 0 8px 22px rgba(45,30,15,0.09); transform: translateY(-2px); }
        .how-flow-marker {
          width: 54px;
          height: 54px;
          margin: 0 auto 0.6rem;
          border: 3px solid #D9CBB9;
          border-radius: 50%;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #FFFFFF;
          box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.85);
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .how-flow-button[aria-pressed="true"] .how-flow-marker { transform: scale(1.08); box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.9), 0 5px 14px rgba(45,30,15,0.12); }
        .how-detail-panel {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(210px, 0.42fr);
          gap: 1.5rem;
          align-items: center;
          position: relative;
          overflow: hidden;
          padding: clamp(1.25rem, 3vw, 2rem);
          border-radius: 22px;
          border: 1.5px solid rgba(226, 215, 199, 0.85);
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 14px 34px rgba(45,30,15,0.08);
          animation: howPanelIn 220ms ease both;
        }
        .how-detail-panel::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 5px; background: var(--step-color); }
        @keyframes howPanelIn { from { opacity: 0.6; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 900px) {
          .how-flow { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
          .how-flow::before { display: none; }
          .how-detail-panel { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 520px) {
          .how-flow { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .how-flow-button { padding-inline: 0.35rem; }
          .how-flow-label { font-size: 0.78rem !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .how-flow-button, .how-flow-marker { transition: none; }
          .how-detail-panel { animation: none; }
        }
      `}</style>

      <div className="container" style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.95rem',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.90)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #A7F3D0',
              fontSize: '0.82rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#059669',
              marginBottom: '0.75rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            Workflow
          </div>
          <h2 className="section-title">How it works</h2>
          <p className="section-subtitle" style={{ margin: '0 auto', color: '#374151' }}>
            Select a step to understand the intended journey. Local services and features are available only where a participating program has launched them.
          </p>
        </div>

        <div className="how-flow" role="group" aria-label="Time Bank process steps">
          {steps.map((step, index) => {
            const selected = activeStep === index;
            return (
              <button
                key={step.marker}
                type="button"
                className="how-flow-button"
                aria-pressed={selected}
                aria-controls="how-step-details"
                onClick={() => setActiveStep(index)}
                style={{ backgroundColor: selected ? '#FFFFFF' : 'transparent' }}
              >
                <span className="how-flow-marker" style={{ borderColor: selected ? step.color : '#D9CBB9', background: selected ? step.tint : '#FFFFFF' }}>
                  <span aria-hidden="true" style={{ fontSize: '1.35rem' }}>{step.icon}</span>
                </span>
                <span style={{ display: 'block', color: selected ? step.color : '#7B8798', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.08em', marginBottom: '0.15rem' }}>STEP {step.marker}</span>
                <span className="how-flow-label" style={{ display: 'block', fontSize: '0.88rem', lineHeight: 1.3, fontWeight: 850, color: '#111827' }}>{step.title}</span>
              </button>
            );
          })}
        </div>

        <div
          id="how-step-details"
          key={active.marker}
          className="how-detail-panel"
          aria-live="polite"
          style={{ '--step-color': active.color } as React.CSSProperties & { '--step-color': string }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.55rem', marginBottom: '0.55rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.28rem 0.65rem', borderRadius: '999px', background: active.tint, color: active.color, fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.04em' }}>
                <span>{active.icon}</span> STEP {active.marker} OF 04
              </span>
              <span style={{ color: '#6B7280', fontSize: '0.78rem', fontWeight: 700 }}>{active.summary}</span>
            </div>
            <h3 style={{ fontSize: 'clamp(1.35rem, 2.5vw, 1.8rem)', lineHeight: 1.2, fontWeight: 900, color: '#111827', marginBottom: '0.65rem' }}>{active.title}</h3>
            <p style={{ maxWidth: '760px', color: '#374151', fontSize: '0.96rem', lineHeight: 1.7 }}>{active.description}</p>
          </div>

          <div style={{ padding: '1rem 1.05rem', borderRadius: '16px', background: active.tint, border: `1px solid ${active.color}35` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: active.color, fontSize: '0.73rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
              <span aria-hidden="true">✦</span> What this means
            </div>
            <p style={{ color: '#374151', fontSize: '0.82rem', lineHeight: 1.6 }}>{active.detail}</p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', marginTop: '1rem' }}>
          <button type="button" onClick={() => setActiveStep((step) => Math.max(0, step - 1))} disabled={activeStep === 0} style={{ padding: '0.55rem 0.85rem', borderRadius: '999px', border: '1px solid #D9CBB9', background: '#FFFFFF', color: activeStep === 0 ? '#A8A29E' : '#374151', fontSize: '0.78rem', fontWeight: 800, cursor: activeStep === 0 ? 'not-allowed' : 'pointer' }}>← Previous step</button>
          <span style={{ fontSize: '0.74rem', color: '#6B7280', fontWeight: 700 }}>{activeStep + 1} / {steps.length}</span>
          <button type="button" onClick={() => setActiveStep((step) => Math.min(steps.length - 1, step + 1))} disabled={activeStep === steps.length - 1} style={{ padding: '0.55rem 0.85rem', borderRadius: '999px', border: 'none', background: activeStep === steps.length - 1 ? '#D6D3D1' : '#181A22', color: '#FFFFFF', fontSize: '0.78rem', fontWeight: 800, cursor: activeStep === steps.length - 1 ? 'not-allowed' : 'pointer' }}>Next step →</button>
        </div>
      </div>
    </section>
  );
}
