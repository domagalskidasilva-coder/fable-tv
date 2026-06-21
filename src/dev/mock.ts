// DEV-ONLY. Lets the web frontend run in a plain browser (no Tauri runtime)
// with representative fake data, so the responsive/mobile layout can be
// previewed and screenshotted during development. This module is loaded only
// when `import.meta.env.DEV` is true AND no real Tauri runtime is present, so
// it is tree-shaken out of production bundles (see main.tsx).
/* eslint-disable @typescript-eslint/no-explicit-any */

const now = Math.floor(Date.now() / 1000);
const img = (seed: string, w: number, h: number) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;
const poster = (s: string) => img(s, 342, 513);
const backdrop = (s: string) => img(s, 1280, 720);
const logo = (s: string) => img(s, 320, 320);

// A reliable HLS test stream so the player UI can be previewed with real video.
const TEST_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

// Preview helpers: pause every animation loop (GSAP ticker, framer-motion's
// rAF, Web Animations) so headless screenshot capture can grab a stable frame.
function installFreezeHelpers() {
  const w = window as any;
  w.__freeze = async () => {
    try {
      const { gsap } = await import("gsap");
      gsap.globalTimeline.pause();
      gsap.ticker.sleep();
    } catch { /* ignore */ }
    document.getAnimations?.().forEach((a) => { try { a.pause(); } catch { /* */ } });
    if (!w.__rafPatched) {
      w.__rafReal = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = () => 0;
      w.__rafPatched = true;
    }
    return "frozen";
  };
  w.__unfreeze = async () => {
    if (w.__rafPatched) {
      window.requestAnimationFrame = w.__rafReal;
      w.__rafPatched = false;
    }
    try {
      const { gsap } = await import("gsap");
      gsap.ticker.wake();
      gsap.globalTimeline.resume();
    } catch { /* ignore */ }
    document.getAnimations?.().forEach((a) => { try { a.play(); } catch { /* */ } });
    return "unfrozen";
  };
}

const movieTitles = [
  "A Última Fronteira", "Cidade Eterna", "O Relâmpago Azul", "Noites de Verão",
  "Herança de Ferro", "Sombras do Norte", "Rota 77", "O Jardim Secreto",
  "Vento Sul", "Código Vermelho", "Estrela Cadente", "Maré Alta",
];
const seriesTitles = [
  "Reinos Partidos", "Distrito 9B", "Café com Crimes", "Geração Neon",
  "Mar de Histórias", "Hotel Particular", "Linha do Tempo", "Os Improváveis",
];
const channelNames = [
  "Globo HD", "SporTV", "Telecine", "HBO Max", "ESPN Brasil",
  "Cartoon", "Discovery", "History", "BBC News", "MTV", "Premiere", "Cine Sky",
];
const genres = ["Ação", "Drama", "Comédia", "Suspense", "Ficção", "Aventura"];

const card = (
  itemType: string,
  id: number,
  name: string,
  image: string | null,
  extra: Record<string, any> = {},
) => ({
  itemType, id, name, image,
  subtitle: extra.subtitle ?? null,
  sourceId: 1, favorite: extra.favorite ?? false,
  positionSecs: extra.positionSecs ?? null,
  durationSecs: extra.durationSecs ?? null,
  seriesId: extra.seriesId ?? null,
});

const movieCards = movieTitles.map((name, i) =>
  card("movie", i + 1, name, poster(`mv${i}`), {
    subtitle: `${2018 + (i % 7)} · ${genres[i % genres.length]}`,
    favorite: i % 4 === 0,
  }),
);
const seriesCards = seriesTitles.map((name, i) =>
  card("series", i + 1, name, poster(`sr${i}`), {
    subtitle: `${genres[(i + 2) % genres.length]} · ${1 + (i % 4)} temporadas`,
    seriesId: i + 1,
  }),
);
const channelCards = channelNames.map((name, i) =>
  card("channel", 1000 + i, name, logo(`ch${i}`), { subtitle: "Ao vivo" }),
);
const continueCards = [
  card("movie", 1, movieTitles[0], backdrop("cw0"), { subtitle: "1h restante", positionSecs: 1800, durationSecs: 6600 }),
  card("episode", 501, `${seriesTitles[0]} — T1:E3`, backdrop("cw1"), { subtitle: "T1 · E3", positionSecs: 900, durationSecs: 2700, seriesId: 1 }),
  card("movie", 4, movieTitles[3], backdrop("cw2"), { subtitle: "45min restantes", positionSecs: 4200, durationSecs: 7200 }),
  card("episode", 502, `${seriesTitles[3]} — T2:E1`, backdrop("cw3"), { subtitle: "T2 · E1", positionSecs: 300, durationSecs: 2400, seriesId: 4 }),
];
const liveCats = ["Esportes", "Notícias", "Infantil", "Filmes", "Documentários", "Música", "Variedades"]
  .map((name, i) => ({ id: i + 1, sourceId: 1, kind: "live", name, itemCount: 18 + i * 9 }));

