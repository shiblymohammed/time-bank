import React, { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../components/Shell';
import {
  Button,
  CategoryIcon,
  Label,
  Pills,
  ProgressRing,
  Sheet,
  styles,
  Tap,
} from '../components/ui';
import { Confetti, SegmentedControl, TimeRuler } from '../components/ExchangeControls';
import { RequestCard } from '../components/Feed';
import { Item } from '../data/items';
import { useStore } from '../store/useStore';
import { categories, Category, colors, fonts, radii, space, type } from '../theme/tokens';

const skills: [string, Category][] = [
  ['Design', 'Skill'],
  ['Photography', 'Skill'],
  ['Teaching', 'Learning'],
  ['Cooking', 'Help'],
  ['Coding', 'Tech'],
  ['Language', 'Language'],
  ['Repair', 'Help'],
  ['Music', 'Community'],
];
export default function Exchange() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = params.mode === 'Request' ? 'Request' : 'Give';
  const setMode = (value: string) => router.setParams({ mode: value });
  const [selected, setSelected] = useState(['Design']);
  const [hours, setHours] = useState(2);
  const [description, setDescription] = useState('');
  const [day, setDay] = useState('Weekend');
  const [location, setLocation] = useState('In person');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const published = useRef(false);
  const publish = useStore((s) => s.publish);
  const notify = useStore((s) => s.notify);
  const category = skills.find(([name]) => name === selected[0])?.[1] ?? 'Skill';
  const preview: Item = {
    id: 'preview',
    title:
      description.trim().split('\n')[0] ||
      `${selected.join(' & ') || 'Your skill'} ${mode === 'Give' ? 'with Shibily' : 'support wanted'}`,
    description: description || 'Your offer takes shape right here.',
    name: 'Shibily Mohammed',
    category,
    hours,
    distance: 0,
    location: location === 'Online' ? 'Online' : 'Kozhikode',
    kind: mode === 'Give' ? 'Offer' : 'Request',
    urgent: false,
    period: day === 'Today' ? 'Today' : 'This week',
    height: 'short',
  };
  const submit = () => {
    if (published.current) return;
    if (!selected.length || description.trim().length < 12) {
      setError('Choose a skill and describe your time in at least 12 characters.');
      return;
    }
    published.current = true;
    setSubmitting(true);
    publish({
      ...preview,
      id: `local-${Date.now()}`,
      description: `${description.trim()} Available ${day.toLowerCase()}. ${location}.`,
    });
    setSuccess(true);
    setSubmitting(false);
    setError('');
  };
  return (
    <Screen
      title="Time Exchange"
      scroll
      footer={
        <Button
          title={
            submitting ? 'Listing your time…' : mode === 'Give' ? 'List My Time' : 'Post My Request'
          }
          disabled={submitting}
          onPress={submit}
        />
      }
    >
      <SegmentedControl value={mode} onChange={setMode} />
      <Label
        accessibilityRole="header"
        style={{
          fontFamily: fonts.heavy,
          fontSize: type.display,
          lineHeight: 40,
          letterSpacing: -1,
        }}
      >
        What can you{'\n'}
        <Label style={{ fontFamily: fonts.accent, color: colors.purpleInk, fontSize: 46 }}>
          {mode === 'Give' ? 'offer?' : 'receive?'}
        </Label>
      </Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {skills.map(([skill, tint]) => (
          <Tap
            key={skill}
            label={`Select ${skill}`}
            onPress={() => {
              setSelected(
                selected.includes(skill)
                  ? selected.filter((s) => s !== skill)
                  : [...selected, skill],
              );
              published.current = false;
            }}
            style={{
              ...styles.row,
              backgroundColor: selected.includes(skill) ? categories[tint].surface : colors.surface,
              paddingHorizontal: space.md,
              borderRadius: radii.small,
              borderWidth: 1,
              borderColor: selected.includes(skill) ? categories[tint].accent : 'transparent',
            }}
          >
            <CategoryIcon category={tint} size={16} />
            <Label style={{ fontSize: type.caption }}>{skill}</Label>
          </Tap>
        ))}
      </View>
      <LinearGradient
        colors={categories.Help.gradient}
        style={{ borderRadius: radii.card, padding: space.xl, alignItems: 'center', gap: space.lg }}
      >
        <ProgressRing progress={hours / 4}>
          <Label
            style={{ fontFamily: fonts.heavy, fontSize: type.xl, fontVariant: ['tabular-nums'] }}
          >
            {hours === 0.5 ? '30m' : `${hours}h`}
          </Label>
          <Label style={{ fontSize: type.label, fontFamily: fonts.bold, letterSpacing: 1 }}>
            YOUR TIME {mode === 'Give' ? 'OFFER' : 'REQUEST'}
          </Label>
        </ProgressRing>
        <TimeRuler
          value={hours}
          onChange={(value) => {
            setHours(value);
            published.current = false;
          }}
        />
      </LinearGradient>
      <Label style={{ fontFamily: fonts.bold }}>Tell us a little more</Label>
      <TextInput
        accessibilityLabel="Describe your time"
        multiline
        maxLength={280}
        placeholder="UI design feedback, prototypes or creative support"
        value={description}
        onChangeText={(text) => {
          setDescription(text);
          published.current = false;
        }}
        style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
      />
      <Label style={[styles.caption, { textAlign: 'right' }]}>{description.length} / 280</Label>
      <Label style={{ fontFamily: fonts.bold }}>When works for you?</Label>
      <Pills values={['Today', 'Weekdays', 'Weekend']} selected={day} onSelect={setDay} />
      <Pills values={['In person', 'Online']} selected={location} onSelect={setLocation} />
      <Label style={styles.title}>A little preview</Label>
      <RequestCard
        item={preview}
        list
        onOpen={() => notify('This is how your listing will appear')}
      />
      {Boolean(error) && (
        <Label accessibilityRole="alert" style={{ color: categories.Urgent.accent }}>
          {error}
        </Label>
      )}
      <Label style={[styles.caption, { textAlign: 'center' }]}>
        1 hour given = 1 hour receivable
      </Label>
      <Sheet
        title="Your time can make a difference."
        open={success}
        onClose={() => setSuccess(false)}
      >
        <Confetti />
        <ProgressRing progress={1} size={100}>
          <CategoryIcon category={category} size={36} />
        </ProgressRing>
        <Label>
          Your {mode === 'Give' ? 'offer' : 'request'} is now in the demo community feed.
        </Label>
        <Button
          title="See it in the feed"
          onPress={() => {
            setSuccess(false);
            router.replace('/');
          }}
        />
        <Button
          title="List another"
          soft
          onPress={() => {
            setSuccess(false);
            setDescription('');
            published.current = false;
          }}
        />
      </Sheet>
    </Screen>
  );
}
