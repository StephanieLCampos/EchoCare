/**
 * Voice API service - uses Firebase Cloud Functions for ElevenLabs voice cloning.
 * Keeps API keys secure server-side while providing voice cloning and TTS.
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

export interface VoiceCloneResponse {
  success: boolean;
  voiceId: string;
}

export interface TextToSpeechResponse {
  success: boolean;
  audioUrl: string;
  originalText: string;
  translatedText?: string | null;
  finalText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

/**
 * Convert a Blob to base64 string
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Create an ElevenLabs voice clone from a voice sample (20-30 sec recording).
 * Returns the voiceId to store and use for text-to-speech.
 */
export async function createVoiceClone(
  voiceBlob: Blob,
  voiceName?: string
): Promise<VoiceCloneResponse> {
  const functions = getFunctions(getApp());
  const cloneVoiceFn = httpsCallable<
    { audioBase64: string; audioType: string; voiceName?: string },
    VoiceCloneResponse
  >(functions, 'cloneVoice');

  const audioBase64 = await blobToBase64(voiceBlob);
  const audioType = voiceBlob.type || 'audio/webm';

  const result = await cloneVoiceFn({
    audioBase64,
    audioType,
    voiceName,
  });

  return result.data;
}

/**
 * Convert text to speech using a cloned voice.
 * Returns the audio URL (Firebase Storage public URL).
 */
export async function textToSpeech(
  text: string,
  voiceId: string,
  options?: {
    sourceLanguage?: string;
    targetLanguage?: string;
    useTranslation?: boolean;
  }
): Promise<TextToSpeechResponse> {
  const functions = getFunctions(getApp());
  const textToSpeechFn = httpsCallable<
    {
      text: string;
      voiceId: string;
      sourceLanguage?: string;
      targetLanguage?: string;
      useTranslation?: boolean;
    },
    TextToSpeechResponse
  >(functions, 'textToSpeech');

  const result = await textToSpeechFn({
    text,
    voiceId,
    sourceLanguage: options?.sourceLanguage ?? 'en',
    targetLanguage: options?.targetLanguage,
    useTranslation: options?.useTranslation ?? false,
  });

  return result.data;
}

/**
 * Fetch the generated audio blob from the URL.
 * audioUrl from textToSpeech is now a full Firebase Storage URL.
 */
export async function fetchAudioBlob(audioUrl: string): Promise<Blob> {
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error('Failed to fetch audio');
  return res.blob();
}
