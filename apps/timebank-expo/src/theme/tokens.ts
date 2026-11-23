export const colors = {
  primary: '#8E5FF8',
  primarySoft: '#B990EF',
  blush: '#F9CEE8',
  orange: '#F74C31',
  sage: '#99BC9B',
  sun: '#E6C85B',
  sky: '#3F8DD1',
  ink: '#020103',
  canvas: '#F5F2F9',
  surface: '#FDFCFD',
  muted: '#655E70',
  line: '#E4DDEA',
  purpleInk: '#5824AC',
  white: '#FFFFFF',
  success: '#326639',
  overlay: '#180D3266',
};
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 };
export const radii = { small: 12, medium: 20, card: 28, pill: 36 };
export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  heavy: 'BricolageGrotesque_800ExtraBold',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  bold: 'Inter_600SemiBold',
  accent: 'InstrumentSerif_400Regular_Italic',
};
export const type = { xl: 52, display: 36, title: 22, body: 15, caption: 12, label: 11 };
export const sizes = {
  touch: 44,
  avatar: 32,
  icon: 20,
  nav: 76,
  maxWidth: 560,
  bottomSpace: 112,
  cardShort: 200,
  cardMedium: 240,
  cardTall: 280,
};
export const motion = { duration: 300, stagger: 40, loading: 600 };
export const categories = {
  Skill: { gradient: ['#E8D9FF', '#D4B8FA', '#C4A1F3'], surface: '#EFE5FC', accent: '#55239B' },
  Help: { gradient: ['#FFE8F3', '#F9CEE8', '#F3BADD'], surface: '#FCE6F2', accent: '#8B275F' },
  Learning: { gradient: ['#ECF4DA', '#D6E8B8', '#BDD5AC'], surface: '#EAF1DF', accent: '#365B36' },
  Community: { gradient: ['#FFF3C1', '#F4E18E', '#E6C85B'], surface: '#FBF1CD', accent: '#725308' },
  Tech: { gradient: ['#E2F0FF', '#BDD9F7', '#A2C8ED'], surface: '#E7F0FA', accent: '#204F80' },
  Language: { gradient: ['#F0E4FF', '#DCCEF6', '#C9B7E9'], surface: '#EEE6F8', accent: '#5E3987' },
  Urgent: { gradient: ['#FFDFCF', '#FFA382', '#FA8062'], surface: '#FFE5DC', accent: '#8A2C13' },
} as const;
export type Category = keyof typeof categories;
export const shadows = {
  soft: { boxShadow: '0px 4px 16px #8E5FF810' },
  raised: { boxShadow: '0px 8px 30px #8E5FF824' },
};
