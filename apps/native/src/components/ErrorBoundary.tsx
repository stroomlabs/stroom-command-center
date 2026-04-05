import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius, gradient } from '../constants/brand';

interface Props {
  children: React.ReactNode;
  // Optional: called after the user taps retry (for logging / cache bust).
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

// Catches render/lifecycle errors from any child screen and shows a branded
// fallback with a retry action. Retry resets boundary state so the child tree
// re-mounts.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep a console trace so devs can still see the stack while the user
    // sees the friendly fallback.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <LinearGradient
        colors={[gradient.background[0], gradient.background[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.container}
      >
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="warning-outline" size={28} color={colors.statusReject} />
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            This screen hit an unexpected error. Your data is safe — tap retry
            to reload it.
          </Text>
          {__DEV__ && this.state.error?.message && (
            <Text style={styles.devMessage} numberOfLines={4}>
              {this.state.error.message}
            </Text>
          )}
          <Pressable
            onPress={this.handleReset}
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="refresh" size={16} color={colors.obsidian} />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 20,
    color: colors.alabaster,
    letterSpacing: -0.4,
  },
  body: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
  devMessage: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.statusReject,
    textAlign: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginVertical: spacing.sm,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.teal,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  retryText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    color: colors.obsidian,
    letterSpacing: -0.2,
  },
});
