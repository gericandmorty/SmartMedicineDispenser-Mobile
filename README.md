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

### 3. 20-Minute Alert Window and Grace Period State Machine
* Mathematical countdown calculation based on absolute target epoch timestamps: (targetEpoch + 1200s) - currentEpoch.
* Maintains strict countdown integrity across device reboots, screen locks, and app force-closes.
* Handles midnight date rollover scenarios seamlessly (e.g., transitions from 11:55 PM to 12:15 AM).
* Synchronizes dose resolution states (Upcoming, Alerting, Taken, Taken Manual, Missed) with hardware sensor logs.

### 4. Schedule-Based Weekly Column Stock Tracking
* Tracks medication depletion across columns (A through G) for both drawers based on scheduled intake cycles.
* 7-day intake cycle calculation without requiring complex IR break-beam sensors in every individual slot.
* Adherence thresholds:
  * In Stock: 3 to 7 doses remaining.
  * Low Stock: 1 to 2 doses remaining.
  * Out of Stock: 0 doses remaining (compartment turns high-contrast crimson with alert badge).
* One-tap column refill action to reset the cycle baseline and restore full 7/7 dosage counts.

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
* Direct action controls: Dispense Now, Change Time, Remove Schedule, and Column Refill.

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
* npm (version 10 or higher)
* Android Studio (for Android Emulator) or Expo Go on a physical device connected to the same Wi-Fi network as the hardware.

### Installation

1. Navigate to the mobile directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Development Server

1. Start the Expo development server:
   ```bash
   npm start
   ```

2. Open the application:
   * Press `a` in the terminal to open the Android emulator.
   * Press `w` to open in a web browser.
   * Scan the terminal QR code using Expo Go on a physical Android or iOS device.

### Running Automated Tests

Run the verification test suite covering time conversions, 20-minute countdowns, midnight rollovers, and weekly stock calculations:

```bash
npm test
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
