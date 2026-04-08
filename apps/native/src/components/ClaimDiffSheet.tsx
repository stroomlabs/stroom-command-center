import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useModalTransition } from '../hooks/useModalTransition';
import { ClaimDiff } from './ClaimDiff';
import supabase from '../lib/supabase';
import { colors, fonts, spacing, radius } from '../constants/brand';
import { ModalBackdrop } from './ModalBackdrop';

interface ClaimDiffSheetProps {
  visible: boolean;
  baseClaimId: string | null;
  baseValueJsonb: Record<string, unknown> | null;
  targetClaimId: string | null;
  onDismiss: () => void;
}

// Glassmorphic modal that shows a value_jsonb diff between two claims.
// Used from the Corrections list on claim detail — the base is the claim
// the operator is viewing, the target is the superseding claim row they
// tapped "Show Diff" on. Fetches the target's value_jsonb on open.
export function ClaimDiffSheet({
  visible,
  baseClaimId,
  baseValueJsonb,
  targetClaimId,
  onDismiss,
}: ClaimDiffSheetProps) {
  const { cardStyle } = useModalTransition(visible);
  const [loading, setLoading] = useState(false);
  const [targetJsonb, setTargetJsonb] = useState<Record<string, unknown> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !targetClaimId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .schema('intel')
          .from('claims')
          .select('value_jsonb')
          .eq('id', targetClaimId)
          .maybeSingle();
        if (err) throw err;
        if (!cancelled) {
          setTargetJsonb(((data as any)?.value_jsonb ?? null) as any);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load diff');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, targetClaimId]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <ModalBackdrop onPress={onDismiss}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.sheetWrap, cardStyle]}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Claim diff</Text>
                <Text style={styles.subtitle}>
                  this claim → superseding version
                </Text>
              </View>
              <Pressable onPress={onDismiss} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.silver} />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.teal} />
              </View>
            ) : error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={{ gap: spacing.sm }}
                showsVerticalScrollIndicator={false}
              >
                <ClaimDiff
                  prev={baseValueJsonb}
                  next={targetJsonb}
                  prevLabel="this claim"
                  nextLabel="superseding"
                />
              </ScrollView>
            )}
          </Pressable>
        </Animated.View>
      </ModalBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.surfaceSheet,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 18,
    color: colors.alabaster,
  },
  subtitle: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 13,
    color: colors.statusReject,
  },
  scroll: {
    maxHeight: 520,
  },
});
