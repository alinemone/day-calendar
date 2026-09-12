# Verification — version 1.4.0

- All 10 unit tests pass: calendar accuracy, timezone and round trips, persistence, alarms, daily inclusive duration, weekly unlimited recurrence, single exceptions and sparse reminders.
- Existing real MV3 browser regression passes, including Vazirmatn, local persistence, conversion, notifications, and 300px overflow check.
- Recurrence browser test passes: 30 consecutive days, weekly selected days without end, single/all edit and deletion, 360px overflow check.
- With the extension UI closed, a real Chrome alarm invokes the notification API, persists delivery and schedules the next occurrence. Test accelerates the worker clock; OS banner visibility is not asserted.
- Only the next series occurrence gets an alarm. Upcoming UI previews up to 30 future occurrences per series. Closing Chrome delays delivery until it runs again; an overdue series delivers one pending occurrence before advancing.
- Local user records preserved. No cloud or OAuth permissions.
