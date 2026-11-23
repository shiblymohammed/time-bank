import React, { useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings, MapPin, Award, Heart, Sparkles } from 'lucide-react-native';
import { Screen } from '../components/Shell';
import {
  Avatar,
  CategoryIcon,
  EmptyState,
  Label,
  Pills,
  Sheet,
  Sparkline,
  StatCounter,
  styles,
  Tap,
} from '../components/ui';
import { DetailSheet, RequestCard } from '../components/Feed';
import { contributions, Item } from '../data/items';
import { useStore } from '../store/useStore';
import { categories, colors, fonts, radii, space, type } from '../theme/tokens';

export default function Profile() {
  const [tab, setTab] = useState('Contributions');
  const [settings, setSettings] = useState(false);
  const [detail, setDetail] = useState<Item | null>(null);
  const items = useStore((s) => s.items);
  const saved = useStore((s) => s.saved);
  return (
    <Screen scroll header={false}>
      <LinearGradient
        colors={[colors.primary, colors.purpleInk]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: radii.card,
          padding: space.xxl,
          alignItems: 'center',
          gap: space.sm,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            width: 140,
            height: 140,
            backgroundColor: colors.orange,
            borderRadius: 60,
            right: -75,
            top: 65,
            transform: [{ rotate: '30deg' }],
          }}
        />
        <View style={{ alignSelf: 'flex-end' }}>
          <Tap label="Profile settings" onPress={() => setSettings(true)}>
            <Settings color={colors.white} size={22} />
          </Tap>
        </View>
        <View
          style={{ borderWidth: 3, borderColor: categories.Learning.gradient[1], borderRadius: 60 }}
        >
          <Avatar name="Shibily Mohammed" size={80} category="Learning" />
        </View>
        <Label style={{ color: colors.white, fontFamily: fonts.display, fontSize: type.title }}>
          Shibily Mohammed
        </Label>
        <View style={styles.row}>
          <MapPin size={14} color={colors.white} />
          <Label style={{ color: colors.white, fontSize: type.caption }}>Kozhikode, Kerala</Label>
        </View>
        <Label style={{ color: colors.white, fontSize: type.label }}>
          MEMBER SINCE OCTOBER 2025
        </Label>
      </LinearGradient>
      <View
        style={{
          ...styles.between,
          marginTop: -space.section,
          marginHorizontal: space.md,
          backgroundColor: colors.surface,
          padding: space.xl,
          borderRadius: radii.medium,
        }}
      >
        {[
          [48, 'Time given'],
          [36, 'Time received'],
          [24, 'Exchanges'],
        ].map(([value, label]) => (
          <View key={label} style={{ alignItems: 'center', gap: space.xs }}>
            <StatCounter value={Number(value)} suffix={label === 'Exchanges' ? '' : 'h'} />
            <Label style={{ fontSize: type.label, color: colors.muted }}>{label}</Label>
          </View>
        ))}
      </View>
      <View
        style={{ padding: space.lg, backgroundColor: colors.surface, borderRadius: radii.medium }}
      >
        <View style={styles.between}>
          <Label style={{ fontFamily: fonts.bold }}>Time to make a difference</Label>
          <Label style={{ color: colors.purpleInk, fontFamily: fonts.bold }}>36h</Label>
        </View>
        <Sparkline />
        <View style={styles.between}>
          <Label style={styles.caption}>Your balance · last 6 weeks</Label>
          <Label style={styles.caption}>Today</Label>
        </View>
      </View>
      <View style={styles.between}>
        {[
          { title: 'First Give', icon: Heart, tint: 'Help' },
          { title: '10 Exchanges', icon: Award, tint: 'Skill' },
          { title: 'Community Hero', icon: Sparkles, tint: 'Community' },
        ].map(({ title, icon: Icon, tint }) => (
          <View key={title} style={{ alignItems: 'center', gap: space.sm, flex: 1 }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: radii.medium,
                backgroundColor: categories[tint as keyof typeof categories].surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon color={categories[tint as keyof typeof categories].accent} size={24} />
            </View>
            <Label style={{ fontSize: 10, fontFamily: fonts.medium }}>{title}</Label>
          </View>
        ))}
      </View>
      <Pills values={['Contributions', 'Saved', 'Reviews']} selected={tab} onSelect={setTab} />
      {tab === 'Contributions' && (
        <>
          <Label style={styles.title}>The good you’ve put out</Label>
          {contributions.map((item) => (
            <View
              key={item.title}
              style={{
                ...styles.row,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
                paddingBottom: space.lg,
              }}
            >
              <View
                style={{
                  padding: space.md,
                  borderRadius: radii.small,
                  backgroundColor: categories[item.category].surface,
                }}
              >
                <CategoryIcon category={item.category} />
              </View>
              <View style={{ flex: 1, gap: space.xs }}>
                <Label style={{ fontSize: type.caption, fontFamily: fonts.bold }}>
                  {item.title}
                </Label>
                <Label style={styles.caption}>
                  {item.date} · {item.hours}h
                </Label>
              </View>
              <Label
                style={{
                  color: item.status === 'Completed' ? colors.success : colors.purpleInk,
                  fontSize: 10,
                }}
              >
                {item.status}
              </Label>
            </View>
          ))}
        </>
      )}
      {tab === 'Saved' &&
        (saved.length ? (
          items
            .filter((item) => saved.includes(item.id))
            .map((item) => <RequestCard key={item.id} item={item} list onOpen={setDetail} />)
        ) : (
          <EmptyState
            title="Keep a little inspiration"
            message="Tap a heart on any listing. Your saved opportunities will appear here."
          />
        ))}
      {tab === 'Reviews' && (
        <View style={{ gap: space.md }}>
          <Label style={styles.title}>Kind words, real impact</Label>
          <Label>
            “Patient, thoughtful, and full of ideas. Our library poster looks wonderful.”
          </Label>
          <Label style={styles.caption}>Meera Menon · Demo review · 5 / 5</Label>
        </View>
      )}
      <LinearGradient
        colors={categories.Urgent.gradient}
        style={{ padding: space.xl, borderRadius: radii.card, gap: space.sm }}
      >
        <Label style={styles.title}>Your time has a ripple effect.</Label>
        <StatCounter value={1280} suffix="+ hours" />
        <Label style={{ fontSize: type.caption, lineHeight: 19 }}>
          Given, received and shared by our community. Every little hour belongs to a bigger story.
        </Label>
      </LinearGradient>
      <Label style={[styles.caption, { textAlign: 'center' }]}>
        Demo profile · Sample time credits and achievements
      </Label>
      <DetailSheet item={detail} onClose={() => setDetail(null)} />
      <Sheet title="About this demo" open={settings} onClose={() => setSettings(false)}>
        <Label>Indian Timebank · Local UI preview</Label>
        <Label>
          Listings and saved items stay in memory for this session. Profile information and time
          credits are sample data.
        </Label>
        <Label style={styles.caption}>Device accessibility settings control reduced motion.</Label>
      </Sheet>
    </Screen>
  );
}
