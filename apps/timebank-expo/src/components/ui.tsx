import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextProps,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  ArrowUpRight,
  Check,
  X,
  Palette,
  HeartHandshake,
  GraduationCap,
  Users,
  Laptop,
  Languages,
  Zap,
} from 'lucide-react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import {
  categories,
  Category,
  colors,
  fonts,
  motion,
  radii,
  sizes,
  space,
  type,
} from '../theme/tokens';
import { useStore } from '../store/useStore';

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  stack: { gap: space.lg },
  pad: { padding: space.xl },
  muted: { color: colors.muted },
  title: { fontFamily: fonts.display, fontSize: type.title, letterSpacing: -0.5 },
  caption: { fontSize: type.caption, color: colors.muted },
  section: { marginTop: space.xxl, marginBottom: space.md },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    padding: space.lg,
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: type.body,
    backgroundColor: colors.surface,
    minHeight: sizes.touch,
  },
});
export function Label({ style, ...props }: TextProps) {
  return (
    <Text
      {...props}
      style={[{ fontFamily: fonts.body, fontSize: type.body, color: colors.ink }, style]}
    />
  );
}
export function feedback() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
}
export function Tap({
  children,
  onPress,
  onLongPress,
  label,
  style,
  disabled = false,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={() => {
          if (!reduced) scale.set(withSpring(0.97));
        }}
        onPressOut={() => {
          scale.set(withSpring(1));
        }}
        onPress={() => {
          feedback();
          onPress?.();
        }}
        onLongPress={onLongPress}
        style={[
          { minHeight: sizes.touch, justifyContent: 'center', opacity: disabled ? 0.45 : 1 },
          style,
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
export function Button({
  title,
  onPress,
  soft = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  soft?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tap
      label={title}
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: soft ? colors.surface : colors.purpleInk,
        borderRadius: radii.pill,
        paddingHorizontal: space.xl,
        minHeight: 52,
      }}
    >
      <View style={styles.between}>
        <Label style={{ color: soft ? colors.purpleInk : colors.white, fontFamily: fonts.bold }}>
          {title}
        </Label>
        <ArrowUpRight size={sizes.icon} color={soft ? colors.purpleInk : colors.white} />
      </View>
    </Tap>
  );
}
export const categoryIcons = {
  Skill: Palette,
  Help: HeartHandshake,
  Learning: GraduationCap,
  Community: Users,
  Tech: Laptop,
  Language: Languages,
  Urgent: Zap,
};
export function CategoryIcon({
  category,
  size = sizes.icon,
}: {
  category: Category;
  size?: number;
}) {
  const Icon = categoryIcons[category];
  return <Icon size={size} color={categories[category].accent} strokeWidth={1.7} />;
}
export function Logo() {
  return (
    <Svg width={36} height={36} viewBox="0 0 40 40" accessibilityLabel="Indian Timebank">
      <>
        {Array.from({ length: 6 }, (_, i) => (
          <Polygon
            key={i}
            points="17,2 23,2 26,8 23,14 17,14 14,8"
            fill={colors.ink}
            transform={`rotate(${i * 60} 20 20)`}
          />
        ))}
      </>
    </Svg>
  );
}
export function Avatar({
  name,
  size = sizes.avatar,
  category = 'Skill',
}: {
  name: string;
  size?: number;
  category?: Category;
}) {
  return (
    <LinearGradient
      colors={categories[category].gradient}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.surface,
      }}
    >
      <Label
        style={{
          fontFamily: fonts.bold,
          fontSize: size * 0.33,
          color: categories[category].accent,
        }}
      >
        {name
          .split(' ')
          .map((part) => part[0])
          .slice(0, 2)
          .join('')}
      </Label>
    </LinearGradient>
  );
}
export function AvatarStack() {
  return (
    <View style={styles.row}>
      <View style={{ flexDirection: 'row' }}>
        {['AN', 'MR', 'SK'].map((name, i) => (
          <View key={name} style={{ marginLeft: i ? -space.sm : 0 }}>
            <Avatar name={name} size={28} category={i === 1 ? 'Help' : 'Learning'} />
          </View>
        ))}
      </View>
      <Label style={{ fontSize: type.label }}>also interested</Label>
    </View>
  );
}
export function TimeChip({ hours }: { hours: number }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radii.pill,
      }}
    >
      <Label
        style={{ fontFamily: fonts.bold, fontSize: type.caption, fontVariant: ['tabular-nums'] }}
      >
        {hours === 0.5 ? '30m' : `${hours}h`}
      </Label>
    </View>
  );
}
export function Pills({
  values,
  selected,
  onSelect,
}: {
  values: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.sm }}
    >
      {values.map((value) => (
        <Tap
          key={value}
          label={value}
          onPress={() => onSelect(value)}
          style={{
            paddingHorizontal: space.lg,
            borderRadius: radii.medium,
            backgroundColor: selected === value ? colors.purpleInk : colors.surface,
          }}
        >
          <Label
            style={{
              fontFamily: fonts.medium,
              color: selected === value ? colors.white : colors.muted,
              fontSize: type.caption,
            }}
          >
            {value}
          </Label>
        </Tap>
      ))}
    </ScrollView>
  );
}
export function CategoryRail({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (category: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.md }}
    >
      {(Object.keys(categories) as Category[])
        .filter((c) => c !== 'Urgent')
        .map((category) => (
          <Tap
            key={category}
            label={`Filter ${category}`}
            onPress={() => onSelect(selected === category ? 'All' : category)}
            style={{ alignItems: 'center', gap: space.sm }}
          >
            <LinearGradient
              colors={categories[category].gradient}
              style={{
                width: 48,
                height: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radii.medium,
                borderWidth: 2,
                borderColor: selected === category ? categories[category].accent : 'transparent',
              }}
            >
              <CategoryIcon category={category} />
            </LinearGradient>
            <Label
              style={{
                fontSize: type.label,
                fontFamily: selected === category ? fonts.bold : fonts.medium,
              }}
            >
              {category}
            </Label>
          </Tap>
        ))}
    </ScrollView>
  );
}
export function Sheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <Modal
      visible={open}
      transparent
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        <Pressable
          accessibilityLabel="Close dialog"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={{
            width: '100%',
            maxWidth: sizes.maxWidth,
            maxHeight: '88%',
            borderTopLeftRadius: radii.card,
            borderTopRightRadius: radii.card,
            padding: space.xxl,
            paddingBottom: space.section,
            backgroundColor: colors.canvas,
          }}
        >
          <View style={styles.between}>
            <Label accessibilityRole="header" style={styles.title}>
              {title}
            </Label>
            <Tap label="Close" onPress={onClose}>
              <X size={sizes.icon} color={colors.ink} />
            </Tap>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: space.lg, paddingTop: space.lg }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
