import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useModalTransition } from '../hooks/useModalTransition';
import { useExploreSearch } from '../hooks/useExploreSearch';
import { useBrandToast } from './BrandToast';
import supabase from '../lib/supabase';
import type { EntitySearchResult } from '@stroom/supabase';
import { colors, fonts, spacing, radius } from '../constants/brand';
import { ModalBackdrop } from './ModalBackdrop';

interface ClaimReassignSheetProps {
  visible: boolean;
  claimId: string | null;
  currentSubjectId: string | null;
  currentSubjectName: string | null;
  onDismiss: () => void;
  onReassigned: (newEntityName: string) => void;
}

// Modal for reassigning a claim's subject entity. Reuses the debounced
// Explore search hook so results match what the operator sees in the main
// Explore tab. On select, shows a confirm step, then calls
// intel.reassign_or_supersede_claim(claim_id, new_subject_entity_id).
export function ClaimReassignSheet({
  visible,
  claimId,
  currentSubjectId,
  currentSubjectName,
  onDismiss,
  onReassigned,
}: ClaimReassignSheetProps) {
  const { cardStyle } = useModalTransition(visible);
  const { show: showToast } = useBrandToast();
  const [query, setQuery] = useState('');
  const { results, loading } = useExploreSearch(query);
  const [selected, setSelected] = useState<EntitySearchResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setSelected(null);
      setSaving(false);
    }
  }, [visible]);

  // Exclude the current subject from the candidate list so the operator
  // can't reassign to the row they're already on.
  const filtered = results.filter((r) => r.id !== currentSubjectId);

  const confirm = useCallback(async () => {
    if (!claimId || !selected) return;
    setSaving(true);
    try {
      const { error } = await supabase.schema('intel').rpc('reassign_or_supersede_claim', {
        claim_id: claimId,
        new_subject_entity_id: selected.id,
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const name =
        selected.canonical_name ?? selected.name ?? 'selected entity';
      showToast(`Claim reassigned to ${name}`, 'success');
      onReassigned(name);
      onDismiss();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast(e?.message ?? 'Reassign failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [claimId, selected, onReassigned, onDismiss, showToast]);

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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          <Animated.View style={[styles.sheetWrap, cardStyle]}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Reassign Claim</Text>
                  {currentSubjectName ? (
                    <Text style={styles.subtitle} numberOfLines={1}>
                      Currently linked to {currentSubjectName}
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={onDismiss} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.silver} />
                </Pressable>
              </View>

              <View style={styles.searchWrap}>
                <Ionicons name="search" size={16} color={colors.slate} />
                <TextInput
                  value={query}
                  onChangeText={(v) => {
                    setQuery(v);
                    setSelected(null);
                  }}
                  placeholder="Search for the correct entity…"
                  placeholderTextColor={colors.slate}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardAppearance="dark"
                  selectionColor={colors.teal}
                  autoFocus
                />
                {loading && query.length > 0 ? (
                  <ActivityIndicator size="small" color={colors.teal} />
                ) : null}
              </View>

              <ScrollView
                style={styles.results}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {query.length === 0 ? (
                  <Text style={styles.hint}>
                    Start typing to search the entity graph.
                  </Text>
                ) : filtered.length === 0 && !loading ? (
                  <Text style={styles.hint}>No matching entities.</Text>
                ) : (
                  filtered.map((r) => {
                    const active = selected?.id === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelected(r);
                        }}
                        style={({ pressed }) => [
                          styles.resultRow,
                          active && styles.resultRowActive,
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultName} numberOfLines={1}>
                            {r.canonical_name ?? r.name ?? 'Unnamed'}
                          </Text>
                          <Text style={styles.resultMeta} numberOfLines={1}>
                            {(r.entity_type ?? 'entity') +
                              (r.domain ? ` · ${r.domain}` : '')}
                          </Text>
                        </View>
                        {active && (
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color={colors.teal}
                          />
                        )}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>

              <View style={styles.footer}>
                <Pressable
                  onPress={onDismiss}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.cancelBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={confirm}
                  disabled={!selected || saving}
                  style={({ pressed }) => [
                    styles.confirmBtn,
                    (!selected || saving) && { opacity: 0.4 },
                    pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.obsidian} />
                  ) : (
                    <Ionicons name="swap-horizontal" size={14} color={colors.obsidian} />
                  )}
                  <Text style={styles.confirmText}>Reassign</Text>
                </Pressable>
              </View>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </ModalBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
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
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 18,
    color: colors.alabaster,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.archivo.regular,
    fontSize: 15,
    color: colors.alabaster,
    paddingVertical: 0,
  },
  results: {
    maxHeight: 360,
    marginTop: spacing.sm,
  },
  hint: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: 6,
  },
  resultRowActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealDim,
  },
  resultName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
  },
  resultMeta: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  cancelText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.silver,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.statusPending,
    shadowColor: colors.statusPending,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 3,
  },
  confirmText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    color: colors.obsidian,
    letterSpacing: 0.3,
  },
});
