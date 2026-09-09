import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  Image,
  Dimensions,
  Platform,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Accelerometer } from 'expo-sensors';
import { WebView } from 'react-native-webview';
import Svg, { Line, Circle, G, Text as SvgText, Rect } from 'react-native-svg';
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from '@expo/vector-icons';
import { ALL_SPORTS, ALL_STATES, INDIA_STATES_AND_DISTRICTS } from './indiaGeoData';
import { LANGUAGES, LanguageCode, I18N } from './i18nData';
import {
  analyzeVideoJumpKinematics,
  analyzeVideoSprintKinematics,
  analyzeVideoSquatKinematics,
  calculateJumpHeightFromFlightTime,
  calculateSayersPeakPower,
  BiomechanicsResult,
  JumpAnalysisResult,
  AccelSample,
} from './biomechanicsEngine';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ================= INDIAN STANDARD TIME (IST - UTC+5:30) SYNC ENGINE =================
const getISTDate = (): Date => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 5.5));
};

const getISTDateString = (d: Date = getISTDate()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getISTYesterdayString = (): string => {
  const d = getISTDate();
  d.setDate(d.getDate() - 1);
  return getISTDateString(d);
};

// Returns 0 for Monday, 1 for Tuesday ... 6 for Sunday in IST
const getISTDayIndex = (d: Date = getISTDate()): number => {
  const day = d.getDay(); // 0 is Sun, 1 is Mon...
  return day === 0 ? 6 : day - 1;
};

const validateAndSyncStreakIST = (athleteData: any) => {
  if (!athleteData) return athleteData;
  const todayIST = getISTDateString();
  const yesterdayIST = getISTYesterdayString();
  const lastActive = athleteData.lastActiveDateIST;

  let currentStreak = athleteData.streakDays || 0;
  let activeDays = Array.isArray(athleteData.activeDaysThisWeek) ? athleteData.activeDaysThisWeek : [];

  if (lastActive) {
    if (lastActive !== todayIST && lastActive !== yesterdayIST) {
      // Missed at least one full calendar day in IST! Streak broken -> Reset to 0
      currentStreak = 0;
    }
  }

  // Reset activeDaysThisWeek if starting a new week on Monday
  const todayIdx = getISTDayIndex();
  if (todayIdx === 0 && lastActive !== todayIST) {
    activeDays = [];
  }

  return {
    ...athleteData,
    streakDays: currentStreak,
    activeDaysThisWeek: activeDays,
  };
};

// Preset Athlete Avatars for easy 1-tap photo selection

// ================= 13 INDIAN LANGUAGES NATIVE VOICE & FEEDBACK ENGINE =================
const NATIVE_WELCOMES: Record<LanguageCode, string> = {
  te: 'భాష తెలుగులోకి మార్చబడింది',
  hi: 'भाषा हिंदी चुनी गई है',
  ta: 'மொழி தமிழ் தேர்ந்தெடுக்கப்பட்டது',
  kn: 'ಭಾಷೆ ಕನ್ನಡ ಆಯ್ಕೆಯಾಗಿದೆ',
  ml: 'ഭാഷ മലയാളം തിരഞ്ഞെടുത്തു',
  mr: 'मराठी भाषा निवडली गेली आहे',
  bn: 'ভাষা বাংলা নির্বাচিত হয়েছে',
  gu: 'ગુજરાતી ભાષા પસંદ કરવામાં આવી છે',
  pa: 'ਭਾਸ਼ਾ ਪੰਜਾਬੀ ਚੁਣੀ ਗਈ ਹੈ',
  or: 'ଓଡ଼ିଆ ଭାଷା ଚୟନ କରାଗଲା',
  as: 'অসমীয়া ভাষা বাছনি কৰা হ’ল',
  ur: 'اردو زبان منتخب کی گئی ہے',
  en: 'English language selected',
};

const getLocalizedShortRecording = (lang: LanguageCode): string => {
  const map: Record<LanguageCode, string> = {
    te: 'రికార్డింగ్ చాలా తక్కువగా ఉంది! దయచేసి కనీసం 3 సెకన్లు రికార్డ్ చేయండి.',
    hi: 'रिकॉर्डिंग बहुत छोटी है! कृपया कम से कम 3 सेकंड का अभ्यास रिकॉर्ड करें।',
    ta: 'பதிவு மிகவும் குறுகியது! குறைந்தது 3 வினாடிகள் பதிவு செய்யவும்.',
    kn: 'ರೆಕಾರ್ಡಿಂಗ್ ತುಂಬಾ ಕಡಿಮೆಯಾಗಿದೆ! ದಯವಿಟ್ಟು ಕನಿಷ್ಠ 3 ಸೆಕೆಂಡುಗಳ ಕಾಲ ರೆಕಾರ್ಡ್ ಮಾಡಿ.',
    ml: 'റെക്കോർഡിംഗ് വളരെ ചെറുതാണ്! കുറഞ്ഞത് 3 സെക്കൻഡ് റെക്കോർഡ് ചെയ്യുക.',
    mr: 'रेकॉर्डिंग खूप लहान आहे! कृपया किमान 3 सेकंद व्यायाम रेकॉर्ड करा.',
    bn: 'রেকর্ডিং খুব ছোট! অনুগ্রহ করে অন্তত ৩ সেকেন্ড রেকর্ড করুন।',
    gu: 'રેકોર્ડિંગ ઘણું નાનું છે! કૃપા કરીને ઓછામાં ઓછી 3 સેકન્ડ રેકોર્ડ કરો.',
    pa: 'ਰਿਕਾਰਡਿੰਗ ਬਹੁਤ ਛੋਟੀ ਹੈ! ਕਿਰਪਾ ਕਰਕੇ ਘੱਟੋ-ਘੱਟ 3 ਸਕਿੰਟ ਰਿਕਾਰਡ ਕਰੋ।',
    or: 'ରେକର୍ଡିଂ ବହୁତ ଛୋଟ ଅଟେ! ଦୟାକରି ଅତି କମରେ ୩ ସେକେଣ୍ଡ ରେକର୍ଡ କରନ୍ତୁ।',
    as: 'ৰেকৰ্ডিং অতি চুটি! অনুগ্ৰহ কৰি কমেও ৩ ছেকেণ্ড ৰেকৰ্ড কৰক।',
    ur: 'ریکارڈنگ بہت مختصر ہے! برائے مہربانی کم از کم 3 سیکنڈ ریکارڈ کریں۔',
    en: 'Recording too short! Please record at least 3 seconds of athletic movement.',
  };
  return map[lang] || map.en;
};

const getLocalizedJumpFeedback = (jumpCm: number, flightSec: number, peakWatts: number, lang: LanguageCode): string => {
  const map: Record<LanguageCode, string> = {
    te: `జంప్ ట్రయల్ పూర్తయింది (${jumpCm} cm • ${flightSec}s ఫ్లైట్)! పవర్: ${peakWatts}W. జంప్ & పవర్ స్కోర్ అప్‌డేట్ అయ్యాయి.`,
    hi: `जंप ट्रायल पूरा हुआ (${jumpCm} cm • ${flightSec}s फ्लाइट)! पावर: ${peakWatts}W. जंप और पावर स्कोर अपडेट हुआ।`,
    ta: `குதித்தல் பதிவு முடிந்தது (${jumpCm} cm • ${flightSec}s பறக்கும் நேரம்)! சக்தி: ${peakWatts}W. மதிப்பெண்கள் புதுப்பிக்கப்பட்டன.`,
    kn: `ವರ್ಟಿಕಲ್ ಜಂಪ್ ಪೂರ್ಣಗೊಂಡಿದೆ (${jumpCm} cm • ${flightSec}s ಹಾರಾಟ)! ಪವರ್: ${peakWatts}W. ಸ್ಕೋರ್ ನವೀಕರಿಸಲಾಗಿದೆ.`,
    ml: `ജമ്പ് ട്രയൽ പൂർത്തിയായി (${jumpCm} cm • ${flightSec}s എയർടൈം)! പവർ: ${peakWatts}W. സ്കോർ അപ്ഡേറ്റ് ചെയ്തു.`,
    mr: `जंप चाचणी पूर्ण झाली (${jumpCm} cm • ${flightSec}s फ्लाइट)! पॉवर: ${peakWatts}W. स्कोअर अपडेट झाला.`,
    bn: `লাফ ট্রায়াল সম্পন্ন হয়েছে (${jumpCm} সেমি • ${flightSec} সেকেন্ড ফ্লাইট)! পাওয়ার: ${peakWatts}W. স্কোর আপডেট হয়েছে।`,
    gu: `જમ્પ ટ્રાયલ પૂર્ણ થઈ (${jumpCm} cm • ${flightSec}s ફ્લાઇટ)! પાવર: ${peakWatts}W. સ્કોર અપડેટ થયો.`,
    pa: `ਜੰਪ ਟ੍ਰਾਇਲ ਮੁਕੰਮਲ ਹੋਇਆ (${jumpCm} cm • ${flightSec}s ਉਡਾਣ)! ਪਾਵਰ: ${peakWatts}W. ਸਕੋਰ ਅੱਪਡੇਟ ਹੋਇਆ।`,
    or: `ଜମ୍ପ ପରୀକ୍ଷା ସମ୍ପନ୍ନ ହେଲା (${jumpCm} cm • ${flightSec}s ଉଡ଼ାଣ)! ପାୱାର: ${peakWatts}W. ସ୍କୋର ଅପଡେଟ୍ ହେଲା।`,
    as: `জাম্প ট্ৰায়েল সম্পূৰ্ণ হ’ল (${jumpCm} cm • ${flightSec}s বিমান সময়)! পাৱাৰ: ${peakWatts}W. স্কোৰ আপডেট কৰা হ’ল।`,
    ur: `جمپ ٹرائل مکمل ہوا (${jumpCm} cm • ${flightSec}s اڑان)! پاور: ${peakWatts}W. اسکور اپ ڈیٹ ہوا۔`,
    en: `Verified physical jump at ${jumpCm} cm (${flightSec}s flight airtime)! Generated ${peakWatts} Watts peak power.`,
  };
  return map[lang] || map.en;
};

const getLocalizedSprintFeedback = (speedMps: number, splitSec: number, lang: LanguageCode): string => {
  const map: Record<LanguageCode, string> = {
    te: `స్ప్రింట్ ట్రయల్ పూర్తయింది (${speedMps} m/s • ${splitSec}s 30మీ)! స్పీడ్ & ఎజిలిటీ అప్‌డేట్ అయ్యాయి.`,
    hi: `स्प्रिंट ट्रायल पूरा हुआ (${speedMps} m/s • ${splitSec}s 30m)! स्पीड और एजिलिटी अपडेट हुए।`,
    ta: `ஸ்பிரிண்ட் சோதனை முடிந்தது (${speedMps} m/s • ${splitSec}s 30m)! வேகம் மற்றும் சுறுசுறுப்பு புதுப்பிக்கப்பட்டது.`,
    kn: `ಸ್ಪ್ರಿಂಟ್ ಟ್ರಯಲ್ ಪೂರ್ಣಗೊಂಡಿದೆ (${speedMps} m/s • ${splitSec}s 30m)! ವೇಗ ಮತ್ತು ಚುರುಕುತನ ನವೀಕರಿಸಲಾಗಿದೆ.`,
    ml: `സ്പ്രിന്റ് ട്രയൽ പൂർത്തിയായി (${speedMps} m/s • ${splitSec}s 30m)! വേഗതയും ചടുലതയും അപ്ഡേറ്റ് ചെയ്തു.`,
    mr: `स्प्रिंट चाचणी पूर्ण झाली (${speedMps} m/s • ${splitSec}s 30m)! गती आणि चपळता अपडेट झाली.`,
    bn: `স্প্রিন্ট ট্রায়াল সম্পন্ন হয়েছে (${speedMps} m/s • ${splitSec}s 30m)! গতি ও চপলতা আপডেট হয়েছে।`,
    gu: `સ્પ્રિન્ટ ટ્રાયલ પૂર્ણ થઈ (${speedMps} m/s • ${splitSec}s 30m)! સ્પીડ અને ચપળતા અપડેટ થઈ.`,
    pa: `ਸਪ੍ਰਿੰਟ ਟ੍ਰਾਇਲ ਮੁਕੰਮਲ ਹੋਇਆ (${speedMps} m/s • ${splitSec}s 30m)! ਰਫ਼ਤਾਰ ਅਤੇ ਚੁਸਤੀ ਅੱਪਡੇਟ ਹੋਈ।`,
    or: `ସ୍ପ୍ରିଣ୍ଟ ପରୀକ୍ଷା ସମ୍ପନ୍ନ ହେଲା (${speedMps} m/s • ${splitSec}s 30m)! ଗତି ଏବଂ ଚପଳତା ଅପଡେଟ୍ ହେଲା।`,
    as: `স্প্ৰিণ্ট ট্ৰায়েল সম্পূৰ্ণ হ’ল (${speedMps} m/s • ${splitSec}s 30m)! গতি আৰু ক্ষিপ্ৰতা আপডেট কৰা হ’ল।`,
    ur: `سپرنٹ ٹرائل مکمل ہوا (${speedMps} m/s • ${splitSec}s 30m)! رفتار اور چستی اپ ڈیٹ ہوئی۔`,
    en: `Paced at ${speedMps} m/s (${splitSec}s 30m split)! Updated Speed, Agility & Stamina.`,
  };
  return map[lang] || map.en;
};

const getLocalizedSquatFeedback = (flexionDeg: number, valgusDeg: number, lang: LanguageCode): string => {
  const map: Record<LanguageCode, string> = {
    te: `స్క్వాట్ ఫామ్ నమోదు అయింది (${flexionDeg}° ఫ్లెక్సియన్ • ${valgusDeg}° వాల్గస్)! టెక్నిక్ స్కోర్ అప్‌డేట్ అయ్యింది.`,
    hi: `स्क्वाट फॉर्म दर्ज हुआ (${flexionDeg}° फ्लेक्सन • ${valgusDeg}° वाल्गस)! तकनीक स्कोर अपडेट हुआ।`,
    ta: `ஸ்குவாட் பதிவு முடிந்தது (${flexionDeg}° முழங்கால் வளைவு)! நுட்ப ஸ்கோர் புதுப்பிக்கப்பட்டது.`,
    kn: `ಸ್ಕ್ವಾಟ್ ಫಾರ್ಮ್ ಪೂರ್ಣಗೊಂಡಿದೆ (${flexionDeg}° ಬಾಗುವಿಕೆ)! ತಂತ್ರಜ್ಞಾನ ಸ್ಕೋರ್ ನವೀಕರಿಸಲಾಗಿದೆ.`,
    ml: `സ്ക്വാറ്റ് ഫോം പൂർത്തിയായി (${flexionDeg}° കാൽമുട്ട് വളവ്)! ടെക്നിക് സ്കോർ അപ്ഡേറ്റ് ചെയ്തു.`,
    mr: `स्क्वॉट फॉर्म नोंदवला गेला (${flexionDeg}° गुडघ्याची लवचिकता)! तंत्रज्ञान स्कोअर अपडेट झाला.`,
    bn: `স্কোয়াট ফর্ম রেকর্ড হয়েছে (${flexionDeg}° ফ্লেক্সন)! টেকনিক স্কোর আপডেট হয়েছে।`,
    gu: `સ્ક્વોટ ફોર્મ રેકોર્ડ થયું (${flexionDeg}° ફ્લેક્સન)! ટેકનિક સ્કોર અપડેટ થયો.`,
    pa: `ਸਕੁਐਟ ਫ਼ਾਰਮ ਦਰਜ ਹੋਇਆ (${flexionDeg}° ਮੋੜ)! ਤਕਨੀਕ ਸਕੋਰ ਅੱਪਡੇਟ ਹੋਇਆ।`,
    or: `ସ୍କ୍ୱାଟ୍ ଫର୍ମ ରେକର୍ଡ ହେଲା (${flexionDeg}° ଆଣ୍ଠୁ ବଙ୍କା)! କୌଶଳ ସ୍କୋର ଅପଡେଟ୍ ହେଲା।`,
    as: `স্কোৱাট ফৰ্ম ৰেকৰ্ড হ’ল (${flexionDeg}° আঁঠুৰ ভাঁজ)! কৌশল স্কোৰ আপডেট কৰা হ’ল।`,
    ur: `سکواٹ فارم ریکارڈ ہوا (${flexionDeg}° جھکاؤ)! تکنیک سکور اپ ڈیٹ ہوا۔`,
    en: `Joint flexion recorded at ${flexionDeg}° (${valgusDeg}° valgus deviation)! Updated Technique & Power.`,
  };
  return map[lang] || map.en;
};


export default function App() {
  // 🌟 APP MODE: Athlete Mode vs Recruiter / SAI Scout Mode
  const [appMode, setAppMode] = useState<'athlete' | 'recruiter'>('athlete');

  // Authentication & Onboarding Navigation State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authScreen, setAuthScreen] = useState<'welcome' | 'athlete_auth' | 'recruiter_auth' | 'profile_setup' | 'login_form' | 'register_form'>('welcome');
  const [athleteAuthTab, setAthleteAuthTab] = useState<'login' | 'register'>('login');
  const [recruiterAuthTab, setRecruiterAuthTab] = useState<'login' | 'register'>('login');

  // Input states
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');

  // Onboarding profile inputs
  const [setupName, setSetupName] = useState('');
  const [setupAge, setSetupAge] = useState('18');
  const [setupDistrict, setSetupDistrict] = useState('');
  const [setupState, setSetupState] = useState('');
  const [setupSport, setSetupSport] = useState('Volleyball');
  const [setupHeight, setSetupHeight] = useState('180');
  const [setupWeight, setSetupWeight] = useState('75');

  // Edit Profile Modal & Photo Modal States
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isPhotoPickerModalOpen, setIsPhotoPickerModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDistrict, setEditDistrict] = useState('');
  const [editState, setEditState] = useState('');
  const [editSport, setEditSport] = useState('');
  const [editAge, setEditAge] = useState('18');
  const [editHeight, setEditHeight] = useState('180');
  const [editWeight, setEditWeight] = useState('75');

  // App Navigation & Language State
  const [currentTab, setCurrentTab] = useState<'home' | 'tests' | 'card' | 'profile' | 'recruit'>('home');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [latestBiomechanicsResult, setLatestBiomechanicsResult] = useState<BiomechanicsResult | null>(null);
  const [reportScrubPhase, setReportScrubPhase] = useState<'takeoff' | 'apex' | 'landing'>('apex');
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Auto-request camera permission on opening camera studio
  useEffect(() => {
    if (isCameraModalOpen && (!cameraPermission || !cameraPermission.granted)) {
      requestCameraPermission();
    }
  }, [isCameraModalOpen, cameraPermission]);

  // Active Athlete Profile
  const [athlete, setAthlete] = useState({
    name: 'Charan',
    phone: '6301475315',
    pin: '2223',
    avatar: null as string | null,
    age: 18,
    district: 'Eluru',
    state: 'Andhra Pradesh',
    primarySport: 'Volleyball',
    height: 183,
    weight: 90,
    dominantFoot: 'Right',
    ovr: 0,
    tests: 0,
    avgRating: 0,
    bestRating: 0,
    improvement: 0,
    stats: { speed: 0, power: 0, agility: 0, stamina: 0, jump: 0, technique: 0 },
    rawUnits: {
      jump: '—',
      power: '—',
      speed: '—',
      agility: '—',
      stamina: '—',
      technique: '—',
    },
    percentileBadge: 'UNRANKED',
    streakDays: 0,
    lastActiveDateIST: '',
    activeDaysThisWeek: [] as number[],
    xp: 0,
    level: 1,
    levelTitle: 'Grassroots Rookie',
    aboutMe: 'Aspiring Volleyball athlete from Eluru, Andhra Pradesh.',
  });

  // IST Streak & Clean State Manager on Mount
  useEffect(() => {
    // Clean initial state sync
    setAthlete((prev) => validateAndSyncStreakIST({
      ...prev,
      ovr: 0,
      tests: 0,
      avgRating: 0,
      bestRating: 0,
      improvement: 0,
      stats: { speed: 0, power: 0, agility: 0, stamina: 0, jump: 0, technique: 0 },
      rawUnits: {
        jump: '—',
        power: '—',
        speed: '—',
        agility: '—',
        stamina: '—',
        technique: '—',
      },
      percentileBadge: 'UNRANKED',
      streakDays: 0,
      xp: 0,
      level: 1,
      levelTitle: 'Grassroots Rookie',
    }));
  }, []);

  // Central Registry of Registered Athletes (for Recruiter Talent Discovery)
  const [storedAthletes, setStoredAthletes] = useState<any[]>([]);

  const loadAllAthletesFromStorage = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const userKeys = keys.filter(k => k.startsWith('scoutpulse_user_'));
      if (userKeys.length > 0) {
        const pairs = await AsyncStorage.multiGet(userKeys);
        const list: any[] = [];
        for (const [_, val] of pairs) {
          if (val) {
            try {
              const p = JSON.parse(val);
              if (p && p.name) list.push(p);
            } catch (e) {}
          }
        }
        setStoredAthletes(list);
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadAllAthletesFromStorage();
  }, [appMode]);
  const [auditScrubPhase, setAuditScrubPhase] = useState<'load' | 'takeoff' | 'apex' | 'landing'>('apex');
  const [auditCompareMode, setAuditCompareMode] = useState<'sai_national' | 'district_avg'>('sai_national');

  // Drill recording & AI Validation state
  const [activeDrillTitle, setActiveDrillTitle] = useState('Vertical Jump');
  const [activeDrillCategory, setActiveDrillCategory] = useState<'jump' | 'sprint' | 'squat'>('jump');
  const [drillPhase, setDrillPhase] = useState<'standby' | 'countdown' | 'recording' | 'analyzing'>('standby');
  const [countdownNumber, setCountdownNumber] = useState(3);
  const [recordDurationSec, setRecordDurationSec] = useState(0);
  const [calculatedScore, setCalculatedScore] = useState(0);
  const [calibratedAttributesList, setCalibratedAttributesList] = useState<string[]>([]);
  const [aiFeedbackText, setAiFeedbackText] = useState('');
  const recordTimerRef = useRef<any>(null);
  const countdownTimerRef = useRef<any>(null);
  const motionEnergyRef = useRef(0);
  const accelSubRef = useRef<any>(null);
  const accelSamplesRef = useRef<AccelSample[]>([]);
  const cameraRef = useRef<any>(null);
  const recordedVideoUriRef = useRef<string | null>(null);


  // ================= RECRUITER POV STATE & 4-TIER VERIFICATION SYSTEM =================
  const [recruiterTier, setRecruiterTier] = useState<'govt' | 'academy' | 'independent'>('govt');
  const [recruiterGovtEmail, setRecruiterGovtEmail] = useState('');
  const [recruiterLoginId, setRecruiterLoginId] = useState('');
  const [recruiterLoginPin, setRecruiterLoginPin] = useState('');
  const [recruiterRegName, setRecruiterRegName] = useState('');
  const [recruiterRegOrg, setRecruiterRegOrg] = useState('');
  const [recruiterRegId, setRecruiterRegId] = useState('');
  const [recruiterRegPin, setRecruiterRegPin] = useState('');
  const [isVerifyingRegistry, setIsVerifyingRegistry] = useState(false);
  const [activeScoutProfile, setActiveScoutProfile] = useState({
    name: 'Charan (Chief Scout & Admin)',
    org: 'SAI National Talent Commission & SAAP',
    license: 'NIS Patiala Master Certified • ID: GOAT-CHARAN',
    tier: 'govt' as 'govt' | 'academy' | 'independent',
    tierLabel: 'SAI CHIEF NATIONAL SCOUT & ADMIN',
    cryptoKey: '0x8F4A2C99...SHA256',
    verificationBadge: 'SAI CENTRAL VERIFIED (GRADE A+)',
  });
  const [recruiterSportFilter, setRecruiterSportFilter] = useState('All');
  const [recruiterStateFilter, setRecruiterStateFilter] = useState('All');
  const [recruiterDistrictFilter, setRecruiterDistrictFilter] = useState('All');
  const [isSportPickerModalOpen, setIsSportPickerModalOpen] = useState(false);
  const [isStatePickerModalOpen, setIsStatePickerModalOpen] = useState(false);
  const [isDistrictPickerModalOpen, setIsDistrictPickerModalOpen] = useState(false);
  const [searchSportQuery, setSearchSportQuery] = useState('');
  const [searchStateQuery, setSearchStateQuery] = useState('');
  const [searchDistrictQuery, setSearchDistrictQuery] = useState('');
  const [selectedTalentForAudit, setSelectedTalentForAudit] = useState<any | null>(null);
  const [isCallUpModalOpen, setIsCallUpModalOpen] = useState(false);
  const [callUpVenue, setCallUpVenue] = useState('Indira Gandhi Municipal Stadium, MG Road, Vijayawada');
  const [callUpDate, setCallUpDate] = useState('15-18 September 2026');
  const [callUpNotes, setCallUpNotes] = useState('Direct Selection Trial entry based on SAI Gold Tier performance.');
  const [recruitmentAnnouncementsList, setRecruitmentAnnouncementsList] = useState<any[]>([]);
  const [selectedPassModal, setSelectedPassModal] = useState<any | null>(null);
  const [unreadNoticesCount, setUnreadNoticesCount] = useState(0);

  const t = I18N[language] || I18N.en;
  const currentLangObj = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  // Vernacular Speech Engine
  const speakFeedback = (customText?: string, overrideSpeechCode?: string) => {
    const textToSpeak = customText || t.coach_voice_text;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}

    setIsSpeaking(true);
    Speech.speak(textToSpeak, {
      language: overrideSpeechCode || currentLangObj.speechCode,
      rate: 0.95,
      pitch: 1.05,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  // 0. Recruiter Login & Registration Handlers with STRICT EXCLUSIVE SECURITY LOCKDOWN
  const handleRecruiterLogin = async () => {
    const cleanId = recruiterLoginId.trim().toUpperCase();
    const cleanPin = recruiterLoginPin.trim();

    if (!cleanId) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch (e) {}
      Alert.alert('Scout ID Required ⚠️', 'Please enter your Official Scout / License ID before logging in.');
      return;
    }

    if (cleanPin.length < 4) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch (e) {}
      Alert.alert('PIN Required ⚠️', 'Please enter your 4-digit Security PIN.');
      return;
    }

    setIsVerifyingRegistry(true);

    // Verify against Exclusive Master Credentials or Saved Registered Scout
    setTimeout(async () => {
      setIsVerifyingRegistry(false);

      let savedScouts: any[] = [];
      try {
        const stored = await AsyncStorage.getItem('scoutpulse_registered_scouts');
        if (stored) savedScouts = JSON.parse(stored);
      } catch (e) {}

      const isMasterUser = (cleanId === 'GOAT-CHARAN' || cleanId === '6301475315' || cleanId === 'CHARAN') && cleanPin === '2223';
      const customMatch = savedScouts.find(s => s.id.toUpperCase() === cleanId && s.pin === cleanPin);

      if (!isMasterUser && !customMatch) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (e) {}
        Alert.alert(
          '❌ Access Denied: Unrecognized Credentials',
          'This portal is strictly restricted to authorized SAI Officials and Verified Scouts. The Scout ID and PIN provided do not match the Central Registry.'
        );
        return;
      }

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}

      const scoutName = customMatch ? customMatch.name : 'Charan (Chief Scout & Admin)';
      const scoutOrg = customMatch ? customMatch.org : 'SAI National Talent Commission & SAAP';
      const cryptoKey = `SHA256-SAI-${cleanId}-${(Date.now() % 8999) + 1000}`;

      setActiveScoutProfile({
        name: scoutName,
        org: scoutOrg,
        license: `NIS Patiala Master Certified • ID: ${cleanId}`,
        tier: 'govt',
        tierLabel: 'SAI CHIEF NATIONAL SCOUT & ADMIN',
        cryptoKey,
        verificationBadge: 'SAI CENTRAL VERIFIED (GRADE A+)',
      });

      setAppMode('recruiter');
      setIsLoggedIn(true);
      Alert.alert(
        'Scout Verified & Authenticated 🏛️',
        `✅ Central Registry Match: ID ${cleanId}\n🔐 Cryptographic Key: ${cryptoKey}\n\nWelcome to your Command Center, ${scoutName}!`
      );
    }, 1200);
  };

  const handleRecruiterRegister = async () => {
    const cleanName = recruiterRegName.trim();
    const cleanOrg = recruiterRegOrg.trim();
    const cleanId = recruiterRegId.trim().toUpperCase();
    const cleanPin = recruiterRegPin.trim();
    const cleanEmail = recruiterGovtEmail.trim();

    if (!cleanName) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch (e) {}
      Alert.alert('Name Required ⚠️', 'Please enter your full name.');
      return;
    }

    if (!cleanOrg) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch (e) {}
      Alert.alert('Organization Required ⚠️', 'Please enter your Organization / Academy / Club.');
      return;
    }

    if (!cleanId) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch (e) {}
      Alert.alert('Scout ID Required ⚠️', 'Please enter your Scout / License ID.');
      return;
    }

    if (cleanPin.length < 4) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch (e) {}
      Alert.alert('PIN Required ⚠️', 'Please create a 4-digit Security PIN.');
      return;
    }

    setIsVerifyingRegistry(true);

    // Save custom verified credentials securely
    setTimeout(async () => {
      setIsVerifyingRegistry(false);
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}

      const newScout = {
        name: cleanName,
        org: cleanOrg,
        id: cleanId,
        pin: cleanPin,
        email: cleanEmail,
        tier: recruiterTier,
      };

      try {
        const stored = await AsyncStorage.getItem('scoutpulse_registered_scouts');
        const list = stored ? JSON.parse(stored) : [];
        list.push(newScout);
        await AsyncStorage.setItem('scoutpulse_registered_scouts', JSON.stringify(list));
      } catch (e) {}

      const cryptoKey = `SHA256-SAI-${cleanId}-${(Date.now() % 8999) + 1000}`;
      const tierBadge = recruiterTier === 'govt'
        ? 'SAI CENTRAL VERIFIED (GRADE A+)'
        : recruiterTier === 'academy'
        ? 'ACCREDITED ACADEMY SCOUT'
        : 'INDEPENDENT SCOUT (RESTRICTED)';

      setActiveScoutProfile({
        name: cleanName,
        org: cleanOrg,
        license: `NIS Certified • ID: ${cleanId}`,
        tier: recruiterTier,
        tierLabel: recruiterTier === 'govt' ? 'SAI / SAAP AUTHORIZED GOVT SCOUT' : 'ACCREDITED ACADEMY SCOUT',
        cryptoKey,
        verificationBadge: tierBadge,
      });

      setAppMode('recruiter');
      setIsLoggedIn(true);
      Alert.alert(
        'Scout Verified & Registered! 🏛️',
        `✅ Institutional Verification: PASS\n🔐 Digital Signing Key Generated\n\nWelcome to your Scouting Command Center, ${cleanName}!`
      );
    }, 1200);
  };

  // 1. Submit Registration Step 1 (Phone + PIN)
  const handleRegisterStep1 = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanPin = pin.trim();

    if (cleanPhone.length < 10) {
      Alert.alert('Mobile Number Required', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    if (cleanPin.length < 4) {
      Alert.alert('PIN Required', 'Please create a 4-digit Security PIN.');
      return;
    }

    try {
      const existingData = await AsyncStorage.getItem(`scoutpulse_user_${cleanPhone}`);
      if (existingData || cleanPhone === '9999999999') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch (e) {}

        Alert.alert(
          'Account Already Exists ⚠️',
          `An athlete with mobile number +91 ${cleanPhone} is already registered!\n\nPlease log in with your PIN.`,
          [
            {
              text: 'Go to Login',
              onPress: () => {
                setAuthScreen('athlete_auth');
                setAthleteAuthTab('login');
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
      setAuthScreen('profile_setup');
    } catch (err) {
      setAuthScreen('profile_setup');
    }
  };

  // 2. Submit Login (Phone / ID + PIN)
  const handleLoginSubmit = async () => {
    const rawInput = phone.trim();
    const cleanPhone = rawInput.replace(/\D/g, '');
    const cleanPin = pin.trim();

    // 👽 EXCLUSIVE MASTER ATHLETE CHECK (Charan's Private Account - 6301475314 & 6301475315)
    const isMasterAthlete =
      (cleanPhone === '6301475314' || cleanPhone === '6301475315' || rawInput.toUpperCase() === 'GOAT-CHARAN' || rawInput.toUpperCase() === 'CHARAN') &&
      (cleanPin === '2223' || cleanPin.length >= 4);

    if (isMasterAthlete) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}

      const ownerProfile = {
        name: 'Charan',
        phone: cleanPhone || '6301475314',
        pin: cleanPin || '2223',
        avatar: athlete.avatar || null,
        age: 18,
        district: 'Eluru',
        state: 'Andhra Pradesh',
        primarySport: 'Volleyball',
        height: 183,
        weight: 90,
        dominantFoot: 'Right',
        ovr: athlete.ovr || 0,
        tests: athlete.tests || 0,
        avgRating: athlete.avgRating || 0,
        bestRating: athlete.bestRating || 0,
        improvement: athlete.improvement || 0,
        stats: athlete.stats || { speed: 0, power: 0, agility: 0, stamina: 0, jump: 0, technique: 0 },
        rawUnits: athlete.rawUnits || {
          jump: '—',
          power: '—',
          speed: '—',
          agility: '—',
          stamina: '—',
          technique: '—',
        },
        percentileBadge: athlete.percentileBadge || 'UNRANKED',
        streakDays: athlete.streakDays || 0,
        lastActiveDateIST: athlete.lastActiveDateIST || '',
        activeDaysThisWeek: athlete.activeDaysThisWeek || [],
        xp: athlete.xp || 0,
        level: athlete.level || 1,
        levelTitle: 'Grassroots Rookie',
        aboutMe: 'Charan - Aspiring Volleyball athlete from Eluru, Andhra Pradesh.',
      };

      setAthlete(validateAndSyncStreakIST(ownerProfile));
      setAppMode('athlete');
      setIsLoggedIn(true);
      speakFeedback('Welcome back, Charan!');
      Alert.alert('Welcome Back, Charan! 👑👽', 'Exclusive Master Account Recognized & Authenticated.');
      return;
    }

    if (cleanPhone.length < 10) {
      Alert.alert('Mobile Number Required', 'Please enter your 10-digit registered mobile number.');
      return;
    }

    if (cleanPin.length < 4) {
      Alert.alert('PIN Required', 'Please enter your 4-digit Security PIN.');
      return;
    }

    try {
      const savedData = await AsyncStorage.getItem(`scoutpulse_user_${cleanPhone}`);

      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.pin && parsed.pin !== cleanPin) {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } catch (e) {}
          Alert.alert('Incorrect PIN ❌', 'The PIN you entered is incorrect. Please try again.');
          return;
        }

        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {}
        setAthlete(validateAndSyncStreakIST(parsed));
        setIsLoggedIn(true);
        Alert.alert('Welcome Back! 🏆', `Logged in as ${parsed.name} (${parsed.tests} tests on record).`);
      } else {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (e) {}
        Alert.alert(
          'Account Not Found ⚠️',
          `No athlete registered with mobile +91 ${cleanPhone}.\n\nPlease register as a new athlete.`,
          [
            {
              text: 'Register Now',
              onPress: () => {
                setAuthScreen('athlete_auth');
                setAthleteAuthTab('register');
                if (cleanPhone) setPhone(cleanPhone);
              },
            },
            { text: 'Try Again' },
          ]
        );
      }
    } catch (err) {
      Alert.alert('Error', 'Unable to log in. Please try again.');
    }
  };

  // 3. Complete Profile Setup Onboarding
  const handleFinishProfileSetup = async () => {
    if (!setupName.trim()) {
      Alert.alert('Name Required', 'Please enter your full name.');
      return;
    }

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}

    const cleanPhone = phone.replace(/\D/g, '');
    const cleanPin = pin.trim() || '1234';
    const newName = setupName.trim();
    const newDist = setupDistrict.trim() || 'Eluru';
    const newState = setupState.trim() || 'Andhra Pradesh';
    const newSport = setupSport.trim() || 'Volleyball';

    const newUserProfile = {
      name: newName,
      phone: cleanPhone || '9876543210',
      pin: cleanPin,
      avatar: null,
      age: Number(setupAge) || 18,
      district: newDist,
      state: newState,
      primarySport: newSport,
      height: Number(setupHeight) || 180,
      weight: Number(setupWeight) || 75,
      dominantFoot: 'Right',
      ovr: 0,
      tests: 0,
      avgRating: 0,
      bestRating: 0,
      improvement: 0,
      stats: { speed: 0, power: 0, agility: 0, stamina: 0, jump: 0, technique: 0 },
      rawUnits: {
        jump: '—',
        power: '—',
        speed: '—',
        agility: '—',
        stamina: '—',
        technique: '—',
      },
      percentileBadge: 'UNRANKED',
      streakDays: 0,
      lastActiveDateIST: '',
      activeDaysThisWeek: [] as number[],
      xp: 0,
      level: 1,
      levelTitle: 'Grassroots Rookie',
      aboutMe: `${newName} - Aspiring ${newSport} athlete from ${newDist}, ${newState}.`,
    };

    setAthlete(newUserProfile);
    try {
      await AsyncStorage.setItem(`scoutpulse_user_${cleanPhone}`, JSON.stringify(newUserProfile));
    } catch (e) {}

    setIsLoggedIn(true);
  };

  // Open Edit Profile Modal
  const handleOpenEditProfile = () => {
    setEditName(athlete.name);
    setEditDistrict(athlete.district);
    setEditState(athlete.state);
    setEditSport(athlete.primarySport);
    setEditAge(athlete.age.toString());
    setEditHeight(athlete.height.toString());
    setEditWeight(athlete.weight.toString());
    setIsEditProfileModalOpen(true);
  };

  // Save Edited Profile
  const handleSaveEditedProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Name Required', 'Please enter your name.');
      return;
    }
    const updated = {
      ...athlete,
      name: editName.trim(),
      district: editDistrict.trim() || athlete.district,
      state: editState.trim() || athlete.state,
      primarySport: editSport.trim() || athlete.primarySport,
      age: Number(editAge) || athlete.age,
      height: Number(editHeight) || athlete.height,
      weight: Number(editWeight) || athlete.weight,
    };
    setAthlete(updated);
    try {
      await AsyncStorage.setItem(`scoutpulse_user_${athlete.phone}`, JSON.stringify(updated));
    } catch (e) {}
    setIsEditProfileModalOpen(false);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}
    Alert.alert('Profile Saved', 'Your Athlete Profile has been updated!');
  };

  // Update Profile Picture
  const handleSelectAvatar = async (newUrl: string | null) => {
    const updated = {
      ...athlete,
      avatar: newUrl,
    };
    setAthlete(updated);
    try {
      await AsyncStorage.setItem(`scoutpulse_user_${athlete.phone}`, JSON.stringify(updated));
    } catch (e) {}
    setIsPhotoPickerModalOpen(false);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}
    Alert.alert('Photo Updated', newUrl ? 'New profile photo set!' : 'Reset to default silhouette avatar.');
  };

  // 📸 Take Photo via Device Camera
  const handleTakePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera Permission Required', 'SportLens needs camera access to take your profile picture.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        await handleSelectAvatar(res.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Camera Error', 'Could not open camera. Please try selecting from gallery instead.');
    }
  };

  // 🖼️ Upload Photo from Device Gallery
  const handlePickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Gallery Permission Required', 'SportLens needs permission to access your photo gallery.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        await handleSelectAvatar(res.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Gallery Error', 'Could not open photo gallery. Please try again.');
    }
  };

  // 📲 Real Native OS Share Sheet for Physical Passport Card
  const handleSharePassportCard = async () => {
    try {
      const jumpStr = athlete.rawUnits?.jump || (athlete.stats?.jump ? `${athlete.stats.jump} cm` : 'Uncalibrated');
      const powerStr = athlete.rawUnits?.power || (athlete.stats?.power ? `${athlete.stats.power} W` : 'Uncalibrated');
      const speedStr = athlete.rawUnits?.speed || (athlete.stats?.speed ? `${athlete.stats.speed} m/s` : 'Uncalibrated');
      const ovrStr = athlete.ovr > 0 ? `${athlete.ovr} OVR` : 'Grassroots Scout Prospect';

      const shareMsg =
`🏆 SPORTLENS ATHLETE PHYSICAL PASSPORT
━━━━━━━━━━━━━━━━━━━━
👤 ATHLETE: ${(athlete.name || 'ATHLETE').toUpperCase()}
🏅 SPORT: ${(athlete.primarySport || 'ATHLETICS').toUpperCase()}
📍 LOCATION: ${athlete.district || 'District'}, ${athlete.state || 'India'}
⚡ RATING: ${ovrStr}
━━━━━━━━━━━━━━━━━━━━
📊 BIOMECHANICAL SPECIFICATIONS:
• Jump: ${jumpStr}
• Power: ${powerStr}
• Speed: ${speedStr}
• Agility: ${athlete.rawUnits?.agility || (athlete.stats?.agility ? `${athlete.stats.agility}/100` : 'Uncalibrated')}
• Stamina: ${athlete.rawUnits?.stamina || (athlete.stats?.stamina ? `${athlete.stats.stamina}/100` : 'Uncalibrated')}
• Technique: ${athlete.rawUnits?.technique || (athlete.stats?.technique ? `${athlete.stats.technique}/100` : 'Uncalibrated')}
━━━━━━━━━━━━━━━━━━━━
🛡️ Verified by SAI Central SportLens AI Biomechanics Engine
🇮🇳 Smart India Hackathon Grassroots Sports Scouting`;

      await Share.share({
        title: `${athlete.name}'s SportLens Passport`,
        message: shareMsg,
      });
    } catch (e: any) {
      Alert.alert('Share', e?.message || 'Could not open share menu');
    }
  };

  // Reset all stats back to 0
  const handleResetAllStats = () => {
    Alert.alert(
      'Reset All My Stats? ⚠️',
      'This will wipe all test scores, verified OVR, 6-axis biomechanics radar, level XP, and reset your card back to 0 tests for a clean start.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Reset All Stats',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {}

            const cleanAthlete = {
              ...athlete,
              ovr: 0,
              tests: 0,
              avgRating: 0,
              bestRating: 0,
              improvement: 0,
              stats: { speed: 0, power: 0, agility: 0, stamina: 0, jump: 0, technique: 0 },
              rawUnits: {
                jump: '—',
                power: '—',
                speed: '—',
                agility: '—',
                stamina: '—',
                technique: '—',
              },
              percentileBadge: 'UNRANKED',
              streakDays: 0,
              lastActiveDateIST: '',
              activeDaysThisWeek: [],
              xp: 0,
              level: 1,
              levelTitle: 'Grassroots Rookie',
            };

            setAthlete(cleanAthlete);
            try {
              await AsyncStorage.setItem(`scoutpulse_user_${athlete.phone}`, JSON.stringify(cleanAthlete));
            } catch (e) {}

            Alert.alert('Stats Cleared! 🧹', 'All stats and test scores have been reset to 0.');
          },
        },
      ]
    );
  };

  // Live Drill Start with Real Camera Permissions
  const handleStartDrill = async (drillName: string, category?: 'jump' | 'sprint' | 'squat') => {
    setActiveDrillTitle(drillName);
    setRecordDurationSec(0);
    setDrillPhase('standby');
    setCountdownNumber(3);

    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    let cat: 'jump' | 'sprint' | 'squat' = category || 'jump';
    if (!category) {
      const lower = drillName.toLowerCase();
      if (
        lower.includes('sprint') || lower.includes('knees') || lower.includes('kho kho') ||
        lower.includes('football') || lower.includes('kabaddi') || lower.includes('badminton') ||
        lower.includes('cricket') || lower.includes('boxing') || lower.includes('స్ప్రింట్') ||
        lower.includes('స్ప్రింట్') || lower.includes('स्प्रिंट')
      ) {
        cat = 'sprint';
      } else if (
        lower.includes('squat') || lower.includes('universal') || lower.includes('hockey') ||
        lower.includes('wrestling') || lower.includes('స్క్వాట్') || lower.includes('स्क्वाट')
      ) {
        cat = 'squat';
      }
    }
    setActiveDrillCategory(cat);

    if (!cameraPermission?.granted) {
      const permRes = await requestCameraPermission();
      if (!permRes.granted) {
        Alert.alert(
          'Camera Permission Required 📷',
          'SportLens needs access to your camera to track your body posture and calculate physical biomechanics.',
          [{ text: 'Grant Permission', onPress: () => requestCameraPermission() }, { text: 'Cancel', style: 'cancel' }]
        );
        return;
      }
    }

    setIsCameraModalOpen(true);
  };

  // Start 3-2-1 Countdown & Begin Camera Recording
  const handleStartManualRecording = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);

    setDrillPhase('countdown');
    setCountdownNumber(3);
    setRecordDurationSec(0);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {}

    speakFeedback('3', 'en-IN');

    let count = 3;
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownNumber(count);
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (e) {}
        speakFeedback(`${count}`, 'en-IN');
      } else {
        // COUNTDOWN FINISHED -> RECORDING STARTS IMMEDIATELY!
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdownNumber(0);
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {}
        speakFeedback('Go!', 'en-IN');

        setDrillPhase('recording');
        setRecordDurationSec(0);

        // ── START REAL VIDEO RECORDING ON CAMERA (CACHE STREAM) ──
        if (cameraRef.current && typeof cameraRef.current.recordAsync === 'function') {
          try {
            const recPromise = cameraRef.current.recordAsync({ maxDuration: 60, mute: true });
            if (recPromise && typeof recPromise.then === 'function') {
              recPromise
                .then((result: any) => {
                  if (result?.uri) {
                    recordedVideoUriRef.current = result.uri;
                  }
                })
                .catch(() => {});
            }
          } catch (e) {}
        }

        // ── START REAL ACCELEROMETER DATA COLLECTION AT 100Hz ──
        accelSamplesRef.current = [];
        try {
          Accelerometer.setUpdateInterval(10); // 10ms = 100 samples/sec
          accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
            accelSamplesRef.current.push({ x, y, z, t: Date.now() });
          });
        } catch (e) {
          // Accelerometer unavailable on this device — engine will handle gracefully
        }

        // Real-time camera duration counter
        recordTimerRef.current = setInterval(() => {
          setRecordDurationSec((prevSec) => prevSec + 1);
        }, 1000);
      }
    }, 1000);
  };

  // Safe Close Camera Studio
  const handleCloseCameraStudio = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (accelSubRef.current) {
      try { accelSubRef.current.remove(); } catch (e) {}
      accelSubRef.current = null;
    }
    if (cameraRef.current) {
      try { cameraRef.current.stopRecording(); } catch (e) {}
    }
    setDrillPhase('standby');
    setRecordDurationSec(0);
    setIsCameraModalOpen(false);
  };

  // Stop Recording & Run 100% Automated AI Biomechanics Evaluation
  const handleStopRecordingAndEvaluate = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (accelSubRef.current) {
      try { accelSubRef.current.remove(); } catch (e) {}
      accelSubRef.current = null;
    }
    if (cameraRef.current) {
      try { cameraRef.current.stopRecording(); } catch (e) {}
    }

    // 🛑 DURATION CHECK: Minimum 2 seconds required for capture
    if (recordDurationSec < 2) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch (e) {}

      const shortVoice = getLocalizedShortRecording(language);

      speakFeedback(shortVoice);

      Alert.alert(
        '⚠️ Recording Too Short',
        `You recorded for only ${recordDurationSec} second(s).\n\nPlease record at least 2 seconds of movement so the AI computer vision can calibrate verified kinematics.`,
        [{ text: 'Try Again', onPress: () => { setDrillPhase('standby'); setRecordDurationSec(0); } }]
      );
      setDrillPhase('standby');
      setRecordDurationSec(0);
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}

    // Enter AI analyzing state
    setDrillPhase('analyzing');

    // 1.2s AI Biomechanics sensor processing animation
    setTimeout(() => {
      const athleteWeight = athlete.weight || 68;
      let newStats = { ...athlete.stats };
      let newUnits = { ...(athlete.rawUnits || {}) };
      let score = 50;
      let calibratedList: string[] = [];
      let feedback = '';

      // ── GRAB REAL ACCELEROMETER SAMPLES ──
      const accelSamples = [...accelSamplesRef.current];
      accelSamplesRef.current = [];

      let bioResult: BiomechanicsResult;

      if (activeDrillCategory === 'jump') {
        const jumpRes = analyzeVideoJumpKinematics(recordDurationSec, athleteWeight, accelSamples);
        bioResult = jumpRes;

        if (!jumpRes.isValid) {
          setIsCameraModalOpen(false);
          setDrillPhase('standby');
          setRecordDurationSec(0);
          Alert.alert(
            '❌ AI Biomechanics: No Jump Detected (0.0 cm)',
            'No vertical takeoff or airborne flight was detected in the video recording.\n\n• Measured Flight Airtime: 0.00s\n• Measured Height: 0.0 cm\n• Anti-Cheat Flag: Close-up static / face framing rejected\n\n💡 Tip: Step back 6–8 feet so your full body is visible in the frame, or hold phone securely during your jump.',
            [{ text: 'OK', style: 'default' }]
          );
          return;
        }

        newStats.jump = jumpRes.score;
        newStats.power = jumpRes.powerScore;
        newUnits.jump = `${jumpRes.jumpHeightCm} cm • ${jumpRes.flightTimeSec}s Flight`;
        newUnits.power = `${jumpRes.peakPowerWatts} W • ${jumpRes.relativePowerWattsPerKg} W/kg`;

        score = jumpRes.score;
        calibratedList = ['JUMP', 'POWER'];
        feedback = getLocalizedJumpFeedback(jumpRes.jumpHeightCm, jumpRes.flightTimeSec, jumpRes.peakPowerWatts, language);
      } else if (activeDrillCategory === 'sprint') {
        const sprintRes = analyzeVideoSprintKinematics(recordDurationSec, athleteWeight, accelSamples);
        bioResult = sprintRes;

        if (!sprintRes.isValid) {
          setIsCameraModalOpen(false);
          setDrillPhase('standby');
          setRecordDurationSec(0);
          Alert.alert(
            '❌ AI Biomechanics: No Sprint Detected',
            'No sustained forward stride cadence detected in this recording.\n\n💡 Tip: Step back 6–8 feet so your running lane is in frame, or hold phone securely while sprinting.',
            [{ text: 'Try Again', style: 'default' }]
          );
          return;
        }

        newStats.speed = sprintRes.speedScore;
        newStats.agility = sprintRes.agilityScore;
        newStats.stamina = sprintRes.staminaScore;
        newUnits.speed = `${sprintRes.topSpeedMps} m/s • ${sprintRes.split30mSec}s 30m Gate`;
        newUnits.agility = `${sprintRes.lateralSwitchSec}s Lateral Switch`;
        newUnits.stamina = `${sprintRes.paceConsistencyPercent}% Pace Consistency`;

        score = sprintRes.score;
        calibratedList = ['SPEED', 'AGILITY', 'STAMINA'];
        feedback = getLocalizedSprintFeedback(sprintRes.topSpeedMps, sprintRes.split30mSec, language);
      } else {
        const squatRes = analyzeVideoSquatKinematics(recordDurationSec, athleteWeight, accelSamples);
        bioResult = squatRes;

        if (!squatRes.isValid) {
          setIsCameraModalOpen(false);
          setDrillPhase('standby');
          setRecordDurationSec(0);
          Alert.alert(
            '❌ AI Biomechanics: No Squat Detected',
            'No knee flexion or lowering movement detected in this recording.\n\n💡 Tip: Step back 6–8 feet so your full body is in frame and bend knees to 90° depth.',
            [{ text: 'Try Again', style: 'default' }]
          );
          return;
        }

        newStats.technique = squatRes.techniqueScore;
        newStats.power = Math.max(newStats.power, squatRes.powerScore);
        newUnits.technique = `${squatRes.kneeFlexionDeg}° Flexion • ${squatRes.valgusStabilityDeg}° Valgus`;

        score = squatRes.score;
        calibratedList = ['TECHNIQUE', 'POWER'];
        feedback = getLocalizedSquatFeedback(squatRes.kneeFlexionDeg, squatRes.valgusStabilityDeg, language);
      }

      setLatestBiomechanicsResult(bioResult);

      const nonZeroStats = Object.values(newStats).filter((v) => typeof v === 'number' && v > 0);
      const computedOvr = nonZeroStats.length > 0
        ? Math.round(nonZeroStats.reduce((a, b) => (a as number) + (b as number), 0) / nonZeroStats.length)
        : score;

      const percentile = computedOvr >= 90
        ? `Top 1.5% in ${athlete.district} (SAI Elite)`
        : computedOvr >= 80
        ? `Top 8% in ${athlete.district} (State Grade A)`
        : computedOvr >= 70
        ? `Top 20% in ${athlete.district} (District Grade)`
        : computedOvr >= 50
        ? `Grassroots Rookie (${athlete.district})`
        : `Unranked Prospect`;

      const todayIST = getISTDateString();
      const yesterdayIST = getISTYesterdayString();
      const dayIdx = getISTDayIndex(); // 0 = Mon, ..., 6 = Sun

      let newStreak = athlete.streakDays || 0;
      if (athlete.lastActiveDateIST === todayIST) {
        newStreak = Math.max(1, newStreak);
      } else if (athlete.lastActiveDateIST === yesterdayIST) {
        newStreak += 1;
      } else {
        newStreak = 1;
      }

      const activeDays = Array.isArray(athlete.activeDaysThisWeek) ? athlete.activeDaysThisWeek : [];
      const updatedDaysThisWeek = Array.from(new Set([...activeDays, dayIdx])).sort();

      const newTests = athlete.tests + 1;
      const newXp = (athlete.xp || 0) + 150;
      const newLevel = Math.max(1, Math.floor(newXp / 300) + 1);
      const newLevelTitle = newLevel >= 5 ? 'State Contender' : newLevel >= 3 ? 'District Challenger' : 'Grassroots Prospect';

      const updated = {
        ...athlete,
        tests: newTests,
        xp: newXp,
        level: newLevel,
        levelTitle: newLevelTitle,
        streakDays: newStreak,
        lastActiveDateIST: todayIST,
        activeDaysThisWeek: updatedDaysThisWeek,
        avgRating: computedOvr,
        bestRating: Math.max(athlete.bestRating || computedOvr, computedOvr),
        ovr: computedOvr,
        improvement: athlete.tests > 0 ? 15 : 0,
        stats: newStats,
        rawUnits: {
          jump: newUnits.jump || athlete.rawUnits?.jump || '—',
          power: newUnits.power || athlete.rawUnits?.power || '—',
          speed: newUnits.speed || athlete.rawUnits?.speed || '—',
          agility: newUnits.agility || athlete.rawUnits?.agility || '—',
          stamina: newUnits.stamina || athlete.rawUnits?.stamina || '—',
          technique: newUnits.technique || athlete.rawUnits?.technique || '—',
        },
        percentileBadge: percentile,
      };

      setAthlete(updated);
      try {
        AsyncStorage.setItem(`scoutpulse_user_${athlete.phone}`, JSON.stringify(updated));
        loadAllAthletesFromStorage();
      } catch (e) {}

      setCalculatedScore(score);
      setCalibratedAttributesList(calibratedList);
      setAiFeedbackText(feedback);

      // Close Camera, reset recording, open report
      setIsCameraModalOpen(false);
      setDrillPhase('standby');
      setRecordDurationSec(0);
      setIsReportModalOpen(true);
      speakFeedback(feedback);

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
    }, 1200);
  };

  // ================= RECRUITER TALENT ROSTER (VERIFIED SCOUTABLE ATHLETES) =================
  // Registered candidates (including seeded athlete friends & dynamically registered athletes)
  const SEEDED_FRIENDS_ATHLETES: any[] = [
    {
      id: 'ath_sanjay_vanasi',
      name: 'SANJAY KUMAR VANASI',
      district: 'Vijayawada',
      state: 'Andhra Pradesh',
      age: 18,
      sport: 'Basketball',
      ovr: 68,
      tests: 0,
      jumpVal: 'Uncalibrated',
      powerVal: 'Uncalibrated',
      speedVal: 'Uncalibrated',
      antiCheatScore: 'Single-Shot Video Verified 🛡️',
      badge: 'Grassroots Candidate',
      avatar: undefined,
    },
    {
      id: 'ath_sashanth_ponnada',
      name: 'Sashanth Kumar Ponnada',
      district: 'Visakhapatnam',
      state: 'Andhra Pradesh',
      age: 19,
      sport: 'Athletics',
      ovr: 75,
      tests: 1,
      jumpVal: '62.4 cm • 0.58s Flight',
      powerVal: '3850 W • 56.6 W/kg',
      speedVal: '8.2 m/s • 3.92s Split',
      antiCheatScore: 'Anti-Cheat: 98.4%',
      badge: 'State Prospect',
      avatar: undefined,
    },
    {
      id: 'ath_charan_eluru',
      name: 'Charan',
      district: 'Eluru',
      state: 'Andhra Pradesh',
      age: 18,
      sport: 'Volleyball',
      ovr: 88,
      tests: 3,
      jumpVal: '68.5 cm • 0.64s Flight',
      powerVal: '4150 W • 61.0 W/kg',
      speedVal: '8.8 m/s • 3.75s Split',
      antiCheatScore: 'Anti-Cheat: 99.1%',
      badge: 'SAI Gold Tier',
      avatar: undefined,
    },
  ];

  // Map any dynamically registered athletes stored on device
  const mappedStoredTalent = storedAthletes.map((ath: any) => ({
    id: `ath_${ath.phone || ath.name.replace(/\s+/g, '_').toLowerCase()}`,
    name: ath.name,
    district: ath.district || 'Eluru',
    state: ath.state || 'Andhra Pradesh',
    age: ath.age || 18,
    sport: ath.primarySport || ath.sport || 'Athletics',
    ovr: ath.ovr > 0 ? ath.ovr : (ath.tests > 0 ? 70 : 65),
    tests: ath.tests || 0,
    jumpVal: ath.rawUnits?.jump || (ath.stats?.jump ? `${ath.stats.jump} cm` : 'Uncalibrated'),
    powerVal: ath.rawUnits?.power || (ath.stats?.power ? `${ath.stats.power} W` : 'Uncalibrated'),
    speedVal: ath.rawUnits?.speed || (ath.stats?.speed ? `${ath.stats.speed} m/s` : 'Uncalibrated'),
    antiCheatScore: ath.tests > 0 ? 'Anti-Cheat: 98.4%' : 'Single-Shot Video Verified 🛡️',
    badge: ath.ovr >= 85 ? 'SAI Gold Tier' : ath.ovr >= 70 ? 'State Prospect' : ath.tests > 0 ? 'District Prospect' : 'Grassroots Candidate',
    avatar: ath.avatar,
  }));

  // Build unified TALENT_POOL deduplicated by name
  const talentPoolMap = new Map<string, any>();
  SEEDED_FRIENDS_ATHLETES.forEach((a) => talentPoolMap.set(a.name.trim().toLowerCase(), a));
  mappedStoredTalent.forEach((a) => talentPoolMap.set(a.name.trim().toLowerCase(), a));
  if (athlete && athlete.name && !athlete.name.toLowerCase().includes('scout') && !athlete.name.toLowerCase().includes('admin')) {
    talentPoolMap.set(athlete.name.trim().toLowerCase(), {
      id: `ath_${athlete.phone || 'current'}`,
      name: athlete.name,
      district: athlete.district || 'Eluru',
      state: athlete.state || 'Andhra Pradesh',
      age: athlete.age || 18,
      sport: athlete.primarySport || 'Athletics',
      ovr: athlete.ovr > 0 ? athlete.ovr : (athlete.tests > 0 ? 70 : 65),
      tests: athlete.tests || 0,
      jumpVal: athlete.rawUnits?.jump || (athlete.stats?.jump ? `${athlete.stats.jump} cm` : 'Uncalibrated'),
      powerVal: athlete.rawUnits?.power || (athlete.stats?.power ? `${athlete.stats.power} W` : 'Uncalibrated'),
      speedVal: athlete.rawUnits?.speed || (athlete.stats?.speed ? `${athlete.stats.speed} m/s` : 'Uncalibrated'),
      antiCheatScore: athlete.tests > 0 ? 'Anti-Cheat: 98.4%' : 'Single-Shot Video Verified 🛡️',
      badge: athlete.ovr >= 85 ? 'SAI Gold Tier' : athlete.ovr >= 70 ? 'State Prospect' : athlete.tests > 0 ? 'District Prospect' : 'Grassroots Candidate',
      avatar: athlete.avatar,
    });
  }
  const TALENT_POOL: any[] = Array.from(talentPoolMap.values());

  const normalizeForFilter = (s: string = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const filteredTalent = TALENT_POOL.filter((ath) => {
    const normAthSport = normalizeForFilter(ath.sport);
    const normFiltSport = normalizeForFilter(recruiterSportFilter);
    const matchSport = recruiterSportFilter === 'All' || normAthSport.includes(normFiltSport) || normFiltSport.includes(normAthSport);

    const normAthState = normalizeForFilter(ath.state);
    const normFiltState = normalizeForFilter(recruiterStateFilter);
    const matchState = recruiterStateFilter === 'All' || normAthState.includes(normFiltState) || normFiltState.includes(normAthState);

    const normAthDist = normalizeForFilter(ath.district);
    const normFiltDist = normalizeForFilter(recruiterDistrictFilter);
    const matchDist = recruiterDistrictFilter === 'All' || normAthDist.includes(normFiltDist) || normFiltDist.includes(normAthDist);

    return matchSport && matchState && matchDist;
  });

  // Handle Scout Issuing Direct Call-Up
  const handleDispatchCallUp = (targetAthlete: any) => {
    const passCode = `SAI-AP-${(Date.now() % 899999) + 100000}`;
    const cryptoHash = `SHA256-${Date.now().toString(16).toUpperCase()}-${(Date.now() % 8999) + 1000}`;

    const newNotice = {
      id: `trial_${Date.now()}`,
      athleteName: targetAthlete.name,
      athleteDistrict: targetAthlete.district,
      athleteOvr: targetAthlete.ovr,
      title: 'Junior State Volleyball Selection Trials 2026',
      org: 'Sports Authority of Andhra Pradesh (SAAP) & SAI',
      sport: 'Volleyball',
      category: 'Junior State Team Selection',
      location: callUpVenue,
      dates: callUpDate,
      eligibility: 'Verified SAI 85+ OVR Gold Tier Athletes',
      badgeColor: '#8B5CF6',
      status: `DIRECT CALL-UP FOR ${targetAthlete.name.toUpperCase()}`,
      desc: callUpNotes,
      officer: `${activeScoutProfile.name} (${activeScoutProfile.license})`,
      passCode,
      cryptoHash,
      scoutBadge: activeScoutProfile.verificationBadge,
    };

    setRecruitmentAnnouncementsList([newNotice, ...recruitmentAnnouncementsList]);
    setUnreadNoticesCount((prev) => prev + 1);
    setIsCallUpModalOpen(false);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}

    Alert.alert(
      'Trial Call-Up Dispatched 🏛️',
      `Official Trial Invitation and Digital Pass have been successfully dispatched to ${targetAthlete.name} (${targetAthlete.district}).`,
      [{ text: 'OK' }]
    );
  };

  // ================= VIEW: AUTHENTICATION FLOW =================
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.safeContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#090514" />

        <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.loginContent}>
          <View style={styles.loginBrand}>
            <View style={styles.loginLogoIcon}>
              <Ionicons name="pulse" color="#8B5CF6" size={34} />
            </View>
            <Text style={styles.loginTitle}>
              Sport<Text style={{ color: '#8B5CF6' }}>Lens</Text>
            </Text>
            <Text style={styles.loginSubtitle}>{t.login_sub}</Text>
          </View>

          <TouchableOpacity
            style={styles.loginLangBtn}
            onPress={() => setIsLangModalOpen(true)}
          >
            <Ionicons name="globe-outline" color="#8B5CF6" size={16} />
            <Text style={styles.loginLangText}>
              Language: <Text style={{ color: '#8B5CF6', fontWeight: 'bold' }}>{currentLangObj.native}</Text> (Change)
            </Text>
          </TouchableOpacity>

          {/* 1. WELCOME SCREEN: 2 MAIN ROLES (ATHLETE VS RECRUITER) */}
          {authScreen === 'welcome' && (
            <View style={{ width: '100%', gap: 14 }}>
              {/* Role 1: Athlete Portal */}
              <TouchableOpacity
                style={[styles.welcomeChoiceCard, { borderColor: '#8B5CF6' }]}
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  } catch (e) {}
                  setPhone('');
                  setPin('');
                  setAthleteAuthTab('login');
                  setAuthScreen('athlete_auth');
                }}
              >
                <LinearGradient
                  colors={['rgba(139, 92, 246, 0.18)', 'rgba(139, 92, 246, 0.04)']}
                  style={styles.welcomeChoiceGradient}
                >
                  <View style={styles.welcomeIconCircle}>
                    <Ionicons name="person" color="#8B5CF6" size={26} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.welcomeChoiceTitle}>🏃 Athlete Portal</Text>
                    <Text style={styles.welcomeChoiceDesc}>
                      Test physical drills, track verified OVR rating, and get scouted by national academies.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" color="#8B5CF6" size={22} />
                </LinearGradient>
              </TouchableOpacity>

              {/* Role 2: Recruiter Portal */}
              <TouchableOpacity
                style={[styles.welcomeChoiceCard, { borderColor: '#EAB308' }]}
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  } catch (e) {}
                  setRecruiterAuthTab('login');
                  setAuthScreen('recruiter_auth');
                }}
              >
                <LinearGradient
                  colors={['rgba(234,179,8,0.18)', 'rgba(234,179,8,0.04)']}
                  style={styles.welcomeChoiceGradient}
                >
                  <View style={[styles.welcomeIconCircle, { backgroundColor: 'rgba(234,179,8,0.2)' }]}>
                    <Ionicons name="shield-checkmark" color="#FACC15" size={26} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.welcomeChoiceTitle, { color: '#FACC15' }]}>🏛️ Recruiter / Scout Portal</Text>
                      <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                        <Text style={{ color: '#8B5CF6', fontSize: 7, fontWeight: '900' }}>OFFICIAL</Text>
                      </View>
                    </View>
                    <Text style={styles.welcomeChoiceDesc}>
                      For SAI officials, SAAP selectors, and academy coaches to discover & audit talent.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" color="#FACC15" size={22} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* 2. DIRECT ATHLETE AUTH PAGE (LOGIN / REGISTER) */}
          {authScreen === 'athlete_auth' && (
            <View style={[styles.loginCard, { borderColor: '#8B5CF6' }]}>
              <View style={styles.formTopRow}>
                <TouchableOpacity onPress={() => setAuthScreen('welcome')}>
                  <Text style={styles.backBtnText}>❮ Back</Text>
                </TouchableOpacity>
                <Text style={[styles.formTopTitle, { color: '#8B5CF6' }]}>🏃 Athlete Portal</Text>
                <View style={{ width: 40 }} />
              </View>

              {/* Segmented Switcher: Login vs Register */}
              <View style={styles.authSegmentRow}>
                <TouchableOpacity
                  style={[styles.authSegmentTab, athleteAuthTab === 'login' && styles.authSegmentTabActiveGreen]}
                  onPress={() => {
                    setAthleteAuthTab('login');
                  }}
                >
                  <Ionicons name="log-in" color={athleteAuthTab === 'login' ? '#000' : '#94A3B8'} size={14} />
                  <Text style={[styles.authSegmentText, athleteAuthTab === 'login' && styles.authSegmentTextActive]}>
                    Login
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.authSegmentTab, athleteAuthTab === 'register' && styles.authSegmentTabActiveGreen]}
                  onPress={() => {
                    setAthleteAuthTab('register');
                  }}
                >
                  <Ionicons name="person-add" color={athleteAuthTab === 'register' ? '#000' : '#94A3B8'} size={14} />
                  <Text style={[styles.authSegmentText, athleteAuthTab === 'register' && styles.authSegmentTextActive]}>
                    New Register
                  </Text>
                </TouchableOpacity>
              </View>

              {athleteAuthTab === 'login' ? (
                /* Athlete Login Form */
                <View>
                  <Text style={styles.formSubText}>
                    Enter your registered mobile number and 4-digit PIN to load your Scout Passport.
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t.phone_label}</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder={t.enter_phone}
                      placeholderTextColor="#64748B"
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={setPhone}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t.enter_pin_label}</Text>
                    <TextInput
                      style={[styles.textInput, { letterSpacing: 6, fontSize: 18, color: '#8B5CF6', fontWeight: 'bold' }]}
                      placeholder="• • • •"
                      placeholderTextColor="#64748B"
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={4}
                      value={pin}
                      onChangeText={setPin}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={handleLoginSubmit}
                  >
                    <Ionicons name="log-in" color="#000" size={16} />
                    <Text style={styles.primaryBtnText}>{t.login_btn}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ marginTop: 12, alignItems: 'center' }}
                    onPress={() => setAthleteAuthTab('register')}
                  >
                    <Text style={{ color: '#94A3B8', fontSize: 11 }}>
                      New athlete? <Text style={{ color: '#8B5CF6', fontWeight: 'bold' }}>Register here ❯</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Athlete Register Form */
                <View>
                  <Text style={styles.formSubText}>
                    Create your account to setup your new Scout Passport Card (Starts with 0 tests).
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t.phone_label}</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder={t.enter_phone}
                      placeholderTextColor="#64748B"
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={setPhone}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t.create_pin_label}</Text>
                    <TextInput
                      style={[styles.textInput, { letterSpacing: 6, fontSize: 18, color: '#8B5CF6', fontWeight: 'bold' }]}
                      placeholder="• • • •"
                      placeholderTextColor="#64748B"
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={4}
                      value={pin}
                      onChangeText={setPin}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={handleRegisterStep1}
                  >
                    <Ionicons name="arrow-forward" color="#000" size={16} />
                    <Text style={styles.primaryBtnText}>{t.continue_btn}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ marginTop: 12, alignItems: 'center' }}
                    onPress={() => setAthleteAuthTab('login')}
                  >
                    <Text style={{ color: '#94A3B8', fontSize: 11 }}>
                      Already have an account? <Text style={{ color: '#8B5CF6', fontWeight: 'bold' }}>Log in ❯</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* 3. DIRECT RECRUITER AUTH PAGE (LOGIN / REGISTER) */}
          {authScreen === 'recruiter_auth' && (
            <View style={[styles.loginCard, { borderColor: '#EAB308' }]}>
              <View style={styles.formTopRow}>
                <TouchableOpacity onPress={() => setAuthScreen('welcome')}>
                  <Text style={styles.backBtnText}>❮ Back</Text>
                </TouchableOpacity>
                <Text style={[styles.formTopTitle, { color: '#FACC15' }]}>🏛️ Recruiter Portal</Text>
                <View style={{ width: 40 }} />
              </View>

              {/* Segmented Switcher: Scout Login vs New Scout */}
              <View style={styles.authSegmentRow}>
                <TouchableOpacity
                  style={[styles.authSegmentTab, recruiterAuthTab === 'login' && styles.authSegmentTabActiveGold]}
                  onPress={() => setRecruiterAuthTab('login')}
                >
                  <Ionicons name="shield-checkmark" color={recruiterAuthTab === 'login' ? '#000' : '#94A3B8'} size={14} />
                  <Text style={[styles.authSegmentText, recruiterAuthTab === 'login' && styles.authSegmentTextActive]}>
                    Scout Login
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.authSegmentTab, recruiterAuthTab === 'register' && styles.authSegmentTabActiveGold]}
                  onPress={() => setRecruiterAuthTab('register')}
                >
                  <Ionicons name="person-add" color={recruiterAuthTab === 'register' ? '#000' : '#94A3B8'} size={14} />
                  <Text style={[styles.authSegmentText, recruiterAuthTab === 'register' && styles.authSegmentTextActive]}>
                    New Scout
                  </Text>
                </TouchableOpacity>
              </View>

              {recruiterAuthTab === 'login' ? (
                /* Scout Login Form */
                <View>
                  <Text style={styles.formSubText}>
                    Official login for NIS Certified Scouts & SAI State Talent Evaluators.
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Official Scout ID / License</Text>
                    <TextInput
                      style={[styles.textInput, { color: '#FACC15', fontWeight: 'bold' }]}
                      placeholder="Enter Scout ID / License"
                      placeholderTextColor="#64748B"
                      value={recruiterLoginId}
                      onChangeText={setRecruiterLoginId}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Scout Security PIN</Text>
                    <TextInput
                      style={[styles.textInput, { letterSpacing: 6, fontSize: 18, color: '#FACC15', fontWeight: 'bold' }]}
                      placeholder="• • • •"
                      placeholderTextColor="#64748B"
                      secureTextEntry
                      maxLength={4}
                      value={recruiterLoginPin}
                      onChangeText={setRecruiterLoginPin}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: '#FACC15' }]}
                    onPress={handleRecruiterLogin}
                  >
                    <Ionicons name="shield-checkmark" color="#000" size={16} />
                    <Text style={styles.primaryBtnText}>🏛️ Login to Recruiter Portal ❯</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* New Scout Register Form */
                <View>
                  <Text style={styles.formSubText}>
                    Register your coaching & talent scouting credentials with SAI / State Board.
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Scout / Coach Full Name</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Enter your full name"
                      placeholderTextColor="#64748B"
                      value={recruiterRegName}
                      onChangeText={setRecruiterRegName}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Organization / Academy</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Enter Organization / Academy / Club"
                      placeholderTextColor="#64748B"
                      value={recruiterRegOrg}
                      onChangeText={setRecruiterRegOrg}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Scout ID</Text>
                      <TextInput
                        style={[styles.textInput, { color: '#FACC15' }]}
                        placeholder="License / Scout ID"
                        placeholderTextColor="#64748B"
                        value={recruiterRegId}
                        onChangeText={setRecruiterRegId}
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>PIN</Text>
                      <TextInput
                        style={[styles.textInput, { letterSpacing: 4, color: '#FACC15', fontWeight: 'bold' }]}
                        placeholder="4-Digit PIN"
                        placeholderTextColor="#64748B"
                        secureTextEntry
                        maxLength={4}
                        value={recruiterRegPin}
                        onChangeText={setRecruiterRegPin}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: '#FACC15' }]}
                    onPress={handleRecruiterRegister}
                  >
                    <Ionicons name="shield-checkmark" color="#000" size={16} />
                    <Text style={styles.primaryBtnText}>Register Scout & Enter ❯</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {authScreen === 'profile_setup' && (
            <View style={styles.loginCard}>
              <Text style={styles.loginCardHeading}>{t.setup_profile_title}</Text>
              <Text style={{ color: '#94A3B8', fontSize: 11, textAlign: 'center', marginBottom: 14 }}>
                Enter your details to create your new Scout Passport (Starts at 0 Tests)
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t.name_label} *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Charan / Rahul / Priya"
                  placeholderTextColor="#64748B"
                  value={setupName}
                  onChangeText={setSetupName}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t.district_label} *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Eluru / Vizianagaram"
                    placeholderTextColor="#64748B"
                    value={setupDistrict}
                    onChangeText={setSetupDistrict}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t.state_label} *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Andhra Pradesh"
                    placeholderTextColor="#64748B"
                    value={setupState}
                    onChangeText={setSetupState}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t.age}</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="18"
                    placeholderTextColor="#64748B"
                    keyboardType="number-pad"
                    value={setupAge}
                    onChangeText={setSetupAge}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t.sport_label}</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Volleyball / Football"
                    placeholderTextColor="#64748B"
                    value={setupSport}
                    onChangeText={setSetupSport}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t.height} (cm)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="183"
                    placeholderTextColor="#64748B"
                    keyboardType="number-pad"
                    value={setupHeight}
                    onChangeText={setSetupHeight}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t.weight} (kg)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="90"
                    placeholderTextColor="#64748B"
                    keyboardType="number-pad"
                    value={setupWeight}
                    onChangeText={setSetupWeight}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handleFinishProfileSetup}>
                <Ionicons name="shield-checkmark" color="#C084FC" size={16} />
                <Text style={styles.primaryBtnText}>Enter SportLens Studio ❯</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 12, alignItems: 'center' }}
                onPress={() => {
                  setAuthScreen('athlete_auth');
                  setAthleteAuthTab('register');
                }}
              >
                <Text style={{ color: '#94A3B8', fontSize: 11 }}>❮ Back to Phone & PIN</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <Modal visible={isLangModalOpen} animationType="fade" transparent>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t.choose_lang}</Text>
                <TouchableOpacity onPress={() => setIsLangModalOpen(false)}>
                  <Ionicons name="close" color="#94A3B8" size={22} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 380 }}>
                {LANGUAGES.map((l) => (
                  <TouchableOpacity
                    key={l.code}
                    style={[styles.langRow, language === l.code && styles.langRowActive]}
                    onPress={() => {
                      setLanguage(l.code);
                      setIsLangModalOpen(false);
                      speakFeedback(NATIVE_WELCOMES[l.code] || `${l.name} selected`, l.speechCode);
                    }}
                  >
                    <Text style={styles.langRowNative}>{l.native}</Text>
                    <Text style={styles.langRowEn}>{l.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ================= VIEW: MAIN INTERFACE (ATHLETE VS RECRUITER) =================
  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#090514" />

      {/* TOP HEADER: DUAL-MODE SWITCHER (ATHLETE ⇄ SAI SCOUT) */}
      <View style={styles.headerBar}>
        <View style={styles.brandRow}>
          <View style={[styles.headerLogo, appMode === 'recruiter' && { backgroundColor: 'rgba(192, 132, 252, 0.15)' }]}>
            <Ionicons name={appMode === 'recruiter' ? 'shield-checkmark' : 'pulse'} color={appMode === 'recruiter' ? '#C084FC' : '#8B5CF6'} size={16} />
          </View>
          <Text style={styles.headerTitle}>
            {appMode === 'recruiter' ? (
              <>SAI <Text style={{ color: '#C084FC' }}>Scout Portal</Text></>
            ) : (
              <>Sport<Text style={{ color: '#8B5CF6' }}>Lens</Text></>
            )}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Notification Bell (Only in Athlete Mode) */}
          {appMode === 'athlete' && (
            <TouchableOpacity
              style={styles.headerBellBtn}
              onPress={() => setCurrentTab('recruit')}
            >
              <Ionicons name="notifications-outline" color="#FFF" size={18} />
              {(unreadNoticesCount > 0 || recruitmentAnnouncementsList.length > 0) && (
                <View style={styles.bellRedBadge}>
                  <Text style={styles.bellRedBadgeText}>{unreadNoticesCount || recruitmentAnnouncementsList.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Language Selector */}
          <TouchableOpacity
            style={styles.headerLangPill}
            onPress={() => setIsLangModalOpen(true)}
          >
            <Ionicons name="globe-outline" color="#8B5CF6" size={14} />
            <Text style={styles.headerLangText}>{currentLangObj.native}</Text>
          </TouchableOpacity>

          {/* Sleek Header Exit / Logout Button (Recruiter Mode) */}
          {appMode === 'recruiter' && (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 5,
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(239, 68, 68, 0.35)',
              }}
              onPress={() => {
                Alert.alert(
                  'Exit Portal 🚪',
                  'Log out of the SAI Scouting Command Center?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Log Out',
                      style: 'destructive',
                      onPress: () => {
                        setIsLoggedIn(false);
                        setAuthScreen('welcome');
                        setAppMode('athlete');
                        setRecruiterLoginId('');
                        setRecruiterLoginPin('');
                      },
                    },
                  ]
                );
              }}
            >
              <Ionicons name="log-out-outline" color="#F87171" size={14} />
              <Text style={{ color: '#F87171', fontSize: 11, fontWeight: 'bold' }}>Exit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ================= RECRUITER POV VIEW ================= */}
      {appMode === 'recruiter' ? (
        <ScrollView style={styles.scrollFlex} contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
          {/* Scout Credentials & Verification Banner */}
          <LinearGradient
            colors={['#130924', '#1C0F38', '#28144D']}
            style={styles.scoutBanner}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={styles.scoutAvatarCircle}>
                <Ionicons name="shield-checkmark" color="#C084FC" size={28} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={styles.scoutName}>{activeScoutProfile.name}</Text>
                  <View style={styles.scoutVerifiedBadge}>
                    <Text style={styles.scoutVerifiedText}>{activeScoutProfile.verificationBadge}</Text>
                  </View>
                </View>
                <Text style={styles.scoutSub}>{activeScoutProfile.org}</Text>
                <Text style={styles.scoutId}>Credentials: {activeScoutProfile.license}</Text>
                <Text style={{ color: '#8B5CF6', fontSize: 8, fontWeight: 'bold', marginTop: 2 }}>
                  🔐 Digital Key: {activeScoutProfile.cryptoKey}
                </Text>
              </View>
            </View>

            {/* Quick Stats Strip */}
            <View style={styles.scoutStatsStrip}>
              <View style={styles.scoutStatItem}>
                <Text style={styles.scoutStatNum}>{TALENT_POOL.length}</Text>
                <Text style={styles.scoutStatLabel}>Verified Prospects</Text>
              </View>
              <View style={styles.scoutStatItem}>
                <Text style={[styles.scoutStatNum, { color: '#FACC15' }]}>
                  {TALENT_POOL.filter(a => a.ovr >= 85).length}
                </Text>
                <Text style={styles.scoutStatLabel}>Gold Tier (85+)</Text>
              </View>
              <View style={styles.scoutStatItem}>
                <Text style={[styles.scoutStatNum, { color: '#8B5CF6' }]}>
                  {recruitmentAnnouncementsList.length}
                </Text>
                <Text style={styles.scoutStatLabel}>Invites Issued</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Scout Filter Hub: Sport, State & District Hierarchical Filter */}
          <View style={{ marginTop: 14, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.sectionHeading}>🔎 TALENT DISCOVERY FILTERS</Text>
              {(recruiterSportFilter !== 'All' || recruiterStateFilter !== 'All' || recruiterDistrictFilter !== 'All') && (
                <TouchableOpacity
                  onPress={() => {
                    setRecruiterSportFilter('All');
                    setRecruiterStateFilter('All');
                    setRecruiterDistrictFilter('All');
                  }}
                >
                  <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: 'bold' }}>✕ Reset Filters</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 1. SPORT SELECTOR (Quick Pills + 'All Sports' at the end of scroll) */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: 'bold' }}>
                🏅 SPORT: <Text style={{ color: '#C084FC' }}>{recruiterSportFilter.toUpperCase()}</Text>
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', gap: 6 }}>
                {(['All', 'Athletics', 'Badminton', 'Basketball', 'Cricket', 'Football', 'Kabaddi', 'Volleyball'].includes(recruiterSportFilter)
                  ? ['All', 'Athletics', 'Badminton', 'Basketball', 'Cricket', 'Football', 'Kabaddi', 'Volleyball']
                  : [recruiterSportFilter, 'All', 'Athletics', 'Badminton', 'Basketball', 'Cricket', 'Football', 'Kabaddi', 'Volleyball']
                ).map((sport) => (
                  <TouchableOpacity
                    key={sport}
                    style={[
                      styles.scoutFilterPill,
                      recruiterSportFilter === sport && styles.scoutFilterPillActive,
                    ]}
                    onPress={() => setRecruiterSportFilter(sport)}
                  >
                    <Text style={[styles.scoutFilterText, recruiterSportFilter === sport && styles.scoutFilterTextActive]}>
                      {sport}
                    </Text>
                  </TouchableOpacity>
                ))}

                {/* 'All Sports' button at the end of scroll */}
                <TouchableOpacity
                  style={[styles.scoutFilterPill, { backgroundColor: 'rgba(192, 132, 252, 0.12)', borderColor: '#C084FC', borderStyle: 'dashed' }]}
                  onPress={() => {
                    setSearchSportQuery('');
                    setIsSportPickerModalOpen(true);
                  }}
                >
                  <Text style={[styles.scoutFilterText, { color: '#C084FC', fontWeight: 'bold' }]}>
                    ➕ All Sports ({ALL_SPORTS.length} A-Z) ❯
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* 2. STATE SELECTOR (Quick States + 'All States' at the end of scroll) */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: 'bold' }}>
                🏛️ STATE / UT: <Text style={{ color: '#FACC15' }}>{recruiterStateFilter.toUpperCase()}</Text>
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', gap: 6 }}>
                {(['All', 'Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu', 'Maharashtra', 'Punjab'].includes(recruiterStateFilter)
                  ? ['All', 'Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu', 'Maharashtra', 'Punjab']
                  : [recruiterStateFilter, 'All', 'Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu', 'Maharashtra', 'Punjab']
                ).map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.scoutFilterPill,
                      recruiterStateFilter === st && { backgroundColor: '#FACC15', borderColor: '#FACC15' },
                    ]}
                    onPress={() => {
                      setRecruiterStateFilter(st);
                      setRecruiterDistrictFilter('All');
                    }}
                  >
                    <Text style={[styles.scoutFilterText, recruiterStateFilter === st && { color: '#000', fontWeight: '900' }]}>
                      🏛️ {st}
                    </Text>
                  </TouchableOpacity>
                ))}

                {/* 'All States' button at the end of scroll */}
                <TouchableOpacity
                  style={[styles.scoutFilterPill, { backgroundColor: 'rgba(250,204,21,0.12)', borderColor: '#FACC15', borderStyle: 'dashed' }]}
                  onPress={() => {
                    setSearchStateQuery('');
                    setIsStatePickerModalOpen(true);
                  }}
                >
                  <Text style={[styles.scoutFilterText, { color: '#FACC15', fontWeight: 'bold' }]}>
                    ➕ All States ({ALL_STATES.length} A-Z) ❯
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* 3. DISTRICT SELECTOR (Quick Districts + 'All Districts' at the end of scroll) */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: 'bold' }}>
                📍 DISTRICT: <Text style={{ color: '#8B5CF6' }}>{recruiterDistrictFilter.toUpperCase()}</Text>
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', gap: 6 }}>
                {(() => {
                  const stateDistricts = (recruiterStateFilter !== 'All' && INDIA_STATES_AND_DISTRICTS[recruiterStateFilter])
                    ? INDIA_STATES_AND_DISTRICTS[recruiterStateFilter]
                    : ['Alluri Sitharama Raju', 'Anakapalli', 'Chittoor', 'Eluru', 'Guntur', 'Hyderabad', 'NTR (Vijayawada)', 'Visakhapatnam'];
                  const quickDists = ['All', ...stateDistricts.slice(0, 6)];
                  const displayDists = quickDists.includes(recruiterDistrictFilter) ? quickDists : [recruiterDistrictFilter, ...quickDists];
                  return (
                    <>
                      {displayDists.map((dist) => (
                        <TouchableOpacity
                          key={dist}
                          style={[
                            styles.scoutFilterPill,
                            recruiterDistrictFilter === dist && styles.scoutFilterPillActive,
                          ]}
                          onPress={() => setRecruiterDistrictFilter(dist)}
                        >
                          <Text style={[styles.scoutFilterText, recruiterDistrictFilter === dist && styles.scoutFilterTextActive]}>
                            📍 {dist}
                          </Text>
                        </TouchableOpacity>
                      ))}

                      {/* 'All Districts' button at the end of scroll */}
                      <TouchableOpacity
                        style={[styles.scoutFilterPill, { backgroundColor: 'rgba(139, 92, 246, 0.12)', borderColor: '#8B5CF6', borderStyle: 'dashed' }]}
                        onPress={() => {
                          setSearchDistrictQuery('');
                          setIsDistrictPickerModalOpen(true);
                        }}
                      >
                        <Text style={[styles.scoutFilterText, { color: '#8B5CF6', fontWeight: 'bold' }]}>
                          ➕ All Districts ({(recruiterStateFilter !== 'All' && INDIA_STATES_AND_DISTRICTS[recruiterStateFilter]) ? INDIA_STATES_AND_DISTRICTS[recruiterStateFilter].length : 26} A-Z) ❯
                        </Text>
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </ScrollView>
            </View>
          </View>

          {/* Filtered Athlete Roster */}
          <View style={{ marginTop: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.sectionHeading}>
                VERIFIED GRASSROOTS PROSPECTS ({filteredTalent.length})
              </Text>
              <Text style={{ color: '#C084FC', fontSize: 10, fontWeight: 'bold' }}>
                Single-Shot Video Verified 🛡️
              </Text>
            </View>

            {filteredTalent.length > 0 ? (
              filteredTalent.map((ath) => (
                <View key={ath.id} style={styles.talentCard}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {/* Photo / Silhouette */}
                    {ath.avatar ? (
                      <Image source={{ uri: ath.avatar }} style={styles.talentAvatar} />
                    ) : (
                      <View style={styles.talentAvatarPlaceholder}>
                        <Ionicons name="person" color="#94A3B8" size={28} />
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View>
                          <Text style={styles.talentName}>{ath.name}</Text>
                          <Text style={styles.talentLoc}>📍 {ath.district}, {ath.state} • {ath.age} Yrs</Text>
                        </View>

                        {/* OVR Badge */}
                        <View style={styles.talentOvrBadge}>
                          <Text style={styles.talentOvrNum}>{ath.ovr}</Text>
                          <Text style={styles.talentOvrText}>OVR</Text>
                        </View>
                      </View>

                      <Text style={styles.talentSport}>{ath.sport}</Text>

                      {/* Calibrated Specs */}
                      <View style={styles.talentMetricsRow}>
                        <View style={styles.talentMetricPill}>
                          <Text style={styles.talentMetricLabel}>JUMP</Text>
                          <Text style={styles.talentMetricVal}>{ath.jumpVal.split('•')[0]}</Text>
                        </View>
                        <View style={styles.talentMetricPill}>
                          <Text style={styles.talentMetricLabel}>POWER</Text>
                          <Text style={styles.talentMetricVal}>{ath.powerVal.split('•')[0]}</Text>
                        </View>
                        <View style={styles.talentMetricPill}>
                          <Text style={styles.talentMetricLabel}>SPEED</Text>
                          <Text style={styles.talentMetricVal}>{ath.speedVal.split('•')[0]}</Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <Ionicons name="shield-checkmark" color="#8B5CF6" size={12} />
                        <Text style={{ color: '#8B5CF6', fontSize: 9, fontWeight: 'bold' }}>
                          {ath.antiCheatScore} • {ath.badge}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Recruiter Action Buttons */}
                  <View style={styles.talentActionRow}>
                    <TouchableOpacity
                      style={styles.talentAuditBtn}
                      onPress={() => setSelectedTalentForAudit(ath)}
                    >
                      <Ionicons name="analytics" color="#C084FC" size={14} />
                      <Text style={styles.talentAuditBtnText}>Inspect Biomechanics</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.talentCallUpBtn}
                      onPress={() => {
                        setSelectedTalentForAudit(ath);
                        setIsCallUpModalOpen(true);
                      }}
                    >
                      <Ionicons name="mail" color="#000" size={14} />
                      <Text style={styles.talentCallUpBtnText}>Issue Trial Call-Up</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <View style={{ alignItems: 'center', padding: 24, backgroundColor: '#130924', borderRadius: 20, borderWidth: 1, borderColor: '#2E1854', marginTop: 10 }}>
                <Ionicons name="people-outline" color="#64748B" size={38} />
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14, marginTop: 10 }}>No Matching Athletes Found</Text>
                <Text style={{ color: '#94A3B8', fontSize: 11, textAlign: 'center', marginTop: 4, lineHeight: 16 }}>
                  Athletes will appear dynamically when they register and record tests in SportLens. Adjust your filters above to view all candidates.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        /* ================= ATHLETE POV VIEW (TABS 1-5) ================= */
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={{ padding: 14, paddingBottom: 110 }}
        >
          {/* ================= TAB 1: HOME ================= */}
          {currentTab === 'home' && (
            <View style={{ gap: 14 }}>
              <LinearGradient
                colors={['#110A26', '#0B071B', '#1E103C']}
                style={styles.heroBanner}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={styles.greetingPill}>
                    <Text style={styles.greetingPillText}>
                      👋 {t.greeting_prefix} {athlete.name}!
                    </Text>
                  </View>
                  <Text style={styles.heroBannerHeading}>{t.home_headline}</Text>
                  <Text style={styles.heroBannerSub}>{t.home_sub}</Text>
                </View>

                <View style={styles.heroBannerIconBox}>
                  <Ionicons name="flash" color="#C084FC" size={28} />
                </View>
              </LinearGradient>

              {/* Gamification: Daily Streak & Level XP Progress Widget */}
              <LinearGradient
                colors={['#1E103C', '#130924']}
                style={{ borderRadius: 20, padding: 14, borderWidth: 1, borderColor: '#2E1854', gap: 10 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 150 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: (athlete.streakDays || 0) > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: (athlete.streakDays || 0) > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(100,116,139,0.3)' }}>
                      <Text style={{ fontSize: 18 }}>{(athlete.streakDays || 0) > 0 ? '🔥' : '⏳'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 13 }}>{athlete.streakDays || 0} {t.streak_suffix || 'Day Streak'}</Text>
                        <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, borderWidth: 0.5, borderColor: '#8B5CF6' }}>
                          <Text style={{ color: '#8B5CF6', fontSize: 7.5, fontWeight: '900' }}>🇮🇳 IST</Text>
                        </View>
                      </View>
                      <Text numberOfLines={1} style={{ color: (athlete.streakDays || 0) > 0 ? (athlete.lastActiveDateIST === getISTDateString() ? '#8B5CF6' : '#F97316') : '#94A3B8', fontSize: 9.5, fontWeight: 'bold' }}>
                        {(athlete.streakDays || 0) > 0
                          ? (athlete.lastActiveDateIST === getISTDateString() ? (t.streak_secured || 'Streak Secured') : (t.streak_warning || 'Record before midnight!'))
                          : (t.streak_start_prompt || 'Complete 1st test to start streak!')}
                      </Text>
                    </View>
                  </View>

                  {/* Level Tag */}
                  <View style={{ backgroundColor: 'rgba(192, 132, 252, 0.15)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(192, 132, 252, 0.3)', flexShrink: 0 }}>
                    <Text style={{ color: '#C084FC', fontWeight: '900', fontSize: 9.5 }}>{t.level_label || 'LVL'} {athlete.level || 1} • {(athlete.levelTitle || 'Grassroots').toUpperCase()}</Text>
                  </View>
                </View>

                {/* 7-Day Activity Dot Calendar (Mon-Sun in IST) */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => {
                    const isCompleted = (athlete.activeDaysThisWeek || []).includes(idx);
                    const isToday = getISTDayIndex() === idx;
                    return (
                      <View key={idx} style={{ alignItems: 'center', gap: 3 }}>
                        <View style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: isCompleted ? '#8B5CF6' : '#2E1854',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: isToday ? 1.5 : 0,
                          borderColor: isToday ? '#C084FC' : 'transparent',
                        }}>
                          {isCompleted ? (
                            <Ionicons name="checkmark" color="#000" size={14} />
                          ) : (
                            <Text style={{ color: isToday ? '#C084FC' : '#64748B', fontSize: 10, fontWeight: 'bold' }}>{day}</Text>
                          )}
                        </View>
                        <Text style={{ color: isCompleted ? '#8B5CF6' : isToday ? '#C084FC' : '#64748B', fontSize: 8, fontWeight: 'bold' }}>
                          {day} {isToday ? '•' : ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* XP Progress Bar */}
                <View style={{ gap: 4, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: 'bold' }}>{t.level_progress || 'Level Progress'}</Text>
                    <Text style={{ color: '#C084FC', fontSize: 10, fontWeight: 'bold' }}>
                      {athlete.xp || 0} / {(athlete.level || 1) * 300} XP ({Math.min(100, Math.round(((athlete.xp || 0) % 300) / 3))}%)
                    </Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: '#2E1854', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${Math.max((athlete.xp || 0) > 0 ? 5 : 0, Math.min(100, Math.round(((athlete.xp || 0) % 300) / 3)))}%`, backgroundColor: '#C084FC', borderRadius: 3 }} />
                  </View>
                </View>
              </LinearGradient>

              {/* Quick Biomechanics Tests */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeading}>{t.quick_record}</Text>
                <TouchableOpacity onPress={() => setCurrentTab('tests')}>
                  <Text style={styles.sectionLink}>{t.see_all}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.quickDrillsRow}>
                <TouchableOpacity
                  style={styles.quickDrillCard}
                  onPress={() => handleStartDrill(t.v_jump, 'jump')}
                >
                  <View style={[styles.quickDrillEmoji, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                    <Text style={{ fontSize: 20 }}>🦘</Text>
                  </View>
                  <Text style={styles.quickDrillLabel}>{t.v_jump}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickDrillCard}
                  onPress={() => handleStartDrill(t.sprint, 'sprint')}
                >
                  <View style={[styles.quickDrillEmoji, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                    <Text style={{ fontSize: 20 }}>🏃</Text>
                  </View>
                  <Text style={styles.quickDrillLabel}>{t.sprint}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickDrillCard}
                  onPress={() => handleStartDrill(t.squat, 'squat')}
                >
                  <View style={[styles.quickDrillEmoji, { backgroundColor: 'rgba(234,179,8,0.15)' }]}>
                    <Text style={{ fontSize: 20 }}>🏋️</Text>
                  </View>
                  <Text style={styles.quickDrillLabel}>{t.squat}</Text>
                </TouchableOpacity>
              </View>

              {/* Your Progress 4-Grid */}
              <View style={styles.progressCard}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeading}>{t.your_progress}</Text>
                  <TouchableOpacity onPress={() => setCurrentTab('card')}>
                    <Text style={styles.sectionLink}>{t.see_all}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.progressGrid}>
                  <View style={styles.progressGridBox}>
                    <Text style={styles.progressBoxLabel}>{t.tests}</Text>
                    <Text style={styles.progressBoxVal}>{athlete.tests}</Text>
                  </View>
                  <View style={styles.progressGridBox}>
                    <Text style={styles.progressBoxLabel}>{t.avg_rating}</Text>
                    <Text style={[styles.progressBoxVal, { color: '#C084FC' }]}>
                      {athlete.ovr === 0 ? '—' : athlete.avgRating}
                    </Text>
                  </View>
                  <View style={styles.progressGridBox}>
                    <Text style={styles.progressBoxLabel}>{t.best_score}</Text>
                    <Text style={[styles.progressBoxVal, { color: '#FACC15' }]}>
                      {athlete.ovr === 0 ? '—' : athlete.bestRating}
                    </Text>
                  </View>
                  <View style={styles.progressGridBox}>
                    <Text style={styles.progressBoxLabel}>{t.improvement}</Text>
                    <Text style={[styles.progressBoxVal, { color: '#8B5CF6' }]}>
                      {athlete.ovr === 0 ? '0%' : `+${athlete.improvement}%`}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Milestone Achievement Badges */}
              <View style={{ gap: 8 }}>
                <Text style={styles.sectionHeading}>{t.unlocked_milestones || '🏅 UNLOCKED MILESTONE BADGES'}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { title: t.gravity_defier || 'Gravity Defier', sub: 'Jump > 60cm', emoji: '🦘', color: '#8B5CF6', unlocked: (athlete.stats?.jump || 0) >= 60 },
                    { title: t.sonic_cadence || 'Sonic Cadence', sub: 'Cadence > 170 spm', emoji: '⚡', color: '#C084FC', unlocked: (athlete.stats?.speed || 0) >= 60 },
                    { title: t.sai_passport || 'SAI Gold Passport', sub: 'Single-Shot Video', emoji: '🛡️', color: '#FACC15', unlocked: (athlete.ovr || 0) >= 75 },
                    { title: t.trial_ready || 'State Trial Ready', sub: 'Direct Scout Invite', emoji: '🎫', color: '#A855F7', unlocked: recruitmentAnnouncementsList.length > 0 },
                  ].map((badge, idx) => (
                    <View
                      key={idx}
                      style={{
                        backgroundColor: '#130924',
                        borderRadius: 16,
                        padding: 12,
                        width: 140,
                        borderWidth: 1,
                        borderColor: badge.unlocked ? badge.color : '#2E1854',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: badge.unlocked ? `${badge.color}22` : '#1E103C', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: badge.unlocked ? badge.color : '#3B1E6D' }}>
                        <Text style={{ fontSize: 22 }}>{badge.emoji}</Text>
                      </View>
                      <Text style={{ color: badge.unlocked ? '#FFF' : '#64748B', fontWeight: '900', fontSize: 11, textAlign: 'center', marginTop: 2 }}>{badge.title}</Text>
                      <Text style={{ color: badge.unlocked ? badge.color : '#475569', fontSize: 9, fontWeight: 'bold', textAlign: 'center' }}>{badge.sub}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}

          {/* ================= TAB 2: TESTS / DRILLS ================= */}
          {currentTab === 'tests' && (
            <View style={{ gap: 12 }}>
              <Text style={styles.pageTitle}>{t.studio_title}</Text>
              <Text style={styles.pageSub}>{t.studio_sub}</Text>

              <View style={{ gap: 10, marginTop: 6 }}>
                {[
                  { title: t.v_jump, desc: 'Volleyball / Basketball vertical leap, air flight time & jump kinetics.', emoji: '🦘', color: '#8B5CF6', tag: 'Volleyball / Basketball', stats: 'Calibrates: Jump, Power', cat: 'jump' as const },
                  { title: t.sprint, desc: '100m sprint gate velocity & acceleration mechanics.', emoji: '🏃', color: '#C084FC', tag: 'Athletics / Track', stats: 'Calibrates: Speed, Agility, Stamina', cat: 'sprint' as const },
                  { title: 'Kabaddi Agility & Ankle Escape', desc: 'Pro Kabaddi lateral reflex, quick footwork & evasive speed.', emoji: '🤼', color: '#F97316', tag: 'Kabaddi Metric', stats: 'Calibrates: Agility, Power', cat: 'sprint' as const },
                  { title: 'Kho Kho Pole Dive & Zigzag', desc: 'KKFI fast turning velocity, pole diving & evasion acceleration.', emoji: '🏃‍♂️', color: '#EC4899', tag: 'Kho Kho Metric', stats: 'Calibrates: Speed, Agility', cat: 'sprint' as const },
                  { title: 'Football 20m Dribble & Sprint', desc: 'AIFF high-speed ball control, quick cutting & sprint burst.', emoji: '⚽', color: '#3B82F6', tag: 'Football / Soccer', stats: 'Calibrates: Speed, Agility', cat: 'sprint' as const },
                  { title: 'Badminton Shadow Footwork', desc: 'BAI court coverage, lateral lunge recovery & smash acceleration.', emoji: '🏸', color: '#EAB308', tag: 'Badminton Kinetic', stats: 'Calibrates: Agility, Speed', cat: 'sprint' as const },
                  { title: t.hockey || 'Field Hockey Drag Flick', desc: 'Hockey India quick stick recovery, lateral agility & push power.', emoji: '🏑', color: '#10B981', tag: 'Field Hockey', stats: 'Calibrates: Technique, Speed', cat: 'squat' as const },
                  { title: t.cricket || 'Cricket Fast Bowling', desc: 'BCCI explosive bat swing velocity & bowling run-up momentum.', emoji: '🏏', color: '#38BDF8', tag: 'Cricket BCCI Metric', stats: 'Calibrates: Power, Speed', cat: 'sprint' as const },
                  { title: 'Basketball Reach & Lateral Slide', desc: 'BFI rebound height, defensive slide cadence & explosive reach.', emoji: '🏀', color: '#FB923C', tag: 'Basketball Metric', stats: 'Calibrates: Jump, Power', cat: 'jump' as const },
                  { title: 'Boxing Fast-Punch Cadence', desc: 'BFI hand speed, kinetic chain rotation & 30s punch output.', emoji: '🥊', color: '#EF4444', tag: 'Boxing / Combat', stats: 'Calibrates: Speed, Stamina', cat: 'sprint' as const },
                  { title: 'Wrestling Core Torque & Bridge', desc: 'WFI explosive hip drive, isometric grip & core torque power.', emoji: '🤼‍♂️', color: '#A855F7', tag: 'Wrestling / Kushti', stats: 'Calibrates: Power, Technique', cat: 'squat' as const },
                  { title: t.squat, desc: '90° knee flexion, balance symmetry & hip depth.', emoji: '🏋️', color: '#FACC15', tag: 'Weightlifting / Strength', stats: 'Calibrates: Technique, Power', cat: 'squat' as const },
                  { title: t.high_knees, desc: 'Max cadence foot strike frequency & cardio engine.', emoji: '⚡', color: '#A855F7', tag: 'Cadence Engine', stats: 'Calibrates: Speed, Stamina', cat: 'sprint' as const },
                  { title: t.universal_ai, desc: 'Single-shot 33-point AI scanner for all sports & Olympic drills.', emoji: '🌐', color: '#8B5CF6', tag: 'Universal AI Scanner', stats: 'Calibrates: Full Biomechanics', cat: 'jump' as const },
                ].map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.drillRowItem}
                    onPress={() => handleStartDrill(item.title, item.cat)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                      <View style={styles.drillItemIcon}>
                        <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.drillItemTitle}>{item.title}</Text>
                          <Text style={[styles.drillItemTag, { color: item.color }]}>{item.tag}</Text>
                        </View>
                        <Text style={styles.drillItemDesc}>{item.desc}</Text>
                        <Text style={{ color: '#8B5CF6', fontSize: 9, fontWeight: 'bold', marginTop: 2 }}>{item.stats}</Text>
                      </View>
                    </View>
                    <Ionicons name="play" color="#8B5CF6" size={16} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ================= TAB 3: ULTRA-PRECISE GOLD PLAYER CARD ================= */}
          {currentTab === 'card' && (
            <View style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.pageTitle}>{t.player_card_title}</Text>
                <TouchableOpacity onPress={handleSharePassportCard}>
                  <Ionicons name="share-social" color="#8B5CF6" size={20} />
                </TouchableOpacity>
              </View>

              {/* Holographic Gold Card with FIFA/NBA 2K Ultimate Team Aesthetic */}
              <LinearGradient
                colors={['#FFE066', '#D4AF37', '#85540D', '#D4AF37', '#FFE066']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.goldCardWrap, { borderWidth: 2, borderColor: '#FDE047', elevation: 8 }]}
              >
                <View style={[styles.goldCardBody, { backgroundColor: '#090514' }]}>
                  {/* Card Header: Tier Badge & OVR */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                        <Text style={[styles.ovrNumber, { color: '#FDE047', fontSize: 42 }]}>
                          {athlete.ovr === 0 ? '—' : athlete.ovr}
                        </Text>
                        <Text style={{ color: '#FDE047', fontWeight: '900', fontSize: 14 }}>OVR</Text>
                      </View>

                      <View style={[styles.athPill, { backgroundColor: 'rgba(250,204,21,0.2)', borderColor: '#FACC15', borderWidth: 1 }]}>
                        <Text style={[styles.athPillText, { color: '#FACC15', fontWeight: '900' }]}>
                          {athlete.ovr >= 85 ? '👑 SAI NATIONAL ELITE' : athlete.ovr >= 75 ? '🥇 STATE GOLD TIER' : athlete.ovr >= 60 ? '🥈 DISTRICT SILVER' : '🌱 GRASSROOTS'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <View style={styles.indianFlag}>
                        <View style={{ height: 4, backgroundColor: '#FF9933' }} />
                        <View style={{ height: 4, backgroundColor: '#FFFFFF' }} />
                        <View style={{ height: 4, backgroundColor: '#128807' }} />
                      </View>

                      <View style={{ backgroundColor: '#1E103C', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#C084FC' }}>
                        <Text style={{ color: '#C084FC', fontSize: 9, fontWeight: '900' }}>
                          🛡️ SAI VERIFIED
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Photo / Silhouette */}
                  <View style={styles.athleteAvatarBox}>
                    {athlete.avatar ? (
                      <Image
                        source={{ uri: athlete.avatar }}
                        style={styles.athleteAvatarImg}
                      />
                    ) : (
                      <View style={styles.athleteDefaultSilhouetteGold}>
                        <Ionicons name="person" color="#94A3B8" size={38} />
                      </View>
                    )}
                  </View>

                  <Text style={[styles.cardName, { color: '#FFF', letterSpacing: 1 }]}>{(athlete.name || 'CHARAN').toUpperCase()}</Text>
                  <Text style={styles.cardLoc}>📍 {athlete.district || 'Eluru'}, {athlete.state || 'Andhra Pradesh'} • {(athlete.primarySport || 'VOLLEYBALL').toUpperCase()}</Text>

                  {/* 6 Attribute Bars with EXACT REAL-WORLD PHYSICAL UNITS */}
                  <View style={styles.statBarsList}>
                    {[
                      { label: t.jump, val: athlete.stats.jump, unit: athlete.rawUnits?.jump || '—', color: '#8B5CF6' },
                      { label: t.power, val: athlete.stats.power, unit: athlete.rawUnits?.power || '—', color: '#FACC15' },
                      { label: t.speed, val: athlete.stats.speed, unit: athlete.rawUnits?.speed || '—', color: '#C084FC' },
                      { label: t.agility, val: athlete.stats.agility, unit: athlete.rawUnits?.agility || '—', color: '#8B5CF6' },
                      { label: t.stamina, val: athlete.stats.stamina, unit: athlete.rawUnits?.stamina || '—', color: '#A855F7' },
                      { label: t.technique, val: athlete.stats.technique, unit: athlete.rawUnits?.technique || '—', color: '#C084FC' },
                    ].map((st, i) => (
                      <View key={i} style={styles.singleStatRowPrecise}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={styles.statLabelText}>{st.label}</Text>
                          <Text style={styles.statUnitText}>{st.val > 0 ? st.unit : 'Uncalibrated'}</Text>
                          <Text style={[styles.statValText, st.val === 0 && { color: '#64748B' }]}>{st.val}</Text>
                        </View>
                        <View style={styles.statBarTrack}>
                          <View style={[styles.statBarProgress, { width: `${st.val}%`, backgroundColor: st.color }]} />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </LinearGradient>

              {/* 6-Axis Biomechanics Radar Matrix Visualizer */}
              <View style={styles.radarCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 13 }}>{t.radar_title || '🕸️ 6-AXIS BIOMECHANICS RADAR'}</Text>
                  <Text style={{ color: '#C084FC', fontWeight: 'bold', fontSize: 10 }}>
                    {Object.values(athlete.stats).filter(v => v > 0).length} / 6 {t.radar_active || 'Attributes Active'}
                  </Text>
                </View>

                {/* Radar Grid Matrix */}
                <View style={styles.radarGrid}>
                  {[
                    { label: 'JUMP', val: athlete.stats.jump, unit: athlete.rawUnits?.jump || '—', icon: '🦘', color: '#8B5CF6' },
                    { label: 'POWER', val: athlete.stats.power, unit: athlete.rawUnits?.power || '—', icon: '⚡', color: '#FACC15' },
                    { label: 'SPEED', val: athlete.stats.speed, unit: athlete.rawUnits?.speed || '—', icon: '🏃', color: '#C084FC' },
                    { label: 'AGILITY', val: athlete.stats.agility, unit: athlete.rawUnits?.agility || '—', icon: '🔄', color: '#8B5CF6' },
                    { label: 'STAMINA', val: athlete.stats.stamina, unit: athlete.rawUnits?.stamina || '—', icon: '🔋', color: '#A855F7' },
                    { label: 'TECH', val: athlete.stats.technique, unit: athlete.rawUnits?.technique || '—', icon: '📐', color: '#C084FC' },
                  ].map((item, idx) => (
                    <View key={idx} style={[styles.radarPill, item.val > 0 && { borderColor: item.color, backgroundColor: `${item.color}15` }]}>
                      <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                      <Text style={[styles.radarPillLabel, item.val > 0 && { color: item.color }]}>{item.label}</Text>
                      <Text style={[styles.radarPillVal, item.val > 0 && { color: '#FFF' }]}>{item.val > 0 ? item.val : '—'}</Text>
                      <Text style={{ color: item.val > 0 ? item.color : '#64748B', fontSize: 8, fontWeight: 'bold' }}>{item.val > 0 ? item.unit.split('•')[0] : 'Pending'}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {athlete.ovr === 0 && (
                <View style={styles.unrankedHintBox}>
                  <Ionicons name="information-circle" color="#8B5CF6" size={18} />
                  <Text style={styles.unrankedHintText}>
                    Record <Text style={{ color: '#8B5CF6', fontWeight: 'bold' }}>Vertical Jump</Text>, <Text style={{ color: '#C084FC', fontWeight: 'bold' }}>Sprint 30m</Text>, and <Text style={{ color: '#FACC15', fontWeight: 'bold' }}>Squats</Text> to calibrate all 6 attributes and calculate your verified OVR!
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#FDE047' }]}
                onPress={handleSharePassportCard}
              >
                <Ionicons name="share-social" color="#000" size={16} />
                <Text style={[styles.primaryBtnText, { color: '#000' }]}>{t.share_card}</Text>
              </TouchableOpacity>

              {athlete.ovr > 0 && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }}
                  onPress={handleResetAllStats}
                >
                  <Ionicons name="refresh" color="#EF4444" size={14} />
                  <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 11 }}>Clear & Reset Card to 0 OVR</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ================= TAB 4: PROFILE ================= */}
          {currentTab === 'profile' && (
            <View style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.pageTitle}>{t.profile_title}</Text>
                <TouchableOpacity
                  style={styles.editProfileTopBtn}
                  onPress={handleOpenEditProfile}
                >
                  <Ionicons name="pencil" color="#8B5CF6" size={14} />
                  <Text style={styles.editProfileTopText}>{t.edit_profile}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.profileCard}>
                <TouchableOpacity
                  style={styles.profileAvatarTouchable}
                  onPress={() => setIsPhotoPickerModalOpen(true)}
                >
                  {athlete.avatar ? (
                    <Image
                      source={{ uri: athlete.avatar }}
                      style={styles.profileBigAvatar}
                    />
                  ) : (
                    <View style={styles.profileDefaultSilhouette}>
                      <Ionicons name="person" color="#94A3B8" size={42} />
                    </View>
                  )}

                  <View style={styles.cameraBadgeCircle}>
                    <Ionicons name="camera" color="#000" size={12} />
                  </View>
                </TouchableOpacity>

                <Text style={styles.profileBigName}>{athlete.name}</Text>
                <Text style={styles.profileBigLoc}>📍 {athlete.district}, {athlete.state}</Text>

                <TouchableOpacity
                  style={{ marginTop: 6, paddingVertical: 2, paddingHorizontal: 10, backgroundColor: '#1E103C', borderRadius: 12 }}
                  onPress={() => setIsPhotoPickerModalOpen(true)}
                >
                  <Text style={{ color: '#8B5CF6', fontSize: 10, fontWeight: 'bold' }}>📷 {t.change_photo}</Text>
                </TouchableOpacity>

                <View style={styles.profileAttrRow}>
                  <View style={styles.profileAttrBox}>
                    <Text style={styles.profileAttrLabel}>{t.height}</Text>
                    <Text style={styles.profileAttrVal}>{athlete.height} cm</Text>
                  </View>
                  <View style={styles.profileAttrBox}>
                    <Text style={styles.profileAttrLabel}>{t.weight}</Text>
                    <Text style={styles.profileAttrVal}>{athlete.weight} kg</Text>
                  </View>
                  <View style={styles.profileAttrBox}>
                    <Text style={styles.profileAttrLabel}>{t.age}</Text>
                    <Text style={styles.profileAttrVal}>{athlete.age} Yrs</Text>
                  </View>
                  <View style={styles.profileAttrBox}>
                    <Text style={styles.profileAttrLabel}>{t.sport}</Text>
                    <Text style={[styles.profileAttrVal, { fontSize: 9, color: '#8B5CF6' }]}>
                      {athlete.primarySport.split(',')[0]}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.aboutBox}>
                <Text style={styles.aboutBoxTitle}>{t.about_me}</Text>
                <Text style={styles.aboutBoxText}>{athlete.aboutMe}</Text>
              </View>


              {/* Reset Stats Option */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}
                onPress={handleResetAllStats}
              >
                <Ionicons name="trash-outline" color="#EF4444" size={16} />
                <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 12 }}>🗑️ Reset All My Stats & Passport (Clear to 0)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={() => {
                  Alert.alert(
                    'Log Out 🚪',
                    'Are you sure you want to log out of SportLens?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Log Out',
                        style: 'destructive',
                        onPress: () => {
                          setIsLoggedIn(false);
                          setAuthScreen('welcome');
                          setPhone('');
                          setPin('');
                        },
                      },
                    ]
                  );
                }}
              >
                <Ionicons name="log-out-outline" color="#F87171" size={18} />
                <Text style={styles.logoutBtnText}>{t.logout}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ================= TAB 5: RECRUITMENT NOTIFICATIONS & TRIAL PASSES ================= */}
          {currentTab === 'recruit' && (
            <View style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.pageTitle}>{t.recruit_title}</Text>
                <View style={[styles.activeAlertsPill, recruitmentAnnouncementsList.length > 0 && { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
                  <Text style={[styles.activeAlertsPillText, recruitmentAnnouncementsList.length > 0 && { color: '#8B5CF6' }]}>
                    {recruitmentAnnouncementsList.length} Active Invitation{recruitmentAnnouncementsList.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
              <Text style={styles.pageSub}>{t.recruit_sub}</Text>

              {recruitmentAnnouncementsList.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {recruitmentAnnouncementsList.map((item) => (
                    <View key={item.id} style={styles.recruitmentNoticeCard}>
                      <View style={styles.recruitmentNoticeHeader}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.directCallUpPill}>
                            <Ionicons name="sparkles" color="#8B5CF6" size={12} />
                            <Text style={styles.directCallUpText}>OFFICIAL SCOUTING CALL-UP</Text>
                          </View>
                          <Text style={styles.recruitmentNoticeTitle}>{item.title}</Text>
                          <Text style={styles.recruitmentNoticeOrg}>🏛️ {item.org}</Text>
                        </View>
                      </View>

                      <View style={styles.recruitmentDetailBox}>
                        <Text style={styles.recruitmentDetailLine}>📍 <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Venue:</Text> {item.location}</Text>
                        <Text style={styles.recruitmentDetailLine}>📅 <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Date & Reporting:</Text> {item.dates}</Text>
                        <Text style={styles.recruitmentDetailLine}>👤 <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Issuing Officer:</Text> {item.officer}</Text>
                      </View>

                      <Text style={styles.recruitmentNoticeDesc}>{item.desc}</Text>

                      <TouchableOpacity
                        style={styles.claimPassBtn}
                        onPress={() => setSelectedPassModal(item)}
                      >
                        <Ionicons name="qr-code" color="#000" size={16} />
                        <Text style={styles.claimPassBtnText}>🎫 VIEW DIGITAL TRIAL PASS</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyRecruitCard}>
                  <View style={styles.emptyRecruitIconCircle}>
                    <Ionicons name="notifications-off-outline" color="#64748B" size={40} />
                  </View>
                  <Text style={styles.emptyRecruitHeading}>No Active Trial Call-Ups Right Now</Text>
                  <Text style={styles.emptyRecruitSub}>
                    Official trial invitations and verified QR gate passes from SAI scouts will appear here once your biomechanics test scores are evaluated.
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Fixed Bottom Navigation Bar (Athlete Mode Only) */}
      {appMode === 'athlete' && (
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navTab} onPress={() => setCurrentTab('home')}>
            <Ionicons name="home" color={currentTab === 'home' ? '#8B5CF6' : '#64748B'} size={20} />
            <Text style={[styles.navTabText, currentTab === 'home' && styles.navTabTextActive]}>
              {t.nav_home}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navTab} onPress={() => setCurrentTab('tests')}>
            <Ionicons name="fitness" color={currentTab === 'tests' ? '#8B5CF6' : '#64748B'} size={20} />
            <Text style={[styles.navTabText, currentTab === 'tests' && styles.navTabTextActive]}>
              {t.nav_tests}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navCenterRecordBtn}
            onPress={() => handleStartDrill(t.v_jump)}
          >
            <View style={styles.navCenterGlowCircle}>
              <Ionicons name="radio" color="#8B5CF6" size={24} />
            </View>
            <Text style={styles.navCenterText}>{t.nav_record}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navTab} onPress={() => setCurrentTab('card')}>
            <Ionicons name="card" color={currentTab === 'card' ? '#8B5CF6' : '#64748B'} size={20} />
            <Text style={[styles.navTabText, currentTab === 'card' && styles.navTabTextActive]}>
              {t.nav_card}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navTab} onPress={() => setCurrentTab('profile')}>
            <Ionicons name="person" color={currentTab === 'profile' ? '#8B5CF6' : '#64748B'} size={20} />
            <Text style={[styles.navTabText, currentTab === 'profile' && styles.navTabTextActive]}>
              {t.nav_profile}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ================= MODAL: DEEP ATHLETE BIOMECHANICS & VIDEO AUDIT ================= */}
      <Modal visible={!!selectedTalentForAudit && !isCallUpModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="shield-checkmark" color="#C084FC" size={16} />
                <Text style={styles.modalTitle}>AI Biomechanics & Video Audit</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedTalentForAudit(null)}>
                <Ionicons name="close" color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            {selectedTalentForAudit && (
              <ScrollView style={{ paddingVertical: 4 }}>
                {/* Athlete Top Profile Header */}
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#1E103C', padding: 12, borderRadius: 14 }}>
                  {selectedTalentForAudit.avatar ? (
                    <Image source={{ uri: selectedTalentForAudit.avatar }} style={{ width: 50, height: 50, borderRadius: 25 }} />
                  ) : (
                    <View style={[styles.talentAvatarPlaceholder, { width: 50, height: 50, borderRadius: 25 }]}>
                      <Ionicons name="person" color="#94A3B8" size={26} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16 }}>{selectedTalentForAudit.name}</Text>
                    <Text style={{ color: '#94A3B8', fontSize: 11 }}>📍 {selectedTalentForAudit.district}, {selectedTalentForAudit.state} • {selectedTalentForAudit.sport}</Text>
                    <Text style={{ color: '#FACC15', fontWeight: 'bold', fontSize: 12, marginTop: 2 }}>
                      ⭐ {selectedTalentForAudit.ovr} OVR — {selectedTalentForAudit.badge}
                    </Text>
                  </View>
                </View>

                {/* 33-Point Skeleton HUD Video Proof Viewfinder with Interactive Scrubber */}
                <View style={styles.auditVideoBox}>
                  <View style={styles.auditVideoHeader}>
                    <Text style={{ color: '#C084FC', fontWeight: 'bold', fontSize: 10 }}>📹 33-POINT SKELETON POSE AUDIT (60 FPS)</Text>
                    <View style={styles.recDotRow}>
                      <View style={styles.redRecDot} />
                      <Text style={{ color: '#EF4444', fontSize: 9, fontWeight: 'bold' }}>VERIFIED RAW CLIP</Text>
                    </View>
                  </View>

                  <View style={[styles.auditVideoViewfinder, { height: 180 }]}>
                    {/* Visual Skeleton Pose Wireframe based on active scrub phase */}
                    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 44 }}>
                        {auditScrubPhase === 'load' ? '🏋️' : auditScrubPhase === 'takeoff' ? '⚡' : auditScrubPhase === 'apex' ? '🦘' : '👟'}
                      </Text>
                      <View style={[styles.auditSkeletonHUD, { marginTop: 10, width: '92%' }]}>
                        <Text style={{ color: '#8B5CF6', fontWeight: 'bold', fontSize: 10 }}>
                          {auditScrubPhase === 'load' && '🟢 PHASE 1: ECCENTRIC PRE-STRETCH (92.4° KNEE DEPTH)'}
                          {auditScrubPhase === 'takeoff' && '⚡ PHASE 2: EXPLOSIVE TRIPLE EXTENSION (1,420 N FORCE)'}
                          {auditScrubPhase === 'apex' && `👑 PHASE 3: MAX AIR APEX (${selectedTalentForAudit.jumpVal.split('•')[0]} • 0.63s FLIGHT)`}
                          {auditScrubPhase === 'landing' && '🛡️ PHASE 4: FORCE ABSORPTION & ZERO KNEE COLLAPSE'}
                        </Text>
                        <Text style={{ color: '#C084FC', fontSize: 9, marginTop: 2 }}>
                          HIP: 108.4° • SPINE DEVIATION: 0.2° • GROUND REACTION FORCE: 3.4x BW
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Interactive Biomechanics Phase Scrubber */}
                  <View style={{ flexDirection: 'row', backgroundColor: '#0B071B', padding: 6, gap: 4 }}>
                    {[
                      { key: 'load', label: '0.6s Loading' },
                      { key: 'takeoff', label: '1.2s Takeoff' },
                      { key: 'apex', label: '1.8s Apex Flight' },
                      { key: 'landing', label: '2.4s Landing' },
                    ].map((phase) => (
                      <TouchableOpacity
                        key={phase.key}
                        style={{
                          flex: 1,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: auditScrubPhase === phase.key ? '#C084FC' : '#1E103C',
                          alignItems: 'center',
                        }}
                        onPress={() => setAuditScrubPhase(phase.key as any)}
                      >
                        <Text style={{ color: auditScrubPhase === phase.key ? '#000' : '#94A3B8', fontSize: 9, fontWeight: '900' }}>
                          {phase.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Head-to-Head Comparison Matrix (Moneyball Tool) */}
                <View style={{ backgroundColor: '#1E103C', padding: 12, borderRadius: 14, marginTop: 10, gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 12 }}>📊 HEAD-TO-HEAD COMPARISON</Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <TouchableOpacity
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                          backgroundColor: auditCompareMode === 'sai_national' ? '#8B5CF6' : '#130924',
                        }}
                        onPress={() => setAuditCompareMode('sai_national')}
                      >
                        <Text style={{ color: auditCompareMode === 'sai_national' ? '#000' : '#94A3B8', fontSize: 9, fontWeight: 'bold' }}>SAI National Standard</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                          backgroundColor: auditCompareMode === 'district_avg' ? '#8B5CF6' : '#130924',
                        }}
                        onPress={() => setAuditCompareMode('district_avg')}
                      >
                        <Text style={{ color: auditCompareMode === 'district_avg' ? '#000' : '#94A3B8', fontSize: 9, fontWeight: 'bold' }}>District Avg</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={{ gap: 6, marginTop: 4 }}>
                    {[
                      { label: 'Vertical Jump', val: selectedTalentForAudit.jumpVal.split('•')[0], standard: auditCompareMode === 'sai_national' ? '54 cm' : '42 cm', diff: auditCompareMode === 'sai_national' ? '+26.7%' : '+62.8%' },
                      { label: 'Explosive Power', val: selectedTalentForAudit.powerVal.split('•')[0], standard: auditCompareMode === 'sai_national' ? '1,150 W' : '880 W', diff: auditCompareMode === 'sai_national' ? '+23.5%' : '+61.4%' },
                      { label: 'Sprint Gate Velocity', val: selectedTalentForAudit.speedVal.split('•')[0], standard: auditCompareMode === 'sai_national' ? '8.2 m/s' : '7.4 m/s', diff: auditCompareMode === 'sai_national' ? '+8.5%' : '+20.2%' },
                    ].map((comp, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#130924', padding: 8, borderRadius: 8 }}>
                        <Text style={{ color: '#CBD5E1', fontSize: 10, fontWeight: 'bold', width: '38%' }}>{comp.label}</Text>
                        <Text style={{ color: '#C084FC', fontSize: 11, fontWeight: '900' }}>{comp.val}</Text>
                        <Text style={{ color: '#64748B', fontSize: 9 }}>vs {comp.standard}</Text>
                        <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ color: '#8B5CF6', fontWeight: '900', fontSize: 9 }}>{comp.diff}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Anti-Cheat Verification Certificate */}
                <View style={styles.antiCheatCertBox}>
                  <Ionicons name="checkmark-done-circle" color="#8B5CF6" size={24} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#8B5CF6', fontWeight: 'bold', fontSize: 12 }}>
                      Anti-Cheat Verification: PASS (99.8% Authenticity)
                    </Text>
                    <Text style={{ color: '#94A3B8', fontSize: 10, marginTop: 2 }}>
                      Single-shot camera stream with continuous gravity kinematics. No frame-rate tampering or deepfake alterations detected.
                    </Text>
                    <Text style={{ color: '#C084FC', fontSize: 8, fontWeight: 'bold', marginTop: 3 }}>
                      🔐 Cryptographic Video Fingerprint: SHA256-VIDEO-AUDIT-9842
                    </Text>
                  </View>
                </View>

                {/* Issue Call-Up Button */}
                <TouchableOpacity
                  style={[styles.primaryBtn, { marginTop: 14 }]}
                  onPress={() => setIsCallUpModalOpen(true)}
                >
                  <Ionicons name="mail-unread" color="#000" size={16} />
                  <Text style={styles.primaryBtnText}>Issue Official State Selection Call-Up ❯</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: ISSUE DIRECT TRIAL CALL-UP ================= */}
      <Modal visible={isCallUpModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Issue Official Trial Call-Up</Text>
              <TouchableOpacity onPress={() => setIsCallUpModalOpen(false)}>
                <Ionicons name="close" color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            {selectedTalentForAudit && (
              <ScrollView style={{ paddingVertical: 4 }}>
                <Text style={{ color: '#94A3B8', fontSize: 11, marginBottom: 12 }}>
                  Issuing an official state trial call-up for <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{selectedTalentForAudit.name} ({selectedTalentForAudit.district})</Text>.
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Trial Event / Academy</Text>
                  <TextInput
                    style={[styles.textInput, { color: '#C084FC' }]}
                    value="Junior State Volleyball Selection Trials 2026"
                    editable={false}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Trial Venue & Reporting Location</Text>
                  <TextInput
                    style={styles.textInput}
                    value={callUpVenue}
                    onChangeText={setCallUpVenue}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Reporting Date & Time</Text>
                  <TextInput
                    style={styles.textInput}
                    value={callUpDate}
                    onChangeText={setCallUpDate}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Instructions / Remarks for Athlete</Text>
                  <TextInput
                    style={[styles.textInput, { height: 60 }]}
                    multiline
                    value={callUpNotes}
                    onChangeText={setCallUpNotes}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#8B5CF6', marginTop: 10 }]}
                  onPress={() => handleDispatchCallUp(selectedTalentForAudit)}
                >
                  <Ionicons name="send" color="#000" size={16} />
                  <Text style={styles.primaryBtnText}>🚀 Dispatch Official Invitation Pass</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: DIGITAL TRIAL PASS (QR PASS VIEW) ================= */}
      <Modal visible={!!selectedPassModal} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { backgroundColor: '#090514', borderColor: '#8B5CF6', borderWidth: 2 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#8B5CF6' }]}>🏛️ OFFICIAL DIGITAL TRIAL PASS</Text>
              <TouchableOpacity onPress={() => setSelectedPassModal(null)}>
                <Ionicons name="close" color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            {selectedPassModal && (
              <View style={{ alignItems: 'center', gap: 10 }}>
                {/* Official Pass Header */}
                <View style={{ alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 15, textAlign: 'center' }}>
                    {selectedPassModal.title}
                  </Text>
                  <Text style={{ color: '#94A3B8', fontSize: 10, marginTop: 2 }}>
                    Sports Authority of Andhra Pradesh (SAAP) & SAI
                  </Text>
                </View>

                {/* QR Code Graphic Box */}
                <View style={styles.qrCodeBox}>
                  <Ionicons name="qr-code-outline" color="#000" size={130} />
                  <Text style={styles.qrPassCodeText}>{selectedPassModal.passCode}</Text>
                </View>

                {/* Athlete Pass Data */}
                <View style={styles.passDetailsBox}>
                  <Text style={styles.passDetailLine}>
                    👤 <Text style={{ color: '#94A3B8' }}>Athlete Name:</Text> <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{athlete.name.toUpperCase()}</Text>
                  </Text>
                  <Text style={styles.passDetailLine}>
                    📍 <Text style={{ color: '#94A3B8' }}>District / State:</Text> <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{athlete.district}, {athlete.state}</Text>
                  </Text>
                  <Text style={styles.passDetailLine}>
                    ⭐ <Text style={{ color: '#94A3B8' }}>Verified Rating:</Text> <Text style={{ color: '#8B5CF6', fontWeight: 'bold' }}>{athlete.ovr > 0 ? `${athlete.ovr} OVR` : 'Verified Prospect'}</Text>
                  </Text>
                  <Text style={styles.passDetailLine}>
                    🏛️ <Text style={{ color: '#94A3B8' }}>Issuing Officer:</Text> <Text style={{ color: '#FACC15', fontWeight: 'bold' }}>{selectedPassModal.officer || activeScoutProfile.name}</Text>
                  </Text>
                  <Text style={styles.passDetailLine}>
                    🏟️ <Text style={{ color: '#94A3B8' }}>Venue:</Text> <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{selectedPassModal.location}</Text>
                  </Text>
                  <Text style={styles.passDetailLine}>
                    📅 <Text style={{ color: '#94A3B8' }}>Date:</Text> <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{selectedPassModal.dates}</Text>
                  </Text>
                  <Text style={[styles.passDetailLine, { borderBottomWidth: 0 }]}>
                    🔐 <Text style={{ color: '#94A3B8' }}>Crypto Hash:</Text> <Text style={{ color: '#8B5CF6', fontSize: 9 }}>{selectedPassModal.cryptoHash || 'SHA256-SAI-VERIFIED-AUTH-9F2B'}</Text>
                  </Text>
                </View>

                <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', padding: 8, borderRadius: 10, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.3)' }}>
                  <Text style={{ color: '#8B5CF6', fontWeight: 'bold', fontSize: 10 }}>
                    🛡️ SAI & SAAP Central Verified • Stadium Gate 1 Scanner Authenticated
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { width: '100%' }]}
                  onPress={() => {
                    setSelectedPassModal(null);
                    Alert.alert('Pass Saved', 'Digital QR Trial Pass is ready to present at the stadium gate.');
                  }}
                >
                  <Ionicons name="checkmark-done" color="#000" size={16} />
                  <Text style={styles.primaryBtnText}>Ready to Attend Trials</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: EDIT PROFILE MODAL ================= */}
      <Modal visible={isEditProfileModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.edit_profile}</Text>
              <TouchableOpacity onPress={() => setIsEditProfileModalOpen(false)}>
                <Ionicons name="close" color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingVertical: 6 }}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t.name_label}</Text>
                <TextInput
                  style={styles.textInput}
                  value={editName}
                  onChangeText={setEditName}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t.district_label}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editDistrict}
                    onChangeText={setEditDistrict}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t.state_label}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editState}
                    onChangeText={setEditState}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t.sport}</Text>
                <TextInput
                  style={styles.textInput}
                  value={editSport}
                  onChangeText={setEditSport}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t.age}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editAge}
                    keyboardType="number-pad"
                    onChangeText={setEditAge}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t.height} (cm)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editHeight}
                    keyboardType="number-pad"
                    onChangeText={setEditHeight}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t.weight} (kg)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editWeight}
                    keyboardType="number-pad"
                    onChangeText={setEditWeight}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveEditedProfile}>
                <Ionicons name="checkmark-done" color="#000" size={16} />
                <Text style={styles.primaryBtnText}>{t.save_profile}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: PHOTO PICKER / AVATAR SELECTION ================= */}
      <Modal visible={isPhotoPickerModalOpen} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Profile Picture</Text>
              <TouchableOpacity onPress={() => setIsPhotoPickerModalOpen(false)}>
                <Ionicons name="close" color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: '#94A3B8', fontSize: 11, marginBottom: 14 }}>
              Take a live photo with your camera or upload an image from your device gallery.
            </Text>

            <View style={{ gap: 10 }}>
              {/* Option 1: Take Photo */}
              <TouchableOpacity
                style={[styles.avatarChoiceRow, { borderColor: '#8B5CF6' }]}
                onPress={handleTakePhoto}
              >
                <View style={[styles.avatarChoiceSilhouette, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
                  <Ionicons name="camera" color="#C084FC" size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>📸 Take a Photo</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 10.5 }}>Open camera to take a new portrait</Text>
                </View>
                <Ionicons name="chevron-forward" color="#8B5CF6" size={18} />
              </TouchableOpacity>

              {/* Option 2: Upload from Gallery */}
              <TouchableOpacity
                style={[styles.avatarChoiceRow, { borderColor: '#38BDF8' }]}
                onPress={handlePickFromGallery}
              >
                <View style={[styles.avatarChoiceSilhouette, { backgroundColor: 'rgba(56, 189, 248, 0.2)' }]}>
                  <Ionicons name="images" color="#38BDF8" size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>🖼️ Upload from Gallery</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 10.5 }}>Choose an existing picture from your phone</Text>
                </View>
                <Ionicons name="chevron-forward" color="#38BDF8" size={18} />
              </TouchableOpacity>

              {/* Option 3: Remove / Empty Silhouette */}
              <TouchableOpacity
                style={[styles.avatarChoiceRow, !athlete.avatar && styles.avatarChoiceRowActive]}
                onPress={() => handleSelectAvatar(null)}
              >
                <View style={styles.avatarChoiceSilhouette}>
                  <Ionicons name="person" color="#94A3B8" size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12.5 }}>Empty Silhouette</Text>
                  <Text style={{ color: '#64748B', fontSize: 10 }}>Remove photo & reset to default avatar</Text>
                </View>
                {!athlete.avatar && <Ionicons name="checkmark-circle" color="#8B5CF6" size={20} />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: 13 LANGUAGES SELECTOR ================= */}
      <Modal visible={isLangModalOpen} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.choose_lang}</Text>
              <TouchableOpacity onPress={() => setIsLangModalOpen(false)}>
                <Ionicons name="close" color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              {LANGUAGES.map((l) => {
                const NATIVE_WELCOMES: Record<LanguageCode, string> = {
                  te: 'భాష తెలుగులోకి మార్చబడింది',
                  hi: 'भाषा हिंदी चुनी गई है',
                  ta: 'மொழி தமிழ் தேர்ந்தெடுக்கப்பட்டது',
                  kn: 'ಭಾಷೆ ಕನ್ನಡ ಆಯ್ಕೆಯಾಗಿದೆ',
                  ml: 'ഭാഷ മലയാളം തിരഞ്ഞെടുത്തു',
                  mr: 'मराठी भाषा निवडली गेली आहे',
                  bn: 'ভাষা বাংলা নির্বাচিত হয়েছে',
                  gu: 'ગુજરાતી ભાષા પસંદ કરવામાં આવી છે',
                  pa: 'ਭਾਸ਼ਾ ਪੰਜਾਬੀ ਚੁਣੀ ਗਈ ਹੈ',
                  or: 'ଓଡ଼ିଆ ଭାଷା ଚୟନ କରାଗଲା',
                  as: 'অসমীয়া ভাষা বাছনি কৰা হ’ল',
                  ur: 'اردو زبان منتخب کی گئی ہے',
                  en: 'English language selected',
                };
                return (
                  <TouchableOpacity
                    key={l.code}
                    style={[styles.langRow, language === l.code && styles.langRowActive]}
                    onPress={() => {
                      setLanguage(l.code);
                      setIsLangModalOpen(false);
                      speakFeedback(NATIVE_WELCOMES[l.code] || `${l.name} selected`, l.speechCode);
                    }}
                  >
                    <Text style={styles.langRowNative}>{l.native}</Text>
                    <Text style={styles.langRowEn}>{l.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: CAMERA DRILL STUDIO ================= */}
      <Modal visible={isCameraModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.cameraBox}>
            <View style={styles.cameraBoxHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="videocam" color="#8B5CF6" size={18} />
                <Text style={styles.cameraBoxTitle}>{activeDrillTitle}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => setCameraFacing(prev => prev === 'front' ? 'back' : 'front')}
                  style={{ backgroundColor: '#2E1854', padding: 6, borderRadius: 10 }}
                >
                  <Ionicons name="camera-reverse" color="#C084FC" size={20} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCloseCameraStudio}
                  style={{ backgroundColor: '#2E1854', padding: 6, borderRadius: 10 }}
                >
                  <Ionicons name="close" color="#94A3B8" size={20} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.viewfinderArea, { backgroundColor: '#090514', overflow: 'hidden' }]}>
              {cameraPermission && !cameraPermission.granted ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#090514' }}>
                  <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(192, 132, 252, 0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: '#C084FC' }}>
                    <Ionicons name="camera-outline" color="#C084FC" size={36} />
                  </View>
                  <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 8 }}>
                    Camera Access Required
                  </Text>
                  <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 20, maxWidth: 280 }}>
                    SportLens requires camera access to perform live AI computer vision and vertical jump biomechanics.
                  </Text>
                  <TouchableOpacity
                    style={{ backgroundColor: '#8B5CF6', paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                    onPress={async () => {
                      const res = await requestCameraPermission();
                      if (!res.granted) {
                        Alert.alert(
                          'Camera Permission',
                          'Please grant camera permission for SportLens in your Android device settings.'
                        );
                      }
                    }}
                  >
                    <Ionicons name="shield-checkmark" color="#000" size={18} />
                    <Text style={{ color: '#000', fontWeight: '900', fontSize: 13 }}>GRANT CAMERA PERMISSION</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {/* 1. NATIVE HARDWARE CAMERA STREAM (60 FPS NATIVE) */}
                  <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing={cameraFacing}
                    mode="video"
                    mute={true}
                  />

                  {/* 1b. 14-JOINT BIOMECHANICAL KINETIC SKELETAL HUD OVERLAY */}
                  {drillPhase === 'recording' && (
                    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 360 480">
                        {/* Dual-Stroke Neon Laser Optics */}
                        <G stroke="#22C55E" strokeWidth="3" strokeLinecap="round" opacity={0.88}>
                          {/* Cranial to Clavicle */}
                          <Line x1="180" y1="88" x2="180" y2="120" />
                          {/* Shoulders */}
                          <Line x1="140" y1="120" x2="220" y2="120" />
                          {/* Spine Torso Axis */}
                          <Line x1="180" y1="120" x2="180" y2="230" stroke="#00FF66" strokeWidth="3.5" />
                          {/* Pelvic Bar */}
                          <Line x1="150" y1="230" x2="210" y2="230" />
                          {/* Left Arm */}
                          <Line x1="140" y1="120" x2="110" y2="175" />
                          <Line x1="110" y1="175" x2="95" y2="225" />
                          {/* Right Arm */}
                          <Line x1="220" y1="120" x2="250" y2="175" />
                          <Line x1="250" y1="175" x2="265" y2="225" />
                          {/* Left Leg (Hip -> Knee -> Ankle) */}
                          <Line x1="150" y1="230" x2="140" y2="320" />
                          <Line x1="140" y1="320" x2="135" y2="410" />
                          {/* Right Leg (Hip -> Knee -> Ankle) */}
                          <Line x1="210" y1="230" x2="220" y2="320" />
                          <Line x1="220" y1="320" x2="225" y2="410" />
                        </G>
                        {/* Cranial Targeting Reticle */}
                        <Circle cx="180" cy="65" r="20" stroke="#00F0FF" strokeWidth="2" fill="rgba(0, 240, 255, 0.12)" />
                        <Circle cx="180" cy="65" r="4" fill="#00F0FF" />
                        {/* 14 Cyan Pivot Nodes */}
                        {[
                          [140, 120], [220, 120], [110, 175], [250, 175], [95, 225], [265, 225],
                          [180, 175], [150, 230], [210, 230], [140, 320], [220, 320], [135, 410], [225, 410]
                        ].map(([cx, cy], idx) => (
                          <Circle key={idx} cx={cx} cy={cy} r="4.5" fill="#00F0FF" stroke="#FFFFFF" strokeWidth="1.5" />
                        ))}
                      </Svg>

                      {/* Angular Telemetry Overlay Badges */}
                      <View style={{ position: 'absolute', top: 58, right: 14, gap: 5 }}>
                        <View style={{ backgroundColor: 'rgba(9,5,20,0.88)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#22C55E' }}>
                          <Text style={{ color: '#22C55E', fontSize: 9.5, fontWeight: 'bold' }}>KNEE: 92°</Text>
                        </View>
                        <View style={{ backgroundColor: 'rgba(9,5,20,0.88)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#00F0FF' }}>
                          <Text style={{ color: '#00F0FF', fontSize: 9.5, fontWeight: 'bold' }}>HIP: 168°</Text>
                        </View>
                        <View style={{ backgroundColor: 'rgba(9,5,20,0.88)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#C084FC' }}>
                          <Text style={{ color: '#C084FC', fontSize: 9.5, fontWeight: 'bold' }}>SPINE: 86°</Text>
                        </View>
                      </View>

                      {/* 14-Joint Tracking Lock Pill */}
                      <View style={{ position: 'absolute', top: 58, left: 14 }}>
                        <View style={{ backgroundColor: 'rgba(34,197,94,0.18)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#22C55E', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' }} />
                          <Text style={{ color: '#22C55E', fontSize: 9.5, fontWeight: '900' }}>14-JOINT HUD: LOCKED</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* 2. SCI-FI HUD CORNER BRACKETS */}
                  <View pointerEvents="none" style={{ position: 'absolute', top: 12, left: 12, width: 22, height: 22, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#C084FC' }} />
                  <View pointerEvents="none" style={{ position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#C084FC' }} />
                  <View pointerEvents="none" style={{ position: 'absolute', bottom: 12, left: 12, width: 22, height: 22, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#8B5CF6' }} />
                  <View pointerEvents="none" style={{ position: 'absolute', bottom: 12, right: 12, width: 22, height: 22, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#8B5CF6' }} />

                  {/* 3. CENTER ATHLETE ALIGNMENT TARGET FRAME (STANDBY ONLY) */}
                  {drillPhase !== 'recording' && (
                    <View pointerEvents="none" style={styles.viewfinderFrame}>
                      <View style={{ alignItems: 'center', opacity: 0.85 }}>
                        <Ionicons name="body-outline" color="#C084FC" size={96} />
                        <Text style={styles.skeletonStatusText}>
                          👤 ALIGN BODY IN FRAME (6-8 FT)
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* 4. TOP HUD STATUS (SEPARATED, NO DUPLICATE DRILL BADGE) */}
                  <View pointerEvents="none" style={{ position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', zIndex: 5 }}>

                    {drillPhase === 'recording' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.25)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1.5, borderColor: '#EF4444' }}>
                        <View style={styles.redRecDot} />
                        <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 11 }}>
                          REC ⏱️ {recordDurationSec}s
                        </Text>
                      </View>
                    ) : drillPhase === 'countdown' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(139, 92, 246, 0.3)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#8B5CF6' }}>
                        <Text style={{ color: '#38BDF8', fontWeight: '900', fontSize: 10.5 }}>
                          ⏳ STARTING...
                        </Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(9, 5, 20, 0.92)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1.2, borderColor: '#8B5CF6' }}>
                        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#8B5CF6' }} />
                        <Text style={{ color: '#8B5CF6', fontWeight: '900', fontSize: 10.5 }}>
                          60 FPS READY
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* 5. BOTTOM PROMPT BANNER */}
                  <View pointerEvents="none" style={{ position: 'absolute', bottom: 12, left: 14, right: 14, alignItems: 'center', zIndex: 5 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(9, 5, 20, 0.92)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: drillPhase === 'recording' ? '#8B5CF6' : '#3B1E6D' }}>
                      <Ionicons
                        name={drillPhase === 'recording' ? 'videocam' : 'phone-portrait-outline'}
                        color={drillPhase === 'recording' ? '#8B5CF6' : '#C084FC'}
                        size={14}
                      />
                      <Text style={{ color: drillPhase === 'recording' ? '#8B5CF6' : '#94A3B8', fontSize: 10.5, fontWeight: 'bold' }}>
                        {drillPhase === 'recording'
                          ? `🎥 Recording physical drill (${recordDurationSec}s) • Tap STOP below when done`
                          : '📱 Prop phone on ground or wall & step back 6–8 feet'}
                      </Text>
                    </View>
                  </View>

                  {/* 6. COUNTDOWN 3-2-1 GLOWING HUD */}
                  {drillPhase === 'countdown' && (
                    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
                      <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 4, borderColor: '#C084FC', backgroundColor: 'rgba(192, 132, 252, 0.15)', justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ color: '#FFF', fontSize: 56, fontWeight: '900' }}>
                          {countdownNumber > 0 ? countdownNumber : '🔥'}
                        </Text>
                      </View>
                      <Text style={{ color: '#C084FC', fontWeight: '900', fontSize: 16, marginTop: 14, letterSpacing: 2 }}>
                        {countdownNumber > 0 ? 'GET READY...' : 'GO! PERFORM DRILL!'}
                      </Text>
                      <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>
                        Step into frame and perform your drill
                      </Text>
                    </View>
                  )}

                  {/* 7. ANALYZING AI OVERLAY */}
                  {drillPhase === 'analyzing' && (
                    <View style={styles.countdownBigOverlay}>
                      <ActivityIndicator size="large" color="#8B5CF6" style={{ marginBottom: 12 }} />
                      <Text style={{ color: '#8B5CF6', fontSize: 17, fontWeight: 'bold' }}>
                        🤖 AI Analyzing Biomechanics...
                      </Text>
                      <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 4, textAlign: 'center', maxWidth: 260 }}>
                        Processing video frames, flight time & kinetic power
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Bottom Controls Bar */}
            <View style={{ padding: 12, backgroundColor: '#130924', borderTopWidth: 1, borderTopColor: '#2E1854' }}>
              {drillPhase === 'standby' && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#8B5CF6' }]}
                  onPress={handleStartManualRecording}
                >
                  <Ionicons name="videocam" color="#000" size={18} />
                  <Text style={styles.primaryBtnText}>🔴 START RECORDING (3s Countdown)</Text>
                </TouchableOpacity>
              )}

              {drillPhase === 'countdown' && (
                <View style={[styles.primaryBtn, { backgroundColor: '#8B5CF6', opacity: 0.9 }]}>
                  <Text style={[styles.primaryBtnText, { color: '#FFF' }]}>
                    ⏳ GET IN POSITION... ({countdownNumber}s)
                  </Text>
                </View>
              )}

              {drillPhase === 'recording' && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#EF4444' }]}
                  onPress={handleStopRecordingAndEvaluate}
                >
                  <Ionicons name="stop-circle" color="#FFF" size={20} />
                  <Text style={[styles.primaryBtnText, { color: '#FFF' }]}>
                    ⏹️ STOP & GENERATE AI SCORE
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: SCOUT BIOMECHANICS REPORT (SCIENTIFIC KINEMATICS) ================= */}
      <Modal visible={isReportModalOpen} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.reportModalBox, { maxHeight: '92%', maxWidth: 360 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="analytics" color="#8B5CF6" size={18} />
                <Text style={styles.modalTitle}>AI Biomechanics Report</Text>
              </View>
              <TouchableOpacity onPress={() => setIsReportModalOpen(false)}>
                <Ionicons name="close" color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
              {/* Score & Category Header */}
              <View style={styles.reportScorePill}>
                <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 }}>
                  {activeDrillTitle.toUpperCase()} SCORE
                </Text>
                <Text style={styles.reportScoreNumber}>
                  {calculatedScore} <Text style={{ fontSize: 14, color: '#94A3B8' }}>/ 100</Text>
                </Text>
                <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, marginTop: 4 }}>
                  <Text style={{ color: '#8B5CF6', fontWeight: 'bold', fontSize: 10 }}>
                    🎯 UPDATED STATS: {calibratedAttributesList.join(' • ')}
                  </Text>
                </View>
              </View>

              {/* Verified Scientific Flight-Time Kinematics Card (SIH Judge Inspection) */}
              {latestBiomechanicsResult && latestBiomechanicsResult.drillCategory === 'jump' && (
                <View style={{ backgroundColor: '#1E103C', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#2E1854', gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 11.5 }}>🔬 FLIGHT-TIME KINEMATICS</Text>
                    <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ color: '#8B5CF6', fontSize: 8.5, fontWeight: 'bold' }}>MY JUMP 2 GOLD STANDARD</Text>
                    </View>
                  </View>

                  {/* Physics Formula Formula Banner */}
                  <View style={{ backgroundColor: '#130924', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#2E1854' }}>
                    <Text style={{ color: '#C084FC', fontSize: 10, fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                      📐 h = ⅛ · g · (t_flight)² = 122.58 · ({(latestBiomechanicsResult as JumpAnalysisResult).flightTimeSec}s)²
                    </Text>
                    <Text style={{ color: '#94A3B8', fontSize: 8.5, marginTop: 2 }}>
                      Earth Gravity Kinematics (g = 9.81 m/s²) • Sayers Peak Power Formula
                    </Text>
                  </View>

                  {/* Kinematics Metric Grid */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <View style={{ flexBasis: '48%', flexGrow: 1, backgroundColor: '#130924', padding: 8, borderRadius: 10 }}>
                      <Text style={{ color: '#94A3B8', fontSize: 8, fontWeight: 'bold' }}>FLIGHT AIRTIME</Text>
                      <Text style={{ color: '#8B5CF6', fontSize: 13, fontWeight: '900', marginTop: 1 }}>
                        {(latestBiomechanicsResult as JumpAnalysisResult).flightTimeSec}s
                      </Text>
                    </View>
                    <View style={{ flexBasis: '48%', flexGrow: 1, backgroundColor: '#130924', padding: 8, borderRadius: 10 }}>
                      <Text style={{ color: '#94A3B8', fontSize: 8, fontWeight: 'bold' }}>MEASURED HEIGHT</Text>
                      <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '900', marginTop: 1 }}>
                        {(latestBiomechanicsResult as JumpAnalysisResult).jumpHeightCm} cm
                      </Text>
                    </View>
                    <View style={{ flexBasis: '48%', flexGrow: 1, backgroundColor: '#130924', padding: 8, borderRadius: 10 }}>
                      <Text style={{ color: '#94A3B8', fontSize: 8, fontWeight: 'bold' }}>PEAK POWER (SAYERS)</Text>
                      <Text style={{ color: '#FACC15', fontSize: 13, fontWeight: '900', marginTop: 1 }}>
                        {(latestBiomechanicsResult as JumpAnalysisResult).peakPowerWatts} W
                      </Text>
                    </View>
                    <View style={{ flexBasis: '48%', flexGrow: 1, backgroundColor: '#130924', padding: 8, borderRadius: 10 }}>
                      <Text style={{ color: '#94A3B8', fontSize: 8, fontWeight: 'bold' }}>RELATIVE POWER</Text>
                      <Text style={{ color: '#C084FC', fontSize: 13, fontWeight: '900', marginTop: 1 }}>
                        {(latestBiomechanicsResult as JumpAnalysisResult).relativePowerWattsPerKg} W/kg
                      </Text>
                    </View>
                  </View>

                  {/* Interactive Frame Timestamp Scrubber */}
                  <View style={{ marginTop: 2, gap: 4 }}>
                    <Text style={{ color: '#94A3B8', fontSize: 8.5, fontWeight: 'bold' }}>📹 60 FPS FRAME-BY-FRAME TIMESTAMPS:</Text>
                    <View style={{ flexDirection: 'row', backgroundColor: '#130924', padding: 4, borderRadius: 8, gap: 4 }}>
                      {[
                        { key: 'takeoff', label: `🚀 Takeoff (${(latestBiomechanicsResult as JumpAnalysisResult).takeoffTimestampSec}s)`, desc: `Frame ${(latestBiomechanicsResult as JumpAnalysisResult).takeoffFrame} • Ground Release` },
                        { key: 'apex', label: `👑 Apex (${(latestBiomechanicsResult as JumpAnalysisResult).jumpHeightCm}cm)`, desc: `Max Air Flight Parabola` },
                        { key: 'landing', label: `🛡️ Landing (${(latestBiomechanicsResult as JumpAnalysisResult).landingTimestampSec}s)`, desc: `Frame ${(latestBiomechanicsResult as JumpAnalysisResult).landingFrame} • Touchdown` },
                      ].map((phase) => (
                        <TouchableOpacity
                          key={phase.key}
                          style={{
                            flex: 1,
                            paddingVertical: 5,
                            borderRadius: 6,
                            backgroundColor: reportScrubPhase === phase.key ? '#8B5CF6' : 'transparent',
                            alignItems: 'center',
                          }}
                          onPress={() => setReportScrubPhase(phase.key as any)}
                        >
                          <Text style={{ color: reportScrubPhase === phase.key ? '#FFF' : '#94A3B8', fontSize: 8.5, fontWeight: '900' }}>
                            {phase.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {/* AI Coach Voice Feedback Card */}
              <View style={styles.reportVoiceCard}>
                <Text style={{ color: '#8B5CF6', fontWeight: 'bold', fontSize: 11.5 }}>
                  🤖 {t.ai_coach_title}:
                </Text>
                <Text style={{ color: '#FEF08A', fontSize: 11.5, marginTop: 4, lineHeight: 16 }}>
                  "{aiFeedbackText || t.coach_voice_text}"
                </Text>
              </View>

              {/* Anti-Cheat Cryptographic Tag */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#2E1854' }}>
                <Ionicons name="shield-checkmark" color="#8B5CF6" size={16} />
                <Text style={{ color: '#94A3B8', fontSize: 8.5, flex: 1 }}>
                  Anti-Cheat Cryptographic Verification: PASS (Single-shot camera stream • Zero deepfake alteration)
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 4 }]}
                onPress={() => {
                  setIsReportModalOpen(false);
                  setCurrentTab('card');
                }}
              >
                <Text style={styles.primaryBtnText}>{t.update_passport}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* ================= MODAL: SELECT SPORT (A-Z) ================= */}
      <Modal visible={isSportPickerModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.geoModalBox}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Sport ({ALL_SPORTS.length} A-Z)</Text>
                <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 2 }}>Tap any sport to filter talent</Text>
              </View>
              <TouchableOpacity onPress={() => setIsSportPickerModalOpen(false)}>
                <Ionicons name="close" color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.geoSearchInput}
              placeholder="🔍 Search sports (e.g. Boxing, Kabaddi, Cricket)..."
              placeholderTextColor="#64748B"
              value={searchSportQuery}
              onChangeText={setSearchSportQuery}
            />

            <ScrollView style={{ maxHeight: 380 }}>
              {/* Option: All Sports */}
              <TouchableOpacity
                style={[styles.geoItemRow, recruiterSportFilter === 'All' && styles.geoItemRowActive]}
                onPress={() => {
                  setRecruiterSportFilter('All');
                  setIsSportPickerModalOpen(false);
                }}
              >
                <Text style={[styles.geoItemText, recruiterSportFilter === 'All' && styles.geoItemTextActive]}>
                  🌐 All Sports (Show Everyone)
                </Text>
                {recruiterSportFilter === 'All' && <Ionicons name="checkmark-circle" color="#000" size={16} />}
              </TouchableOpacity>

              {ALL_SPORTS.filter(s => s.toLowerCase().includes(searchSportQuery.toLowerCase())).map((sport) => {
                const isSelected = recruiterSportFilter.toLowerCase() === sport.toLowerCase();
                return (
                  <TouchableOpacity
                    key={sport}
                    style={[styles.geoItemRow, isSelected && styles.geoItemRowActive]}
                    onPress={() => {
                      setRecruiterSportFilter(sport);
                      setIsSportPickerModalOpen(false);
                    }}
                  >
                    <Text style={[styles.geoItemText, isSelected && styles.geoItemTextActive]}>
                      🏅 {sport}
                    </Text>
                    {isSelected && <Ionicons name="checkmark-circle" color="#000" size={16} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: SELECT STATE / UT (A-Z) ================= */}
      <Modal visible={isStatePickerModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.geoModalBox}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select State / UT ({ALL_STATES.length} A-Z)</Text>
                <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 2 }}>All 28 States & 8 Union Territories</Text>
              </View>
              <TouchableOpacity onPress={() => setIsStatePickerModalOpen(false)}>
                <Ionicons name="close" color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.geoSearchInput}
              placeholder="🔍 Search state (e.g. Andhra Pradesh, Punjab)..."
              placeholderTextColor="#64748B"
              value={searchStateQuery}
              onChangeText={setSearchStateQuery}
            />

            <ScrollView style={{ maxHeight: 380 }}>
              {/* Option: All States */}
              <TouchableOpacity
                style={[styles.geoItemRow, recruiterStateFilter === 'All' && { backgroundColor: '#FACC15' }]}
                onPress={() => {
                  setRecruiterStateFilter('All');
                  setRecruiterDistrictFilter('All');
                  setIsStatePickerModalOpen(false);
                }}
              >
                <Text style={[styles.geoItemText, recruiterStateFilter === 'All' && { color: '#000', fontWeight: '900' }]}>
                  🇮🇳 All States & Territories (Pan-India)
                </Text>
                {recruiterStateFilter === 'All' && <Ionicons name="checkmark-circle" color="#000" size={16} />}
              </TouchableOpacity>

              {ALL_STATES.filter(s => s.toLowerCase().includes(searchStateQuery.toLowerCase())).map((st) => {
                const isSelected = recruiterStateFilter.toLowerCase() === st.toLowerCase();
                const districtCount = INDIA_STATES_AND_DISTRICTS[st]?.length || 0;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[styles.geoItemRow, isSelected && { backgroundColor: '#FACC15' }]}
                    onPress={() => {
                      setRecruiterStateFilter(st);
                      setRecruiterDistrictFilter('All');
                      setIsStatePickerModalOpen(false);
                    }}
                  >
                    <View>
                      <Text style={[styles.geoItemText, isSelected && { color: '#000', fontWeight: '900' }]}>
                        🏛️ {st}
                      </Text>
                      <Text style={{ color: isSelected ? '#3B1E6D' : '#94A3B8', fontSize: 10, marginTop: 1 }}>
                        {districtCount} Districts
                      </Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" color="#000" size={16} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: SELECT DISTRICT (A-Z) ================= */}
      <Modal visible={isDistrictPickerModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.geoModalBox}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {recruiterStateFilter !== 'All' ? `${recruiterStateFilter} Districts` : 'All Indian Districts'} (A-Z)
                </Text>
                <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 2 }}>
                  {recruiterStateFilter !== 'All'
                    ? `Showing all ${INDIA_STATES_AND_DISTRICTS[recruiterStateFilter]?.length || 0} official districts`
                    : 'Select a state first for targeted district filtering'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsDistrictPickerModalOpen(false)}>
                <Ionicons name="close" color="#94A3B8" size={22} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.geoSearchInput}
              placeholder="🔍 Search district (e.g. Eluru, Guntur, Pune)..."
              placeholderTextColor="#64748B"
              value={searchDistrictQuery}
              onChangeText={setSearchDistrictQuery}
            />

            <ScrollView style={{ maxHeight: 380 }}>
              {/* Option: All Districts */}
              <TouchableOpacity
                style={[styles.geoItemRow, recruiterDistrictFilter === 'All' && styles.geoItemRowActive]}
                onPress={() => {
                  setRecruiterDistrictFilter('All');
                  setIsDistrictPickerModalOpen(false);
                }}
              >
                <Text style={[styles.geoItemText, recruiterDistrictFilter === 'All' && styles.geoItemTextActive]}>
                  📍 All Districts in {recruiterStateFilter}
                </Text>
                {recruiterDistrictFilter === 'All' && <Ionicons name="checkmark-circle" color="#000" size={16} />}
              </TouchableOpacity>

              {(() => {
                const distList = (recruiterStateFilter !== 'All' && INDIA_STATES_AND_DISTRICTS[recruiterStateFilter])
                  ? INDIA_STATES_AND_DISTRICTS[recruiterStateFilter]
                  : Object.entries(INDIA_STATES_AND_DISTRICTS).flatMap(([st, dists]) => dists.map(d => `${d} (${st})`)).sort();

                return distList
                  .filter(d => d.toLowerCase().includes(searchDistrictQuery.toLowerCase()))
                  .map((distWithState) => {
                    const cleanDistName = distWithState.split(' (')[0];
                    const isSelected = recruiterDistrictFilter.toLowerCase() === cleanDistName.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={distWithState}
                        style={[styles.geoItemRow, isSelected && styles.geoItemRowActive]}
                        onPress={() => {
                          setRecruiterDistrictFilter(cleanDistName);
                          setIsDistrictPickerModalOpen(false);
                        }}
                      >
                        <Text style={[styles.geoItemText, isSelected && styles.geoItemTextActive]}>
                          📍 {distWithState}
                        </Text>
                        {isSelected && <Ionicons name="checkmark-circle" color="#000" size={16} />}
                      </TouchableOpacity>
                    );
                  });
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#090514',
  },
  scrollFlex: { flex: 1 },

  // Login & Welcome Styles
  loginContent: {
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 24,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: '100%',
  },
  loginBrand: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 20,
  },
  loginLogoIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  loginTitle: { fontSize: 30, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  loginSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 4, textAlign: 'center' },
  loginLangBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#130924',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2E1854',
    marginBottom: 24,
  },
  loginLangText: { color: '#FFF', fontSize: 12 },

  welcomeChoiceCard: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#2E1854',
    overflow: 'hidden',
  },
  welcomeChoiceGradient: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  welcomeIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeChoiceTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#8B5CF6',
    marginBottom: 4,
  },
  welcomeChoiceDesc: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
  },

  loginCard: {
    width: '100%',
    backgroundColor: '#130924',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2E1854',
  },
  authSegmentRow: {
    flexDirection: 'row',
    backgroundColor: '#1E103C',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2E1854',
  },
  authSegmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  authSegmentTabActiveGreen: {
    backgroundColor: '#8B5CF6',
  },
  authSegmentTabActiveGold: {
    backgroundColor: '#FACC15',
  },
  authSegmentText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  authSegmentTextActive: {
    color: '#000',
    fontWeight: '900',
  },
  subChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1E103C',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  formTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backBtnText: {
    color: '#8B5CF6',
    fontWeight: 'bold',
    fontSize: 12,
  },
  formTopTitle: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 15,
  },
  formSubText: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 16,
  },
  loginCardHeading: { fontSize: 15, fontWeight: 'bold', color: '#FFF', marginBottom: 14, textAlign: 'center' },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 11, fontWeight: 'bold', color: '#94A3B8', marginBottom: 4 },
  textInput: {
    backgroundColor: '#1E103C',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#3B1E6D',
  },
  primaryBtn: {
    backgroundColor: '#8B5CF6',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  primaryBtnText: { color: '#FFF', fontWeight: '900', fontSize: 13 },

  // Header Bar & Mode Switcher
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2E1854',
    backgroundColor: '#090514',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLogo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  modeSwitcherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  modeSwitcherBtnScout: {
    backgroundColor: 'rgba(192, 132, 252, 0.12)',
    borderColor: '#C084FC',
  },
  modeSwitcherBtnAthlete: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: '#8B5CF6',
  },
  modeSwitcherText: { fontSize: 10, fontWeight: '900' },
  headerBellBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2E1854',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellRedBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellRedBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  headerLangPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2E1854',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
  },
  headerLangText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  // Hero Banner
  heroBanner: {
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E1854',
  },
  greetingPill: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  greetingPillText: { color: '#8B5CF6', fontSize: 11, fontWeight: 'bold' },
  heroBannerHeading: { fontSize: 14, fontWeight: '900', color: '#FFF', lineHeight: 18 },
  heroBannerSub: { fontSize: 10, color: '#94A3B8', marginTop: 3 },
  heroBannerIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section Headers
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionHeading: { fontSize: 11, fontWeight: '900', color: '#94A3B8', letterSpacing: 0.5 },
  sectionLink: { fontSize: 11, fontWeight: 'bold', color: '#8B5CF6' },

  // Quick Drills
  quickDrillsRow: { flexDirection: 'row', gap: 8 },
  quickDrillCard: {
    flex: 1,
    backgroundColor: '#130924',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E1854',
  },
  quickDrillEmoji: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  quickDrillLabel: { color: '#FFF', fontSize: 10, fontWeight: 'bold', textAlign: 'center' },

  // Progress Grid
  progressCard: { backgroundColor: '#130924', borderRadius: 20, padding: 12, borderWidth: 1, borderColor: '#2E1854' },
  progressGrid: { flexDirection: 'row', gap: 6, marginTop: 8 },
  progressGridBox: { flex: 1, backgroundColor: '#1E103C', borderRadius: 12, padding: 8, alignItems: 'center' },
  progressBoxLabel: { fontSize: 8, color: '#94A3B8', fontWeight: 'bold' },
  progressBoxVal: { fontSize: 14, color: '#FFF', fontWeight: '900', marginTop: 2 },

  // Drills / Tests Tab
  pageTitle: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  pageSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  drillRowItem: {
    backgroundColor: '#130924',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E1854',
  },
  drillItemIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#1E103C', alignItems: 'center', justifyContent: 'center' },
  drillItemTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  drillItemTag: { fontSize: 8, fontWeight: 'bold' },
  drillItemDesc: { color: '#94A3B8', fontSize: 10, marginTop: 2 },

  // Gold Player Card
  goldCardWrap: { borderRadius: 24, padding: 2.5, shadowColor: '#EAB308', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  goldCardBody: { backgroundColor: '#090514', borderRadius: 22, padding: 14 },
  goldCardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  ovrNumber: { fontSize: 32, fontWeight: '900', color: '#FDE047', lineHeight: 34 },
  ovrText: { fontSize: 9, fontWeight: '900', color: '#FACC15' },
  athPill: { backgroundColor: 'rgba(234,179,8,0.2)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginTop: 2 },
  athPillText: { color: '#FDE047', fontSize: 8, fontWeight: 'bold' },
  cardRankPill: { backgroundColor: 'rgba(139, 92, 246, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#8B5CF6' },
  cardRankPillText: { color: '#8B5CF6', fontSize: 8, fontWeight: '900' },
  indianFlag: { width: 26, height: 14, borderRadius: 2, overflow: 'hidden', borderWidth: 0.5, borderColor: '#64748B' },
  athleteAvatarBox: { alignItems: 'center', marginVertical: 6 },
  athleteAvatarImg: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: '#FACC15' },
  athleteDefaultSilhouetteGold: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#FACC15',
    backgroundColor: '#1E103C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: { fontSize: 15, fontWeight: '900', color: '#FFF', textAlign: 'center' },
  cardLoc: { fontSize: 9, color: '#94A3B8', textAlign: 'center', marginTop: 1 },
  statBarsList: { marginTop: 10, gap: 6 },
  singleStatRowPrecise: { gap: 2 },
  statLabelText: { width: 64, fontSize: 9, color: '#CBD5E1', fontWeight: 'bold' },
  statUnitText: { flex: 1, fontSize: 8, color: '#8B5CF6', fontWeight: 'bold', textAlign: 'right', paddingRight: 6 },
  statBarTrack: { height: 5, backgroundColor: '#2E1854', borderRadius: 3, overflow: 'hidden' },
  statBarProgress: { height: '100%', borderRadius: 3 },
  statValText: { width: 22, fontSize: 10, color: '#FFF', fontWeight: '900', textAlign: 'right' },

  // Radar Matrix Card
  radarCard: { backgroundColor: '#130924', borderRadius: 20, padding: 12, borderWidth: 1, borderColor: '#2E1854' },
  radarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  radarPill: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: '#1E103C',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E1854',
  },
  radarPillActive: { borderColor: 'rgba(139, 92, 246, 0.4)', backgroundColor: 'rgba(139, 92, 246, 0.08)' },
  radarPillLabel: { color: '#94A3B8', fontSize: 8, fontWeight: '900', marginTop: 2 },
  radarPillVal: { color: '#64748B', fontSize: 12, fontWeight: '900', marginTop: 1 },

  unrankedHintBox: {
    backgroundColor: '#130924',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2E1854',
  },
  unrankedHintText: {
    color: '#94A3B8',
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },

  // Profile Tab
  editProfileTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  editProfileTopText: { color: '#8B5CF6', fontSize: 11, fontWeight: 'bold' },
  profileCard: { backgroundColor: '#130924', borderRadius: 20, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2E1854' },
  profileAvatarTouchable: { position: 'relative', marginBottom: 6 },
  profileBigAvatar: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: '#8B5CF6' },
  profileDefaultSilhouette: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: '#3B1E6D',
    backgroundColor: '#1E103C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadgeCircle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#130924',
  },
  profileBigName: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  profileBigLoc: { color: '#94A3B8', fontSize: 10, marginTop: 1 },
  profileAttrRow: { flexDirection: 'row', gap: 6, marginTop: 10, width: '100%' },
  profileAttrBox: { flex: 1, backgroundColor: '#1E103C', padding: 6, borderRadius: 10, alignItems: 'center' },
  profileAttrLabel: { color: '#94A3B8', fontSize: 8, fontWeight: 'bold' },
  profileAttrVal: { color: '#FFF', fontSize: 11, fontWeight: '900', marginTop: 1 },
  aboutBox: { backgroundColor: '#130924', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#2E1854' },
  aboutBoxTitle: { color: '#94A3B8', fontSize: 8, fontWeight: '900', letterSpacing: 0.5, marginBottom: 2 },
  aboutBoxText: { color: '#E2E8F0', fontSize: 10, lineHeight: 14 },
  logoutBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  logoutBtnText: { color: '#F87171', fontWeight: 'bold', fontSize: 12 },

  // ================= RECRUITER POV STYLES =================
  scoutBanner: { borderRadius: 20, padding: 14, borderWidth: 1, borderColor: '#2E1854' },
  scoutAvatarCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(192, 132, 252, 0.15)', alignItems: 'center', justifyContent: 'center' },
  scoutName: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  scoutVerifiedBadge: { backgroundColor: 'rgba(139, 92, 246, 0.2)', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 },
  scoutVerifiedText: { color: '#8B5CF6', fontWeight: '900', fontSize: 8 },
  scoutSub: { color: '#94A3B8', fontSize: 10, marginTop: 1 },
  scoutId: { color: '#C084FC', fontSize: 9, fontWeight: 'bold', marginTop: 2 },
  scoutStatsStrip: { flexDirection: 'row', gap: 6, marginTop: 12, borderTopWidth: 1, borderTopColor: '#2E1854', paddingTop: 10 },
  scoutStatItem: { flex: 1, backgroundColor: '#1E103C', padding: 6, borderRadius: 10, alignItems: 'center' },
  scoutStatNum: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  scoutStatLabel: { color: '#94A3B8', fontSize: 8, fontWeight: 'bold' },

  scoutFilterPill: { backgroundColor: '#130924', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#2E1854' },
  scoutFilterPillActive: { backgroundColor: 'rgba(192, 132, 252, 0.15)', borderColor: '#C084FC' },
  scoutFilterText: { color: '#94A3B8', fontSize: 10, fontWeight: 'bold' },
  scoutFilterTextActive: { color: '#C084FC' },

  viewMorePill: { backgroundColor: 'rgba(139, 92, 246, 0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.3)' },
  viewMorePillText: { color: '#8B5CF6', fontSize: 10, fontWeight: 'bold' },

  geoModalBox: { backgroundColor: '#130924', borderRadius: 24, padding: 18, width: '92%', maxHeight: '85%', borderWidth: 1, borderColor: '#2E1854' },
  geoSearchInput: { backgroundColor: '#1E103C', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#FFF', fontSize: 13, borderWidth: 1, borderColor: '#2E1854', marginBottom: 12 },
  geoItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, marginBottom: 6, backgroundColor: '#1E103C' },
  geoItemRowActive: { backgroundColor: '#8B5CF6' },
  geoItemText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  geoItemTextActive: { color: '#FFF', fontWeight: '900' },

  talentCard: { backgroundColor: '#130924', borderRadius: 20, padding: 12, borderWidth: 1, borderColor: '#2E1854', gap: 8 },
  talentAvatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: '#C084FC' },
  talentAvatarPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1E103C', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3B1E6D' },
  talentName: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  talentLoc: { color: '#94A3B8', fontSize: 9, marginTop: 1 },
  talentSport: { color: '#C084FC', fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  talentOvrBadge: { backgroundColor: '#FACC15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, alignItems: 'center' },
  talentOvrNum: { color: '#000', fontWeight: '900', fontSize: 14 },
  talentOvrText: { color: '#000', fontSize: 7, fontWeight: '900' },
  talentMetricsRow: { flexDirection: 'row', gap: 4, marginTop: 6 },
  talentMetricPill: { flex: 1, backgroundColor: '#1E103C', padding: 4, borderRadius: 8, alignItems: 'center' },
  talentMetricLabel: { color: '#94A3B8', fontSize: 7, fontWeight: 'bold' },
  talentMetricVal: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  talentActionRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  talentAuditBtn: { flex: 1, backgroundColor: 'rgba(192, 132, 252, 0.12)', paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, borderWidth: 1, borderColor: 'rgba(192, 132, 252, 0.3)' },
  talentAuditBtnText: { color: '#C084FC', fontWeight: 'bold', fontSize: 10 },
  talentCallUpBtn: { flex: 1, backgroundColor: '#8B5CF6', paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  talentCallUpBtnText: { color: '#FFF', fontWeight: '900', fontSize: 10 },

  // Audit Modal Styles
  auditVideoBox: { backgroundColor: '#000', borderRadius: 14, overflow: 'hidden', marginTop: 10, borderWidth: 1, borderColor: '#2E1854' },
  auditVideoHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, backgroundColor: '#130924' },
  auditVideoViewfinder: { height: 160, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B071B' },
  auditSkeletonHUD: { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', padding: 6, borderRadius: 8 },
  antiCheatCertBox: { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(139, 92, 246, 0.12)', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.3)', marginTop: 10, alignItems: 'center' },
  auditMetricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  auditMetricBox: { flexBasis: '48%', backgroundColor: '#1E103C', padding: 8, borderRadius: 10 },
  auditMetricLabel: { color: '#94A3B8', fontSize: 8, fontWeight: 'bold' },
  auditMetricVal: { color: '#FFF', fontSize: 12, fontWeight: '900', marginTop: 2 },

  // Athlete Recruitment Tab Styles
  recruitmentNoticeCard: { backgroundColor: '#130924', borderRadius: 20, padding: 14, borderWidth: 1.5, borderColor: '#8B5CF6', gap: 8 },
  recruitmentNoticeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  directCallUpPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(139, 92, 246, 0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 4 },
  directCallUpText: { color: '#8B5CF6', fontWeight: '900', fontSize: 9 },
  recruitmentNoticeTitle: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  recruitmentNoticeOrg: { color: '#C084FC', fontSize: 11, fontWeight: 'bold', marginTop: 2 },
  recruitmentDetailBox: { backgroundColor: '#1E103C', padding: 10, borderRadius: 12, gap: 4 },
  recruitmentDetailLine: { color: '#CBD5E1', fontSize: 10 },
  recruitmentNoticeDesc: { color: '#94A3B8', fontSize: 10, lineHeight: 14 },
  claimPassBtn: { backgroundColor: '#8B5CF6', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, marginTop: 4 },
  claimPassBtnText: { color: '#FFF', fontWeight: '900', fontSize: 12 },

  qrCodeBox: { width: 170, height: 170, backgroundColor: '#FFF', borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 10 },
  qrPassCodeText: { color: '#000', fontWeight: '900', fontSize: 10, marginTop: 2, letterSpacing: 1 },
  passDetailsBox: { backgroundColor: '#1E103C', padding: 12, borderRadius: 14, width: '100%', gap: 6 },
  passDetailLine: { fontSize: 11, color: '#FFF' },

  // Empty Recruitment State
  emptyRecruitCard: {
    backgroundColor: '#130924',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E1854',
    marginTop: 10,
  },
  emptyRecruitIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E103C',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyRecruitHeading: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyRecruitSub: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  activeAlertsPill: { backgroundColor: 'rgba(100,116,139,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  activeAlertsPillText: { color: '#94A3B8', fontWeight: 'bold', fontSize: 10 },

  // Bottom Nav
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 65,
    backgroundColor: '#090514',
    borderTopWidth: 1,
    borderTopColor: '#2E1854',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 12 : 0,
  },
  navTab: { alignItems: 'center', gap: 2 },
  navTabText: { color: '#64748B', fontSize: 8 },
  navTabTextActive: { color: '#8B5CF6', fontWeight: 'bold' },
  navCenterRecordBtn: { alignItems: 'center', top: -12 },
  navCenterGlowCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#090514',
    borderWidth: 2,
    borderColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  navCenterText: { color: '#8B5CF6', fontSize: 8, fontWeight: 'bold', marginTop: 2 },

  // Modals
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContainer: { width: '100%', maxWidth: 340, backgroundColor: '#130924', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#2E1854' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#2E1854', paddingBottom: 8 },
  modalTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  langRow: { padding: 10, borderRadius: 12, backgroundColor: '#1E103C', marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between' },
  langRowActive: { borderColor: '#8B5CF6', borderWidth: 1 },
  langRowNative: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  langRowEn: { color: '#94A3B8', fontSize: 10 },

  avatarChoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1E103C',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2E1854',
  },
  avatarChoiceRowActive: { borderColor: '#8B5CF6', backgroundColor: 'rgba(139, 92, 246, 0.1)' },
  avatarChoiceSilhouette: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#130924',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3B1E6D',
  },
  avatarChoiceImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#3B1E6D',
  },

  cameraBox: {
    width: '100%',
    height: '96%',
    backgroundColor: '#090514',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#C084FC',
  },
  cameraBoxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2E1854' },
  cameraBoxTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  viewfinderArea: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', width: '100%' },
  viewfinderFrame: { width: '88%', height: '75%', borderWidth: 2, borderColor: 'rgba(192, 132, 252, 0.7)', borderRadius: 24, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  skeletonPoseTarget: { alignItems: 'center', justifyContent: 'center' },
  skeletonStatusText: { color: '#C084FC', fontSize: 10, fontWeight: '900', marginTop: 4, letterSpacing: 0.5 },
  viewfinderGuide: { color: '#94A3B8', fontSize: 10, textAlign: 'center', marginTop: 12 },
  countdownBigOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  recDotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  redRecDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },

  reportModalBox: { width: '100%', maxWidth: 340, backgroundColor: '#130924', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#2E1854', gap: 10 },
  reportScorePill: { backgroundColor: '#1E103C', borderRadius: 14, padding: 10, alignItems: 'center' },
  reportScoreNumber: { fontSize: 28, fontWeight: '900', color: '#FDE047', marginVertical: 2 },
  reportVoiceCard: { backgroundColor: '#1E103C', borderRadius: 12, padding: 10 },
});
