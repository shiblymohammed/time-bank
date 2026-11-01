import React from 'react';

const localResponsibilities = [
  { number: '01', title: 'Set local services', text: 'Choose which approved services are offered and define local volunteer requirements.' },
  { number: '02', title: 'Support local members', text: 'Review membership, eligibility, and requests through the local coordinator team.' },
  { number: '03', title: 'Keep local operations private', text: 'Each municipality manages its own members, catalogue, and service requests.' },
];

const onboardingSteps = [
  { title: 'Start a conversation', text: 'A municipal or community representative identifies a local sponsor and coordinator.' },
  { title: 'Set up the local hub', text: 'The platform team provisions the organization, branding, administrators, and local service catalogue.' },
  { title: 'Prepare for a local launch', text: 'Agree on eligibility, volunteer review, service locations, and how requests will be coordinated.' },
];

export function Municipalities() {
  return (
    <section id="municipalities" className="section" style={{ background: 'linear-gradient(180deg, #FAF5EE 0%, #F3ECE2 18%, #F3ECE2 82%, #FAF5EE 100%)', borderTop: 'none', borderBottom: 'none' }}>
      <style>{`
        .municipality-overview { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr); gap: 1.25rem; align-items: stretch; }
        .municipality-feature { padding: clamp(1.25rem, 3vw, 2rem); border: 1.5px solid #D9CBB9; border-radius: 22px; background: rgba(255,255,255,0.92); box-shadow: 0 9px 28px rgba(45,30,15,0.055); }
        .municipality-feature-main { background: linear-gradient(135deg, #FFFFFF 0%, #FFF9F2 100%); }
        .municipality-local-points { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin-top: 1.25rem; }
        .municipality-point { padding: 0.9rem; border-radius: 15px; background: #FAF7F2; border: 1px solid #EEE5D8; }
        .municipality-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem; }
        .municipality-step { display: flex; gap: 0.7rem; align-items: flex-start; padding: 1rem; border-radius: 15px; background: #FFFFFF; border: 1px solid #E7DFD4; }
        .municipality-step-number { width: 30px; height: 30px; flex: 0 0 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: #EEF2FF; color: #4F46E5; font-size: 0.68rem; font-weight: 900; }
        .municipality-jump:focus-visible { outline: 3px solid #111827; outline-offset: 3px; }
        @media (max-width: 850px) { .municipality-overview { grid-template-columns: minmax(0, 1fr); } }
        @media (max-width: 680px) { .municipality-local-points, .municipality-steps { grid-template-columns: minmax(0, 1fr); } }
      `}</style>

      <div className="container">
        <header style={{ textAlign: 'center', marginBottom: '2.3rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: '#4F46E5', fontSize: '0.75rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.55rem' }}>
            <span aria-hidden="true">●</span> One shared platform · locally run hubs
          </div>
          <h2 className="section-title">Community support, organized close to home</h2>
          <p className="section-subtitle" style={{ margin: '0 auto' }}>
            Each participating municipality manages its own members, services, and requests on a shared platform. The local team understands the community; the platform provides common tools and rules.
          </p>
        </header>

        <div className="municipality-overview">
          <article className="municipality-feature municipality-feature-main">
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.7rem', marginBottom: '1.2rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.7rem', borderRadius: '999px', color: '#9A3412', background: '#FFF0E8', border: '1px solid #F4CFBA', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.04em' }}>
                <span aria-hidden="true">●</span> PROJECT CONTEXT
              </span>
              <span style={{ color: '#5B6577', fontSize: '0.7rem', fontWeight: 750 }}>Kottakkal · Malappuram, Kerala</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr)', gap: '0.9rem', alignItems: 'center' }}>
              <div aria-hidden="true" style={{ width: '56px', height: '56px', borderRadius: '17px', background: 'linear-gradient(145deg, #FF6B70, #D9434A)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', boxShadow: '0 7px 16px rgba(217,67,74,0.2)' }}>K</div>
              <div>
                <h3 style={{ color: '#111827', fontSize: '1.35rem', lineHeight: 1.25, fontWeight: 950 }}>Kottakkal Municipality</h3>
                <div style={{ color: '#047857', fontSize: '0.84rem', fontWeight: 800 }}>കോട്ടയ്ക്കൽ നഗരസഭ</div>
              </div>
            </div>

            <p style={{ color: '#4B5563', fontSize: '0.88rem', lineHeight: 1.65, marginTop: '1rem' }}>
              Kottakkal is the project’s starting community context. The shared platform is designed to support locally managed services, requests, and volunteer matching. This page does not confirm that a public Time Bank service is currently operating in Kottakkal.
            </p>

            <div style={{ marginTop: '1rem', padding: '0.85rem 0.95rem', borderRadius: '14px', background: '#F3F4F6', border: '1px solid #E5E7EB' }}>
              <strong style={{ color: '#303342', display: 'block', fontSize: '0.74rem', marginBottom: '0.55rem' }}>SHARED PLATFORM TOOLS</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                <span style={{ padding: '0.28rem 0.5rem', borderRadius: '8px', background: '#FFFFFF', color: '#4B5563', fontSize: '0.67rem', fontWeight: 750 }}>Service catalogue</span>
                <span style={{ padding: '0.28rem 0.5rem', borderRadius: '8px', background: '#FFFFFF', color: '#4B5563', fontSize: '0.67rem', fontWeight: 750 }}>Requests</span>
                <span style={{ padding: '0.28rem 0.5rem', borderRadius: '8px', background: '#FFFFFF', color: '#4B5563', fontSize: '0.67rem', fontWeight: 750 }}>Volunteer matching</span>
              </div>
              <div style={{ color: '#6B7280', fontSize: '0.69rem', lineHeight: 1.5, marginTop: '0.6rem' }}>A platform capability does not necessarily mean the service is available locally.</div>
            </div>
          </article>

          <article className="municipality-feature">
            <div style={{ color: '#4F46E5', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.45rem' }}>What a local hub does</div>
            <h3 style={{ color: '#111827', fontSize: '1.25rem', lineHeight: 1.25, fontWeight: 900, marginBottom: '0.4rem' }}>Local decisions stay local</h3>
            <p style={{ color: '#5B6577', fontSize: '0.8rem', lineHeight: 1.55, marginBottom: '0.9rem' }}>A municipality runs its own community operations within shared platform safeguards.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {localResponsibilities.map((item) => (
                <div key={item.number} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', gap: '0.65rem', alignItems: 'start' }}>
                  <span style={{ width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '9px', background: '#EEF2FF', color: '#4F46E5', fontSize: '0.64rem', fontWeight: 900 }}>{item.number}</span>
                  <div><div style={{ color: '#111827', fontSize: '0.79rem', fontWeight: 900 }}>{item.title}</div><p style={{ color: '#5B6577', fontSize: '0.72rem', lineHeight: 1.5, marginTop: '0.12rem' }}>{item.text}</p></div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '0.9rem', padding: '0.7rem 0.8rem', borderRadius: '12px', background: '#F8F6FF', border: '1px solid #E4E1FA', color: '#4B5563', fontSize: '0.7rem', lineHeight: 1.5 }}>
              Members need local approval to access that hub. The shared platform does not make one municipality’s private requests visible to another.
            </div>
          </article>
        </div>

        <section id="municipality-next-steps" style={{ marginTop: '1.25rem', padding: 'clamp(1.25rem, 3vw, 2rem)', borderRadius: '22px', background: 'linear-gradient(120deg, #25283A, #35394D)', color: '#FFFFFF', boxShadow: '0 15px 35px rgba(24,26,34,0.14)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ color: '#FCD34D', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>For interested municipalities</div>
              <h3 style={{ fontSize: '1.35rem', lineHeight: 1.25, fontWeight: 900 }}>How a local hub could get started</h3>
            </div>
            <span style={{ color: '#CBD5E1', fontSize: '0.7rem', fontWeight: 700 }}>A planning path · not an automatic sign-up</span>
          </div>
          <div className="municipality-steps">
            {onboardingSteps.map((step, index) => (
              <div className="municipality-step" key={step.title}>
                <span className="municipality-step-number">{String(index + 1).padStart(2, '0')}</span>
                <div><div style={{ color: '#111827', fontSize: '0.79rem', fontWeight: 900 }}>{step.title}</div><p style={{ color: '#5B6577', fontSize: '0.72rem', lineHeight: 1.55, marginTop: '0.2rem' }}>{step.text}</p></div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '0.7rem', marginTop: '0.9rem' }}>
            <div style={{ padding: '0.8rem 0.9rem', borderRadius: '13px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <strong style={{ display: 'block', color: '#FFFFFF', fontSize: '0.73rem', marginBottom: '0.2rem' }}>For residents</strong>
              <span style={{ color: '#D1D5DB', fontSize: '0.7rem', lineHeight: 1.5 }}>Ask your local municipality whether a Time Bank program is available in your area.</span>
            </div>
            <div style={{ padding: '0.8rem 0.9rem', borderRadius: '13px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <strong style={{ display: 'block', color: '#FFFFFF', fontSize: '0.73rem', marginBottom: '0.2rem' }}>For municipal teams</strong>
              <span style={{ color: '#D1D5DB', fontSize: '0.7rem', lineHeight: 1.5 }}>Coordinate with the project team to explore the model. This page does not yet provide an onboarding form or contact address.</span>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
