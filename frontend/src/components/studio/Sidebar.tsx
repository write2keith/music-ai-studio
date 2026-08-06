"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Wand2,
  Scissors,
  Music,
  Users,
  Library,
  Settings,
  Wrench,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CreditWidget } from "./CreditWidget";

const mainLinks = [
  { href: "/studio", label: "Studio", icon: LayoutDashboard },
  { href: "/generate", label: "Generate", icon: Wand2 },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/editor", label: "Editor", icon: Scissors },
  { href: "/settings", label: "Settings", icon: Settings },
];

const exploreLinks = [
  { href: "/community", label: "Community", icon: Users },
  { href: "/library", label: "Library", icon: Library },
  { href: "/trending", label: "Trending", icon: TrendingUp },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-daw-surface border-r border-daw-border flex flex-col z-40">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-daw-border shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-daw-accent to-purple-700 flex items-center justify-center">
          <Music className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-daw-text tracking-tight">AI Studio</h1>
          <p className="text-[10px] text-daw-text-dim leading-none">Professional</p>
        </div>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
        <NavSection label="Main">
          {mainLinks.map(({ href, label, icon: Icon }) => (
            <NavItem key={href} href={href} active={pathname === href} icon={<Icon className="w-4 h-4" />}>
              {label}
            </NavItem>
          ))}
        </NavSection>

        <NavSection label="Explore">
          {exploreLinks.map(({ href, label, icon: Icon }) => (
            <NavItem key={href} href={href} active={pathname.startsWith(href)} icon={<Icon className="w-4 h-4" />}>
              {label}
            </NavItem>
          ))}
        </NavSection>
      </div>

      {/* Credits */}
      <div className="p-2 border-t border-daw-border shrink-0">
        <CreditWidget />
      </div>
    </aside>
  );
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-daw-text-dim">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all relative",
        active
          ? "text-daw-text bg-daw-accent/10"
          : "text-daw-text-muted hover:text-daw-text hover:bg-daw-surface-3"
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg bg-daw-accent/10 border border-daw-accent/20"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <span className="relative z-10">{icon}</span>
      <span className="relative z-10">{children}</span>
    </Link>
  );
}
