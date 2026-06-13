// Typed wrappers around Tauri commands. The frontend never runs SQL or
// builds stream URLs — everything goes through the Rust backend.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ActiveJob,
  AppStats,
  CatalogFilter,
  Category,
  EpgEntry,
  HistoryEntry,
  HomeData,
  ImportReport,
  ItemType,
  MediaCard,
  MovieDetail,
  NewSource,
  NowNext,
  Paged,
  Profile,
  SearchResults,
  SeriesDetail,
  Settings,
  Source,
  StreamInfo,
  SyncOptions,
  SyncProgress,
} from "./types";

// Sources
export const listSources = () => invoke<Source[]>("list_sources");
export const addSource = (source: NewSource) => invoke<number>("add_source", { source });
export const updateSource = (id: number, source: NewSource) =>
  invoke<void>("update_source", { id, source });
export const deleteSource = (id: number) => invoke<void>("delete_source", { id });
export const testSource = (source: NewSource) => invoke<string>("test_source", { source });

// Sync
export const startSync = (sourceId: number, options: SyncOptions) =>
  invoke<number>("start_sync", { sourceId, options });
export const cancelSync = (jobId: number) => invoke<boolean>("cancel_sync", { jobId });
export const listActiveJobs = () => invoke<ActiveJob[]>("list_active_jobs");
export const onSyncProgress = (cb: (p: SyncProgress) => void): Promise<UnlistenFn> =>
  listen<SyncProgress>("sync://progress", (e) => cb(e.payload));

// Catalog
export const listCategories = (kind: "live" | "movie" | "series", sourceId?: number | null) =>
  invoke<Category[]>("list_categories", { kind, sourceId: sourceId ?? null });
export const listChannels = (filter: CatalogFilter) =>
  invoke<Paged<MediaCard>>("list_channels", { filter });
export const listMovies = (filter: CatalogFilter) =>
  invoke<Paged<MediaCard>>("list_movies", { filter });
export const listSeries = (filter: CatalogFilter) =>
  invoke<Paged<MediaCard>>("list_series", { filter });
export const getMovieDetail = (id: number) => invoke<MovieDetail>("get_movie_detail", { id });
export const getSeriesDetail = (id: number) => invoke<SeriesDetail>("get_series_detail", { id });
export const resolveStream = (itemType: ItemType, itemId: number) =>
  invoke<StreamInfo>("resolve_stream", { itemType, itemId });

// EPG
export const epgNowNext = (channelIds: number[]) =>
  invoke<NowNext[]>("epg_now_next", { channelIds });
export const epgForChannel = (channelId: number, fromTs: number, toTs: number) =>
  invoke<EpgEntry[]>("epg_for_channel", { channelId, fromTs, toTs });

// Favorites & history
export const toggleFavorite = (itemType: ItemType, itemId: number) =>
  invoke<boolean>("toggle_favorite", { itemType, itemId });
export const listFavorites = (itemType?: ItemType, limit?: number) =>
  invoke<MediaCard[]>("list_favorites", { itemType: itemType ?? null, limit: limit ?? null });
export const reportPlayback = (
  itemType: ItemType,
  itemId: number,
  positionSecs: number,
  durationSecs: number,
) => invoke<void>("report_playback", { itemType, itemId, positionSecs, durationSecs });
export const listHistory = (itemType: ItemType | null, limit: number, offset: number) =>
  invoke<HistoryEntry[]>("list_history", { itemType, limit, offset });
export const deleteHistoryEntry = (itemType: ItemType, itemId: number) =>
  invoke<void>("delete_history_entry", { itemType, itemId });
export const clearHistory = () => invoke<void>("clear_history");

// Home & search
export const getHomeData = () => invoke<HomeData>("get_home_data");
export const globalSearch = (query: string) => invoke<SearchResults>("global_search", { query });

// Settings & profiles
export const getSettings = () => invoke<Settings>("get_settings");
export const setSetting = (key: string, value: string) =>
  invoke<void>("set_setting", { key, value });
export const listProfiles = () => invoke<Profile[]>("list_profiles");
export const createProfile = (name: string) => invoke<number>("create_profile", { name });
export const deleteProfile = (id: number) => invoke<void>("delete_profile", { id });
export const setActiveProfile = (id: number) => invoke<void>("set_active_profile", { id });

// Data management
export const exportData = (path: string) => invoke<void>("export_data", { path });
export const importData = (path: string) => invoke<ImportReport>("import_data", { path });
export const getAppStats = () => invoke<AppStats>("get_app_stats");
export const clearCache = (kind: "logos" | "epg" | "all") => invoke<void>("clear_cache", { kind });
