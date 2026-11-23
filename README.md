# Smart Medicine Dispenser - Mobile Application

A cross-platform mobile application developed with React Native and Expo for managing and synchronizing a multi-compartment Smart Medicine Dispenser hardware unit over local Wi-Fi.

This is a freelance project developed in collaboration with Bryan Batan (GitHub: https://github.com/brybry20).

Companion Microcontroller Firmware Repository:
https://github.com/gericandmorty/SmartMedicineDispenser-MicroController

---

## Project Overview

The Smart Medicine Dispenser mobile application provides patients and caregivers with an intuitive interface to schedule medication doses, track adherence, monitor compartment stock levels, and coordinate physical alert mechanisms with the dispenser hardware.

The dispenser hardware features two physical drawers, each containing 21 compartment slots (labeled Columns A through G, Rows 1 through 3), supporting up to 42 individual medication compartments. The mobile application coordinates with an ESP32-Mini master microcontroller and two ESP8266/ESP32 drawer controllers via local Wi-Fi REST APIs.

---

## Core Requirements and Implemented Features

### 1. Wi-Fi REST Network Communication
* Communicates directly with microcontroller endpoints over standard local HTTP/REST rather than Bluetooth.
* Supports automatic mDNS resolution (dispenser.local) and user-configurable static IP addresses in the Settings screen.
* Implements client-side epoch time synchronization to calibrate microcontroller real-time clocks during schedule creation.
* Protected by network timeout handlers (AbortController) to maintain a fluid user experience even during network drops.

### 2. Schedule Management and Time Selection
* Half-screen modal bottom sheet interface for setting medication times and recurrence.
* 12-hour time picker (Hour, Minute, AM/PM) engineered specifically for medical adherence without irrelevant seconds.
* Flexible scheduling options: Daily recurring, Today only, Tomorrow only, or Custom calendar date.
* Duplicate slot conflict prevention ensuring only one active medication schedule occupies a physical compartment at a time.

### 3. 5-Minute Alert Window and Grace Period State Machine
* Mathematical countdown calculation based on absolute target epoch timestamps: (targetEpoch + 300s) - currentEpoch.
* Maintains strict countdown integrity across device reboots, screen locks, and app force-closes.
* Handles midnight date rollover scenarios (e.g., a dose due at 11:58 PM expires at 12:03 AM).
* Synchronizes dose resolution states (Upcoming, Alerting, Taken, Taken Manual, Missed) with hardware sensor logs.

### 4. One Medicine per Cell
* Every new schedule records one medicine in each selected compartment.
* The app shows taken and missed states on cells without quantity counters.
* The drawer restock prompt appears after every saved cell in that drawer is taken.

### 5. Persistent Relational Database (SQLite)
* Local SQLite database engine powered by expo-sqlite (smart_dispenser.db).
* Three relational tables:
  * reminders: Stores active schedule metadata, compartment labels, slot indices, time rules, and sync statuses.
  * dose_history: Stores historical records of dose resolutions (TAKEN, MISSED, TAKEN_MANUAL) and response elapsed times.
  * column_refills: Tracks the baseline refill timestamps per drawer column.
* Fully persistent across application upgrades, device reboots, and compiled production APK installations.

### 6. Compartment Detail Modal and Dispenser Grid
* Interactive dispenser visualizer mapping physical slots across Drawer 1 (slots 0 to 20) and Drawer 2 (slots 21 to 41).
* Rich compartment modal displaying current schedule, dosage adherence percentage, and stock level progress bars.
* Saved compartment details offer Remove; new schedules are added from empty cells.

### 7. Notification and Hardware Watchdog Integration
* High-importance local notification channels on Android with custom vibration alert patterns.
* Live background and foreground watchdog matching target schedule times to fire hardware alert buzzers and vibration motors on the ESP32-Mini.

---

## Technical Stack

* Framework: React Native (0.86.3) with Expo SDK 57
* Routing: Expo Router (file-based navigation)
* Language: TypeScript (6.0.3)
* Database: expo-sqlite (SQLite 3 relational engine)
* Configuration Storage: @react-native-async-storage/async-storage
* UI and Animations: React Native Animated API, Reanimated, Gesture Handler
* Testing: Node.js Native Test Runner with --experimental-strip-types

---

## Project Structure

```
mobile/
|-- assets/                  # Icons, splash images, and application branding
|-- src/
|   |-- app/                 # Expo Router file-based screens
|   |   |-- (tabs)/          # Bottom navigation tabs
|   |   |   |-- index.tsx    # Home screen: Dispenser cabinet grid and schedules
|   |   |   |-- history.tsx  # Intake history and adherence log
|   |   |   `-- settings.tsx # Hardware IP configuration, testing and diagnostics
|   |   `-- _layout.tsx      # Root application layout and theme provider
|   |-- components/          # Reusable UI components
|   |   |-- CompartmentDetailModal.tsx   # Detailed compartment view and actions
|   |   |-- DispenserView.tsx            # Visual cabinet grid for Drawers 1 and 2
|   |   `-- SetScheduleBottomSheet.tsx   # Bottom sheet time and recurrence picker
|   |-- constants/           # Color palettes, theme tokens, and typography
|   |-- hooks/               # Custom React hooks (useReminders, useHardware)
|   |-- services/            # Business logic and external communication
|   |   |-- esp32MiniClient.ts   # ESP32-Mini master REST client
|   |   |-- hardware.ts          # Network dispatching to master and drawer units
|   |   |-- medicationLogic.ts   # State machine, time conversion and stock logic
|   |   |-- notifications.ts     # Local push notification scheduling
|   |   |-- sqliteStorage.ts     # SQLite database migrations and queries
|   |   `-- storage.ts           # Storage abstraction layer
|   `-- types/               # TypeScript type definitions and interfaces
`-- tests/                   # Automated verification test suites
    |-- medicationLogic.test.ts # 22 automated test cases verifying core logic
    `-- simulatePhasedOut.ts    # 7-day intake simulation script
```

---

## Hardware Communication Protocol

The dispenser firmware runs on an ESP32-Mini master and dedicated drawer LED controllers. The microcontroller source code is maintained in:
https://github.com/gericandmorty/SmartMedicineDispenser-MicroController

The mobile application communicates with the hardware modules using HTTP GET and POST requests over the shared Wi-Fi network:

### ESP32-Mini (Master Controller)
* GET /ping: Connection verification and latency test.
* GET /status: Queries current dispenser state, active alert status, and RTC time.
* GET /set-schedule?id={id}&hour={h}&minute={m}&amPm={amPm}&slotIndex={idx}&client_epoch={epoch}: Saves schedule and syncs clock drift.
* GET /delete-schedule?id={id}: Removes a schedule from NVS flash memory.
* GET /vibrate?duration={ms}&pulses={n}: Triggers manual vibration motor alert test.
* GET /dispense?slotIndex={idx}: Triggers drawer unlock and dispense sequence.
* GET /events: Retrieves past dose adherence logs recorded by the hardware.

### ESP1 and ESP2 (Drawer LED Controllers)
* GET /status: Reports drawer status and LED mapping health.
* GET /led?slot={idx}&color={green|red|amber|off}: Sets individual compartment LED state.
* GET /alert?slot={idx}: Initiates pulsing amber alert animation for the scheduled compartment.
* GET /clear-alert: Returns all compartment LEDs to their default status colors.

---

## Getting Started

### Prerequisites
* Node.js (version 20 or higher recommended)
* Bun 1.4.4 (used locally and by EAS Build)
* Android Studio (for Android Emulator) or Expo Go on a physical device connected to the same Wi-Fi network as the hardware.

### Installation

1. Navigate to the mobile directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   bun install --frozen-lockfile
   ```

### Running the Development Server

1. Start the Expo development server:
   ```bash
   bun run start
   ```

2. Open the application:
   * Press `a` in the terminal to open the Android emulator.
   * Press `w` to open in a web browser.
   * Scan the terminal QR code using Expo Go on a physical Android or iOS device.

### Running Automated Tests

Run the verification test suite covering time conversions, 5-minute countdowns, midnight rollovers, and weekly stock calculations:

```bash
bun run test
```

To run the full 7-day pill depletion simulation:

```bash
node --experimental-strip-types tests/simulatePhasedOut.ts
```

---

## Collaborators and Credits

* Freelance Project Development
* Collaboration with Bryan Batan (GitHub: https://github.com/brybry20)
* Microcontroller Firmware Repository: https://github.com/gericandmorty/SmartMedicineDispenser-MicroController


### Android APK builds

Keep `bun.lock` committed and included in the build upload. This project uses Bun;
do not generate `package-lock.json` or other package manager lockfiles alongside it.

From the mobile project directory:

```bash
bunx eas-cli@latest build --platform android --profile preview --clear-cache
```

## App drawer warnings and concurrent medicine alerts

The app polls Arduino `/status` every two seconds while foregrounded. The app-side
sensor contract is `drawer1_open: boolean` and `drawer2_open: boolean` (true means
physically open). **The firmware currently in this workspace does not expose these
fields yet.** No firmware was changed in this app-only implementation. Until those
fields are provided, the app displays “status unavailable”, never a guessed closed
state. Lock/unlock commands and LED activity are not physical door readings.

Each open drawer shows an in-app warning and, if notification permission is already
granted, a local notification. After 60 seconds of continuously observed open state,
a second notification asks the user to close it. Closing clears the warning and
resets the timer. Missing readings, disconnects, and backgrounding reset observation;
returning to the app starts fresh checks. Live door monitoring does not run while
the app is suspended or killed. Scheduled medicine notifications still operate as
before. Door activity alone never confirms intake in the app.

Concurrent due doses are queued without duplicates in one modal with selectable
compartment tabs and a pending count. Confirming or dismissing one keeps the other
pending doses. Dismissal does not send a hardware confirmation or record intake.
The current hardware stop endpoint confirms globally, so the app sends it only
when no other due dose remains pending. Manual confirmation records TAKEN_MANUAL; matching hardware events record TAKEN.
When a later dose becomes due, an earlier unconfirmed dose is recorded as missed
and shown as its own card above the new alarm. For example, an untaken A1 dose
due at 12:05 is marked missed when A2 starts alarming at 12:06. The A1 card
remains in the missed-dose review after A2 is taken until the user acknowledges A1. The review can be closed and reopened. If no later
dose arrives, the dose is marked missed at its own five-minute deadline.
Acknowledgements persist across app restarts. Dismissed active occurrences are
not repeatedly presented during the same foreground session.

Settings includes a testing control to clear saved schedules, dose history,
refill baselines, and medicine notifications from the phone. It also requests
deletion of synced schedules from the dispenser.

Taken compartment indicators are orange (#F97316), with a TAKEN label. The schedule
badge and compartment-detail indicator also show orange. Stock warnings remain
separate (including EMPTY for a taken final dose). Recurring schedules use the
current occurrence's history, so yesterday's pickup does not color today's dose.

Validation: `bun run test`, `bunx tsc --noEmit`, `bunx eslint src --no-cache`.
Bench checks after the firmware sensor fields are available: open each drawer and
both together, keep them open for a minute, close/reopen, disconnect Wi-Fi, and
background/resume. Schedule concurrent doses in both drawers, switch between them,
confirm one, and verify the other remains pending and only the confirmed indicator
turns orange. Verify these flows on a physical device; unit tests do not validate
native modal layout, notification delivery, or reed switches.

When every due dose in one drawer is recorded as taken, the foreground app sends
one local completion notification for that drawer on that date (when notification
permission is granted). Drawer 1 and Drawer 2 complete independently.

### Cabinet closure warning

Saved compartment details allow deletion only; schedule entry starts from empty cells.
The foreground app displays a button-free cabinet warning from the Arduino's
`cabinet_close_required` status. Back, outside taps, and swipe cannot dismiss it.
Only fresh `drawer1_open: false` and `drawer2_open: false` readings clear it;
a lost connection does not count as closure. Requires the updated Arduino sketch.

### One medicine on a specific date

Choose **One Medicine**, select a drawer and exactly one compartment, then set
its time and **Today**, **Tomorrow**, or **Choose date**. New schedules default
to Today and run only once on that date. Daily remains an explicit option.
Changing the compartment replaces the single selection. An empty selection
cannot be saved, and conflicts appear in the form without discarding the draft.
The same compartment may have different one-time schedules on different dates.

### Stock on compartment cells

Each cell represents one medicine. A full 21-cell drawer
turns gray after every medicine is taken. Saved cells remain tappable for details and deletion. The app uses dose history and the saved drawer refill time to update cell colors.

### Add Medicine quantity and schedule modes

The schedule form separates **One-time medicine** from **Fixed schedule**.
One-time medicine has a single compartment, date, and time. Its quantity is
automatically 1, with no quantity field. Fixed schedule shows recurring daily
options and can cover one compartment or a bulk group.

## Taken drawer and missed medicine

Every new schedule saves quantity **1** automatically. Taken cells stay orange until every scheduled medicine in their drawer is
taken; then the drawer's scheduled cells turn gray. A missed medicine keeps its
review visible and suppresses later in-app dose alerts and scheduled local
medicine notifications while the app is connected. Reviewing the final missed
medicine restores scheduled notifications and clears Arduino's missed latch.

## Drawer restocking after all medicine is taken

When every saved cell in a drawer is taken, those cells turn gray and its header reads `0/21 · Add Medicine`. Unused slots do not block restocking.
An **Add Medicine** button appears beside that drawer. Tapping it opens the
restock modal, stops the all-meds-taken buzzer, and unlocks the selected drawer for a quiet refill. The drawer must be
pulled open by hand. The restock modal highlights saved cells needing medicine and lists their saved times. Each listed schedule can have its time edited in the modal.
After physically refilling the saved compartments and closing both drawers so
the reed switches confirm closure, tap “Okay — stock added.” The app records a drawer refill time, relocks the solenoid,
and refreshes the saved cells to green. The refill
time also handles a last dose and refill on the same day. The app needs a live
hardware connection to unlock the drawer.
