import { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api.js";
import siren from "../lib/audioSiren.js";
import { CountUp } from "../lib/motion.jsx";
import TacticalWatchfloor from "./TacticalWatchfloor.jsx";

// 3D border-terrain map — code-split (pulls in three.js) so it only loads
// when the operator opens the Border Map view.
const BorderTerrainMapPanel = lazy(() => import("./gis/BorderTerrainPanel.jsx"));
import {
  Shield,
  Search,
  Moon,
  Sun,
  Bell,
  BellOff,
  User,
  LayoutDashboard,
  Video,
  AlertTriangle,
  Map as MapIcon,
  Crosshair,
  GitBranch,
  Database,
  BarChart3,
  Sliders,
  FileText,
  Settings,
  CheckCircle2,
  Maximize2,
  Camera,
  Layers,
  ZoomIn,
  ZoomOut,
  Radio,
  Lock,
  Download,
  AlertCircle,
  Activity,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  X,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Info,
  Navigation,
  Compass,
  FileCheck,
  Cpu,
  RefreshCw,
  Eye,
  Check,
  Volume2,
  VolumeX,
  Move,
  ChevronUp,
  MapPin,
  Clock,
  Flame,
  Terminal,
  Printer,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  Disc,
  Menu,
} from "lucide-react";

export default function ConsoleDashboard({ initialNav = "dashboard" }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");

  // Real backend data state
  const [edgeStatus, setEdgeStatus] = useState(null);
  const [cameraHealth, setCameraHealth] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [blockchain, setBlockchain] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active navigation tab
  const [activeNav, setActiveNav] = useState(urlTab || initialNav);
  // mobile: the sidebar collapses into a slide-over drawer
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (urlTab) setActiveNav(urlTab);
  }, [urlTab]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSurveillanceView, setActiveSurveillanceView] = useState("grid"); // 'grid' | 'focus' | 'testbed'
  const [visionMode, setVisionMode] = useState("optical"); // 'optical' | 'lowlight' | 'edge'
  const [selectedCameraId, setSelectedCameraId] = useState("CAM_BRAVO");
  const [selectedTrackId, setSelectedTrackId] = useState("P17");
  const [activeMapFilter, setActiveMapFilter] = useState("all");
  const [mapTheme, setMapTheme] = useState("satellite"); // 'satellite' | 'schematic'
  const [mapZoom, setMapZoom] = useState(1);
  const [darkMode, setDarkMode] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isSilencing, setIsSilencing] = useState(false);
  const [silenceSuccess, setSilenceSuccess] = useState(false);
  const [isSilenced, setIsSilenced] = useState(() => {
    try {
      return sessionStorage.getItem("sentinel_siren_silenced") === "true";
    } catch {
      return false;
    }
  });
  const [isSirenAcousticActive, setIsSirenAcousticActive] = useState(false);

  // Sync mute state with siren engine
  useEffect(() => {
    siren.setMuted(!audioEnabled);
  }, [audioEnabled]);

  const [modalType, setModalType] = useState(null); // 'alertDetails' | 'dispatchModal' | 'certificate' | 'retrainLab' | 'operator' | 'notifications' | 'dossier'
  const [activeFactorInfo, setActiveFactorInfo] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);
  const [armedState, setArmedState] = useState(true);
  const [alarmThreshold, setAlarmThreshold] = useState(75);

  // PTZ Control State
  const [ptzZoomLevel, setPtzZoomLevel] = useState(1.0);
  const [ptzPan, setPtzPan] = useState({ x: 0, y: 0 });

  // Reconstruction timeline scrubber position & auto-play
  const [scrubberPos, setScrubberPos] = useState(65);
  const [isReconPlaying, setIsReconPlaying] = useState(false);

  // Incident filter for Incidents view
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState("ALL");

  // Selected incident for active alert & investigation
  const [selectedIncidentId, setSelectedIncidentId] = useState("INC-0042");

  // Dispatch QRT state
  const [dispatchUnit, setDispatchUnit] = useState("Alpha-1 QRT");

  // Hardware Relay state (GPIO simulation)
  const [relays, setRelays] = useState({
    siren115dB: false,
    strobeLight: false,
    hydraulicBarrier: false,
    irIlluminator: true,
  });

  // Target filter for Tracking view
  const [targetClassFilter, setTargetClassFilter] = useState("all");

  // Geofence corridor distance slider (meters)
  const [geofenceDistance, setGeofenceDistance] = useState(100);

  // Live CCTV Threat Ingress Lab State (Interactive car / intruder moving towards camera)
  const [ingressScenario, setIngressScenario] = useState("vehicle"); // 'vehicle' | 'person'
  const [ingressDistance, setIngressDistance] = useState(110); // 150m down to 10m (safe distance default)
  const [isIngressSimulating, setIsIngressSimulating] = useState(false);
  const [webcamActive, setWebcamActive] = useState(false);
  const videoWebcamRef = useRef(null);

  // On-Device Edge Training Simulation State
  const [trainingActive, setTrainingActive] = useState(false);
  const [trainingEpoch, setTrainingEpoch] = useState(0);
  const [trainingLoss, setTrainingLoss] = useState(0.421);
  const [trainingmAP, setTrainingmAP] = useState(84.2);
  const [trainingLogs, setTrainingLogs] = useState([]);

  // Map Target Animation Blips (Moving targets across border)
  const [targetBlipTick, setTargetBlipTick] = useState(0);

  // Selected Camera Pin on Map
  const [selectedMapCamera, setSelectedMapCamera] = useState(null);

  // Live Clock (Ticks every second in IST)
  const [timeState, setTimeState] = useState({
    dateStr: "Sat, 5 Sept, 2026",
    timeStr: "23:12:17 IST",
  });

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const timeStr = now.toLocaleTimeString("en-IN", { hour12: false }) + " IST";
      setTimeState({ dateStr, timeStr });
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Animate map targets
  useEffect(() => {
    const timer = setInterval(() => {
      setTargetBlipTick((t) => (t + 1) % 100);
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  // Audio helper
  const triggerSound = useCallback(
    (type) => {
      if (!audioEnabled) return;
      if (type === "click") siren.playClick();
      if (type === "radio") siren.playRadioChirp();
      if (type === "lock") siren.playLockdown();
      if (type === "verify") siren.playVerify();
    },
    [audioEnabled]
  );

  // Audio siren listener
  useEffect(() => {
    return siren.subscribe(({ active }) => {
      setIsSirenAcousticActive(active);
      setRelays((prev) => ({ ...prev, siren115dB: active }));
    });
  }, []);

  // Fetch real data from backend
  const fetchData = useCallback(async () => {
    try {
      const [edgeRes, camRes, incRes, blockRes] = await Promise.all([
        api.getEdgeStatus().catch(() => null),
        api.getCameraHealth().catch(() => ({ cameras: [] })),
        api.getIncidents(50).catch(() => []),
        api.getBlockchain().catch(() => ({ blocks: [] })),
      ]);

      if (edgeRes) setEdgeStatus(edgeRes);
      if (camRes?.cameras) setCameraHealth(camRes.cameras);
      if (Array.isArray(incRes)) setIncidents(incRes);
      if (blockRes?.blocks) setBlockchain(blockRes.blocks);
    } catch (err) {
      console.error("[Console] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 5000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Derive siren state
  const hasCriticalAlert = useMemo(
    () =>
      incidents.some(
        (i) =>
          i.severity === "CRITICAL" &&
          i.status !== "CONFIRMED" &&
          i.status !== "DISMISSED_FP"
      ),
    [incidents]
  );

  const isAlarmActive = useMemo(() => {
    if (isSilenced) return false;
    if (edgeStatus && typeof edgeStatus.siren_active === "boolean") {
      return edgeStatus.siren_active && !isSilenced;
    }
    return (hasCriticalAlert && !isSilenced) || isSirenAcousticActive;
  }, [edgeStatus, hasCriticalAlert, isSirenAcousticActive, isSilenced]);

  // Handle siren silence
  const handleSilence = async () => {
    setIsSilencing(true);
    setIsSilenced(true);
    try {
      sessionStorage.setItem("sentinel_siren_silenced", "true");
    } catch {}
    siren.silence();
    try {
      await api.silenceSiren();
      setSilenceSuccess(true);
      setRelays((prev) => ({ ...prev, siren115dB: false }));
      await fetchData();
      setTimeout(() => setSilenceSuccess(false), 4000);
    } catch (err) {
      console.error("[Console] Silence failed:", err);
    } finally {
      setIsSilencing(false);
    }
  };

  // Quick Action handlers
  const handleSoundAlarm = () => {
    if (isAlarmActive || isSirenAcousticActive) {
      handleSilence();
    } else {
      setIsSilenced(false);
      try {
        sessionStorage.removeItem("sentinel_siren_silenced");
      } catch {}
      siren.resetSilence();
      siren.test(5000);
      setRelays((prev) => ({ ...prev, siren115dB: true }));
      setActionNotice("🚨 Perimeter breach siren triggered (5s acoustic test: 115 dB)");
      setTimeout(() => setActionNotice(null), 4500);
    }
  };

  const handleLockdown = () => {
    triggerSound("lock");
    setRelays((prev) => ({ ...prev, hydraulicBarrier: !prev.hydraulicBarrier }));
    setActionNotice("Zone Lockdown Engaged: Sector 4-B automated hydraulic barriers sealed.");
    setTimeout(() => setActionNotice(null), 4500);
  };

  const handleTakeSnapshot = () => {
    triggerSound("click");
    setActionNotice("High-resolution forensic frame snapshot sealed into cryptographic evidence vault (SHA-256).");
    setTimeout(() => setActionNotice(null), 4500);
  };

  const handleToggleArm = async () => {
    triggerSound("click");
    const nextState = !armedState;
    setArmedState(nextState);
    try {
      await api.setArmState(nextState);
      setActionNotice(nextState ? "System armed — all perimeter sensors active" : "System disarmed — standby mode");
    } catch {
      setActionNotice(nextState ? "System armed (manual override)" : "System disarmed");
    }
    setTimeout(() => setActionNotice(null), 4000);
  };

  // Camera list (6 cameras matching reference image)
  const displayCameras = useMemo(() => {
    return [
      { id: "CAM_ALPHA", name: "CAM_ALPHA", sector: "Sector 4-B", status: "ONLINE", rec: true, video: "/data/sample_border_web.mp4", hasDetection: false, tag: "Perimeter Ingress", fps: "25.0", bitrate: "4.1 Mbps", res: "1920x1080", fov: "60°", azimuth: "042°", temp: "38.2°C" },
      { id: "CAM_BRAVO", name: "CAM_BRAVO", sector: "Sector 4-B", status: "ONLINE", rec: true, video: "/data/people_surveillance_web.mp4", hasDetection: true, label: "Person", conf: "0.94", tag: "Active Breach", fps: "24.8", bitrate: "4.4 Mbps", res: "1920x1080", fov: "65°", azimuth: "078°", temp: "39.4°C" },
      { id: "CAM_CHARLIE", name: "CAM_CHARLIE", sector: "Sector 4-B", status: "ONLINE", rec: true, video: "/data/threat_vehicle_rush_web.mp4", hasDetection: false, tag: "Patrol Corridor", fps: "25.0", bitrate: "3.9 Mbps", res: "1920x1080", fov: "55°", azimuth: "115°", temp: "37.9°C" },
      { id: "CAM_DELTA", name: "CAM_DELTA", sector: "Sector 4-B", status: "ONLINE", rec: true, video: "/data/threat_night_crawl_web.mp4", hasDetection: false, tag: "Fence Line", fps: "25.0", bitrate: "4.2 Mbps", res: "1920x1080", fov: "70°", azimuth: "152°", temp: "40.1°C" },
      { id: "CAM_ECHO", name: "CAM_ECHO", sector: "Sector 4-B", status: "ONLINE", rec: true, video: "/data/cross_cam_real_demo_web.mp4", hasDetection: false, tag: "Courtyard Entry", fps: "25.0", bitrate: "4.0 Mbps", res: "1920x1080", fov: "60°", azimuth: "198°", temp: "38.5°C" },
      { id: "CAM_FOXTROT", name: "CAM_FOXTROT", sector: "Sector 4-B", status: "ONLINE", rec: true, video: "/data/threat_group_breach_web.mp4", hasDetection: false, tag: "Open Ground", fps: "25.0", bitrate: "4.3 Mbps", res: "1920x1080", fov: "80°", azimuth: "240°", temp: "39.0°C" },
    ];
  }, []);

  // Tracked Targets list
  const trackedTargets = [
    { id: "P17", threat: 87, severity: "critical", class: "person", img: "/data/reid_cam1_crop.jpg", label: "P17", speed: "5.2 km/h", heading: "NE", camera: "CAM_BRAVO", firstSeen: "20:49:02", coords: "Lat 32.5621, Long 75.1234", cue: "CAM_CHARLIE (in 14s)", pathPoints: "42, 68, 74, 87", reidScore: 91.4 },
    { id: "P12", threat: 64, severity: "high", class: "person", img: "/data/reid_cam2_crop.jpg", label: "P12", speed: "4.1 km/h", heading: "E", camera: "CAM_CHARLIE", firstSeen: "20:43:17", coords: "Lat 32.5614, Long 75.1218", cue: "CAM_DELTA (in 28s)", pathPoints: "30, 45, 58, 64", reidScore: 88.2 },
    { id: "V03", threat: 52, severity: "high", class: "vehicle", img: "/data/reid_negative_crop.jpg", label: "V03", speed: "42.0 km/h", heading: "N", camera: "CAM_DELTA", firstSeen: "20:37:55", coords: "Lat 32.5602, Long 75.1195", cue: "CAM_ECHO (in 9s)", pathPoints: "15, 32, 44, 52", reidScore: 79.5 },
    { id: "G08", threat: 46, severity: "high", class: "group", img: "/data/reid_cam1_crop.jpg", label: "G08", speed: "1.2 km/h", heading: "NW", camera: "CAM_ECHO", firstSeen: "20:30:11", coords: "Lat 32.5595, Long 75.1180", cue: "Patrol Alpha (in 45s)", pathPoints: "22, 28, 38, 46", reidScore: 84.1 },
    { id: "P09", threat: 28, severity: "medium", class: "person", img: "/data/reid_cam2_crop.jpg", label: "P09", speed: "0.8 km/h", heading: "S", camera: "CAM_FOXTROT", firstSeen: "20:22:10", coords: "Lat 32.5588, Long 75.1170", cue: "Perimeter Buffer", pathPoints: "12, 18, 24, 28", reidScore: 68.0 },
    { id: "A04", threat: 12, severity: "low", class: "wildlife", img: "/data/reid_negative_crop.jpg", label: "A04", speed: "3.5 km/h", heading: "W", camera: "CAM_ALPHA", firstSeen: "18:11:03", coords: "Lat 32.5635, Long 75.1250", cue: "Forest Boundary", pathPoints: "5, 8, 10, 12", reidScore: 41.2 },
  ];

  // Incidents master list
  const [incidentList, setIncidentList] = useState([
    {
      id: "INC-0042",
      time: "20:49:02",
      cameras: "ALPHA → BRAVO",
      type: "Person (Suspicious)",
      threat: 87,
      severity: "CRITICAL",
      status: "Critical",
      color: "text-red-400",
      badge: "bg-red-500/20 text-red-400 border-red-500/40",
      target: "Person Detected",
      sub: "Near Restricted Zone",
      cam: "CAM_BRAVO (Sector 4-B)",
      timeAgo: "20:49:02 (5s ago)",
      coords: "Lat 32.5621, Long 75.1234",
      hash: "a4f89d3167eb2156828c40ff11e8bc297394bb0494cf078601362e5b72e1281c",
      factors: [
        { label: "+30 Restricted Zone Breach", reason: "Target crossed 100m virtual geofence tripwire in Sector 4-B without authorization." },
        { label: "+20 Heading Toward Border", reason: "Spatial trajectory vector confirmed moving 5.2 km/h directly toward Zero Line." },
        { label: "+12 Re-ID Match", reason: "OSNet / ResNet appearance embedding matched subject across CAM_ALPHA and CAM_BRAVO at 0.914 cosine (2-camera testbed)." },
        { label: "+10 Night Window (Curfew)", reason: "Detected during high-security curfew window (22:00 - 05:00 IST)." },
        { label: "+15 Loitering Anomaly", reason: "Subject static in blind gap corridor for >90 seconds prior to perimeter ingress." },
      ],
    },
    {
      id: "INC-0041",
      time: "20:43:17",
      cameras: "CHARLIE",
      type: "Vehicle (Fast Movement)",
      threat: 64,
      severity: "HIGH",
      status: "High",
      color: "text-amber-400",
      badge: "bg-amber-500/20 text-amber-400 border-amber-500/40",
      target: "Vehicle Acceleration",
      sub: "Patrol Road Approach",
      cam: "CAM_CHARLIE (Sector 4-B)",
      timeAgo: "20:43:17 (6m ago)",
      coords: "Lat 32.5614, Long 75.1218",
      hash: "7e5b223c94d01bfa8291e604f32c748c909e4f559281a4b8c9d0e1f2a3b4c5d6",
      factors: [
        { label: "+25 Velocity Anomaly", reason: "Vehicle speed exceeded 40 km/h on unpaved border access road." },
        { label: "+20 Proximity to Outer Barrier", reason: "Distance to physical barrier under 35 meters." },
        { label: "+10 Night Headlight Signature", reason: "Unregistered high-beam illumination detected." },
        { label: "+9 Camera Handshake", reason: "Predictive handoff cue sent to CAM_DELTA." },
      ],
    },
    {
      id: "INC-0040",
      time: "20:37:55",
      cameras: "DELTA → ECHO",
      type: "Group (3 People)",
      threat: 52,
      severity: "HIGH",
      status: "High",
      color: "text-amber-400",
      badge: "bg-amber-500/20 text-amber-400 border-amber-500/40",
      target: "Group Movement",
      sub: "Near Secondary Fence",
      cam: "CAM_DELTA (Sector 4-B)",
      timeAgo: "20:37:55 (12m ago)",
      coords: "Lat 32.5602, Long 75.1195",
      hash: "37b290970c20f8ce9fa58db0cc57301cdfc788c0a876e5d4c3b2a10987654321",
      factors: [
        { label: "+20 Cluster Detection", reason: "3 distinct humanoid bounding boxes moving in formation." },
        { label: "+15 Loitering Behavior", reason: "Group lingered in dead zone for > 120 seconds." },
        { label: "+10 Blind Gap Transit", reason: "Correlated across 180m unmonitored gap." },
        { label: "+7 Low Ambient Light", reason: "Shadow masking observed along perimeter ditch." },
      ],
    },
    {
      id: "INC-0039",
      time: "20:22:10",
      cameras: "FOXTROT",
      type: "Person (Loitering)",
      threat: 28,
      severity: "MEDIUM",
      status: "Medium",
      color: "text-white",
      badge: "bg-white/[0.06] text-white border-white/12",
      target: "Loitering Subject",
      sub: "Outside Buffer Zone",
      cam: "CAM_FOXTROT (Sector 4-B)",
      timeAgo: "20:22:10 (27m ago)",
      coords: "Lat 32.5588, Long 75.1170",
      hash: "91b84920fe813958c2a938df1284bb8194ad8293ec481023ba1923847fa18392",
      factors: [
        { label: "+15 Loitering Alert", reason: "Subject static for 90 seconds near agricultural boundary." },
        { label: "+8 Buffer Proximity", reason: "Subject within 250m of restricted fence." },
        { label: "+5 Single Entity", reason: "No formation or rapid acceleration detected." },
      ],
    },
    {
      id: "INC-0038",
      time: "18:11:03",
      cameras: "ALPHA",
      type: "Animal (Wildlife)",
      threat: 12,
      severity: "LOW",
      status: "Low",
      color: "text-emerald-400",
      badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
      target: "Wildlife Motion",
      sub: "Perimeter Vegetation",
      cam: "CAM_ALPHA (Sector 4-B)",
      timeAgo: "18:11:03 (2h ago)",
      coords: "Lat 32.5635, Long 75.1250",
      hash: "42a8b910dc81273645e901fa32948cbb8192384a719283ba82910384759281a4",
      factors: [
        { label: "+8 Fence Motion", reason: "Low-level motion detected near the fence line in the optical feed." },
        { label: "+4 Sensor noise", reason: "Vegetation sway filtered by site calibration engine." },
      ],
    },
  ]);

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    return incidentList.filter((inc) => {
      const matchesSearch =
        !searchQuery.trim() ||
        inc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.cameras.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.severity.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSeverity =
        incidentSeverityFilter === "ALL" || inc.severity === incidentSeverityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [incidentList, searchQuery, incidentSeverityFilter]);

  // Current selected incident
  const currentIncident = useMemo(() => {
    return incidentList.find((i) => i.id === selectedIncidentId) || incidentList[0];
  }, [incidentList, selectedIncidentId]);

  // Filtered targets
  const filteredTargets = useMemo(() => {
    if (targetClassFilter === "all") return trackedTargets;
    return trackedTargets.filter((t) => t.class === targetClassFilter);
  }, [targetClassFilter, trackedTargets]);

  // Dynamic Calculated Threat for Ingress Lab
  const ingressCalculatedThreat = useMemo(() => {
    const normalized = Math.max(0, Math.min(1, (150 - ingressDistance) / 140));
    const base = 15;
    const curve = Math.round(base + normalized * 80);
    return Math.min(99, curve);
  }, [ingressDistance]);

  // Trigger siren automatically in Ingress Lab if >= alarmThreshold ONLY during active user simulation!
  useEffect(() => {
    if (
      isIngressSimulating &&
      ingressCalculatedThreat >= alarmThreshold &&
      !isAlarmActive &&
      !isSilenced &&
      !silenceSuccess &&
      audioEnabled
    ) {
      siren.start();
      setRelays((prev) => ({ ...prev, siren115dB: true, strobeLight: true }));
    }
  }, [isIngressSimulating, ingressCalculatedThreat, alarmThreshold, isAlarmActive, isSilenced, silenceSuccess, audioEnabled]);

  // Ingress auto simulation ticker
  useEffect(() => {
    let interval = null;
    if (isIngressSimulating) {
      interval = setInterval(() => {
        setIngressDistance((prev) => {
          if (prev <= 12) {
            setIsIngressSimulating(false);
            return 12;
          }
          return prev - 4;
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isIngressSimulating]);

  // Reconstruction timeline auto-play
  useEffect(() => {
    let timer = null;
    if (isReconPlaying) {
      timer = setInterval(() => {
        setScrubberPos((p) => {
          if (p >= 100) return 0;
          return p + 2;
        });
      }, 150);
    }
    return () => clearInterval(timer);
  }, [isReconPlaying]);

  // Handle Webcam toggle for live camera demo
  const handleToggleWebcam = async () => {
    triggerSound("click");
    if (webcamActive) {
      if (videoWebcamRef.current && videoWebcamRef.current.srcObject) {
        videoWebcamRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
      setWebcamActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoWebcamRef.current) {
          videoWebcamRef.current.srcObject = stream;
        }
        setWebcamActive(true);
        setActionNotice("Live webcam stream initialized · YOLOv8 tracking engaged.");
        setTimeout(() => setActionNotice(null), 4000);
      } catch (err) {
        console.warn("Webcam access unavailable:", err);
        setActionNotice("Webcam access unavailable or permission denied. Defaulting to pre-recorded HD test stream.");
        setTimeout(() => setActionNotice(null), 4000);
      }
    }
  };

  // On-Device Edge Training Simulation
  const handleStartTraining = () => {
    triggerSound("click");
    setTrainingActive(true);
    setTrainingEpoch(0);
    setTrainingLogs(["[INIT] SIMULATION — illustrative YOLOv8n fine-tuning run on a CPU node (Phase 2 capability)..."]);

    const steps = [
      { epoch: 1, loss: 0.384, map: 86.1, log: "[EPOCH 1/5] Loss: 0.384 · Box Loss: 0.042 · Class Loss: 0.021 · DFL: 0.321" },
      { epoch: 2, loss: 0.291, map: 89.4, log: "[EPOCH 2/5] Loss: 0.291 · nuisance suppression sampling for border vegetation" },
      { epoch: 3, loss: 0.188, map: 92.7, log: "[EPOCH 3/5] Loss: 0.188 · OSNet Re-ID 512-dim embedding margin optimization" },
      { epoch: 4, loss: 0.114, map: 95.3, log: "[EPOCH 4/5] Loss: 0.114 · low-light contrast adaptation converged" },
      { epoch: 5, loss: 0.068, map: 97.2, log: "[EPOCH 5/5] Loss: 0.068 · simulated run only — no weights shipped in the MVP" },
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < steps.length) {
        const s = steps[currentStep];
        setTrainingEpoch(s.epoch);
        setTrainingLoss(s.loss);
        setTrainingmAP(s.map);
        setTrainingLogs((prev) => [...prev, s.log]);
        currentStep++;
      } else {
        clearInterval(interval);
        setTrainingActive(false);
        triggerSound("verify");
        setActionNotice("Simulated fine-tuning run complete — illustrative only, Phase 2 roadmap capability.");
        setTimeout(() => setActionNotice(null), 4500);
      }
    }, 1100);
  };

  // Open Dispatch Modal
  const handleOpenDispatch = (incId) => {
    triggerSound("radio");
    setSelectedIncidentId(incId);
    setModalType("dispatchModal");
  };

  // Confirm Dispatch
  const handleConfirmDispatch = () => {
    triggerSound("radio");
    setIncidentList((prev) =>
      prev.map((item) =>
        item.id === currentIncident.id
          ? { ...item, status: "DISPATCHED", badge: "bg-white/[0.06] text-white border-white/12" }
          : item
      )
    );
    setActionNotice(`🚨 Quick Reaction Team (${dispatchUnit}) deployed to ${currentIncident.cam}. Tactical comms link live.`);
    setModalType(null);
    setTimeout(() => setActionNotice(null), 5000);
  };

  // Track Target
  const handleTrackTarget = (trackId) => {
    triggerSound("click");
    setSelectedTrackId(trackId);
    setActionNotice(`Tracking locked onto Target #${trackId}. Tactical vector synchronized.`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  // Toggle Hardware Relay
  const toggleRelay = (relayKey) => {
    triggerSound("click");
    setRelays((prev) => {
      const nextVal = !prev[relayKey];
      setActionNotice(`Hardware Relay [${relayKey}]: ${nextVal ? "CLOSED / ENERGIZED" : "OPEN / DE-ENERGIZED"}`);
      setTimeout(() => setActionNotice(null), 3000);
      return { ...prev, [relayKey]: nextVal };
    });
  };

  return (
    <div className={`sentinel-console min-h-screen w-full ${darkMode ? "bg-[#000000]" : "bg-[#000000]"} text-white flex flex-col antialiased selection:bg-white selection:text-black font-sans`}>
      {/* ── ACTION NOTIFICATION TOAST ───────────────────────────── */}
      {actionNotice && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-3 rounded-xl bg-black/95 border border-white/12 px-4 py-3 text-xs text-white shadow-[0_10px_35px_rgba(0,0,0,0.85)] backdrop-blur-md animate-fadeIn">
          <CheckCircle2 size={16} className="text-white shrink-0" />
          <span className="font-mono">{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="text-white/55 hover:text-white ml-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── DYNAMIC EMERGENCY SIREN ACOUSTIC BANNER ── */}
      {isAlarmActive && (
        <div className="bg-gradient-to-r from-red-950 via-red-900 to-red-950 border-b-2 border-red-500 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-[0_0_35px_rgba(239,68,68,0.6)] z-50 animate-pulse sticky top-0">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-red-500 animate-ping shrink-0" />
            <div className="flex items-center gap-2">
              <span className="font-mono font-extrabold text-sm text-red-200">
                Critical perimeter breach · active
              </span>
              <span className="hidden sm:inline text-xs font-mono bg-red-950/80 px-2 py-0.5 rounded border border-red-500/60 text-red-300">
                Sector 4-B · threat score 87/100
              </span>
            </div>
            {/* Audio Wave Visualizer */}
            <div className="hidden md:flex items-center gap-0.5 h-4 ml-2">
              {[12, 18, 8, 22, 14, 26, 10, 20, 16].map((h, i) => (
                <span
                  key={i}
                  className="w-1 bg-red-400 rounded-full animate-bounce"
                  style={{ height: `${h}px`, animationDelay: `${i * 0.08}s` }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-red-200 hidden lg:inline">
              Acoustic horn · 115 dB active
            </span>
            <button
              onClick={handleSilence}
              disabled={isSilencing}
              className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-mono transition-colors shadow-md flex items-center gap-1.5"
            >
              <BellOff size={13} />
              <span>{isSilencing ? "Silencing..." : "Silence Siren"}</span>
            </button>
            <button
              onClick={() => handleOpenDispatch(currentIncident.id)}
              className="px-3 py-1 rounded-lg bg-white hover:bg-white text-black text-xs font-bold font-mono transition-colors shadow-md flex items-center gap-1.5"
            >
              <Radio size={13} />
              <span>Deploy QRT</span>
            </button>
          </div>
        </div>
      )}

      {/* Silenced Feedback Banner */}
      {silenceSuccess && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/60 text-emerald-200 px-4 py-2 flex items-center justify-between text-xs font-mono z-50">
          <div className="flex items-center gap-2">
            <Check size={15} className="text-emerald-400" />
            <span>Siren silenced by duty commander — system monitoring active</span>
          </div>
          <span className="text-[10px] text-emerald-400">Section 65B Audit Log Recorded</span>
        </div>
      )}

      {/* ── TOP HEADER BAR (Duty Commander / Command Operator) ────── */}
      <header className="h-16 w-full border-b border-white/12 bg-[#000000] px-5 flex items-center justify-between shrink-0 sticky top-0 z-40">
        {/* Left branding */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setNavOpen(true)}
            className="md:hidden grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/12 text-white/80"
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <Link to="/" onClick={() => triggerSound("click")} className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/12 flex items-center justify-center text-white shadow-none group-hover:scale-105 transition-transform">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-white">IBVAP Sentinel</span>
                <span className="text-base" title="Sashastra Seema Bal / Ministry of Home Affairs">🇮🇳</span>
              </div>
              <div className="text-[9px] font-bold text-white/55 font-mono">
                AI border surveillance system
              </div>
            </div>
          </Link>


        </div>

        {/* Center/Right items */}
        <div className="flex items-center gap-3">
          {/* Search bar */}
          <div className="relative hidden md:flex items-center">
            <Search size={14} className="absolute left-3 text-white/55" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search incidents, cameras, tracks..."
              className="h-9 w-64 lg:w-72 rounded-lg bg-[#000000] border border-white/12 pl-9 pr-3 text-xs text-white placeholder:text-white/55 focus:outline-none focus:border-white/12 transition-colors font-sans"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 text-white/55 hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Audio Squelch / FX Toggle */}
          <button
            onClick={() => {
              setAudioEnabled(!audioEnabled);
              triggerSound("click");
            }}
            title={audioEnabled ? "Tactical Audio On" : "Tactical Audio Muted"}
            className="h-9 w-9 rounded-lg bg-[#000000] border border-white/12 flex items-center justify-center text-white/55 hover:text-white transition-colors"
          >
            {audioEnabled ? <Volume2 size={15} className="text-white" /> : <VolumeX size={15} />}
          </button>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => {
                triggerSound("click");
                setModalType(modalType === "notifications" ? null : "notifications");
              }}
              title="Notifications"
              className="relative h-9 w-9 rounded-lg bg-[#000000] border border-white/12 flex items-center justify-center text-white/55 hover:text-white transition-colors"
            >
              <Bell size={15} />
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-[9.5px] font-bold text-white flex items-center justify-center shadow-lg shadow-red-500/40">
                3
              </span>
            </button>

            {modalType === "notifications" && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-[#000000] border border-white/12 p-3 shadow-2xl z-50 animate-fadeIn">
                <div className="flex items-center justify-between pb-2 border-b border-white/12 text-xs font-bold text-white">
                  <span>Active alerts (3)</span>
                  <button onClick={() => setModalType(null)} className="text-white/55 hover:text-white">
                    <X size={13} />
                  </button>
                </div>
                <div className="divide-y divide-white/10 my-1 text-xs">
                  {incidentList.slice(0, 3).map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        triggerSound("click");
                        setSelectedIncidentId(n.id);
                        setSelectedCameraId(n.cam.split(" ")[0]);
                        setModalType(null);
                      }}
                      className="py-2 hover:bg-black/40 px-1.5 rounded cursor-pointer transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <span className={`font-mono font-bold ${n.color}`}>{n.id}</span>
                        <span className="text-[10px] text-white/55">{n.time}</span>
                      </div>
                      <div className="text-[11px] text-white truncate">{n.type}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Chip (Duty Commander) */}
          <div
            onClick={() => {
              triggerSound("click");
              setModalType(modalType === "operator" ? null : "operator");
            }}
            className="hidden sm:flex items-center gap-2.5 pl-1 border-l border-white/12 cursor-pointer hover:opacity-90 relative"
          >
            <div className="h-8 w-8 rounded-full bg-black border border-white/12 flex items-center justify-center text-white font-bold text-xs">
              CO
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold text-white leading-tight">Duty Commander</div>
              <div className="text-[10px] text-white leading-tight font-mono">Command Operator</div>
            </div>

            {modalType === "operator" && (
              <div className="absolute right-0 top-11 w-64 rounded-xl bg-[#000000] border border-white/12 p-3 shadow-2xl z-50 text-xs space-y-2 animate-fadeIn">
                <div className="font-bold text-white border-b border-white/12 pb-1.5">Operator Session</div>
                <div className="space-y-1 text-white font-mono text-[11px]">
                  <div>Designation: <strong className="text-white">Duty Commander</strong></div>
                  <div>Unit: <span className="text-white">SSB 42nd Battalion</span></div>
                  <div>Station: <span className="text-white">Sector 4-B Command Post</span></div>
                  <div>Clearance: <span className="text-emerald-400 font-bold">Level 3 Defense</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Clock */}
          <div className="hidden lg:flex flex-col text-right pl-2 border-l border-white/12">
            <span className="text-[10.5px] text-white/55">{timeState.dateStr}</span>
            <span className="text-xs font-bold font-mono text-white tracking-wide">{timeState.timeStr}</span>
          </div>
        </div>
      </header>

      {/* ── BODY: LEFT SIDEBAR + MAIN CONTENT CANVAS ───────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* mobile backdrop */}
        {navOpen && (
          <button
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fadeIn"
          />
        )}
        {/* ── LEFT SIDEBAR ── desktop: static column · mobile: slide-over drawer */}
        <aside
          className={`bg-[#000000] border-r border-white/12 flex flex-col justify-between shrink-0 p-3 select-none w-64 md:w-56 md:static md:translate-x-0 fixed inset-y-0 left-0 z-50 overflow-y-auto transition-transform duration-200 ${
            navOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Navigation Items */}
          <nav className="space-y-1">
            {[
              { id: "watchfloor", label: "Command Watchfloor", icon: Radio },
              { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
              { id: "surveillance", label: "Live Surveillance", icon: Video },
              { id: "incidents", label: "Incidents", icon: AlertTriangle, badge: "3" },
              { id: "map", label: "Border Map", icon: MapIcon },
              { id: "tracking", label: "Target Tracking", icon: Crosshair },
              { id: "reconstruction", label: "Reconstruction", customIcon: true },
              { id: "evidence", label: "Evidence Vault", icon: Database },
              { id: "analytics", label: "Analytics", icon: BarChart3 },
              { id: "hardware", label: "Hardware Control", icon: Sliders },
              { id: "reports", label: "Reports", icon: FileText },
              { id: "settings", label: "Settings", icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveNav(item.id);
                    setNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-all group ${
                    isActive
                      ? "bg-[#000000]/80 text-white border border-white/12 shadow-none font-semibold"
                      : "text-white/55 hover:text-white hover:bg-black/40 border border-transparent font-medium"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.customIcon ? (
                      <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 ${isActive ? "text-white stroke-cyan-400" : "text-white/55 stroke-slate-400 group-hover:stroke-slate-200"}`} fill="none" strokeWidth="2">
                        <circle cx="6" cy="18" r="2.5" fill="currentColor" />
                        <circle cx="18" cy="6" r="2.5" fill="currentColor" />
                        <path d="M6 15.5 C 6 10, 18 14, 18 8.5" />
                      </svg>
                    ) : (
                      <Icon size={17} className={isActive ? "text-white" : "text-white/55 group-hover:text-white"} />
                    )}
                    <span className={isActive ? "text-white font-semibold" : "text-white/55 group-hover:text-white"}>
                      {item.label}
                    </span>
                  </div>

                  {item.badge && (
                    <span className={`text-xs font-mono font-bold ${isActive ? "text-white" : "text-white/55"}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Bottom pinned decorative watchtower illustration & ministry credit */}
          <div className="mt-4 pt-3 border-t border-white/12">
            <div className="relative rounded-xl overflow-hidden bg-gradient-to-b from-[#000000] to-[#000000] border border-white/12 p-2 text-center mb-2">
              <div className="space-y-0.5 font-mono text-[8.5px] text-white/55">
                <div>Vigilance</div>
                <div>Integrity</div>
                <div>Security</div>
              </div>
            </div>

            <div className="text-center text-[9px] text-white/55 leading-tight">
              <div className="font-semibold text-white/55">Ministry of Home Affairs</div>
              <div>Government of India</div>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT CANVAS ──────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-[#000000] p-4.5 space-y-4">
          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 0: COMMAND WATCHFLOOR (pseudo-3D tactical scene)  */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "watchfloor" && <TacticalWatchfloor />}

          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 1: DASHBOARD MASTER OVERVIEW                      */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "dashboard" && (
            <>
              {/* TOP STAT ROW (5 Cards) */}
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                <div
                  onClick={() => { setActiveNav("surveillance"); }}
                  className="rounded-2xl bg-[#000000] border border-white/12 p-3.5 flex items-center gap-3.5 shadow-sm hover:border-white/30 cursor-pointer transition-all"
                >
                  <div className="h-11 w-11 rounded-xl bg-white/[0.06] border border-white/12 flex items-center justify-center text-white shrink-0">
                    <Video size={20} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono text-white leading-tight tabular-nums"><CountUp value={6} />&thinsp;/&thinsp;6</div>
                    <div className="text-xs text-white/55">Cameras Online</div>
                  </div>
                </div>

                <div
                  onClick={() => { setActiveNav("incidents"); }}
                  className="rounded-2xl bg-[#000000] border border-white/12 p-3.5 flex items-center gap-3.5 shadow-sm hover:border-white/30 cursor-pointer transition-all"
                >
                  <div className="h-11 w-11 rounded-xl bg-black/30 border border-white/12 flex items-center justify-center text-white shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono text-white leading-tight tabular-nums"><CountUp value={3} /></div>
                    <div className="text-xs text-white/55">Active Incidents</div>
                  </div>
                </div>

                <div
                  onClick={() => { setActiveNav("tracking"); }}
                  className="rounded-2xl bg-[#000000] border border-white/12 p-3.5 flex items-center gap-3.5 shadow-sm hover:border-white/30 cursor-pointer transition-all"
                >
                  <div className="h-11 w-11 rounded-xl bg-white/[0.06] border border-white/12 flex items-center justify-center text-white shrink-0">
                    <Crosshair size={20} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono text-white leading-tight tabular-nums"><CountUp value={12} /></div>
                    <div className="text-xs text-white/55">Tracked Targets</div>
                  </div>
                </div>

                <div
                  onClick={() => {
                    triggerSound("click");
                    setSelectedIncidentId("INC-0042");
                    setModalType("alertDetails");
                  }}
                  className="rounded-2xl bg-[#000000] border border-white/12 p-3.5 flex items-center gap-3.5 shadow-sm hover:border-white/30 cursor-pointer transition-all"
                >
                  <div className="h-11 w-11 rounded-xl bg-white/[0.06] border border-white/12 flex items-center justify-center text-white shrink-0">
                    <BarChart3 size={20} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono text-white leading-tight tabular-nums"><CountUp value={87} /></div>
                    <div className="text-xs text-white/55">Highest Threat Score</div>
                  </div>
                </div>

                <div
                  onClick={handleToggleArm}
                  className="rounded-2xl bg-[#000000] border border-white/12 p-3.5 flex items-center justify-between shadow-sm cursor-pointer hover:border-emerald-500/40 transition-all"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="h-11 w-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <Shield size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-bold font-mono text-emerald-400">
                        {armedState ? "System armed" : "System disarmed"}
                      </div>
                      <div className="text-[11px] text-white">
                        {armedState ? "All sensors operational" : "Perimeter standby"}
                      </div>
                    </div>
                  </div>
                  <div className="h-8 w-16 text-emerald-400 flex items-center">
                    <svg viewBox="0 0 60 20" className="w-full h-full stroke-emerald-400 fill-none" strokeWidth="2">
                      <path d="M 0 10 L 15 10 L 20 2 L 25 18 L 30 5 L 35 12 L 40 10 L 60 10" />
                    </svg>
                  </div>
                </div>
              </section>

              {/* MIDDLE ROW: LIVE SURVEILLANCE + ACTIVE ALERT */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* 6 Cameras Grid */}
                <div className="lg:col-span-7 rounded-2xl bg-[#000000] border border-white/12 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-sm font-bold text-white">Live Surveillance</span>
                      <span className="text-xs text-white font-mono ml-1">6 Cameras</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs bg-[#000000] p-1 rounded-lg border border-white/12">
                      <button
                        onClick={() => { triggerSound("click"); setActiveSurveillanceView("grid"); }}
                        className={`px-2.5 py-1 rounded-md transition-colors ${activeSurveillanceView === "grid" ? "bg-[#000000] text-white border border-white/12 font-semibold" : "text-white/55 hover:text-white"}`}
                      >
                        Grid View
                      </button>
                      <button
                        onClick={() => { setActiveNav("map"); }}
                        className="px-2.5 py-1 rounded-md text-white/55 hover:text-white transition-colors"
                      >
                        Map View
                      </button>
                      <button
                        onClick={() => { triggerSound("click"); setActiveSurveillanceView("focus"); }}
                        className={`px-2.5 py-1 rounded-md transition-colors ${activeSurveillanceView === "focus" ? "bg-[#000000] text-white border border-white/12 font-semibold" : "text-white/55 hover:text-white"}`}
                      >
                        Focus View
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {displayCameras.map((cam) => {
                      const isSelected = selectedCameraId === cam.id;
                      return (
                        <div
                          key={cam.id}
                          onClick={() => { triggerSound("click"); setSelectedCameraId(cam.id); }}
                          className={`group relative aspect-video rounded-xl overflow-hidden bg-black border transition-all cursor-pointer ${
                            isSelected
                              ? "border-white/12 shadow-none ring-1 ring-white/20"
                              : "border-white/12 hover:border-white/30"
                          }`}
                        >
                          <video
                            src={cam.video}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="h-full w-full object-cover filter contrast-125 brightness-90 grayscale"
                          />
                          <div className="absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-2 flex items-center justify-between text-[10px] font-mono">
                            <span className="text-white font-semibold">{cam.name} <span className="text-white/55 font-normal">{cam.sector}</span></span>
                            <span className="flex items-center gap-1 text-white/60"><span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />REC</span>
                          </div>
                          {cam.hasDetection && (
                            <div className="absolute top-[20%] left-[38%] w-[24%] h-[60%] border-2 border-red-500 rounded-sm pointer-events-none shadow-[0_0_10px_rgba(239,68,68,0.6)] flex flex-col justify-start">
                              <span className="bg-red-500 text-white font-bold text-[8.5px] px-1 py-0.5 w-fit rounded-br">Person</span>
                            </div>
                          )}
                          <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 flex items-center justify-between text-[10px] font-mono text-white">
                            <span>20:49:07</span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); triggerSound("click"); setSelectedCameraId(cam.id); setActiveSurveillanceView("focus"); }} className="hover:text-white"><Maximize2 size={11} /></button>
                              <button onClick={(e) => { e.stopPropagation(); handleTakeSnapshot(); }} className="hover:text-white"><Camera size={11} /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Active Alert Panel */}
                <div className="lg:col-span-5 rounded-2xl bg-[#000000] border border-white/12 p-4 flex flex-col justify-between space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                        <AlertTriangle size={15} />
                      </div>
                      <span className="text-sm font-bold text-white">Active Alert</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-red-950/80 border border-red-500/60 text-[10px] font-extrabold text-red-200">
                      CRITICAL
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative h-24 w-28 rounded-xl overflow-hidden bg-black border border-red-500/70 shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.25)]">
                      <img src="/data/reid_cam1_crop.jpg" alt="Intruder" className="h-full w-full object-cover grayscale brightness-90" />
                      <div className="absolute inset-2 border border-red-500 rounded-sm">
                        <span className="bg-red-500 text-white font-bold text-[7.5px] px-1 py-0.5 rounded-br">Person</span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="text-base font-bold text-white truncate">{currentIncident.target}</h3>
                      <p className="text-xs text-white">{currentIncident.sub}</p>
                      <div className="pt-0.5 space-y-0.5 text-[11px] text-white">
                        <div className="flex items-center gap-1.5"><Video size={11} className="text-white/55" /><span className="font-mono text-white truncate">{currentIncident.cam}</span></div>
                        <div className="flex items-center gap-1.5"><Activity size={11} className="text-white/55" /><span className="text-white font-mono text-[10.5px]">{currentIncident.timeAgo}</span></div>
                        <div className="flex items-center gap-1.5 text-white/55 font-mono text-[10px]"><span>{currentIncident.coords}</span></div>
                      </div>
                    </div>

                    <div className="flex flex-col items-center shrink-0">
                      <div className="relative h-20 w-20 flex items-center justify-center">
                        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                          <path className="text-white/40" strokeWidth="3.2" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                          <path className="text-white shadow-none" strokeDasharray={`${currentIncident.threat}, 100`} strokeWidth="3.2" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-2xl font-extrabold font-mono text-white leading-none">{currentIncident.threat}</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold text-white/55 mt-1 font-mono">Threat score</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-white/55">Threat Factors (Click to Inspect)</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {currentIncident.factors.slice(0, 4).map((f, idx) => (
                        <button
                          key={idx}
                          onClick={() => { triggerSound("click"); setActiveFactorInfo(f); }}
                          className="px-2.5 py-1.5 rounded-lg bg-[#000000] border border-white/12 hover:border-white/30 text-[11px] font-medium text-white text-left truncate transition-colors"
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      onClick={() => { triggerSound("click"); setModalType("alertDetails"); }}
                      className="bg-[#171717] hover:bg-[#1f1f1f] text-white border border-white/12 font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <span>View Details</span>
                      <ArrowRight size={13} />
                    </button>
                    <button
                      onClick={() => handleTrackTarget("P17")}
                      className="bg-[#171717] hover:bg-[#1f1f1f] text-white border border-white/12 font-semibold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <Crosshair size={13} />
                      <span>Track Target</span>
                    </button>
                    <button
                      onClick={() => handleOpenDispatch(currentIncident.id)}
                      className="bg-white/[0.06] hover:bg-white/10 border border-white/12 text-white font-semibold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-none"
                    >
                      <Radio size={13} />
                      <span>Dispatch QRT</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* LOWER ROW: RECENT INCIDENTS + BORDER MAP */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-6 rounded-2xl bg-[#000000] border border-white/12 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity size={16} className="text-white/55" />
                      <span className="text-sm font-bold text-white">Recent Incidents</span>
                    </div>
                    <button onClick={() => { setActiveNav("incidents"); }} className="text-xs text-white/55 hover:text-white flex items-center gap-1 font-sans">
                      <span>View All</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/12 text-[11px] font-medium text-zinc-500">
                          <th className="pb-2">ID</th>
                          <th className="pb-2">Time</th>
                          <th className="pb-2">Cameras</th>
                          <th className="pb-2">Type</th>
                          <th className="pb-2">Threat</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {filteredIncidents.map((inc) => {
                          const isRowSelected = selectedIncidentId === inc.id;
                          return (
                            <tr
                              key={inc.id}
                              onClick={() => {
                                triggerSound("click");
                                setSelectedIncidentId(inc.id);
                                setSelectedCameraId(inc.cam.split(" ")[0]);
                              }}
                              className={`hover:bg-black/40 cursor-pointer transition-colors ${isRowSelected ? "bg-[#000000]" : ""}`}
                            >
                              <td className={`py-2.5 font-mono text-[11px] font-semibold ${inc.color}`}>{inc.id}</td>
                              <td className="py-2.5 font-mono text-[11px] text-zinc-500 tabular-nums">{inc.time}</td>
                              <td className="py-2.5 text-zinc-200">{inc.cameras}</td>
                              <td className="py-2.5 text-zinc-200">{inc.type}</td>
                              <td className={`py-2.5 font-mono font-semibold tabular-nums ${inc.color}`}>{inc.threat}</td>
                              <td className="py-2.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold border ${inc.badge}`}>
                                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                  {inc.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mini Border Map */}
                <div className="lg:col-span-6 rounded-2xl bg-[#000000] border border-white/12 p-4 space-y-3 relative overflow-hidden flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield size={16} className="text-white" />
                      <span className="text-sm font-bold text-white">Border Map</span>
                      <span className="flex items-center gap-1 text-xs text-emerald-400 font-mono ml-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        triggerSound("click");
                        setMapTheme(mapTheme === "satellite" ? "schematic" : "satellite");
                      }}
                      className="px-2.5 py-1 rounded-md bg-[#000000] border border-white/12 text-xs text-white flex items-center gap-1.5 hover:border-white/30 transition-colors"
                    >
                      <span>{mapTheme === "satellite" ? "Satellite" : "Schematic Grid"}</span>
                      <ChevronDown size={12} />
                    </button>
                  </div>

                  <div className="relative h-64 w-full rounded-xl overflow-hidden bg-[#000000] border border-white/12 flex items-center justify-center">
                    {mapTheme === "satellite" ? (
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,#000000_0%,#000000_80%)] opacity-85" />
                    ) : (
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#171717_1px,transparent_1px),linear-gradient(to_bottom,#171717_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] opacity-70" />
                    )}

                    <svg className="absolute inset-0 h-full w-full transition-transform duration-300" style={{ transform: `scale(${mapZoom})` }} viewBox="0 0 500 250">
                      <line x1="0" y1="50" x2="500" y2="50" stroke="#171717" strokeDasharray="3 3" />
                      <line x1="0" y1="125" x2="500" y2="125" stroke="#171717" strokeDasharray="3 3" />
                      <line x1="0" y1="200" x2="500" y2="200" stroke="#171717" strokeDasharray="3 3" />
                      <line x1="125" y1="0" x2="125" y2="250" stroke="#171717" strokeDasharray="3 3" />
                      <line x1="250" y1="0" x2="250" y2="250" stroke="#171717" strokeDasharray="3 3" />
                      <line x1="375" y1="0" x2="375" y2="250" stroke="#171717" strokeDasharray="3 3" />

                      {/* International Border Zero Line */}
                      <path d="M 50 220 Q 200 160 350 140 T 480 30" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeDasharray="6 4" />
                      
                      {/* Restricted Zone */}
                      <path d="M 180 180 L 320 120 L 360 140 L 220 200 Z" fill="#ef4444" fillOpacity="0.15" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 2" />
                      <text x="200" y="148" fill="#fca5a5" fontSize="10" fontFamily="sans-serif" fontWeight="bold">Restricted Zone (100m)</text>

                      {/* Camera Towers */}
                      <circle cx="150" cy="190" r="7" fill="#ffffff" fillOpacity="0.9" />
                      <circle cx="280" cy="145" r="7" fill="#ffffff" fillOpacity="0.9" />
                      <circle cx="380" cy="90" r="7" fill="#ffffff" fillOpacity="0.9" />

                      {/* Target Blip */}
                      <circle cx="240" cy="160" r="12" fill="#ef4444" fillOpacity="0.35" className="animate-ping" />
                      <polygon points="240,150 249,168 231,168" fill="#ef4444" stroke="#fff" strokeWidth="1.5" />
                    </svg>

                    <div className="absolute left-3 top-3 bottom-3 flex flex-col justify-center gap-1 z-10">
                      {["All", "Cameras", "Incidents", "Tracks"].map((layer) => {
                        const isFilterActive = activeMapFilter === layer.toLowerCase();
                        return (
                          <button
                            key={layer}
                            onClick={() => { triggerSound("click"); setActiveMapFilter(layer.toLowerCase()); }}
                            className={`px-2 py-1 rounded text-[10px] font-medium text-left transition-colors ${
                              isFilterActive
                                ? "bg-white/[0.06] text-white border border-white/12 font-semibold"
                                : "bg-[#000000]/80 text-white/55 hover:text-white border border-white/12"
                            }`}
                          >
                            {isFilterActive ? `✓ ${layer}` : layer}
                          </button>
                        );
                      })}
                    </div>

                    <div className="absolute right-3 top-3 flex flex-col gap-1 z-10">
                      <button onClick={() => { triggerSound("click"); setMapZoom((z) => Math.min(z + 0.2, 1.8)); }} className="h-7 w-7 rounded bg-[#000000]/90 border border-white/12 text-white hover:text-white flex items-center justify-center text-xs font-bold">+</button>
                      <button onClick={() => { triggerSound("click"); setMapZoom((z) => Math.max(z - 0.2, 0.8)); }} className="h-7 w-7 rounded bg-[#000000]/90 border border-white/12 text-white hover:text-white flex items-center justify-center text-xs font-bold">-</button>
                      <button onClick={() => { triggerSound("click"); setMapZoom(1); }} className="h-7 w-7 rounded bg-[#000000]/90 border border-white/12 text-white hover:text-white flex items-center justify-center"><RotateCcw size={11} /></button>
                    </div>

                    <div onClick={() => handleTrackTarget("P17")} className="absolute right-3 bottom-3 rounded-xl bg-[#000000]/95 border border-white/12 p-2.5 text-left text-[10.5px] font-mono shadow-xl backdrop-blur-sm cursor-pointer hover:border-white/30 transition-colors">
                      <div className="flex items-center gap-1.5 font-bold text-white"><span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />Track #P17</div>
                      <div className="text-white">Moving NE · 5.2 km/h</div>
                      <div className="text-white font-semibold">Last: CAM_BRAVO</div>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 2: LIVE SURVEILLANCE & AI CCTV INGRESS TESTBED   */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "surveillance" && (
            <div className="space-y-4 animate-fadeIn">
              {/* Surveillance Sub-Nav Header */}
              <div className="p-4 rounded-2xl bg-[#000000] border border-white/12 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Video size={18} className="text-white" />
                    <span>Perimeter Surveillance & AI Inference Testbed</span>
                  </h2>
                  <p className="text-xs text-white/55">Sector 4-B High-Security Northern Corridor • Live feeds & cloud simulation</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-[#000000] p-1 rounded-xl border border-white/12 text-xs">
                    <button
                      onClick={() => { triggerSound("click"); setActiveSurveillanceView("grid"); }}
                      className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-colors ${
                        activeSurveillanceView === "grid" ? "bg-white/[0.06] text-white border border-white/12 font-bold" : "text-white/55 hover:text-white"
                      }`}
                    >
                      6-Cam Grid
                    </button>
                    <button
                      onClick={() => { triggerSound("click"); setActiveSurveillanceView("testbed"); }}
                      className={`px-3 py-1.5 rounded-lg font-mono text-xs flex items-center gap-1.5 transition-colors ${
                        activeSurveillanceView === "testbed" ? "bg-red-500/20 text-red-300 border border-red-500/50 font-bold shadow-[0_0_12px_rgba(239,68,68,0.3)]" : "text-white/55 hover:text-white"
                      }`}
                    >
                      <Disc size={12} className={activeSurveillanceView === "testbed" ? "animate-spin text-red-400" : ""} />
                      <span>CCTV Ingress & Training Lab</span>
                    </button>
                    <button
                      onClick={() => { triggerSound("click"); setActiveSurveillanceView("focus"); }}
                      className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-colors ${
                        activeSurveillanceView === "focus" ? "bg-white/[0.06] text-white border border-white/12 font-bold" : "text-white/55 hover:text-white"
                      }`}
                    >
                      PTZ Focus
                    </button>
                  </div>

                  {/* Vision Filter Mode */}
                  <div className="hidden sm:flex items-center gap-1 bg-[#000000] p-1 rounded-xl border border-white/12 text-xs">
                    {["optical", "lowlight", "edge"].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => { triggerSound("click"); setVisionMode(mode); }}
                        className={`px-2.5 py-1 rounded-lg capitalize font-mono text-xs transition-colors ${
                          visionMode === mode ? "bg-white/[0.06] text-white border border-white/12 font-bold" : "text-white/55 hover:text-white"
                        }`}
                      >
                        {mode === "lowlight" ? "low-light" : mode}
                      </button>
                    ))}
                  </div>

                  <button onClick={handleTakeSnapshot} className="px-3 py-1.5 rounded-xl bg-black hover:bg-black text-white border border-white/12 text-xs font-semibold flex items-center gap-1.5 transition-colors">
                    <Camera size={13} />
                    <span>Snapshot</span>
                  </button>
                </div>
              </div>

              {/* ── SUB-VIEW: INTERACTIVE CCTV INGRESS & MODEL TRAINING TESTBED ── */}
              {activeSurveillanceView === "testbed" && (
                <div className="space-y-4 animate-fadeIn">
                  {/* Testbed Top Command Bar */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-[#000000] to-[#000000] border border-white/12 space-y-3 shadow-lg">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                          <h3 className="text-base font-bold text-white font-mono">
                            LIVE CCTV HARDWARE INGRESS & SIREN TRIGGER TESTBED
                          </h3>
                        </div>
                        <p className="text-xs text-white mt-0.5">
                          Simulate vehicle or intruder physically moving closer to CCTV. Watch real-time Threat Score climb and auto-trigger siren at threshold &gt;= {alarmThreshold}!
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleToggleWebcam}
                          className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all ${
                            webcamActive
                              ? "bg-red-500/20 border-red-500/70 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                              : "bg-black border-white/12 text-white hover:text-white"
                          }`}
                        >
                          <Video size={13} />
                          <span>{webcamActive ? "Stop Live Webcam" : "Use Real Laptop Webcam"}</span>
                        </button>

                        <button
                          onClick={handleStartTraining}
                          disabled={trainingActive}
                          className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/12 hover:bg-white text-black text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow-md"
                        >
                          <Cpu size={13} />
                          <span>{trainingActive ? "Fine-tuning..." : "Fine-tune YOLOv8"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Scenario Switcher + Distance Slider Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-white/12">
                      <div>
                        <label className="text-[11px] font-mono text-white/55 block mb-1">Select Ingress Scenario:</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => { triggerSound("click"); setIngressScenario("vehicle"); }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono text-left truncate transition-colors ${
                              ingressScenario === "vehicle" ? "bg-white/[0.06] text-white border border-white/12 font-bold" : "bg-[#000000] text-white/55 border border-white/12"
                            }`}
                          >
                            🚗 Vehicle Rush (42 km/h)
                          </button>
                          <button
                            onClick={() => { triggerSound("click"); setIngressScenario("person"); }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono text-left truncate transition-colors ${
                              ingressScenario === "person" ? "bg-white/[0.06] text-white border border-white/12 font-bold" : "bg-[#000000] text-white/55 border border-white/12"
                            }`}
                          >
                            🏃 Infiltrator Crawl
                          </button>
                        </div>
                      </div>

                      <div className="md:col-span-2 space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-white">
                            Distance to Physical CCTV / Geofence: <strong className="text-white text-sm">{ingressDistance} meters</strong>
                          </span>
                          <span className={`font-bold ${ingressCalculatedThreat >= alarmThreshold ? "text-red-400 animate-pulse" : "text-amber-400"}`}>
                            Threat score: {ingressCalculatedThreat} / 100 {ingressCalculatedThreat >= alarmThreshold ? "🚨 [SIREN ACTIVE]" : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="10"
                            max="150"
                            value={ingressDistance}
                            onChange={(e) => setIngressDistance(Number(e.target.value))}
                            className="flex-1 accent-cyan-500 cursor-pointer h-2 bg-black rounded-lg"
                          />
                          <button
                            onClick={() => setIsIngressSimulating(!isIngressSimulating)}
                            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
                              isIngressSimulating
                                ? "bg-red-600 text-white animate-pulse"
                                : "bg-white hover:bg-white text-white"
                            }`}
                          >
                            {isIngressSimulating ? "Stop Ingress" : "▶ Simulate Ingress"}
                          </button>
                          <button
                            onClick={() => { setIngressDistance(150); setIsIngressSimulating(false); }}
                            className="px-2.5 py-1 rounded-lg bg-black hover:bg-black text-white text-xs"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Video Screen with Overlaid Dynamic AI Bounding Box & HUD */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-8 rounded-2xl overflow-hidden bg-black border border-white/12 relative aspect-video shadow-2xl">
                      {/* Video Stream */}
                      {webcamActive ? (
                        <video ref={videoWebcamRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                      ) : (
                        <video
                          src={
                            ingressScenario === "vehicle"
                              ? "/data/threat_vehicle_rush_web.mp4"
                              : "/data/threat_night_crawl_web.mp4"
                          }
                          autoPlay
                          loop
                          muted
                          playsInline
                          className={`h-full w-full object-cover ${
                            visionMode === "lowlight"
                              ? "invert hue-rotate-180 contrast-150 brightness-110"
                              : visionMode === "edge"
                              ? "filter contrast-200 grayscale invert"
                              : "contrast-125 brightness-95"
                          }`}
                        />
                      )}

                      {/* HUD Overlays */}
                      <div className="absolute top-3 inset-x-3 flex items-center justify-between text-xs font-mono pointer-events-none">
                        <span className="bg-black/80 px-2.5 py-1 rounded border border-white/12 text-white flex items-center gap-1.5">
                          <Disc size={13} className="text-white" />
                          <span>AI INFERENCE STREAM · 1920x1080 @ 25 FPS · TENSORRT INT8</span>
                        </span>
                        <span className={`px-2.5 py-1 rounded border font-bold ${ingressCalculatedThreat >= alarmThreshold ? "bg-red-950/90 border-red-500 text-red-200 animate-pulse" : "bg-black/80 border-white/12 text-white"}`}>
                          {ingressCalculatedThreat >= alarmThreshold ? "Perimeter tripwire breach" : "Monitoring perimeter"}
                        </span>
                      </div>

                      {/* Dynamic Bounding Box expanding as distance decreases */}
                      <div
                        className={`absolute border-2 rounded transition-all duration-300 pointer-events-none flex flex-col justify-start ${
                          ingressCalculatedThreat >= alarmThreshold
                            ? "border-red-500 bg-red-500/10 shadow-[0_0_25px_rgba(239,68,68,0.8)]"
                            : ingressCalculatedThreat >= 50
                            ? "border-amber-400 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                            : "border-white/12 bg-white/10"
                        }`}
                        style={{
                          top: `${Math.max(15, 60 - ((150 - ingressDistance) / 140) * 35)}%`,
                          left: `${Math.max(20, 50 - ((150 - ingressDistance) / 140) * 20)}%`,
                          width: `${Math.min(65, 20 + ((150 - ingressDistance) / 140) * 45)}%`,
                          height: `${Math.min(75, 25 + ((150 - ingressDistance) / 140) * 50)}%`,
                        }}
                      >
                        <div className={`px-2 py-0.5 text-[10px] font-mono font-bold text-white w-fit ${ingressCalculatedThreat >= alarmThreshold ? "bg-red-600" : "bg-white"}`}>
                          {ingressScenario === "vehicle" ? "Vehicle #V03 [0.96]" : "Infiltrator #P17 [0.94]"} · {ingressDistance}m
                        </div>
                      </div>

                      {/* Bottom Telemetry Bar */}
                      <div className="absolute bottom-3 inset-x-3 flex items-center justify-between text-xs font-mono bg-black/80 p-2.5 rounded-xl border border-white/12 text-white pointer-events-none">
                        <div>
                          <span>Target coords </span>
                          <span className="text-white">Lat 32.5621, Long 75.1234</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span>Velocity <strong className="ml-1 text-emerald-400">{ingressScenario === "vehicle" ? "42.0 km/h" : "5.2 km/h"}</strong></span>
                          <span>Runtime <strong className="ml-1 text-white">cloud</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Right Telemetry & Fine-Tuning Terminal */}
                    <div className="lg:col-span-4 rounded-2xl bg-[#000000] border border-white/12 p-4 flex flex-col justify-between space-y-3">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/12 pb-2">
                          <span className="text-xs font-bold font-mono text-white flex items-center gap-1.5">
                            <Terminal size={14} className="text-white" />
                            <span>Model fine-tuning &amp; telemetry</span>
                          </span>
                          <span className="text-[10px] text-amber-300 font-mono">SIMULATION · PHASE 2</span>
                        </div>

                        <div className="space-y-2 font-mono text-xs">
                          <div className="flex justify-between">
                            <span className="text-white/55">YOLOv8 Backbone:</span>
                            <span className="text-white">Ultralytics v8.1.0n</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/55">Runtime:</span>
                            <span className="text-white">PyTorch / ONNX Runtime (CPU)</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/55">Current Loss:</span>
                            <span className="text-emerald-400">{trainingLoss.toFixed(3)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/55">Precision (mAP@50):</span>
                            <span className="text-white font-bold">{trainingmAP.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/55">Acoustic Auto-Siren:</span>
                            <span className={ingressCalculatedThreat >= alarmThreshold ? "text-red-400 font-bold animate-pulse" : "text-white/55"}>
                              {ingressCalculatedThreat >= alarmThreshold ? "TRIGGERED (115 dB)" : "STANDBY"}
                            </span>
                          </div>
                        </div>

                        {/* Training Terminal Log Box */}
                        <div className="h-36 rounded-xl bg-[#000000] border border-white/12 p-2.5 font-mono text-[10.5px] text-white overflow-y-auto space-y-1">
                          <div className="text-white/55">// Cloud training log stream</div>
                          {trainingLogs.map((log, idx) => (
                            <div key={idx} className="text-white">{log}</div>
                          ))}
                          {trainingActive && (
                            <div className="text-amber-400 flex items-center gap-1 animate-pulse">
                              <span>Computing gradient updates for Epoch {trainingEpoch}/5...</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/12 space-y-2">
                        <button
                          onClick={handleSoundAlarm}
                          className="w-full py-2.5 rounded-xl bg-red-950/60 border border-red-500/60 text-red-200 hover:bg-red-900 font-bold text-xs font-mono transition-colors flex items-center justify-center gap-2"
                        >
                          <Bell size={14} />
                          <span>{isAlarmActive ? "Silence Active Siren" : "Test Manual Siren Pulse (5s)"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SUB-VIEW: STANDARD 6 CAMERA GRID ── */}
              {activeSurveillanceView === "grid" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayCameras.map((cam) => {
                    const isSelected = selectedCameraId === cam.id;
                    return (
                      <div
                        key={cam.id}
                        onClick={() => { triggerSound("click"); setSelectedCameraId(cam.id); }}
                        className={`group rounded-2xl overflow-hidden bg-black border transition-all cursor-pointer ${
                          isSelected ? "border-white/12 shadow-none ring-1 ring-white/20" : "border-white/12 hover:border-white/30"
                        }`}
                      >
                        <div className="relative aspect-video">
                          <video
                            src={cam.video}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className={`h-full w-full object-cover ${
                              visionMode === "lowlight"
                                ? "invert hue-rotate-180 contrast-150 brightness-110"
                                : visionMode === "edge"
                                ? "filter contrast-200 grayscale invert"
                                : "grayscale contrast-125 brightness-95"
                            }`}
                          />
                          <div className="absolute top-2 inset-x-2 flex items-center justify-between text-[11px] font-mono text-white">
                            <span className="bg-black/70 px-2 py-0.5 rounded border border-white/12">{cam.name}</span>
                            <span className="bg-black text-white/70 border border-white/12 px-2 py-0.5 rounded flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />LIVE</span>
                          </div>
                          {cam.hasDetection && (
                            <div className="absolute top-[20%] left-[38%] w-[24%] h-[60%] border-2 border-red-500 rounded pointer-events-none shadow-[0_0_12px_rgba(239,68,68,0.7)] flex flex-col justify-start">
                              <span className="bg-red-500 text-white font-bold text-[8.5px] px-1 py-0.5 w-fit rounded-br">Person [0.94]</span>
                            </div>
                          )}
                          <div className="absolute bottom-2 inset-x-2 flex items-center justify-between text-[10px] font-mono text-white">
                            <span className="bg-black/70 px-2 py-0.5 rounded">{cam.res} • {cam.fps} FPS</span>
                            <span className="bg-black/70 px-2 py-0.5 rounded text-white">{cam.bitrate}</span>
                          </div>
                        </div>

                        {/* PTZ Quick Control Strip */}
                        <div className="p-3 bg-[#000000] border-t border-white/12 flex items-center justify-between text-xs font-mono">
                          <span className="text-white">{cam.tag}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); triggerSound("click"); setActionNotice(`${cam.name} PTZ preset 1 loaded.`); }} className="px-2 py-0.5 rounded bg-black hover:bg-black text-white">P1</button>
                            <button onClick={(e) => { e.stopPropagation(); triggerSound("click"); setActionNotice(`${cam.name} PTZ preset 2 loaded.`); }} className="px-2 py-0.5 rounded bg-black hover:bg-black text-white">P2</button>
                            <button onClick={(e) => { e.stopPropagation(); triggerSound("click"); setSelectedCameraId(cam.id); setActiveSurveillanceView("focus"); }} className="px-2 py-0.5 rounded bg-white/[0.06] border border-white/12 text-white">PTZ</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── SUB-VIEW: PTZ FOCUS VIEW WITH INTERACTIVE PAD ── */}
              {activeSurveillanceView === "focus" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-8 rounded-2xl overflow-hidden bg-black border border-white/12 relative aspect-video">
                    {(() => {
                      const activeCam = displayCameras.find((c) => c.id === selectedCameraId) || displayCameras[1];
                      return (
                        <>
                          <video
                            src={activeCam.video}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="h-full w-full object-cover transition-transform duration-200"
                            style={{
                              transform: `scale(${ptzZoomLevel}) translate(${ptzPan.x}px, ${ptzPan.y}px)`,
                            }}
                          />
                          <div className="absolute top-3 inset-x-3 flex items-center justify-between text-xs font-mono text-white pointer-events-none">
                            <span className="bg-black/80 px-3 py-1 rounded border border-white/12 font-bold">
                              {activeCam.name} · {activeCam.tag}
                            </span>
                            <span className="bg-black/80 px-3 py-1 rounded border border-white/12 text-white">
                              Zoom {ptzZoomLevel.toFixed(1)}x · Pan {ptzPan.x}px, {ptzPan.y}px
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="lg:col-span-4 rounded-2xl bg-[#000000] border border-white/12 p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white font-mono border-b border-white/12 pb-2">
                      PTZ MOTOR BUS CONTROLLER (RS-485)
                    </h3>

                    {/* D-Pad Controller */}
                    <div className="flex flex-col items-center justify-center py-2">
                      <button
                        onClick={() => { triggerSound("click"); setPtzPan((p) => ({ ...p, y: p.y - 10 })); }}
                        className="h-10 w-10 rounded-xl bg-black hover:bg-black text-white flex items-center justify-center font-bold"
                      >
                        <ChevronUp size={18} />
                      </button>
                      <div className="flex items-center gap-3 my-2">
                        <button
                          onClick={() => { triggerSound("click"); setPtzPan((p) => ({ ...p, x: p.x - 10 })); }}
                          className="h-10 w-10 rounded-xl bg-black hover:bg-black text-white flex items-center justify-center font-bold"
                        >
                          <ChevronRight size={18} className="rotate-180" />
                        </button>
                        <button
                          onClick={() => { triggerSound("click"); setPtzPan({ x: 0, y: 0 }); setPtzZoomLevel(1); }}
                          className="h-10 w-10 rounded-xl bg-white hover:bg-white text-black flex items-center justify-center font-mono text-xs font-bold"
                        >
                          RST
                        </button>
                        <button
                          onClick={() => { triggerSound("click"); setPtzPan((p) => ({ ...p, x: p.x + 10 })); }}
                          className="h-10 w-10 rounded-xl bg-black hover:bg-black text-white flex items-center justify-center font-bold"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                      <button
                        onClick={() => { triggerSound("click"); setPtzPan((p) => ({ ...p, y: p.y + 10 })); }}
                        className="h-10 w-10 rounded-xl bg-black hover:bg-black text-white flex items-center justify-center font-bold"
                      >
                        <ChevronDown size={18} />
                      </button>
                    </div>

                    {/* Zoom Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-white/55">Optical Zoom:</span>
                        <span className="text-white font-bold">{ptzZoomLevel.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="3.0"
                        step="0.1"
                        value={ptzZoomLevel}
                        onChange={(e) => setPtzZoomLevel(Number(e.target.value))}
                        className="w-full accent-cyan-500 cursor-pointer"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/12">
                      <button
                        onClick={() => { triggerSound("click"); setActiveSurveillanceView("grid"); }}
                        className="py-2 rounded-xl bg-black hover:bg-black text-white text-xs font-semibold"
                      >
                        Back to Grid
                      </button>
                      <button
                        onClick={handleTakeSnapshot}
                        className="py-2 rounded-xl bg-white hover:bg-white text-black text-xs font-bold"
                      >
                        Capture Frame
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 3: INCIDENTS FULL WORKSPACE                       */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "incidents" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#000000] border border-white/12">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={18} className="text-white" />
                    <h2 className="text-lg font-bold text-white">Incident Command & Triage Workspace</h2>
                  </div>
                  <p className="text-xs text-white/55 mt-0.5">Sector 4-B Northern Border Corridor • Correlated Multi-Camera Telemetry</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setActiveNav("evidence"); }} className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/12 text-black hover:bg-white text-xs font-semibold flex items-center gap-1.5 transition-colors">
                    <Database size={13} />
                    <span>Evidence Vault</span>
                  </button>
                  <button
                    onClick={() => {
                      triggerSound("click");
                      setModalType("dossier");
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-white text-black text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md"
                  >
                    <Download size={13} />
                    <span>Export Dossier</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sev) => {
                  const isActive = incidentSeverityFilter === sev;
                  return (
                    <button
                      key={sev}
                      onClick={() => { triggerSound("click"); setIncidentSeverityFilter(sev); }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? "bg-white/[0.06] text-white border border-white/12 shadow-none"
                          : "bg-[#000000] text-white/55 border border-white/12 hover:text-white"
                      }`}
                    >
                      {sev} {sev === "ALL" ? `(${incidentList.length})` : `(${incidentList.filter((i) => i.severity === sev).length})`}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredIncidents.map((inc) => (
                  <div key={inc.id} className="p-4.5 rounded-2xl bg-[#000000] border border-white/12 hover:border-white/30 transition-all space-y-3">
                    <div className="flex items-center justify-between border-b border-white/12 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-extrabold text-sm ${inc.color}`}>{inc.id}</span>
                        <span className="text-xs text-white/55 font-mono">[{inc.time}]</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${inc.badge}`}>{inc.status}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-sm font-bold text-white">{inc.target}</div>
                      <div className="text-xs text-white">{inc.sub}</div>
                      <div className="text-xs font-mono text-white/55">{inc.cam} • {inc.coords}</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#000000] border border-white/12 flex items-center justify-between font-mono text-xs">
                      <span className="text-white/55">Threat score:</span>
                      <span className={`text-base font-extrabold ${inc.color}`}>{inc.threat} / 100</span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => { triggerSound("click"); setSelectedIncidentId(inc.id); setModalType("alertDetails"); }}
                        className="flex-1 py-2 rounded-xl bg-[#171717] hover:bg-[#1f1f1f] text-white border border-white/12 text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                      >
                        <span>Investigate</span>
                        <ArrowRight size={13} />
                      </button>
                      <button
                        onClick={() => handleOpenDispatch(inc.id)}
                        className="flex-1 py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/12 text-white text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                      >
                        <Radio size={13} />
                        <span>Dispatch QRT</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 4: BORDER MAP (Full GIS Command Center)           */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "map" && (
            <Suspense
              fallback={
                <div className="grid h-[68vh] place-items-center rounded-2xl border border-white/12 bg-[#000000] font-mono text-[11px] text-white/45">
                  loading terrain map…
                </div>
              }
            >
              <BorderTerrainMapPanel />
            </Suspense>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 5: TARGET TRACKING DOSSIER                        */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "tracking" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-[#000000] border border-white/12 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white/[0.06] border border-white/12 flex items-center justify-center text-white">
                    <Crosshair size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Active Multi-Object Target Tracking Dossier</h2>
                    <p className="text-xs text-white/55">ByteTrack + OSNet Deep Appearance Embeddings • Sector 4-B</p>
                  </div>
                </div>

                {/* Target Class Filter */}
                <div className="flex items-center gap-1.5 bg-[#000000] p-1 rounded-xl border border-white/12 text-xs font-mono">
                  {["all", "person", "vehicle", "group", "wildlife"].map((cls) => (
                    <button
                      key={cls}
                      onClick={() => { triggerSound("click"); setTargetClassFilter(cls); }}
                      className={`px-3 py-1 rounded-lg capitalize transition-colors ${
                        targetClassFilter === cls ? "bg-white/[0.06] text-white border border-white/12 font-bold" : "text-white/55 hover:text-white"
                      }`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTargets.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleTrackTarget(t.id)}
                    className="p-4.5 rounded-2xl bg-[#000000] border border-white/12 hover:border-white/30 cursor-pointer transition-all space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-16 w-16 rounded-xl overflow-hidden bg-black border border-white/12 shrink-0">
                        <img src={t.img} alt={t.id} className="h-full w-full object-cover grayscale" />
                      </div>
                      <div>
                        <div className="text-base font-bold text-white font-mono">{t.label}</div>
                        <div className="text-xs text-white/55 capitalize">{t.class}</div>
                        <div className="text-xs font-mono text-white font-semibold mt-0.5">Threat: {t.threat} / 100</div>
                        <div className="text-[10px] text-emerald-400 font-mono">Re-ID Match: {t.reidScore}%</div>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#000000] text-[11px] font-mono text-white space-y-1">
                      <div>Velocity: <strong className="text-emerald-400">{t.speed} {t.heading}</strong></div>
                      <div>Last Camera: <span className="text-white">{t.camera}</span></div>
                      <div>Next Predicted Cue: <span className="text-amber-300">{t.cue}</span></div>
                      <div className="text-white/55">{t.coords}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 6: RECONSTRUCTION WORKSPACE                       */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "reconstruction" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-[#000000] border border-white/12 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white/[0.06] border border-white/12 flex items-center justify-center text-white">
                    <GitBranch size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Cross-Camera Spatial Reconstruction</h2>
                    <p className="text-xs text-white/55">Target #P17 • Ingress Corridor Sector 4-B</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right font-mono text-xs text-white">
                    <span>OSNet / ResNet Re-ID cosine: </span>
                    <strong className="text-emerald-400 text-sm">0.914 (2-cam testbed)</strong>
                  </div>
                  <button
                    onClick={() => { triggerSound("click"); setIsReconPlaying(!isReconPlaying); }}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-white text-black font-mono text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    {isReconPlaying ? <Pause size={13} /> : <Play size={13} />}
                    <span>{isReconPlaying ? "Pause Playback" : "Auto-Scrub"}</span>
                  </button>
                </div>
              </div>

              {/* Scrubber Bar */}
              <div className="p-4 rounded-2xl bg-[#000000] border border-white/12 space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-white">CAM_ALPHA Ingress (t=0.0s)</span>
                  <span className="text-amber-400 font-bold">180m Blind Gap Transit (t=8.2s)</span>
                  <span className="text-emerald-400">CAM_BRAVO Handoff (t=14.2s)</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={scrubberPos}
                  onChange={(e) => setScrubberPos(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer h-2 bg-black rounded-lg"
                />
              </div>

              {/* Synchronized Dual Video Feeds */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl overflow-hidden bg-black border border-white/12 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-white">
                    <span className="font-bold text-white">CAM_ALPHA (Sector 4-B Ingress)</span>
                    <span className="text-emerald-400">● T=0s Frame</span>
                  </div>
                  <video src="/data/reid_cam1_entry.mp4" autoPlay loop muted playsInline className="w-full aspect-video rounded-xl object-cover grayscale contrast-125" />
                </div>

                <div className="rounded-2xl overflow-hidden bg-black border border-white/12 p-3 space-y-2 shadow-none">
                  <div className="flex items-center justify-between text-xs font-mono text-white">
                    <span className="font-bold text-white">CAM_BRAVO (Downstream Acquisition)</span>
                    <span className="text-white font-bold">● T=8.5s Re-ID Match</span>
                  </div>
                  <video src="/data/reid_cam2_exit.mp4" autoPlay loop muted playsInline className="w-full aspect-video rounded-xl object-cover grayscale contrast-125" />
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 7: EVIDENCE VAULT                                 */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "evidence" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-[#000000] border border-white/12 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white/[0.06] border border-white/12 flex items-center justify-center text-white">
                    <Database size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Section 65B Digital Evidence — SHA-256 Hash Chain</h2>
                    <p className="text-xs text-white/55">Sequential SHA-256 hash-chaining • tamper-evident chain-of-custody • not a blockchain or distributed ledger</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      triggerSound("verify");
                      setModalType("certificate");
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white/[0.06] border border-white/12 hover:bg-white text-black text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md"
                  >
                    <FileCheck size={14} />
                    <span>View Section 65B Certificate</span>
                  </button>
                  <button
                    onClick={() => {
                      triggerSound("verify");
                      setActionNotice("SHA-256 hash-chain verification completed: 5/5 capsules authenticated & unaltered.");
                      setTimeout(() => setActionNotice(null), 4000);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition-colors shadow-md"
                  >
                    <CheckCircle2 size={14} />
                    <span>Verify Chain Integrity</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { block: 4, id: "INC-0042", threat: 87, time: "20:49:02 IST", hash: "a4f89d3167eb2156828c40ff11e8bc297394bb0494cf078601362e5b72e1281c", prev: "7e5b223c94d01bfa8291e604f32c748c909e4f55" },
                  { block: 3, id: "INC-0041", threat: 64, time: "20:43:17 IST", hash: "7e5b223c94d01bfa8291e604f32c748c909e4f559281a4b8c9d0e1f2a3b4c5d6", prev: "37b290970c20f8ce9fa58db0cc57301cdfc788c0" },
                  { block: 2, id: "INC-0040", threat: 52, time: "20:37:55 IST", hash: "37b290970c20f8ce9fa58db0cc57301cdfc788c0a876e5d4c3b2a10987654321", prev: "sentinel::genesis_block_01" },
                ].map((b) => (
                  <div key={b.block} className="p-4 rounded-2xl bg-[#000000] border border-white/12 text-xs font-mono space-y-2">
                    <div className="flex items-center justify-between text-white">
                      <span className="font-bold text-white text-sm">Block #{b.block} • {b.id}</span>
                      <span className="text-amber-400 font-sans">Threat Score: {b.threat} / 100</span>
                      <span className="text-white/55 font-sans">{b.time}</span>
                    </div>
                    <div className="text-white break-all bg-[#000000] p-2.5 rounded-lg border border-white/12">
                      <span className="text-white/55 select-none">SHA-256 HASH: </span>{b.hash}
                    </div>
                    <div className="text-white/55 text-[11px] truncate">
                      Prev hash {b.prev}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 8: ANALYTICS & FALSE ALARM CALIBRATION            */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "analytics" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-[#000000] border border-white/12 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <BarChart3 size={18} className="text-white" />
                    <span>Operational Intelligence & False-Positive Calibration</span>
                  </h2>
                  <p className="text-xs text-white/55">Sector 4-B Historical Filter Telemetry</p>
                </div>
                <div className="px-3 py-1 rounded-xl bg-white/[0.06] border border-white/12 text-white text-xs font-mono">
                  Rule-based nuisance suppression
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4.5 rounded-2xl bg-[#000000] border border-white/12 space-y-2">
                  <div className="text-xs text-white/55 font-mono">SPATIAL MASK RULE</div>
                  <div className="text-2xl font-bold font-mono text-white">Animal / vegetation</div>
                  <div className="text-xs text-white">
                    Detections inside operator-drawn mask polygons are demoted before scoring — illustrative demo counts.
                  </div>
                </div>
                <div className="p-4.5 rounded-2xl bg-[#000000] border border-white/12 space-y-2">
                  <div className="text-xs text-white/55 font-mono">CURFEW WINDOW RULE</div>
                  <div className="text-2xl font-bold font-mono text-white">+10 threat points</div>
                  <div className="text-xs text-white">
                    Detections between 22:00 - 05:00 IST add a fixed, auditable weight to the incident score.
                  </div>
                </div>
                <div className="p-4.5 rounded-2xl bg-[#000000] border border-white/12 space-y-2">
                  <div className="text-xs text-white/55 font-mono">FEED SOURCE</div>
                  <div className="text-2xl font-bold font-mono text-white">Recorded + simulated</div>
                  <div className="text-xs text-white">
                    Synchronized two-angle testbed plus public dataset clips (MOT17, VisDrone). Not live tactical CCTV.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 9: HARDWARE CONTROL (Phase 2 — simulated relay layer) */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "hardware" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-[#000000] border border-white/12 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Cpu size={18} className="text-white" />
                    <span>Site integrations & field actuators</span>
                  </h2>
                  <p className="text-xs text-white/55">Phase 2 roadmap • on-site actuators are simulated in the MVP</p>
                </div>
                <div className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                  Simulated — not wired to hardware
                </div>
              </div>

              {/* Platform reference facts (illustrative) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-4 rounded-2xl bg-[#000000] border border-white/12">
                  <div className="text-2xl font-bold text-white">Cloud SaaS</div>
                  <div className="text-xs text-zinc-500 mt-1">Delivery model</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#000000] border border-white/12">
                  <div className="text-2xl font-bold text-white">Auto-scaling</div>
                  <div className="text-xs text-zinc-500 mt-1">Inference pool</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#000000] border border-white/12">
                  <div className="text-2xl font-bold text-white">ONNX Runtime</div>
                  <div className="text-xs text-zinc-500 mt-1">Inference runtime</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#000000] border border-white/12">
                  <div className="text-2xl font-bold text-white">Webhook / relay</div>
                  <div className="text-xs text-zinc-500 mt-1">On-site actuation</div>
                </div>
              </div>

              {/* GPIO Physical Relay Switches */}
              <div className="p-5 rounded-2xl bg-[#000000] border border-white/12 space-y-3">
                <div className="text-sm font-bold text-white font-mono flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-white" />
                  <span>Physical perimeter GPIO relays</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
                  <div className="p-3.5 rounded-xl bg-[#000000] border border-white/12 flex items-center justify-between">
                    <div>
                      <div className="text-white font-bold">115 dB Siren (Pin 18)</div>
                      <div className={relays.siren115dB ? "text-red-400" : "text-white/55"}>
                        {relays.siren115dB ? "CLOSED / FIRING" : "OPEN / IDLE"}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleRelay("siren115dB")}
                      className={`px-3 py-1 rounded-lg font-bold ${relays.siren115dB ? "bg-red-600 text-white" : "bg-black text-white"}`}
                    >
                      {relays.siren115dB ? "Active" : "Off"}
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#000000] border border-white/12 flex items-center justify-between">
                    <div>
                      <div className="text-white font-bold">Xenon Strobe (Pin 23)</div>
                      <div className={relays.strobeLight ? "text-amber-400" : "text-white/55"}>
                        {relays.strobeLight ? "Flashing" : "Off"}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleRelay("strobeLight")}
                      className={`px-3 py-1 rounded-lg font-bold ${relays.strobeLight ? "bg-amber-600 text-white" : "bg-black text-white"}`}
                    >
                      {relays.strobeLight ? "Active" : "Off"}
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#000000] border border-white/12 flex items-center justify-between">
                    <div>
                      <div className="text-white font-bold">Hydraulic Barrier (Pin 24)</div>
                      <div className={relays.hydraulicBarrier ? "text-white" : "text-white/55"}>
                        {relays.hydraulicBarrier ? "DEPLOYED / SEALED" : "LOWERED"}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleRelay("hydraulicBarrier")}
                      className={`px-3 py-1 rounded-lg font-bold ${relays.hydraulicBarrier ? "bg-white text-white" : "bg-black text-white"}`}
                    >
                      {relays.hydraulicBarrier ? "Active" : "Off"}
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#000000] border border-white/12 flex items-center justify-between">
                    <div>
                      <div className="text-white font-bold">IR Floodlight (Pin 25)</div>
                      <div className={relays.irIlluminator ? "text-emerald-400" : "text-white/55"}>
                        {relays.irIlluminator ? "ACTIVE 850nm" : "OFF"}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleRelay("irIlluminator")}
                      className={`px-3 py-1 rounded-lg font-bold ${relays.irIlluminator ? "bg-emerald-600 text-white" : "bg-black text-white"}`}
                    >
                      {relays.irIlluminator ? "Active" : "Off"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 10: REPORTS                                       */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "reports" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-[#000000] border border-white/12 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <FileText size={18} className="text-white" />
                    <span>Judicial & Operational Dossiers</span>
                  </h2>
                  <p className="text-xs text-white/55">Automated Section 65B Electronic Certificates & Forensic Bundles</p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { title: "Daily Border Sector 4-B Surveillance Summary", date: "05 Sep 2026", size: "2.4 MB PDF" },
                  { title: "Incident INC-0042 Forensic Audit Package", date: "05 Sep 2026", size: "14.8 MB ZIP" },
                  { title: "Monthly Site False-Positive Calibration Log", date: "01 Sep 2026", size: "1.1 MB CSV" },
                ].map((r, i) => (
                  <div key={i} className="p-4 rounded-2xl bg-[#000000] border border-white/12 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">{r.title}</div>
                      <div className="text-xs text-white/55 font-mono mt-0.5">{r.date} • {r.size}</div>
                    </div>
                    <button
                      onClick={() => {
                        triggerSound("click");
                        setModalType("dossier");
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/12 text-white hover:bg-white/10 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Download size={13} />
                      <span>View Dossier</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* VIEW 11: SETTINGS                                      */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeNav === "settings" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-[#000000] border border-white/12 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Settings size={18} className="text-white" />
                    <span>Perimeter Defense Policy & Alarm Configuration</span>
                  </h2>
                  <p className="text-xs text-white/55">Sector 4-B Autonomous Ruleset & Thresholds</p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#000000] border border-white/12 space-y-4 max-w-xl">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-white font-bold">Acoustic Siren Auto-Trigger Threshold:</span>
                    <span className="text-white font-bold">{alarmThreshold} / 100</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    value={alarmThreshold}
                    onChange={(e) => setAlarmThreshold(Number(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <div className="text-[11px] text-white/55">Incidents with Threat Score &gt;= {alarmThreshold} trigger physical acoustic alarms.</div>
                </div>

                <div className="pt-3 border-t border-white/12 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Manual Siren Acoustic Pulse Test</div>
                    <div className="text-[11px] text-white/55">Emits 5-second synthesized perimeter alarm (115 dB).</div>
                  </div>
                  <button
                    onClick={handleSoundAlarm}
                    className="px-3.5 py-2 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 hover:bg-red-900 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Bell size={13} />
                    <span>Test Siren</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── FOOTER ───────────────────────────────────────────── */}
          <footer className="pt-3 border-t border-white/12 flex flex-col sm:flex-row items-center justify-between text-[11px] text-white/55 gap-2">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-white">IBVAP Sentinel v1.0.0</span>
              <span>|</span>
              <span>Sashastra Seema Bal (SSB)</span>
              <span>|</span>
              <span>Ministry of Home Affairs</span>
              <span>|</span>
              <span>Government of India</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400 font-medium font-mono">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>6 camera feeds configured · simulation mode</span>
            </div>
          </footer>
        </main>
      </div>

      {/* ── MODAL: TACTICAL QRT DISPATCH MODAL ─────────────────── */}
      {modalType === "dispatchModal" && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#000000] border border-white/12 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-white/12 pb-3">
              <div className="flex items-center gap-2">
                <Radio size={20} className="text-white" />
                <h3 className="text-base font-semibold tracking-tight text-white">Deploy quick reaction team (QRT)</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-white/55 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-[#000000] border border-white/12 space-y-1 text-zinc-400">
                <div>Target <span className="ml-1 font-mono font-semibold text-rose-400">{currentIncident.id} ({currentIncident.target})</span></div>
                <div>Sector location <span className="ml-1 text-zinc-100">{currentIncident.cam}</span></div>
                <div>Coordinates <span className="ml-1 font-mono text-zinc-100">{currentIncident.coords}</span></div>
                <div>Threat level <span className="ml-1 font-mono font-semibold text-rose-400">{currentIncident.threat} / 100</span> · Critical</div>
              </div>

              <div className="space-y-1">
                <label className="text-white font-semibold">Select Intercept Unit:</label>
                <div className="grid grid-cols-2 gap-2">
                  {["Alpha-1 QRT (4 Officers)", "Bravo-2 Intercept (Armored)", "Delta Drone Patrol", "Sector 4-B K9 Unit"].map((u) => (
                    <button
                      key={u}
                      onClick={() => { triggerSound("click"); setDispatchUnit(u); }}
                      className={`p-2.5 rounded-xl border text-left font-sans text-[12px] transition-colors ${
                        dispatchUnit === u ? "bg-white/[0.06] border-white/12 text-white font-semibold" : "bg-[#000000] border-white/12 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/12 text-white text-[11px]">
                Radio Squelch: VHF 156.800 MHz Encrypted Defense Relay Active
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/12">
              <button onClick={() => setModalType(null)} className="px-4 py-2 rounded-xl bg-black hover:bg-black text-white text-xs">
                Cancel
              </button>
              <button onClick={handleConfirmDispatch} className="px-5 py-2.5 rounded-xl bg-white hover:bg-white text-black font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-600/30">
                <Radio size={14} />
                <span>Confirm & Dispatch Unit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: SECTION 65B INDIAN EVIDENCE ACT FORMAL CERTIFICATE ── */}
      {modalType === "certificate" && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#000000] border border-white/12 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/12 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck size={20} className="text-white" />
                <h3 className="text-base font-bold text-white font-mono">
                  CERTIFICATE UNDER SECTION 65B OF INDIAN EVIDENCE ACT, 1872
                </h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-white/55 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#000000] border border-white/12 space-y-3 text-xs font-mono text-white max-h-[60vh] overflow-y-auto">
              <div className="text-center space-y-0.5 border-b border-white/12 pb-2">
                <div className="text-amber-300 text-[10px] font-bold">Specimen template · auto-generated by IBVAP Sentinel · not an issued certificate</div>
                <div className="font-bold text-white text-sm">Section 65B(4) Certificate — Draft</div>
                <div className="text-white">Indian Evidence Act, 1872 · to be reviewed and signed by the lawful officer</div>
                <div className="text-white/55 text-[10px]">TEMPLATE REF: SENTINEL/EVD/2026/09/0042</div>
              </div>

              <div className="space-y-1.5 leading-relaxed text-[11px]">
                <p>
                  <strong>1. Identification of Electronic Record:</strong> Video surveillance stream, timestamped bounding box telemetry, and cross-camera OSNet / ResNet appearance embeddings recorded on <strong>05 September 2026 at 20:49:02 IST</strong>.
                </p>
                <p>
                  <strong>2. Machine &amp; Device Architecture:</strong> IBVAP Sentinel cloud pipeline (hosted reference environment, Ubuntu 22.04 LTS), with per-tenant isolation and access logging.
                </p>
                <p>
                  <strong>3. Cryptographic Hash Signature (SHA-256):</strong>
                  <span className="block p-1.5 rounded bg-black text-white font-mono break-all mt-1">
                    a4f89d3167eb2156828c40ff11e8bc297394bb0494cf078601362e5b72e1281c
                  </span>
                </p>
                <p>
                  <strong>4. Affirmation by Lawful Officer:</strong> I, <strong>Duty Commander</strong>, Command Operator, Sector 4-B Command Post, hereby certify under Section 65B(4) that the electronic record was produced by the computer during the period over which the computer was used regularly to store or process information, and that throughout the material part of the said period, the computer was operating properly.
                </p>
              </div>

              <div className="pt-2 border-t border-white/12 flex justify-between items-end text-[11px]">
                <div>
                  <div>Seal of the command post</div>
                  <div className="text-white font-bold">SSB SECTOR 4-B · DEFENSE CLEARANCE 3</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-bold">Duty Commander</div>
                  <div className="text-white/55">Command Operator</div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-white/12">
              <button onClick={() => setModalType(null)} className="px-4 py-2 rounded-xl bg-black hover:bg-black text-white text-xs">
                Close
              </button>
              <button
                onClick={() => {
                  triggerSound("click");
                  setActionNotice("Official Section 65B Electronic Certificate sent to judicial print queue.");
                  setModalType(null);
                  setTimeout(() => setActionNotice(null), 4000);
                }}
                className="px-4 py-2 rounded-xl bg-white hover:bg-white text-black font-bold text-xs flex items-center gap-1.5 shadow-md"
              >
                <Printer size={14} />
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: INVESTIGATION WORKSPACE ──────────────────────── */}
      {modalType === "alertDetails" && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-[#000000] border border-white/12 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 border-b border-white/12 flex items-center justify-between bg-[#000000]">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Incident investigation workspace</span>
                    <span className="font-mono text-red-400">{currentIncident.id}</span>
                  </div>
                  <div className="text-[11px] text-white/55">Sector 4-B Northern Border Corridor • Checked & Correlated</div>
                </div>
              </div>
              <button onClick={() => setModalType(null)} className="h-8 w-8 rounded-lg bg-black hover:bg-black flex items-center justify-center text-white/55 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl overflow-hidden bg-black border border-white/12">
                  <img src="/data/reid_cam1_crop.jpg" alt="Evidence" className="h-44 w-full object-cover grayscale" />
                  <div className="p-2 text-center text-xs text-white font-mono">Checkpost Alpha Ingress (t=0s)</div>
                </div>
                <div className="rounded-xl overflow-hidden bg-black border border-white/12">
                  <img src="/data/reid_cam2_crop.jpg" alt="Evidence 2" className="h-44 w-full object-cover grayscale" />
                  <div className="p-2 text-center text-xs text-white font-mono">BOP Bravo Exit (t=8.5s)</div>
                </div>
                <div className="rounded-xl bg-[#000000] border border-white/12 p-4 space-y-2">
                  <div className="text-xs font-bold text-white">Correlation Metric</div>
                  <div className="text-2xl font-bold font-mono text-white">0.914 cosine</div>
                  <div className="text-xs text-white/55">OSNet / ResNet 512-d appearance similarity across a 1.33s blind-corridor gap (2-camera testbed).</div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#000000] border border-white/12 space-y-1">
                <div className="text-[10.5px] font-bold text-white/55">SHA-256 Hash-Chain Proof</div>
                <div className="font-mono text-xs text-white break-all">{currentIncident.hash}</div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button onClick={handleSilence} className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 font-semibold text-xs hover:bg-red-500/30">
                  Silence Alert
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      triggerSound("verify");
                      setActionNotice(`Incident ${currentIncident.id} verified and confirmed by Duty Commander.`);
                      setModalType(null);
                      setTimeout(() => setActionNotice(null), 4000);
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md"
                  >
                    Confirm Incident
                  </button>
                  <button onClick={() => setModalType(null)} className="px-4 py-2 rounded-lg bg-black hover:bg-black text-white text-xs">
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: FACTOR EXPLANATION ──────────────────────────── */}
      {activeFactorInfo && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#000000] border border-white/12 rounded-2xl p-5 shadow-2xl space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-white/12 pb-2">
              <span className="text-xs font-bold font-mono text-white">{activeFactorInfo.label}</span>
              <button onClick={() => setActiveFactorInfo(null)} className="text-white/55 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <div className="text-xs text-white leading-relaxed font-mono">
              {activeFactorInfo.reason}
            </div>
            <div className="pt-2 flex justify-end">
              <button onClick={() => setActiveFactorInfo(null)} className="px-3 py-1.5 rounded-lg bg-white hover:bg-white text-black font-bold text-xs">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: FULL DOSSIER REPORT ─────────────────────────── */}
      {modalType === "dossier" && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-[#000000] border border-white/12 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/12 pb-3">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-white" />
                <h3 className="text-base font-bold text-white font-mono">
                  COURT-READY INCIDENT DOSSIER · {currentIncident.id}
                </h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-white/55 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#000000] border border-white/12 space-y-3 text-xs font-mono text-white max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-xs border-b border-white/12 pb-2">
                <div>INCIDENT ID: <strong className="text-white">{currentIncident.id}</strong></div>
                <div>TIME: <span className="text-white">{currentIncident.time} IST</span></div>
                <div>CLASSIFICATION: <span className="text-white">{currentIncident.type}</span></div>
                <div>THREAT RATING: <strong className="text-red-400">{currentIncident.threat} / 100 ({currentIncident.severity})</strong></div>
              </div>

              <div className="space-y-1">
                <div className="font-bold text-white">CHRONOLOGICAL AUDIT SEQUENCE:</div>
                <div className="p-2.5 rounded bg-black border border-white/12 space-y-1 text-[11px]">
                  <div>● 20:49:02 — Ingress detected on CAM_ALPHA at Lat 32.5621, Long 75.1234.</div>
                  <div>● 20:49:05 — 100m Geofence restricted buffer violated (+30 threat points).</div>
                  <div>● 20:49:09 — Subject entered 180m blind gap corridor moving 5.2 km/h NE.</div>
                  <div>● 20:49:17 — Subject re-acquired on CAM_BRAVO downstream sensor.</div>
                  <div>● 20:49:18 — OSNet / ResNet Re-ID appearance vector matched subject at 0.914 cosine (2-cam testbed).</div>
                  <div>● 20:49:20 — Threat score evaluated at 87/100; physical acoustic siren triggered.</div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="font-bold text-white">SECTION 65B EVIDENCE SEAL:</div>
                <div className="p-2 rounded bg-black text-white break-all text-[10.5px]">
                  {currentIncident.hash}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-white/12">
              <button onClick={() => setModalType(null)} className="px-4 py-2 rounded-xl bg-black hover:bg-black text-white text-xs">
                Close
              </button>
              <button
                onClick={() => {
                  triggerSound("click");
                  setActionNotice("Dossier exported to forensic PDF archive.");
                  setModalType(null);
                  setTimeout(() => setActionNotice(null), 4000);
                }}
                className="px-4 py-2 rounded-xl bg-white hover:bg-white text-black font-bold text-xs flex items-center gap-1.5 shadow-md"
              >
                <Download size={14} />
                <span>Export Dossier PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
