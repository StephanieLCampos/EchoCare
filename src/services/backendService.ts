/**
 * Backend Service
 * Connects to the voice-backend for reminder scheduling
 */

import { VOICE_API_BASE_URL } from '../config/voiceApi';

/**
 * Check if backend is running
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${VOICE_API_BASE_URL}/`);
    const data = await response.json();
    return data.status === 'ok' || data.message?.includes('Voice Cloning');
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
};

/**
 * Manually trigger reminder sending (for testing/debugging)
 * In production, this runs automatically via scheduler every minute
 */
export const triggerSendReminders = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${VOICE_API_BASE_URL}/api/trigger-reminders`, {
      method: 'POST',
    });
    const data = await response.json();
    return data.sent_reminders ?? data.sentIds ?? [];
  } catch (error) {
    console.error('Failed to trigger reminders:', error);
    return [];
  }
};

/**
 * Manually trigger escalation check (for testing/debugging)
 */
export const triggerEscalationCheck = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${VOICE_API_BASE_URL}/api/check-escalations`, {
      method: 'POST',
    });
    const data = await response.json();
    return data.escalated ?? [];
  } catch (error) {
    console.error('Failed to trigger escalation check:', error);
    return [];
  }
};
