"use client";

import { Search, Bell, Settings, Menu, LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export function TopNav({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLogout() {
    logout();
    setMenuOpen(false);
    router.push("/login");
  }

  return (
    <header className="h-14 bg-daw-surface/80 backdrop-blur-xl border-b border-daw-border flex items-center px-4 gap-3 sticky top-0 z-30">
      <button
        onClick={onMenuClick}
        className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg text-daw-text-muted hover:text-daw-text hover:bg-daw-surface-3 transition-colors"
      >
        <Menu className="w-4 h-4" />
      </button>

      <div className="flex-1 max-w-md relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-daw-text-dim" />
        <input
          type="text"
          placeholder="Search tracks, artists, projects..."
          className="w-full bg-daw-surface-3 border border-daw-border rounded-lg pl-9 pr-4 py-2 text-xs text-daw-text placeholder-daw-text-dim focus:outline-none focus:border-daw-accent/50 transition-colors"
        />
      </div>

      <div className="flex items-center gap-1">
        <IconButton>
          <Bell className="w-4 h-4" />
        </IconButton>
        <IconButton onClick={() => router.push("/editor")}>
          <Settings className="w-4 h-4" />
        </IconButton>

        <div className="ml-2 flex items-center gap-2.5 pl-2 border-l border-daw-border">
          {isLoading ? (
            <div className="w-7 h-7 rounded-full bg-daw-surface-3 animate-pulse" />
          ) : isAuthenticated && user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-daw-accent to-daw-cyan flex items-center justify-center text-[10px] font-bold text-white">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-daw-text hidden sm:block">
                  {user.name}
                </span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 glass rounded-xl border border-daw-border shadow-lg py-1 z-50">
                  <div className="px-3 py-2 border-b border-daw-border">
                    <p className="text-xs font-medium text-daw-text">{user.name}</p>
                    <p className="text-[10px] text-daw-text-dim">{user.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-daw-text-muted hover:text-red-400 hover:bg-red-400/5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => router.push("/login")}
              className="daw-button daw-button-primary text-xs py-1.5 px-3 rounded-lg"
            >
              <User className="w-3.5 h-3.5" />
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
