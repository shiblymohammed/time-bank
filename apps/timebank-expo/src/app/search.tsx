import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Screen } from '../components/Shell';
import { Label, Pills, styles } from '../components/ui';
import { MasonryFeed } from '../components/Feed';
import { useStore } from '../store/useStore';
import { space } from '../theme/tokens';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const { items, recent, remember } = useStore();
  const results = items.filter((item) =>
    `${item.title} ${item.category} ${item.name} ${item.description} ${item.location}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const select = (value: string) => {
    setQuery(value);
    remember(value);
  };
  return (
    <Screen title="Find your people">
      <MasonryFeed
        items={query.trim() ? results : []}
        header={
          <View style={{ gap: space.lg, paddingVertical: space.xl }}>
            <TextInput
              accessibilityLabel="Search skills, help or people"
              autoFocus
              placeholder="Try photography, coding, or a name"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => {
                if (query.trim()) remember(query.trim());
              }}
              style={styles.input}
            />
            <Label style={styles.title}>Recent searches</Label>
            <Pills values={recent} selected={query} onSelect={select} />
            <Label style={styles.title}>Trending skills</Label>
            <Pills
              values={['Photography', 'Language', 'Teaching', 'Design']}
              selected={query}
              onSelect={select}
            />
            {Boolean(query.trim()) && (
              <Label style={styles.caption}>{results.length} matching listings</Label>
            )}
          </View>
        }
      />
    </Screen>
  );
}
