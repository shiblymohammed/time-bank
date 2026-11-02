import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Indian Time Bank | Kottakkal Time Bank — Practical Volunteer Assistance',
  description:
    'Centrally governed, multi-municipality volunteer assistance platform. Eligible people receive practical help; verified volunteers accumulate lifetime universal time credits.',
  keywords: [
    'Time Bank',
    'Kottakkal',
    'Indian Time Bank',
    'Volunteering',
    'Community Care',
    'Universal Time Credit',
    'Kerala',
    'Civic Aid',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/png" href="/favicon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}

