/**
 * Voice service - uses Firebase Cloud Functions for voice cloning and text-to-speech.
 * Voice sample from registration is cloned; typed text is synthesized and sent to grandma/grandpa.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { textToSpeech } from './voiceApiService';
import { createReminderWithUrl } from './reminderService';

/**
 * Get the caregiver's ElevenLabs voice ID from Firestore.
 */
export async function getCaregiverVoiceId(): Promise<string | null> {
  const userId = auth.currentUser?.uid;
  if (!userId) return null;
  const userDoc = await getDoc(doc(db, 'users', userId));
  return (userDoc.data()?.elevenLabsVoiceId as string) ?? null;
}

/**
 * Preview voice clone: generate audio from text and return URL for playback.
 * Used when user types reminder text and wants to hear it before saving.
 */
export async function previewVoiceClone(
  text: string,
  options?: { sourceLanguage?: string; targetLanguage?: string }
): Promise<{ audioUrl: string }> {
  const voiceId = await getCaregiverVoiceId();
  if (!voiceId) {
    throw new Error('Voice not set up. Re-register with a voice sample.');
  }
  const sourceLanguage = options?.sourceLanguage ?? 'en';
  const targetLanguage = options?.targetLanguage;
  const result = await textToSpeech(text, voiceId, {
    sourceLanguage,
    targetLanguage: targetLanguage || undefined,
    useTranslation: !!targetLanguage && targetLanguage !== sourceLanguage,
  });
  // audioUrl is now a full Firebase Storage URL from Cloud Functions
  return { audioUrl: result.audioUrl };
}

/**
 * Create a voice reminder: text is synthesized with caregiver's cloned voice,
 * uploaded to Firebase Storage, and reminder is created.
 */
export async function createVoiceReminder(reminderData: {
  caregiverId: string;
  elderlyId: string;
  title: string;
  textContent: string;
  taskInfo?: string;
  sourceLanguage?: string;
  targetLanguage?: string | null;
  priority: string;
  category: string;
  medicationId?: string | null;
  schedule: Record<string, unknown>;
  responseTimeLimit: number;
  initialStatus?: 'scheduled' | 'sent';
}): Promise<unknown> {
  const voiceId = await getCaregiverVoiceId();
  if (!voiceId) {
    throw new Error('Voice not set up. Please re-record your voice sample in Settings.');
  }

  const ttsResult = await textToSpeech(
    reminderData.textContent || reminderData.title,
    voiceId,
    {
      sourceLanguage: reminderData.sourceLanguage ?? 'en',
      targetLanguage: reminderData.targetLanguage ?? undefined,
      useTranslation: !!reminderData.targetLanguage && reminderData.targetLanguage !== (reminderData.sourceLanguage ?? 'en'),
    }
  );

  // Use the URL directly - audio is already in Firebase Storage from TTS Cloud Function
  return createReminderWithUrl(
    reminderData.caregiverId,
    reminderData.elderlyId,
    'audio',
    ttsResult.audioUrl,
    {
      title: reminderData.title,
      taskInfo: reminderData.taskInfo,
      priority: reminderData.priority,
      category: reminderData.category,
      medicationId: reminderData.medicationId ?? undefined,
      schedule: reminderData.schedule,
      responseTimeLimit: reminderData.responseTimeLimit,
      initialStatus: reminderData.initialStatus,
    }
  );
}

/**
 * No-op - voice clone is now created during registration.
 * Kept for backward compatibility (e.g. Settings "Re-process voice").
 */
export const processVoiceSample = async (): Promise<void> => {
  console.warn('processVoiceSample: Voice clone is created at registration. Use Settings to re-record if needed.');
};
