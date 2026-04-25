"use client";
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Phone, PhoneOff, Mic, Grid3x3, Play } from "lucide-react";

export default function SimulatorPage() {
  const [callStatus, setCallStatus] = useState<"idle" | "ringing" | "connected" | "ended">("idle");
  const [callData, setCallData] = useState<any>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showDialpad, setShowDialpad] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Poll for incoming calls
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callStatus === "idle") {
      interval = setInterval(async () => {
        try {
          const res = await axios.get("http://localhost:8001/api/v1/simulator/poll");
          if (res.data.call_id) {
            setCallData(res.data);
            setCallStatus("ringing");
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

  const playSound = (src: string) => {
    if (audioRef.current) {
      audioRef.current.src = src;
      audioRef.current.load();
      audioRef.current.play().catch(e => {
        console.warn("Autoplay blocked, click Play manually");
      });
    }
  };

  const speakLocal = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    // Set language based on selection if possible, otherwise default to English
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    let ringInterval: NodeJS.Timeout;
    if (callStatus === "ringing") {
      // Simple ringing beep
      ringInterval = setInterval(() => {
        const beep = new AudioContext();
        const osc = beep.createOscillator();
        const gain = beep.createGain();
        osc.connect(gain);
        gain.connect(beep.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, beep.currentTime);
        gain.gain.setValueAtTime(0.1, beep.currentTime);
        osc.start();
        osc.stop(beep.currentTime + 0.5);
      }, 2000);
    }
    return () => clearInterval(ringInterval);
  }, [callStatus]);

  const acceptCall = async () => {
    setCallStatus("connected");
    try {
      const res = await axios.post(`http://localhost:8001/api/v1/simulator/${callData.call_id}/accept`);
      if (res.data.audio_base64) {
        const audioSrc = `data:audio/mp3;base64,${res.data.audio_base64}`;
        setAudioUrl(audioSrc);
        playSound(audioSrc);
      } else if (res.data.text) {
        console.warn("Using local speech fallback");
        speakLocal(res.data.text);
      }
    } catch (e) {
      console.error("Accept call error", e);
      setCallStatus("ended");
    }
  };

  const declineCall = () => {
    setCallStatus("ended");
    setTimeout(() => {
      setCallStatus("idle");
      setCallData(null);
      setAudioUrl(null);
    }, 3000);
  };

  const handleDtmf = async (digit: string) => {
    try {
      await axios.post(`http://localhost:8001/api/v1/simulator/${callData.call_id}/input`, { digit });
      setCallStatus("ended");
      if (audioRef.current) audioRef.current.pause();
      setTimeout(() => {
        setCallStatus("idle");
        setCallData(null);
        setAudioUrl(null);
      }, 3000);
    } catch (e) {
      console.error("DTMF error", e);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 font-sans">
      <div className="w-[375px] h-[812px] bg-black rounded-[40px] shadow-2xl overflow-hidden relative border-[8px] border-gray-800 flex flex-col justify-between">
        
        {/* Dynamic Island / Notch */}
        <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-50">
          <div className="w-32 h-6 bg-black rounded-b-3xl"></div>
        </div>

        {callStatus === "idle" && (
          <div className="flex-1 flex items-center justify-center text-white text-center">
            <div>
              <p className="text-xl font-semibold opacity-50">Virtual Phone</p>
              <p className="text-sm opacity-30 mt-2">Waiting for incoming call...</p>
            </div>
          </div>
        )}

        {callStatus === "ringing" && (
          <div className="flex-1 flex flex-col items-center justify-between py-20 bg-gradient-to-b from-gray-800 to-black text-white">
            <div className="text-center">
              <p className="text-4xl font-light mb-2">{callData?.customer_name || "Unknown Caller"}</p>
              <p className="text-xl opacity-60">mobile • {callData?.phone_number}</p>
            </div>
            
            <div className="flex w-full justify-between px-12 pb-10">
              <button 
                onClick={declineCall}
                className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
              >
                <PhoneOff size={32} className="text-white" />
              </button>
              
              <button 
                onClick={acceptCall}
                className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-lg animate-bounce"
              >
                <Phone size={32} className="text-white fill-current" />
              </button>
            </div>
          </div>
        )}

        {callStatus === "connected" && (
          <div className="flex-1 flex flex-col items-center justify-between py-20 bg-gray-900/90 text-white backdrop-blur-md">
            <div className="text-center mt-10">
              <p className="text-3xl font-light">{callData?.customer_name || "Unknown Caller"}</p>
              <p className="text-lg opacity-60 mt-2">00:05</p>
            </div>

            {audioUrl && <audio ref={audioRef} autoPlay className="hidden" />}

            {!showDialpad ? (
              <div className="grid grid-cols-3 gap-x-8 gap-y-6 px-10 mb-8">
                {/* iPhone Call Action Buttons */}
                <div className="flex flex-col items-center" onClick={() => audioUrl && playSound(audioUrl)}><div className="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center cursor-pointer"><Play size={28}/></div><p className="text-xs mt-2 opacity-70">play</p></div>
                <div className="flex flex-col items-center" onClick={() => setShowDialpad(true)}><div className="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center cursor-pointer"><Grid3x3 size={28}/></div><p className="text-xs mt-2 opacity-70">keypad</p></div>
                <div className="flex flex-col items-center"><div className="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center"><Phone size={28}/></div><p className="text-xs mt-2 opacity-70">audio</p></div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-6 gap-y-4 px-10 mb-4 text-3xl font-light">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(digit => (
                  <button 
                    key={digit} 
                    onClick={() => handleDtmf(digit)}
                    className="w-20 h-20 bg-gray-700/50 rounded-full flex items-center justify-center active:bg-gray-600 transition-colors"
                  >
                    {digit}
                  </button>
                ))}
                <div className="col-span-3 flex justify-center mt-2">
                  <button onClick={() => setShowDialpad(false)} className="text-sm opacity-70 py-2 px-4 rounded-full bg-gray-800">Hide</button>
                </div>
              </div>
            )}

            <div className="pb-10">
              <button 
                onClick={declineCall}
                className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
              >
                <PhoneOff size={32} className="text-white" />
              </button>
            </div>
          </div>
        )}

        {callStatus === "ended" && (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 text-white">
            <p className="text-2xl font-light mb-2">{callData?.customer_name || "Unknown Caller"}</p>
            <p className="text-lg opacity-60">Call Ended</p>
          </div>
        )}

      </div>
    </div>
  );
}