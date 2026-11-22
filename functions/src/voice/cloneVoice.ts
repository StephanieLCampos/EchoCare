import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';
const elevenlabsApiKey = defineSecret('ELEVENLABS_API_KEY');

/**
 * Clone a voice using ElevenLabs API
 * Receives base64 audio data, uploads to ElevenLabs, returns voiceId
 */
export const cloneVoice = onCall({ secrets: [elevenlabsApiKey], cors: true }, async (request) => {
  const { audioBase64, audioType = 'audio/webm', voiceName } = request.data;

  if (!audioBase64) {
    throw new HttpsError('invalid-argument', 'audioBase64 is required');
  }

  const apiKey = elevenlabsApiKey.value();
  if (!apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'ElevenLabs API key not configured. Set ELEVENLABS_API_KEY in Firebase environment.'
    );
  }

  try {
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Determine file extension and content type
    let fileName = 'voice.mp3';
    let contentType = audioType || 'audio/mpeg';

    if (audioType.includes('webm')) {
      fileName = 'voice.webm';
      contentType = 'audio/webm';
    } else if (audioType.includes('wav') || audioType.includes('x-wav')) {
      fileName = 'voice.wav';
      contentType = 'audio/wav';
    } else if (audioType.includes('mp3') || audioType.includes('mpeg')) {
      fileName = 'voice.mp3';
      contentType = 'audio/mpeg';
    }

    logger.info('Processing voice sample', {
      originalType: audioType,
      resolvedType: contentType,
      fileName,
      bufferSize: audioBuffer.length
    });

    // Create form data for ElevenLabs
    const FormData = (await import('form-data')).default;
    const formData = new FormData();

    formData.append('files', audioBuffer, {
      filename: fileName,
      contentType: contentType,
    });
    formData.append('name', voiceName || `voice-${Date.now()}`);
    formData.append('description', 'Voice cloned via Remind Me app');

    // Call ElevenLabs voice cloning API
    const axios = (await import('axios')).default;
    const response = await axios.post(
      `${ELEVENLABS_API_URL}/voices/add`,
      formData,
      {
        headers: {
          'xi-api-key': apiKey,
          ...formData.getHeaders(),
        },
        timeout: 60000,
      }
    );

    const voiceId = response.data.voice_id;

    logger.info('Voice cloned successfully', { voiceId, voiceName });

    return {
      success: true,
      voiceId,
    };
  } catch (error: unknown) {
    logger.error('Voice cloning failed', error);

    const axiosError = error as {
      response?: {
        status?: number;
        data?: { detail?: { message?: string } | string }
      };
      message?: string
    };

    // ElevenLabs returns errors in different formats
    let detail = 'Voice cloning failed';
    if (axiosError.response?.data) {
      const data = axiosError.response.data;
      if (typeof data.detail === 'string') {
        detail = data.detail;
      } else if (data.detail?.message) {
        detail = data.detail.message;
      } else if (typeof data === 'string') {
        detail = data;
      } else {
        detail = JSON.stringify(data);
      }
    } else if (axiosError.message) {
      detail = axiosError.message;
    }

    logger.error('ElevenLabs error details:', {
      status: axiosError.response?.status,
      detail
    });

    throw new HttpsError('internal', detail);
  }
});
