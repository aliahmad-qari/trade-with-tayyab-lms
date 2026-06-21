import React from "react";
import { Terminal, Phone, Mail, Clock, Globe, Youtube, Twitter, Facebook } from "lucide-react";

interface FooterProps {
  setActiveTab: (tab: string) => void;
}

export default function Footer({ setActiveTab }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#030010] border-t border-white/5 pt-16 pb-8 text-gray-400 font-sans relative overflow-hidden">
      {/* Visual background ambient glow */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-purple/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-brand-indigo/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">

          {/* Column 1: App Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setActiveTab("home")}>
              <div className="bg-black p-2 rounded-lg border border-brand-purple/30 text-brand-violet">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-lg text-white tracking-wide">
                  TRADE WITH <span className="text-brand-violet">TAYYAB</span>
                </span>
                <p className="text-[9px] font-mono tracking-widest text-[#a78bfa]/60 uppercase">SMC Trading Academy</p>
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed max-w-sm">
              Empowering financial minds with high-consequence Color Trading strategies, market prediction models, and real-time analysis solutions in Pakistan and globally.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <a href="#" aria-label="Facebook" className="p-2 rounded-full bg-white/5 hover:bg-brand-purple/20 hover:text-white transition">
                <Facebook className="w-4 h-4" />
              </a>
              <a href="#" aria-label="Twitter" className="p-2 rounded-full bg-white/5 hover:bg-brand-purple/20 hover:text-white transition">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="p-2 rounded-full bg-white/5 hover:bg-brand-purple/20 hover:text-white transition">
                <Youtube className="w-4 h-4" />
              </a>
              <a href="#" aria-label="LinkedIn" className="p-2 rounded-full bg-white/5 hover:bg-brand-purple/20 hover:text-white transition">
                <Globe className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Column 2: Quick Navigation */}
          <div>
            <h3 className="text-white text-sm font-semibold tracking-wider uppercase mb-4 font-mono text-brand-violet">
              Quick Links
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => setActiveTab("home")} className="hover:text-white hover:translate-x-1 transition duration-150 cursor-pointer block">
                  Home Dashboard
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab("courses")} className="hover:text-white hover:translate-x-1 transition duration-150 cursor-pointer block">
                  Syllabus Courses
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab("pricing")} className="hover:text-white hover:translate-x-1 transition duration-150 cursor-pointer block">
                  Plans & Pricing
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab("about")} className="hover:text-white hover:translate-x-1 transition duration-150 cursor-pointer block">
                  About Tayyab Story
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab("contact")} className="hover:text-white hover:translate-x-1 transition duration-150 cursor-pointer block">
                  Support Desk
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Trading Resources */}
          <div>
            <h3 className="text-white text-sm font-semibold tracking-wider uppercase mb-4 font-mono text-brand-indigo">
              Legal Policy
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => setActiveTab("privacy")} className="hover:text-white hover:translate-x-1 transition duration-150 cursor-pointer block text-left">
                  Privacy Protection Rules
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab("terms")} className="hover:text-white hover:translate-x-1 transition duration-150 cursor-pointer block text-left">
                  Terms & Conditions
                </button>
              </li>
              <li>
                <div className="text-[11px] text-gray-500 pt-1 leading-relaxed">
                  ⚠️ **Disclaimer:** Trading leveraged financial contracts involves substantial risk and might not result in profits. Play safely.
                </div>
              </li>
            </ul>
          </div>

          {/* Column 4: Main Contact Desk */}
          <div>
            <h3 className="text-white text-sm font-semibold tracking-wider uppercase mb-4 font-mono text-[#a78bfa]">
              Contact Details
            </h3>
            <ul className="space-y-3.5 text-xs">
              <li className="flex items-start gap-2 max-w-sm">
                <Phone className="w-4 h-4 text-brand-violet shrink-0 mt-0.5" />
                <div>
                  <span className="block text-white font-medium">03169820955</span>
                  <span className="text-[10px] text-gray-500">Official Pakistan Call Desk</span>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-brand-indigo shrink-0 mt-0.5" />
                <div>
                  <span className="block text-white font-medium break-all">Tusharsilawat41k@gmail.com</span>
                  <span className="text-[10px] text-gray-500">Developer & Partner Support</span>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-[#a78bfa] shrink-0 mt-0.5" />
                <div>
                  <span className="block text-white font-medium">9:00 AM - 10:00 PM (GMT+5)</span>
                  <span className="text-[10px] text-gray-500">Monday - Saturday Desk Hours</span>
                </div>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-500">
          <p>© {currentYear} Trade With Tayyab. All rights reserved. Designed in Cosmic Dark Purple theme.</p>
          <div className="flex gap-4 mt-4 sm:mt-0">
            <button onClick={() => setActiveTab("privacy")} className="hover:text-gray-300">Privacy Safeguards</button>
            <span>•</span>
            <button onClick={() => setActiveTab("terms")} className="hover:text-gray-300">Rules Agreement</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
