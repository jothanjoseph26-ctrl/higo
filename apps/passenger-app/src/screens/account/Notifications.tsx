import React, { useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native';
import { theme } from '../../theme';
import { ScreenShell } from '../../components/ScreenShell';
import { useNotificationStore, NotificationItem } from '../../stores/notificationStore';

export function Notifications() {
  const { notifications, markRead, markAllRead } = useNotificationStore();

  useEffect(() => {
    // Mark all as read when opening notifications screen
    markAllRead();
  }, [markAllRead]);

  const renderItem = ({ item }: { item: NotificationItem }) => (
    <Pressable
      onPress={() => markRead(item.id)}
      style={[styles.item, !item.read && styles.unread]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.time}>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      <Text style={styles.body}>{item.body}</Text>
    </Pressable>
  );

  return (
    <ScreenShell title="Notifications" scroll={false}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>You have no notifications yet.</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 20,
  },
  item: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  unread: {
    borderColor: theme.colors.primaryGreen,
    backgroundColor: 'rgba(11, 110, 79, 0.02)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  time: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  body: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 120,
  },
  emptyText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
});
export default Notifications;
