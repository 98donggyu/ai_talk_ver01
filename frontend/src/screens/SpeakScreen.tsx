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
import AudioRecord from 'react-native-audio-record';
import Tts from 'react-native-tts';
import RNFS from 'react-native-fs';

// 특정 경고 메시지 무시
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

const SpeakScreen = ({ navigation }: { navigation: any }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const websocketRef = useRef<WebSocket | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // [수정 4] 앱 시작 시 초기화 순서를 강제하는 로직
  useEffect(() => {
    initializeApp();

    // 컴포넌트가 사라질 때 실행되는 최종 정리(cleanup) 로직
    return () => {
      cleanupAudio();
      if (websocketRef.current) {
        // [수정 1] 좀비 이벤트 방지를 위한 웹소켓 리소스 완전 해제
        websocketRef.current.onopen = null;
        websocketRef.current.onmessage = null;
        websocketRef.current.onclose = null;
        websocketRef.current.onerror = null;
        websocketRef.current.close();
      }
    };
  }, []);

  // [수정 4] 안정적인 초기화를 위해 모든 과정을 순차적으로 실행하는 함수
  const initializeApp = async () => {
    try {
      await requestPermissions();
      await setupTTS();
      // connectWebSocket은 모든 설정이 끝난 후 마지막에 호출
      connectWebSocket();
    } catch (error) {
      console.error("❌ 앱 초기화 실패:", error);
      Alert.alert("초기화 오류", "앱을 시작하는 데 문제가 발생했습니다.");
    }
  };

  const setupTTS = async () => {
    try {
      // 리스너 중복 등록 방지를 위해 항상 먼저 제거
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
    } catch (error) {
      console.error('TTS 설정 오류:', error);
      // TTS 설정 실패는 심각한 문제이므로 에러를 던져 initializeApp에서 처리
      throw new Error('TTS setup failed');
    }
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
        throw err; // 에러를 다시 던져서 초기화 중단
      }
    }
  };

  const connectWebSocket = () => {
    try {
      // [수정 1] 재연결 시 이전 웹소켓 객체를 완전히 정리하여 충돌 방지
      if (websocketRef.current) {
        websocketRef.current.onopen = null;
        websocketRef.current.onmessage = null;
        websocketRef.current.onclose = null;
        websocketRef.current.onerror = null;
        websocketRef.current.close();
      }

      console.log('🔗 WebSocket 연결 시도: ws://localhost:8000/ws/chat');
      websocketRef.current = new WebSocket('ws://localhost:8000/ws/chat');

      websocketRef.current.onopen = () => {
        setIsConnected(true);
        console.log('✅ WebSocket 연결 성공');
      };

      websocketRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 받은 메시지:', data);

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
        setTimeout(() => {
          // 앱이 활성화된 상태에서만 재연결 시도
          if (navigation.isFocused()) {
            console.log('🔄 WebSocket 재연결 시도');
            connectWebSocket();
          }
        }, 3000);
      };

      websocketRef.current.onerror = (error) => {
        console.error('❌ WebSocket 오류:', error.message);
        setIsConnected(false);
      };
    } catch (error) {
      console.error('❌ WebSocket 연결 실패:', error);
      Alert.alert('연결 실패', '서버에 연결할 수 없습니다.');
    }
  };

  const startRecording = async () => {
    if (isSpeaking || isProcessing) {
      console.log('🔊 AI가 말하는 중이거나 처리 중이므로 녹음 시작하지 않음');
      return;
    }

    try {
      // [수정 2] 녹음 시작 직전에 항상 오디오 모듈을 재초기화하여 충돌 방지
      const options = {
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6, // VOICE_RECOGNITION
        wavFile: 'voice_recording.wav'
      };
      AudioRecord.init(options);

      setIsRecording(true);
      console.log('🎤 음성 녹음 시작');
      AudioRecord.start();

      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = setTimeout(() => {
        if (isRecording) {
          console.log('⏰ 10초 무음 - 대화 종료');
          stopRecording();
          Alert.alert('대화 종료', '음성이 감지되지 않아 대화를 종료합니다.', [
            { text: '확인', onPress: () => navigation.goBack() }
          ]);
        }
      }, 10000);
    } catch (error) {
      console.error('❌ 녹음 시작 오류:', error);
      setIsRecording(false);
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

      console.log('🛑 음성 녹음 중지');
      const audioFile = await AudioRecord.stop();
      console.log('📁 녹음 파일:', audioFile);

      const audioBase64 = await RNFS.readFile(audioFile, 'base64');

      if (websocketRef.current && isConnected) {
        websocketRef.current.send(JSON.stringify({
          type: 'audio_data',
          audio: audioBase64
        }));
        console.log('📤 오디오 데이터 전송됨');
      }
    } catch (error) {
      console.error('❌ 녹음 중지 오류:', error);
      setIsRecording(false);
      setIsProcessing(false);
      Alert.alert('녹음 오류', '음성 처리 중 오류가 발생했습니다.');
    }
  };

  const handleUserMessage = (message: string) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: 'user',
      content: message,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  const handleAIMessage = (message: string) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: 'ai',
      content: message,
      timestamp: new Date().toLocaleTimeString()
    }]);
    speakMessage(message);
  };

  const speakMessage = async (message: string) => {
    try {
      await Tts.speak(message);
    } catch (error) {
      console.error('❌ TTS 오류:', error);
      setIsSpeaking(false);
    }
  };

  const cleanupAudio = async () => {
    try {
      if (isRecording) {
        await AudioRecord.stop();
      }
      Tts.stop();
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    } catch (error) {
      console.error('❌ Audio cleanup 오류:', error);
    }
  };

  const handleEndConversation = () => {
    Alert.alert(
      '대화 종료',
      '대화를 종료하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '종료',
          style: 'destructive',
          onPress: () => navigation.goBack() // cleanup은 useEffect의 return에서 처리됨
        }
      ]
    );
  };

  const getStatusText = () => {
    if (isSpeaking) return '🔊 AI 말하는 중...';
    if (isProcessing) return '⚙️ 음성 처리 중...';
    if (isRecording) return '🎤 녹음 중...';
    return '대기 중';
  };

  const getStatusColor = () => {
    if (isSpeaking) return '#FF9800';
    if (isProcessing) return '#2196F3';
    if (isRecording) return '#4CAF50';
    return '#666';
  };

  // (스타일 코드는 이전과 동일하므로 생략합니다)
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

// 스타일 코드는 여기에 그대로 붙여넣으세요.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 50,
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  messagesContainer: {
    flex: 1,
    padding: 20,
  },
  messageContainer: {
    marginVertical: 8,
    padding: 15,
    borderRadius: 15,
    maxWidth: '85%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E5EA',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  aiMessageText: {
    color: '#333',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
    alignSelf: 'flex-end',
  },
  controlsContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  recordButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 10,
  },
  recordingButton: {
    backgroundColor: '#FF9800',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  endButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
  },
  endButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SpeakScreen;