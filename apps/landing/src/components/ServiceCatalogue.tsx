'use client';

import React, { useState } from 'react';

const categories = [
  { id: 'all', label: 'All examples', icon: '◎' },
  { id: 'elderly', label: 'Companionship', icon: '♡' },
  { id: 'health', label: 'Clinic visits', icon: '+' },
  { id: 'education', label: 'Digital help', icon: '⌘' },
  { id: 'errands', label: 'Errands', icon: '↗' },
  { id: 'practical', label: 'Home support', icon: '⌂' },
  { id: 'community', label: 'Community', icon: '✳' },
];

const services = [
  {
    id: 'elder-companion', category: 'elderly', categoryLabel: 'COMPANIONSHIP', title: 'A friendly visit', malayalam: 'മുതിർന്ന പൗരന്മാരുടെ ക്ഷേമാന്വേഷണം',
    description: 'Spend time talking, reading together, or taking a gentle walk with an older neighbour.', icon: '♡', color: '#D34F63', tint: '#FFF0F2',
    sample: 'Visit an older resident for conversation and help reading the day’s newspaper.', timing: 'About 1 hour', area: 'Example · Kottakkal Ward 3',
  },
  {
    id: 'medical-escort', category: 'health', categoryLabel: 'CLINIC VISIT', title: 'Company for an appointment', malayalam: 'ആശുപത്രി സന്ദർശന സഹായം',
    description: 'Accompany someone to a planned clinic visit or help them get to and from an appointment.', icon: '+', color: '#0284C7', tint: '#EAF6FF',
    sample: 'Meet a resident at a local clinic and accompany them during a scheduled appointment.', timing: 'About 2 hours', area: 'Example · Kottakkal Town',
  },
  {
    id: 'tech-literacy', category: 'education', categoryLabel: 'DIGITAL HELP', title: 'Help with a phone or online task', malayalam: 'ഡിജിറ്റൽ സാക്ഷരതയും സേവനങ്ങളും',
    description: 'Show someone how to use a smartphone or complete a simple online form or service.', icon: '⌘', color: '#6366F1', tint: '#F0F0FF',
    sample: 'Help a neighbour learn to make a video call and save important contacts.', timing: 'About 1 hour', area: 'Example · Changuvetty',
  },
  {
    id: 'groceries-medicine', category: 'errands', categoryLabel: 'ERRANDS', title: 'Pick up essentials', malayalam: 'മരുന്നും അവശ്യവസ്തുക്കളും എത്തിക്കൽ',
    description: 'Collect groceries or a prescribed item for a person who has difficulty going out.', icon: '↗', color: '#059669', tint: '#EAF8F1',
    sample: 'Pick up a grocery list from a resident and deliver the items to their home.', timing: 'About 1 hour', area: 'Example · Kottakkal Ward 5',
  },
  {
    id: 'home-safety', category: 'practical', categoryLabel: 'HOME SUPPORT', title: 'A hand with a small home task', malayalam: 'ഭവന സുരക്ഷാ സഹായങ്ങൾ',
    description: 'Help with a simple, agreed task that makes everyday movement around the home easier.', icon: '⌂', color: '#B45309', tint: '#FFF5E7',
    sample: 'Move a light piece of furniture to clear a safer path through the room.', timing: 'Set for each request', area: 'Example · Kottakkal',
  },
  {
    id: 'community-drive', category: 'community', categoryLabel: 'COMMUNITY', title: 'Join a neighbourhood activity', malayalam: 'സാമൂഹിക പ്രവർത്തനങ്ങൾ',
    description: 'Take part in a locally organized activity such as a clean-up or a community garden day.', icon: '✳', color: '#047857', tint: '#EAF8F1',
    sample: 'Join neighbours for a morning clean-up at a shared community space.', timing: 'Scheduled activity', area: 'Example · Kottakkal',
  },
];

