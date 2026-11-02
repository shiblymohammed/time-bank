import React from 'react';

const footerLinks = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Example services', href: '#services' },
  { label: 'Two currencies', href: '#currencies' },
  { label: 'Local municipalities', href: '#municipalities' },
  { label: 'Trust & safeguards', href: '#governance' },
  { label: 'FAQs', href: '#faq' },
];

export function Footer() {
  return (
    <footer style={{ background: '#171923', color: '#FFFFFF', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        .footer-cta { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; padding: clamp(1.35rem, 3vw, 2rem); border-radius: 22px; background: linear-gradient(115deg, #292D40 0%, #34384C 60%, #3D3440 100%); border: 1px solid rgba(255,255,255,0.12); }
        .footer-columns { display: grid; grid-template-columns: minmax(240px, 1.25fr) minmax(160px, 0.75fr) minmax(250px, 1fr); gap: 2.5rem; padding: 3rem 0 2.2rem; }
        .footer-link { color: #C8CBD4; font-size: 0.8rem; font-weight: 650; transition: color 150ms ease; }
        .footer-link:hover { color: #FFFFFF; }
        .footer-link:focus-visible, .footer-cta a:focus-visible { outline: 2px solid #FCD34D; outline-offset: 4px; border-radius: 4px; }
        @media (max-width: 800px) { .footer-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem; } .footer-brand-column { grid-column: 1 / -1; } }
        @media (max-width: 560px) { .footer-cta { align-items: flex-start; flex-direction: column; } .footer-columns { grid-template-columns: minmax(0, 1fr); } .footer-brand-column { grid-column: auto; } }
      `}</style>

      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="footer-cta" style={{ marginTop: '1.25rem' }}>
          <div style={{ maxWidth: '650px' }}>
            <div style={{ color: '#FCD34D', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Community care, organized locally</div>
            <h2 style={{ color: '#FFFFFF', fontSize: 'clamp(1.2rem, 2.3vw, 1.65rem)', lineHeight: 1.25, fontWeight: 900 }}>See how a Time Bank could work in your community.</h2>
            <p style={{ color: '#D1D5DB', fontSize: '0.78rem', lineHeight: 1.55, marginTop: '0.35rem' }}>Explore the service examples and the possible steps for a local municipality to get started.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            <a href="#services" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.7rem 0.9rem', borderRadius: '999px', background: '#FFFFFF', color: '#181A22', fontSize: '0.77rem', fontWeight: 900 }}>Explore services <span aria-hidden="true">→</span></a>
            <a href="#municipality-next-steps" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.7rem 0.9rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.28)', color: '#FFFFFF', fontSize: '0.77rem', fontWeight: 850 }}>Municipality steps <span aria-hidden="true">↗</span></a>
          </div>
        </div>

        <div className="footer-columns">
          <div className="footer-brand-column">
            <a href="#" aria-label="Kottakkal Time Bank home" style={{ display: 'inline-flex', alignItems: 'center', background: '#FFFFFF', padding: '0.45rem 0.85rem', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', textDecoration: 'none' }}>
              <img
                src="/kottakkal-time-bank-logo-1.png"
                alt="Kottakkal Time Bank"
                style={{ display: 'block', width: 'clamp(140px, 16vw, 190px)', height: 'auto', maxHeight: '46px', objectFit: 'contain' }}
              />
            </a>
            <p style={{ maxWidth: '390px', color: '#B8BCC7', fontSize: '0.78rem', lineHeight: 1.7, marginTop: '1rem' }}>
              A shared platform concept for organizing practical volunteer support through local community hubs. Kottakkal is the project’s initial municipal context.
            </p>
          </div>

          <nav aria-label="Footer navigation">
            <h3 style={{ color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '0.9rem' }}>Explore</h3>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', listStyle: 'none', padding: 0, margin: 0 }}>
              {footerLinks.map((link) => <li key={link.href}><a className="footer-link" href={link.href} style={{ textDecoration: 'none' }}>{link.label}</a></li>)}
            </ul>
          </nav>

          <div>
            <h3 style={{ color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: '0.9rem' }}>Platform principles</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              <div style={{ padding: '0.55rem 0.65rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#E5E7EB', fontSize: '0.72rem', lineHeight: 1.5 }}>Eligible support is provided without time-credit fees.</div>
              <div style={{ padding: '0.55rem 0.65rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#E5E7EB', fontSize: '0.72rem', lineHeight: 1.5 }}>Local access is managed by each participating organization.</div>
              <div style={{ padding: '0.55rem 0.65rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#E5E7EB', fontSize: '0.72rem', lineHeight: 1.5 }}>Volunteer time and merchant rewards are separate.</div>
            </div>
            <p style={{ color: '#8F95A3', fontSize: '0.67rem', lineHeight: 1.55, marginTop: '0.65rem' }}>Examples on this site explain the platform design. Check local availability with your municipality.</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', padding: '1rem 0 1.4rem', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <span style={{ color: '#8F95A3', fontSize: '0.68rem', lineHeight: 1.5 }}>© 2026 Kottakkal Time Bank · Community time, organized locally</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: '#AEB3C0', fontSize: '0.68rem', fontWeight: 700 }}><span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6EE7B7' }} /> Time credits and merchant rewards remain separate</span>
        </div>
      </div>
    </footer>
  );
}
