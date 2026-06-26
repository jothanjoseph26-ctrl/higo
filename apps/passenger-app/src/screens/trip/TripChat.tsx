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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TripMessage } from '@higo/shared-types';
import { SOCKET_EVENTS, TripMessageNewPayload } from '@higo/shared-types';
import { ScreenShell } from '../../components/ScreenShell';
import { theme } from '../../theme';
import { api } from '../../services/api';
import { getSocket } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TripChat'>;

type ChatRow = TripMessage & { isMine: boolean };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TripChat({ route }: Props) {
  const { tripId } = route.params;
  const userId = useAuthStore((state) => state.user?.id);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const mapMessages = useCallback(
    (items: TripMessage[]): ChatRow[] =>
      items.map((message) => ({
        ...message,
        isMine: message.senderId === userId,
      })),
    [userId],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await api.getTripMessages(tripId);
        if (!cancelled) {
          setMessages(mapMessages(result.messages));
        }
      } catch (error) {
        if (!cancelled) {
          Alert.alert('Chat', 'Could not load trip messages. Please try again.');
          console.error('Failed to load trip messages', error);
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
  }, [tripId, mapMessages]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onMessageNew = (payload: TripMessageNewPayload) => {
      if (payload.tripId !== tripId) return;
      setMessages((prev) => {
        if (prev.some((item) => item.id === payload.message.id)) {
          return prev;
        }
        return [
          ...prev,
          {
            ...payload.message,
            isMine: payload.message.senderId === userId,
          },
        ];
      });
    };

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, onMessageNew);
    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, onMessageNew);
    };
  }, [tripId, userId]);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;

    setSending(true);
    setInput('');

    try {
      const result = await api.sendTripMessage(tripId, { body });
      setMessages((prev) => {
        if (prev.some((item) => item.id === result.message.id)) {
          return prev;
        }
        return [
          ...prev,
          {
            ...result.message,
            isMine: true,
          },
        ];
      });
    } catch (error) {
      setInput(body);
      Alert.alert('Chat', 'Failed to send message. Please try again.');
      console.error('Failed to send trip message', error);
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: ChatRow }) => (
    <View style={[styles.bubbleWrap, item.isMine ? styles.userWrap : styles.otherWrap]}>
      <View style={[styles.bubble, item.isMine ? styles.userBubble : styles.otherBubble]}>
        <Text style={[styles.messageText, item.isMine ? styles.userText : styles.otherText]}>
          {item.body}
        </Text>
        <Text style={[styles.timeText, item.isMine ? styles.userTime : styles.otherTime]}>
          {formatTime(item.createdAt)}
        </Text>
      </View>
    </View>
  );

  return (
    <ScreenShell title="Trip Chat" scroll={false}>
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
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          placeholder="Message your driver..."
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
  otherWrap: {
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
  otherBubble: {
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
  otherText: {
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
  otherTime: {
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

export default TripChat;