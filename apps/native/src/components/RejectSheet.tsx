import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { REJECTION_REASONS, type RejectionReason } from '@stroom/types';
import { useModalTransition } from '../hooks/useModalTransition';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface RejectSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onReject: (reason: RejectionReason, notes?: string) => void;
}

export function RejectSheet({ visible, onDismiss, onReject }: RejectSheetProps) {
  const [selected, setSelected] = useState<RejectionReason | null>(null);
  const [notes, setNotes] = useState('');
  const { cardStyle } = useModalTransition(visible);

  const handleSubmit = () => {
    if (!selected) return;
    onReject(selected, notes.trim() || undefined);
    setSelected(null);
    setNotes('');
  };

  const handleDismiss = () => {
    setSelected(null);
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
      <Pressable style={styles.backdrop} onPress={handleDismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <Animated.View style={cardStyle}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {/* Handle */}
            <View style={styles.handle} />

            <Text style={styles.title}>Rejection Reason</Text>

            {/* Reason pills */}
            <View style={styles.reasons}>
              {REJECTION_REASONS.map((reason) => (
                <Pressable
                  key={reason}
                  onPress={() => setSelected(reason)}
                  style={[
                    styles.pill,
                    selected === reason && styles.pillSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      selected === reason && styles.pillTextSelected,
                    ]}
                  >
                    {reason}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Notes */}
            <TextInput
              style={styles.notesInput}
              placeholder="Additional notes (optional)"
              placeholderTextColor={colors.slate}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={!selected}
              style={({ pressed }) => [
                styles.submitBtn,
                !selected && styles.submitDisabled,
                pressed && styles.submitPressed,
              ]}
            >
              <Ionicons name="close-circle" size={18} color={colors.alabaster} />
              <Text style={styles.submitText}>Reject Claim</Text>
            </Pressable>
          </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
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
  keyboardView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
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
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 20,
    color: colors.alabaster,
    marginBottom: spacing.lg,
  },
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  pillSelected: {
    borderColor: colors.statusReject,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  pillText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 13,
    color: colors.silver,
  },
  pillTextSelected: {
    color: colors.statusReject,
  },
  notesInput: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.alabaster,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 80,
    marginBottom: spacing.lg,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.statusReject,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  submitDisabled: {
    opacity: 0.3,
  },
  submitPressed: {
    opacity: 0.8,
  },
  submitText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.alabaster,
  },
});
