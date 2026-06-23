import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { theme } from '../theme';

interface ScreenShellProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}

export function ScreenShell({
  title,
  subtitle,
  children,
  scroll = true,
  contentStyle,
}: ScreenShellProps) {
  const body = (
    <View style={[styles.content, contentStyle]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.lightGrey,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: theme.spacing.lg,
    lineHeight: 22,
  },
});
