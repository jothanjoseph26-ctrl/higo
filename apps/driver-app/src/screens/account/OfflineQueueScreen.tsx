import React, { useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useQueueStore } from '../../stores/queueStore';
import { Button } from '../../components/Button';
import type { JobType, QueueJob } from '../../services/jobQueue';
import { theme } from '../../theme';

const JOB_LABELS: Record<JobType, string> = {
  location_batch: '📍 Location Update',
  trip_accept: '✅ Trip Accept',
  trip_decline: '❌ Trip Decline',
  arrived: '📌 Arrived at Pickup',
  trip_started: '🚗 Trip Started',
  trip_completed: '🏁 Trip Completed',
  rating: '⭐ Passenger Rating',
  training_progress: '📚 Training Progress',
  kyc_upload: '📄 KYC Upload',
};

const MAX_ATTEMPTS = 6;

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function JobStatusBadge({ job }: { job: QueueJob }) {
  if (job.attempts === 0) {
    return (
      <View style={[styles.badge, styles.badgePending]}>
        <Text style={styles.badgeTextPending}>Pending</Text>
      </View>
    );
  }
  if (job.attempts < MAX_ATTEMPTS) {
    return (
      <View style={[styles.badge, styles.badgeRetry]}>
        <Text style={styles.badgeTextRetry}>Retry {job.attempts}/{MAX_ATTEMPTS}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgeFailed]}>
      <Text style={styles.badgeTextFailed}>Failed</Text>
    </View>
  );
}

function JobCard({ job }: { job: QueueJob }) {
  const label = JOB_LABELS[job.type] || job.type;
  const payloadPreview = Object.keys(job.payload).length > 0
    ? JSON.stringify(job.payload).slice(0, 60) + (JSON.stringify(job.payload).length > 60 ? '…' : '')
    : 'No payload';

  return (
    <View style={styles.jobCard}>
      <View style={styles.jobHeader}>
        <Text style={styles.jobType}>{label}</Text>
        <JobStatusBadge job={job} />
      </View>
      <Text style={styles.jobMeta}>
        Queued {formatRelativeTime(job.createdAt)} · ID {job.id.slice(-8)}
      </Text>
      <Text style={styles.jobPayload} numberOfLines={2}>
        {payloadPreview}
      </Text>
    </View>
  );
}

export function OfflineQueueScreen() {
  const { jobs, isSyncing, lastSyncAt, hydrate, refresh, syncNow } = useQueueStore();

  useEffect(() => {
    void hydrate();
    const interval = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(interval);
  }, [hydrate, refresh]);

  const handleSync = useCallback(() => {
    void syncNow();
  }, [syncNow]);

  const pendingCount = jobs.filter((j) => j.attempts < MAX_ATTEMPTS).length;
  const retryCount = jobs.filter((j) => j.attempts > 0 && j.attempts < MAX_ATTEMPTS).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isSyncing}
          onRefresh={() => void syncNow()}
          tintColor={theme.colors.primaryGreen}
        />
      }
    >
      <Text style={styles.title}>Offline Sync Queue</Text>
      <Text style={styles.subtitle}>
        Actions saved while offline or on poor network. They sync automatically when connection returns.
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, retryCount > 0 && styles.statValueWarn]}>
            {retryCount}
          </Text>
          <Text style={styles.statLabel}>Retrying</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{isSyncing ? '…' : '✓'}</Text>
          <Text style={styles.statLabel}>{isSyncing ? 'Syncing' : 'Idle'}</Text>
        </View>
      </View>

      <Button
        label={isSyncing ? 'Syncing…' : 'Sync Now'}
        onPress={handleSync}
        loading={isSyncing}
        style={styles.syncBtn}
      />

      {lastSyncAt && (
        <Text style={styles.lastSync}>
          Last sync attempt: {new Date(lastSyncAt).toLocaleTimeString('en-NG')}
        </Text>
      )}

      {jobs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyTitle}>All synced!</Text>
          <Text style={styles.emptyText}>
            No pending offline actions. Location updates and trip events are sent in real-time.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          <Text style={styles.listTitle}>Queued Jobs ({jobs.length})</Text>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </View>
      )}

      <Pressable onPress={() => void refresh()} style={styles.refreshLink}>
        <Text style={styles.refreshLinkText}>↻ Refresh queue</Text>
      </Pressable>
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
    paddingBottom: theme.spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginTop: 4,
    marginBottom: theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadow.sm,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  statValueWarn: {
    color: theme.colors.accentOrange,
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  syncBtn: {
    marginBottom: theme.spacing.sm,
  },
  lastSync: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadow.sm,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: theme.spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    gap: theme.spacing.sm,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow.sm,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  jobType: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
  },
  badgeTextPending: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  badgeRetry: {
    backgroundColor: '#FEE2E2',
  },
  badgeTextRetry: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.error,
  },
  badgeFailed: {
    backgroundColor: '#F3F4F6',
  },
  badgeTextFailed: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  jobMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  jobPayload: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  refreshLink: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
    padding: theme.spacing.sm,
  },
  refreshLinkText: {
    fontSize: 14,
    color: theme.colors.primaryGreen,
    fontWeight: '600',
  },
});