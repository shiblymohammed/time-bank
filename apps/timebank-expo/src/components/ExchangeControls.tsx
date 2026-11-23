import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, fonts, motion, radii, space, type } from '../theme/tokens';
import { feedback, Label, Tap } from './ui';

const tickWidth = 44;
const hoursList = Array.from({ length: 8 }, (_, i) => (i + 1) / 2);

export function SegmentedControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const position = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    position.set(
      reduced
        ? value === 'Give'
          ? 0
          : width / 2
        : withSpring(value === 'Give' ? 0 : width / 2, { damping: 20 }),
    );
  }, [value, width, reduced, position]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: position.value }] }));
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        borderRadius: radii.medium,
        backgroundColor: colors.line,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: '50%',
            height: '100%',
            borderRadius: radii.medium,
            backgroundColor: colors.purpleInk,
          },
          thumb,
        ]}
      />
      {['Give', 'Request'].map((mode) => (
        <View key={mode} style={{ flex: 1 }}>
          <Tap
            label={`${mode} time`}
            onPress={() => onChange(mode)}
            style={{ alignItems: 'center' }}
          >
            <Label
              style={{
                fontFamily: fonts.bold,
                fontSize: type.caption,
                color: value === mode ? colors.white : colors.muted,
              }}
            >
              {mode} Time
            </Label>
          </Tap>
        </View>
      ))}
    </View>
  );
}

export function TimeRuler({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (width) scroll.current?.scrollTo({ x: (value * 2 - 1) * tickWidth, animated: !reduced });
  }, [value, width, reduced]);
  return (
    <View
      style={{ width: '100%', gap: space.sm }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View
        style={{
          alignSelf: 'center',
          width: 3,
          height: space.md,
          backgroundColor: colors.purpleInk,
          borderRadius: 2,
        }}
      />
      <ScrollView
        ref={scroll}
        horizontal
        snapToInterval={tickWidth}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Math.max(0, (width - tickWidth) / 2) }}
        onMomentumScrollEnd={(event) => {
          const index = Math.max(
            0,
            Math.min(7, Math.round(event.nativeEvent.contentOffset.x / tickWidth)),
          );
          if (hoursList[index] !== value) {
            feedback();
            onChange(hoursList[index]);
          }
        }}
      >
        {hoursList.map((hours) => (
          <Tap
            key={hours}
            label={`Set ${hours} hours`}
            onPress={() => onChange(hours)}
            style={{ width: tickWidth, alignItems: 'center', gap: space.sm }}
          >
            <View
              style={{
                height: hours % 1 === 0 ? space.xxl : space.md,
                width: 1,
                backgroundColor: colors.muted,
              }}
            />
            <Label
              style={{
                fontFamily: value === hours ? fonts.bold : fonts.body,
                fontSize: type.caption,
                color: value === hours ? colors.purpleInk : colors.muted,
              }}
            >
              {hours === 0.5 ? '30m' : `${hours}h`}
            </Label>
          </Tap>
        ))}
      </ScrollView>
    </View>
  );
}

function ConfettiPiece({ index }: { index: number }) {
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced)
      progress.set(
        withTiming(1, { duration: motion.duration * 4, easing: Easing.out(Easing.quad) }),
      );
  }, [reduced, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(index * 2.4) * progress.value * 120 },
      {
        translateY:
          Math.sin(index * 2.4) * progress.value * 80 + progress.value * progress.value * 60,
      },
      { rotate: `${progress.value * index * 60}deg` },
    ],
  }));
  if (reduced) return null;
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: 6,
          height: 10,
          backgroundColor: [colors.primary, colors.blush, colors.sun, colors.sage][index % 4],
          borderRadius: 2,
        },
        style,
      ]}
    />
  );
}
export function Confetti() {
  return (
    <View
      pointerEvents="none"
      style={{ height: space.xl, alignItems: 'center', justifyContent: 'center' }}
    >
      {Array.from({ length: 20 }, (_, index) => (
        <ConfettiPiece key={index} index={index} />
      ))}
    </View>
  );
}
