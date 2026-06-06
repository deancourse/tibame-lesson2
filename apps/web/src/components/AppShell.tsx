import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Car, LayoutDashboard, LogOut, Moon, ScrollText, Sun, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Button } from "./ui/button";
import { AnimatedGradientText } from "./magicui/animated-gradient-text";
import { cn } from "@/lib/utils";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem("vms-theme");
    if (saved === "dark" || saved === "light") return saved;
    return "light";
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("vms-theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme(theme === "light" ? "dark" : "light") };
}

export function AppShell() {
  const { user, clearSession } = useAuthStore();
  const nav = useNavigate();
  const { theme, toggle } = useTheme();

  const onLogout = async () => {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      clearSession();
      nav("/login");
    }
  };

  return (
    <div className="relative h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-mesh animate-aurora opacity-90" />
      <div className="relative flex h-screen">
        <aside className="glass z-20 flex h-full w-64 shrink-0 flex-col gap-1 border-r p-4">
          <Link to="/" className="mb-6 flex items-center gap-2 px-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-gradient text-white shadow-glow">
              <Car className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <AnimatedGradientText className="text-lg font-bold tracking-tight">
                VMS
              </AnimatedGradientText>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Vehicle Hub
              </span>
            </div>
          </Link>
          <NavItem to="/" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" end />
          <NavItem to="/vehicles" icon={<Car className="h-4 w-4" />} label="車輛" />
          {user?.role === "ADMIN" && (
            <NavItem to="/employees" icon={<Users className="h-4 w-4" />} label="員工" />
          )}
          {user?.role === "ADMIN" && (
            <NavItem
              to="/audit-logs"
              icon={<ScrollText className="h-4 w-4" />}
              label="操作紀錄"
            />
          )}
          <div className="mt-auto rounded-lg border bg-card/60 p-3 text-xs text-muted-foreground">
            登入身分：
            <div className="mt-1 font-medium text-foreground">{user?.name}</div>
            <div className="text-[11px]">
              {user?.role === "ADMIN" ? "系統管理員" : "一般使用者"}
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass z-10 flex h-14 shrink-0 items-center justify-end gap-3 border-b px-6 shadow-sm">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="切換主題">
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="mr-1 h-4 w-4" />
              登出
            </Button>
          </header>
          <main className="relative flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  end,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
          isActive && "bg-accent text-accent-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-brand-gradient" />
          )}
          <span
            className={cn(
              "grid h-7 w-7 place-items-center rounded-md transition-colors",
              isActive
                ? "bg-brand-gradient text-white shadow-glow"
                : "bg-muted/60 text-muted-foreground group-hover:text-foreground",
            )}
          >
            {icon}
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}
