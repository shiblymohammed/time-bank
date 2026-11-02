'use client';

import React, { useState } from 'react';

type TabType = 'feed' | 'wallet' | 'radar' | 'shops';

export function AppShowcase() {
  const [activeTab, setActiveTab] = useState<TabType>('feed');
  const [activeFeedFilter, setActiveFeedFilter] = useState('All Tasks');
  const [selectedFeedItem, setSelectedFeedItem] = useState(0);
  const [selectedRadarPin, setSelectedRadarPin] = useState(0);
  const [radarPledged, setRadarPledged] = useState(false);
  const [nfcTapped, setNfcTapped] = useState(false);

  const options = [
    {
      id: 'feed' as TabType,
      icon: '🧭',
      badge: 'COMMUNITY FEED',
      title: 'Live Care Requests',
      malayalam: 'തത്സമയ സഹായ അഭ്യർത്ഥനകൾ',
      desc: 'Browse verified neighborhood requests across Kottakkal wards with real-time distance, category, and exact duration.',
      tag: '10 Tasks Active',
      color: '#059669',
      lightBg: '#ECFDF5',
      borderColor: '#A7F3D0',
    },
    {
      id: 'wallet' as TabType,
      icon: '💳',
      badge: 'TIME LEDGER',
      title: 'Universal Time Wallet',
      malayalam: 'സാർവത്രിക ടൈം വാലറ്റ്',
      desc: 'Your immutable sovereign hours ledger. 1 hour = 1 credit. Never expires, zero inflation, transferable to elderly parents.',
      tag: '24h 30m Balance',
      color: '#FF5A5F',
      lightBg: '#FFF1F2',
      borderColor: '#FECDD3',
    },
    {
      id: 'radar' as TabType,
      icon: '📍',
      badge: 'PROXIMITY RADAR',
      title: 'People Nearby Radar',
      malayalam: 'സമീപസ്ഥ സന്നദ്ധ ഭൂപടം',
      desc: 'Privacy-first geohash radar visualizing consented volunteers and urgent needs within 1 to 5 km without continuous tracking.',
      tag: 'Zero Tracking',
      color: '#6366F1',
      lightBg: '#EEF2FF',
      borderColor: '#C7D2FE',
    },
    {
      id: 'shops' as TabType,
      icon: '🛍️',
      badge: 'CIVIC PERKS',
      title: 'Partner Perks & NFC Tap',
      malayalam: 'വ്യാപാരി ആനുകൂല്യങ്ങൾ',
      desc: 'Redeem volunteer discounts at local Kottakkal merchants using contactless phone NFC tap or verified in-store QR code.',
      tag: 'Instant Tap',
      color: '#D97706',
      lightBg: '#FEF3C7',
      borderColor: '#FDE68A',
    },
  ];

  const feedItems = [
    /* Elderly Care (3 Tasks) */
    {
      title: 'Companionship for Saraswathy Amma',
      malayalam: 'മുതിർന്നവർക്കുള്ള സാന്ത്വന സഹവാസം',
      location: 'Kottakkal • Changuvetty (1.2 km)',
      duration: '2 Hours',
      tag: 'High Priority',
      category: 'Elderly Care',
      image: 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=800&q=80',
      requester: 'Mrs. Saraswathy Amma',
      rating: '⭐ 4.9 (28 verified reviews)',
      avatar: '👵',
      resident: 'Kottakkal Ward 7 Resident',
      desc: 'Looking for a kind neighbor to spend time, read Malayalam newspapers, and have evening conversations with Saraswathy Amma.',
      verified: 'Aadhaar & Ward Councillor Verified',
    },
    {
      title: 'Evening Walk & Reading Assistance',
      malayalam: 'വൈകുന്നേരത്തെ നടപ്പും വായനയും',
      location: 'Kottakkal • Town North (1.5 km)',
      duration: '1 Hour',
      tag: 'Senior Care',
      category: 'Elderly Care',
      image: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      requester: 'K. Narayanan Master (Age 79)',
      rating: '⭐ 5.0 (19 verified reviews)',
      avatar: '👴',
      resident: 'Kottakkal Ward 2 Resident',
      desc: 'Retired school headmaster needs a friendly companion for a gentle 30-minute courtyard walk and reading literary articles.',
      verified: 'Senior Citizen Care Guarantee (BR-02)',
    },
    {
      title: 'Clinic Escort & Prescription Check',
      malayalam: 'ആശുപത്രി സന്ദർശന കൂട്ടിരിപ്പ്',
      location: 'Kottakkal • Changuvetty Junction (0.8 km)',
      duration: '2.5 Hours',
      tag: 'Health Escort',
      category: 'Elderly Care',
      image: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
      requester: 'Devaki Amma & Daughter',
      rating: '⭐ 4.8 (14 verified reviews)',
      avatar: '👵',
      resident: 'Kottakkal Ward 5 Resident',
      desc: 'Need a caring neighbor to accompany Devaki Amma to the local municipal health center for routine blood pressure check and return.',
      verified: 'Health Sub-Centre Certified Escort',
    },

    /* Tuition (3 Tasks) */
    {
      title: 'Math Tuition for Class 8 Student',
      malayalam: 'എട്ടാം ക്ലാസ് കണക്ക് ട്യൂഷൻ',
      location: 'Kottakkal • Town East (2.4 km)',
      duration: '1.5 Hours',
      tag: 'Education',
      category: 'Tuition',
      image: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=80',
      requester: 'Master Rahul (Mother: Anitha)',
      rating: '⭐ 4.9 (18 verified reviews)',
      avatar: '👨‍🎓',
      resident: 'Kottakkal Ward 3 Resident',
      desc: 'Guidance needed in algebra and geometry fundamentals for upcoming school term exams. Evening sessions preferred.',
      verified: 'Parent Verified • Student Escort',
    },
    {
      title: 'English Reading & Creative Writing',
      malayalam: 'ഇംഗ്ലീഷ് വായന & സർഗ്ഗാത്മക രചന',
      location: 'Kottakkal • Kottur (1.9 km)',
      duration: '1 Hour',
      tag: 'Language',
      category: 'Tuition',
      image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=800&q=80',
      requester: 'Fathima & Sister (Class 6 & 7)',
      rating: '⭐ 4.8 (12 verified reviews)',
      avatar: '👩‍🎓',
      resident: 'Kottakkal Ward 9 Resident',
      desc: 'Seeking an enthusiastic college student to guide two sisters in conversational English, storytelling, and reading comprehension.',
      verified: 'Kottakkal Learning Node Certified',
    },
    {
      title: 'Basic Science Project Guidance',
      malayalam: 'സയൻസ് പ്രോജക്ട് മാർഗ്ഗനിർദ്ദേശം',
      location: 'Kottakkal • Changuvetty (2.1 km)',
      duration: '2 Hours',
      tag: 'STEM Mentoring',
      category: 'Tuition',
      image: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=800&q=80',
      requester: 'Aravind (Class 9 Student)',
      rating: '⭐ 4.9 (21 verified reviews)',
      avatar: '🧑‍🔬',
      resident: 'Kottakkal Ward 11 Resident',
      desc: 'Help needed to assemble a rainwater harvesting working model for the Malappuram district school science fair.',
      verified: 'Municipal School Club Certified',
    },

    /* Groceries & Medicine (2 Tasks) */
    {
      title: 'Grocery & Medicine Delivery for Elders',
      malayalam: 'മരുന്ന്, പലവ്യഞ്ജന വിതരണം',
      location: 'Kottakkal • Kottur (1.8 km)',
      duration: '1 Hour',
      tag: 'Essential Delivery',
      category: 'Groceries',
      image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80',
      requester: 'Mr. & Mrs. Nambiar',
      rating: '⭐ 5.0 (31 verified reviews)',
      avatar: '👴',
      resident: 'Kottakkal Ward 4 Resident',
      desc: 'Need help picking up Ayurvedic medications from Arya Vaidya Sala and groceries from the cooperative store.',
      verified: 'Senior Citizen Care Priority (BR-02)',
    },
    {
      title: 'Fresh Produce Cooperative Delivery',
      malayalam: 'ആഴ്ചയിലെ പച്ചക്കറി വിതരണ സഹായം',
      location: 'Kottakkal • Town Market (1.1 km)',
      duration: '1 Hour',
      tag: 'Local Market',
      category: 'Groceries',
      image: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=800&q=80',
      requester: 'Mariam Beevi (Ward 8)',
      rating: '⭐ 4.9 (16 verified reviews)',
      avatar: '👵',
      resident: 'Kottakkal Ward 8 Resident',
      desc: 'Assistance needed to buy fresh organic vegetables and milk from the morning farmers cooperative for an elderly couple.',
      verified: 'Ward Council Approved Aid',
    },

    /* Environment (2 Tasks) */
    {
      title: 'Kottakkal Green Bypass Tree Planting',
      malayalam: 'തണൽമര നടീൽ യജ്ഞം',
      location: 'Kottakkal • Bypass Road (3.5 km)',
      duration: '3 Hours',
      tag: 'Community Drive',
      category: 'Environment',
      image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80',
      requester: 'Kottakkal Green Council',
      rating: '⭐ 4.9 (52 verified reviews)',
      avatar: '🌱',
      resident: 'Municipal Partner Pilot',
      desc: 'Join 15 municipal volunteers to plant 60 native shade saplings along the Kottakkal bypass. Saplings & tools provided.',
      verified: 'Official Municipality Pilot Project',
    },
    {
      title: 'Public Herb Garden & Cleanliness Drive',
      malayalam: 'ഔഷധത്തോട്ട പരിപാലനം',
      location: 'Kottakkal • Civic Park (1.6 km)',
      duration: '2 Hours',
      tag: 'Eco Initiative',
      category: 'Environment',
      image: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=800&q=80',
      requester: 'Kottakkal Youth Voluntary Wing',
      rating: '⭐ 4.8 (37 verified reviews)',
      avatar: '🌿',
      resident: 'Municipal Park Committee',
      desc: 'Weeding, soil enrichment, and planting medicinal herbs (Tulsi, Brahmi) in the town public park demonstration zone.',
      verified: 'Ward Environment Committee',
    },
  ];

  const radarPins = [
    {
      id: 0,
      title: 'Companionship for Saraswathy Amma',
      malayalam: 'മുതിർന്നവർക്കുള്ള സാന്ത്വന സഹവാസം',
      category: 'Elderly Care',
      ward: 'Ward 7 • Changuvetty',
      distance: '1.2 km away',
      duration: '2 Hours',
      requester: 'Mrs. Saraswathy Amma (Age 84)',
      rating: '⭐ 4.9 (28 reviews)',
      avatar: '👵',
      desc: 'Spend time reading Malayalam news, having friendly tea-time conversations, and keeping evening company.',
      image: 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=800&q=80',
      icon: '👵',
      color: '#FF5A5F',
      x: '24%',
      y: '30%',
    },
    {
      id: 1,
      title: 'Math Tuition for Class 8 Student',
      malayalam: 'എട്ടാം ക്ലാസ് കണക്ക് ട്യൂഷൻ',
      category: 'Education',
      ward: 'Ward 3 • Town East',
      distance: '2.4 km away',
      duration: '1.5 Hours',
      requester: 'Master Rahul (Mother: Anitha)',
      rating: '⭐ 4.9 (18 reviews)',
      avatar: '👨‍🎓',
      desc: 'Guidance needed in algebra fundamentals and geometry for upcoming school term examinations.',
      image: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=80',
      icon: '📚',
      color: '#6366F1',
      x: '76%',
      y: '24%',
    },
    {
      id: 2,
      title: 'Ayurvedic Medicine & Groceries',
      malayalam: 'മരുന്ന്, പലവ്യഞ്ജന വിതരണം',
      category: 'Essential Aid',
      ward: 'Ward 4 • Kottur',
      distance: '1.8 km away',
      duration: '1 Hour',
      requester: 'Mr. & Mrs. Nambiar',
      rating: '⭐ 5.0 (31 reviews)',
      avatar: '👴',
      desc: 'Need help picking up Ayurvedic medications from Arya Vaidya Sala and groceries from the cooperative store.',
      image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80',
      icon: '💊',
      color: '#059669',
      x: '30%',
      y: '70%',
    },
    {
      id: 3,
      title: 'Bypass Shade Tree Planting Drive',
      malayalam: 'തണൽമര നടീൽ യജ്ഞം',
      category: 'Environment',
      ward: 'Ward 12 • Bypass Road',
      distance: '3.5 km away',
      duration: '3 Hours',
      requester: 'Kottakkal Green Council',
      rating: '⭐ 4.9 (52 reviews)',
      avatar: '🌱',
      desc: 'Join 15 municipal volunteers to plant 60 native shade saplings along the Kottakkal bypass. Tools provided.',
      image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80',
      icon: '🌱',
      color: '#10B981',
      x: '80%',
      y: '68%',
    },
    {
      id: 4,
      title: 'Public Herb Garden Weeding & Setup',
      malayalam: 'ഔഷധത്തോട്ട പരിപാലനം',
      category: 'Community',
      ward: 'Ward 6 • Civic Park',
      distance: '1.6 km away',
      duration: '2 Hours',
      requester: 'Youth Voluntary Wing',
      rating: '⭐ 4.8 (37 reviews)',
      avatar: '🌿',
      desc: 'Weeding, soil enrichment, and planting medicinal herbs (Tulsi, Brahmi) in the public park demonstration zone.',
      image: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=800&q=80',
      icon: '🌿',
      color: '#0284C7',
      x: '52%',
      y: '46%',
    },
  ];

  const filteredFeed = activeFeedFilter === 'All Tasks'
    ? feedItems
    : feedItems.filter(item => item.category === activeFeedFilter);

  const activeRequest = feedItems[selectedFeedItem] || feedItems[0];
  const activeRadarTask = radarPins[selectedRadarPin] || radarPins[0];
  if (!activeRequest || !activeRadarTask) return null;

  return (
    <section
      id="app-showcase"
      className="section"
      style={{
        background: 'linear-gradient(180deg, #FAF5EE 0%, #F5EDE2 25%, #F5EDE2 75%, #FAF5EE 100%)',
        borderTop: 'none',
        borderBottom: 'none',
        padding: '4.5rem 0 5rem 0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Inline styles for smooth transitions and unique interactive effects */}
      <style>{`
        @keyframes stageFadeIn {
          0% {
            opacity: 0;
            transform: translateY(10px) scale(0.995);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes radarRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulseBeacon {
          0%, 100% { opacity: 0.9; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(1.4); }
        }
        @keyframes nfcRipples {
          0% { box-shadow: 0 0 0 0 rgba(255, 90, 95, 0.6); }
          70% { box-shadow: 0 0 0 22px rgba(255, 90, 95, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 90, 95, 0); }
        }
        .stage-animated {
          animation: stageFadeIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .pulse-beacon {
          animation: pulseBeacon 2s infinite ease-in-out;
        }
        .radar-sweep-arm {
          animation: radarRotate 5s linear infinite;
          transform-origin: center center;
        }
        .nfc-tapped-wave {
          animation: nfcRipples 1.2s infinite ease-out;
        }
        .module-selector-card {
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .module-selector-card:hover {
          transform: translateY(-2px);
          border-color: #C4B29C !important;
        }
        .task-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .task-scroll-container::-webkit-scrollbar-track {
          background: #FAF5EE;
          border-radius: 9999px;
        }
        .task-scroll-container::-webkit-scrollbar-thumb {
          background: #D9CBB9;
          border-radius: 9999px;
        }
        .task-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #A39682;
        }
      `}</style>

      {/* Reduced-Margin Wide Container */}
      <div
        style={{
          width: '100%',
          maxWidth: '1620px',
          margin: '0 auto',
          padding: '0 clamp(1rem, 3.2vw, 3.5rem)',
        }}
      >
        {/* Master-Detail Asymmetric Split Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'clamp(330px, 32vw, 440px) minmax(0, 1fr)',
            gap: 'clamp(1.5rem, 2.8vw, 3rem)',
            alignItems: 'start',
            marginBottom: '2rem',
          }}
        >
          {/* ================= LEFT COLUMN: TITLE, DESC & UNIQUE MODULE SELECTOR ================= */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Header Content directly on Left (No Badge Above) */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h2
                style={{
                  fontSize: 'clamp(2rem, 3vw, 2.75rem)',
                  fontWeight: 900,
                  lineHeight: 1.15,
                  letterSpacing: '-0.035em',
                  color: '#111827',
                  marginBottom: '0.65rem',
                }}
              >
                Designed for Real Community Care
              </h2>

              <p
                style={{
                  fontSize: '0.95rem',
                  color: '#4B5563',
                  lineHeight: 1.6,
                  margin: 0,
                  fontWeight: 500,
                }}
              >
                India&rsquo;s first municipal mutual aid operating system. Select an interactive module below to preview how citizens, volunteers, and municipal coordinators in Kottakkal exchange dignified care without money.
              </p>
            </div>

            {/* Platform Modules Label with Live Pilot Tag */}
            <div
              style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                color: '#6B7280',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '0.65rem',
                paddingLeft: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Platform Modules</span>
              <span style={{ color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span className="pulse-beacon" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981' }} />
                <span>Kottakkal Pilot Active</span>
              </span>
            </div>

            {/* Unique Vertical Module Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {options.map((opt) => {
                const isSelected = activeTab === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setActiveTab(opt.id)}
                    role="button"
                    tabIndex={0}
                    className="module-selector-card"
                    style={{
                      position: 'relative',
                      padding: '0.95rem 1.15rem',
                      borderRadius: '18px',
                      background: isSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.72)',
                      border: isSelected ? `2.5px solid ${opt.color}` : '1.5px solid #E5DFD5',
                      boxShadow: isSelected
                        ? '0 12px 26px -6px rgba(45, 30, 15, 0.12), 0 4px 10px -2px rgba(45, 30, 15, 0.04)'
                        : '0 2px 6px rgba(45, 30, 15, 0.02)',
                      cursor: 'pointer',
                      transform: isSelected ? 'translateX(4px)' : 'none',
                    }}
                  >
                    {/* Active Accent Bar */}
                    {isSelected && (
                      <div
                        style={{
                          position: 'absolute',
                          left: '0',
                          top: '12px',
                          bottom: '12px',
                          width: '4px',
                          borderRadius: '0 4px 4px 0',
                          background: opt.color,
                        }}
                      />
                    )}

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                      {/* Icon Container */}
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '12px',
                          background: opt.lightBg,
                          border: `1.5px solid ${opt.borderColor}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.2rem',
                          flexShrink: 0,
                          transition: 'transform 0.25s',
                          transform: isSelected ? 'scale(1.05)' : 'none',
                        }}
                      >
                        {opt.icon}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '0.15rem',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              color: opt.color,
                            }}
                          >
                            {opt.badge}
                          </span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              color: isSelected ? '#FFFFFF' : '#4B5563',
                              background: isSelected ? opt.color : '#F3ECE2',
                              padding: '0.12rem 0.5rem',
                              borderRadius: '9999px',
                              transition: 'all 0.25s',
                            }}
                          >
                            {opt.tag}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: '0.98rem',
                            fontWeight: 900,
                            color: '#111827',
                            marginBottom: '0.15rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>{opt.title}</span>
                          <span
                            style={{
                              fontSize: '0.9rem',
                              color: opt.color,
                              fontWeight: 900,
                              opacity: isSelected ? 1 : 0,
                              transform: isSelected ? 'translateX(0)' : 'translateX(-6px)',
                              transition: 'all 0.25s',
                            }}
                          >
                            →
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: '0.74rem',
                            color: '#047857',
                            fontWeight: 700,
                            marginBottom: '0.25rem',
                            lineHeight: 1.25,
                          }}
                        >
                          {opt.malayalam}
                        </div>

                        <p
                          style={{
                            fontSize: '0.8rem',
                            color: '#5B6577',
                            lineHeight: 1.4,
                            margin: 0,
                            fontWeight: 500,
                          }}
                        >
                          {opt.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inviolable Civic Rule Ticker & Municipal Guarantee */}
            <div
              style={{
                marginTop: '0.85rem',
                padding: '0.85rem 1.15rem',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.78)',
                border: '1.5px solid #E5DFD5',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                boxShadow: '0 2px 6px rgba(45,30,15,0.02)',
              }}
            >
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.05rem',
                  flexShrink: 0,
                }}
              >
                ⚖️
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#111827' }}>
                  Core Invariant: 1 Hour = 1 Credit
                </div>
                <div style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 600 }}>
                  Every human hour has equal dignity • Non-inflationary • Zero rupee cost
                </div>
              </div>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: EXPANSIVE CIVIC PORTAL STAGE ================= */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '26px',
              border: '2px solid #D9CBB9',
              boxShadow: 'var(--shadow-float)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }}
          >
            {/* Custom Kerala Civic Kiosk Chrome Header */}
            <div
              style={{
                background: 'linear-gradient(180deg, #FAF5EE 0%, #F5ECE0 100%)',
                borderBottom: '1.5px solid #E8DDCF',
                padding: '0.85rem 1.4rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              {/* Device Window Dots */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FF5F56' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FFBD2E' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#27C93F' }} />
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#8C7C6D', marginLeft: '0.4rem', letterSpacing: '0.04em' }}>
                  CIVIC-OS v2.4
                </span>
              </div>

              {/* Verified Municipal Domain Pill */}
              <div
                style={{
                  background: '#FFFFFF',
                  padding: '0.35rem 1rem',
                  borderRadius: '9999px',
                  border: '1.5px solid #D9CBB9',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#374151',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 2px 6px rgba(45,30,15,0.03)',
                }}
              >
                <span style={{ color: '#059669', fontSize: '0.85rem' }}>🔒</span>
                <span>timebank.kottakkal.gov.in</span>
                <span style={{ color: '#D1D5DB' }}>/</span>
                <span style={{ color: '#FF5A5F', fontWeight: 800 }}>{activeTab}</span>
              </div>

              {/* Live Mesh Status */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  color: '#059669',
                  background: '#ECFDF5',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '9999px',
                  border: '1px solid #A7F3D0',
                }}
              >
                <span className="pulse-beacon" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                <span>Ward 1–14 Node Connected</span>
              </div>
            </div>

              {/* Window Content Stage (Re-renders with stage-animated on tab change) */}
              <div
                key={activeTab}
                className="stage-animated"
                style={{ padding: activeTab === 'shops' ? '2.2rem 2rem 0.65rem' : '1.85rem 2rem 1.5rem 2rem' }}
              >

                {/* ---------------- 1. LIVE CARE REQUESTS VIEW ---------------- */}
                {activeTab === 'feed' && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.8rem',
                        marginBottom: '1.25rem',
                      }}
                    >
                      <div>
                        <h3 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#111827', margin: 0 }}>
                          Active Requests Near You
                        </h3>
                        <div style={{ fontSize: '0.82rem', color: '#6B7280', fontWeight: 600, marginTop: '0.15rem' }}>
                          Showing {filteredFeed.length} verified mutual aid requests in Kottakkal Municipal Pilot
                        </div>
                      </div>

                      {/* Filter Pills */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                        {[
                          { id: 'All Tasks', label: 'All Tasks (10)' },
                          { id: 'Elderly Care', label: 'Elderly Care (3)' },
                          { id: 'Tuition', label: 'Tuition (3)' },
                          { id: 'Groceries', label: 'Groceries (2)' },
                          { id: 'Environment', label: 'Environment (2)' },
                        ].map((cat) => {
                          const isCatActive = activeFeedFilter === cat.id;
                          return (
                            <button
                              key={cat.id}
                              onClick={() => {
                                setActiveFeedFilter(cat.id);
                                const matchIndex = feedItems.findIndex(item => cat.id === 'All Tasks' || item.category === cat.id);
                                if (matchIndex >= 0) setSelectedFeedItem(matchIndex);
                              }}
                              style={{
                                padding: '0.35rem 0.85rem',
                                borderRadius: '9999px',
                                fontSize: '0.78rem',
                                fontWeight: 800,
                                background: isCatActive ? '#181A22' : '#FAF5EE',
                                color: isCatActive ? '#FFFFFF' : '#4B5563',
                                border: isCatActive ? '1.5px solid #181A22' : '1.5px solid #D9CBB9',
                                cursor: 'pointer',
                                transition: 'all 0.18s',
                              }}
                            >
                              {cat.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dual Grid: Scrollable Request List + Detail Inspector */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        gap: '1.5rem',
                        alignItems: 'start',
                      }}
                    >
                      {/* List of Requests */}
                      <div
                        className="task-scroll-container"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.8rem',
                          maxHeight: '560px',
                          overflowY: 'auto',
                          paddingRight: '0.5rem',
                        }}
                      >
                        {filteredFeed.map((req, idx) => {
                          const isSelected = req.title === activeRequest.title;
                          return (
                            <div
                              key={idx}
                              onClick={() => setSelectedFeedItem(feedItems.findIndex(f => f.title === req.title))}
                              style={{
                                padding: '0.95rem 1.15rem',
                                borderRadius: '16px',
                                background: isSelected ? '#FFFDF9' : '#FFFFFF',
                                border: isSelected ? '2px solid #FF5A5F' : '1.5px solid #E8DDCF',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.6rem',
                                boxShadow: isSelected ? '0 6px 18px rgba(255, 90, 95, 0.12)' : '0 2px 6px rgba(0,0,0,0.02)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                transform: isSelected ? 'scale(1.01)' : 'none',
                              }}
                            >
                              {/* Top Meta Line: Category & Location + Duration Pill */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.74rem', color: '#6B7280', fontWeight: 700 }}>
                                  <span style={{ color: '#047857', fontWeight: 800 }}>{req.category}</span>
                                  <span>•</span>
                                  <span>📍 {req.location}</span>
                                </div>
                                <span
                                  style={{
                                    fontSize: '0.78rem',
                                    fontWeight: 900,
                                    color: '#FF5A5F',
                                    background: '#FFF0F0',
                                    padding: '0.2rem 0.65rem',
                                    borderRadius: '9999px',
                                    border: '1px solid #FFCDCF',
                                    flexShrink: 0,
                                  }}
                                >
                                  {req.duration}
                                </span>
                              </div>

                              {/* Bottom Line: Image + Full Title & Malayalam Name */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                <img
                                  src={req.image}
                                  alt={req.title}
                                  style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    objectFit: 'cover',
                                    border: '1.5px solid #E8DDCF',
                                    flexShrink: 0,
                                  }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#111827', lineHeight: 1.35 }}>
                                    {req.title}
                                  </div>
                                  <div style={{ fontSize: '0.74rem', color: '#047857', fontWeight: 600, marginTop: '0.15rem' }}>
                                    {req.malayalam}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {filteredFeed.length > 3 && (
                          <div style={{ textAlign: 'center', fontSize: '0.74rem', color: '#9CA3AF', fontWeight: 700, padding: '0.35rem 0' }}>
                            Showing all {filteredFeed.length} active tasks • Scroll to browse ↓
                          </div>
                        )}
                      </div>

                      {/* Detailed Active Card Preview */}
                      <div
                        style={{
                          background: '#FAF5EE',
                          borderRadius: '20px',
                          padding: '1.4rem',
                          border: '2px solid #E8DDCF',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: '560px',
                          boxShadow: '0 4px 14px rgba(45,30,15,0.04)',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              position: 'relative',
                              height: '170px',
                              borderRadius: '14px',
                              overflow: 'hidden',
                              marginBottom: '1rem',
                              border: '1.5px solid #E8DDCF',
                            }}
                          >
                            <img
                              src={activeRequest.image}
                              alt={activeRequest.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                top: '10px',
                                left: '10px',
                                background: 'rgba(24, 26, 34, 0.82)',
                                backdropFilter: 'blur(8px)',
                                padding: '0.25rem 0.75rem',
                                borderRadius: '9999px',
                                color: '#FFFFFF',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                              }}
                            >
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                              <span>{activeRequest.tag}</span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                            <h4 style={{ fontSize: '1.18rem', fontWeight: 900, color: '#111827', lineHeight: 1.3 }}>
                              {activeRequest.title}
                            </h4>
                            <span
                              style={{
                                fontSize: '0.84rem',
                                fontWeight: 900,
                                color: '#FF5A5F',
                                background: '#FFFFFF',
                                padding: '0.25rem 0.65rem',
                                borderRadius: '9999px',
                                border: '1px solid #FFCDCF',
                              }}
                            >
                              {activeRequest.duration}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.78rem', color: '#047857', fontWeight: 700, marginBottom: '0.5rem' }}>
                            {activeRequest.malayalam}
                          </div>

                          <div style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.75rem', fontWeight: 600 }}>
                            📍 {activeRequest.location}
                          </div>

                          <p style={{ color: '#374151', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '1.15rem' }}>
                            &ldquo;{activeRequest.desc}&rdquo;
                          </p>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.75rem 0.95rem',
                              background: '#FFFFFF',
                              borderRadius: '12px',
                              marginBottom: '1.15rem',
                              border: '1.5px solid #E8DDCF',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <div style={{ fontSize: '1.25rem' }}>{activeRequest.avatar}</div>
                              <div>
                                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#111827' }}>
                                  {activeRequest.requester}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#B45309', fontWeight: 700 }}>
                                  {activeRequest.rating}
                                </div>
                              </div>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 800 }}>
                              {activeRequest.resident}
                            </span>
                          </div>
                        </div>

                        <a
                          href="http://localhost:3000"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-dark-pill"
                          style={{
                            width: '100%',
                            padding: '0.85rem',
                            justifyContent: 'center',
                            fontSize: '0.92rem',
                            cursor: 'pointer',
                          }}
                        >
                          <span>Offer {activeRequest.duration} of Aid</span>
                          <div className="arrow-circle">→</div>
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* ---------------- 2. UNIVERSAL TIME WALLET VIEW ---------------- */}
                {activeTab === 'wallet' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                    <div>
                      <div style={{ background: 'linear-gradient(135deg, #FFF6EC 0%, #FFE9DC 60%, #FFDAC6 100%)', border: '1.5px solid #FFC9B2', borderRadius: '22px', padding: '1.6rem', boxShadow: '0 8px 24px -4px rgba(255, 90, 95, 0.12)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#92400E', letterSpacing: '0.06em', textTransform: 'uppercase' }}>My time credit balance</span>
                          <span style={{ fontSize: '0.7rem', color: '#6B7280', background: 'rgba(255,255,255,0.8)', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontWeight: 800 }}>SAMPLE PROFILE</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem', margin: '0.55rem 0 0.15rem' }}>
                          <span style={{ fontSize: 'clamp(2.5rem, 5vw, 3.35rem)', fontWeight: 900, color: '#111827', letterSpacing: '-0.05em', lineHeight: 1.1 }}>24h 30m</span>
                          <span style={{ fontSize: '0.92rem', color: '#5B6577', fontWeight: 700 }}>available</span>
                        </div>
                        <p style={{ color: '#4B5563', fontSize: '0.85rem', lineHeight: 1.55, marginBottom: '1.2rem' }}>A sample balance from verified volunteer hours. It is a record of time contributed, not money.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: '0.65rem' }}>
                          {[
                            { label: 'Earned', value: '32h', note: 'verified service', color: '#047857' },
                            { label: 'Shared', value: '7h 30m', note: 'with a nominee', color: '#6366F1' },
                          ].map((item) => (
                            <div key={item.label} style={{ background: '#FFFFFF', padding: '0.8rem 0.9rem', borderRadius: '14px', border: '1px solid #FFD9C7' }}>
                              <div style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: item.color, margin: '0.1rem 0' }}>{item.value}</div>
                              <div style={{ fontSize: '0.7rem', color: '#5B6577' }}>{item.note}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginTop: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.7rem' }}>
                          <h4 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#111827' }}>Recent activity</h4>
                          <span style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 700 }}>Illustrative entries</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          {[
                            { desc: 'Reading support • Ward 3', date: '18 Oct 2026 · Verified', delta: '+1h 30m', type: 'earned', icon: '📚', detail: '1h 30m verified service = 1h 30m credits' },
                            { desc: 'Community garden day', date: '12 Oct 2026 · Verified', delta: '+3h', type: 'earned', icon: '🌱', detail: 'Added after coordinator verification' },
                            { desc: 'Shared with family nominee', date: '08 Oct 2026 · Completed', delta: '−2h', type: 'shared', icon: '🤝', detail: 'Sample transfer from this wallet' },
                          ].map((tx) => (
                            <div key={tx.desc} style={{ padding: '0.75rem 0.9rem', borderRadius: '14px', background: '#FFFDF9', border: '1px solid #E8DDCF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
                                <span aria-hidden="true" style={{ fontSize: '1.25rem' }}>{tx.icon}</span>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '0.83rem', fontWeight: 800, color: '#111827' }}>{tx.desc}</div>
                                  <div style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 600 }}>{tx.date} · {tx.detail}</div>
                                </div>
                              </div>
                              <span style={{ fontSize: '0.95rem', fontWeight: 900, color: tx.type === 'earned' ? '#047857' : '#6366F1', whiteSpace: 'nowrap' }}>{tx.delta}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <aside style={{ background: '#FFFFFF', borderRadius: '20px', padding: '1.35rem', border: '1.5px solid #E8DDCF', boxShadow: 'var(--shadow-card)' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#FF5A5F', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>How to read this wallet</div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#111827', marginBottom: '0.9rem' }}>One hour given, one credit recorded</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {[
                          { n: '1', title: 'Help your community', body: 'Give time through an approved volunteer activity.' },
                          { n: '2', title: 'Get the hours verified', body: 'A coordinator confirms the service before credits appear.' },
                          { n: '3', title: 'See a clear record', body: 'The ledger shows when credits were earned or shared.' },
                        ].map((step) => (
                          <div key={step.n} style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
                            <span style={{ width: '25px', height: '25px', borderRadius: '50%', background: '#FFF0F0', color: '#E04348', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 900, flexShrink: 0 }}>{step.n}</span>
                            <div>
                              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#111827' }}>{step.title}</div>
                              <p style={{ fontSize: '0.76rem', lineHeight: 1.5, color: '#5B6577' }}>{step.body}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '1rem', padding: '0.8rem', borderRadius: '12px', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', fontSize: '0.76rem', lineHeight: 1.5, fontWeight: 700 }}>
                        <span aria-hidden="true">✓ </span>Time credits are not cash and cannot be used to pay for help or merchant offers. Eligible beneficiaries receive approved assistance at no credit cost.
                      </div>
                      <div style={{ marginTop: '0.7rem', fontSize: '0.68rem', color: '#7B8798', lineHeight: 1.45 }}>All names, balances, dates, and activity shown here are fictional demo content.</div>
                    </aside>
                  </div>
                )}

                {/* ---------------- 3. PROXIMITY RADAR VIEW ---------------- */}
                {activeTab === 'radar' && (
                  <div>
                    {/* Header info strip */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.8rem',
                        marginBottom: '1.25rem',
                        paddingBottom: '1rem',
                        borderBottom: '1px solid #E8DDCF',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#4F46E5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Privacy-First Geohash Map
                          </span>
                          <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#059669', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '9999px', padding: '0.15rem 0.55rem' }}>
                            ● 5 Active Kottakkal Tasks
                          </span>
                        </div>
                        <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#111827', margin: 0 }}>
                          Kottakkal Ward Proximity Radar • സമീപസ്ഥ സന്നദ്ധ ഭൂപടം
                        </h3>
                        <p style={{ color: '#6B7280', fontSize: '0.82rem', margin: '0.25rem 0 0 0' }}>
                          Zero continuous tracking. Exact home addresses are protected using geohash-6 (150m radius). Click any task marker on the map to inspect and offer aid.
                        </p>
                      </div>

                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          background: '#FAF5EE',
                          border: '1px solid #E2D7C7',
                          borderRadius: '9999px',
                          padding: '0.35rem 0.8rem',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#4B5563',
                        }}
                      >
                        <span>📍 Center:</span>
                        <strong style={{ color: '#111827' }}>Kottakkal Municipal Hub</strong>
                      </div>
                    </div>

                    {/* Dual Column: Interactive Map (Left) + Detail Task Card (Right) */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                        gap: '1.35rem',
                        alignItems: 'stretch',
                      }}
                    >
                      {/* Left: Dummy Map Canvas */}
                      <div
                        style={{
                          position: 'relative',
                          height: '520px',
                          borderRadius: '18px',
                          background: '#F6F2E9',
                          border: '1.5px solid #E2D7C7',
                          overflow: 'hidden',
                          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(45,30,15,0.04)',
                        }}
                      >
                        {/* Realistic Kottakkal Vector Map SVG */}
                        <svg
                          viewBox="0 0 600 500"
                          style={{
                            width: '100%',
                            height: '100%',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            pointerEvents: 'none',
                          }}
                        >
                          <defs>
                            {/* Subtle terrain pattern */}
                            <pattern id="mapGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#ECE4D6" strokeWidth="0.8" />
                            </pattern>
                          </defs>

                          {/* Land Background */}
                          <rect width="600" height="500" fill="#F8F4EC" />
                          <rect width="600" height="500" fill="url(#mapGrid)" />

                          {/* Green Public Zone: Civic Park & Ayurvedic Botanical Grounds */}
                          <path
                            d="M 300 240 Q 360 220 440 260 T 460 360 T 360 390 T 310 320 Z"
                            fill="#E6F4EA"
                            stroke="#C8E6C9"
                            strokeWidth="1.5"
                          />
                          <text x="365" y="325" fill="#2E7D32" fontSize="9.5" fontWeight="700" letterSpacing="0.08em" opacity="0.85">
                            AYURVEDIC RESERVE & CIVIC PARK
                          </text>

                          {/* Water Stream / Canal: Achankovil Canal branch */}
                          <path
                            d="M 20 420 Q 140 380 230 330 T 410 210 T 580 120"
                            fill="none"
                            stroke="#D6EAF8"
                            strokeWidth="9"
                            strokeLinecap="round"
                          />
                          <path
                            d="M 20 420 Q 140 380 230 330 T 410 210 T 580 120"
                            fill="none"
                            stroke="#AED6F1"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                          />
                          <text x="135" y="390" fill="#2980B9" fontSize="8.5" fontWeight="700" opacity="0.75" transform="rotate(-15, 135, 390)">
                            ≈ Kottakkal Stream Canal ≈
                          </text>

                          {/* Ward Boundary Outlines (Subtle Dashed Polygons) */}
                          {/* Ward 7: Changuvetty */}
                          <path d="M 40 40 L 260 30 L 250 210 L 50 190 Z" fill="none" stroke="#D3C7B5" strokeWidth="1.2" strokeDasharray="5,4" />
                          <text x="75" y="75" fill="#8C7A65" fontSize="10" fontWeight="800" opacity="0.6">WARD 7 • CHANGUVETTY</text>

                          {/* Ward 3: Town East */}
                          <path d="M 340 30 L 570 40 L 560 210 L 330 200 Z" fill="none" stroke="#D3C7B5" strokeWidth="1.2" strokeDasharray="5,4" />
                          <text x="390" y="75" fill="#8C7A65" fontSize="10" fontWeight="800" opacity="0.6">WARD 3 • TOWN EAST</text>

                          {/* Ward 4: Kottur */}
                          <path d="M 50 260 L 260 250 L 270 470 L 60 460 Z" fill="none" stroke="#D3C7B5" strokeWidth="1.2" strokeDasharray="5,4" />
                          <text x="80" y="445" fill="#8C7A65" fontSize="10" fontWeight="800" opacity="0.6">WARD 4 • KOTTUR</text>

                          {/* Ward 12: Bypass Road */}
                          <path d="M 330 260 L 560 250 L 570 470 L 340 460 Z" fill="none" stroke="#D3C7B5" strokeWidth="1.2" strokeDasharray="5,4" />
                          <text x="400" y="445" fill="#8C7A65" fontSize="10" fontWeight="800" opacity="0.6">WARD 12 • BYPASS ROAD</text>

                          {/* Arterial Road Network */}
                          {/* NH 66 Bypass - Wide Road */}
                          <path d="M 30 480 Q 200 420 320 280 T 570 30" fill="none" stroke="#E5DAC9" strokeWidth="11" strokeLinecap="round" />
                          <path d="M 30 480 Q 200 420 320 280 T 570 30" fill="none" stroke="#FFF7ED" strokeWidth="5.5" strokeLinecap="round" />
                          <text x="450" y="115" fill="#B45309" fontSize="8" fontWeight="800" letterSpacing="0.05em" transform="rotate(-40, 450, 115)">
                            NH 66 BYPASS ARTERIAL
                          </text>

                          {/* Changuvetty - Kottakkal Main Road */}
                          <path d="M 40 130 Q 180 160 300 230 T 560 270" fill="none" stroke="#E5DAC9" strokeWidth="8" strokeLinecap="round" />
                          <path d="M 40 130 Q 180 160 300 230 T 560 270" fill="none" stroke="#FFFDF8" strokeWidth="4" strokeLinecap="round" />
                          <text x="90" y="145" fill="#78350F" fontSize="8" fontWeight="800" letterSpacing="0.04em" transform="rotate(10, 90, 145)">
                            CHANGUVETTY - MAIN RD
                          </text>

                          {/* Kottur Road Link */}
                          <path d="M 190 470 L 290 230 L 400 30" fill="none" stroke="#E5DAC9" strokeWidth="6" strokeLinecap="round" />
                          <path d="M 190 470 L 290 230 L 400 30" fill="none" stroke="#FFFDF8" strokeWidth="3" strokeLinecap="round" />

                          {/* Concentric Geohash Distance Rings from Municipal Center (290, 230) */}
                          <circle cx="290" cy="230" r="75" fill="none" stroke="#6366F1" strokeWidth="1" strokeDasharray="4,4" opacity="0.45" />
                          <circle cx="290" cy="230" r="145" fill="none" stroke="#6366F1" strokeWidth="1" strokeDasharray="5,5" opacity="0.3" />
                          <circle cx="290" cy="230" r="215" fill="none" stroke="#6366F1" strokeWidth="1" strokeDasharray="6,6" opacity="0.2" />

                          {/* Ring Distance Tags */}
                          <text x="290" y="150" fill="#4F46E5" fontSize="8.5" fontWeight="800" textAnchor="middle" opacity="0.8">1 km Geohash Zone</text>
                          <text x="290" y="80" fill="#4F46E5" fontSize="8.5" fontWeight="800" textAnchor="middle" opacity="0.65">2.5 km Geohash Zone</text>
                          <text x="290" y="20" fill="#4F46E5" fontSize="8.5" fontWeight="800" textAnchor="middle" opacity="0.5">5 km Municipal Outer Zone</text>
                        </svg>

                        {/* Subtle Animated Radar Sweep Overlay */}
                        <div
                          className="radar-sweep-arm"
                          style={{
                            position: 'absolute',
                            top: '-35%',
                            left: '-35%',
                            width: '170%',
                            height: '170%',
                            background: 'conic-gradient(from 0deg, rgba(99, 102, 241, 0.12) 0deg, transparent 55deg, transparent 360deg)',
                            pointerEvents: 'none',
                          }}
                        />

                        {/* Center Point Beacon: Kottakkal Town Hall Hub */}
                        <div
                          style={{
                            position: 'absolute',
                            left: '48.3%',
                            top: '46%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 12,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            pointerEvents: 'none',
                          }}
                        >
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="pulse-beacon" style={{ position: 'absolute', width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(79, 70, 229, 0.35)' }} />
                            <div
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: '#4F46E5',
                                border: '3px solid #FFFFFF',
                                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                color: '#FFF',
                              }}
                            >
                              📍
                            </div>
                          </div>
                          <span
                            style={{
                              marginTop: '3px',
                              background: '#111827',
                              color: '#FFFFFF',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '9999px',
                              fontSize: '0.66rem',
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                            }}
                          >
                            Municipal Hub (Center)
                          </span>
                        </div>

                        {/* 5 Clickable Interactive Task Pins */}
                        {radarPins.map((pin) => {
                          const isSelected = selectedRadarPin === pin.id;
                          return (
                            <button
                              key={pin.id}
                              type="button"
                              onClick={() => {
                                setSelectedRadarPin(pin.id);
                                setRadarPledged(false);
                              }}
                              style={{
                                position: 'absolute',
                                left: pin.x,
                                top: pin.y,
                                transform: isSelected ? 'translate(-50%, -50%) scale(1.08)' : 'translate(-50%, -50%) scale(1)',
                                zIndex: isSelected ? 20 : 15,
                                padding: '0.35rem 0.65rem 0.35rem 0.4rem',
                                borderRadius: '9999px',
                                background: isSelected ? '#111827' : '#FFFFFF',
                                color: isSelected ? '#FFFFFF' : '#111827',
                                border: isSelected ? `2.5px solid ${pin.color}` : `1.5px solid #D5C7B5`,
                                boxShadow: isSelected
                                  ? `0 8px 20px rgba(0,0,0,0.22), 0 0 0 4px ${pin.color}33`
                                  : '0 4px 14px rgba(45,30,15,0.12)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                                outline: 'none',
                              }}
                              title={`Click to inspect: ${pin.title}`}
                            >
                              <span
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  background: isSelected ? pin.color : `${pin.color}18`,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.85rem',
                                  flexShrink: 0,
                                }}
                              >
                                {pin.icon}
                              </span>
                              <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                  {pin.requester.split('(')[0]?.trim() ?? pin.requester}
                                </div>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: isSelected ? '#FCD34D' : '#6B7280' }}>
                                  {pin.distance} • {pin.duration}
                                </div>
                              </div>
                            </button>
                          );
                        })}

                        {/* Top-Left Map Legend */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '12px',
                            left: '12px',
                            background: 'rgba(255, 255, 255, 0.92)',
                            backdropFilter: 'blur(6px)',
                            padding: '0.4rem 0.75rem',
                            borderRadius: '10px',
                            border: '1px solid #E5DFD5',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: '#4B5563',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                          }}
                        >
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                          <span>Interactive Kottakkal Ward Pins</span>
                        </div>

                        {/* Bottom Safety Notice Tag */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            left: '12px',
                            right: '12px',
                            background: 'rgba(255, 255, 255, 0.92)',
                            backdropFilter: 'blur(6px)',
                            padding: '0.4rem 0.75rem',
                            borderRadius: '10px',
                            border: '1px solid #E5DFD5',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: '#4B5563',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            zIndex: 10,
                          }}
                        >
                          <span>🛡️ <strong>Zero Tracking:</strong> approximate coordinates blurred via 150m geohash-6 precision.</span>
                          <span style={{ color: '#4F46E5', fontWeight: 800 }}>Click any pin to inspect ↗</span>
                        </div>
                      </div>

                      {/* Right: Detailed Task Inspection Card */}
                      <div
                        style={{
                          background: '#FFFDF9',
                          borderRadius: '18px',
                          border: '1.5px solid #E8DDCF',
                          padding: '1.4rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          boxShadow: '0 8px 24px rgba(45,30,15,0.05)',
                        }}
                      >
                        {/* Task Card Top Badges */}
                        <div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.85rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  color: activeRadarTask.color,
                                  background: `${activeRadarTask.color}15`,
                                  border: `1px solid ${activeRadarTask.color}35`,
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: '9999px',
                                }}
                              >
                                {activeRadarTask.category}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  color: '#059669',
                                  background: '#ECFDF5',
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: '9999px',
                                }}
                              >
                                ⏱️ {activeRadarTask.duration} Time Credit
                              </span>
                            </div>

                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                color: '#6B7280',
                              }}
                            >
                              📍 {activeRadarTask.ward} ({activeRadarTask.distance})
                            </span>
                          </div>

                          {/* Task Image Preview */}
                          <div
                            style={{
                              position: 'relative',
                              width: '100%',
                              height: '145px',
                              borderRadius: '12px',
                              overflow: 'hidden',
                              marginBottom: '0.9rem',
                            }}
                          >
                            <img
                              src={activeRadarTask.image}
                              alt={activeRadarTask.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                bottom: '8px',
                                left: '8px',
                                background: 'rgba(17, 24, 39, 0.85)',
                                backdropFilter: 'blur(4px)',
                                color: '#FFFFFF',
                                fontSize: '0.66rem',
                                fontWeight: 700,
                                padding: '0.2rem 0.55rem',
                                borderRadius: '9999px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              <span>✓</span>
                              <span>Municipal Volunteer Task #{activeRadarTask.id + 1}</span>
                            </div>
                          </div>

                          {/* Titles */}
                          <h4 style={{ fontSize: '1.22rem', fontWeight: 900, color: '#111827', margin: '0 0 0.25rem 0', lineHeight: 1.3 }}>
                            {activeRadarTask.title}
                          </h4>
                          <div style={{ color: '#059669', fontSize: '0.86rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                            {activeRadarTask.malayalam}
                          </div>

                          {/* Narrative description quote */}
                          <p
                            style={{
                              color: '#4B5563',
                              fontSize: '0.84rem',
                              lineHeight: 1.5,
                              margin: '0 0 1rem 0',
                              background: '#F9F5EE',
                              padding: '0.75rem 0.9rem',
                              borderRadius: '10px',
                              borderLeft: `3px solid ${activeRadarTask.color}`,
                              fontStyle: 'italic',
                            }}
                          >
                            "{activeRadarTask.desc}"
                          </p>

                          {/* Requester Profile Strip */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.65rem 0.85rem',
                              borderRadius: '12px',
                              background: '#FFFFFF',
                              border: '1px solid #E8DDCF',
                              marginBottom: '1rem',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <span style={{ fontSize: '1.4rem' }}>{activeRadarTask.avatar}</span>
                              <div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#111827' }}>
                                  {activeRadarTask.requester}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 600 }}>
                                  {activeRadarTask.rating}
                                </div>
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                color: '#047857',
                                background: '#D1FAE5',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '9999px',
                              }}
                            >
                              ✓ Verified Citizen
                            </span>
                          </div>
                        </div>

                        {/* Interactive Action Button & Confirmation */}
                        <div>
                          {radarPledged && (
                            <div
                              style={{
                                padding: '0.7rem 0.85rem',
                                borderRadius: '10px',
                                background: '#ECFDF5',
                                border: '1px solid #A7F3D0',
                                color: '#065F46',
                                fontSize: '0.76rem',
                                lineHeight: 1.45,
                                marginBottom: '0.75rem',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '0.5rem',
                              }}
                            >
                              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🎉</span>
                              <div>
                                <strong>Pledge Recorded for {activeRadarTask.duration}!</strong>
                                <div>Your voluntary aid offer was sent to the Kottakkal Ward Coordinator. Upon completion, {activeRadarTask.duration} universal credits will be deposited to your wallet.</div>
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setRadarPledged(!radarPledged)}
                            className="btn-dark-pill"
                            style={{
                              width: '100%',
                              padding: '0.85rem 1rem',
                              fontSize: '0.88rem',
                              fontWeight: 900,
                              background: radarPledged ? '#059669' : '#111827',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '9999px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.5rem',
                              boxShadow: radarPledged
                                ? '0 6px 18px rgba(5, 150, 105, 0.35)'
                                : '0 6px 18px rgba(17, 24, 39, 0.25)',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <span>{radarPledged ? '✓ Aid Pledged Successfully' : `Offer ${activeRadarTask.duration} of Aid →`}</span>
                          </button>

                          <div style={{ textAlign: 'center', fontSize: '0.68rem', color: '#9CA3AF', marginTop: '0.55rem' }}>
                            India’s first municipal civic time bank • Zero cash exchange • Insured voluntary care
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ---------------- 4. PARTNER PERKS & NFC TAP VIEW ---------------- */}
                {activeTab === 'shops' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1.25rem', alignItems: 'start', minWidth: 0 }}>
                    <section style={{ minWidth: 0 }} aria-labelledby="sample-perks-heading">
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.45rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Local partner offers</div>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#6B7280', background: '#F4EBE0', borderRadius: '9999px', padding: '0.25rem 0.6rem' }}>SAMPLE OFFERS</span>
                      </div>
                      <h3 id="sample-perks-heading" style={{ fontSize: '1.35rem', fontWeight: 900, color: '#111827', marginBottom: '0.45rem' }}>A thank-you from participating businesses</h3>
                      <p style={{ color: '#4B5563', fontSize: '0.86rem', lineHeight: 1.55, marginBottom: '1rem' }}>
                        Example discounts sponsored by local merchants for eligible volunteers. Check each offer’s terms before redeeming.
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        {[
                          { name: 'Sample Wellness Store', cat: 'Health & wellness · Kottakkal', perk: '15% off selected first-aid items', icon: '🌿' },
                          { name: 'Sample Grocery Shop', cat: 'Groceries · Changuvetty', perk: '₹100 off a purchase of ₹500 or more', icon: '🛒' },
                          { name: 'Sample Neighbourhood Café', cat: 'Food & drink · Kottakkal East', perk: '20% off one beverage', icon: '☕' },
                        ].map((shop) => (
                          <article key={shop.name} style={{ padding: '0.8rem 0.9rem', borderRadius: '14px', background: '#FFFDF9', border: '1px solid #E8DDCF', display: 'flex', alignItems: 'flex-start', gap: '0.75rem', minWidth: 0 }}>
                            <span aria-hidden="true" style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#FEF3C7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>{shop.icon}</span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: '0.86rem', fontWeight: 900, color: '#111827', overflowWrap: 'anywhere' }}>{shop.name}</div>
                              <div style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 600, margin: '0.1rem 0 0.3rem' }}>{shop.cat}</div>
                              <div style={{ fontSize: '0.79rem', color: '#92400E', fontWeight: 800 }}>{shop.perk}</div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>

                    <aside style={{ minWidth: 0, background: 'linear-gradient(145deg, #181A22 0%, #2B2E3C 100%)', borderRadius: '20px', padding: '1.3rem', color: '#FFFFFF', boxShadow: '0 14px 32px rgba(24, 26, 34, 0.2)', border: '1px solid #374151' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#FCD34D', textTransform: 'uppercase', letterSpacing: '0.06em' }}>How redemption works</div>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#D1D5DB', background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.55rem', borderRadius: '9999px' }}>DEMO</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '15px', padding: '1rem', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.7rem', color: '#D1D5DB', fontWeight: 700 }}>EXAMPLE OFFER</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 900, margin: '0.2rem 0' }}>₹100 off groceries</div>
                        <div style={{ fontSize: '0.75rem', color: '#D1D5DB' }}>Sample Grocery Shop · Minimum purchase ₹500</div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem', marginBottom: '1rem' }}>
                        {[{ title: '1. Choose', body: 'Pick an offer and read its terms.', icon: '👆' }, { title: '2. Show', body: 'Use the partner’s supported check-in method.', icon: '📱' }].map((step) => (
                          <div key={step.title} style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(255,255,255,0.07)' }}>
                            <div aria-hidden="true" style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{step.icon}</div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 900 }}>{step.title}</div>
                            <div style={{ fontSize: '0.68rem', color: '#D1D5DB', lineHeight: 1.45, marginTop: '0.15rem' }}>{step.body}</div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setNfcTapped(!nfcTapped)}
                        aria-pressed={nfcTapped}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '0.8rem 1rem', borderRadius: '12px', background: nfcTapped ? '#059669' : '#FF5A5F', color: '#FFFFFF', fontSize: '0.84rem', fontWeight: 900, border: 'none', cursor: 'pointer' }}
                      >
                        {nfcTapped ? 'Demo preview shown ✓' : 'Preview sample check-in'}
                      </button>
                      <p aria-live="polite" style={{ color: '#D1D5DB', fontSize: '0.7rem', lineHeight: 1.5, marginTop: '0.65rem', minHeight: '2.1em' }}>
                        {nfcTapped ? 'This is only a visual demo. No offer was claimed and no account was changed.' : 'NFC or QR availability depends on the participating merchant. This preview does not connect to a real reader or scanner.'}
                      </p>
                      <div style={{ padding: '0.7rem 0.75rem', borderRadius: '11px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#D1FAE5', fontSize: '0.7rem', lineHeight: 1.5 }}>
                        <strong>Separate from time credits:</strong> merchant offers use the separate loyalty program. Volunteer time credits are never used to pay for discounts or goods.
                      </div>
                      <div style={{ fontSize: '0.66rem', color: '#9CA3AF', lineHeight: 1.45, marginTop: '0.65rem' }}>Merchant names, locations, discounts, and redemption steps are fictional examples for this screen.</div>
                    </aside>
                  </div>
                )}

              </div>

            {/* Stage Integrated Docked Telemetry Footer (Ensures visual balance) */}
            <div
              style={{
                background: '#FAF5EE',
                borderTop: '1.5px solid #E8DDCF',
                padding: '0.85rem 1.4rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1rem' }}>🏛️</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#111827' }}>
                  Kottakkal Municipality Pilot Telemetry
                </span>
                <span style={{ fontSize: '0.74rem', color: '#6B7280', fontWeight: 600 }}>
                  • 1,420 Hours Exchanged • 98.4% Completion • 0 Rupee Margin
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.74rem', color: '#047857', fontWeight: 800 }}>
                  ✓ Aadhaar Verification Node Online
                </span>
                <a
                  href="http://localhost:3000"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    color: '#FF5A5F',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <span>Launch Live Portal</span>
                  <span>→</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ================= EQUALIZING UNIFORM BOTTOM GRID ================= */}
        {/* Full-Width 4-Card Civic Assurance & Governance Strip across bottom */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1rem',
          }}
        >
          {/* Card 1 */}
          <div
            style={{
              padding: '1.15rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.85)',
              borderRadius: '18px',
              border: '1.5px solid #E5DFD5',
              boxShadow: '0 2px 8px rgba(45,30,15,0.03)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.15rem',
                flexShrink: 0,
              }}
            >
              🏛️
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#111827', marginBottom: '0.2rem' }}>
                Municipal Oversight
              </div>
              <div style={{ fontSize: '0.78rem', color: '#5B6577', lineHeight: 1.45, fontWeight: 500 }}>
                Directly overseen by Kottakkal Municipality Ward Committee and local civic facilitators.
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div
            style={{
              padding: '1.15rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.85)',
              borderRadius: '18px',
              border: '1.5px solid #E5DFD5',
              boxShadow: '0 2px 8px rgba(45,30,15,0.03)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                background: '#FFF1F2',
                border: '1px solid #FECDD3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.15rem',
                flexShrink: 0,
              }}
            >
              🛡️
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#111827', marginBottom: '0.2rem' }}>
                Aadhaar Identity Escrow
              </div>
              <div style={{ fontSize: '0.78rem', color: '#5B6577', lineHeight: 1.45, fontWeight: 500 }}>
                100% verified citizens with encrypted geohashing; no public phone number exposure.
              </div>
            </div>
          </div>

          {/* Card 3 */}
          <div
            style={{
              padding: '1.15rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.85)',
              borderRadius: '18px',
              border: '1.5px solid #E5DFD5',
              boxShadow: '0 2px 8px rgba(45,30,15,0.03)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                background: '#EEF2FF',
                border: '1px solid #C7D2FE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.15rem',
                flexShrink: 0,
              }}
            >
              ⏱️
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#111827', marginBottom: '0.2rem' }}>
                Universal Atomic Ledger
              </div>
              <div style={{ fontSize: '0.78rem', color: '#5B6577', lineHeight: 1.45, fontWeight: 500 }}>
                Append-only PostgreSQL database ensures 1 Hour = 1 Credit never depreciates or expires.
              </div>
            </div>
          </div>

          {/* Card 4 */}
          <div
            style={{
              padding: '1.15rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.85)',
              borderRadius: '18px',
              border: '1.5px solid #E5DFD5',
              boxShadow: '0 2px 8px rgba(45,30,15,0.03)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                background: '#FEF3C7',
                border: '1px solid #FDE68A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.15rem',
                flexShrink: 0,
              }}
            >
              🤝
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#111827', marginBottom: '0.2rem' }}>
                Senior Dignity Guarantee
              </div>
              <div style={{ fontSize: '0.78rem', color: '#5B6577', lineHeight: 1.45, fontWeight: 500 }}>
                Elderly and disabled citizens receive immediate care even with 0 credits in wallet (BR-02).
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
