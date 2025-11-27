import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Smartphone,
  FileAudio,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Shield,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/auth";
import { useSocketStore } from "../stores/socket";
import { cn } from "../lib/utils";
import Modal from "./Modal";
import { PERMISSIONS, hasPermission } from "../lib/permissions";

const baseNavigation = [
  { name: "nav.dashboard", href: "/", icon: LayoutDashboard },
  { name: "nav.devices", href: "/devices", icon: Smartphone },
  { name: "nav.files", href: "/files", icon: FileAudio },
  { name: "nav.templates", href: "/templates", icon: FileAudio },
];

// Admin navigation items with their required permissions
const adminNavigation = [
  {
    name: "nav.users",
    href: "/users",
    icon: Users,
    permission: PERMISSIONS.USERS_READ,
  },
  {
    name: "nav.roles",
    href: "/roles",
    icon: Shield,
    permission: PERMISSIONS.ROLES_READ,
  },
];

export default function Layout() {
  const { t } = useTranslation("common");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);
  const disconnect = useSocketStore((state) => state.disconnect);
  const connected = useSocketStore((state) => state.connected);
  const user = useAuthStore((state) => state.user);
  const kickedMessage = useAuthStore((state) => state.kickedMessage);
  const setKickedMessage = useAuthStore((state) => state.setKickedMessage);
  // Auto-logout timer ref
  const [logoutTimerId, setLogoutTimerId] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(5);

  const performLogout = () => {
    try {
      disconnect();
    } catch {}
    try {
      logout();
    } catch {}
    setKickedMessage(null);
    if (window.location.pathname !== "/login") window.location.href = "/login";
  };

  // Auto-logout effect: when kickedMessage becomes set, start a 5s timer to auto-logout.
  useEffect(() => {
    if (typeof kickedMessage === "string") {
      // clear existing timer if any
      if (logoutTimerId) {
        clearTimeout(logoutTimerId);
      }
      const id = window.setTimeout(() => {
        performLogout();
      }, 5000);
      setLogoutTimerId(id);
      // start countdown interval
      setCountdown(5);
      const intervalId = window.setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(intervalId);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return () => {
        clearTimeout(id);
        setLogoutTimerId(null);
        clearInterval(intervalId);
      };
    } else {
      // If kickedMessage cleared, clear any pending timer
      if (logoutTimerId) {
        clearTimeout(logoutTimerId);
        setLogoutTimerId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kickedMessage]);

  const handleLogout = () => {
    disconnect();
    logout();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-6 border-b">
            <h1 className="text-xl font-bold text-gray-900">{t("appName")}</h1>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {/** Render base navigation for all authenticated users **/}
            {baseNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {t(item.name)}
                </Link>
              );
            })}

            {/** Admin-only nav - now based on permissions **/}
            {adminNavigation
              .filter((item) =>
                hasPermission(user?.permissions, item.permission)
              )
              .map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-blue-50 text-blue-600"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {t(item.name)}
                  </Link>
                );
              })}
          </nav>

          {/* Sidebar footer - settings moved here so it appears at the bottom */}
          <div className="border-t p-4">
            <Link
              to="/settings"
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                location.pathname === "/settings"
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Settings className="h-5 w-5" />
              {t("nav.settings")}
            </Link>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-white px-4 shadow-sm lg:px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
            <Menu className="h-6 w-6" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">
            {(() => {
              if (location.pathname === "/settings") return t("nav.settings");
              // Include admin nav items that user has permission for
              const visibleAdminNav = adminNavigation.filter((item) =>
                hasPermission(user?.permissions, item.permission)
              );
              const all = [...baseNavigation, ...visibleAdminNav];
              const found = all.find(
                (it: any) => it.href === location.pathname
              );
              return found ? t(found.name) : t("nav.dashboard");
            })()}
          </h2>
          {/* Topbar right - user info and logout */}
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  connected ? "bg-green-500" : "bg-red-500"
                )}
              />
              <div className="text-sm text-right">
                <div className="font-medium text-gray-900">
                  {user?.username}
                </div>
                <div className="text-xs text-gray-500">{user?.role}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t("logout")}</span>
            </button>
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Kicked modal */}
      <>
        {typeof kickedMessage === "string" && (
          <Modal
            open={true}
            title={t("loggedOut")}
            message={kickedMessage}
            confirmLabel={`OK (${countdown}s)`}
            showCancel={false}
            onClose={() => setKickedMessage(null)}
            onConfirm={() => {
              performLogout();
            }}
          />
        )}
        {/* Auto-logout handled in useEffect when kickedMessage changes */}
      </>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-black/30 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
