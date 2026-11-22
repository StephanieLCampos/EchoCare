# EchoCare

A cross-platform caregiving app (iOS, Android, and web) that delivers medication and task reminders to an elderly family member **in the caregiver's own cloned voice**.

Built in 24 hours at **Hack for Humanity 2026** by a team of 6. The app appears as "Remind Me" in the code and app config.

## What it does

A caregiver records a 20–30 second voice sample once. After that, they type a reminder such as "Time to take your blood pressure pill," and their parent hears it spoken in the caregiver's voice. The reminder can also be translated, so a caregiver who types in English can have it played in Mandarin, Spanish, Hindi, or one of several other languages.

| Role | Sign-in | What they do |
|---|---|---|
| **Caregiver** | Email and password (Firebase Auth) | Adds care recipients and medications, creates **voice-clone** or **video** reminders with a schedule (once, daily, weekly, monthly) and a priority, and sees live status: Pending, Done, or Not Answered. |
| **Elderly user** | A 6-character access key, with no password to remember | Gets a push notification and an alarm, taps **Start Task** to hear or watch the message, then taps **Done**. |

## How it works

1. **Voice cloning:** the caregiver's sample is recorded (MediaRecorder on web, `expo-av` on native) and sent to the ElevenLabs voice-clone API. The returned `voiceId` is stored on the caregiver's Firestore document.
2. **Reminder synthesis:** typed text is optionally translated with Google Cloud Translation, which falls back to MyMemory if needed. It is then synthesized with ElevenLabs `eleven_multilingual_v2` in the cloned voice. The MP3 is uploaded to Firebase Storage, and a `reminders` document is created.
3. **Passwordless elderly login:** a callable Cloud Function validates the access key and mints a Firebase custom token with role claims (`role: 'elderly'`, `elderlyId`, `caregiverId`). The app's navigator branches on those claims.
4. **Delivery:** a scheduled function runs every minute, marks due reminders as sent, and sends an FCM push on a priority-specific Android notification channel.
5. **Real-time status:** both the caregiver dashboard and the elderly home screen use Firestore `onSnapshot` listeners. When the elderly user taps Done, the caregiver sees the update right away.

API keys stay on the server, behind callable functions and Firebase Secret Manager. They never ship in the client.

## My contributions

- Implemented the **AI voice pipeline** with ElevenLabs and Google Cloud Translation: voice cloning from a 30-second sample, translation into 9 languages, and multilingual text-to-speech in the caregiver's voice.
- Built the **Firebase backend** for it: Cloud Functions for voice cloning and text-to-speech, the Firestore data model for users, care recipients, medications, and reminders, and audio storage in Firebase Storage, with API keys kept in Secret Manager.
- Built the **Express voice service** (`voice-backend/`), a local-development version of the pipeline with a translation fallback chain.

## Tech stack

- **App:** React Native 0.81, React 19, TypeScript, Expo SDK 54, react-native-web, React Navigation 7, React Native Paper
- **Backend:** Firebase Cloud Functions v2 (Node 20, TypeScript), Firebase Auth with custom claims, Cloud Firestore, Firebase Storage, Firebase Cloud Messaging, Secret Manager
- **Voice service:** Node.js, Express, multer, node-cron
- **AI and APIs:** ElevenLabs (voice cloning and multilingual text-to-speech), Google Cloud Translation
- **Build:** EAS Build (Android APK/AAB, iOS), Firebase CLI

## Project structure

```
├── App.tsx, index.ts      Expo entry point
├── src/
│   ├── screens/           auth, caregiver dashboard, elderly, reminders, settings, demo
│   ├── components/        AudioRecorder, VideoRecorder (web and native), SchedulePicker
│   ├── services/          auth, reminders, voice API, notifications, audio
│   ├── navigation/        Stack navigator with logged-out, caregiver, and elderly branches
│   └── config/            Firebase setup, voice API URL, demo-mode flag
├── functions/             Firebase Cloud Functions: access-key login, voice clone, TTS, scheduled reminders
└── voice-backend/         Express voice service: /api/voice-clone, /api/text-to-speech
```

## Running locally

Requires Node.js 20+ and npm.

**1. Start the voice service**

```bash
cd voice-backend
npm install
cp .env.example .env   # then add your ElevenLabs API key
npm start              # runs on http://localhost:3001
```

**2. Start the app** (from the project root, in a second terminal)

```bash
npm install
npm run web            # or: npm run android / npm run ios
```

**Try voice cloning without Firebase:** on the Welcome screen, tap **"Try Voice Clone Demo (no Firebase)"**. Record a 20–30 second sample, create the clone, type a message, and press **Generate & Play**. To skip Firebase sign-in for the rest of the app, set `EXPO_PUBLIC_DEMO_MODE=true`.

**Cloud Functions** need your own Firebase project. Run `cd functions && npm install`, then `firebase deploy --only functions`.

| Variable | Where | Purpose |
|---|---|---|
| `ELEVENLABS_API_KEY` | `voice-backend/.env` | Voice cloning and text-to-speech (required) |
| `GOOGLE_TRANSLATE_API_KEY` or `GOOGLE_APPLICATION_CREDENTIALS` | `voice-backend/.env` | Translation (optional; falls back to MyMemory) |
| `EXPO_PUBLIC_VOICE_API_URL` | app environment | Voice service URL (default `http://localhost:3001`; use your machine's IP on a physical device) |
| `EXPO_PUBLIC_DEMO_MODE` | app environment | `true` skips Firebase sign-in for demos |

## Known limitations and next steps

This is a 24-hour hackathon prototype. Before real-world use, it would need:

- **Escalation:** SMS alerts to emergency contacts when a reminder goes unanswered (Twilio) are designed but not implemented.
- **Scheduling:** recurring reminders need to re-arm after they fire, weekly day filters need to match between the app and the scheduler, and time zones are currently fixed to Pacific time.
- **One delivery path:** the Express scheduler and the Cloud Function both update reminder status. Production should use only the Cloud Function.
- **Security rules:** Firestore and Storage rules are prototype-level and need per-caregiver access scoping.
- **Tests and CI:** there are no automated tests yet.

## Team

Built by a team of 6 at Hack for Humanity 2026 (January 2026).
