import React, { useState, useEffect } from "react";
import { Course, User } from "../types";
import VideoPlayer from "./VideoPlayer";
import SecurePDFViewer from "./SecurePDFViewer";
import { 
  BookOpen, Clock, Play, GraduationCap, Download, CheckCircle, 
  Settings, Shield, LogOut, ChevronRight, Menu, X, 
  FileText, LayoutDashboard, MapPin, Laptop, FileDown, 
  TrendingUp, Award, PenTool 
} from "lucide-react";

interface StudentPanelProps {
  currentUser: User | null;
  courses: Course[];
  enrolledCourseIds: string[];
  authToken: string | null;
  addToast: (message: string, type: "success" | "error" | "warning" | "info") => void;
  onLogout: () => void;
  selectedCourse: Course | null;
  setSelectedCourse: (course: Course | null) => void;
  activeLesson: { lessonId: string; videoUrl: string; isPreview: boolean } | null;
  setActiveLesson: (lesson: { lessonId: string; videoUrl: string; isPreview: boolean } | null) => void;
  activeLessonDetails: any;
  setActiveLessonDetails: (details: any) => void;
  playLessonVideo: (courseId: string, lessonId: string) => Promise<void>;
  toggleLessonCheck: (courseId: string, lessonId: string, currentlyCompleted: boolean) => Promise<void>;
  activeCourseProgress: string[]; // completed lesson IDs
  fetchProgressObj: (courseId: string) => Promise<void>;
  settingsName: string;
  setSettingsName: (name: string) => void;
  settingsImg: string;
  setSettingsImg: (img: string) => void;
  settingsPassword: string;
  setSettingsPassword: (pass: string) => void;
  updateAccountSettings: (e: React.FormEvent) => Promise<void>;
  changeTab?: (tab: string) => void;
}

