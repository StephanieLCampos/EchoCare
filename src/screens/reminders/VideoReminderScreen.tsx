import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { Text, Button, TextInput, ActivityIndicator, SegmentedButtons } from 'react-native-paper';
import { VideoRecorder } from '../../components/VideoRecorder';
import { createReminder } from '../../services/reminderService';
import { createVoiceReminder } from '../../services/voiceService';
import { auth } from '../../config/firebase';

type Priority = 'normal' | 'important';

interface VideoReminderScreenProps {
  elderlyId: string;
  elderlyName?: string;
  initialTab?: 'video' | 'voice';
  onSuccess?: () => void;
  onVideoRecorded?: (uri: string) => void;
}

export function VideoReminderScreen({
  elderlyId,
  elderlyName,
  initialTab = 'video',
  onSuccess,
  onVideoRecorded,
}: VideoReminderScreenProps) {
  const [activeTab, setActiveTab] = useState<'video' | 'voice'>(initialTab);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [title, setTitle] = useState('');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [sendNow, setSendNow] = useState(true);
  // Schedule state
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date());
  const [scheduledHour, setScheduledHour] = useState(9);
  const [scheduledMinute, setScheduledMinute] = useState(0);
  const [scheduledAmPm, setScheduledAmPm] = useState<'AM' | 'PM'>('AM');
  const [showCalendar, setShowCalendar] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState('');

  // Translation options
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [useTranslation, setUseTranslation] = useState(false);

  // Supported languages
  const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Spanish' },
    { code: 'zh', label: 'Chinese' },
    { code: 'hi', label: 'Hindi' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
  ];

  // Build a Date object from the scheduled date/time selections
  const buildScheduledDateTime = (): Date => {
    const date = new Date(scheduledDate);
    let hour = scheduledHour;
    if (scheduledAmPm === 'PM' && hour !== 12) {
      hour += 12;
    } else if (scheduledAmPm === 'AM' && hour === 12) {
      hour = 0;
    }
    date.setHours(hour, scheduledMinute, 0, 0);
    return date;
  };

  // Format the scheduled date/time for display
  const formatScheduledDateTime = (): string => {
    const date = scheduledDate;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = dayNames[date.getDay()];
    const monthName = monthNames[date.getMonth()];
    const dayNum = date.getDate();
    const minuteStr = scheduledMinute.toString().padStart(2, '0');
    return `${dayName}, ${monthName} ${dayNum} at ${scheduledHour}:${minuteStr} ${scheduledAmPm}`;
  };

  // Generate calendar days for current month view
  const generateCalendarDays = (): (number | null)[] => {
    const year = scheduledDate.getFullYear();
    const month = scheduledDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: (number | null)[] = [];
    // Add empty cells for days before the 1st
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    // Add the days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const handleRecordingComplete = (uri: string, blob?: Blob) => {
    setVideoUri(uri);
    setVideoBlob(blob ?? null);
    setUploaded(false);
    setError('');
    onVideoRecorded?.(uri);
  };

  const handlePublishVideo = async () => {
    if (!videoUri) { setError('Please record a video first.'); return; }
    if (!title.trim()) { setError('Please add a title for this reminder.'); return; }

    setUploading(true);
    setError('');

    try {
      let mediaFile: Blob;

      if (videoBlob) {
        mediaFile = videoBlob;
      } else {
        const response = await fetch(videoUri);
        mediaFile = await response.blob();
      }

      const caregiverId = auth.currentUser?.uid ?? 'demo-user';

      // Build schedule object
      const schedule = sendNow
        ? {
            type: 'immediate',
            sendNow: true,
            time: new Date().toISOString(),
            timezone: 'America/Los_Angeles',
          }
        : {
            type: 'scheduled',
            sendNow: false,
            time: buildScheduledDateTime().toISOString(),
            timezone: 'America/Los_Angeles',
          };

      await createReminder(caregiverId, elderlyId, 'video', mediaFile, {
        title: title.trim(),
        priority,
        category: 'reminder',
        schedule,
        responseTimeLimit: 60,
        initialStatus: sendNow ? 'sent' : 'scheduled',
      });

      setUploaded(true);
      setTimeout(() => onSuccess?.(), 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Upload failed: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handlePublishVoice = async () => {
    if (!voiceMessage.trim()) { setError('Please type a message for the voice reminder.'); return; }

    setUploading(true);
    setError('');

    try {
      const caregiverId = auth.currentUser?.uid ?? 'demo-user';

      // Build schedule object for voice
      const voiceSchedule = sendNow
        ? {
            type: 'immediate',
            sendNow: true,
            time: new Date().toISOString(),
            timezone: 'America/Los_Angeles',
          }
        : {
            type: 'scheduled',
            sendNow: false,
            time: buildScheduledDateTime().toISOString(),
            timezone: 'America/Los_Angeles',
          };

      await createVoiceReminder({
        caregiverId,
        elderlyId,
        title: voiceMessage.trim(),
        textContent: voiceMessage.trim(),
        sourceLanguage,
        targetLanguage: useTranslation ? targetLanguage : null,
        priority,
        category: 'reminder',
        schedule: voiceSchedule,
        responseTimeLimit: 60,
        initialStatus: sendNow ? 'sent' : 'scheduled',
      });

      setUploaded(true);
      setTimeout(() => onSuccess?.(), 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Voice reminder failed: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        bounces={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
      >
          {/* Header */}
          <View style={styles.header}>
        <View style={styles.headerFor}>
          <View style={styles.avatarBadge}>
            <Text style={styles.avatarLetter}>
              {elderlyName ? elderlyName[0].toUpperCase() : '?'}
            </Text>
          </View>
          <View>
            <Text style={styles.headerLabel}>Sending reminder to</Text>
            <Text style={styles.headerName}>{elderlyName ?? 'Care Recipient'}</Text>
          </View>
        </View>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <SegmentedButtons
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value as 'video' | 'voice');
            setError('');
            setUploaded(false);
          }}
          buttons={[
            { value: 'video', label: '🎥 Video', icon: 'video' },
            { value: 'voice', label: '🔊 Voice', icon: 'microphone' },
          ]}
          style={styles.tabs}
        />
      </View>

      {/* Priority Selection */}
      <View style={styles.priorityContainer}>
        <Text style={styles.sectionLabel}>Priority</Text>
        <View style={styles.priorityRow}>
          <Button
            mode={priority === 'normal' ? 'contained' : 'outlined'}
            onPress={() => setPriority('normal')}
            style={[styles.priorityButton, priority === 'normal' && styles.priorityButtonSelected]}
            labelStyle={priority === 'normal' ? styles.priorityLabelSelected : styles.priorityLabel}
            icon="bell-outline"
          >
            Normal
          </Button>
          <Button
            mode={priority === 'important' ? 'contained' : 'outlined'}
            onPress={() => setPriority('important')}
            style={[styles.priorityButton, priority === 'important' && styles.priorityButtonImportant]}
            labelStyle={priority === 'important' ? styles.priorityLabelSelected : styles.priorityLabel}
            icon="alert"
          >
            Important
          </Button>
        </View>
        <Text style={styles.priorityHint}>
          {priority === 'normal'
            ? 'Plays your selected regular reminder sound'
            : 'Plays your selected emergency alert sound'}
        </Text>
      </View>

      {/* Schedule Selection */}
      <View style={styles.scheduleContainer}>
        <Text style={styles.sectionLabel}>When to send</Text>
        <View style={styles.scheduleRow}>
          <Button
            mode={sendNow ? 'contained' : 'outlined'}
            onPress={() => setSendNow(true)}
            style={[styles.scheduleButton, sendNow && styles.scheduleButtonSelected]}
            labelStyle={sendNow ? styles.priorityLabelSelected : styles.priorityLabel}
            icon="send"
          >
            Send Now
          </Button>
          <Button
            mode={!sendNow ? 'contained' : 'outlined'}
            onPress={() => { setSendNow(false); setShowCalendar(true); }}
            style={[styles.scheduleButton, !sendNow && styles.scheduleButtonSelected]}
            labelStyle={!sendNow ? styles.priorityLabelSelected : styles.priorityLabel}
            icon="clock-outline"
          >
            Schedule
          </Button>
        </View>
        {!sendNow && (
          <View style={styles.schedulerContainer}>
            {/* Selected date/time display */}
            <Pressable
              style={styles.dateTimeDisplay}
              onPress={() => setShowCalendar(!showCalendar)}
            >
              <Text style={styles.dateTimeText}>{formatScheduledDateTime()}</Text>
              <Text style={styles.dateTimeEdit}>Tap to {showCalendar ? 'hide' : 'edit'}</Text>
            </Pressable>

            {showCalendar && (
              <>
                {/* Calendar */}
                <View style={styles.calendarContainer}>
                  <View style={styles.calendarHeader}>
                    <Pressable
                      onPress={() => setScheduledDate(new Date(scheduledDate.getFullYear(), scheduledDate.getMonth() - 1, 1))}
                      style={styles.calendarNav}
                    >
                      <Text style={styles.calendarNavText}>◀</Text>
                    </Pressable>
                    <Text style={styles.calendarMonthYear}>
                      {scheduledDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </Text>
                    <Pressable
                      onPress={() => setScheduledDate(new Date(scheduledDate.getFullYear(), scheduledDate.getMonth() + 1, 1))}
                      style={styles.calendarNav}
                    >
                      <Text style={styles.calendarNavText}>▶</Text>
                    </Pressable>
                  </View>
                  <View style={styles.calendarWeekdays}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <Text key={day} style={styles.calendarWeekday}>{day}</Text>
                    ))}
                  </View>
                  <View style={styles.calendarDays}>
                    {generateCalendarDays().map((day, index) => {
                      const isSelected = day === scheduledDate.getDate();
                      const isToday = day === new Date().getDate() &&
                        scheduledDate.getMonth() === new Date().getMonth() &&
                        scheduledDate.getFullYear() === new Date().getFullYear();
                      return (
                        <Pressable
                          key={index}
                          style={[
                            styles.calendarDay,
                            isSelected && styles.calendarDaySelected,
                            isToday && !isSelected && styles.calendarDayToday,
                          ]}
                          onPress={() => {
                            if (day) {
                              const newDate = new Date(scheduledDate);
                              newDate.setDate(day);
                              setScheduledDate(newDate);
                            }
                          }}
                          disabled={!day}
                        >
                          <Text style={[
                            styles.calendarDayText,
                            isSelected && styles.calendarDayTextSelected,
                          ]}>
                            {day || ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Compact Time Picker */}
                <View style={styles.timePickerContainer}>
                  <Text style={styles.timePickerLabel}>Select Time</Text>
                  <View style={styles.timePickerRow}>
                    {/* Hour - horizontal row */}
                    <View style={styles.timePickerSection}>
                      <Text style={styles.timePickerColumnLabel}>Hour</Text>
                      <View style={styles.timeOptionsRow}>
                        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((hour) => (
                          <Pressable
                            key={hour}
                            style={[styles.timeOptionCompact, scheduledHour === hour && styles.timeOptionSelected]}
                            onPress={() => setScheduledHour(hour)}
                          >
                            <Text style={[styles.timeOptionTextCompact, scheduledHour === hour && styles.timeOptionTextSelected]}>
                              {hour}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    {/* Minute - horizontal row */}
                    <View style={styles.timePickerSection}>
                      <Text style={styles.timePickerColumnLabel}>Minute</Text>
                      <View style={styles.timeOptionsRow}>
                        {[0, 15, 30, 45].map((minute) => (
                          <Pressable
                            key={minute}
                            style={[styles.timeOptionCompact, scheduledMinute === minute && styles.timeOptionSelected]}
                            onPress={() => setScheduledMinute(minute)}
                          >
                            <Text style={[styles.timeOptionTextCompact, scheduledMinute === minute && styles.timeOptionTextSelected]}>
                              {minute.toString().padStart(2, '0')}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    {/* AM/PM - inline */}
                    <View style={styles.timePickerSection}>
                      <Text style={styles.timePickerColumnLabel}>AM/PM</Text>
                      <View style={styles.amPmRow}>
                        <Pressable
                          style={[styles.amPmOptionCompact, scheduledAmPm === 'AM' && styles.amPmOptionSelected]}
                          onPress={() => setScheduledAmPm('AM')}
                        >
                          <Text style={[styles.amPmTextCompact, scheduledAmPm === 'AM' && styles.amPmTextSelected]}>AM</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.amPmOptionCompact, scheduledAmPm === 'PM' && styles.amPmOptionSelected]}
                          onPress={() => setScheduledAmPm('PM')}
                        >
                          <Text style={[styles.amPmTextCompact, scheduledAmPm === 'PM' && styles.amPmTextSelected]}>PM</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              </>
            )}

            <Text style={styles.timezoneHint}>Pacific Standard Time (PST)</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        {activeTab === 'video' ? (
          <>
            <Text style={styles.stepLabel}>Step 1 — Record your video</Text>
            <Text style={styles.stepHint}>
              Your face will appear on {elderlyName ?? 'their'}'s screen when this reminder plays.
            </Text>

            <VideoRecorder onRecordingComplete={handleRecordingComplete} />

            {videoUri && (
              <>
                <View style={styles.divider} />
                <Text style={styles.stepLabel}>Step 2 — Add a title</Text>
                <TextInput
                  label="Reminder title (e.g. Take morning pills)"
                  value={title}
                  onChangeText={setTitle}
                  mode="outlined"
                  style={styles.input}
                  maxLength={120}
                />

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {uploading ? (
                  <View style={styles.uploadingRow}>
                    <ActivityIndicator />
                    <Text style={styles.uploadingText}>Uploading to {elderlyName ?? 'care recipient'}...</Text>
                  </View>
                ) : uploaded ? (
                  <View style={styles.successBox}>
                    <Text style={styles.successText}>
                      Video reminder sent to {elderlyName}!
                    </Text>
                  </View>
                ) : (
                  <Button
                    mode="contained"
                    onPress={handlePublishVideo}
                    style={styles.publishBtn}
                    icon="send"
                    contentStyle={styles.publishContent}
                  >
                    Send Video Reminder
                  </Button>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <Text style={styles.stepLabel}>Type your message</Text>
            <Text style={styles.stepHint}>
              This message will be spoken in your cloned voice to {elderlyName ?? 'your care recipient'}.
            </Text>

            <TextInput
              label="Voice message"
              value={voiceMessage}
              onChangeText={setVoiceMessage}
              mode="outlined"
              style={styles.input}
              multiline
              numberOfLines={4}
              placeholder="e.g. Hi grandma! It's time to take your morning medication."
            />

            {/* Language Settings */}
            <View style={styles.languageSection}>
              <Text style={styles.sectionLabel}>Input Language</Text>
              <Text style={styles.languageHint}>Language you're typing in</Text>
              <View style={styles.languageRow}>
                {LANGUAGES.slice(0, 5).map((lang) => (
                  <Button
                    key={lang.code}
                    mode={sourceLanguage === lang.code ? 'contained' : 'outlined'}
                    onPress={() => setSourceLanguage(lang.code)}
                    style={[styles.languageButton, sourceLanguage === lang.code && styles.languageButtonSelected]}
                    labelStyle={sourceLanguage === lang.code ? styles.languageButtonLabelSelected : styles.languageButtonLabel}
                    compact
                  >
                    {lang.label}
                  </Button>
                ))}
              </View>
              <View style={styles.languageRow}>
                {LANGUAGES.slice(5).map((lang) => (
                  <Button
                    key={lang.code}
                    mode={sourceLanguage === lang.code ? 'contained' : 'outlined'}
                    onPress={() => setSourceLanguage(lang.code)}
                    style={[styles.languageButton, sourceLanguage === lang.code && styles.languageButtonSelected]}
                    labelStyle={sourceLanguage === lang.code ? styles.languageButtonLabelSelected : styles.languageButtonLabel}
                    compact
                  >
                    {lang.label}
                  </Button>
                ))}
              </View>

              {/* Translation toggle */}
              <View style={styles.translationToggle}>
                <Button
                  mode={useTranslation ? 'contained' : 'outlined'}
                  onPress={() => setUseTranslation(!useTranslation)}
                  style={[styles.translationButton, useTranslation && styles.translationButtonActive]}
                  icon={useTranslation ? 'check' : 'translate'}
                >
                  {useTranslation ? 'Translation ON' : 'Translate to different language?'}
                </Button>
              </View>

              {useTranslation && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Output Language</Text>
                  <Text style={styles.languageHint}>Language the elder will hear</Text>
                  <View style={styles.languageRow}>
                    {LANGUAGES.slice(0, 5).map((lang) => (
                      <Button
                        key={lang.code}
                        mode={targetLanguage === lang.code ? 'contained' : 'outlined'}
                        onPress={() => setTargetLanguage(lang.code)}
                        style={[styles.languageButton, targetLanguage === lang.code && styles.outputLanguageSelected]}
                        labelStyle={targetLanguage === lang.code ? styles.languageButtonLabelSelected : styles.languageButtonLabel}
                        compact
                      >
                        {lang.label}
                      </Button>
                    ))}
                  </View>
                  <View style={styles.languageRow}>
                    {LANGUAGES.slice(5).map((lang) => (
                      <Button
                        key={lang.code}
                        mode={targetLanguage === lang.code ? 'contained' : 'outlined'}
                        onPress={() => setTargetLanguage(lang.code)}
                        style={[styles.languageButton, targetLanguage === lang.code && styles.outputLanguageSelected]}
                        labelStyle={targetLanguage === lang.code ? styles.languageButtonLabelSelected : styles.languageButtonLabel}
                        compact
                      >
                        {lang.label}
                      </Button>
                    ))}
                  </View>
                  <Text style={styles.translationNote}>
                    Your message will be translated from {LANGUAGES.find(l => l.code === sourceLanguage)?.label} to {LANGUAGES.find(l => l.code === targetLanguage)?.label} using Google Translate, then spoken in your cloned voice.
                  </Text>
                </>
              )}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {uploading ? (
              <View style={styles.uploadingRow}>
                <ActivityIndicator />
                <Text style={styles.uploadingText}>Creating voice reminder...</Text>
              </View>
            ) : uploaded ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>
                  Voice reminder sent to {elderlyName}!
                </Text>
              </View>
            ) : (
              <Button
                mode="contained"
                onPress={handlePublishVoice}
                style={styles.publishBtn}
                icon="send"
                contentStyle={styles.publishContent}
                disabled={!voiceMessage.trim()}
              >
                Send Voice Reminder
              </Button>
            )}
          </>
        )}
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#EBF5F5',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#EBF5F5',
  },
  scrollContent: {
    paddingBottom: 150,
    backgroundColor: '#EBF5F5',
  },
  header: {
    backgroundColor: '#1B3A6B',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerFor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3DBDA7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerLabel: {
    fontSize: 12,
    color: '#A0C4C4',
    marginBottom: 2,
  },
  headerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  tabContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  tabs: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  body: {
    padding: 20,
    gap: 12,
  },
  stepLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B3A6B',
    marginBottom: 4,
  },
  stepHint: {
    fontSize: 13,
    color: '#7A9A9A',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#D0E8E8',
    marginVertical: 16,
  },
  input: {
    backgroundColor: '#FFFFFF',
  },
  publishBtn: {
    borderRadius: 10,
    backgroundColor: '#1B3A6B',
    marginTop: 8,
  },
  publishContent: {
    height: 52,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  uploadingText: {
    fontSize: 14,
    color: '#1B3A6B',
  },
  successBox: {
    backgroundColor: '#E6F7F4',
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3DBDA7',
  },
  successText: {
    color: '#1B6B5A',
    fontWeight: '700',
    fontSize: 15,
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
    marginTop: 4,
  },
  priorityContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B3A6B',
    marginBottom: 8,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 12,
  },
  priorityButton: {
    flex: 1,
    borderColor: '#1B3A6B',
    borderWidth: 2,
  },
  priorityButtonSelected: {
    backgroundColor: '#3DBDA7',
    borderColor: '#3DBDA7',
  },
  priorityButtonImportant: {
    backgroundColor: '#E53935',
    borderColor: '#E53935',
  },
  priorityLabel: {
    color: '#1B3A6B',
  },
  priorityLabelSelected: {
    color: '#FFFFFF',
  },
  priorityHint: {
    fontSize: 12,
    color: '#7A9A9A',
    marginTop: 8,
    fontStyle: 'italic',
  },
  scheduleContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  scheduleButton: {
    flex: 1,
    borderColor: '#1B3A6B',
    borderWidth: 2,
  },
  scheduleButtonSelected: {
    backgroundColor: '#1B3A6B',
    borderColor: '#1B3A6B',
  },
  schedulerContainer: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D0E8E8',
  },
  dateTimeDisplay: {
    backgroundColor: '#1B3A6B',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  dateTimeText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  dateTimeEdit: {
    fontSize: 11,
    color: '#A0C4C4',
    marginTop: 2,
  },
  calendarContainer: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#D0E8E8',
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#F8FAFA',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  calendarNav: {
    padding: 4,
  },
  calendarNavText: {
    fontSize: 14,
    color: '#1B3A6B',
  },
  calendarMonthYear: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1B3A6B',
  },
  calendarWeekdays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  calendarWeekday: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7A9A9A',
    width: 28,
    textAlign: 'center',
  },
  calendarDays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDaySelected: {
    backgroundColor: '#3DBDA7',
    borderRadius: 14,
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: '#1B3A6B',
    borderRadius: 14,
  },
  calendarDayText: {
    fontSize: 12,
    color: '#1B3A6B',
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  timePickerContainer: {
    marginTop: 12,
  },
  timePickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1B3A6B',
    marginBottom: 8,
  },
  timePickerRow: {
    gap: 8,
  },
  timePickerSection: {
    marginBottom: 8,
  },
  timePickerColumnLabel: {
    fontSize: 11,
    color: '#7A9A9A',
    marginBottom: 4,
  },
  timeOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  timeOptionCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    minWidth: 36,
  },
  timeOptionSelected: {
    backgroundColor: '#1B3A6B',
  },
  timeOptionTextCompact: {
    fontSize: 13,
    color: '#1B3A6B',
  },
  timeOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  amPmRow: {
    flexDirection: 'row',
    gap: 8,
  },
  amPmOptionCompact: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  amPmOptionSelected: {
    backgroundColor: '#3DBDA7',
  },
  amPmTextCompact: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1B3A6B',
  },
  amPmTextSelected: {
    color: '#FFFFFF',
  },
  timezoneHint: {
    fontSize: 11,
    color: '#7A9A9A',
    marginTop: 12,
    textAlign: 'center',
  },
  languageSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D0E8E8',
  },
  languageHint: {
    fontSize: 12,
    color: '#7A9A9A',
    marginBottom: 8,
  },
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  languageButton: {
    borderColor: '#1B3A6B',
    borderWidth: 1,
    minWidth: 70,
  },
  languageButtonSelected: {
    backgroundColor: '#1B3A6B',
    borderColor: '#1B3A6B',
  },
  outputLanguageSelected: {
    backgroundColor: '#3DBDA7',
    borderColor: '#3DBDA7',
  },
  languageButtonLabel: {
    fontSize: 11,
    color: '#1B3A6B',
  },
  languageButtonLabelSelected: {
    fontSize: 11,
    color: '#FFFFFF',
  },
  translationToggle: {
    marginTop: 12,
  },
  translationButton: {
    borderColor: '#3DBDA7',
    borderWidth: 2,
  },
  translationButtonActive: {
    backgroundColor: '#3DBDA7',
    borderColor: '#3DBDA7',
  },
  translationNote: {
    marginTop: 12,
    fontSize: 12,
    color: '#1B3A6B',
    backgroundColor: '#EBF5F5',
    padding: 12,
    borderRadius: 8,
    fontStyle: 'italic',
  },
});
