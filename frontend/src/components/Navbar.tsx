import React from "react";
import { User } from "../types";
import { BookOpen, Shield, LogOut, Menu, X, Terminal, Brain, AlertTriangle } from "lucide-react";

interface NavbarProps {
  currentUser: User | null;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenCoach: () => void;
  hasDeviceWarning: boolean;
}

export default function Navbar({
  currentUser,
  onLogout,
  activeTab,
  setActiveTab,
  onOpenCoach,
  hasDeviceWarning
}: NavbarProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const navItems = [
    { id: "home", label: "Home" },
    { id: "courses", label: "Courses" },
    { id: "about", label: "About Us" },
    { id: "contact", label: "Contact Us" },
    { id: "pricing", label: "Plans & Pricing" },
  ];

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    setIsOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 glass-panel border-b border-white/5 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Branding */}
          <div 
            onClick={() => handleNavClick("home")} 
            className="flex items-center gap-2 cursor-pointer group"
            id="nav-logo"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-brand-purple blur-md opacity-50 rounded-full group-hover:opacity-80 transition duration-300"></div>
              <div className="relative bg-black p-2 rounded-lg border border-brand-purple/30 text-brand-violet font-semibold">
                <Terminal className="w-5 h-5" />
              </div>
            </div>
            <div>
              <span className="font-extrabold text-lg text-white font-sans tracking-wide">
                TRADE WITH <span className="text-brand-violet">TAYYAB</span>
              </span>
              <div className="text-[9px] font-mono tracking-widest text-[#a78bfa]/60 uppercase">
                SMC Trading Academy
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => handleNavClick(item.id)}
                className={`text-sm font-medium tracking-wide transition duration-150 relative py-1 px-2 ${
                  activeTab === item.id 
                    ? "text-brand-violet" 
                    : "text-gray-300 hover:text-white"
                }`}
              >
                {item.label}
                {activeTab === item.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-violet glow-dot-purple rounded-full"></span>
                )}
              </button>
            ))}
          </div>

          {/* Action Area */}
          <div className="hidden md:flex items-center gap-4">
            {/* AI Coach button */}
            <button
              onClick={onOpenCoach}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/20 border border-brand-violet/20 transition cursor-pointer"
            >
              <Brain className="w-3.5 h-3.5" />
              <span>AI Specialist</span>
            </button>

            {hasDeviceWarning && (
              <div className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Multi-Device!</span>
              </div>
            )}

            {currentUser ? (
              <div className="flex items-center gap-3">
                {currentUser.role === "admin" ? (
                  <button
                    onClick={() => handleNavClick("admin")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2e1065] text-brand-violet border border-brand-violet/40 hover:bg-brand-violet/15 transition cursor-pointer"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Admin Panel</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleNavClick("dashboard")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-indigo/10 text-brand-indigo border border-brand-indigo/30 hover:bg-brand-indigo/20 transition cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>My Dashboard</span>
                  </button>
                )}

                <div className="flex items-center gap-2 border-l border-white/10 pl-3">
                  <div className="flex items-center gap-2">
                    <img
                      src={currentUser.profileImg || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80"}
                      className="w-8 h-8 rounded-full border border-brand-purple/40 object-cover"
                      alt={currentUser.name}
                    />
                    <div className="text-left">
                      <div className="text-xs font-semibold text-white max-w-[90px] truncate">{currentUser.name}</div>
                      <div className="text-[10px] text-gray-400 capitalize">{currentUser.role}</div>
                    </div>
                  </div>
                  
                  <button
                    onClick={onLogout}
                    id="btn-logout"
                    aria-label="Logout"
                    className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-red-400 transition"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleNavClick("login")}
                  id="btn-nav-login"
                  className="text-sm font-medium text-gray-300 hover:text-white transition px-3 py-1.5 cursor-pointer"
                >
                  Sign In
                </button>
                
                <button
                  onClick={() => handleNavClick("register")}
                  id="btn-nav-register"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-brand-purple text-white hover:bg-brand-violet transition glow-dot-purple cursor-pointer"
                >
                  Join Academy
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={onOpenCoach}
              className="p-2 bg-brand-violet/10 text-brand-violet border border-brand-violet/20 rounded-lg cursor-pointer"
            >
              <Brain className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg focus:outline-none"
              aria-label="Toggle menu"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="md:hidden glass-panel border-t border-white/5 px-4 pt-2 pb-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`block w-full text-left text-sm font-medium py-2 px-3 rounded-lg ${
                activeTab === item.id 
                  ? "bg-brand-purple/20 text-brand-violet" 
                  : "text-gray-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}

          {currentUser && (
            <div className="pt-2 border-t border-white/5">
              {currentUser.role === "admin" ? (
                <button
                  onClick={() => handleNavClick("admin")}
                  className="block w-full text-left text-sm font-semibold py-2 px-3 pl-3 rounded-lg text-brand-violet bg-[#2e1065] border border-brand-violet/40"
                >
                  🛡️ Admin Panel
                </button>
              ) : (
                <button
                  onClick={() => handleNavClick("dashboard")}
                  className="block w-full text-left text-sm font-semibold py-2 px-3 pl-3 rounded-lg text-brand-indigo bg-brand-indigo/10 border border-brand-indigo/30"
                >
                  📚 My Dashboard
                </button>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-white/5">
            {currentUser ? (
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-2">
                  <img
                    src={currentUser.profileImg || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80"}
                    className="w-8 h-8 rounded-full border border-brand-purple/40"
                    alt="user profile"
                  />
                  <div>
                    <div className="text-xs font-semibold text-white truncate max-w-[120px]">{currentUser.name}</div>
                    <div className="text-[10px] text-gray-400">{currentUser.email}</div>
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  className="p-1.5 bg-red-500/15 text-red-400 rounded-lg"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => handleNavClick("login")}
                  className="text-center font-medium bg-white/5 hover:bg-white/10 text-white rounded-lg py-2.5 text-xs"
                >
                  Sign In
                </button>
                <button
                  onClick={() => handleNavClick("register")}
                  className="text-center font-bold bg-brand-purple text-white hover:bg-brand-violet rounded-lg py-2.5 text-xs"
                >
                  Join Academy
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
