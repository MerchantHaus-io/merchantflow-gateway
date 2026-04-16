

# Give Atria Autonomous Avatar Control

## What changes
Atria's avatar in the Office Simulator currently wanders randomly between zones and her desk. This upgrade makes her behavior **context-aware and reactive** — she responds to chat activity, visits users who message her, uses interaction points purposefully, and exhibits personality.

## Behavior model

Atria will have a priority-based behavior queue:

| Priority | Trigger | Behavior |
|----------|---------|----------|
| 1 (highest) | User sends message in `atria-ai` channel | Walk to that user's desk, face them, idle for a few seconds, then resume |
| 2 | AI is "thinking" (response pending) | Walk to the whiteboard, face it, play typing animation |
| 3 | Idle > 30s | Get coffee (walk to coffee machine, pause 4s, return) |
| 4 | Idle > 60s | Visit a random team member's desk and idle briefly |
| 5 (default) | No triggers | Current wander behavior (walk between zones, sit at desk) |

When Atria arrives at a user's desk after a chat message, a small speech bubble will briefly appear above her head with "..." or a truncated snippet of her response.

## Technical approach

### File: `src/components/chat/OfficeChat.tsx`

1. **Extend `NPCWanderState`** with new states: `"walking_to_user"`, `"at_whiteboard"`, `"getting_coffee"`, `"visiting"`
2. **Add `AtriaIntent` interface** tracking: target email, reason, and callback
3. **Add intent queue** (`atriaIntentQueue`) to the state ref — the animation loop checks this each frame
4. **New function `queueAtriaIntent()`** — pushes behavior onto the queue with priority sorting
5. **Modify the Atria block** in the NPC movement section (lines ~1322-1370) to check the intent queue before falling back to random wander
6. **Speech bubble**: Add a small canvas-rendered text sprite above Atria's head that fades in/out when she arrives at a destination

### File: `src/components/AtriaFAB.tsx`

7. **Dispatch custom event** `"atriaIntent"` when the user sends a message, carrying `{ targetEmail: user.email, reason: "chat" }` — the OfficeChat listens for this and queues Atria walking to the sender's desk

### Interaction point usage

- **Whiteboard**: Atria walks there when "thinking" — plays a subtle arm-raise animation
- **Coffee machine**: Atria visits during long idle periods — pauses 4s, then picks a new target
- **Team desks**: Atria occasionally visits a random online team member's desk and idles

### Speech bubble implementation

A `THREE.Sprite` with a dynamically generated canvas texture:
- White rounded rect background, dark text
- Shows "..." while thinking, then first ~30 chars of response
- Fades out after 3 seconds
- Positioned at `y: 2.2` above Atria's mesh

## Files modified
- `src/components/chat/OfficeChat.tsx` — Enhanced Atria NPC logic, speech bubble sprite, intent queue
- `src/components/AtriaFAB.tsx` — Dispatch `atriaIntent` event on message send

