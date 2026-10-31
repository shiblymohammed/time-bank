import React from 'react';

const safeguards = [
  {
    number: '01',
    title: 'Local access is checked by the API',
    description: 'A member needs approved access to an organization before viewing its requests or member records.',
    evidence: 'Automated security tests reject cross-organization access.',
    color: '#4F46E5',
  },
  {
    number: '02',
    title: 'Every request names its service location',
    description: 'The requester enters where help is needed. The location is not silently copied from a home address.',
    evidence: 'Request validation and tests check that the location is present.',
    color: '#0284C7',
  },
  {
    number: '03',
    title: 'Eligibility and caregiver permission are verified',
    description: 'Before a request proceeds, the API checks the member’s role, eligibility, request limits, and any caregiver authorization.',
    evidence: 'Security tests cover invalid roles, revoked caregiver access, and exceeded quotas.',
    color: '#047857',
  },
];

export function SafetyGovernance() {
  return (
    <section id="governance" className="section" style={{ background: 'linear-gradient(180deg, #FAF5EE 0%, #FFFFFF 20%, #FFFFFF 80%, #FAF5EE 100%)', borderTop: 'none', borderBottom: 'none' }}>
      <style>{`
        .trust-review { display: grid; grid-template-columns: minmax(250px, 0.72fr) minmax(0, 1.28fr); gap: clamp(1.5rem, 4vw, 4rem); align-items: start; }
        .trust-ledger { border-left: 1px solid #E5DDD2; }
        .trust-row { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 0.8rem; padding: 0.2rem 0 1.3rem; }
        .trust-row + .trust-row { padding-top: 1.15rem; border-top: 1px solid #EEE8DF; }
        .trust-index { width: 32px; height: 32px; margin-left: -16px; border: 3px solid #FFFFFF; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 0 1px #E5DDD2; font-size: 0.62rem; font-weight: 900; }
        .trust-principles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
        .trust-principle { padding: 0.85rem; border-radius: 12px; background: rgba(255,255,255,0.7); border: 1px solid #E7DFD4; }
        @media (max-width: 760px) { .trust-review { grid-template-columns: minmax(0, 1fr); } .trust-principles { grid-template-columns: minmax(0, 1fr); } }
      `}</style>

      <div className="container" style={{ maxWidth: '1500px' }}>
        <div className="trust-review">
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: '#047857', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '0.7rem' }}>
              <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} /> TRUST REVIEW
            </div>
            <h2 className="section-title" style={{ fontSize: 'clamp(1.9rem, 3vw, 2.55rem)', marginBottom: '0.75rem' }}>Rules you can see in the workflow.</h2>
            <p style={{ color: '#4B5563', fontSize: '0.87rem', lineHeight: 1.7, maxWidth: '430px' }}>
              Rather than relying on promises, the current request system checks who can access local records, what a request must include, and whether a person is allowed to submit it.
            </p>

            <div style={{ marginTop: '1.25rem', padding: '0.9rem 1rem', borderRadius: '14px', background: '#F1F8F4', border: '1px solid #CDE8D7' }}>
              <div style={{ color: '#047857', fontSize: '0.7rem', fontWeight: 900, marginBottom: '0.25rem' }}>HOW TO READ THIS</div>
              <p style={{ color: '#3F5F4D', fontSize: '0.75rem', lineHeight: 1.55 }}>Each check below is tied to API behavior and automated tests in the project. Roadmap items are shown separately.</p>
            </div>
          </div>

          <div className="trust-ledger" role="list" aria-label="Current safeguards and test evidence">
            {safeguards.map((item) => (
              <article className="trust-row" role="listitem" key={item.number}>
                <span className="trust-index" style={{ color: item.color, background: '#FFFFFF' }}>{item.number}</span>
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '0.28rem' }}>
                    <h3 style={{ color: '#111827', fontSize: '0.96rem', lineHeight: 1.35, fontWeight: 900 }}>{item.title}</h3>
                    <span style={{ color: '#047857', background: '#EAF8F1', padding: '0.18rem 0.45rem', borderRadius: '999px', fontSize: '0.58rem', fontWeight: 900, letterSpacing: '0.04em' }}>IN API</span>
                  </div>
                  <p style={{ color: '#4B5563', fontSize: '0.78rem', lineHeight: 1.55 }}>{item.description}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', marginTop: '0.45rem' }}>
                    <span aria-hidden="true" style={{ color: item.color, fontSize: '0.72rem', fontWeight: 900 }}>✓</span>
                    <span style={{ color: '#667085', fontSize: '0.69rem', lineHeight: 1.45 }}>{item.evidence}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div style={{ marginTop: '1.1rem', padding: '1.1rem 1.2rem', borderRadius: '17px', background: '#F7F4EF', border: '1px solid #E7DFD4' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.85rem' }}>
            <h3 style={{ color: '#303342', fontSize: '0.83rem', fontWeight: 900 }}>The program’s trust rules</h3>
            <span style={{ color: '#7B8798', fontSize: '0.66rem', fontWeight: 700 }}>Principles that guide every participating hub</span>
          </div>
          <div className="trust-principles">
            <div className="trust-principle">
              <div style={{ color: '#047857', fontSize: '0.64rem', fontWeight: 900 }}>INDEPENDENT CONFIRMATION</div>
              <div style={{ color: '#303342', fontSize: '0.73rem', fontWeight: 800, marginTop: '0.2rem' }}>Volunteers cannot confirm their own service.</div>
            </div>
            <div className="trust-principle">
              <div style={{ color: '#047857', fontSize: '0.64rem', fontWeight: 900 }}>NO CREDIT FEE FOR CARE</div>
              <div style={{ color: '#303342', fontSize: '0.73rem', fontWeight: 800, marginTop: '0.2rem' }}>Eligible beneficiaries receive approved help without spending credits.</div>
            </div>
            <div className="trust-principle">
              <div style={{ color: '#047857', fontSize: '0.64rem', fontWeight: 900 }}>SEPARATE VALUE SYSTEMS</div>
              <div style={{ color: '#303342', fontSize: '0.73rem', fontWeight: 800, marginTop: '0.2rem' }}>Volunteer time is never converted into merchant money or discounts.</div>
            </div>
          </div>
        </div>

        <p style={{ color: '#7B8798', fontSize: '0.66rem', lineHeight: 1.5, marginTop: '0.65rem' }}>
          The API checks described above are covered by automated tests. Program rules describe the intended service; availability depends on local rollout. This is not an independent security certification.
        </p>
      </div>
    </section>
  );
}
