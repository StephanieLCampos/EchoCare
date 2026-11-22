import * as admin from 'firebase-admin';

admin.initializeApp();

// Voice cloning functions
export { cloneVoice } from './voice/cloneVoice';
export { textToSpeech } from './voice/textToSpeech';

// Auth functions
export { validateElderlyKey } from './auth/validateElderlyKey';

// Scheduled reminder functions
export { sendScheduledReminders } from './reminders/sendScheduledReminders';
