"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/blogs", label: "Blogs", icon: "📝" },
  { href: "/articles", label: "Articles", icon: "📄" },
  { href: "/pipeline", label: "Pipeline", icon: "🔄" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-zinc-950 border-r border-zinc-800 flex flex-col">
      <div className="px-5 py-6 border-b border-zinc-800">
        <h1 className="text-lg font-bold text-white tracking-tight">
          🪐 Blog CMS
        </h1>
        <p className="text-xs text-zinc-500 mt-1">Content Management</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-900"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-zinc-800">
        <p className="text-xs text-zinc-600">v0.1.0</p>
      </div>
    </aside>
  );
}
