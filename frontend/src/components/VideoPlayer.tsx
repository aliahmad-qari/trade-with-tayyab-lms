import React, { useRef, useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, ShieldCheck, Lock } from "lucide-react";

interface WatermarkData {
  email: string;
  userId: string;
  dateTime: string;
  ip: string;
}

interface VideoPlayerProps {
  videoUrl: string;
  isPreviewLimit: boolean; // if true, stop after 20 seconds
  watermark: WatermarkData;
  title: string;
}

export default function VideoPlayer({ videoUrl, isPreviewLimit, watermark, title }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [previewInterrupted, setPreviewInterrupted] = useState(false);
  
  // Watermark positioning state to simulate premium dynamic drifting values
  const [wtStyle, setWtStyle] = useState({ top: "20%", left: "15%" });
  const [wtStyle2, setWtStyle2] = useState({ bottom: "25%", right: "20%" });

  // Drift watermark positions periodically to prevent cropping/black-outs
  useEffect(() => {
    const timer = setInterval(() => {
      const topRandom = Math.floor(Math.random() * 60) + 10; // 10% to 70%
      const leftRandom = Math.floor(Math.random() * 60) + 10;
      setWtStyle({ top: `${topRandom}%`, left: `${leftRandom}%` });

      const bottomRandom = Math.floor(Math.random() * 55) + 12;
      const rightRandom = Math.floor(Math.random() * 55) + 12;
      setWtStyle2({ bottom: `${bottomRandom}%`, right: `${rightRandom}%` });
    }, 4500);

    return () => clearInterval(timer);
  }, []);

  // Update time and enforce 20 second preview limit if active
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    if (isPreviewLimit && time >= 20) {
      videoRef.current.pause();
      videoRef.current.currentTime = 20;
      setIsPlaying(false);
      setPreviewInterrupted(true);
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
    setPreviewInterrupted(false);
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (previewInterrupted && isPreviewLimit) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(err => console.error("Auto playback check:", err));
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const seekTarget = parseFloat(e.target.value);
    
    // Stop seek attempts past 20s if in preview limit
    if (isPreviewLimit && seekTarget >= 20) {
      videoRef.current.currentTime = 20;
      setCurrentTime(20);
      return;
    }

    videoRef.current.currentTime = seekTarget;
    setCurrentTime(seekTarget);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    videoRef.current.muted = nextMute;
    if (!nextMute && volume === 0) {
      setVolume(0.5);
      videoRef.current.volume = 0.5;
    }
  };

  const handleSpeedToggle = () => {
    if (!videoRef.current) return;
    let nextRate = 1;
    if (playbackRate === 1) nextRate = 1.25;
    else if (playbackRate === 1.25) nextRate = 1.5;
    else if (playbackRate === 1.5) nextRate = 2;
    else nextRate = 1;

    setPlaybackRate(nextRate);
    videoRef.current.playbackRate = nextRate;
  };

  const formatVideoTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div 
      className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/5 select-none"
      onContextMenu={(e) => e.preventDefault()} // Right click blocked
      id="secure-video-root"
    >
      {/* Video stream core */}
      <video
        ref={videoRef}
        src={videoUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onClick={handlePlayPause}
        onContextMenu={(e) => e.preventDefault()} // Block right-click "Save video as"
        onDragStart={(e) => e.preventDefault()}
        className="w-full h-full object-contain cursor-pointer"
        controls={false} // Disable native overlay browser menus
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noplaybackrate noremoteplayback"
        playsInline
      />

      {/* Floating Dynamic Watermarks */}
      <div 
        className="absolute video-watermark transition-all duration-1000 select-none pointer-events-none text-xs text-white/10 font-mono tracking-wider p-2 bg-black/10 rounded"
        style={{ ...wtStyle }}
      >
        <span>{watermark.email}</span>
        <span className="block text-[9px] opacity-70">ID: {watermark.userId} | {watermark.ip}</span>
        <span className="block text-[8px] opacity-50">{watermark.dateTime}</span>
      </div>

      <div 
        className="absolute video-watermark transition-all duration-1000 select-none pointer-events-none text-xs text-white/5 font-mono tracking-wider p-2"
        style={{ ...wtStyle2 }}
      >
        <span>TRADE WITH TAYYAB ONLINE - SECURE STREAM</span>
        <span className="block text-[8px] opacity-70">{watermark.email} • {watermark.ip}</span>
      </div>

      {/* Video Header Branding Badge */}
      <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] text-gray-300 border border-white/10 flex items-center gap-1.5 pointer-events-none font-mono">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>SECURED STREAMING ACTIVE</span>
      </div>

      {/* Preview Restriction Overlay banner */}
      {previewInterrupted && isPreviewLimit && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 space-y-4 font-sans">
          <div className="p-4 bg-brand-purple/20 border border-brand-purple/40 text-brand-violet rounded-full">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <h3 className="text-white text-base font-bold">Free Preview Limit Achieved</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              You are watching a 20-seconds free preview of "{title}". Purchase this course using **EasyPaisa** or **JazzCash** to unlock full dynamic videos and interactive resources!
            </p>
          </div>
          <div className="text-[10px] text-gray-500 font-mono bg-white/5 px-2.5 py-1 rounded">
            Watermark Checked: {watermark.email}
          </div>
        </div>
      )}

      {/* Custom Control Bar overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-2 opacity-50 hover:opacity-100 transition-opacity duration-200">
        
        {/* Seek Bar progress */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={isPreviewLimit ? Math.min(duration || 20, 20) : (duration || 100)}
            value={currentTime}
            onChange={handleSeekChange}
            className="flex-1 accent-brand-purple bg-white/20 h-1 rounded-lg cursor-pointer"
          />
          <span className="text-[10px] text-gray-300 font-mono shrink-0">
            {formatVideoTime(currentTime)} / {isPreviewLimit ? "0:20" : formatVideoTime(duration)}
          </span>
        </div>

        {/* Buttons and volume */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayPause}
              className="p-1.5 text-white hover:text-brand-purple transition"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
            </button>

            <button
              onClick={() => { if(videoRef.current) videoRef.current.currentTime = 0; }}
              className="p-1.5 text-gray-400 hover:text-white transition"
              title="Re-run Lesson"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Volume controller */}
            <div className="flex items-center gap-2">
              <button onClick={handleToggleMute} className="text-gray-400 hover:text-white transition">
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-white/20 accent-brand-purple rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Playback speed trigger */}
            <button
              onClick={handleSpeedToggle}
              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/10 text-gray-300 hover:text-white hover:bg-white/15 cursor-pointer"
            >
              Speed {playbackRate}x
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
