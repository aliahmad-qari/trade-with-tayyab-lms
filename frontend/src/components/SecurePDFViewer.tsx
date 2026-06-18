import React, { useState, useEffect } from "react";
import { X, ZoomIn, ZoomOut, ShieldAlert, FileText } from "lucide-react";

interface WatermarkData {
  email: string;
  userId: string;
  dateTime: string;
  ip: string;
}

interface SecurePDFViewerProps {
  pdfUrl: string;
  title: string;
  onClose: () => void;
  watermark: WatermarkData;
}

export default function SecurePDFViewer({ pdfUrl, title, onClose, watermark }: SecurePDFViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [wtStyle, setWtStyle] = useState({ top: "35%", left: "20%" });
  const [wtStyle2, setWtStyle2] = useState({ bottom: "35%", right: "20%" });

  // Periodically drift watermarks over the document to prevent photos/screen-recordings
  useEffect(() => {
    const timer = setInterval(() => {
      const topRandom = Math.floor(Math.random() * 50) + 15;
      const leftRandom = Math.floor(Math.random() * 50) + 15;
      setWtStyle({ top: `${topRandom}%`, left: `${leftRandom}%` });

      const bottomRandom = Math.floor(Math.random() * 45) + 15;
      const rightRandom = Math.floor(Math.random() * 45) + 15;
      setWtStyle2({ bottom: `${bottomRandom}%`, right: `${rightRandom}%` });
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const handleZoomIn = () => {
    if (zoom < 180) setZoom(zoom + 20);
  };

  const handleZoomOut = () => {
    if (zoom > 60) setZoom(zoom - 20);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-between select-none"
      onContextMenu={(e) => e.preventDefault()}
      id="secure-pdf-container"
    >
      {/* Top Bar Controls */}
      <div className="p-4 bg-[#0a0f1d] border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-brand-purple/10 p-2 rounded-lg text-brand-purple border border-brand-purple/20">
            <FileText className="w-4 h-4" />
          </div>
          <div className="text-left">
            <h2 className="text-xs font-extrabold text-[#ffffff] tracking-wide uppercase font-mono">{title}</h2>
            <p className="text-[10px] text-gray-400">Trade Academy Secured PDF Portal • Watermarked Session</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <div className="flex bg-black/40 border border-white/5 rounded-lg overflow-hidden text-xs">
            <button
              onClick={handleZoomOut}
              className="p-1.5 px-3 border-r border-white/5 hover:bg-white/5 text-gray-300 hover:text-white transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="p-1.5 px-3 text-[10px] font-mono font-bold text-gray-400 self-center">{zoom}%</span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 px-3 hover:bg-white/5 text-gray-300 hover:text-white transition"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition cursor-pointer"
            title="Close Book"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Document Frame */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4">
        {/* Anti-piracy Watermark Overlay (Floating background text) */}
        <div className="absolute inset-0 pointer-events-none z-10 grid grid-cols-2 sm:grid-cols-3 gap-16 p-8 items-center justify-center opacity-[0.03] select-none uppercase font-mono text-[9px] text-white">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="-rotate-12 select-none">
              <span>{watermark.email}</span>
              <span className="block">{watermark.userId} • SECURED</span>
            </div>
          ))}
        </div>

        {/* Dynamic Drifting Heavy Floating Watermarks */}
        <div 
          className="absolute z-40 transition-all duration-1000 select-none pointer-events-none text-[8px] sm:text-[10px] text-white/10 font-mono tracking-wider bg-black/20 p-2.5 rounded border border-white/5"
          style={{ ...wtStyle }}
        >
          <span className="block font-bold">{watermark.email}</span>
          <span className="block opacity-80">IP: {watermark.ip} | ID: {watermark.userId}</span>
          <span className="block opacity-50">Authorized: {watermark.dateTime}</span>
          <span className="block font-bold text-red-500/30 text-[7px]">DO NOT SCREENSHOT / PIRACY TRACED</span>
        </div>

        <div 
          className="absolute z-40 transition-all duration-1000 select-none pointer-events-none text-[8px] sm:text-[10px] text-white/10 font-mono tracking-wider bg-black/20 p-2.5 rounded border border-white/5"
          style={{ ...wtStyle2 }}
        >
          <span className="block font-bold">{watermark.email}</span>
          <span className="block opacity-80">IP: {watermark.ip} | ID: {watermark.userId}</span>
          <span className="block opacity-50">Authorized: {watermark.dateTime}</span>
          <span className="block font-bold text-red-500/30 text-[7px]">PROPRIETARY MATERIAL • PRINT DISABLED</span>
        </div>

        {/* Transparent Click Blocker Shield Overlay directly on top of the iframe to block drag, double-click, and right-clicks */}
        <div 
          className="absolute inset-x-0 top-0 bottom-0 z-30 opacity-0 cursor-default" 
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* PDF Embedded Iframe */}
        <div className="w-full h-full max-w-4xl bg-[#1e2330] rounded-xl shadow-2xl relative overflow-hidden border border-white/10 p-1">
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1&messages=0`}
            className="w-full h-full border-none rounded-lg"
            style={{ 
              transform: `scale(${zoom / 100})`, 
              transformOrigin: "top center", 
              width: `${100 * (100 / zoom)}%`, 
              height: `${100 * (100 / zoom)}%`
            }}
            title="SMC Educational Guidebook"
          />
        </div>
      </div>

      {/* Safety Bottom Information */}
      <div className="p-3 bg-[#0a0f1d] border-t border-white/5 text-center text-[10px] text-gray-500 font-mono flex flex-col sm:flex-row items-center justify-between px-8 gap-2">
        <span className="flex items-center gap-1.5 text-amber-500/70">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Warning: Digital Rights Management Active. Your dynamic fingerprint is active. Sharing, screenshotting, or print attempts are registered.</span>
        </span>
        <span className="text-gray-400">UID: {watermark.userId} | IP: {watermark.ip}</span>
      </div>
    </div>
  );
}
