import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { TripMessage } from '@higo/shared-types';
import { ScreenShell } from '../../components/ScreenShell';
import { theme } from '../../theme';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

type ChatRow = TripMessage & { isMine: boolean };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatSupport() {
  const userId = useAuthStore((state) => state.user?.id);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const mapMessages = useCallback(
    (items: TripMessage[]): ChatRow[] =>
      items.map((message) => ({
        ...message,
        isMine: message.senderType === 'passenger' && message.senderId === userId,
      })),
    [userId],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await api.getSupportMessages();
        if (!cancelled) {
          setMessages(mapMessages(result.messages));
        }
      } catch (error) {
        if (!cancelled) {
          Alert.alert('Support', 'Could not load support messages. Please try again.');
          console.error('Failed to load support messages', error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapMessages]);

  const pollForAiReply = useCallback(
    async (sentAt: string) => {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const result = await api.getSupportMessages();
          const hasNewReply = result.messages.some(
            (message) =>
              message.senderType === 'admin' &&
              new Date(message.createdAt).getTime() > new Date(sentAt).getTime(),
          );
          if (hasNewReply) {
            setMessages(mapMessages(result.messages));
            return;
          }
        } catch {
          // Keep polling until deadline
        }
      }
    },
    [mapMessages],
  );

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;

    setSending(true);
    setInput('');

    try {
      const result = await api.sendSupportMessage({ body });
      setMessages((prev) => [
        ...prev,
        {
          ...result.message,
          isMine: true,
        },
      ]);
      void pollForAiReply(result.message.createdAt);
    } catch (error) {
      setInput(body);
      Alert.alert('Support', 'Failed to send message. Please try again.');
      console.error('Failed to send support message', error);
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: ChatRow }) => {
    const isUser = item.isMine;
    return (
      <View style={[styles.bubbleWrap, isUser ? styles.userWrap : styles.supportWrap]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.supportBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.supportText]}>
            {item.body}
          </Text>
          <Text style={[styles.timeText, isUser ? styles.userTime : styles.supportTime]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScreenShell title="Chat Support" scroll={false}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.chatList}
          contentContainerStyle={styles.chatContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Welcome to HiGo Support. Send a message and our team will respond shortly.
            </Text>
          }
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          placeholder="Type your message..."
          placeholderTextColor="#9CA3AF"
          value={input}
          onChangeText={setInput}
          style={styles.textInput}
          editable={!sending}
        />
        <Pressable onPress={() => void handleSend()} style={styles.sendBtn} disabled={sending}>
          <Text style={styles.sendIcon}>{sending ? '…' : '➔'}</Text>
        </Pressable>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: theme.spacing.lg,
  },
  chatList: {
    flex: 1,
    marginBottom: theme.spacing.md,
  },
  chatContent: {
    paddingBottom: 10,
  },
  bubbleWrap: {
    flexDirection: 'row',
    marginVertical: 6,
    width: '100%',
  },
  userWrap: {
    justifyContent: 'flex-end',
  },
  supportWrap: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  userBubble: {
    backgroundColor: theme.colors.primaryGreen,
    borderBottomRightRadius: 2,
  },
  supportBubble: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 2,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: '#fff',
  },
  supportText: {
    color: theme.colors.dark,
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  userTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  supportTime: {
    color: '#9CA3AF',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 20,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: theme.radius.button,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#fff',
    color: theme.colors.dark,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
});

export default ChatSupport;