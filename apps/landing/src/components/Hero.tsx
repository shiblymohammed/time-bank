'use client';

import React from 'react';

export function Hero() {
  return (
    <section
      style={{
        paddingTop: 0,
        paddingBottom: '5.5rem',
        background: '#FAF5EE',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 1. Full-Width Panoramic Leadership Photograph extending under Navbar */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 'clamp(580px, 66vw, 960px)',
            overflow: 'hidden',
          }}
        >
          <img
            src="/kerala-leaders.png"
            alt="Kerala Civic Leadership beneath the Tricolor Sky — Kottakkal Time Bank Pilot"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 10%',
              display: 'block',
              WebkitMaskImage: 'linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 40%, rgba(0, 0, 0, 0.75) 56%, rgba(0, 0, 0, 0.35) 70%, rgba(0, 0, 0, 0.08) 82%, rgba(0, 0, 0, 0) 90%, rgba(0, 0, 0, 0) 100%)',
              maskImage: 'linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 40%, rgba(0, 0, 0, 0.75) 56%, rgba(0, 0, 0, 0.35) 70%, rgba(0, 0, 0, 0.08) 82%, rgba(0, 0, 0, 0) 90%, rgba(0, 0, 0, 0) 100%)',
            }}
          />

          {/* Very light top scrim so photograph's sky is fully visible directly behind navbar */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '120px',
              background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.08) 60%, transparent 100%)',
              pointerEvents: 'none',
            }}
          />

          {/* Deep organic gradient fade that completely dissolves into the page background */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 'clamp(320px, 42vw, 540px)',
              background: 'linear-gradient(180deg, rgba(250, 245, 238, 0) 0%, rgba(250, 245, 238, 0.2) 28%, rgba(250, 245, 238, 0.65) 55%, rgba(250, 245, 238, 0.94) 78%, #FAF5EE 90%, #FAF5EE 100%)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* 2. Unified Title, Slogan, and Narrative Section */}
      <div
        className="container"
        style={{
          position: 'relative',
          marginTop: 'clamp(-290px, -26vw, -180px)',
          zIndex: 3,
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '920px', margin: '0 auto' }}>
          {/* Official Civic Authority Label */}
          <div
            style={{
              fontSize: '0.82rem',
              fontWeight: 800,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: '#FF5A5F',
              marginBottom: '0.65rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(255, 255, 255, 0.92)',
              padding: '0.35rem 1rem',
              borderRadius: '9999px',
              border: '1.5px solid rgba(226, 215, 199, 0.85)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
            }}
          >
            <span>🏛️</span>
            <span>Kottakkal Municipality Pilot • Kerala Mutual Aid Network</span>
          </div>

          {/* Main Hero Headline */}
          <h1
            style={{
              fontSize: 'clamp(2.6rem, 5vw, 4.4rem)',
              fontWeight: 900,
              lineHeight: 1.12,
              letterSpacing: '-0.035em',
              color: '#111827',
              marginBottom: '0.65rem',
            }}
          >
            Small time.{' '}
            <span style={{ color: '#FF5A5F' }}>Big change.</span>
          </h1>

          {/* Authentic Malayalam Slogan (Refined & Compact) */}
          <div
            style={{
              fontSize: 'clamp(0.98rem, 1.45vw, 1.2rem)',
              fontWeight: 700,
              color: '#047857',
              marginBottom: '0.7rem',
              lineHeight: 1.45,
              letterSpacing: '0.01em',
            }}
          >
            നിങ്ങളുടെ സമയം, കരുതലോടെ നാടിനായി • പരസ്പര സഹായത്തിന്റെ പുതിയ കേരള മാതൃക
          </div>

          {/* Plain, Understandable Narrative (Refined & Compact) */}
          <p
            style={{
              fontSize: 'clamp(0.92rem, 1.2vw, 1.05rem)',
              color: '#4B5563',
              lineHeight: 1.65,
              maxWidth: '680px',
              margin: '0 auto 1.6rem auto',
              fontWeight: 500,
            }}
          >
            India&rsquo;s first municipal time banking initiative. Give an hour of voluntary care to an elderly neighbor or student in Kottakkal, and accumulate universal time credits in your secure national wallet that never expire.
          </p>

          {/* Action CTAs */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1.75rem',
            }}
          >
            <a
              href="http://localhost:3000"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-dark-pill"
              style={{
                padding: '0.9rem 2.1rem',
                fontSize: '1rem',
                gap: '0.8rem',
                boxShadow: '0 8px 24px rgba(24, 26, 34, 0.26)',
                border: '1.5px solid rgba(255, 255, 255, 0.12)',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10B981',
                  boxShadow: '0 0 10px #10B981',
                  flexShrink: 0,
                }}
              />
              <span>Become a Volunteer</span>
              <div className="arrow-circle">→</div>
            </a>

            <a
              href="#how-it-works"
              className="btn-outline"
              style={{
                padding: '0.9rem 1.9rem',
                fontSize: '1rem',
                gap: '0.6rem',
                background: 'rgba(255, 255, 255, 0.95)',
                border: '1.5px solid #D9CBB9',
                backdropFilter: 'blur(10px)',
              }}
            >
              <span style={{ fontSize: '0.82rem', color: '#FF5A5F' }}>▶</span>
              <span>See How It Works</span>
            </a>
          </div>

          {/* 3. Civic Trust Badges Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1rem',
              maxWidth: '920px',
              margin: '0 auto',
            }}
          >
            {/* Card 1: Official Pilot */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.9rem',
                padding: '0.95rem 1.25rem',
                background: 'rgba(255, 255, 255, 0.92)',
                borderRadius: '16px',
                border: '1.5px solid rgba(226, 215, 199, 0.85)',
                boxShadow: '0 4px 16px -2px rgba(45, 30, 15, 0.05)',
                backdropFilter: 'blur(10px)',
                textAlign: 'left',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0,
                }}
              >
                🏛️
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#111827', lineHeight: 1.3 }}>
                  Official Municipality Pilot
                </div>
                <div style={{ fontSize: '0.76rem', fontWeight: 500, color: '#6B7280', marginTop: '0.2rem' }}>
                  Kottakkal, Malappuram • Kerala
                </div>
              </div>
            </div>

            {/* Card 2: Free Senior Assistance */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.9rem',
                padding: '0.95rem 1.25rem',
                background: 'rgba(255, 255, 255, 0.92)',
                borderRadius: '16px',
                border: '1.5px solid rgba(226, 215, 199, 0.85)',
                boxShadow: '0 4px 16px -2px rgba(45, 30, 15, 0.05)',
                backdropFilter: 'blur(10px)',
                textAlign: 'left',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#FFF1F2',
                  border: '1px solid #FECDD3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0,
                }}
              >
                🤝
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#111827', lineHeight: 1.3 }}>
                  100% Free Senior Care
                </div>
                <div style={{ fontSize: '0.76rem', fontWeight: 500, color: '#6B7280', marginTop: '0.2rem' }}>
                  Dignity assistance for elderly neighbors
                </div>
              </div>
            </div>

            {/* Card 3: Verified National Identity */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.9rem',
                padding: '0.95rem 1.25rem',
                background: 'rgba(255, 255, 255, 0.92)',
                borderRadius: '16px',
                border: '1.5px solid rgba(226, 215, 199, 0.85)',
                boxShadow: '0 4px 16px -2px rgba(45, 30, 15, 0.05)',
                backdropFilter: 'blur(10px)',
                textAlign: 'left',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#EEF2FF',
                  border: '1px solid #C7D2FE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0,
                }}
              >
                🛡️
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#111827', lineHeight: 1.3 }}>
                  Verified Citizen Identity
                </div>
                <div style={{ fontSize: '0.76rem', fontWeight: 500, color: '#6B7280', marginTop: '0.2rem' }}>
                  Aadhaar-authenticated safe network
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
