import { useCallback, useRef } from "react";

interface UseSpeechOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const {
    language = "de-DE", // German language
    rate = 0.9, // Slightly slower for clarity
    pitch = 1.0,
    volume = 1.0,
  } = options;

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isPlayingRef = useRef(false);

  const speak = useCallback(
    (text: string) => {
      // Cancel any ongoing speech
      if (isPlayingRef.current) {
        window.speechSynthesis.cancel();
      }

      // Create a new utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      // Find a German voice if available
      const voices = window.speechSynthesis.getVoices();
      const germanVoice = voices.find(
        (voice) =>
          voice.lang.startsWith("de") &&
          (voice.name.includes("Google") ||
            voice.name.includes("Microsoft") ||
            voice.name.includes("Apple") ||
            voice.name.includes("native"))
      );

      if (germanVoice) {
        utterance.voice = germanVoice;
      }

      // Set callbacks
      utterance.onstart = () => {
        isPlayingRef.current = true;
      };

      utterance.onend = () => {
        isPlayingRef.current = false;
      };

      utterance.onerror = () => {
        isPlayingRef.current = false;
      };

      utteranceRef.current = utterance;

      // Speak
      window.speechSynthesis.speak(utterance);
    },
    [language, rate, pitch, volume]
  );

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    isPlayingRef.current = false;
  }, []);

  const isPlaying = isPlayingRef.current;

  return { speak, stop, isPlaying };
}

