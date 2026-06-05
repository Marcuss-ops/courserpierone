"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Play, Loader2 } from "lucide-react";

interface PremiumVideoPlayerProps {
  videoUrl: string;
  productSlug: string;
  title: string;
}

export function PremiumVideoPlayer({ videoUrl, productSlug, title }: PremiumVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [resumedTime, setResumedTime] = useState<number | null>(null);
  const [showResumeToast, setShowResumeToast] = useState(false);
  const playerRef = useRef<any>(null);

  // Genera una chiave unica per localStorage
  const storageKey = `courser-progress-${productSlug}-${videoUrl}`;

  useEffect(() => {
    setIsReady(false);
    setShowResumeToast(false);
    setResumedTime(null);

    const isYouTube = videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");
    const isVimeo = videoUrl.includes("vimeo.com");

    const getCleanEmbedUrl = (url: string): string => {
      if (isYouTube) {
        let videoId = "";
        if (url.includes("youtube.com/embed/")) {
          videoId = url.split("youtube.com/embed/")[1]?.split("?")[0] || "";
        } else if (url.includes("youtube.com/watch")) {
          try {
            const urlParams = new URLSearchParams(url.split("?")[1]);
            videoId = urlParams.get("v") || "";
          } catch {
            videoId = "";
          }
        } else if (url.includes("youtu.be/")) {
          videoId = url.split("youtu.be/")[1]?.split("?")[0] || "";
        }
        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&iv_load_policy=3`;
        }
      } else if (isVimeo) {
        let videoId = "";
        // Extract Vimeo ID
        const match = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
        if (match) {
          videoId = match[1];
        }
        if (videoId) {
          return `https://player.vimeo.com/video/${videoId}?byline=0&portrait=0&title=0`;
        }
      }
      return url;
    };

    if (isYouTube) {
      // Carica l'SDK di YouTube se non è già presente
      if (!(window as any).YT) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }

      const embedUrl = getCleanEmbedUrl(videoUrl);

      if (iframeRef.current) {
        iframeRef.current.src = embedUrl;
      }

      const checkYT = setInterval(() => {
        if ((window as any).YT && (window as any).YT.Player && iframeRef.current) {
          clearInterval(checkYT);
          
          playerRef.current = new (window as any).YT.Player(iframeRef.current, {
            events: {
              onReady: () => {
                setIsReady(true);
                const savedTime = localStorage.getItem(storageKey);
                if (savedTime) {
                  const time = parseFloat(savedTime);
                  if (time > 5) {
                    playerRef.current.seekTo(time, true);
                    setResumedTime(time);
                    setShowResumeToast(true);
                    setTimeout(() => setShowResumeToast(false), 5000);
                  }
                }

                // Avvia il timer di tracciamento tempo
                const trackInterval = setInterval(() => {
                  if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
                    const currentTime = playerRef.current.getCurrentTime();
                    const duration = playerRef.current.getDuration();
                    if (currentTime > 0 && currentTime < duration - 10) {
                      localStorage.setItem(storageKey, currentTime.toString());
                    } else if (currentTime >= duration - 10) {
                      // Se è quasi finito, rimuovi il progresso
                      localStorage.removeItem(storageKey);
                    }
                  }
                }, 2000);

                return () => clearInterval(trackInterval);
              }
            }
          });
        }
      }, 500);

      return () => {
        clearInterval(checkYT);
      };
    } else if (isVimeo) {
      // Carica l'SDK di Vimeo
      if (!(window as any).Vimeo) {
        const tag = document.createElement("script");
        tag.src = "https://player.vimeo.com/api/player.js";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }

      const embedUrl = getCleanEmbedUrl(videoUrl);
      if (iframeRef.current) {
        iframeRef.current.src = embedUrl;
      }

      const checkVimeo = setInterval(() => {
        if ((window as any).Vimeo && (window as any).Vimeo.Player && iframeRef.current) {
          clearInterval(checkVimeo);

          const player = new (window as any).Vimeo.Player(iframeRef.current);
          playerRef.current = player;

          player.ready().then(() => {
            setIsReady(true);
            const savedTime = localStorage.getItem(storageKey);
            if (savedTime) {
              const time = parseFloat(savedTime);
              if (time > 5) {
                player.setCurrentTime(time);
                setResumedTime(time);
                setShowResumeToast(true);
                setTimeout(() => setShowResumeToast(false), 5000);
              }
            }

            player.on("timeupdate", (data: any) => {
              player.getDuration().then((duration: number) => {
                if (data.seconds > 0 && data.seconds < duration - 10) {
                  localStorage.setItem(storageKey, data.seconds.toString());
                } else if (data.seconds >= duration - 10) {
                  localStorage.removeItem(storageKey);
                }
              });
            });
          });
        }
      }, 500);

      return () => {
        clearInterval(checkVimeo);
      };
    } else {
      // Fallback per altri tipi di video
      setIsReady(true);
      if (iframeRef.current) {
        iframeRef.current.src = videoUrl;
      }
    }
  }, [videoUrl, storageKey]);

  const resetToStart = () => {
    if (playerRef.current) {
      const isYouTube = videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");
      if (isYouTube && typeof playerRef.current.seekTo === "function") {
        playerRef.current.seekTo(0, true);
      } else if (typeof playerRef.current.setCurrentTime === "function") {
        playerRef.current.setCurrentTime(0);
      }
      localStorage.removeItem(storageKey);
      setShowResumeToast(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[300px] bg-zinc-950">
      {!isReady && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        </div>
      )}
      
      <iframe
        ref={iframeRef}
        className="w-full h-full absolute inset-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />

      {/* Toast di notifica ripresa video */}
      {showResumeToast && resumedTime && (
        <div className="absolute bottom-6 left-6 right-6 sm:left-auto sm:right-6 premium-glass border border-white/10 px-5 py-4 rounded-2xl flex items-center justify-between gap-4 shadow-2xl z-40 max-w-sm animate-fadeIn">
          <div>
            <p className="text-xs font-bold text-white">Video ripreso da dove eri rimasto</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Riproduzione ripresa al minuto {formatTime(resumedTime)}</p>
          </div>
          <button
            onClick={resetToStart}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 active:bg-white/30 text-[10px] font-black text-white uppercase tracking-widest rounded-xl transition-all border border-white/5"
          >
            <RotateCcw className="w-3 h-3" />
            Ricomincia
          </button>
        </div>
      )}
    </div>
  );
}
