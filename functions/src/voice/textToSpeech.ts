import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';
const elevenlabsApiKey = defineSecret('ELEVENLABS_API_KEY');
const googleTranslateApiKey = defineSecret('GOOGLE_TRANSLATE_API_KEY');

/** Language codes for Google Translate */
const LANG_MAP: Record<string, string> = {
  en: 'en',
  zh: 'zh-CN',
  es: 'es',
  pt: 'pt',
  hi: 'hi',
  fr: 'fr',
  de: 'de',
  ja: 'ja',
  ko: 'ko',
};

/**
 * Translate text using Google Translate API
 */
async function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  apiKey: string
): Promise<string | null> {
  const from = LANG_MAP[sourceLanguage] || sourceLanguage;
  const to = LANG_MAP[targetLanguage] || targetLanguage;

  if (from === to) return text;

  try {
    const axios = (await import('axios')).default;
    const response = await axios.get('https://translation.googleapis.com/language/translate/v2', {
      params: {
        key: apiKey,
        q: text,
        source: from,
        target: to,
      },
      timeout: 10000,
    });

    return response.data?.data?.translations?.[0]?.translatedText || null;
  } catch (error) {
    logger.warn('Google Translate failed', error);
    return null;
  }
}

/**
 * Text-to-Speech using ElevenLabs with optional translation
 * Returns a Firebase Storage download URL for the generated audio
 */
export const textToSpeech = onCall(
  {
    secrets: [elevenlabsApiKey, googleTranslateApiKey],
    cors: true,
  },
  async (request) => {
    const {
      text,
      voiceId,
      sourceLanguage = 'en',
      targetLanguage,
      useTranslation = false,
    } = request.data;

    if (!text || !voiceId) {
      throw new HttpsError('invalid-argument', 'text and voiceId are required');
    }

    const elevenLabsKey = elevenlabsApiKey.value();
    if (!elevenLabsKey) {
      throw new HttpsError(
        'failed-precondition',
        'ElevenLabs API key not configured'
      );
    }

    try {
      let finalText = text;
      let translatedText: string | null = null;

      // Translate if requested
      if (useTranslation && targetLanguage && targetLanguage !== sourceLanguage) {
        const googleApiKey = googleTranslateApiKey.value();
        if (googleApiKey) {
          translatedText = await translateText(text, sourceLanguage, targetLanguage, googleApiKey);
          if (translatedText) {
            finalText = translatedText;
            logger.info('Text translated', { from: sourceLanguage, to: targetLanguage });
          }
        } else {
          logger.warn('Google Translate API key not set, skipping translation');
        }
      }

      // Call ElevenLabs TTS API
      const axios = (await import('axios')).default;
      const audioResponse = await axios.post(
        `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
        {
          text: finalText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        },
        {
          headers: {
            'xi-api-key': elevenLabsKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          responseType: 'arraybuffer',
          timeout: 60000,
        }
      );

      // Upload to Firebase Storage
      const bucket = admin.storage().bucket();
      const fileName = `voice-reminders/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
      const file = bucket.file(fileName);

      await file.save(Buffer.from(audioResponse.data), {
        metadata: {
          contentType: 'audio/mpeg',
        },
      });

      // Get a signed URL that works without CORS issues (valid for 7 days)
      const [audioUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      logger.info('TTS completed', { voiceId, audioUrl });

      return {
        success: true,
        audioUrl,
        originalText: text,
        translatedText,
        finalText,
        sourceLanguage,
        targetLanguage: targetLanguage || sourceLanguage,
      };
    } catch (error: unknown) {
      logger.error('Text-to-speech failed', error);

      const axiosError = error as { response?: { data?: unknown }; message?: string };
      const detail = axiosError.response?.data || axiosError.message || 'Text-to-speech failed';

      throw new HttpsError('internal', String(detail));
    }
  }
);