export function ServiceCatalogue() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const filteredServices = activeCategory === 'all' ? services : services.filter((service) => service.category === activeCategory);

  return (
    <section id="services" className="section" style={{ background: 'linear-gradient(180deg, #FAF5EE 0%, #FFFFFF 18%, #FFFFFF 82%, #FAF5EE 100%)', borderTop: 'none', borderBottom: 'none' }}>
      <style>{`
        .service-filter-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.55rem; }
        .service-filter {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 0.85rem;
          border: 1px solid #E2D7C7;
          border-radius: 999px;
          background: #FFFFFF;
          color: #4B5563;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }
        .service-filter:hover { transform: translateY(-2px); box-shadow: 0 5px 14px rgba(45,30,15,0.08); }
        .service-filter:focus-visible, .service-sample-button:focus-visible { outline: 3px solid #111827; outline-offset: 3px; }
        .service-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.1rem; }
        .service-card {
          min-width: 0;
          padding: 1.2rem;
          border: 1px solid #E7DFD4;
          border-radius: 20px;
          background: rgba(255,255,255,0.96);
          box-shadow: 0 6px 20px rgba(45,30,15,0.045);
          display: flex;
          flex-direction: column;
          transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
        }
        .service-card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(45,30,15,0.09); border-color: #D5C5B1; }
        .service-sample-button {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          margin-top: auto;
          padding: 0.65rem 0.75rem 0;
          border: 0;
          background: transparent;
          color: #303342;
          font: inherit;
          font-size: 0.77rem;
          font-weight: 850;
          text-align: left;
          cursor: pointer;
        }
        .service-flow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
        @media (max-width: 980px) { .service-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 640px) {
          .service-grid, .service-flow { grid-template-columns: minmax(0, 1fr); }
          .service-card { padding: 1rem; }
        }
        @media (prefers-reduced-motion: reduce) { .service-filter, .service-card { transition: none; } }
      `}</style>

      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '2.2rem' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 900, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#D34F63', marginBottom: '0.6rem' }}>Practical help, organized locally</div>
          <h2 className="section-title">Small tasks. Real community support.</h2>
          <p className="section-subtitle" style={{ margin: '0 auto' }}>
            Municipalities choose which services to offer and set local volunteer requirements. Browse these examples to see the kinds of help a request might describe.
          </p>

          <div className="service-filter-row" role="group" aria-label="Filter example services" style={{ marginTop: '1.6rem' }}>
            {categories.map((category) => {
              const selected = activeCategory === category.id;
              const count = category.id === 'all' ? services.length : services.filter((service) => service.category === category.id).length;
              return (
                <button
                  key={category.id}
                  type="button"
                  className="service-filter"
                  aria-pressed={selected}
                  onClick={() => { setActiveCategory(category.id); setExpandedService(null); }}
                  style={{ background: selected ? '#181A22' : '#FFFFFF', color: selected ? '#FFFFFF' : '#4B5563', borderColor: selected ? '#181A22' : '#E2D7C7' }}
                >
                  <span aria-hidden="true" style={{ color: selected ? '#FCD34D' : '#7B8798' }}>{category.icon}</span>
                  {category.label}
                  <span style={{ fontSize: '0.66rem', opacity: selected ? 0.75 : 0.65 }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="service-grid" aria-live="polite">
          {filteredServices.map((service) => {
            const expanded = expandedService === service.id;
            return (
              <article className="service-card" key={service.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  <span aria-hidden="true" style={{ width: '44px', height: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '14px', background: service.tint, color: service.color, fontSize: '1.55rem', fontWeight: 900 }}>{service.icon}</span>
                  <span style={{ padding: '0.28rem 0.55rem', borderRadius: '999px', background: service.tint, color: service.color, fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.06em' }}>{service.categoryLabel}</span>
                </div>
                <h3 style={{ color: '#111827', fontSize: '1.08rem', lineHeight: 1.3, fontWeight: 900, marginBottom: '0.25rem' }}>{service.title}</h3>
                <div style={{ color: '#047857', fontSize: '0.77rem', fontWeight: 750, marginBottom: '0.65rem' }}>{service.malayalam}</div>
                <p style={{ color: '#4B5563', fontSize: '0.82rem', lineHeight: 1.6, marginBottom: '0.9rem' }}>{service.description}</p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.95rem' }}>
                  <span style={{ padding: '0.32rem 0.55rem', borderRadius: '8px', background: '#F7F4EF', color: '#4B5563', fontSize: '0.68rem', fontWeight: 750 }}>◷ Example time: {service.timing}</span>
                  <span style={{ padding: '0.32rem 0.55rem', borderRadius: '8px', background: '#F7F4EF', color: '#4B5563', fontSize: '0.68rem', fontWeight: 750 }}>⌖ Local rules apply</span>
                </div>

                {expanded && (
                  <div style={{ padding: '0.85rem', marginBottom: '0.75rem', borderRadius: '13px', background: service.tint, border: `1px solid ${service.color}30` }}>
                    <div style={{ color: service.color, fontSize: '0.64rem', fontWeight: 900, letterSpacing: '0.07em', marginBottom: '0.3rem' }}>SAMPLE REQUEST · NOT A LIVE TASK</div>
                    <p style={{ color: '#303342', fontSize: '0.79rem', lineHeight: 1.55, fontWeight: 650 }}>{service.sample}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.55rem', color: '#5B6577', fontSize: '0.67rem', fontWeight: 750 }}>
                      <span>{service.area}</span><span>•</span><span>{service.timing}</span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="service-sample-button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedService(expanded ? null : service.id)}
                >
                  {expanded ? 'Hide example' : 'See an example request'} <span aria-hidden="true">{expanded ? '↑' : '→'}</span>
                </button>
              </article>
            );
          })}
        </div>

        <div style={{ marginTop: '2rem', padding: '1.2rem', border: '1px solid #E7DFD4', borderRadius: '20px', background: 'linear-gradient(110deg, #FFFFFF, #FFFDF9)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.9rem' }}>
            <div>
              <div style={{ color: '#D34F63', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>From request to volunteer</div>
              <h3 style={{ color: '#111827', fontSize: '1.05rem', fontWeight: 900, marginTop: '0.15rem' }}>What happens next?</h3>
            </div>
            <span style={{ padding: '0.3rem 0.6rem', borderRadius: '999px', background: '#F4EBE0', color: '#5B6577', fontSize: '0.66rem', fontWeight: 800 }}>A simple example flow</span>
          </div>
          <div className="service-flow">
            {[
              { number: '01', title: 'Choose a service', text: 'Select a locally available kind of help.' },
              { number: '02', title: 'Describe the request', text: 'Choose a time and enter the service location.' },
              { number: '03', title: 'Match with a volunteer', text: 'Suitable volunteers receive an offer to accept or decline.' },
            ].map((step, index) => (
              <div key={step.number} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.8rem', borderRadius: '13px', background: '#FAF7F2' }}>
                <span style={{ flex: '0 0 28px', width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: ['#EAF6FF', '#FFF0F2', '#EAF8F1'][index], color: ['#0284C7', '#D34F63', '#059669'][index], fontSize: '0.63rem', fontWeight: 900 }}>{step.number}</span>
                <div><div style={{ color: '#111827', fontSize: '0.78rem', fontWeight: 900 }}>{step.title}</div><p style={{ color: '#5B6577', fontSize: '0.7rem', lineHeight: 1.5, marginTop: '0.15rem' }}>{step.text}</p></div>
              </div>
            ))}
          </div>
          <p style={{ color: '#6B7280', fontSize: '0.7rem', lineHeight: 1.5, marginTop: '0.8rem' }}>
            Samples are illustrative, not live requests. Municipalities decide which services are enabled and how many volunteers a task needs. This network is not for medical emergencies.
          </p>
        </div>
      </div>
    </section>
  );
}
