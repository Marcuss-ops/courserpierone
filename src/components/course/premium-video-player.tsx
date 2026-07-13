"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Play, Volume2, VolumeX, Loader2, Gauge } from "lucide-react";
import {
  isYTPlayer,
  type YTPlayer,
  type VimeoPlayer,
  type VimeoTimeUpdateData,
  type YTOnStateChangeEvent,
} from "./video-player-sdks";

interface PremiumVideoPlayerProps {
  videoUrl: string;
  productSlug: string;
  title: string;
}

export function PremiumVideoPlayer({ videoUrl, productSlug, title: _title }: PremiumVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [resumedTime, setResumedTime] = useState<number | null>(null);
  const [showResumeToast, setShowResumeToast] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(75);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | VimeoPlayer | null>(null);
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // Close speed menu on click outside
  useEffect(() => {
    if (!showSpeedMenu) return;
    const handler = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSpeedMenu]);

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
          return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&iv_load_policy=3&fs=0&controls=0&disablekb=1&showinfo=0&color=white&playsinline=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : 'https://www.courssy.com')}`;
        }
      } else if (isVimeo) {
        let videoId = "";
        // Extract Vimeo ID
        const match = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/.exec(url);
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
      if (!window.YT) {
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
        if (window.YT && iframeRef.current) {
          clearInterval(checkYT);
          
          const ytPlayer = new window.YT.Player(iframeRef.current, {
            events: {
              onReady: () => {
                setIsReady(true);
                setIsPlaying(false);
                ytPlayer.setVolume(75);
                const savedTime = localStorage.getItem(storageKey);
                if (savedTime) {
                  const time = parseFloat(savedTime);
                  if (time > 5) {
                    ytPlayer.seekTo(time, true);
                    setResumedTime(time);
                    setShowResumeToast(true);
                    setTimeout(() => setShowResumeToast(false), 5000);
                  }
                }

                // Avvia il timer di tracciamento tempo.
                // Nota: l'API YouTube IFrame ignora il valore di ritorno di
                // onReady, quindi qualsiasi cleanup function restituita qui non
                // verrebbe mai invocata. L'interval di tracking gira quindi
                // fino allo scaricamento della pagina (accettabile per un
                // single-page video player). L'effect cleanup esterno
                // (re-run su cambio `videoUrl`/`storageKey`) previene la
                // creazione di un nuovo trackInterval per il prossimo player.
                setInterval(() => {
                  const currentTime = ytPlayer.getCurrentTime();
                  const duration = ytPlayer.getDuration();
                  if (currentTime > 0 && currentTime < duration - 10) {
                    localStorage.setItem(storageKey, currentTime.toString());
                  } else if (currentTime >= duration - 10) {
                    // Se è quasi finito, rimuovi il progresso
                    localStorage.removeItem(storageKey);
                  }
                }, 2000);
              },
              onStateChange: (event: YTOnStateChangeEvent) => {
                // YT.PlayerState.PLAYING = 1, PAUSED = 2, ENDED = 0
                setIsPlaying(event.data === 1);
              }
            }
          });
          playerRef.current = ytPlayer;
        }
      }, 500);

      return () => {
        clearInterval(checkYT);
      };
    } else if (isVimeo) {
      // Carica l'SDK di Vimeo
      if (!window.Vimeo) {
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
        if (window.Vimeo && iframeRef.current) {
          clearInterval(checkVimeo);

          const player = new window.Vimeo.Player(iframeRef.current);
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

            player.on("timeupdate", (data: VimeoTimeUpdateData) => {
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
      if (isYouTube && "seekTo" in playerRef.current) {
        playerRef.current.seekTo(0, true);
      } else if ("setCurrentTime" in playerRef.current) {
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

  const isYouTube = videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[300px] bg-black overflow-hidden rounded-[2rem]">
      {!isReady && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        </div>
      )}
      
      <iframe
        ref={iframeRef}
        className="w-full h-full absolute inset-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />

      {/* Custom play/pause button — replaces YouTube native controls */}
      {isReady && isYouTube && (
        <>
          {/* Full-area invisible overlay to capture clicks for play/pause */}
          <div
            className="absolute inset-0 z-20 cursor-pointer"
            onPointerUp={() => {
              if (!isYTPlayer(playerRef.current)) return;
              if (isPlaying) {
                playerRef.current.pauseVideo();
              } else {
                playerRef.current.playVideo();
              }
            }}
          />
          {/* Visual play/pause icon */}
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className={`w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center transition-all duration-300 ${isPlaying ? "opacity-0" : "opacity-100"}`}>
              <Play className="w-7 h-7 text-white fill-white ml-1" />
            </div>
          </div>
          {/* Volume control — bottom left */}
          <div className="absolute bottom-3 left-3 z-40 flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10" onPointerDown={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                if (!isYTPlayer(playerRef.current)) return;
                if (isMuted) {
                  playerRef.current.unMute();
                  setIsMuted(false);
                } else {
                  playerRef.current.mute();
                  setIsMuted(true);
                }
              }}
              className="text-white/70 hover:text-white transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                if (!isYTPlayer(playerRef.current)) return;
                const vol = Number(e.target.value);
                playerRef.current.setVolume(vol);
                setVolume(vol);
                if (vol > 0 && isMuted) {
                  playerRef.current.unMute();
                  setIsMuted(false);
                }
              }}
              className="w-20 h-1 accent-white cursor-pointer"
            />
            {/* Divider */}
            <div className="w-px h-4 bg-white/20" />
            {/* Playback Speed Control */}
            <div className="relative" ref={speedMenuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); }}
                className="text-white/70 hover:text-white transition-colors text-[10px] font-black tracking-wider flex items-center gap-1"
              >
                <Gauge className="w-3.5 h-3.5" />
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black/90 backdrop-blur-md rounded-xl border border-white/10 p-1.5 shadow-2xl min-w-[72px]" onPointerDown={(e) => e.stopPropagation()}>
                  {SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => {
                        if (isYTPlayer(playerRef.current)) {
                          playerRef.current.setPlaybackRate(speed);
                          setPlaybackRate(speed);
                          setShowSpeedMenu(false);
                        }
                      }}
                      className={`block w-full text-center px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                        speed === playbackRate
                          ? "text-white bg-white/20"
                          : "text-zinc-400 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Bottom strip: covers YouTube logo and share button at very bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 h-5 z-30 bg-black pointer-events-auto" />
          {/* Top strip: covers YouTube branding at very top edge */}
          <div className="absolute top-0 left-0 right-0 h-4 z-30 bg-black pointer-events-auto" />
        </>
      )}

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
