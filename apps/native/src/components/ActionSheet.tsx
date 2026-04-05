import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../constants/brand';

export interface ActionSheetAction {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'default' | 'accent' | 'destructive';
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: ActionSheetAction[];
  onDismiss: () => void;
  cancelLabel?: string;
}

export function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onDismiss,
  cancelLabel = 'Cancel',
}: ActionSheetProps) {
  const handleAction = (action: ActionSheetAction) => {
    // Close first, then run — avoids double-modal flicker if the handler opens another sheet
    onDismiss();
    // Defer so the dismissal animation starts cleanly
    setTimeout(() => action.onPress(), 0);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {/* Handle */}
          <View style={styles.handle} />

          {(title || subtitle) && (
            <View style={styles.header}>
              {title && <Text style={styles.title}>{title}</Text>}
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
          )}

          <View style={styles.actions}>
            {actions.map((action, i) => (
              <Pressable
                key={`${i}-${action.label}`}
                onPress={() => handleAction(action)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  i > 0 && styles.actionBtnDivider,
                  pressed && styles.actionPressed,
                ]}
              >
                {action.icon && (
                  <Ionicons
                    name={action.icon}
                    size={20}
                    color={toneColor(action.tone)}
                  />
                )}
                <Text style={[styles.actionLabel, { color: toneColor(action.tone) }]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && styles.actionPressed,
            ]}
          >
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function toneColor(tone: ActionSheetAction['tone']): string {
  switch (tone) {
    case 'accent':
      return colors.teal;
    case 'destructive':
      return colors.statusReject;
    default:
      return colors.silver;
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    marginBottom: spacing.md,
  },
  header: {
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.alabaster,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    marginTop: 2,
  },
  actions: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
  },
  actionBtnDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  actionPressed: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    opacity: 0.85,
  },
  actionLabel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
  },
  cancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.silver,
  },
});
