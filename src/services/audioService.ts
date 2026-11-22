import { Audio } from 'expo-av';
import { Platform } from 'react-native';

/**
 * Audio Service - Handles browser autoplay restrictions
 *
 * Browsers block autoplay until user interacts with the page.
 * This service "unlocks" audio on first user interaction,
 * allowing subsequent sounds to play automatically.
 */

let isAudioUnlocked = false;
let audioContext: AudioContext | null = null;

/**
 * Check if audio has been unlocked
 */
export function isAudioReady(): boolean {
  return isAudioUnlocked;
}

/**
 * Unlock audio for the browser session.
 * Call this on any user interaction (login, button tap, etc.)
 */
export async function unlockAudio(): Promise<boolean> {
  if (isAudioUnlocked) {
    return true;
  }

  try {
    if (Platform.OS === 'web') {
      // Create and resume AudioContext
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioContext = new AudioContextClass();

        // Create a silent buffer and play it
        const buffer = audioContext.createBuffer(1, 1, 22050);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);

        // Resume the context (required by some browsers)
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
      }

      // Also try to set up expo-av audio mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Play a silent sound with expo-av to unlock it too
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=' },
          { shouldPlay: true, volume: 0 }
        );
        await sound.unloadAsync();
      } catch (e) {
        // Silent sound might fail, that's okay
      }
    } else {
      // Native platforms - just set audio mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    }

    isAudioUnlocked = true;
    console.log('Audio unlocked successfully');
    return true;
  } catch (error) {
    console.error('Failed to unlock audio:', error);
    return false;
  }
}

/**
 * Get the AudioContext (for advanced use cases)
 */
export function getAudioContext(): AudioContext | null {
  return audioContext;
}
