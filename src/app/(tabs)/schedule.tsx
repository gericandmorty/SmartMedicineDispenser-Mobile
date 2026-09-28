import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useReminders } from '../../hooks/useReminders';
import ReminderCard from '../../components/ReminderCard';
import PrimaryButton from '../../components/PrimaryButton';
import DispenserView from '../../components/DispenserView';

export default function ScheduleScreen() {
  const { reminders, loading, refresh, remove } = useReminders();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Reminder',
      'Are you sure you want to delete this reminder?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => remove(id) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>My Schedule</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Dispenser compartment view ── */}
        <DispenserView reminders={reminders} />

        {/* ── Divider ── */}
        {reminders.length > 0 && (
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerLabel}>SCHEDULED TIMES</Text>
            <View style={styles.divider} />
          </View>
        )}

        {/* ── Reminder list ── */}
        {!loading && reminders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#BDBDBD" />
            <Text style={styles.emptyText}>No reminders yet.</Text>
            <Text style={styles.emptySubtext}>
              Tap a drawer above to preview compartments,{'\n'}then add a time below.
            </Text>
          </View>
        ) : (
          reminders.map((r) => (
            <ReminderCard key={r.id} reminder={r} onDelete={handleDelete} />
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="+ ADD ANOTHER TIME"
          onPress={() => router.push('/set-time')}
          color="#4CAF50"
          style={styles.addBtn}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#212121',
  },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 4,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#D7CFC4',
  },
  dividerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9E9E9E',
    letterSpacing: 1,
    marginHorizontal: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 20,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#424242',
    marginTop: 14,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9E9E9E',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 12,
    backgroundColor: '#F5F0E8',
  },
  addBtn: { width: '100%', borderRadius: 16 },
});
