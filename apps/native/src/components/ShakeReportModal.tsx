import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useBrandToast } from './BrandToast';
import { useModalTransition } from '../hooks/useModalTransition';
import { usePulseContext } from '../lib/PulseContext';
import { colors, fonts, spacing, radius } from '../constants/brand';
import { ModalBackdrop } from './ModalBackdrop';

// TestFlight debugging aid — a shake gesture (handled by ShakeReportProvider)
// opens this modal so testers can capture current context when something
// breaks. Shows the screen they were on, app version, device info, a live
// graph stats summary, and a notes field. A single "Copy Debug Info" button
// bundles everything into a clipboard-ready text block.
interface ShakeReportModalProps {
  visible: boolean;
  onDismiss: () => void;
  screenName: string;
}

export function ShakeReportModal({
  visible,
  onDismiss,
  screenName,
}: ShakeReportModalProps) {
  const { cardStyle } = useModalTransition(visible);
  const { data: pulse } = usePulseContext();
  const { show: showToast } = useBrandToast();
  const [notes, setNotes] = useState('');

  const appVersion =
    (Constants.expoConfig?.version as string | undefined) ?? '0.1.0';
  const platform = `${Platform.OS} ${Platform.Version}`;

  const handleCopy = async () => {
    const lines = [
      'STROOM COMMAND CENTER — DEBUG REPORT',
      `Captured: ${new Date().toLocaleString()}`,
      '',
      '── Context ──',
      `Screen: ${screenName}`,
      `App version: v${appVersion}`,
      `Platform: ${platform}`,
      '',
      '── Graph snapshot ──',
      `Claims:    ${(pulse?.totalClaims ?? 0).toLocaleString()}`,
      `Entities:  ${(pulse?.totalEntities ?? 0).toLocaleString()}`,
      `Sources:   ${(pulse?.totalSources ?? 0).toLocaleString()}`,
      `Queue:     ${pulse?.queueDepth ?? 0}`,
      `Correction rate: ${((pulse?.correctionRate ?? 0) * 100).toFixed(1)}%`,
      '',
      '── Tester notes ──',
      notes.trim() || '(none)',
    ];
    try {
      await Clipboard.setStringAsync(lines.join('\n'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Debug info copied to clipboard', 'success');
    } catch (e: any) {
      showToast(e?.message ?? 'Copy failed', 'error');
    }
  };

  const handleDismiss = () => {
    setNotes('');
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleDismiss}
    >
      <ModalBackdrop onPress={handleDismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <Animated.View style={cardStyle}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.handle} />

              <View style={styles.headerRow}>
                <Ionicons
                  name="bug-outline"
                  size={18}
                  color={colors.statusPending}
                />
                <Text style={styles.title}>Report an Issue</Text>
              </View>
              <Text style={styles.subtitle}>
                Captured via shake gesture — add a note and copy to clipboard.
              </Text>

              <ScrollView
                style={styles.bodyScroll}
                contentContainerStyle={styles.bodyScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <InfoRow label="Screen" value={screenName} />
                <InfoRow label="App version" value={`v${appVersion}`} />
                <InfoRow label="Platform" value={platform} />

                <View style={styles.divider} />

                <Text style={styles.sectionLabel}>GRAPH SNAPSHOT</Text>
                <View style={styles.snapshotRow}>
                  <SnapshotCell
                    label="Claims"
                    value={(pulse?.totalClaims ?? 0).toLocaleString()}
                  />
                  <SnapshotCell
                    label="Entities"
                    value={(pulse?.totalEntities ?? 0).toLocaleString()}
                  />
                  <SnapshotCell
                    label="Queue"
                    value={String(pulse?.queueDepth ?? 0)}
                  />
                </View>

                <Text style={styles.sectionLabel}>NOTES</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="What happened? What did you expect?"
                  placeholderTextColor={colors.slate}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  style={styles.notesInput}
                />
              </ScrollView>

              <View style={styles.actions}>
                <Pressable
                  onPress={handleDismiss}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.dismissBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss debug report"
                >
                  <Text style={styles.dismissText}>Dismiss</Text>
                </Pressable>
                <Pressable
                  onPress={handleCopy}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.copyBtn,
                    pressed && { opacity: 0.8 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Copy debug info to clipboard"
                >
                  <Ionicons
                    name="clipboard-outline"
                    size={16}
                    color={colors.obsidian}
                  />
                  <Text style={styles.copyText}>Copy Debug Info</Text>
                </Pressable>
              </View>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </ModalBackdrop>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function SnapshotCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.snapshotCell}>
      <Text style={styles.snapshotValue}>{value}</Text>
      <Text style={styles.snapshotLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    justifyContent: 'flex-end',
  },
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
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 20,
    color: colors.alabaster,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    marginBottom: spacing.lg,
  },
  bodyScroll: {
    maxHeight: 380,
  },
  bodyScrollContent: {
    paddingBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.silver,
  },
  infoValue: {
    fontFamily: fonts.mono.regular,
    fontSize: 12,
    color: colors.alabaster,
    maxWidth: '65%',
  },
  divider: {
    height: 1,
    backgroundColor: colors.glassBorder,
    marginVertical: spacing.md,
  },
  sectionLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  snapshotRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  snapshotCell: {
    flex: 1,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    alignItems: 'center',
    gap: 2,
  },
  snapshotValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 16,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  snapshotLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.9,
  },
  notesInput: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.alabaster,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 88,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  dismissBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  dismissText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.silver,
  },
  copyBtn: {
    backgroundColor: colors.teal,
  },
  copyText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.obsidian,
  },
});
