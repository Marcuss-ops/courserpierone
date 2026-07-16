"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { 
  LayoutDashboard, 
  Plus, 
  Settings, 
  User,
  ChevronDown,
  Package,
  ShoppingCart,
  Menu,
  X,
  LogOut,
  Users
} from "lucide-react";

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isProductsOpen, setIsProductsOpen] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-dashboard-bg font-hanken">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 sidebar-glass flex flex-col shrink-0 transition-transform duration-300 lg:relative lg:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand Section */}
        <div className="p-8 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-3" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="w-10 h-10 premium-glass rounded-xl flex items-center justify-center font-bold text-xl border border-white/10 text-white shadow-lg">C</div>
            <span className="text-2xl font-bold tracking-tight text-white text-contrast">Courssy</span>
          </Link>
          <button className="lg:hidden p-2 text-zinc-400" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Main Nav */}
        <nav className="flex-1 px-5 py-2 space-y-2 overflow-y-auto custom-scrollbar">
          <SidebarLink 
            href="/admin" 
            icon={<LayoutDashboard className="w-5 h-5" />} 
            label="Dashboard" 
            active={pathname === "/admin"} 
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          <div className="space-y-1">
            <button 
              onClick={() => setIsProductsOpen(!isProductsOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                isProductsOpen ? 'text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5" />
                <span className="text-sm font-medium tracking-wide">Digital Products</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isProductsOpen ? 'rotate-180' : ''}`} />
            </button>
            
            <div className={`ml-11 space-y-1 overflow-hidden transition-all duration-300 ${
              isProductsOpen ? 'max-h-40 opacity-100 mt-1' : 'max-h-0 opacity-0'
            }`}>
              <Link 
                href="/admin/products?type=digital" 
                className="block py-2 px-3 text-xs text-zinc-500 hover:text-accent-secondary transition-colors font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                • PDF & eBooks
              </Link>
              <Link 
                href="/admin/products?type=video" 
                className="block py-2 px-3 text-xs text-zinc-500 hover:text-accent-secondary transition-colors font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                • Video Courses
              </Link>
            </div>
          </div>

          <div className="pt-6 border-t border-white/5 mt-6 space-y-2">
            <SidebarLink 
              href="/admin/orders" 
              icon={<ShoppingCart className="w-5 h-5" />} 
              label="Ordini" 
              active={pathname === "/admin/orders"} 
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <SidebarLink 
              href="/admin/users" 
              icon={<Users className="w-5 h-5" />} 
              label="Clienti" 
              active={pathname === "/admin/users"} 
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <SidebarLink 
              href="/admin/products/new" 
              icon={<Plus className="w-5 h-5" />} 
              label="Crea Nuovo" 
              active={pathname === "/admin/products/new"} 
              onClick={() => setIsMobileMenuOpen(false)}
            />
          </div>
        </nav>

        {/* Bottom Profile Area */}
        <div className="p-6">
          <div className="relative">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-full flex items-center justify-between p-3 premium-glass rounded-2xl border border-white/10 hover:border-white/20 transition-all group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full border border-white/10 bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center font-bold text-xs text-white overflow-hidden shadow-inner shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex flex-col text-left min-w-0">
                  <span className="text-xs font-bold text-white text-contrast truncate">Admin User</span>
                  <span className="text-[10px] text-zinc-500 truncate uppercase tracking-widest font-black">Pro Plan</span>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-300 ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Profile Dropdown */}
            {isProfileOpen && (
              <div className="absolute bottom-full left-0 w-full mb-3 premium-glass rounded-2xl border border-white/10 py-2 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                <Link 
                  href="/admin/settings" 
                  className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                  onClick={() => setIsProfileOpen(false)}
                >
                  <Settings className="w-4 h-4" /> Account Settings
                </Link>
                <button
                  onClick={async () => {
                    setIsProfileOpen(false);
                    const supabase = createClient();
                    await supabase.auth.signOut();
                    router.push("/login");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col relative z-10 lg:ml-0">
        {/* Mobile Top Bar */}
        <header className="lg:hidden flex items-center justify-between px-6 py-4 border-b border-white/5 bg-dashboard-bg/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 premium-glass rounded-lg flex items-center justify-center font-bold text-sm border border-white/10 text-white">C</div>
            <span className="text-lg font-bold tracking-tight text-white">Courssy</span>
          </div>
          <button className="p-2 premium-glass rounded-xl text-white" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
        </header>
        
        <div className="flex-1 overflow-hidden relative">
          {children}
        </div>
      </main>
    </div>
  );
}

function SidebarLink({ 
  href, 
  icon, 
  label, 
  active = false,
  onClick 
}: { 
  href: string; 
  icon: React.ReactNode; 
  label: string; 
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link 
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
        active 
          ? 'premium-glass text-white border border-white/5 shadow-lg shadow-accent-primary/5' 
          : 'text-zinc-400 hover:text-white hover:bg-white/5'
      }`}
    >
      <div className={`${active ? 'text-accent-primary drop-shadow-[0_0_8px_rgba(77,142,255,0.4)]' : ''}`}>
        {icon}
      </div>
      <span className={`text-sm ${active ? 'font-bold tracking-wide' : 'font-medium'}`}>{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-primary shadow-[0_0_8px_#4d8eff]" />}
    </Link>
  );
}
