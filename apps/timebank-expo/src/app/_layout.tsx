import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { colors, sizes } from '../theme/tokens';
import { TabBar } from '../components/Shell';
import { Label, Skeleton, Toast } from '../components/ui';

export default function Layout() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    InstrumentSerif_400Regular_Italic,
  });
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: sizes.maxWidth,
            alignSelf: 'center',
            backgroundColor: colors.canvas,
          }}
        >
          {error ? (
            <Label>Unable to load local fonts. Please reload the app.</Label>
          ) : loaded ? (
            <>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.canvas },
                  animation: 'fade',
                }}
              />
              <TabBar />
              <Toast />
            </>
          ) : (
            <Skeleton />
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
