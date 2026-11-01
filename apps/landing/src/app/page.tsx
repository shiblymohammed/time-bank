import React from 'react';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { AppShowcase } from '../components/AppShowcase';
import { HowItWorks } from '../components/HowItWorks';
import { TwoCurrencies } from '../components/TwoCurrencies';
import { ServiceCatalogue } from '../components/ServiceCatalogue';
import { Municipalities } from '../components/Municipalities';
import { SafetyGovernance } from '../components/SafetyGovernance';
import { Faq } from '../components/Faq';
import { Footer } from '../components/Footer';

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      <Navbar />

      <main style={{ flex: 1 }}>
        <Hero />
        <AppShowcase />
        <HowItWorks />
        <TwoCurrencies />
        <ServiceCatalogue />
        <Municipalities />
        <SafetyGovernance />
        <Faq />

        <section id="get-started" className="section" style={{ background: '#F3ECE2', textAlign: 'center', padding: '4rem 0' }}>
          <div className="container" style={{ maxWidth: '900px' }}>
            <h2 className="section-title" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.7rem)', marginBottom: '0.7rem' }}>
              Your time can make a difference.
            </h2>
            <p className="section-subtitle" style={{ margin: '0 auto 1.5rem' }}>
              See how volunteering works, then check with your municipality to find out whether the service is available in your area.
            </p>
            <a href="#how-it-works" className="btn-dark-pill" style={{ display: 'inline-flex' }}>
              <span>Become a Volunteer</span>
              <span className="arrow-circle" aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
