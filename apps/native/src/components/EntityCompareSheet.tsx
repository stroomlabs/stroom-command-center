import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { fetchEntityById, fetchClaimsForEntity } from '@stroom/supabase';
import type { Entity } from '@stroom/types';
import supabase from '../lib/supabase';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface EntityCompareSheetProps {
  visible: boolean;
  current: Entity | null;
  otherId: string | null;
  onDismiss: () => void;
  onOpenOther: (id: string) => void;
}

interface Snapshot {
  entity: Entity | null;
  claimCount: number;
}

// Side-by-side comparison of the current entity and a candidate duplicate.
// Shows name, type, domain, and claim count for each so the operator can
// quickly decide whether to merge or dismiss.
export function EntityCompareSheet({
  visible,
  current,
  otherId,
  onDismiss,
  onOpenOther,
}: EntityCompareSheetProps) {
  const [otherSnap, setOtherSnap] = useState<Snapshot | null>(null);
  const [currentSnap, setCurrentSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !otherId || !current) {
      setOtherSnap(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [otherEntity, otherClaims, currentClaims] = await Promise.all([
          fetchEntityById(supabase, otherId),
          fetchClaimsForEntity(supabase, otherId, 500, 0),
          fetchClaimsForEntity(supabase, current.id, 500, 0),
        ]);
        if (cancelled) return;
        setOtherSnap({ entity: otherEntity, claimCount: otherClaims.length });
        setCurrentSnap({ entity: current, claimCount: currentClaims.length });
      } catch {
        if (!cancelled) {
          setOtherSnap({ entity: null, claimCount: 0 });
          setCurrentSnap({ entity: current, claimCount: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, otherId, current]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Compare Entities</Text>
            <Pressable onPress={onDismiss} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.silver} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.teal} style={{ marginVertical: spacing.xl }} />
          ) : (
            <View style={styles.columns}>
              <ComparePanel
                snap={currentSnap}
                label="CURRENT"
                onOpen={null}
              />
              <View style={styles.vsColumn}>
                <Text style={styles.vsText}>vs</Text>
              </View>
              <ComparePanel
                snap={otherSnap}
                label="CANDIDATE"
                onOpen={
                  otherSnap?.entity
                    ? () => {
                        onDismiss();
                        setTimeout(() => onOpenOther(otherSnap.entity!.id), 0);
                      }
                    : null
                }
              />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ComparePanel({
  snap,
  label,
  onOpen,
}: {
  snap: Snapshot | null;
  label: string;
  onOpen: (() => void) | null;
}) {
  const e = snap?.entity;
  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>{label}</Text>
      <Text style={styles.panelName} numberOfLines={2}>
        {e?.canonical_name ?? e?.name ?? '—'}
      </Text>
      <View style={styles.metaRow}>
        {e?.entity_type && (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{e.entity_type}</Text>
          </View>
        )}
      </View>
      {e?.domain && (
        <Text style={styles.panelDomain} numberOfLines={1}>
          {e.domain}
        </Text>
      )}
      <View style={styles.statRow}>
        <Text style={styles.statValue}>{snap?.claimCount ?? 0}</Text>
        <Text style={styles.statLabel}>claims</Text>
      </View>
      {onOpen && (
        <Pressable
          onPress={onOpen}
          style={({ pressed }) => [styles.openBtn, pressed && { opacity: 0.75 }]}
        >
          <Text style={styles.openBtnText}>Open</Text>
          <Ionicons name="chevron-forward" size={12} color={colors.teal} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    padding: spacing.lg,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 18,
    color: colors.alabaster,
    letterSpacing: -0.3,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.xs,
  },
  vsColumn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  vsText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  panel: {
    flex: 1,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  panelLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.8,
  },
  panelName: {
    fontFamily: fonts.archivo.bold,
    fontSize: 15,
    color: colors.alabaster,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chip: {
    backgroundColor: colors.tealDim,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipText: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    color: colors.teal,
    textTransform: 'uppercase',
  },
  panelDomain: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 4,
  },
  statValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 18,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
  },
  openBtn: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  openBtnText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.teal,
  },
});
