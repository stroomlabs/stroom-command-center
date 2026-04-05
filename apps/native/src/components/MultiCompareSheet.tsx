import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useModalTransition } from '../hooks/useModalTransition';
import supabase from '../lib/supabase';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface MultiCompareSheetProps {
  visible: boolean;
  entityIds: string[];
  onDismiss: () => void;
  onOpenEntity: (id: string) => void;
}

interface EntitySummary {
  id: string;
  canonical_name: string | null;
  entity_type: string | null;
  domain: string | null;
  description: string | null;
  claim_count: number;
}

// Side-by-side comparison of N selected entities. Renders a horizontally
// scrollable row of column cards, one per entity. Loads basic entity data
// + claim count when opened.
export function MultiCompareSheet({
  visible,
  entityIds,
  onDismiss,
  onOpenEntity,
}: MultiCompareSheetProps) {
  const { cardStyle } = useModalTransition(visible);
  const [rows, setRows] = useState<EntitySummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || entityIds.length === 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data: ents } = await supabase
          .from('entities')
          .select('id, canonical_name, entity_type, domain, description')
          .in('id', entityIds);

        const countMap = new Map<string, number>();
        await Promise.all(
          entityIds.map(async (id) => {
            const { count } = await supabase
              .from('claims')
              .select('id', { count: 'exact', head: true })
              .eq('subject_entity_id', id);
            countMap.set(id, count ?? 0);
          })
        );

        if (cancelled) return;
        const mapped: EntitySummary[] = (ents ?? []).map((e: any) => ({
          id: e.id,
          canonical_name: e.canonical_name,
          entity_type: e.entity_type,
          domain: e.domain,
          description: e.description,
          claim_count: countMap.get(e.id) ?? 0,
        }));
        setRows(mapped);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, entityIds]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.sheetWrap, cardStyle]}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.header}>
              <Text style={styles.title}>Compare ({entityIds.length})</Text>
              <Pressable onPress={onDismiss} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.silver} />
              </Pressable>
            </View>
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.teal} />
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cols}
              >
                {rows.map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => onOpenEntity(r.id)}
                    style={({ pressed }) => [
                      styles.col,
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <Text style={styles.colName} numberOfLines={2}>
                      {r.canonical_name ?? 'Unnamed'}
                    </Text>
                    <Text style={styles.colType}>{r.entity_type ?? 'entity'}</Text>
                    {r.domain ? (
                      <Text style={styles.colMeta} numberOfLines={1}>
                        {r.domain}
                      </Text>
                    ) : null}
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Claims</Text>
                      <Text style={styles.statValue}>{r.claim_count}</Text>
                    </View>
                    {r.description ? (
                      <Text style={styles.colDesc} numberOfLines={6}>
                        {r.description}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 18,
    color: colors.alabaster,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  cols: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  col: {
    width: 220,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  colName: {
    fontFamily: fonts.archivo.bold,
    fontSize: 15,
    color: colors.alabaster,
  },
  colType: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    color: colors.teal,
    textTransform: 'lowercase',
  },
  colMeta: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 2,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  statLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  colDesc: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.silver,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
});
