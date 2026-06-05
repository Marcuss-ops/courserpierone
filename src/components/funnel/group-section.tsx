"use client";

import { MessageSquare, Send, Zap } from "lucide-react";

export interface GroupSectionConfig {
  title?: string;
  description?: string;
  buttonText?: string;
  link: string;
  style: "telegram" | "discord" | "whatsapp" | "premium" | "default";
  isActive?: boolean;
}

interface GroupSectionProps {
  config?: GroupSectionConfig;
  courseTitle?: string;
}

export function GroupSection({ config, courseTitle }: GroupSectionProps) {
  if (!config || config.isActive === false) return null;

  const {
    title = "Unisciti al nostro Gruppo Esclusivo",
    description = "Entra a far parte della nostra community privata per scambiare idee, ricevere supporto in tempo reale e accedere a contenuti esclusivi.",
    buttonText = "Entra Ora nel Gruppo",
    link,
    style = "default",
  } = config;

  // Seleziona lo stile visivo in base alla configurazione
  let containerClass = "";
  let btnClass = "";
  let icon = <MessageSquare className="w-5 h-5" />;

  switch (style) {
    case "telegram":
      containerClass = "bg-gradient-to-br from-sky-950/40 via-blue-900/20 to-zinc-950 border-sky-500/20 text-white";
      btnClass = "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-[0_4px_20px_rgba(56,189,248,0.3)]";
      icon = <Send className="w-5 h-5 fill-current" />;
      break;
    case "discord":
      containerClass = "bg-gradient-to-br from-indigo-950/40 via-violet-900/20 to-zinc-950 border-indigo-500/20 text-white";
      btnClass = "bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-[0_4px_20px_rgba(88,101,242,0.3)]";
      icon = (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 127.14 96.36">
          <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.89-.65,1.76-1.34,2.58-2.07a75.48,75.48,0,0,0,73.08,0c.83.73,1.69,1.42,2.58,2.07a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.87,50.7,123.82,27.82,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
        </svg>
      );
      break;
    case "whatsapp":
      containerClass = "bg-gradient-to-br from-emerald-950/40 via-teal-900/20 to-zinc-950 border-emerald-500/20 text-white";
      btnClass = "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-[0_4px_20px_rgba(16,185,129,0.3)]";
      icon = (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.5-5.729-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.966a9.9 9.9 0 0 0-6.98-2.879c-5.443 0-9.866 4.372-9.87 9.802 0 1.688.451 3.333 1.305 4.764L1.208 22.4l4.57-1.196L6.647 19.16z" />
        </svg>
      );
      break;
    case "premium":
      containerClass = "bg-gradient-to-br from-amber-950/50 via-zinc-900 to-black border-amber-500/30 text-white relative overflow-hidden";
      btnClass = "bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:opacity-90 text-white shadow-[0_4px_20px_rgba(245,158,11,0.4)]";
      icon = <Zap className="w-5 h-5 fill-current" />;
      break;
    default:
      containerClass = "bg-white text-zinc-900 border-zinc-200 shadow-md";
      btnClass = "bg-zinc-900 hover:bg-zinc-800 text-white";
      icon = <MessageSquare className="w-5 h-5" />;
  }

  return (
    <section className="py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <div
          className={`relative rounded-[3rem] p-10 lg:p-16 border flex flex-col md:flex-row items-center justify-between gap-10 overflow-hidden ${containerClass}`}
        >
          {/* Subtle background glow for premium styles */}
          {style !== "default" && (
            <div className="absolute -right-20 -top-20 w-80 h-80 bg-white/5 rounded-full blur-[100px] pointer-events-none" />
          )}

          <div className="space-y-4 max-w-xl text-center md:text-left relative z-10">
            <h2 className="text-3xl lg:text-4xl font-black tracking-tight leading-none">
              {title.replace("{course}", courseTitle || "")}
            </h2>
            <p className={`text-sm md:text-base font-medium leading-relaxed ${style === "default" ? "text-zinc-500" : "text-zinc-400"}`}>
              {description.replace("{course}", courseTitle || "")}
            </p>
          </div>

          <div className="shrink-0 relative z-10 w-full md:w-auto">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full md:w-auto flex items-center justify-center gap-3 px-8 py-5 rounded-3xl text-sm font-black uppercase tracking-[0.15em] transition-all hover:-translate-y-0.5 duration-300 ${btnClass}`}
            >
              {icon}
              {buttonText}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
