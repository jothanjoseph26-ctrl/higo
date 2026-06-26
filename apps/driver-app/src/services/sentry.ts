import React from 'react';
import * as Sentry from '@sentry/react-native';
import { Text, View } from 'react-native';

let sentryEnabled = false;
let disabledLogged = false;

function getSentryDsn(): string {
  return process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? '';
}

export function initSentry(): void {
  const dsn = getSentryDsn();

  if (!dsn) {
    if (!disabledLogged) {
      console.log('Sentry disabled');
      disabledLogged = true;
    }
    return;
  }

  try {
    const environment =
      typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production';

    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
      enableAutoSessionTracking: true,
    });
    sentryEnabled = true;
  } catch (error) {
    console.warn('Sentry init failed:', error);
    sentryEnabled = false;
  }
}

export function isSentryEnabled(): boolean {
  return sentryEnabled;
}

type SentryRootProps = {
  children: React.ReactNode;
};

const errorFallback = React.createElement(
  View,
  { style: { flex: 1, alignItems: 'center', justifyContent: 'center' } },
  React.createElement(Text, null, 'Something went wrong.'),
);

export function SentryRoot({ children }: SentryRootProps) {
  if (!sentryEnabled) {
    return React.createElement(React.Fragment, null, children);
  }

  return React.createElement(
    Sentry.ErrorBoundary,
    { fallback: errorFallback },
    children,
  );
}