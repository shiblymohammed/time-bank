import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Search, SlidersHorizontal, ArrowUpRight } from 'lucide-react-native';
import { Screen } from '../components/Shell';
import { CategoryRail, Label, Pills, Sheet, Skeleton, styles, Tap } from '../components/ui';
import { MasonryFeed } from '../components/Feed';
import { useStore } from '../store/useStore';
import { colors, fonts, motion, radii, sizes, space, type } from '../theme/tokens';

export default function Home() {
  const [category, setCategory] = useState('All');
  const [kind, setKind] = useState('All');
  const [filters, setFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const items = useStore((s) => s.items);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), motion.loading);
    return () => clearTimeout(timer);
  }, []);
  const visible = items.filter(
    (item) =>
      (category === 'All' || item.category === category) && (kind === 'All' || item.kind === kind),
  );
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const header = (
    <View style={{ paddingHorizontal: space.xs, gap: space.lg, paddingTop: space.xl }}>
      <Label style={styles.caption}>Good {greeting}, Shibily</Label>
      <Label
        accessibilityRole="header"
        style={{ fontFamily: fonts.heavy, fontSize: 38, lineHeight: 40, letterSpacing: -1.4 }}
      >
        Share your time.{'\n'}
        <Label style={{ fontFamily: fonts.accent, color: colors.purpleInk, fontSize: 43 }}>
          Build
        </Label>{' '}
        community.
      </Label>
      <View
        style={{
          ...styles.between,
          backgroundColor: colors.surface,
          borderRadius: radii.card,
          paddingHorizontal: space.lg,
        }}
      >
        <View style={{ flex: 1 }}>
          <Tap label="Search skills and people" onPress={() => router.push('/search')}>
            <View style={styles.row}>
              <Search size={sizes.icon} color={colors.muted} />
              <Label style={{ color: colors.muted, fontSize: type.caption }}>
                Find skills, help or people
              </Label>
            </View>
          </Tap>
        </View>
        <Tap label="Filter feed" onPress={() => setFilters(true)}>
          <SlidersHorizontal size={sizes.icon} color={colors.purpleInk} />
        </Tap>
      </View>
      <CategoryRail selected={category} onSelect={setCategory} />
      <Tap label="View time balance and community activity" onPress={() => router.push('/profile')}>
        <Label style={{ fontSize: type.caption, color: colors.muted }}>
          <Label
            style={{ fontSize: type.caption, fontFamily: fonts.bold, color: colors.purpleInk }}
          >
            36h
          </Label>{' '}
          balance · {items.filter((i) => i.distance < 2 && i.period === 'Today').length} nearby
          today · {items.filter((i) => i.urgent).length} urgent
        </Label>
      </Tap>
      <View style={styles.between}>
        <Label style={styles.title}>
          {category === 'All' ? 'A little time, a lot of good' : `${category} near you`}
        </Label>
        <ArrowUpRight size={sizes.icon} color={colors.purpleInk} />
      </View>
      <View style={styles.between}>
        <Label style={styles.caption}>Nearby Requests & offers</Label>
        <Tap label="View all requests" onPress={() => router.push('/requests')}>
          <Label style={{ fontSize: type.caption, color: colors.purpleInk }}>View all</Label>
        </Tap>
      </View>
    </View>
  );
  return (
    <Screen>
      {loading ? (
        <View style={{ padding: space.xl }}>
          {header}
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
              <Skeleton />
            </View>
            <View style={{ flex: 1 }}>
              <Skeleton />
            </View>
          </View>
        </View>
      ) : (
        <MasonryFeed items={visible} header={header} />
      )}
      <Sheet title="Make it yours" open={filters} onClose={() => setFilters(false)}>
        <Label>Show me</Label>
        <Pills values={['All', 'Request', 'Offer']} selected={kind} onSelect={setKind} />
        <Label style={styles.caption}>
          Choose a category from the home rail to narrow your feed.
        </Label>
      </Sheet>
    </Screen>
  );
}
