import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { router, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bell,
  Home,
  ArrowLeftRight,
  Plus,
  ClipboardList,
  UserRound,
  ArrowLeft,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, fonts, radii, sizes, space, type } from '../theme/tokens';
import { Avatar, Button, Label, Logo, Sheet, styles, Tap } from './ui';

export function Header({ title }: { title?: string }) {
  const [notifications, setNotifications] = useState(false);
  return (
    <>
      <BlurView
        intensity={60}
        tint="light"
        style={{ paddingHorizontal: space.xl, paddingVertical: space.sm }}
      >
        <View style={styles.between}>
          {title ? (
            <View style={styles.row}>
              <Tap
                label="Go back"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              >
                <ArrowLeft size={sizes.icon} />
              </Tap>
              <Label style={styles.title}>{title}</Label>
            </View>
          ) : (
            <View style={styles.row}>
              <Logo />
              <View>
                <Label
                  style={{ fontFamily: fonts.heavy, fontSize: type.caption, letterSpacing: -0.3 }}
                >
                  INDIAN
                </Label>
                <Label
                  style={{ fontFamily: fonts.heavy, fontSize: type.caption, letterSpacing: -0.3 }}
                >
                  TIMEBANK
                </Label>
              </View>
            </View>
          )}
          <View style={styles.row}>
            <Tap
              label="Notifications"
              onPress={() => setNotifications(true)}
              style={{ width: sizes.touch, alignItems: 'center' }}
            >
              <Bell size={sizes.icon} color={colors.ink} />
              <View
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 10,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.orange,
                }}
              />
            </Tap>
            <Tap label="Your profile" onPress={() => router.push('/profile')}>
              <Avatar name="Shibily Mohammed" size={36} category="Learning" />
            </Tap>
          </View>
        </View>
      </BlurView>
      <Sheet
        title="Your community is moving"
        open={notifications}
        onClose={() => setNotifications(false)}
      >
        <Label>Meera saved your photography offer.</Label>
        <Label>A new mentoring request is nearby.</Label>
        <Label style={styles.caption}>Sample notifications for this demo.</Label>
      </Sheet>
    </>
  );
}
export function Screen({
  children,
  scroll = false,
  title,
  header = true,
  footer,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  title?: string;
  header?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: colors.canvas }}
    >
      {header && <Header title={title} />}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: space.xl,
            paddingBottom: footer ? sizes.bottomSpace + sizes.nav : sizes.bottomSpace,
            gap: space.lg,
          }}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
      {footer && (
        <BlurView
          intensity={85}
          tint="light"
          style={{
            position: 'absolute',
            bottom: sizes.bottomSpace - space.lg,
            left: space.xl,
            right: space.xl,
            padding: space.sm,
            borderRadius: radii.pill,
          }}
        >
          {footer}
        </BlurView>
      )}
    </SafeAreaView>
  );
}
export function TabBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!reduced)
      scale.value = withRepeat(
        withSequence(withTiming(1.04, { duration: 1700 }), withTiming(1, { duration: 1700 })),
        -1,
      );
  }, [reduced, scale]);
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tabs = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/exchange', label: 'Exchange', icon: ArrowLeftRight },
    { path: '+', label: 'Create', icon: Plus },
    { path: '/requests', label: 'Requests', icon: ClipboardList },
    { path: '/profile', label: 'Profile', icon: UserRound },
  ] as const;
  return (
    <>
      <View
        style={{
          position: 'absolute',
          bottom: space.md,
          left: space.md,
          right: space.md,
          borderRadius: radii.pill,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.surface,
        }}
      >
        <BlurView
          intensity={85}
          tint="light"
          style={{
            flexDirection: 'row',
            padding: space.sm,
            alignItems: 'center',
            justifyContent: 'space-around',
            minHeight: sizes.nav,
          }}
        >
          {tabs.map(({ path, label, icon: Icon }) =>
            path === '+' ? (
              <Tap key={path} label="Create a time listing" onPress={() => setOpen(true)}>
                <Animated.View style={pulse}>
                  <LinearGradient
                    colors={[colors.primary, colors.purpleInk]}
                    style={{
                      height: 52,
                      width: 52,
                      borderRadius: radii.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Plus size={28} color={colors.white} />
                  </LinearGradient>
                </Animated.View>
              </Tap>
            ) : (
              <Tap
                key={path}
                label={label}
                onPress={() => router.navigate(path)}
                style={{ alignItems: 'center', gap: space.xs, minWidth: 52 }}
              >
                <Icon
                  size={22}
                  color={pathname === path ? colors.purpleInk : colors.muted}
                  fill={pathname === path && path === '/' ? colors.primarySoft : 'transparent'}
                />
                <Label
                  style={{
                    fontSize: 10,
                    fontFamily: pathname === path ? fonts.bold : fonts.body,
                    color: pathname === path ? colors.purpleInk : colors.muted,
                  }}
                >
                  {label}
                </Label>
                {pathname === path && (
                  <View
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: 2,
                      backgroundColor: colors.purpleInk,
                    }}
                  />
                )}
              </Tap>
            ),
          )}
        </BlurView>
      </View>
      <Sheet title="What would you like to do?" open={open} onClose={() => setOpen(false)}>
        <Button
          title="Give time"
          onPress={() => {
            setOpen(false);
            router.push('/exchange?mode=Give');
          }}
        />
        <Button
          title="Request time"
          soft
          onPress={() => {
            setOpen(false);
            router.push('/exchange?mode=Request');
          }}
        />
      </Sheet>
    </>
  );
}
