"use client";

import { useState } from "react";

interface MobileSidebarProps {
  children: React.ReactNode;
  toggleId?: string;
}

export function MobileSidebar({ children, toggleId = "sidebar-toggle" }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hidden button triggered from outside via document.getElementById().click() */}
      <button id={toggleId} className="hidden" onClick={() => setOpen((v) => !v)} />

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar with mobile drawer animation */}
      <aside
        className={`
          fixed inset-y-0 right-0 z-50 w-80 sidebar-glass flex flex-col shrink-0 
          border-l border-white/5
          transition-transform duration-300 lg:relative lg:translate-x-0
          ${open ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {children}
      </aside>
    </>
  );
}
