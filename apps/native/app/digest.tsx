import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { HourBucket } from '@stroom/supabase';
import { useDailyDigest } from '../src/hooks/useDailyDigest';
import { ScreenCanvas } from '../src/components/ScreenCanvas';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

export default function DigestScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { digest, loading, error, refresh } = useDailyDigest();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Pulse</Text>
        </Pressable>
        <Text style={styles.title}>Daily Digest</Text>
        <Text style={styles.subtitle}>{todayLabel}</Text>
      </View>

      {loading && !digest ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error && !digest ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : digest ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
        >
          <DigestCard
            icon="layers-outline"
            iconColor={colors.teal}
            label="Claims Ingested"
            total={digest.claimsTotal}
            buckets={digest.claimsByHour}
            barColor={colors.teal}
          />

          <DigestCard
            icon="checkmark-done"
            iconColor={colors.statusApprove}
            label="Governance Actions"
            total={digest.approvalsTotal + digest.rejectionsTotal}
            buckets={digest.actionsByHour}
            barColor={colors.statusApprove}
            footer={
              <View style={styles.breakdown}>
                <View style={styles.breakdownCell}>
                  <View
                    style={[styles.breakdownDot, { backgroundColor: colors.statusApprove }]}
                  />
                  <Text style={styles.breakdownText}>
                    {digest.approvalsTotal} approved
                  </Text>
                </View>
                <View style={styles.breakdownCell}>
                  <View
                    style={[styles.breakdownDot, { backgroundColor: colors.statusReject }]}
                  />
                  <Text style={styles.breakdownText}>
                    {digest.rejectionsTotal} rejected
                  </Text>
                </View>
              </View>
            }
          />

          <DigestCard
            icon="cube-outline"
            iconColor={colors.statusInfo}
            label="Sources Checked"
            total={digest.sourcesTotal}
            buckets={digest.sourcesByHour}
            barColor={colors.statusInfo}
            hint="Distinct sources referenced by today's claims"
          />
        </ScrollView>
      ) : null}
    </View>
  );
}

function DigestCard({
  icon,
  iconColor,
  label,
  total,
  buckets,
  barColor,
  hint,
  footer,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  total: number;
  buckets: HourBucket[];
  barColor: string;
  hint?: string;
  footer?: React.ReactNode;
}) {
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { borderColor: iconColor }]}>
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <Text style={styles.cardLabel}>{label}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.cardTotal, { color: iconColor }]}>{total}</Text>
      </View>

      {/* Hourly bar chart */}
      <View style={styles.chart}>
        {buckets.map((b) => {
          const heightPct = max === 0 ? 0 : (b.count / max) * 100;
          return (
            <View key={b.hour} style={styles.barColumn}>
              <View
                style={[
                  styles.bar,
                  {
                    height: `${Math.max(heightPct, b.count > 0 ? 6 : 0)}%`,
                    backgroundColor: b.count > 0 ? barColor : 'transparent',
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.chartAxis}>
        <Text style={styles.axisLabel}>00</Text>
        <Text style={styles.axisLabel}>06</Text>
        <Text style={styles.axisLabel}>12</Text>
        <Text style={styles.axisLabel}>18</Text>
        <Text style={styles.axisLabel}>24</Text>
      </View>

      {footer}
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  backText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 16,
    color: colors.alabaster,
    marginLeft: 2,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardLabel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  cardTotal: {
    fontFamily: fonts.mono.semibold,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 72,
    gap: 2,
  },
  barColumn: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 2,
    opacity: 0.85,
  },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  axisLabel: {
    fontFamily: fonts.mono.regular,
    fontSize: 9,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
  },
  breakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  breakdownCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.silver,
  },
  hint: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: spacing.sm,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
  },
});
