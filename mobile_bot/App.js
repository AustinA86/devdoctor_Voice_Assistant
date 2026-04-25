import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, Dimensions, Image } from 'react-native';
import { Phone, PhoneOff, Mic, Grid3x3, StopCircle, Volume2 } from 'lucide-react-native';
import axios from 'axios';
import { Audio, InterruptionModeIOS } from 'expo-av';
import * as Speech from 'expo-speech';

const { width, height } = Dimensions.get('window');
const BASE_URL = 'http://localhost:8001/api/v1/simulator';

export default function App() {
  const [callStatus, setCallStatus] = useState('idle'); // idle, ringing, connected, ended
  const [callData, setCallData] = useState(null);
  const [ivrState, setIvrState] = useState(''); // LANGUAGE_SELECTION, ORDER_DETAILS, COMPLETED
  const [subtitle, setSubtitle] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const soundRef = useRef(null);
  const recordingRef = useRef(null);

  // 1. ROBUST AUDIO SETUP
  useEffect(() => {
    const init = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        await Audio.requestPermissionsAsync();
      } catch (e) {}
    };
    init();
    return () => {
       if (soundRef.current) soundRef.current.unloadAsync();
    };
  }, []);

  // 2. POLLING FOR CALLS
  useEffect(() => {
    let interval;
    if (callStatus === 'idle') {
      interval = setInterval(async () => {
        try {
          const res = await axios.get(`${BASE_URL}/poll`);
          if (res.data.call_id) {
            setCallData(res.data);
            setCallStatus('ringing');
            playRingtone();
          }
        } catch (e) {}
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

  const playRingtone = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://www.soundjay.com/phone/telephone-ring-03a.mp3' },
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      soundRef.current = sound;
    } catch (e) {}
  };

  // 3. MASTER VOICE ENGINE (HANDLES TTS + STATE TRANSITION)
  const runVoiceCycle = async (base64Audio, text, nextState) => {
    setSubtitle(text);
    setIvrState(nextState);

    // Stop any existing sound
    if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
    }

    if (base64Audio) {
      try {
        const { sound: playback } = await Audio.Sound.createAsync(
          { uri: `data:audio/mp3;base64,${base64Audio}` },
          { shouldPlay: true, volume: 1.0 }
        );
        soundRef.current = playback;
        playback.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) {
            onBotFinishedSpeaking(nextState);
          }
        });
      } catch (e) {
        fallbackToNative(text, nextState);
      }
    } else {
      fallbackToNative(text, nextState);
    }
  };

  const fallbackToNative = (text, nextState) => {
    const lang = callData?.preferred_language || 'English';
    const speechLang = lang === 'Hindi' ? 'hi-IN' : lang === 'Kannada' ? 'kn-IN' : 'en-IN';
    Speech.speak(text, {
      language: speechLang,
      rate: 0.85,
      onDone: () => onBotFinishedSpeaking(nextState)
    });
  };

  const onBotFinishedSpeaking = (state) => {
    if (state === 'ORDER_DETAILS') {
      startAutoListening();
    } else if (state === 'COMPLETED') {
      setTimeout(endCall, 2000);
    }
  };

  // 4. AUTO-RECORDING
  const startAutoListening = async () => {
    if (callStatus !== 'connected') return;
    try {
      setIsRecording(true);
      setSubtitle("🔴 Listening for your response...");
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setTimeout(() => stopAndUpload(), 6000);
    } catch (e) {
      setIsRecording(false);
    }
  };

  const stopAndUpload = async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    setIsProcessing(true);
    setSubtitle("AI is processing...");
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      const formData = new FormData();
      formData.append('file', { uri, name: 'response.m4a', type: 'audio/m4a' });
      const res = await axios.post(`${BASE_URL}/${callData.call_id}/voice`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      runVoiceCycle(res.data.audio_base64, res.data.text, res.data.state);
    } catch (e) {
      setSubtitle("Network Error. Use Keypad.");
    }
    setIsProcessing(false);
  };

  // 5. INPUT HANDLERS
  const acceptCall = async () => {
    if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
    }
    setCallStatus('connected');
    try {
      const res = await axios.post(`${BASE_URL}/${callData.call_id}/accept`);
      runVoiceCycle(res.data.audio_base64, res.data.text, res.data.state);
    } catch (e) { endCall(); }
  };

  const endCall = () => {
    Speech.stop();
    if (soundRef.current) soundRef.current.unloadAsync();
    if (recordingRef.current) recordingRef.current.stopAndUnloadAsync();
    setCallStatus('ended');
    setSubtitle("");
    setTimeout(() => {
      setCallStatus('idle');
      setCallData(null);
      setIvrState('');
    }, 3000);
  };

  const handleKeypadPress = async (digit) => {
    Speech.stop();
    if (soundRef.current) await soundRef.current.stopAsync();
    try {
      const res = await axios.post(`${BASE_URL}/${callData.call_id}/input`, { digit, state: ivrState });
      runVoiceCycle(res.data.audio_base64, res.data.text, res.data.state);
    } catch (e) {}
  };

  return (
    <SafeAreaView style={styles.container}>
      {callStatus === 'idle' && (
        <View style={styles.center}>
          <Image source={require('./assets/logo.png')} style={{ width: 150, height: 150, marginBottom: 20, borderRadius: 20 }} />
          <View style={styles.phoneIconCircle}><Phone color="white" size={40}/></View>
          <Text style={styles.idleText}>Phone</Text>
          <Text style={styles.subText}>Waiting for confirmation calls...</Text>
        </View>
      )}

      {callStatus === 'ringing' && (
        <View style={styles.ringingView}>
          <View style={styles.header}>
            <Image source={require('./assets/logo.png')} style={{ width: 80, height: 80, marginBottom: 20, borderRadius: 10 }} />
            <Text style={styles.callerName}>Automaton AI Office</Text>
            <Text style={styles.callType}>Incoming Call...</Text>
          </View>
          <View style={styles.ringActions}>
             <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={endCall}>
                <PhoneOff color="white" size={32}/>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={acceptCall}>
                <Phone color="white" size={32}/>
             </TouchableOpacity>
          </View>
        </View>
      )}

      {callStatus === 'connected' && (
        <View style={styles.activeView}>
           <View style={styles.header}>
              <Text style={styles.callerName}>{callData?.customer_name}</Text>
              <Text style={styles.duration}>{isRecording ? '🔴 Listening' : '00:02'}</Text>
           </View>

           <View style={styles.subtitleContainer}>
              {isProcessing && <ActivityIndicator color="#34C759" style={{marginBottom: 10}}/>}
              <Text style={styles.subtitleText}>{subtitle}</Text>
           </View>

           <View style={styles.controlsArea}>
              {!showKeypad ? (
                <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.roundBtn} onPress={() => setShowKeypad(true)}>
                        <Grid3x3 color="white" size={28}/>
                        <Text style={styles.btnLabel}>keypad</Text>
                    </TouchableOpacity>
                    <View style={styles.roundBtnDisabled}>
                        <Mic color="#555" size={28}/>
                        <Text style={[styles.btnLabel, {color: '#555'}]}>mute</Text>
                    </View>
                </View>
              ) : (
                <View style={styles.keypadContainer}>
                   {['1','2','3','4','5','6','7','8','9','*','0','#'].map(k => (
                     <TouchableOpacity key={k} style={styles.keyCircle} onPress={() => handleKeypadPress(k)}>
                        <Text style={styles.keyText}>{k}</Text>
                     </TouchableOpacity>
                   ))}
                   <TouchableOpacity style={styles.hideKeypad} onPress={() => setShowKeypad(false)}>
                      <Text style={{color: '#aaa'}}>Hide Keypad</Text>
                   </TouchableOpacity>
                </View>
              )}
           </View>

           <TouchableOpacity style={[styles.actionBtn, styles.declineBtn, {marginBottom: 40}]} onPress={endCall}>
              <PhoneOff color="white" size={32}/>
           </TouchableOpacity>
        </View>
      )}

      {callStatus === 'ended' && (
        <View style={styles.center}>
           <Text style={styles.callerName}>{callData?.customer_name}</Text>
           <Text style={styles.subText}>Call Ended</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  idleText: { color: 'white', fontSize: 28, fontWeight: 'bold', marginTop: 20 },
  subText: { color: '#666', marginTop: 10, fontSize: 16 },
  phoneIconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  ringingView: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 100 },
  activeView: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 60 },
  header: { alignItems: 'center' },
  callerName: { color: 'white', fontSize: 36, fontWeight: '300' },
  callType: { color: '#aaa', fontSize: 18, marginTop: 5 },
  duration: { color: '#34C759', fontSize: 16, marginTop: 5 },
  ringActions: { flexDirection: 'row', width: '100%', justifyContent: 'space-around', paddingHorizontal: 40 },
  actionBtn: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  acceptBtn: { backgroundColor: '#34C759' },
  declineBtn: { backgroundColor: '#FF3B30' },
  subtitleContainer: { backgroundColor: '#111', padding: 25, width: '90%', borderRadius: 20, borderWidth: 1, borderColor: '#222' },
  subtitleText: { color: '#34C759', fontSize: 18, textAlign: 'center', lineHeight: 26 },
  controlsArea: { width: '100%', alignItems: 'center' },
  buttonRow: { flexDirection: 'row', gap: 60 },
  roundBtn: { alignItems: 'center', justifyContent: 'center', width: 70, height: 70, borderRadius: 35, backgroundColor: '#222' },
  roundBtnDisabled: { alignItems: 'center', justifyContent: 'center', width: 70, height: 70, borderRadius: 35, backgroundColor: '#111' },
  btnLabel: { color: 'white', fontSize: 12, marginTop: 8 },
  keypadContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 15, paddingHorizontal: 30 },
  keyCircle: { width: 75, height: 75, borderRadius: 40, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  keyText: { color: 'white', fontSize: 32, fontWeight: '300' },
  hideKeypad: { width: '100%', alignItems: 'center', marginTop: 10 }
});
