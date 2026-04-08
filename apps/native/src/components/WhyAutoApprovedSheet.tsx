import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ModalBackdrop } from './ModalBackdrop';
import { useModalTransition } from '../hooks/useModalTransition';
import { useGovernanceDecisionForClaim } from '../hooks/useGovernanceDecisionForClaim';
import { haptics } from '../lib/haptics';
import supabase from '../lib/supabase';
import { useBrandToast } from './BrandToast';
import { colors, fonts, spacing, radius } from '../constants/brand';

// "Why was this auto-approved?" bottom sheet. Reads the governance_decision
// row for the given claim id and renders whatever keys exist in
// decision_metadata JSONB. Keys are rendered in a stable order (common ones
// first) but the sheet tolerates arbitrary JSON.
//
// The schema today is minimal — most rows have null metadata, which shows
// the empty state (gray, no error styling). Policies backfill in a Day 2
// OTA.
//
// Override action calls intel.send_to_manual_review(claim_id) to move the
// claim back into the manual review queue.
interface WhyAutoApprovedSheetProps {
  visible: boolean;
  claimId: string | null;
  onDismiss: () => void;
  onOverride?: () => void;
}

// Ordered key preference for rendering common metadata keys first. Any
// additional keys present in the JSONB render after these, alphabetized.
const PREFERRED_KEYS = [
  'policy_name',
  'rule',
  'threshold',
  'confidence',
  'source_trust',
  'corroboration',
  'entity_type',
  'predicate',
  'reason',
  'notes',
] as const;

export function WhyAutoApprovedSheet({
  visible,
  claimId,
  onDismiss,
  onOverride,
}: WhyAutoApprovedSheetProps) {
  const { cardStyle } = useModalTransition(visible);
  const { decision, loading, error } = useGovernanceDecisionForClaim(
    visible ? claimId : null
  );
  const { show: showToast } = useBrandToast();
  const [overriding, setOverriding] = useState(false);

  const handleOverride = async () => {
    if (!claimId || overriding) return;
    haptics.tap.medium();
    setOverriding(true);
    try {
      const { error: rpcError } = await supabase
        .schema('intel')
        .rpc('send_to_manual_review', { claim_id: claimId });
      if (rpcError) throw rpcError;
      haptics.success();
      showToast('Sent to manual review', 'success');
      onDismiss();
      onOverride?.();
    } catch (e: any) {
      haptics.error();
      showToast(e?.message ?? 'Override failed', 'error');
    } finally {
      setOverriding(false);
    }
  };

  const entries = orderedEntries(decision?.decision_metadata ?? null);
  const hasMetadata = entries.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <ModalBackdrop onPress={onDismiss}>
        <Animated.View style={cardStyle}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerIconWrap}>
                <Ionicons
                  name="sparkles"
                  size={16}
                  color={colors.teal}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Auto-approved</Text>
                <Text style={styles.subtitle}>
                  {decision?.decision_status ?? 'governance_decision'}
                </Text>
              </View>
            </View>

            {/* Body */}
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color={colors.teal} />
                </View>
              ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : hasMetadata ? (
                entries.map(([key, value]) => (
                  <View key={key} style={styles.row}>
                    <Text style={styles.key}>{formatKey(key)}</Text>
                    <Text style={styles.value} numberOfLines={4}>
                      {formatValue(value)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>
                  Auto-approval policy metadata not yet populated. Policies
                  will backfill in a Day 2 OTA.
                </Text>
              )}
            </ScrollView>

            {/* Actions */}
            <View style={styles.actions}>
              <Pressable
                onPress={handleOverride}
                disabled={overriding || !claimId}
                style={({ pressed }) => [
                  styles.overrideBtn,
                  (pressed || overriding) && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Override — send to manual review"
              >
                {overriding ? (
                  <ActivityIndicator size="small" color={colors.statusReject} />
                ) : (
                  <Ionicons
                    name="return-up-back-outline"
                    size={14}
                    color={colors.statusReject}
                  />
                )}
                <Text style={styles.overrideBtnText}>
                  {overriding ? 'Overriding…' : 'Override → manual review'}
                </Text>
              </Pressable>
              <Pressable
                onPress={onDismiss}
                style={({ pressed }) => [
                  styles.closeBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.closeBtnText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </ModalBackdrop>
    </Modal>
  );
}

// Order metadata keys with preferred keys first, then the rest alphabetized.
function orderedEntries(
  metadata: Record<string, unknown> | null
): Array<[string, unknown]> {
  if (!metadata) return [];
  const all = Object.entries(metadata).filter(
    ([, v]) => v !== null && v !== undefined && v !== ''
  );
  const preferred: Array<[string, unknown]> = [];
  const remaining: Array<[string, unknown]> = [];
  const preferredSet = new Set<string>(PREFERRED_KEYS);
  for (const [k, v] of all) {
    if (preferredSet.has(k)) preferred.push([k, v]);
    else remaining.push([k, v]);
  }
  preferred.sort((a, b) => {
    const ai = PREFERRED_KEYS.indexOf(a[0] as (typeof PREFERRED_KEYS)[number]);
    const bi = PREFERRED_KEYS.indexOf(b[0] as (typeof PREFERRED_KEYS)[number]);
    return ai - bi;
  });
  remaining.sort(([a], [b]) => a.localeCompare(b));
  return [...preferred, ...remaining];
}

// "policy_name" → "Policy Name"
function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Render scalar/object values as human-readable text.
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surfaceSheet,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.sheetBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate,
    alignSelf: 'center',
    marginBottom: spacing.md,
    opacity: 0.4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.tealDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 17,
    color: colors.alabaster,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  body: {
    maxHeight: 320,
  },
  bodyContent: {
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  loadingWrap: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  row: {
    gap: 2,
  },
  key: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.alabaster,
    lineHeight: 18,
  },
  emptyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    lineHeight: 18,
    paddingVertical: spacing.md,
  },
  errorText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.statusReject,
    paddingVertical: spacing.md,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  overrideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.35)',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  overrideBtnText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 13,
    color: colors.statusReject,
    letterSpacing: 0.2,
  },
  closeBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.silver,
  },
});
