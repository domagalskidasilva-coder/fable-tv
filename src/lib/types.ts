// Mirrors the Rust models (serde camelCase).

export type SourceKind = "m3u_url" | "m3u_file" | "xc_api";
export type ItemType = "channel" | "movie" | "series" | "episode";

export interface Source {
  id: number;
  name: string;
  kind: SourceKind;
  url: string;
  username: string | null;
  hasPassword: boolean;
  epgUrl: string | null;
  syncChannels: boolean;
  syncMovies: boolean;
  syncSeries: boolean;
  syncEpg: boolean;
  syncLogos: boolean;
  createdAt: number;
  lastSyncAt: number | null;
  lastSyncStatus: string | null;
  channelCount: number;
  movieCount: number;
  seriesCount: number;
  epgCount: number;
}

export interface NewSource {
  name: string;
  kind: SourceKind;
  url: string;
  username: string | null;
  password: string | null;
  epgUrl: string | null;
  syncChannels: boolean;
  syncMovies: boolean;
  syncSeries: boolean;
  syncEpg: boolean;
  syncLogos: boolean;
}

export interface SyncOptions {
  channels: boolean;
  movies: boolean;
  series: boolean;
  epg: boolean;
  logos: boolean;
}

export type SyncPhase =
  | "download"
  | "parse"
  | "channels"
  | "movies"
  | "series"
  | "epg"
  | "logos"
  | "done"
  | "error"
  | "cancelled";

export interface SyncProgress {
  jobId: number;
  sourceId: number;
  phase: SyncPhase;
  processed: number;
  total: number | null;
  message: string | null;
  finished: boolean;
}

export interface ActiveJob {
  jobId: number;
  sourceId: number;
}

export interface MediaCard {
  itemType: ItemType;
  id: number;
  name: string;
  image: string | null;
  subtitle: string | null;
  sourceId: number;
  favorite: boolean;
  positionSecs: number | null;
  durationSecs: number | null;
  seriesId: number | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface CatalogFilter {
  sourceId?: number | null;
  categoryId?: number | null;
  search?: string | null;
  favoritesOnly?: boolean;
  offset?: number;
  limit?: number;
}

export interface Category {
  id: number;
  sourceId: number;
  kind: "live" | "movie" | "series";
  name: string;
  itemCount: number;
}

export interface EpisodeOut {
  id: number;
  seriesId: number;
  season: number;
  episodeNum: number;
  name: string;
  durationSecs: number | null;
  plot: string | null;
  positionSecs: number | null;
  watchedDurationSecs: number | null;
  completed: boolean;
  favorite: boolean;
}

export interface Season {
  season: number;
  episodes: EpisodeOut[];
}

export interface SeriesDetail {
  id: number;
  sourceId: number;
  name: string;
  cover: string | null;
  plot: string | null;
  year: number | null;
  rating: string | null;
  genre: string | null;
  favorite: boolean;
  seasons: Season[];
}

export interface MovieDetail {
  id: number;
  sourceId: number;
  name: string;
  image: string | null;
  year: number | null;
  durationSecs: number | null;
  rating: string | null;
  plot: string | null;
  genre: string | null;
  favorite: boolean;
  positionSecs: number | null;
  watchedDurationSecs: number | null;
}

export interface StreamInfo {
  url: string;
  kind: "hls" | "direct";
  itemType: ItemType;
  itemId: number;
  name: string;
  image: string | null;
  subtitle: string | null;
  positionSecs: number | null;
  seriesId: number | null;
  nextEpisodeId: number | null;
}

export interface EpgEntry {
  title: string;
  description: string | null;
  startTs: number;
  stopTs: number;
}

export interface NowNext {
  channelId: number;
  now: EpgEntry | null;
  next: EpgEntry | null;
}

export interface EpgSearchHit {
  title: string;
  startTs: number;
  stopTs: number;
  channelId: number | null;
  channelName: string | null;
}

export interface SearchResults {
  query: string;
  channels: MediaCard[];
  movies: MediaCard[];
  series: MediaCard[];
  episodes: MediaCard[];
  categories: Category[];
  epg: EpgSearchHit[];
}

export interface SourceStatus {
  id: number;
  name: string;
  kind: SourceKind;
  lastSyncAt: number | null;
  lastSyncStatus: string | null;
  channelCount: number;
  movieCount: number;
  seriesCount: number;
}

export interface HomeData {
  continueWatching: MediaCard[];
  favorites: MediaCard[];
  recentChannels: MediaCard[];
  latestMovies: MediaCard[];
  latestSeries: MediaCard[];
  liveCategories: Category[];
  sources: SourceStatus[];
}

export interface HistoryEntry {
  card: MediaCard;
  updatedAt: number;
  completed: boolean;
}

export interface Profile {
  id: number;
  name: string;
  active: boolean;
}

export interface AppStats {
  dbSizeBytes: number;
  logoCacheBytes: number;
  channelCount: number;
  movieCount: number;
  seriesCount: number;
  episodeCount: number;
  epgCount: number;
  historyCount: number;
  favoriteCount: number;
}

export interface ImportReport {
  sourcesAdded: number;
  sourcesSkipped: number;
  settingsApplied: number;
  favoritesMatched: number;
  favoritesPending: number;
}

export type Settings = Record<string, string>;