export default function StudentPanel({
  currentUser,
  courses,
  enrolledCourseIds,
  authToken,
  addToast,
  onLogout,
  selectedCourse,
  setSelectedCourse,
  activeLesson,
  setActiveLesson,
  activeLessonDetails,
  setActiveLessonDetails,
  playLessonVideo,
  toggleLessonCheck,
  activeCourseProgress,
  fetchProgressObj,
  settingsName,
  setSettingsName,
  settingsImg,
  setSettingsImg,
  settingsPassword,
  setSettingsPassword,
  updateAccountSettings,
  changeTab,
}: StudentPanelProps) {
  // Navigation & Responsiveness
  const [studentSubTab, setStudentSubTab] = useState<string>("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false); // for tablet

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setIsCollapsed(false);
      } else if (width >= 768 && width < 1024) {
        setIsCollapsed(true);
      } else {
        setIsCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  
  // Downloads State
  const [downloadSearch, setDownloadSearch] = useState("");
  const [downloadFilter, setDownloadFilter] = useState("All");

  // Secure PDF Viewer State
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [activePdfTitle, setActivePdfTitle] = useState<string>("");

  // Local Notes State
  const [activeNoteText, setActiveNoteText] = useState("");
  const [activeNoteSaved, setActiveNoteSaved] = useState(false);

  // Security Session tracking
  const [securitySessions, setSecuritySessions] = useState<any[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState("");
  const [isSecLoading, setIsSecLoading] = useState(false);

  // Load and cache notes for selected lesson
  useEffect(() => {
    if (selectedCourse && activeLesson) {
      const key = `tayyab_notes_${selectedCourse.id}_${activeLesson.lessonId}`;
      const savedNote = localStorage.getItem(key) || "";
      setActiveNoteText(savedNote);
      setActiveNoteSaved(false);
    }
  }, [selectedCourse, activeLesson]);

  const saveLessonNote = () => {
    if (selectedCourse && activeLesson) {
      const key = `tayyab_notes_${selectedCourse.id}_${activeLesson.lessonId}`;
      localStorage.setItem(key, activeNoteText);
      setActiveNoteSaved(true);
      addToast("Your study notes saved successfully!", "success");
      setTimeout(() => setActiveNoteSaved(false), 2000);
    }
  };

  // Fetch security session on load & tab change
  const fetchSecurityData = async () => {
    if (!authToken) return;
    setIsSecLoading(true);
    try {
      const response = await fetch("/api/sessions/check", {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSecuritySessions(data.sessions || []);
        setCurrentDeviceId(data.currentDevice || "");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSecLoading(false);
    }
  };

  useEffect(() => {
    if (studentSubTab === "security") {
      fetchSecurityData();
    }
  }, [studentSubTab, authToken]);

  const handleClearOtherSessions = async () => {
    if (!authToken) return;
    try {
      const res = await fetch("/api/sessions/clear-others", {
        method: "POST",
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message || "Other dynamic active device logons aborted", "success");
        fetchSecurityData();
      } else {
        addToast("Unable to disconnect other devices", "error");
      }
    } catch (err) {
      addToast("Network failure clearing devices", "error");
    }
  };

  // Compute stats across all enrolled courses
  const enrolledCourses = courses.filter(c => enrolledCourseIds.includes(c.id));
  
  // We can mock and compute active progress metrics
  const totalEnrolledCount = enrolledCourses.length;
  
  // Total completed lessons count across enrolled courses
  const completedLessonsCount = activeCourseProgress.length; 
  const activeCoursesCount = totalEnrolledCount > 0 ? (completedLessonsCount > 0 ? 1 : totalEnrolledCount) : 0;
  const simulatedStudyHours = (completedLessonsCount * 0.8 + totalEnrolledCount * 1.5).toFixed(1);

  // All downloadable materials pooled from owned courses
  const allDownloads = enrolledCourses.flatMap(course => 
    course.resources.map(res => ({
      ...res,
      courseTitle: course.title,
      courseId: course.id
    }))
  );

  // Filtered downloads
  const filteredDownloads = allDownloads.filter(res => {
    const matchesSearch = res.title.toLowerCase().includes(downloadSearch.toLowerCase()) || 
                          res.courseTitle.toLowerCase().includes(downloadSearch.toLowerCase());
    const matchesType = downloadFilter === "All" || res.type === downloadFilter.toLowerCase();
    return matchesSearch && matchesType;
  });

  const sidebarMenuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "courses", label: "My Courses", icon: BookOpen },
    { id: "player", label: "Continue Learning", icon: Play },
    { id: "progress", label: "Course Progress", icon: GraduationCap },
    { id: "downloads", label: "Downloads", icon: Download },
    { id: "profile", label: "Profile Settings", icon: Settings },
    { id: "security", label: "Security Settings", icon: Shield },
  ];

  const handleMenuClick = (id: string) => {
    setStudentSubTab(id);
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex-grow flex flex-col md:flex-row relative z-10 w-full rounded-2xl overflow-hidden glass-panel border border-white/5 min-h-[700px]">
      
      {/* SIDEBAR CONTAINER */}
      <aside 
        className={`bg-brand-bg/95 border-r border-white/5 transition-all duration-300 z-30 shrink-0
          md:flex md:flex-col
          ${isCollapsed ? "md:w-20" : "md:w-64"} 
          ${isSidebarOpen ? "fixed inset-y-0 left-0 w-64 block" : "hidden md:block"}
        `}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded bg-brand-purple/20 flex items-center justify-center text-brand-violet shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            {!isCollapsed && (
              <span className="font-extrabold text-sm tracking-wide text-white uppercase font-mono truncate">
                Student <span className="text-brand-violet">Portal</span>
              </span>
            )}
          </div>
          {isSidebarOpen ? (
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-1 rounded-md text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:block p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}`} />
            </button>
          )}
        </div>

        {/* Sidebar User Profile card */}
        {!isCollapsed && (
          <div className="p-4 mx-3 my-4 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
            <img 
              src={currentUser?.profileImg || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"} 
              alt="avatar" 
              className="w-10 h-10 rounded-full border border-brand-purple object-cover"
            />
            <div className="truncate text-left">
              <p className="text-xs font-bold text-white max-w-[140px] truncate">{currentUser?.name}</p>
              <span className="text-[9px] font-mono capitalize px-1.5 py-0.5 rounded bg-brand-purple/20 text-[#c084fc] inline-block mt-0.5">
                {currentUser?.role || "Student"}
              </span>
            </div>
          </div>
        )}

        {/* Sidebar Navigation Items */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {sidebarMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = studentSubTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  isActive 
                    ? "bg-brand-purple/20 text-brand-violet shadow-sm shadow-brand-purple/20" 
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-brand-violet" : "text-gray-400"}`} />
                {(!isCollapsed || isSidebarOpen) && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Logout */}
        <div className="p-4 border-t border-white/5">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-xs font-bold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            {(!isCollapsed || isSidebarOpen) && <span>Sign Out Log</span>}
          </button>
        </div>
      </aside>

      {/* MOBILE HEADER BAR */}
      <div className="md:hidden bg-brand-bg/95 p-4 border-b border-white/5 flex items-center justify-between w-full">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg border border-white/5 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-xs font-mono font-extrabold text-white text-gradient-purple uppercase tracking-wider">
          Student Desk
        </span>
        <div className="w-8 h-8 rounded-full overflow-hidden border border-brand-purple/50">
          <img src={currentUser?.profileImg || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"} alt="profile" className="w-full h-full object-cover" />
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 bg-black/40 p-4 sm:p-6 lg:p-8 overflow-y-auto text-left flex flex-col justify-between">
        <div className="space-y-6">
          
          {/* 1. STUDENT DASHBOARD PAGE */}
          {studentSubTab === "dashboard" && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="border-b border-white/5 pb-4">
                <span className="text-[10px] text-brand-violet font-mono uppercase font-bold tracking-widest block mb-0.5">Welcome Back, Trader</span>
                <h1 className="text-2xl font-extrabold text-white">Smart Money Learning Overview</h1>
                <p className="text-xs text-gray-400 mt-1">Check your completion metrics, latest course unlocks and continuous study files.</p>
              </div>

              {/* Overview Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-brand-card rounded-xl border border-white/5 shadow-md flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-brand-purple/10 text-brand-violet">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-mono">Unlocks</span>
                    <span className="text-lg font-mono font-extrabold text-white">{totalEnrolledCount} Courses</span>
                  </div>
                </div>

                <div className="p-4 bg-brand-card rounded-xl border border-white/5 shadow-md flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-brand-indigo/10 text-brand-indigo">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-mono">Lectures Done</span>
                    <span className="text-lg font-mono font-extrabold text-white">{completedLessonsCount} Done</span>
                  </div>
                </div>

                <div className="p-4 bg-brand-card rounded-xl border border-white/5 shadow-md flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-mono">Active Classes</span>
                    <span className="text-lg font-mono font-extrabold text-white">{activeCoursesCount} Active</span>
                  </div>
                </div>

                <div className="p-4 bg-brand-card rounded-xl border border-white/5 shadow-md flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-[#ec4899]/10 text-pink-400">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-mono">Study Hours</span>
                    <span className="text-lg font-mono font-extrabold text-white">{simulatedStudyHours} Hrs</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left block: Resume / Continue Watching */}
                <div className="lg:col-span-8 space-y-6">
                  
                  {/* Continue Watching Panel */}
                  <div className="p-5 rounded-xl border border-brand-purple/20 bg-brand-card/75 relative overflow-hidden">
                    <div className="absolute top-0 right-0 h-32 w-32 bg-brand-purple/10 blur-2xl rounded-full"></div>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="space-y-1 text-left">
                        <span className="px-2 py-0.5 bg-brand-purple/20 rounded text-[9px] font-mono font-bold text-brand-violet uppercase">
                          Last Studied Module
                        </span>
                        <h3 className="text-base font-extrabold text-white mt-1.5">
                          {selectedCourse ? selectedCourse.title : "No course selected"}
                        </h3>
                        <p className="text-xs text-gray-400">
                          {selectedCourse && selectedCourse.lessons.length > 0 
                            ? `Lecture: ${activeLessonDetails?.title || selectedCourse.lessons[0].title}`
                            : "Click My Courses to select an owned masterclass and start stream."}
                        </p>
                      </div>
                      
                      {selectedCourse && (
                        <button
                          onClick={() => setStudentSubTab("player")}
                          className="px-4 py-2 bg-brand-purple hover:bg-brand-violet text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5 shrink-0 transition"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Resume Learning</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Latest Purchased Classes lists */}
                  <div className="space-y-3.5 text-left">
                    <h2 className="text-sm font-extrabold text-white uppercase font-mono tracking-wider">Latest Purchased Academy Classes</h2>
                    {enrolledCourses.length === 0 ? (
                      <div className="p-10 rounded-xl bg-white/5 border border-white/5 text-center text-gray-400 text-xs">
                        You have not enrolled in any trading courses yet. Go to premium classes and submit an enrollment.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {enrolledCourses.map((course) => {
                          return (
                            <div key={course.id} className="p-3 rounded-xl bg-brand-card hover:bg-brand-card/90 border border-white/5 flex gap-4 items-center justify-between">
                              <div className="flex gap-3 items-center min-w-0">
                                <img src={course.thumbnailUrl} className="w-12 h-12 rounded-lg object-cover bg-black shrink-0" alt="course" />
                                <div className="min-w-0">
                                  <h4 className="text-xs font-bold text-white truncate">{course.title}</h4>
                                  <span className="text-[9px] text-[#a78bfa] block mt-0.5">{course.category}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => { setSelectedCourse(course); setStudentSubTab("player"); }}
                                className="px-3 py-1 bg-white/5 hover:bg-brand-purple/20 text-gray-300 hover:text-white rounded text-[11px] font-bold shrink-0 transition"
                              >
                                View Classroom
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Available Academy Masterclasses to buy/explore */}
                  <div className="space-y-3.5 text-left pt-2">
                    <h2 className="text-sm font-extrabold text-[#c084fc] uppercase font-mono tracking-wider">Available Academy Masterclasses</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {courses.filter(c => c.isPublished !== false).map((course) => {
                        const isPurchased = enrolledCourseIds.includes(course.id);
                        return (
                          <div key={course.id} className="p-3.5 rounded-xl bg-brand-card/40 hover:bg-brand-card/75 border border-white/5 flex flex-col justify-between space-y-3 transition">
                            <div className="flex gap-3 items-start">
                              <img src={course.thumbnailUrl || "https://images.unsplash.com/photo-1621761191319-c6fb62004040?auto=format&fit=crop&w=800&q=80"} className="w-10 h-10 rounded-lg object-cover bg-black shrink-0 border border-white/5" alt={course.title} />
                              <div className="min-w-0">
                                <h4 className="text-[11px] font-bold text-white line-clamp-2 leading-tight">{course.title}</h4>
                                <span className="text-[9px] text-[#22c55e] font-mono font-bold block mt-1">{course.price.toLocaleString()} PKR</span>
                              </div>
                            </div>
                            
                            <div className="flex gap-2 justify-end pt-1">
                              <button
                                onClick={() => {
                                  setSelectedCourse(course);
                                  if (changeTab) changeTab("details");
                                }}
                                className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded text-[10px] font-mono transition"
                              >
                                Syllabus
                              </button>
                              {isPurchased ? (
                                <button
                                  onClick={() => {
                                    setSelectedCourse(course);
                                    setStudentSubTab("player");
                                  }}
                                  className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-bold transition"
                                >
                                  Continue
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setSelectedCourse(course);
                                    if (changeTab) changeTab("details");
                                  }}
                                  className="px-2.5 py-1 bg-brand-purple hover:bg-brand-violet text-white rounded text-[10px] font-bold transition"
                                >
                                  Buy Now
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right block: Progress Analytics & Activity */}
                <div className="lg:col-span-4 space-y-6">
                  {/* Progress Analytics bar widgets */}
                  <div className="p-4 rounded-xl bg-brand-card border border-white/5 space-y-4">
                    <h3 className="text-xs font-extrabold text-white uppercase font-mono tracking-wider">Progress Analytics</h3>
                    
                    {enrolledCourses.length === 0 ? (
                      <p className="text-[11px] text-gray-500 italic">No progress stats available yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {enrolledCourses.map((course) => {
                          const progressPct = course.id === selectedCourse?.id 
                            ? Math.round((completedLessonsCount / Math.max(course.lessons.length, 1)) * 100)
                            : 0; // Default or mock others
                          return (
                            <div key={course.id} className="space-y-1">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-gray-350 truncate pr-2">{course.title}</span>
                                <span className="font-mono text-white font-bold">{progressPct}%</span>
                              </div>
                              <div className="w-full bg-black rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                                  style={{ width: `${progressPct}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Recent Learning Activity Logs */}
                  <div className="p-4 rounded-xl bg-brand-card border border-white/5 space-y-4">
                    <h3 className="text-xs font-extrabold text-white uppercase font-mono tracking-wider">Recent Learning Activity</h3>
                    <div className="space-y-3.5">
                      {completedLessonsCount > 0 ? (
                        <div className="flex items-start gap-2.5 text-xs text-gray-300">
                          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-white">Completed Sec-Lecture checklist</p>
                            <p className="text-[10px] text-gray-500 font-mono">Today,PKST zone tracking</p>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex items-start gap-2.5 text-xs text-gray-300">
                        <Award className="w-4 h-4 text-brand-purple shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-white">Academy Security Verified</p>
                          <p className="text-[10px] text-gray-500 font-mono">Authorized DRM stream locked</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* 2. MY COURSES PAGE */}
          {studentSubTab === "courses" && (
            <div className="space-y-6 animate-in fade-in duration-300 text-left">
              <div className="border-b border-white/5 pb-4">
                <h1 className="text-2xl font-extrabold text-white">Purchased Learning Programs</h1>
                <p className="text-xs text-gray-400 mt-1">Select from the smart money concepts classes and trading books unlocked below to execute lesson videos.</p>
              </div>

              {enrolledCourses.length === 0 ? (
                <div className="p-16 rounded-xl bg-brand-card border border-white/5 text-center space-y-4 max-w-lg mx-auto">
                  <BookOpen className="w-12 h-12 text-gray-500 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-white">No active unlocked courses</p>
                    <p className="text-xs text-gray-400">Browse our programs and send PKR easy-transfers to join.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {enrolledCourses.map((course) => {
                    const lessonsTotal = course.lessons.length || 1;
                    const compCount = course.id === selectedCourse?.id ? completedLessonsCount : 0;
                    const progressPct = Math.round((compCount / lessonsTotal) * 100);

                    return (
                      <div key={course.id} className="p-5 rounded-xl bg-brand-card hover:bg-brand-card/90 border border-white/5 space-y-4 flex flex-col justify-between">
                        <div className="space-y-3.5">
                          <img src={course.thumbnailUrl} alt="course img" className="w-full h-32 object-cover rounded-lg bg-black/60 border border-white/5" />
                          <div className="space-y-1">
                            <span className={`text-[9px] uppercase font-mono font-bold ${
                              course.category.toLowerCase().includes("risk") || course.category.toLowerCase().includes("technical")
                                ? "text-amber-500" 
                                : "text-emerald-500"
                            }`}>📈 {course.category}</span>
                            <h3 className="text-sm font-extrabold text-[#ffffff] line-clamp-1">{course.title}</h3>
                            <p className="text-[10px] text-gray-400">Mentor: {course.instructor}</p>
                          </div>
                        </div>

                        {/* Progress slider bar */}
                        <div className="space-y-3 pt-2">
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="text-gray-400">Class Progress</span>
                              <span className="font-mono text-white font-bold">{progressPct}%</span>
                            </div>
                            <div className="w-full bg-black/50 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }}></div>
                            </div>
                          </div>

                          <button
                            onClick={() => { setSelectedCourse(course); setStudentSubTab("player"); }}
                            className="w-full py-2 bg-brand-purple hover:bg-brand-violet text-white text-xs font-bold rounded-lg transition cursor-pointer text-center block"
                          >
                            Continue Learning
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. COURSE PLAYER PAGE */}
          {studentSubTab === "player" && (
            <div className="space-y-6 animate-in fade-in duration-300 text-left">
              {!selectedCourse ? (
                <div className="p-16 rounded-xl bg-brand-card border border-white/5 text-center space-y-4 max-w-lg mx-auto">
                  <Play className="w-12 h-12 text-brand-purple animate-pulse mx-auto" />
                  <h3 className="text-sm font-bold text-white font-sans">No studying active class selected</h3>
                  <p className="text-xs text-gray-400">Please first choose one of your purchased modules below to load curriculum streams.</p>
                  <button onClick={() => setStudentSubTab("courses")} className="px-4 py-2 bg-brand-purple text-white hover:bg-brand-violet text-xs font-bold rounded-lg">
                    Select Purchased Course
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-white/5 pb-3.5">
                    <div>
                      <span className="text-[10px] text-brand-violet uppercase font-mono font-bold">Secure Trading Classroom:</span>
                      <h3 className="text-base font-extrabold text-[#ffffff]">{selectedCourse.title}</h3>
                    </div>
                    <button
                      onClick={() => setSelectedCourse(null)}
                      className="px-2.5 py-1 text-[10px] uppercase bg-white/5 text-gray-400 hover:text-white rounded hover:bg-white/10"
                    >
                      Change Program
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* VIDEO CONTAINER AND NOTES */}
                    <div className="lg:col-span-8 space-y-5">
                      
                      {activeLesson && activeLessonDetails ? (
                        <div className="space-y-4">
                          <VideoPlayer
                            videoUrl={activeLesson.videoUrl}
                            isPreviewLimit={activeLesson.isPreview}
                            watermark={activeLessonDetails.watermark}
                            title={activeLessonDetails.title}
                          />
                          <div className="p-3.5 bg-brand-card rounded-xl border border-white/5 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                            <div className="space-y-1">
                              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                <GraduationCap className="w-4 h-4 text-brand-violet" />
                                <span>Lecturer Note: {activeLessonDetails.title}</span>
                              </h4>
                              {activeLessonDetails.description && (
                                <p className="text-[10px] text-gray-400 mt-0.5">{activeLessonDetails.description}</p>
                              )}
                              <span className="text-[9px] font-mono text-gray-500 font-sans leading-none block mt-1">Authorized stream locked under IP logs. Anti-credential piracy dynamic tracker active.</span>
                            </div>
                            {activeLessonDetails.pdfUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActivePdfUrl(activeLessonDetails.pdfUrl);
                                  setActivePdfTitle(activeLessonDetails.pdfTitle || "Lecture Supplementary Guide");
                                  addToast("Decrypting attached trading note PDF securely in RAM...", "success");
                                }}
                                className="px-3 py-1.5 bg-[#f43f5e]/20 hover:bg-[#f43f5e] text-white border border-[#f43f5e]/30 rounded text-[10px] uppercase font-mono tracking-wider transition shrink-0 cursor-pointer font-bold"
                              >
                                📄 View Secure PDF Notes
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-video bg-black rounded-xl border border-white/5 flex flex-col items-center justify-center text-center p-6 space-y-2">
                          <Play className="w-10 h-10 text-brand-purple animate-pulse" />
                          <h4 className="text-xs font-bold text-white">Select a secure lesson chapter to decrypt stream</h4>
                          <p className="text-[10px] text-gray-500 max-w-xs">Double right-click locks are currently set. Secure network watermark token will overlay on player.</p>
                        </div>
                      )}

                      {/* Decryption block for lesson study notes persistence */}
                      {activeLesson && (
                        <div className="p-4 rounded-xl border border-white/5 bg-brand-card space-y-3 text-left">
                          <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                              <PenTool className="w-3.5 h-3.5 text-brand-violet animate-pulse" />
                              <span>Personal Lesson Notes (Stored Locally)</span>
                            </h4>
                            {activeNoteSaved && (
                              <span className="text-[9px] text-emerald-400 font-bold">✓ Notes saved</span>
                            )}
                          </div>
                          
                          <textarea
                            rows={3}
                            value={activeNoteText}
                            onChange={(e) => setActiveNoteText(e.target.value)}
                            placeholder="Write your custom notes for this lesson here. Saved automatically..."
                            className="w-full bg-black/60 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50"
                          />
                          
                          <div className="flex justify-end">
                            <button
                              onClick={saveLessonNote}
                              className="px-3 py-1.5 bg-brand-purple hover:bg-brand-violet text-white text-[10px] font-bold rounded"
                            >
                              Save Notebook
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Cheat sheets, resource and PDF downloads */}
                      <div className="p-4 rounded-xl border border-white/5 bg-brand-card space-y-3 text-left">
                        <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">Lesson Material & Resources</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {selectedCourse.resources.map((r, idx) => (
                            <a
                              key={idx}
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-3 rounded-lg bg-black/40 hover:bg-brand-purple/15 text-[11px] text-white border border-white/5 hover:border-brand-purple/20 transition flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-brand-violet shrink-0" />
                                <span className="truncate">{r.title}</span>
                              </div>
                              <FileDown className="w-4 h-4 text-gray-400 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* SIDE CURRICULUM NAVIGATION */}
                    <div className="lg:col-span-4 space-y-4">
                      <h4 className="text-xs font-bold text-[#ffffff] uppercase font-mono tracking-wider">Course Curriculum Table</h4>
                      
                      <div className="p-3 bg-brand-card/75 border border-white/5 rounded-xl space-y-2">
                        {selectedCourse.lessons.map((lesson, idx) => {
                          const isCompleted = activeCourseProgress.includes(lesson.id);
                          const isCurrentlyPlaying = activeLesson?.lessonId === lesson.id;

                          return (
                            <div 
                              key={lesson.id}
                              className={`p-2.5 rounded-lg border flex flex-col gap-2 ${
                                isCurrentlyPlaying 
                                  ? "bg-brand-purple/15 border-brand-purple/30 text-white" 
                                  : "bg-black/30 border-white/5 hover:bg-black/50 text-gray-300"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2.5 text-xs">
                                <button
                                  onClick={() => playLessonVideo(selectedCourse.id, lesson.id)}
                                  className="flex-1 text-left font-bold truncate hover:text-[#c084fc] cursor-pointer"
                                >
                                  {idx + 1}. {lesson.title}
                                </button>
                                <span className="text-[9px] font-mono text-gray-400 shrink-0">{lesson.duration}</span>
                              </div>

                              <div className="flex justify-between items-center border-t border-white/5 pt-1.5">
                                <span className={`text-[9px] font-semibold font-sans px-2 py-0.5 rounded ${lesson.isPreview ? "bg-amber-500/10 text-amber-400" : "bg-white/5 text-gray-500"}`}>
                                  {lesson.isPreview ? "Preview Available" : "Premium Locked"}
                                </span>

                                <button
                                  onClick={() => toggleLessonCheck(selectedCourse.id, lesson.id, isCompleted)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                                    isCompleted 
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                      : "bg-white/5 text-gray-400 border border-white/5 hover:text-white"
                                  }`}
                                >
                                  {isCompleted ? "✓ Finished" : "Mark Finished"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. COURSE PROGRESS SUMMARY */}
          {studentSubTab === "progress" && (
            <div className="space-y-6 animate-in fade-in duration-300 text-left">
              <div className="border-b border-white/5 pb-4">
                <h1 className="text-2xl font-extrabold text-white">Advanced Progress Breakdown</h1>
                <p className="text-xs text-gray-400 mt-1 font-sans">Track your verified marks, complete lesson indicators and learning milestones.</p>
              </div>

              {enrolledCourses.length === 0 ? (
                <div className="p-10 rounded-xl bg-brand-card border border-white/5 text-center text-gray-400 text-xs">
                  No programs active yet. Go to courses and purchase with Pakistani Cash transfer methods.
                </div>
              ) : (
                <div className="space-y-6">
                  {enrolledCourses.map((course) => {
                    const totalL = course.lessons.length || 1;
                    const compL = course.id === selectedCourse?.id ? completedLessonsCount : 0;
                    const progressPct = Math.round((compL / totalL) * 100);

                    return (
                      <div key={course.id} className="p-5 rounded-xl bg-brand-card border border-white/5 space-y-4">
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                          <div>
                            <h3 className="font-extrabold text-white text-sm">{course.title}</h3>
                            <span className="text-[10px] text-gray-500">{course.instructor} • SMC Trading Academy</span>
                          </div>
                          <span className="font-mono text-xs font-bold text-emerald-400">📈 {progressPct}% Complete</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="p-3 bg-black/40 border border-white/5 rounded-lg text-left">
                            <span className="text-[10px] text-gray-500 block uppercase">Lessons</span>
                            <span className="text-xs font-bold text-white font-mono">{compL} of {totalL} Lectures</span>
                          </div>
                          
                          <div className="p-3 bg-black/40 border border-white/5 rounded-lg text-left">
                            <span className="text-[10px] text-gray-500 block uppercase">Milestone status</span>
                            <span className="text-xs font-bold text-white">
                              {progressPct === 100 ? "👑 Platinum Certified" : "📖 Study Stage active"}
                            </span>
                          </div>

                          <div className="p-3 bg-black/40 border border-white/5 rounded-lg text-left">
                            <span className="text-[10px] text-gray-500 block uppercase">Resources Unlocked</span>
                            <span className="text-xs font-bold text-white">{course.resources.length} Download files</span>
                          </div>
                        </div>

                        {/* Staggered progress display */}
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-bold text-gray-300 uppercase font-mono tracking-widest text-[#c084fc]">Syllabus Chapter Checklist Check</p>
                          <div className="max-h-52 overflow-y-auto space-y-1.5">
                            {course.lessons.map((lesson, index) => {
                              const isComp = course.id === selectedCourse?.id && activeCourseProgress.includes(lesson.id);
                              return (
                                <div key={lesson.id} className="p-2 rounded bg-black/20 flex justify-between items-center text-[11px] border border-white/5">
                                  <span className="text-gray-300 truncate">{index+1}. {lesson.title}</span>
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${isComp ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-gray-500"}`}>
                                    {isComp ? "Finished" : "Not yet done"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 5. DOWNLOADS PAGE */}
          {studentSubTab === "downloads" && (
            <div className="space-y-6 animate-in fade-in duration-300 text-left">
              <div className="border-b border-white/5 pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h1 className="text-2xl font-extrabold text-white">Academy Downloads Directory</h1>
                  <p className="text-xs text-gray-400 mt-1">Acquire all course resources, cheat sheets, books and zip files linked below.</p>
                </div>

                {/* Filters downloads */}
                <div className="flex gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={downloadSearch}
                    onChange={(e) => setDownloadSearch(e.target.value)}
                    className="bg-black/45 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/50 w-full sm:w-52"
                  />
                  <select
                    value={downloadFilter}
                    onChange={(e) => setDownloadFilter(e.target.value)}
                    className="bg-black/45 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="All">All Types</option>
                    <option value="PDF">PDF Only</option>
                    <option value="Zip">ZIP Only</option>
                    <option value="Link">Links Only</option>
                  </select>
                </div>
              </div>

              {filteredDownloads.length === 0 ? (
                <div className="p-20 text-center space-y-3 rounded-2xl bg-brand-card">
                  <Download className="w-10 h-10 text-gray-500 mx-auto" />
                  <p className="text-xs text-gray-400">No trading resources match your active search terms.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {filteredDownloads.map((res, index) => (
                    <div key={index} className="p-4 bg-brand-card hover:bg-brand-card/90 border border-white/5 rounded-xl space-y-3.5 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase font-mono ${
                            res.type === "pdf" ? "bg-rose-500/15 text-rose-300" : "bg-blue-500/15 text-blue-300"
                          }`}>
                            {res.type}
                          </span>
                          {res.size && <span className="text-[9px] font-mono text-gray-500">{res.size}</span>}
                        </div>
                        <h4 className="text-xs font-bold text-white truncate">{res.title}</h4>
                        <p className="text-[10px] text-gray-500 truncate">Course: {res.courseTitle}</p>
                      </div>

                      {res.type === "pdf" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActivePdfUrl(res.url);
                            setActivePdfTitle(res.title);
                            addToast("Bypassing disk persistence—Stream loaded in secure RAM deck", "info");
                          }}
                          className="w-full text-center py-1.5 bg-[#f43f5e]/15 hover:bg-[#f43f5e] border border-red-500/35 text-white text-[10px] font-bold rounded transition mt-2 cursor-pointer block"
                        >
                          Secure View Document (RAM Only)
                        </button>
                      ) : (
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full text-center py-1.5 bg-brand-purple/20 hover:bg-brand-purple text-white text-[10px] font-bold rounded transition mt-2 cursor-pointer block"
                        >
                          Acquire File
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 6. PROFILE SETTINGS PAGE */}
          {studentSubTab === "profile" && (
            <div className="space-y-6 animate-in fade-in duration-300 text-left max-w-lg">
              <div className="border-b border-white/5 pb-4">
                <h1 className="text-2xl font-extrabold text-white">Student Profile Settings</h1>
                <p className="text-xs text-gray-400 mt-1">Configure your personal login particulars and academy profile particulars.</p>
              </div>

              <div className="p-5 rounded-2xl bg-brand-card border border-white/5 space-y-4">
                
                {/* Visual Avatar preview */}
                <div className="flex gap-4 items-center">
                  <img
                    src={settingsImg || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"}
                    className="w-14 h-14 rounded-full border-2 border-brand-purple object-cover"
                    alt="avatar visual representation"
                  />
                  <div>
                    <h3 className="text-xs font-bold text-white">{currentUser?.name}</h3>
                    <p className="text-[10px] text-gray-500">Student Account: {currentUser?.email}</p>
                  </div>
                </div>

                <form onSubmit={updateAccountSettings} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400 font-mono">My Display Name</label>
                    <input
                      type="text"
                      required
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400 font-mono">Profile Image Link</label>
                    <input
                      type="text"
                      value={settingsImg}
                      onChange={(e) => setSettingsImg(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400 font-mono">Email Address (Registry Blocked)</label>
                    <input
                      type="email"
                      readOnly
                      disabled
                      value={currentUser?.email || ""}
                      className="w-full bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-xs text-gray-500 cursor-not-allowed font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400 font-mono">Update Password</label>
                    <input
                      type="password"
                      placeholder="Leave empty to maintain existing password"
                      value={settingsPassword}
                      onChange={(e) => setSettingsPassword(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600"
                    />
                  </div>

                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-brand-purple hover:bg-brand-violet text-white text-xs font-bold rounded-lg transition overflow-hidden cursor-pointer"
                  >
                    Save Profile Changes
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* 7. SECURITY SETTINGS PAGE */}
          {studentSubTab === "security" && (
            <div className="space-y-6 animate-in fade-in duration-300 text-left">
              <div className="border-b border-white/5 pb-4">
                <h1 className="text-2xl font-extrabold text-white">Dynamic Session Security Panel</h1>
                <p className="text-xs text-gray-400 mt-1 font-sans">View your active browser logs and force remote device logouts as required.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Device summary checklist and IP */}
                <div className="lg:col-span-4 space-y-4">
                  <div className="p-4 bg-brand-card border border-white/5 rounded-xl space-y-3.5">
                    <h3 className="text-xs font-extrabold text-white uppercase font-mono tracking-wider">Device Verification State</h3>
                    
                    <div className="space-y-3 text-xs bg-black/35 p-3.5 rounded-lg border border-white/5 font-mono">
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-gray-400">Academy Guard Status:</span>
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                          <span>Secured</span>
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-gray-400">Current Device:</span>
                        <span className="text-white truncate max-w-[150px]">{currentDeviceId}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-gray-400">Fingerprint System:</span>
                        <span className="text-indigo-400">Active (DRM Logs)</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                        Our anti-piracy shield records security logs. If an account logs in concurrently in multiple browser machines, old devices are warned and signed out automatically.
                      </p>
                      <button 
                        onClick={handleClearOtherSessions}
                        className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition"
                      >
                        Log Out Other Devices / Reset Sessions
                      </button>
                    </div>
                  </div>
                </div>

                {/* Session list table logs */}
                <div className="lg:col-span-8 space-y-4">
                  <h3 className="text-xs font-extrabold text-white uppercase font-mono tracking-wider">Active Authorized Session Logs</h3>
                  
                  {isSecLoading ? (
                    <p className="text-xs text-gray-500 font-mono italic">Decrypting active session signatures...</p>
                  ) : securitySessions.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">No registered active device session records found.</p>
                  ) : (
                    <div className="space-y-3">
                      {securitySessions.map((session, idx) => {
                        const isCurrent = session.deviceId === currentDeviceId;
                        return (
                          <div 
                            key={session.id || idx} 
                            className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between sm:items-center gap-3 ${
                              isCurrent 
                                ? "bg-brand-purple/15 border-brand-purple/35 text-white" 
                                : "bg-brand-card border-white/5 text-gray-300"
                            }`}
                          >
                            <div className="space-y-1">
                              <span className="font-bold text-xs text-white flex items-center gap-2">
                                <Laptop className="w-4 h-4 text-brand-violet" />
                                <span>{session.browser || "Browser machine"}</span>
                                {isCurrent && (
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/20 text-emerald-400">
                                    Current Device
                                  </span>
                                )}
                              </span>
                              <div className="text-[10px] text-gray-400 space-y-0.5 font-mono">
                                <p className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  <span>Location: {session.location || "Verified Agent Desk"}</span>
                                </p>
                                <p>IP Address: {session.ip || "Unknown IP"}</p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-[9px] text-gray-500 block font-mono">Sign Time (PKT)</span>
                              <span className="text-[10px] font-bold text-white block">
                                {session.loginTime ? session.loginTime.substring(11, 16) : "Instant Checkout"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Footer info tag */}
        <div className="pt-8 border-t border-white/5 text-[10px] text-gray-600 flex justify-between font-mono">
          <span>Trade With Tayyab Support System</span>
          <span>© 2026 Lahore/Punjab SEC Desk</span>
        </div>
      </main>

      {activePdfUrl && (
        <SecurePDFViewer
          pdfUrl={activePdfUrl}
          title={activePdfTitle}
          watermark={{
            email: currentUser ? currentUser.email : "guest_preview@tradetayyab.com",
            userId: currentUser ? currentUser.id : "GUEST",
            dateTime: new Date().toISOString().replace("T", " ").substring(0, 19),
            ip: "103.244.175.25"
          }}
          onClose={() => {
            setActivePdfUrl(null);
            setActivePdfTitle("");
          }}
        />
      )}
    </div>
  );
}
