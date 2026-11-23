import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { LayoutGrid, List, Search } from 'lucide-react-native';
import { Screen } from '../components/Shell';
import { Label, Pills, styles, Tap } from '../components/ui';
import { MasonryFeed } from '../components/Feed';
import { useStore } from '../store/useStore';
import { colors, fonts, space, type } from '../theme/tokens';

export default function Requests() {
  const [filter, setFilter] = useState('All');
  const [period, setPeriod] = useState('Today');
  const [list, setList] = useState(false);
  const items = useStore((s) => s.items);
  const visible = items.filter(
    (item) =>
      item.kind === 'Request' &&
      item.period === period &&
      (filter !== 'Nearby' || item.distance <= 3) &&
      (filter !== 'My Area' || ['Kozhikode', 'Calicut'].includes(item.location)) &&
      (filter !== 'Urgent' || item.urgent),
  );
  return (
    <Screen>
      <MasonryFeed
        items={visible}
        list={list}
        header={
          <View
            style={{
              gap: space.lg,
              padding: space.xs,
              paddingTop: space.xl,
              paddingBottom: space.md,
            }}
          >
            <View style={styles.between}>
              <View>
                <Label style={styles.caption}>A hand makes all the difference</Label>
                <Label
                  accessibilityRole="header"
                  style={{ fontFamily: fonts.heavy, fontSize: type.display, letterSpacing: -1 }}
                >
                  Requests
                </Label>
              </View>
              <View style={styles.row}>
                <Tap label="Search requests" onPress={() => router.push('/search')}>
                  <Search color={colors.ink} size={22} />
                </Tap>
                <Tap
                  label={list ? 'Switch to masonry' : 'Switch to list'}
                  onPress={() => setList(!list)}
                >
                  {list ? (
                    <LayoutGrid color={colors.purpleInk} size={22} />
                  ) : (
                    <List color={colors.purpleInk} size={22} />
                  )}
                </Tap>
              </View>
            </View>
            <Pills
              values={['All', 'Nearby', 'My Area', 'Urgent']}
              selected={filter}
              onSelect={setFilter}
            />
            <Pills values={['Today', 'This week']} selected={period} onSelect={setPeriod} />
            <Label style={styles.caption}>{visible.length} ways to make someone’s day</Label>
          </View>
        }
      />
    </Screen>
  );
}
