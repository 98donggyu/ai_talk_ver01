import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  PermissionsAndroid,
  Platform,
  LogBox,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AudioRecord from 'react-native-audio-record';
import Tts from 'react-native-tts';
import RNFS from 'react-native-fs';

LogBox.ignoreLogs([
  'new NativeEventEmitter',
  'EventEmitter.removeListener',
]);

interface Message {
  id: number;
  type: 'user' | 'ai';
  content: string;
  timestamp: string;
}

const SpeakScreen = ({ navigation }: { navigation: { goBack: () => void } }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const userClosedConnection = useRef(false);

  useEffect(() => {
    const setupUserAndInitialize = async () => {
      try {
        let id = await AsyncStorage.getItem('user_id');
        if (!id) {
          id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          await AsyncStorage.setItem('user_id', id);
        }
        setUserId(id);
      } catch (e) {
        Alert.alert('오류', '사용자 정보를 저장하거나 불러오는 데 실패했습니다.');
      }
    };
    setupUserAndInitialize();

    return () => {
      cleanupAudio();
      if (websocketRef.current) {
        userClosedConnection.current = true;
        websocketRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (userId) {
      initializeApp();
    }
  }, [userId]);

  const initializeApp = async () => {
    try {
      await requestPermissions();
      await setupTTS();
      userClosedConnection.current = false;
      connectWebSocket();
    } catch (error) {
      Alert.alert("초기화 오류", "앱을 시작하는 데 문제가 발생했습니다.");
    }
  };

  const setupTTS = async () => {
    Tts.removeAllListeners('tts-start');
    Tts.removeAllListeners('tts-finish');
    Tts.removeAllListeners('tts-cancel');
    Tts.addEventListener('tts-start', () => setIsSpeaking(true));
    Tts.addEventListener('tts-finish', () => {
      setIsSpeaking(false);
      setTimeout(() => {
        if (!isRecording && !isProcessing) {
          startRecording();
        }
      }, 1000);
    });
    Tts.addEventListener('tts-cancel', () => setIsSpeaking(false));
    await Tts.setDefaultLanguage('ko-KR');
    await Tts.setDefaultRate(0.5);
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: '음성 인식 권한',
              message: '음성 대화를 위해 마이크 권한이 필요합니다.',
              buttonPositive: '확인',
              buttonNegative: '취소',
            },
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert('권한 필요', '음성 인식을 위해 마이크 권한이 필요합니다.');
            throw new Error('Permission denied');
          }
        } catch (err) {
          console.error('권한 요청 오류:', err);
          throw err;
        }
      }
  };

  const connectWebSocket = () => {
    if (!userId) return;

    // ❗️❗️ <서버 IP 주소> 부분은 실제 PC IP로 변경해주세요 ❗️❗️
    const wsUrl = `ws://192.168.101.67:8888/ws/chat?user_id=${userId}`;
    console.log(`🔗 WebSocket 연결 시도: ${wsUrl}`);
    websocketRef.current = new WebSocket(wsUrl);

    websocketRef.current.onopen = () => {
      setIsConnected(true);
      console.log('✅ WebSocket 연결 성공');
      retryCountRef.current = 0;
    };

    websocketRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ai_message') {
            handleAIMessage(data.content);
            setIsProcessing(false);
          } else if (data.type === 'user_message') {
            handleUserMessage(data.content);
          } else if (data.type === 'error') {
            Alert.alert('처리 오류', data.content);
            setIsProcessing(false);
          }
        } catch (error) {
          console.error('❌ 메시지 파싱 오류:', error);
          setIsProcessing(false);
        }
    };

    websocketRef.current.onclose = (event) => {
      setIsConnected(false);
      console.log('❌ WebSocket 연결 종료. Code:', event.code, 'Reason:', event.reason);
      
      if (userClosedConnection.current) {
        console.log('사용자가 연결을 종료하여 재연결하지 않습니다.');
        return;
      }
      
      if (retryCountRef.current < 5) {
        retryCountRef.current += 1;
        console.log(`🔄 WebSocket 재연결 시도 (${retryCountRef.current}/5)`);
        setTimeout(connectWebSocket, 3000);
      } else {
        console.log('최대 재연결 횟수를 초과했습니다.');
        Alert.alert('연결 실패', '서버에 연결할 수 없습니다. 잠시 후 앱을 다시 시작해 주세요.');
      }
    };

    websocketRef.current.onerror = (error) => {
      console.error('❌ WebSocket 오류:', error.message);
      setIsConnected(false);
    };
  };

  const startRecording = async () => {
    if (isSpeaking || isProcessing) return;
    try {
      const options = { sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 6, wavFile: 'voice_recording.wav' };
      AudioRecord.init(options);
      AudioRecord.start();
      setIsRecording(true);
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = setTimeout(() => {
        if (isRecording) {
          stopRecording();
          Alert.alert('대화 종료', '음성이 감지되지 않아 대화를 종료합니다.');
        }
      }, 10000);
    } catch (error) {
      Alert.alert('녹음 오류', '음성 녹음을 시작할 수 없습니다.');
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    try {
      setIsRecording(false);
      setIsProcessing(true);
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      const audioFile = await AudioRecord.stop();
      const audioBase64 = await RNFS.readFile(audioFile, 'base64');
      if (websocketRef.current && isConnected) {
        websocketRef.current.send(JSON.stringify({ type: 'audio_data', audio: audioBase64 }));
      }
    } catch (error) {
      setIsProcessing(false);
      Alert.alert('녹음 오류', '음성 처리 중 오류가 발생했습니다.');
    }
  };

  const handleUserMessage = (message: string) => {
    setMessages(prev => [...prev, { id: Date.now(), type: 'user', content: message, timestamp: new Date().toLocaleTimeString() }]);
  };

  const handleAIMessage = (message: string) => {
    setMessages(prev => [...prev, { id: Date.now(), type: 'ai', content: message, timestamp: new Date().toLocaleTimeString() }]);
    speakMessage(message);
  };

  const speakMessage = async (message: string) => {
    try {
      await Tts.speak(message);
    } catch (error) {
      setIsSpeaking(false);
    }
  };

  const cleanupAudio = () => {
    try {
      AudioRecord.stop();
      Tts.stop();
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    } catch (error) {
      console.error('❌ Audio cleanup 오류:', error);
    }
  };

  // ✅ '대화 종료' 기능 수정: Alert 없이 바로 실행
  const handleEndConversation = () => {
    console.log('--- 대화 세션 종료 ---');
    cleanupAudio(); 
    userClosedConnection.current = true;
    websocketRef.current?.close(); 
    navigation.goBack(); 
  };
  
  const getStatusText = () => {
    if (isSpeaking) return '🔊 AI 말하는 중...';
    if (isProcessing) return '⚙️ 음성 처리 중...';
    if (isRecording) return '🎤 녹음 중...';
    if (!isConnected) return '🔌 연결 중...';
    return '대기 중';
  };

  const getStatusColor = () => {
    if (isSpeaking) return '#FF9800';
    if (isProcessing) return '#2196F3';
    if (isRecording) return '#4CAF50';
    if (!isConnected) return '#F44336';
    return '#666';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI 음성 대화</Text>
        <View style={styles.statusContainer}>
          <View style={[styles.statusIndicator, { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }]} />
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
        </View>
      </View>
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((message) => (
          <View key={message.id} style={[
            styles.messageContainer,
            message.type === 'user' ? styles.userMessage : styles.aiMessage
          ]}>
            <Text style={[
              styles.messageText,
              message.type === 'user' ? styles.userMessageText : styles.aiMessageText
            ]}>
              {message.content}
            </Text>
            <Text style={styles.timestamp}>{message.timestamp}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[
            styles.recordButton,
            isRecording && styles.recordingButton,
            (!isConnected || isSpeaking || isProcessing) && styles.disabledButton
          ]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={!isConnected || isSpeaking || isProcessing}
        >
          <Text style={styles.recordButtonText}>
            {isRecording ? '🎤 녹음 중... (탭하면 중지)' : '🎤 녹음 시작'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.endButton}
          onPress={handleEndConversation}
        >
          <Text style={styles.endButtonText}>대화 종료</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 50, },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 10, },
  statusContainer: { flexDirection: 'row', alignItems: 'center', },
  statusIndicator: { width: 12, height: 12, borderRadius: 6, marginRight: 10, },
  statusText: { fontSize: 16, fontWeight: '600', },
  messagesContainer: { flex: 1, padding: 20, },
  messageContainer: { marginVertical: 8, padding: 15, borderRadius: 15, maxWidth: '85%', },
  userMessage: { alignSelf: 'flex-end', backgroundColor: '#007AFF', },
  aiMessage: { alignSelf: 'flex-start', backgroundColor: '#E5E5EA', },
  messageText: { fontSize: 16, lineHeight: 22, },
  userMessageText: { color: '#fff', },
  aiMessageText: { color: '#333', },
  timestamp: { fontSize: 12, color: '#999', marginTop: 5, alignSelf: 'flex-end', },
  controlsContainer: { padding: 20, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', },
  recordButton: { backgroundColor: '#4CAF50', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 25, alignItems: 'center', marginBottom: 10, },
  recordingButton: { backgroundColor: '#FF9800', },
  disabledButton: { backgroundColor: '#ccc', },
  recordButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', },
  endButton: { backgroundColor: '#FF3B30', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 25, alignItems: 'center', },
  endButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', },
});

export default SpeakScreen;