const profiles = [
  { id: 1, name: "Sala", color: "#e8b65a", image: "preset:nebula", active: true, sourceCount: 1, channelCount: 320, movieCount: 1200, seriesCount: 240 },
  { id: 2, name: "Quarto", color: "#5a8fe0", image: "preset:lagoon", active: false, sourceCount: 1, channelCount: 320, movieCount: 1200, seriesCount: 240 },
  { id: 3, name: "Crianças", color: "#69b85a", image: "preset:mint", active: false, sourceCount: 1, channelCount: 80, movieCount: 300, seriesCount: 60 },
];

const sourceStatus = {
  id: 1, name: "Minha Lista", kind: "m3u_url",
  lastSyncAt: now - 5400, lastSyncStatus: "ok",
  channelCount: 320, movieCount: 1200, seriesCount: 240,
};

const homeData = {
  continueWatching: continueCards,
  favorites: movieCards.filter((m) => m.favorite).concat(seriesCards.slice(0, 2)),
  recentChannels: channelCards.slice(0, 8),
  latestMovies: movieCards,
  latestSeries: seriesCards,
  liveCategories: liveCats,
  sources: [sourceStatus],
};

const movieDetail = (id: number) => ({
  id, sourceId: 1,
  name: movieCards[(id - 1) % movieCards.length]?.name ?? "Filme",
  image: poster(`mv${(id - 1) % movieCards.length}`),
  backdrop: backdrop(`mvbd${id}`),
  year: 2019 + (id % 6), durationSecs: 5400 + (id % 5) * 600,
  rating: (7 + (id % 30) / 10).toFixed(1),
  plot: "Quando uma descoberta inesperada ameaça tudo o que conhecem, um grupo improvável precisa atravessar fronteiras — reais e imaginárias — para proteger aquilo que ama. Uma jornada sobre coragem, perda e recomeço.",
  genre: `${genres[id % genres.length]} · ${genres[(id + 2) % genres.length]}`,
  cast: ["Ana Prado", "Caio Mendes", "Lia Sá", "Rodrigo Vance"],
  director: "R. Tavares", trailer: null, country: "Brasil",
  favorite: id % 3 === 0, positionSecs: null, watchedDurationSecs: null,
});

const seriesDetail = (id: number) => ({
  id, sourceId: 1,
  name: seriesCards[(id - 1) % seriesCards.length]?.name ?? "Série",
  cover: poster(`sr${(id - 1) % seriesCards.length}`),
  backdrop: backdrop(`srbd${id}`),
  plot: "Em uma cidade onde cada segredo tem um preço, vidas se cruzam ao longo de uma temporada cheia de reviravoltas. Drama, humor e tensão na medida certa.",
  year: 2020 + (id % 5), rating: (7.5 + (id % 20) / 10).toFixed(1),
  genre: genres[(id + 1) % genres.length],
  cast: ["Marina Luz", "Téo Braga", "Ítalo Reis"],
  director: "C. Andrade", trailer: null, favorite: id % 2 === 0,
  seasons: [1, 2].map((s) => ({
    season: s,
    episodes: Array.from({ length: 6 }, (_, e) => ({
      id: id * 1000 + s * 100 + e + 1, seriesId: id, season: s, episodeNum: e + 1,
      name: `Episódio ${e + 1}`, durationSecs: 2400 + e * 120,
      plot: "Um capítulo decisivo coloca à prova as alianças construídas até aqui.",
      thumbnail: backdrop(`s${id}e${s}${e}`),
      positionSecs: s === 1 && e === 0 ? 900 : null,
      watchedDurationSecs: null, completed: s === 1 && e < 0, favorite: false,
    })),
  })),
});

const paged = (items: any[], filter: any) => {
  const offset = filter?.offset ?? 0;
  const limit = filter?.limit ?? 60;
  // Repeat the base list so catalog grids fill realistically.
  const full = Array.from({ length: 48 }, (_, i) => {
    const base = items[i % items.length];
    return { ...base, id: base.id + Math.floor(i / items.length) * 1000 };
  });
  return { items: full.slice(offset, offset + limit), total: full.length, offset, limit };
};

