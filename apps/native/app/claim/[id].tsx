import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useClaimDetail } from '../../src/hooks/useClaimDetail';
import { StatusBadge } from '../../src/components/StatusBadge';
import { JsonView } from '../../src/components/JsonView';
import type { ClaimCorroborationDetail } from '@stroom/supabase';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function ClaimDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { claim, corroborations, loading, error } = useClaimDetail(id);

  const openUrl = useCallback((url: string | null | undefined) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  }, []);

  if (loading) {
    return (
      <LinearGradient
        colors={[gradient.background[0], gradient.background[1]]}
        style={styles.container}
      >
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      </LinearGradient>
    );
  }

  if (error || !claim) {
    return (
      <LinearGradient
        colors={[gradient.background[0], gradient.background[1]]}
        style={styles.container}
      >
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <BackButton onPress={() => router.back()} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Claim not found'}</Text>
        </View>
      </LinearGradient>
    );
  }

  const predicate = claim.predicate ?? 'unknown';
  const predicateLabel = formatPredicate(predicate);
  const subject = claim.subject_entity?.canonical_name ?? '—';
  const object = claim.object_entity?.canonical_name;
  const confidence = claim.confidence_score;
  const corrobScore = claim.corroboration_score ?? 0;

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Status + age */}
        <View style={styles.statusRow}>
          <StatusBadge status={claim.status} />
          <Text style={styles.age}>{formatDate(claim.created_at)}</Text>
        </View>

        {/* Subject → Object */}
        <Pressable
          onPress={() =>
            claim.subject_entity_id &&
            router.push({
              pathname: '/entity/[id]',
              params: { id: claim.subject_entity_id },
            } as any)
          }
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={styles.entityLink} numberOfLines={2}>
            {subject}
          </Text>
        </Pressable>

        <View style={styles.predicateBlock}>
          <Text style={styles.predicateLabel}>{predicateLabel}</Text>
          <Text style={styles.predicateRaw}>{predicate}</Text>
        </View>

        {/* Value payload */}
        <View style={styles.valueCard}>
          <Text style={styles.valueLabel}>VALUE</Text>
          {object ? (
            <Pressable
              onPress={() =>
                claim.object_entity_id &&
                router.push({
                  pathname: '/entity/[id]',
                  params: { id: claim.object_entity_id },
                } as any)
              }
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.entityLinkSmall}>{object}</Text>
            </Pressable>
          ) : (
            <JsonView value={claim.value_jsonb} />
          )}
        </View>

        {/* Scores */}
        <View style={styles.scoresRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>CONFIDENCE</Text>
            <Text style={styles.scoreValue}>
              {confidence != null ? (Number(confidence) * 100).toFixed(0) + '%' : '—'}
            </Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>CORROBORATIONS</Text>
            <Text style={styles.scoreValue}>{corrobScore}</Text>
          </View>
        </View>

        {/* Primary source */}
        {claim.source && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>PRIMARY SOURCE</Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/source/[id]',
                  params: { id: claim.source!.id },
                } as any)
              }
              style={({ pressed }) => [
                styles.sourceCard,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={styles.sourceHeader}>
                <Text style={styles.sourceName} numberOfLines={1}>
                  {claim.source.source_name}
                </Text>
                <Text
                  style={[
                    styles.trustScore,
                    Number(claim.source.trust_score) >= 7.5
                      ? styles.trustHigh
                      : styles.trustLow,
                  ]}
                >
                  {Number(claim.source.trust_score).toFixed(1)}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.slate} />
              </View>
              {claim.source.source_url && (
                <Pressable
                  onPress={() => openUrl(claim.source!.source_url)}
                  style={({ pressed }) => [
                    styles.urlRow,
                    pressed && { opacity: 0.6 },
                  ]}
                  hitSlop={4}
                >
                  <Ionicons
                    name="open-outline"
                    size={12}
                    color={colors.slate}
                  />
                  <Text style={styles.url} numberOfLines={1}>
                    {claim.source.source_url}
                  </Text>
                </Pressable>
              )}
            </Pressable>
          </View>
        )}

        {/* Corroborations */}
        {corroborations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>
              CORROBORATIONS ({corroborations.length})
            </Text>
            {corroborations.map((c) => (
              <CorroborationRow key={c.id} corrob={c} onOpen={openUrl} />
            ))}
          </View>
        )}

        {/* Metadata */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>METADATA</Text>
          {claim.extraction_method && (
            <MetaRow label="Extraction" value={claim.extraction_method} />
          )}
          {claim.claim_family && (
            <MetaRow label="Family" value={claim.claim_family} />
          )}
          {claim.scope_context && (
            <MetaRow label="Scope" value={claim.scope_context} />
          )}
          {claim.scope_valid_from && (
            <MetaRow
              label="Valid From"
              value={formatDate(claim.scope_valid_from)}
            />
          )}
          {claim.scope_valid_until && (
            <MetaRow
              label="Valid Until"
              value={formatDate(claim.scope_valid_until)}
            />
          )}
          {claim.effective_at && (
            <MetaRow
              label="Effective"
              value={formatDate(claim.effective_at)}
            />
          )}
          <MetaRow label="Claim ID" value={claim.id} mono />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
      hitSlop={10}
    >
      <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
      <Text style={styles.backText}>Back</Text>
    </Pressable>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text
        style={[styles.metaValue, mono && { fontFamily: fonts.mono.regular }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function CorroborationRow({
  corrob,
  onOpen,
}: {
  corrob: ClaimCorroborationDetail;
  onOpen: (url: string | null) => void;
}) {
  const trust = Number(corrob.source?.trust_score ?? 0);
  return (
    <Pressable
      onPress={() => onOpen(corrob.citation_url)}
      disabled={!corrob.citation_url}
      style={({ pressed }) => [
        styles.corrobCard,
        pressed && corrob.citation_url && { opacity: 0.7 },
      ]}
    >
      <View style={styles.sourceHeader}>
        <Text style={styles.sourceName} numberOfLines={1}>
          {corrob.source?.source_name ?? 'Unknown source'}
        </Text>
        <Text
          style={[
            styles.trustScore,
            trust >= 7.5 ? styles.trustHigh : styles.trustLow,
          ]}
        >
          {trust.toFixed(1)}
        </Text>
      </View>
      {corrob.citation_url && (
        <View style={styles.urlRow}>
          <Ionicons name="open-outline" size={11} color={colors.slate} />
          <Text style={styles.url} numberOfLines={1}>
            {corrob.citation_url}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function formatPredicate(pred: string): string {
  const last = pred.includes('.') ? pred.split('.').pop()! : pred;
  return last.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 16,
    color: colors.alabaster,
    marginLeft: 2,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  age: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  entityLink: {
    fontFamily: fonts.archivo.bold,
    fontSize: 26,
    color: colors.alabaster,
    letterSpacing: -0.6,
    marginBottom: spacing.sm,
  },
  entityLinkSmall: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 16,
    color: colors.teal,
    textDecorationLine: 'underline',
    textDecorationColor: colors.tealDim,
  },
  predicateBlock: {
    marginBottom: spacing.lg,
  },
  predicateLabel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.teal,
  },
  predicateRaw: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  valueCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  valueLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  scoresRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  scoreBox: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  scoreLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 1,
  },
  scoreValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 22,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  sourceCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  corrobCard: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs,
    gap: 4,
  },
  sourceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sourceName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
    flex: 1,
  },
  trustScore: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  trustHigh: { color: colors.statusApprove },
  trustLow: { color: colors.statusPending },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  url: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    gap: spacing.md,
  },
  metaLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.slate,
  },
  metaValue: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.silver,
    flex: 1,
    textAlign: 'right',
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
  },
});
