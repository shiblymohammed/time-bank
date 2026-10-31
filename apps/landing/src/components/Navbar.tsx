'use client';

import React, { useState, useEffect } from 'react';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 25);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        zIndex: 1000,
        transition: 'background 0.3s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        background: scrolled
          ? 'rgba(255, 255, 255, 0.96)'
          : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled
          ? '1px solid rgba(0, 0, 0, 0.08)'
          : '1px solid transparent',
        boxShadow: scrolled
          ? '0 4px 24px -2px rgba(45, 30, 15, 0.08)'
          : 'none',
        padding: scrolled ? '0.75rem 0' : '1.25rem 0',
      }}
    >
      {/* Full-Width Edge-to-Edge Navigation Bar */}
      <div
        style={{
          width: '100%',
          padding: '0 clamp(1.5rem, 3.5vw, 4rem)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '2rem',
        }}
      >
        {/* Brand Logo & Authority Label */}
        <a
          href="#"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '11px',
              background: '#FFFFFF',
              boxShadow: scrolled
                ? '0 2px 8px rgba(0, 0, 0, 0.06)'
                : '0 4px 14px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1.5px solid #E5DFD5',
              flexShrink: 0,
              transition: 'all 0.25s',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
              <circle cx="36" cy="28" r="10" fill="#FF5A5F" />
              <path
                d="M 24 54 C 24 40, 48 40, 56 52 C 64 64, 76 68, 80 58 C 84 48, 76 38, 64 42"
                stroke="#FF5A5F"
                strokeWidth="11"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="64" cy="72" r="10" fill="#6366F1" />
              <path
                d="M 76 46 C 76 60, 52 60, 44 48 C 36 36, 24 32, 20 42 C 16 52, 24 62, 36 58"
                stroke="#6366F1"
                strokeWidth="11"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontWeight: 900,
                fontSize: '1.15rem',
                letterSpacing: '-0.025em',
                color: '#111827',
                lineHeight: 1.15,
                textTransform: 'uppercase',
              }}
            >
              Indian Time Bank
            </div>
            <div
              style={{
                fontSize: '0.74rem',
                color: '#6B7280',
                fontWeight: 700,
                letterSpacing: '0.01em',
              }}
            >
              Kottakkal Municipality Pilot • ഭാരതീയ ടൈം ബാങ്ക്
            </div>
          </div>
        </a>

        {/* Clear Desktop Navigation Links */}
        <nav
          className="desktop-nav"
          style={{
            alignItems: 'center',
            gap: 'clamp(1rem, 2vw, 2.2rem)',
            fontSize: '0.92rem',
            fontWeight: 700,
            color: '#374151',
          }}
        >
          <a
            href="#app-showcase"
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              transition: 'all 0.15s',
            }}
          >
            Live Platform
          </a>
          <a
            href="#how-it-works"
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              transition: 'all 0.15s',
            }}
          >
            How It Works
          </a>
          <a
            href="#services"
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              transition: 'all 0.15s',
            }}
          >
            Services & Tasks
          </a>
          <a
            href="#currencies"
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              transition: 'all 0.15s',
            }}
          >
            Time Credits
          </a>
          <a
            href="#municipalities"
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              transition: 'all 0.15s',
            }}
          >
            Municipalities
          </a>
          <a
            href="#faq"
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              transition: 'all 0.15s',
            }}
          >
            FAQ
          </a>
        </nav>

        {/* Action CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          <a
            href="http://localhost:3000"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '0.88rem',
              fontWeight: 800,
              color: '#111827',
              padding: '0.55rem 1rem',
              borderRadius: '9999px',
              background: scrolled
                ? '#FAF5EE'
                : 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(10px)',
              border: scrolled
                ? '1.5px solid #E5DFD5'
                : '1.5px solid rgba(0, 0, 0, 0.08)',
              boxShadow: scrolled
                ? 'none'
                : '0 2px 10px rgba(0, 0, 0, 0.04)',
              transition: 'all 0.25s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <span>Coordinator Portal</span>
            <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>↗</span>
          </a>

          <a
            href="#get-started"
            className="btn-dark-pill"
            style={{
              fontSize: '0.9rem',
              padding: '0.65rem 1.45rem',
              fontWeight: 800,
            }}
          >
            <span>Get Started</span>
            <div className="arrow-circle">→</div>
          </a>

          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="mobile-toggle"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              border: '1.5px solid #E5DFD5',
              background: '#FFFFFF',
              color: '#111827',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
            }}
            aria-label="Toggle navigation menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              {mobileMenuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#FFFFFF',
            borderBottom: '1px solid #E5DFD5',
            padding: '1.5rem 2rem',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <a href="#app-showcase" onClick={() => setMobileMenuOpen(false)} style={{ color: '#111827', fontWeight: 700 }}>Live Platform</a>
          <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} style={{ color: '#111827', fontWeight: 700 }}>How It Works</a>
          <a href="#services" onClick={() => setMobileMenuOpen(false)} style={{ color: '#111827', fontWeight: 700 }}>Services & Tasks</a>
          <a href="#currencies" onClick={() => setMobileMenuOpen(false)} style={{ color: '#111827', fontWeight: 700 }}>Time Credits</a>
          <a href="#municipalities" onClick={() => setMobileMenuOpen(false)} style={{ color: '#111827', fontWeight: 700 }}>Municipalities</a>
          <a href="#faq" onClick={() => setMobileMenuOpen(false)} style={{ color: '#111827', fontWeight: 700 }}>FAQ</a>
          <div style={{ paddingTop: '1rem', borderTop: '1px solid #F3ECE2', display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
            <a
              href="http://localhost:3000"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Coordinator Portal (:3000) ↗
            </a>
            <a
              href="#get-started"
              onClick={() => setMobileMenuOpen(false)}
              className="btn-dark-pill"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <span>Get Started</span>
              <div className="arrow-circle">→</div>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