const handlers: Record<string, (a: any) => any> = {
  // mockProfiles (URL param or localStorage) lets a preview exercise the
  // first-run onboarding (0) and single-profile auto-enter (1).
  list_profiles: () => {
    const n =
      new URLSearchParams(location.search).get("mockProfiles") ??
      localStorage.getItem("mockProfiles");
    return n !== null ? profiles.slice(0, Math.max(0, Number(n))) : profiles;
  },
  get_settings: () => ({ language: "pt-BR", theme: "dark" }),
  set_setting: () => null,
  set_active_profile: () => null,
  create_profile: () => 4,
  update_profile: () => null,
  delete_profile: () => null,
  import_profile_image: (a) => a?.path ?? "preset:nebula",
  get_home_data: () => homeData,
  list_categories: (a) =>
    (a?.kind === "live" ? liveCats : ["Lançamentos", "Mais vistos", "Clássicos", "Nacionais", "Premiados"].map((name, i) => ({ id: i + 1, sourceId: 1, kind: a?.kind ?? "movie", name, itemCount: 24 + i * 12 }))),
  list_movies: (a) => paged(movieCards, a?.filter),
  list_series: (a) => paged(seriesCards, a?.filter),
  list_channels: (a) => paged(channelCards, a?.filter),
  get_movie_detail: (a) => movieDetail(a?.id ?? 1),
  get_series_detail: (a) => seriesDetail(a?.id ?? 1),
  resolve_stream: (a) => ({
    url: TEST_HLS, kind: "hls", itemType: a?.itemType ?? "movie", itemId: a?.itemId ?? 1,
    name: "Prévia de reprodução", image: backdrop("play"), subtitle: "Demonstração",
    positionSecs: null, seriesId: null, nextEpisodeId: null,
  }),
  epg_now_next: () => [],
  epg_for_channel: () => [],
  toggle_favorite: () => true,
  list_favorites: () => movieCards.filter((m) => m.favorite).concat(seriesCards.slice(0, 3)),
  report_playback: () => null,
  list_history: () => continueCards.map((c) => ({ card: c, updatedAt: now - 3600, completed: false })),
  delete_history_entry: () => null,
  clear_history: () => null,
  global_search: (a) => {
    const q = (a?.query ?? "").toLowerCase();
    const match = (arr: any[]) => arr.filter((c) => c.name.toLowerCase().includes(q));
    return {
      query: a?.query ?? "", channels: match(channelCards), movies: match(movieCards),
      series: match(seriesCards), episodes: [], categories: [], epg: [],
    };
  },
  list_sources: () => [{
    id: 1, profileId: 1, name: "Minha Lista", kind: "m3u_url", url: "https://exemplo.com/lista.m3u",
    username: null, hasPassword: false, epgUrl: null, syncChannels: true, syncMovies: true,
    syncSeries: true, syncEpg: false, syncLogos: true, createdAt: now - 86400,
    lastSyncAt: now - 5400, lastSyncStatus: "ok", channelCount: 320, movieCount: 1200,
    seriesCount: 240, epgCount: 0,
  }],
  add_source: () => 1,
  update_source: () => null,
  delete_source: () => null,
  test_source: () => "OK — 320 canais, 1200 filmes, 240 séries",
  start_sync: () => 1,
  cancel_sync: () => true,
  list_active_jobs: () => [],
  get_app_stats: () => ({
    dbSizeBytes: 48 * 1024 * 1024, logoCacheBytes: 12 * 1024 * 1024,
    channelCount: 320, movieCount: 1200, seriesCount: 240, episodeCount: 4800,
    epgCount: 0, historyCount: 24, favoriteCount: 8,
  }),
  clear_cache: () => null,
  export_data: () => null,
  import_data: () => ({ sourcesAdded: 1, sourcesSkipped: 0, settingsApplied: 3, favoritesMatched: 5, favoritesPending: 0 }),
  check_for_update: () => ({ currentVersion: "0.3.0", latestVersion: "0.3.0", available: false, url: null, notes: null }),
};

export function installTauriMock() {
  installFreezeHelpers();
  // The global film-grain (body::after) uses an SVG feTurbulence filter that
  // hangs headless screenshot capture. It is imperceptible (3.5% opacity), so
  // disable it in preview mode only.
  const style = document.createElement("style");
  style.textContent = "body::after { display: none !important; }";
  document.head.appendChild(style);
  let cbId = 0;
  const cbStore: Record<number, (p: any) => void> = {};
  (window as any).__TAURI_INTERNALS__ = {
    transformCallback(cb: (p: any) => void) {
      const id = ++cbId;
      cbStore[id] = cb;
      return id;
    },
    convertFileSrc(path: string) {
      return path;
    },
    async invoke(cmd: string, args: any) {
      // Tauri plugin IPC (events, dialog, opener) — no-op in the browser.
      if (cmd.startsWith("plugin:")) {
        if (cmd === "plugin:event|listen") return ++cbId;
        return null;
      }
      const h = handlers[cmd];
      if (!h) {
        // eslint-disable-next-line no-console
        console.warn(`[mock] unhandled command: ${cmd}`);
        return null;
      }
      // Simulate a touch of latency so loading states are observable.
      await new Promise((r) => setTimeout(r, 60));
      return h(args);
    },
  };
  // eslint-disable-next-line no-console
  console.info("[mock] Tauri mock installed — running in browser preview mode.");
}