export function EmptyState({
  title = 'A little quiet here',
  message = 'Try another filter, or share your time with the community.',
}: {
  title?: string;
  message?: string;
}) {
  return (
    <View style={{ paddingVertical: space.section, gap: space.md }}>
      <Label style={styles.title}>{title}</Label>
      <Label style={styles.muted}>{message}</Label>
    </View>
  );
}
export function ProgressRing({
  progress,
  size = 156,
  children,
}: {
  progress: number;
  size?: number;
  children?: React.ReactNode;
}) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surface}
          strokeWidth={5}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.purpleInk}
          strokeWidth={5}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}
export function Sparkline() {
  return (
    <Svg width="100%" height={72} viewBox="0 0 320 72">
      <Path
        d="M0 62 C20 62 25 35 55 42 S95 58 120 32 S165 45 190 22 S240 38 265 14 S300 18 320 4"
        fill="none"
        stroke={colors.purpleInk}
        strokeWidth={3}
      />
      <Path d="M0 70 H320" stroke={colors.line} />
    </Svg>
  );
}
export function StatCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const timer = setInterval(() => {
      frame++;
      setCount(Math.round(value * Math.min(frame / 20, 1)));
      if (frame >= 20) clearInterval(timer);
    }, 25);
    return () => clearInterval(timer);
  }, [value, reduced]);
  return (
    <Label style={{ fontFamily: fonts.heavy, fontSize: type.title, fontVariant: ['tabular-nums'] }}>
      {reduced ? value : count}
      {suffix}
    </Label>
  );
}
export function Skeleton() {
  const opacity = useSharedValue(0.4);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced)
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.9, { duration: motion.loading }),
          withTiming(0.4, { duration: motion.loading }),
        ),
        -1,
      );
  }, [opacity, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityLabel="Loading community listings"
      style={[
        {
          height: sizes.cardMedium,
          borderRadius: radii.card,
          backgroundColor: colors.line,
          margin: space.sm,
        },
        animated,
      ]}
    />
  );
}
export function Entrance({ index = 0, children }: { index?: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      entering={
        reduced
          ? undefined
          : FadeInDown.delay(Math.min(index, 8) * motion.stagger).duration(motion.duration)
      }
    >
      {children}
    </Animated.View>
  );
}
export function Toast() {
  const toast = useStore((s) => s.toast);
  const notify = useStore((s) => s.notify);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => notify(''), 3000);
    return () => clearTimeout(timer);
  }, [toast, notify]);
  if (!toast) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        bottom: sizes.bottomSpace,
        alignSelf: 'center',
        maxWidth: '90%',
        backgroundColor: colors.ink,
        padding: space.lg,
        borderRadius: radii.medium,
      }}
    >
      <View style={styles.row}>
        <Check color={colors.surface} size={sizes.icon} />
        <Label style={{ color: colors.surface, flexShrink: 1 }}>{toast}</Label>
      </View>
    </View>
  );
}
