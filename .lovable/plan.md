

# Add Notification Sound to All Real-Time Notifications

## Overview
Currently, notification sounds only play inside the **FloatingChat** component (for chat messages). The **NotificationBell**, **IncomingCallToast**, and **IncomingMessageToast** components all receive real-time events but play no audio. This plan adds a unified notification sound system across all real-time notification types.

## What Changes

### 1. Create a shared `useNotificationSound` hook
A lightweight, reusable hook (or utility function) that plays a short audio ping using the Web Audio API. This consolidates the duplicate sound logic currently in `useChatSounds.ts` and `useChatNotifications.ts` into one place. It will respect the user's existing `chatSoundEnabled` localStorage preference.

Three distinct tones will be available:
- **message** -- existing chat ping (800-1000 Hz sweep)
- **notification** -- slightly different tone for bell/task/stage notifications (600 Hz)
- **call** -- urgent ringtone pattern (two-note repeated beep for incoming calls)

### 2. NotificationBell -- play sound on new notification
In `src/components/NotificationBell.tsx`, when the realtime subscription fires an `INSERT` event for a new notification, play the **notification** sound. Only play if the popover is closed (user isn't already looking at notifications).

### 3. IncomingCallToast -- play ringtone sound
In `src/components/IncomingCallToast.tsx`, when a ringing incoming call is detected, play the **call** sound (a more urgent, repeating tone) that stops after 10 seconds or when the toast is dismissed.

### 4. IncomingMessageToast -- play message sound
In `src/components/IncomingMessageToast.tsx`, when a new chat or DM toast is shown, play the **message** sound. This covers users who don't have the FloatingChat open.

### 5. Deduplicate with FloatingChat
Add a guard so that if the FloatingChat already played a sound for a given message (user is viewing that conversation), the `IncomingMessageToast` skips its sound to avoid double-pinging. This will use a simple `Set` of recently-played message IDs shared via a custom event or ref.

## Technical Details

### New file: `src/hooks/useNotificationSound.ts`
- Exports `playNotificationSound(type: 'message' | 'notification' | 'call')`
- Uses Web Audio API oscillator (no external audio files needed)
- Checks `localStorage.getItem('chatSoundEnabled') !== 'false'` before playing
- For `call` type, returns a `stop()` function to cancel the repeating tone

### Modified files
| File | Change |
|------|--------|
| `src/hooks/useNotificationSound.ts` | New shared sound utility |
| `src/components/NotificationBell.tsx` | Import hook, play on INSERT event |
| `src/components/IncomingCallToast.tsx` | Play call ringtone on ringing status |
| `src/components/IncomingMessageToast.tsx` | Play message sound on new toast |

### No database changes required
All notification infrastructure (realtime subscriptions, notifications table) already exists.

