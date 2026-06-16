import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, HeartIcon, Spinner } from "../components/ui";
import { getSettings, reportPlayback, resolveStream, setSetting, toggleFavorite } from "../lib/api";
import { EASE, gsap } from "../lib/gsap";
import { useI18n } from "../lib/i18n";
import type { ItemType, StreamInfo } from "../lib/types";
import { cx, formatClock, imageSrc } from "../lib/utils";

const HISTORY_FIRST_TICK_MS = 5000;
const HISTORY_INTERVAL_MS = 15000;

type Status = "loading" | "playing" | "error";

export default function Player() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { itemType, itemId } = useParams();

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const startedAt = useRef<number>(0);
  const reported = useRef(false);

  const [stream, setStream] = useState<StreamInfo | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [buffering, setBuffering] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [controls, setControls] = useState(true);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const isLive = stream?.itemType === "channel";

  const poke = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 3200);
  }, []);

  // The spatial-nav handler and global Escape stay out of the way while the
  // player is open.
  useEffect(() => {
    document.body.setAttribute("data-modal-open", "true");
    return () => document.body.removeAttribute("data-modal-open");
  }, []);

  // Fade the control overlay in/out (autoAlpha also blocks pointer events
  // when hidden, so taps fall through to the video).
  useEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    gsap.to(el, { autoAlpha: controls ? 1 : 0, duration: 0.25, ease: EASE.soft });
  }, [controls, status]);

  const sendHistory = useCallback(
    (final = false) => {
      const video = videoRef.current;
      if (!stream || !video) return;
      const elapsed = Date.now() - startedAt.current;
      // Only count as "watched" after a few seconds of real playback.
      if (!reported.current && elapsed < HISTORY_FIRST_TICK_MS) return;
      reported.current = true;
      const pos = isLive ? 0 : video.currentTime;
      const dur = isLive ? 0 : video.duration || 0;
      reportPlayback(stream.itemType, stream.itemId, pos, Number.isFinite(dur) ? dur : 0).catch(
        () => undefined,
      );
      void final;
    },
    [stream, isLive],
  );

  // Resolve the stream from Rust and load settings.
  useEffect(() => {
    if (!itemType || !itemId) return;
    let cancelled = false;
    setStatus("loading");
    setErrorDetail(null);
    setStream(null);
    Promise.all([resolveStream(itemType as ItemType, Number(itemId)), getSettings()])
      .then(([info, settings]) => {
        if (cancelled) return;
        setStream(info);
        setAutoplayNext((settings.player_autoplay_next ?? "true") === "true");
        const vol = Number(settings.player_volume ?? "1");
        setVolume(Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 1);
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus("error");
          setErrorDetail(String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [itemType, itemId, attempt]);

  // Attach media once the stream is known.
  useEffect(() => {
    const video = videoRef.current;
    if (!stream || !video) return;

    reported.current = false;
    startedAt.current = Date.now();
    video.volume = volume;

    let hls: Hls | null = null;
    const useHls = stream.kind === "hls" && Hls.isSupported();
    if (useHls) {
      hls = new Hls({ maxBufferLength: 30, backBufferLength: 30, enableWorker: true });
      hlsRef.current = hls;
      let recover = 0;
      // Reset the recovery budget once the stream is flowing again.
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        recover = 0;
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        // Live streams hiccup — try to recover transient errors before failing.
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recover < 4) {
          recover++;
          hls?.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recover < 4) {
          recover++;
          hls?.recoverMediaError();
          return;
        }
        setStatus("error");
        setErrorDetail(`${data.type}: ${data.details}`);
        hls?.destroy();
      });
      hls.loadSource(stream.url);
      hls.attachMedia(video);
    } else {
      video.src = stream.url;
    }

    const onLoaded = () => {
      if (stream.positionSecs && !isLiveType(stream.itemType)) {
        video.currentTime = stream.positionSecs;
      }
      video.play().catch(() => undefined);
    };
    const onPlaying = () => {
      setStatus("playing");
      setPaused(false);
      setBuffering(false);
    };
    const onWaiting = () => setBuffering(true);
    const onPause = () => setPaused(true);
    const onTime = () => {
      setTime(video.currentTime);
      if (Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onError = () => {
      setStatus("error");
      setErrorDetail(video.error?.message ?? null);
    };
    const onEnded = () => {
      sendHistory(true);
      if (stream.nextEpisodeId && autoplayNext) {
        navigate(`/player/episode/${stream.nextEpisodeId}`, { replace: true });
      }
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEnded);

    const firstTick = setTimeout(() => sendHistory(), HISTORY_FIRST_TICK_MS + 500);
    const interval = setInterval(() => sendHistory(), HISTORY_INTERVAL_MS);

    poke();

    return () => {
      sendHistory(true);
      clearTimeout(firstTick);
      clearInterval(interval);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("error", onError);
      video.removeEventListener("ended", onEnded);
      hls?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // Sync the favorite flag whenever the stream changes.
  useEffect(() => {
    setFavorite(false);
  }, [stream?.itemId]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
    poke();
  }, [poke]);

  const seekBy = useCallback(
    (secs: number) => {
      const video = videoRef.current;
      if (!video || isLive) return;
      video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + secs));
      poke();
    },
    [isLive, poke],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
    poke();
  }, [poke]);

  const goBack = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    navigate(-1);
  }, [navigate]);

  // Player-scoped keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          seekBy(10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekBy(-10);
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m": {
          const v = videoRef.current;
          if (v) {
            v.muted = !v.muted;
            setMuted(v.muted);
          }
          break;
        }
        case "Escape":
        case "Backspace":
          e.preventDefault();
          goBack();
          break;
        default:
          poke();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, toggleFullscreen, goBack, poke]);

  const changeVolume = (v: number) => {
    setVolume(v);
    const video = videoRef.current;
    if (video) {
      video.volume = v;
      video.muted = v === 0;
      setMuted(video.muted);
    }
    setSetting("player_volume", String(v)).catch(() => undefined);
  };

  const poster = imageSrc(stream?.image ?? null);

  return (
    <div
      data-player
      className="relative h-screen w-full select-none bg-black"
      onMouseMove={poke}
      onClick={() => {
        if (status === "playing") togglePlay();
      }}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        poster={poster ?? undefined}
        playsInline
      />

      {/* Loading overlay */}
      {status === "loading" && (
        <div className="absolute inset-0 flex animate-[fadeIn_.3s_ease] flex-col items-center justify-center gap-4 bg-black/70">
          <Spinner className="h-12 w-12" />
          <p className="text-sm font-medium text-white/80">{t("player.loading")}</p>
          {stream && <p className="text-lg font-bold text-white">{stream.name}</p>}
        </div>
      )}

      {/* Buffering indicator (stream stalled mid-playback) */}
      {status === "playing" && buffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner className="h-12 w-12" />
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 p-8 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-5xl">⚠️</div>
          <h2 className="text-xl font-bold text-white">{t("player.error")}</h2>
          <p className="max-w-md text-sm text-white/60">{t("player.errorHint")}</p>
          {errorDetail && (
            <p className="max-w-md break-all rounded bg-white/10 px-3 py-1 text-xs text-white/50">
              {errorDetail}
            </p>
          )}
          <div className="mt-2 flex gap-3">
            <Button variant="ghost" onClick={goBack}>
              {t("common.back")}
            </Button>
            <Button onClick={() => setAttempt((a) => a + 1)} autoFocus>
              {t("common.retry")}
            </Button>
          </div>
        </div>
      )}

      {/* Controls overlay (GSAP-faded via controlsRef) */}
      {status !== "error" && (
        <div
          ref={controlsRef}
          className="absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/70 via-transparent to-black/80"
          onClick={(e) => e.stopPropagation()}
        >
            {/* Top bar */}
            <div className="flex items-center gap-4 p-5">
              <button
                data-nav
                onClick={goBack}
                aria-label={t("common.back")}
                className="rounded-full bg-white/10 p-2.5 text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold text-white text-shadow">{stream?.name}</p>
                {stream?.subtitle && (
                  <p className="truncate text-xs text-white/60">{stream.subtitle}</p>
                )}
              </div>
              {isLive && (
                <span className="flex items-center gap-1.5 rounded-full bg-danger/90 px-3 py-1 text-xs font-bold text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  {t("player.live")}
                </span>
              )}
              <button
                data-nav
                aria-label="favorito"
                onClick={async () => {
                  if (!stream) return;
                  try {
                    setFavorite(await toggleFavorite(stream.itemType, stream.itemId));
                  } catch {
                    /* ignore */
                  }
                }}
                className={cx(
                  "rounded-full bg-white/10 p-2.5 backdrop-blur transition-colors hover:bg-white/20",
                  favorite ? "text-danger" : "text-white",
                )}
              >
                <HeartIcon filled={favorite} />
              </button>
            </div>

            {/* Bottom bar */}
            <div className="p-5">
              {!isLive && duration > 0 && (
                <div className="mb-3 flex items-center gap-3 text-xs font-medium text-white/80">
                  <span className="w-14 text-right">{formatClock(time)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={1}
                    value={time}
                    onChange={(e) => {
                      const video = videoRef.current;
                      if (video) video.currentTime = Number(e.target.value);
                      poke();
                    }}
                    className="h-1.5 flex-1 cursor-pointer"
                  />
                  <span className="w-14">{formatClock(duration)}</span>
                </div>
              )}
              <div className="flex items-center gap-4">
                <button
                  data-nav
                  onClick={togglePlay}
                  className="rounded-full bg-white p-3.5 text-black shadow-xl transition-transform hover:scale-105"
                  aria-label={paused ? "play" : "pause"}
                >
                  {paused ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5.5v13l11-6.5L8 5.5z" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                    </svg>
                  )}
                </button>

                {!isLive && (
                  <>
                    <button
                      data-nav
                      onClick={() => seekBy(-10)}
                      className="rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
                      aria-label="-10s"
                    >
                      <span className="block w-6 text-xs font-bold">-10</span>
                    </button>
                    <button
                      data-nav
                      onClick={() => seekBy(10)}
                      className="rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
                      aria-label="+10s"
                    >
                      <span className="block w-6 text-xs font-bold">+10</span>
                    </button>
                  </>
                )}

                <div className="flex items-center gap-2">
                  <button
                    data-nav
                    onClick={() => {
                      const v = videoRef.current;
                      if (v) {
                        v.muted = !v.muted;
                        setMuted(v.muted);
                      }
                    }}
                    className="rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
                    aria-label="mute"
                  >
                    {muted || volume === 0 ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="m23 9-6 6M17 9l6 6" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={(e) => changeVolume(Number(e.target.value))}
                    className="h-1.5 w-24 cursor-pointer"
                  />
                </div>

                <div className="flex-1" />

                {stream?.nextEpisodeId && (
                  <button
                    data-nav
                    onClick={() =>
                      navigate(`/player/episode/${stream.nextEpisodeId}`, { replace: true })
                    }
                    className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                  >
                    {t("player.nextEpisode")} ▸
                  </button>
                )}

                <button
                  data-nav
                  onClick={toggleFullscreen}
                  className="rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
                  aria-label="fullscreen"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
                  </svg>
                </button>
              </div>
            </div>
        </div>
      )}
    </div>
  );
}

function isLiveType(itemType: ItemType): boolean {
  return itemType === "channel";
}
