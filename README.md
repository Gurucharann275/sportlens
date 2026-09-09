# ⚡ SportLens: AI-Powered Biomechanical Talent Scouting Platform

<div align="center">

![SportLens Banner](https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=1200&auto=format&fit=crop&q=80)

**Democratizing grassroots athletic talent discovery across India through real-time single-shot smartphone computer vision and biomechanical kinetic analysis.**

[![Expo](https://img.shields.io/badge/Expo-SDK%2057-black?style=for-the-badge&logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React_Native-0.86.3-61DAFB?style=for-the-badge&logo=react)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![Sports Authority of India](https://img.shields.io/badge/SAI-Scouting_Compliant-22C55E?style=for-the-badge)](https://sportsauthorityofindia.nic.in)

</div>

---

## 🌟 Key Features

### 1. 🟢 Autonomous Full-Screen Biomechanical Vision Studio
- **14-Joint Biomechanical Kinetic HUD**: Instant full-body skeletal locking (4 limbs, torso, cranial targeting reticle, and 14 cyan pivot nodes).
- **Dual-Stroke Laser Optics**: High-contrast glowing neon green stick lines (`#22C55E` / `#00FF66`) with real-time angular telemetry (Hip Angle, Knee Depth, Spine/Torso posture).
- **Zero Special Hardware Required**: Performs single-shot kinetic evaluation using any standard smartphone camera.

### 2. 🇮🇳 10 Indian Vernacular Languages
- Full localization with dynamic instant language switcher:
  - **English**, **हिंदी (Hindi)**, **తెలుగు (Telugu)**, **தமிழ் (Tamil)**, **मराठी (Marathi)**, **বাংলা (Bengali)**, **ಕನ್ನಡ (Kannada)**, **ਪੰਜਾਬੀ (Punjabi)**, **ગુજરાતી (Gujarati)**, **ଓଡ଼ିଆ (Odia)**.
- Vernacular Voice Audio Coach prompts in real time during drills.

### 3. ⏱️ Indian Standard Time (IST - UTC+5:30) Daily Streak Engine
- Automatic calendar synchronization ensuring athletic practice streaks adhere to Indian calendar midnight boundaries without time-drift bugs.

### 4. 🛡️ Dual-Mode Platform: Athlete vs. SAI Scout / Recruiter Portal
- **Athlete Mode**: Gamified leveling (Grassroots Rookie $\rightarrow$ State Elite), drill logs, live audio coaching, FIFA/NBA-style Physical Passport Card.
- **SAI Scout & Recruiter Mode**:
  - Filter verified talent by State (28 States + 8 UTs), Sport, OVR rating, and Age.
  - Frame-by-frame 60 FPS video audit scrubber with 33-point biomechanics breakdown.
  - Direct 1-Tap Scouting Call-Up dispatch system.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18 or newer)
- npm or yarn
- Expo Go app on your [Android](https://play.google.com/store/apps/details?id=host.exp.exponent) or [iOS](https://apps.apple.com/app/expo-go/id982107779) device

### Installation & Run

```bash
# 1. Clone the repository
git clone https://github.com/Gurucharann275/sportlens.git

# 2. Enter project folder
cd sportlens

# 3. Install dependencies
npm install

# 4. Start the Expo development server
npx expo start
```

Scan the generated QR code with **Expo Go** on Android (or Camera on iOS) to immediately launch SportLens!

---

## 🏗️ Tech Stack

- **Framework**: [Expo SDK 57](https://expo.dev) + [React Native 0.86.3](https://reactnative.dev)
- **Language**: [TypeScript](https://www.typescriptlang.org)
- **Vision & Graphics**: `react-native-svg`, `expo-camera`, `expo-linear-gradient`
- **Audio & Haptics**: `expo-speech`, `expo-haptics`
- **Safe Area Management**: `react-native-safe-area-context`
- **State & Storage**: `@react-native-async-storage/async-storage`

---

## 📄 License
This project is licensed under the MIT License.
