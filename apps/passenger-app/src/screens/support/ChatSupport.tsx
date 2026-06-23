import React, { useState } from 'react';
import { StyleSheet, Text, View, FlatList, TextInput, Pressable } from 'react-native';
import { theme } from '../../theme';
import { ScreenShell } from '../../components/ScreenShell';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'support';
  time: string;
}

export function ChatSupport() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: 'Hello, welcome to HiGo Support! How can we assist you today?', sender: 'support', time: '12:00' },
  ]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim() === '') return;

    const newMessage: Message = {
      id: Math.random().toString(),
      text: input,
      sender: 'user',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInput('');

    // Simulate reply after 1.5s
    setTimeout(() => {
      const replyMessage: Message = {
        id: Math.random().toString(),
        text: 'Thank you for your message. An agent will review this shortly. If urgent, please call our SOS line.',
        sender: 'support',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, replyMessage]);
    }, 1500);
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.bubbleWrap, isUser ? styles.userWrap : styles.supportWrap]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.supportBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.supportText]}>
            {item.text}
          </Text>
          <Text style={[styles.timeText, isUser ? styles.userTime : styles.supportTime]}>
            {item.time}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScreenShell title="Chat Support" scroll={false}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={styles.chatList}
        contentContainerStyle={styles.chatContent}
      />

      <View style={styles.inputRow}>
        <TextInput
          placeholder="Type your message..."
          placeholderTextColor="#9CA3AF"
          value={input}
          onChangeText={setInput}
          style={styles.textInput}
        />
        <Pressable onPress={handleSend} style={styles.sendBtn}>
          <Text style={styles.sendIcon}>➔</Text>
        </Pressable>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
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
