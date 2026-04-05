import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import {
  approveClaim,
  rejectClaim,
  fetchSupersedingClaims,
  updateClaim,
  type SupersedingClaim,
} from '@stroom/supabase';
import { titleCase } from '../../src/components/JsonView';
import { useClaimDetail } from '../../src/hooks/useClaimDetail';
import { StatusBadge, STATUS_COLORS } from '../../src/components/StatusBadge';
import { JsonView } from '../../src/components/JsonView';
import { RejectSheet } from '../../src/components/RejectSheet';
import { ClaimDiffSheet } from '../../src/components/ClaimDiffSheet';
import { RetryCard } from '../../src/components/RetryCard';
import { GlowSpot } from '../../src/components/GlowSpot';
import { useBrandToast } from '../../src/components/BrandToast';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import supabase from '../../src/lib/supabase';
import type { ClaimCorroborationDetail } from '@stroom/supabase';
import type { RejectionReason } from '@stroom/types';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function ClaimDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { claim, corroborations, loading, error, refresh: refreshClaim } =
    useClaimDetail(id);
  const { show: showToast } = useBrandToast();
  const [supersedes, setSupersedes] = useState<SupersedingClaim[]>([]);
  const [diffTargetId, setDiffTargetId] = useState<string | null>(null);
  const [observation, setObservation] = useState<{
    id: string;
    extraction_method: string | null;
    captured_at: string | null;
    raw_excerpt: string | null;
  } | null>(null);
  const [editHistory, setEditHistory] = useState<
    Array<{
      id: string;
      action_type: string | null;
      actor: string | null;
      old_state: Record<string, unknown> | null;
      new_state: Record<string, unknown> | null;
      created_at: string;
    }>
  >([]);
  // Inline field edit state — scalar top-level keys of value_jsonb
  const [editDraft, setEditDraft] = useState<Record<string, string> | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const scalarEntries = React.useMemo(() => {
    const jsonb = claim?.value_jsonb;
    if (!jsonb || typeof jsonb !== 'object' || Array.isArray(jsonb)) return [];
    return Object.entries(jsonb).filter(
      ([, v]) =>
        v === null ||
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
    );
  }, [claim]);

  const beginEdit = useCallback(
    (key: string) => {
      if (!claim) return;
      const current = editDraft ?? {};
      const jsonb = (claim.value_jsonb ?? {}) as Record<string, unknown>;
      const initial: Record<string, string> = { ...current };
      if (!(key in initial)) {
        const v = jsonb[key];
        initial[key] = v == null ? '' : String(v);
      }
      setEditDraft(initial);
    },
    [claim, editDraft]
  );

  const cancelEdit = useCallback(() => setEditDraft(null), []);

  const saveEdit = useCallback(async () => {
    if (!claim || !editDraft) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditSaving(true);
    try {
      const originalJsonb = (claim.value_jsonb ?? {}) as Record<string, unknown>;
      const nextJsonb: Record<string, unknown> = { ...originalJsonb };

      // Coerce each dirty value back to its original scalar type when possible.
      for (const [k, rawStr] of Object.entries(editDraft)) {
        const prev = originalJsonb[k];
        if (rawStr === '') {
          nextJsonb[k] = null;
          continue;
        }
        if (typeof prev === 'number') {
          const n = Number(rawStr);
          nextJsonb[k] = Number.isNaN(n) ? rawStr : n;
        } else if (typeof prev === 'boolean') {
          nextJsonb[k] = rawStr === 'true';
        } else {
          nextJsonb[k] = rawStr;
        }
      }

      await updateClaim(supabase, claim.id, { value_jsonb: nextJsonb });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Value updated', 'success');
      setEditDraft(null);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast(e?.message ?? 'Save failed', 'error');
    } finally {
      setEditSaving(false);
    }
  }, [claim, editDraft, showToast]);

  // Fetch any newer claims with the same (subject, predicate) — the
  // "Corrections" chain shown on claims flagged as corrected/superseded.
  React.useEffect(() => {
    if (!claim) return;
    if (claim.status !== 'corrected' && claim.status !== 'superseded') {
      setSupersedes([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchSupersedingClaims(
          supabase,
          claim.id,
          claim.subject_entity_id,
          claim.predicate,
          claim.created_at
        );
        if (!cancelled) setSupersedes(rows);
      } catch {
        if (!cancelled) setSupersedes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claim]);

  // Fetch full audit history for this claim (governance timeline).
  React.useEffect(() => {
    if (!claim?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('audit_log')
          .select('id, action_type, actor, old_state, new_state, created_at')
          .eq('entity_table', 'claims')
          .eq('entity_id', claim.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (!cancelled) setEditHistory((data as any) ?? []);
      } catch {
        if (!cancelled) setEditHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claim?.id]);

  // Fetch the observation that produced this claim — the middle link in
  // the Source → Observation → Claim provenance chain. We query
  // intel.observations by source_id and pick the most recent that matches.
  React.useEffect(() => {
    if (!claim?.source?.id) {
      setObservation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('observations')
          .select('id, extraction_method, captured_at, raw_excerpt')
          .eq('source_id', claim.source!.id)
          .order('captured_at', { ascending: false })
          .limit(1);
        if (!cancelled) setObservation((data?.[0] as any) ?? null);
      } catch {
        if (!cancelled) setObservation(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claim?.source?.id]);

  const [rejectVisible, setRejectVisible] = useState(false);
  const [acting, setActing] = useState(false);
  // Local status override so the badge can animate to its new state before
  // we navigate back. Null = fall through to claim.status.
  const [overrideStatus, setOverrideStatus] = useState<string | null>(null);
  const badgePulse = useSharedValue(0);
  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + badgePulse.value * 0.1 }],
    opacity: 1 - badgePulse.value * 0.1,
  }));
  const animateBadgeSwap = () => {
    badgePulse.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.in(Easing.ease) }),
      withTiming(0, { duration: 260, easing: Easing.out(Easing.ease) })
    );
  };

  const openUrl = useCallback((url: string | null | undefined) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  }, []);

  const handleApprove = useCallback(async () => {
    if (!claim || acting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActing(true);
    try {
      await approveClaim(supabase, claim.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOverrideStatus('approved');
      animateBadgeSwap();
      showToast('Claim approved', 'success');
      setTimeout(() => router.back(), 500);
    } catch (e: any) {
      setActing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast(e?.message ?? 'Approve failed', 'error');
    }
  }, [claim, acting, router, showToast]);

  const openRejectSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRejectVisible(true);
  }, []);

  const handleReject = useCallback(
    async (reason: RejectionReason, notes?: string) => {
      if (!claim) return;
      setRejectVisible(false);
      setActing(true);
      try {
        await rejectClaim(supabase, claim.id, reason, notes);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setOverrideStatus('rejected');
        animateBadgeSwap();
        showToast('Claim rejected', 'warn');
        setTimeout(() => router.back(), 500);
      } catch (e: any) {
        setActing(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showToast(e?.message ?? 'Reject failed', 'error');
      }
    },
    [claim, router, showToast]
  );

  const handleCopyId = useCallback(async () => {
    if (!claim) return;
    await Clipboard.setStringAsync(claim.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [claim]);

  const handleEdit = useCallback(() => {
    if (!claim) return;
    Haptics.selectionAsync();
    router.push({
      pathname: '/claim/edit/[id]',
      params: { id: claim.id },
    } as any);
  }, [claim, router]);

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
          {error ? (
            <RetryCard
              message="Couldn't load claim"
              detail={error}
              onRetry={refreshClaim}
            />
          ) : (
            <Text style={styles.errorText}>Claim not found</Text>
          )}
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
      {/* Status-matched atmospheric glow behind the badge */}
      <GlowSpot
        size={360}
        opacity={0.08}
        color={STATUS_COLORS[claim.status] ?? colors.teal}
        top={insets.top + 20}
        left={-80}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: 96 + Math.max(insets.bottom, spacing.md) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status + age */}
        <View style={styles.statusRow}>
          <Animated.View style={badgeAnimatedStyle}>
            <StatusBadge status={(overrideStatus ?? claim.status) as any} />
          </Animated.View>
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
          <View style={styles.valueHeaderRow}>
            <Text style={styles.valueLabel}>VALUE</Text>
            {editDraft && (
              <Text style={styles.valueHint}>Tap Save to persist changes</Text>
            )}
          </View>
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
          ) : scalarEntries.length === 0 ? (
            <JsonView value={claim.value_jsonb} />
          ) : (
            <>
              {scalarEntries.map(([key, value]) => {
                const isEditing = editDraft != null && key in editDraft;
                return (
                  <View key={key} style={styles.editFieldRow}>
                    <Text style={styles.editFieldKey}>{titleCase(key)}</Text>
                    {isEditing ? (
                      <TextInput
                        value={editDraft![key]}
                        onChangeText={(next) =>
                          setEditDraft((prev) => ({ ...(prev ?? {}), [key]: next }))
                        }
                        style={styles.editFieldInput}
                        placeholder="—"
                        placeholderTextColor={colors.slate}
                        autoFocus
                      />
                    ) : (
                      <Pressable
                        onPress={() => beginEdit(key)}
                        style={({ pressed }) => [
                          styles.editFieldDisplay,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={styles.editFieldValue} numberOfLines={3}>
                          {value == null || value === '' ? '—' : String(value)}
                        </Text>
                        <Ionicons
                          name="pencil"
                          size={11}
                          color={colors.slate}
                        />
                      </Pressable>
                    )}
                  </View>
                );
              })}

              {editDraft && (
                <View style={styles.editBar}>
                  <Pressable
                    onPress={cancelEdit}
                    disabled={editSaving}
                    style={({ pressed }) => [
                      styles.editCancelBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={styles.editCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveEdit}
                    disabled={editSaving}
                    style={({ pressed }) => [
                      styles.editSaveBtn,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    {editSaving ? (
                      <ActivityIndicator size="small" color={colors.obsidian} />
                    ) : (
                      <Ionicons name="save" size={14} color={colors.obsidian} />
                    )}
                    <Text style={styles.editSaveText}>Save</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>

        {/* Scores */}
        <View style={styles.scoresRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>CONFIDENCE</Text>
            <Text style={styles.scoreValue}>
              {confidence != null ? Number(confidence).toFixed(1) : '—'}
            </Text>
            {confidence != null && (
              <Text style={styles.scoreSuffix}>/ 10</Text>
            )}
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

        {/* Provenance chain: Source → Observation → Claim */}
        {claim.source && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>PROVENANCE</Text>
            <View style={styles.provChain}>
              <ProvenanceNode
                icon="globe-outline"
                label="Source"
                title={claim.source.source_name}
                meta={
                  claim.source.source_url
                    ? claim.source.source_url.replace(/^https?:\/\//, '')
                    : `trust ${Number(claim.source.trust_score).toFixed(1)}`
                }
              />
              <View style={styles.provConnector} />
              <ProvenanceNode
                icon="eye-outline"
                label="Observation"
                title={
                  observation?.extraction_method
                    ? titleCase(observation.extraction_method)
                    : 'No observation recorded'
                }
                meta={
                  observation?.captured_at
                    ? `captured ${formatDate(observation.captured_at)}`
                    : observation
                    ? 'timestamp unknown'
                    : 'fetch pending'
                }
                dim={!observation}
                excerpt={observation?.raw_excerpt ?? null}
              />
              <View style={styles.provConnector} />
              <ProvenanceNode
                icon="document-text-outline"
                label="Claim"
                title={formatPredicate(claim.predicate ?? 'unknown')}
                meta={`extracted ${formatDate(claim.created_at)}`}
                active
              />
            </View>
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

        {/* Edit history — full audit trail for this claim */}
        {editHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>
              EDIT HISTORY ({editHistory.length})
            </Text>
            <View style={styles.historyList}>
              {editHistory.map((row, i) => (
                <EditHistoryRow
                  key={row.id}
                  row={row}
                  isLast={i === editHistory.length - 1}
                />
              ))}
            </View>
          </View>
        )}

        {/* Corrections */}
        {supersedes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>
              CORRECTIONS ({supersedes.length})
            </Text>
            {supersedes.map((s) => (
              <View key={s.id} style={styles.correctionRow}>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/claim/[id]', params: { id: s.id } } as any)
                  }
                  style={({ pressed }) => [
                    styles.correctionBody,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.correctionTop}>
                    <StatusBadge status={s.status as any} />
                    <Text style={styles.correctionAge}>
                      {formatDate(s.created_at)}
                    </Text>
                  </View>
                  {s.source && (
                    <Text style={styles.correctionSource} numberOfLines={1}>
                      {s.source.source_name} · trust{' '}
                      {Number(s.source.trust_score).toFixed(1)}
                      {s.confidence_score != null &&
                        ` · conf ${Number(s.confidence_score).toFixed(1)}`}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setDiffTargetId(s.id)}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.showDiffBtn,
                    pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <Ionicons
                    name="git-compare-outline"
                    size={12}
                    color={colors.teal}
                  />
                  <Text style={styles.showDiffText}>Show Diff</Text>
                </Pressable>
              </View>
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
          <Pressable
            onPress={handleCopyId}
            style={({ pressed }) => [
              styles.copyIdBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="copy-outline" size={13} color={colors.teal} />
            <Text style={styles.copyIdText}>Copy Claim ID</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Sticky action bar */}
      <View
        style={[
          styles.actionBar,
          { paddingBottom: Math.max(insets.bottom, spacing.md) },
        ]}
      >
        <Pressable
          onPress={openRejectSheet}
          disabled={acting}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.rejectBtn,
            (pressed || acting) && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="close" size={18} color={colors.statusReject} />
          <Text style={[styles.actionText, { color: colors.statusReject }]}>
            Reject
          </Text>
        </Pressable>

        <Pressable
          onPress={handleEdit}
          disabled={acting}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.editBtn,
            (pressed || acting) && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="create-outline" size={18} color={colors.teal} />
          <Text style={[styles.actionText, { color: colors.teal }]}>Edit</Text>
        </Pressable>

        <Pressable
          onPress={handleApprove}
          disabled={acting}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.approveBtn,
            (pressed || acting) && { opacity: 0.7 },
          ]}
        >
          {acting ? (
            <ActivityIndicator size="small" color={colors.statusApprove} />
          ) : (
            <Ionicons name="checkmark" size={18} color={colors.statusApprove} />
          )}
          <Text style={[styles.actionText, { color: colors.statusApprove }]}>
            Approve
          </Text>
        </Pressable>
      </View>

      <RejectSheet
        visible={rejectVisible}
        onDismiss={() => setRejectVisible(false)}
        onReject={handleReject}
      />

      <ClaimDiffSheet
        visible={diffTargetId !== null}
        baseClaimId={claim?.id ?? null}
        baseValueJsonb={(claim?.value_jsonb ?? null) as any}
        targetClaimId={diffTargetId}
        onDismiss={() => setDiffTargetId(null)}
      />
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

function EditHistoryRow({
  row,
  isLast,
}: {
  row: {
    id: string;
    action_type: string | null;
    actor: string | null;
    old_state: Record<string, unknown> | null;
    new_state: Record<string, unknown> | null;
    created_at: string;
  };
  isLast: boolean;
}) {
  const iconName =
    row.action_type === 'approve'
      ? 'checkmark-circle-outline'
      : row.action_type === 'reject'
      ? 'close-circle-outline'
      : row.action_type === 'update'
      ? 'create-outline'
      : row.action_type === 'correct'
      ? 'git-branch-outline'
      : row.action_type === 'supersede'
      ? 'git-compare-outline'
      : 'time-outline';
  const color =
    row.action_type === 'approve'
      ? colors.statusApprove
      : row.action_type === 'reject'
      ? colors.statusReject
      : row.action_type === 'update' || row.action_type === 'correct'
      ? colors.statusInfo
      : colors.silver;

  // Compute a short diff blurb from the dirty keys in old/new state.
  const diffLine = React.useMemo(() => {
    const oldS = row.old_state ?? {};
    const newS = row.new_state ?? {};
    const keys = new Set([...Object.keys(oldS), ...Object.keys(newS)]);
    const dirty: string[] = [];
    for (const k of keys) {
      const a = (oldS as any)[k];
      const b = (newS as any)[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) dirty.push(k);
    }
    if (dirty.length === 0) return null;
    const first = dirty[0];
    const a = (oldS as any)[first];
    const b = (newS as any)[first];
    const fmt = (v: any) =>
      v == null
        ? '—'
        : typeof v === 'object'
        ? JSON.stringify(v).slice(0, 40)
        : String(v).slice(0, 40);
    const extra = dirty.length > 1 ? ` · +${dirty.length - 1} more` : '';
    return `${first}: ${fmt(a)} → ${fmt(b)}${extra}`;
  }, [row.old_state, row.new_state]);

  return (
    <View style={styles.historyRow}>
      <View style={styles.historyRail}>
        <View
          style={[
            styles.historyIconCircle,
            { borderColor: color, backgroundColor: `${color}14` },
          ]}
        >
          <Ionicons name={iconName as any} size={12} color={color} />
        </View>
        {!isLast && <View style={styles.historyRailLine} />}
      </View>
      <View style={styles.historyBody}>
        <View style={styles.historyTopLine}>
          <Text style={[styles.historyAction, { color }]}>
            {(row.action_type ?? 'event').replace(/_/g, ' ')}
          </Text>
          <Text style={styles.historyActor}>
            {row.actor ?? 'system'}
          </Text>
        </View>
        {diffLine ? (
          <Text style={styles.historyDiff} numberOfLines={2}>
            {diffLine}
          </Text>
        ) : null}
        <Text style={styles.historyTime}>{formatDate(row.created_at)}</Text>
      </View>
    </View>
  );
}

function ProvenanceNode({
  icon,
  label,
  title,
  meta,
  excerpt,
  active,
  dim,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  title: string;
  meta: string;
  excerpt?: string | null;
  active?: boolean;
  dim?: boolean;
}) {
  return (
    <View style={[styles.provNode, dim && { opacity: 0.55 }]}>
      <View
        style={[
          styles.provIconCircle,
          active && { borderColor: colors.teal, backgroundColor: colors.tealDim },
        ]}
      >
        <Ionicons
          name={icon}
          size={14}
          color={active ? colors.teal : colors.silver}
        />
      </View>
      <View style={styles.provBody}>
        <Text style={styles.provLabel}>{label.toUpperCase()}</Text>
        <Text style={styles.provTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.provMeta} numberOfLines={1}>
          {meta}
        </Text>
        {excerpt ? (
          <Text style={styles.provExcerpt} numberOfLines={3}>
            "{excerpt}"
          </Text>
        ) : null}
      </View>
    </View>
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
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
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
  valueHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  valueHint: {
    fontFamily: fonts.mono.regular,
    fontSize: 9,
    color: colors.teal,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  editFieldRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    gap: 4,
  },
  editFieldKey: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  editFieldDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  editFieldValue: {
    flex: 1,
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.silver,
    lineHeight: 19,
  },
  editFieldInput: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.alabaster,
    backgroundColor: 'rgba(0, 161, 155, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  editBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  editCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCancelText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.silver,
  },
  editSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.teal,
  },
  editSaveText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 12,
    color: colors.obsidian,
    letterSpacing: -0.1,
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
  scoreSuffix: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 2,
  },
  correctionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs,
  },
  correctionBody: {
    flex: 1,
    gap: 4,
  },
  correctionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  correctionAge: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
  },
  correctionSource: {
    fontFamily: fonts.archivo.regular,
    fontSize: 11,
    color: colors.silver,
  },
  showDiffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  showDiffText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.teal,
  },
  copyIdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  copyIdText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.teal,
    letterSpacing: -0.1,
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  approveBtn: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  rejectBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  editBtn: {
    backgroundColor: colors.tealDim,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  actionText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    letterSpacing: -0.2,
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
  provChain: {
    gap: 0,
  },
  historyList: {
    gap: 0,
  },
  historyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  historyRail: {
    alignItems: 'center',
    width: 22,
  },
  historyIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyRailLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.glassBorder,
    marginVertical: 2,
  },
  historyBody: {
    flex: 1,
    paddingBottom: spacing.md,
    gap: 2,
  },
  historyTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  historyAction: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  historyActor: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
  },
  historyDiff: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.silver,
    lineHeight: 15,
  },
  historyTime: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 2,
  },
  provNode: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  provIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  provBody: {
    flex: 1,
    gap: 2,
  },
  provLabel: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.slate,
  },
  provTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  provMeta: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
  },
  provExcerpt: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.silver,
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 16,
  },
  provConnector: {
    width: 2,
    height: 16,
    backgroundColor: colors.glassBorder,
    marginLeft: spacing.md + 14 - 1,
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
    color: colors.teal,
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
