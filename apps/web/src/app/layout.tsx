import type { Metadata } from 'next';

/**
 * Root layout for the KTB web dashboard.
 *
 * D#50: Malayalam and English at launch.
 * FR-UX-01: Localization architecture extendable to other Indian languages.
 * FR-UX-02: Readable type, touch target sizing, contrast, semantic labels.
 *
 * The `lang` attribute is set to "en" initially. A locale-aware layout
 * will be introduced in Milestone 2 when authentication and locale selection
 * are implemented.
 */
export const metadata: Metadata = {
  title: {
    default: 'Kottakkal Time Bank',
    template: '%s | Kottakkal Time Bank',
  },
  description:
    'Kottakkal Time Bank — centrally governed volunteer assistance platform connecting verified volunteers with eligible beneficiaries.',
  robots: {
    // FR-UX-03: Internal dashboard — do not index
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
