import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { api } from '../../services/api';
import { theme } from '../../theme';

interface DeadLetterJob {
  id: string;
  type: string;
  payload: Record<string, any>;
  attempts: number;
  createdAt: string;
}

export function Support() {
  const [deadLetters, setDeadLetters] = useState<DeadLetterJob[]>([]);
  const [disputeMsg, setDisputeMsg] = useState('');
  const [tripId, setTripId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadDeadLetters();
  }, []);

  const loadDeadLetters = async () => {
    try {
      const raw = await AsyncStorage.getItem('dead_letters');
      if (raw) {
        setDeadLetters(JSON.parse(raw) as DeadLetterJob[]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearDeadLetters = async () => {
    try {
      await AsyncStorage.removeItem('dead_letters');
      setDeadLetters([]);
      Alert.alert('Cleared', 'Dead letter logs cleared.');
    } catch {}
  };

  const handleSubmitDispute = async () => {
    if (!disputeMsg) {
      Alert.alert('Required', 'Please enter a description of the issue.');
      return;
    }
    setSubmitting(true);
    try {
      // Use generic request to create dispute
      await api.request({
        method: 'POST',
        url: '/disputes',
        data: {
          tripId: tripId || undefined,
          description: disputeMsg,
          raisedBy: 'driver',
        },
      });
      Alert.alert('Submitted', 'Your dispute has been logged. Support will contact you shortly.');
      setDisputeMsg('');
      setTripId('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit dispute. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Support & Disputes</Text>

      {/* Submit Dispute Form */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>File a Dispute / Report Issue</Text>
        <Input
          label="Trip ID (Optional)"
          placeholder="e.g. uuid-of-trip"
          value={tripId}
          onChangeText={setTripId}
        />
        <Input
          label="What went wrong?"
          placeholder="Describe your issue here..."
          value={disputeMsg}
          onChangeText={setDisputeMsg}
          multiline
          numberOfLines={4}
        />
        <Button label="Submit Ticket" onPress={handleSubmitDispute} loading={submitting} />
      </View>

      {/* Dead Letter Queue Section */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Failed Sync Logs (Dead Letters)</Text>
          {deadLetters.length > 0 && (
            <Text style={styles.clearLink} onPress={handleClearDeadLetters}>
              Clear
            </Text>
          )}
        </View>

        {deadLetters.length === 0 ? (
          <Text style={styles.emptyText}>All systems operational. No failed events recorded.</Text>
        ) : (
          deadLetters.map((job) => (
            <View key={job.id} style={styles.jobRow}>
              <View style={styles.jobHeader}>
                <Text style={styles.jobType}>{job.type.toUpperCase()}</Text>
                <Text style={styles.jobDate}>{new Date(job.createdAt).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.jobPayload}>Payload: {JSON.stringify(job.payload)}</Text>
              <Text style={styles.jobAttempts}>Failed after {job.attempts} retries.</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGrey,
  },
  content: {
    padding: theme.spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  clearLink: {
    fontSize: 13,
    color: theme.colors.error,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  jobRow: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.error,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  jobType: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  jobDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  jobPayload: {
    fontSize: 12,
    color: '#4B5563',
    marginVertical: 4,
  },
  jobAttempts: {
    fontSize: 11,
    color: theme.colors.error,
    fontWeight: '600',
  },
});
