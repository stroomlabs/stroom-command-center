import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { QueueClaim } from '@stroom/supabase';
import { StatusBadge } from './StatusBadge';
import { useModalTransition } from '../hooks/useModalTransition';
import { resolveClaimDisplayValue } from '../lib/resolveDisplayValue';
import { colors, fonts, spacing, radius } from '../constants/brand';
import { ModalBackdrop } from './ModalBackdrop';

// Glassmorphic bottom-sheet preview fired by a double-tap on a Queue card.
// Mirrors the visual language of RejectSheet (backdrop dim, rounded top,
// drag handle) so it feels like part of the same modal family. Approve /
// Reject buttons here are live — tapping them calls the same handlers the
// card would have run, so the operator can act without leaving the queue.
interface ClaimPreviewSheetProps {
  claim: QueueClaim | null;
  visible: boolean;
  onDismiss: () => void;
  onApprove: () => void;
  onReject: () => void;
}

export function ClaimPreviewSheet({
  claim,
  visible,
  onDismiss,
  onApprove,
  onReject,
}: ClaimPreviewSheetProps) {
  const { cardStyle } = useModalTransition(visible);

  if (!claim) return null;

  const subjectName = claim.subject_entity?.canonical_name ?? 'Unknown entity';
  const objectName = claim.object_entity?.canonical_name ?? null;
  const predicate = claim.predicate ?? 'unknown';
  const predicateLabel = formatPredicate(predicate);
  const fullValue = resolveClaimDisplayValue(claim.value_jsonb, objectName, claim.predicate);
  const confidence = Number(claim.confidence_score ?? 0);
  const sourceName = claim.source?.source_name ?? 'Unknown source';
  const trust = Number(claim.source?.trust_score ?? 0);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
    >
      <ModalBackdrop onPress={onDismiss}>
        <Animated.View style={cardStyle}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {/* Drag handle — swipe-down dismissal is handled by the backdrop
                press; the handle is purely a visual affordance. */}
            <View style={styles.handle} />

            <View style={styles.headerRow}>
              <StatusBadge status={claim.status} />
              <Text style={styles.predicate}>{predicateLabel}</Text>
            </View>

            <Text style={styles.entity} numberOfLines={2}>
              {subjectName}
            </Text>

            <ScrollView
              style={styles.valueScroll}
              contentContainerStyle={styles.valueScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sectionLabel}>VALUE</Text>
              <Text style={styles.valueText}>{fullValue}</Text>

              <View style={styles.divider} />

              <View style={styles.metaRow}>
                <View style={styles.metaCell}>
                  <Text style={styles.sectionLabel}>CONFIDENCE</Text>
                  <Text
                    style={[
                      styles.metaValue,
                      { color: confidenceColor(confidence) },
                    ]}
                  >
                    {confidence.toFixed(1)}
                    <Text style={styles.metaUnit}> / 10</Text>
                  </Text>
                </View>
                <View style={styles.metaCell}>
                  <Text style={styles.sectionLabel}>TRUST</Text>
                  <Text
                    style={[styles.metaValue, { color: confidenceColor(trust) }]}
                  >
                    {trust.toFixed(1)}
                    <Text style={styles.metaUnit}> / 10</Text>
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>SOURCE</Text>
              <Text style={styles.sourceName} numberOfLines={2}>
                {sourceName}
              </Text>
            </ScrollView>

            <View style={styles.actions}>
              <Pressable
                onPress={() => {
                  onReject();
                  onDismiss();
                }}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.rejectBtn,
                  pressed && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Reject claim"
              >
                <Ionicons name="close" size={18} color={colors.statusReject} />
                <Text
                  style={[styles.actionText, { color: colors.statusReject }]}
                >
                  Reject
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onApprove();
                  onDismiss();
                }}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.approveBtn,
                  pressed && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Approve claim"
              >
                <Ionicons
                  name="checkmark"
                  size={18}
                  color={colors.statusApprove}
                />
                <Text
                  style={[styles.actionText, { color: colors.statusApprove }]}
                >
                  Approve
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </ModalBackdrop>
    </Modal>
  );
}

function formatPredicate(pred: string): string {
  const last = pred.includes('.') ? pred.split('.').pop()! : pred;
  return last.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function confidenceColor(score: number): string {
  if (score >= 8) return colors.statusApprove;
  if (score >= 6) return colors.teal;
  if (score >= 4) return colors.statusPending;
  return colors.statusReject;
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surfaceSheet,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.sheetBorder,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  predicate: {
    fontFamily: fonts.mono.medium,
    fontSize: 11,
    color: colors.teal,
  },
  entity: {
    fontFamily: fonts.archivo.bold,
    fontSize: 22,
    color: colors.alabaster,
    marginBottom: spacing.md,
    letterSpacing: -0.3,
  },
  valueScroll: {
    maxHeight: 280,
  },
  valueScrollContent: {
    paddingBottom: spacing.md,
  },
  sectionLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  valueText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.alabaster,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: colors.glassBorder,
    marginTop: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metaCell: {
    flex: 1,
  },
  metaValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  metaUnit: {
    fontFamily: fonts.mono.regular,
    fontSize: 12,
    color: colors.slate,
  },
  sourceName: {
    fontFamily: fonts.archivo.medium,
    fontSize: 13,
    color: colors.silver,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
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
  rejectBtn: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  approveBtn: {
    borderColor: 'rgba(34, 197, 94, 0.35)',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  actionText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
