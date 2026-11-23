import React, { memo, useState } from 'react';
import { RefreshControl, Share, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, MapPin, ArrowUpRight, MessageCircle } from 'lucide-react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Item } from '../data/items';
import { useStore } from '../store/useStore';
import { categories, colors, fonts, radii, sizes, space, type } from '../theme/tokens';
import {
  Avatar,
  AvatarStack,
  Button,
  CategoryIcon,
  EmptyState,
  Entrance,
  Label,
  Sheet,
  styles,
  Tap,
  TimeChip,
} from './ui';

export const RequestCard = memo(function RequestCard({
  item,
  list = false,
  index = 0,
  onOpen,
}: {
  item: Item;
  list?: boolean;
  index?: number;
  onOpen: (item: Item) => void;
}) {
  const saved = useStore((s) => s.saved.includes(item.id));
  const toggleSave = useStore((s) => s.toggleSave);
  const notify = useStore((s) => s.notify);
  const tint = categories[item.urgent ? 'Urgent' : item.category];
  const save = () => {
    toggleSave(item.id);
    notify(saved ? 'Removed from saved' : 'Saved to your profile');
  };
  const height = { short: sizes.cardShort, medium: sizes.cardMedium, tall: sizes.cardTall }[
    item.height
  ];
  const card = (
    <Entrance index={index}>
      <View style={{ margin: space.xs, marginBottom: space.sm }}>
        <LinearGradient
          colors={tint.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: radii.card,
            padding: space.lg,
            minHeight: list ? 156 : height,
            overflow: 'hidden',
          }}
        >
          <View style={styles.between}>
            <CategoryIcon category={item.category} />
            <TimeChip hours={item.hours} />
          </View>
          <Tap
            label={`Open ${item.title}`}
            onPress={() => onOpen(item)}
            onLongPress={() => onOpen(item)}
            style={{ paddingVertical: space.md, flex: 1 }}
          >
            <Label
              style={{
                fontSize: list ? type.title : 20,
                fontFamily: fonts.display,
                lineHeight: 23,
                letterSpacing: -0.4,
              }}
            >
              {item.title}
            </Label>
            {item.height === 'tall' && !list && (
              <Label
                numberOfLines={3}
                style={{ fontSize: type.caption, lineHeight: 18, marginTop: space.sm }}
              >
                {item.description}
              </Label>
            )}
          </Tap>
          <View style={{ gap: space.sm }}>
            <View style={styles.row}>
              <Avatar name={item.name} size={24} category={item.category} />
              <Label numberOfLines={1} style={{ fontSize: type.label, flex: 1 }}>
                {item.name.split(' ')[0]} · {item.distance} km
              </Label>
            </View>
            {item.height === 'tall' && !list && <AvatarStack />}
            <View style={styles.between}>
              <Label style={{ fontSize: type.label, color: tint.accent, fontFamily: fonts.bold }}>
                {item.urgent ? '● Urgent' : `${item.kind} · ${item.category}`}
              </Label>
              <Tap
                label={saved ? `Unsave ${item.title}` : `Save ${item.title}`}
                onPress={save}
                style={{ minWidth: sizes.touch, alignItems: 'flex-end' }}
              >
                <Heart size={18} color={tint.accent} fill={saved ? tint.accent : 'transparent'} />
              </Tap>
            </View>
          </View>
        </LinearGradient>
      </View>
    </Entrance>
  );
  if (!list) return card;
  return (
    <ReanimatedSwipeable
      renderLeftActions={() => (
        <View style={{ justifyContent: 'center', padding: space.lg, backgroundColor: colors.sage }}>
          <Label>Offer help</Label>
        </View>
      )}
      renderRightActions={() => (
        <View
          style={{ justifyContent: 'center', padding: space.lg, backgroundColor: colors.blush }}
        >
          <Label>Save</Label>
        </View>
      )}
      onSwipeableOpen={(direction) => {
        if (direction === 'right') save();
        else onOpen(item);
      }}
    >
      {card}
    </ReanimatedSwipeable>
  );
});

export function DetailSheet({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const accept = useStore((s) => s.accept);
  const accepted = useStore((s) => (item ? s.accepted.includes(item.id) : false));
  const toggleSave = useStore((s) => s.toggleSave);
  const saved = useStore((s) => (item ? s.saved.includes(item.id) : false));
  const notify = useStore((s) => s.notify);
  if (!item) return null;
  return (
    <Sheet
      title={item.kind === 'Offer' ? 'Time to share' : 'A neighbour needs you'}
      open
      onClose={onClose}
    >
      <View style={styles.between}>
        <Avatar name={item.name} size={48} category={item.category} />
        <View style={{ flex: 1 }}>
          <Label style={{ fontFamily: fonts.bold }}>{item.name}</Label>
          <Label style={styles.caption}>Demo member · Trust score 4.9 / 5</Label>
        </View>
        <TimeChip hours={item.hours} />
      </View>
      <Label style={{ fontFamily: fonts.display, fontSize: type.display }}>{item.title}</Label>
      <Label style={{ lineHeight: 24 }}>{item.description}</Label>
      <View
        style={{
          padding: space.xl,
          borderRadius: radii.medium,
          backgroundColor: categories[item.category].surface,
          gap: space.sm,
        }}
      >
        <MapPin color={categories[item.category].accent} />
        <Label>
          {item.location} · {item.distance} km away
        </Label>
        <Label style={styles.caption}>Approximate demo area · {item.period}</Label>
      </View>
      <Button
        title={
          accepted ? 'Interest sent' : item.kind === 'Offer' ? 'Request this time' : 'Offer help'
        }
        disabled={accepted}
        onPress={() => {
          accept(item.id);
          notify('Interest sent in this demo');
        }}
      />
      <View style={styles.between}>
        <Tap label="Save listing" onPress={() => toggleSave(item.id)}>
          <View style={styles.row}>
            <Heart
              size={sizes.icon}
              color={colors.purpleInk}
              fill={saved ? colors.purpleInk : 'transparent'}
            />
            <Label>{saved ? 'Saved' : 'Save'}</Label>
          </View>
        </Tap>
        <Tap
          label="Message member"
          onPress={() => notify('Demo only — messaging is not connected')}
        >
          <View style={styles.row}>
            <MessageCircle size={sizes.icon} color={colors.purpleInk} />
            <Label>Message</Label>
          </View>
        </Tap>
        <Tap
          label="Share listing"
          onPress={() => {
            void Share.share({
              message: `${item.title} — ${item.hours}h in ${item.location}. Indian Timebank demo.`,
            }).catch(() => notify('Sharing is unavailable in this browser'));
          }}
        >
          <ArrowUpRight color={colors.purpleInk} />
        </Tap>
      </View>
    </Sheet>
  );
}
export function MasonryFeed({
  items,
  header,
  list = false,
}: {
  items: Item[];
  header?: React.ReactElement;
  list?: boolean;
}) {
  const [detail, setDetail] = useState<Item | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const notify = useStore((s) => s.notify);
  return (
    <>
      <FlashList
        key={list ? 'list' : 'masonry'}
        data={items}
        masonry={!list}
        numColumns={list ? 1 : 2}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <RequestCard item={item} index={index} list={list} onOpen={setDetail} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState />}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: sizes.bottomSpace }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.purpleInk}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => {
                setRefreshing(false);
                notify('You’re up to date');
              }, 600);
            }}
          />
        }
      />
      <DetailSheet item={detail} onClose={() => setDetail(null)} />
    </>
  );
}
