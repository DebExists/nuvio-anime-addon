import axios, { AxiosError } from "axios";
import { addonBuilder, serveHTTP } from "stremio-addon-sdk";

// ============================================================================
// TYPE DEFINITIONS & INTERFACES
// ============================================================================

interface JikanGenre {
  mal_id: number;
  type: string;
  name: string;
  url: string;
}

interface JikanStudio {
  mal_id: number;
  type: string;
  name: string;
  url: string;
}

interface JikanImageSet {
  image_url: string;
  small_image_url: string;
  large_image_url: string;
}

interface JikanImages {
  jpg: JikanImageSet;
  webp?: JikanImageSet;
}

interface JikanAnime {
  mal_id: number;
  url: string;
  images: JikanImages;
  trailer?: {
    youtube_id?: string;
    url?: string;
    embed_url?: string;
  };
  approved: boolean;
  titles: Array<{
    type: string;
    title: string;
  }>;
  title: string;
  title_english?: string;
  title_japanese?: string;
  title_synonyms?: string[];
  type?: string;
  source?: string;
  episodes: number | null;
  status: string;
  airing: boolean;
  aired?: {
    from?: string;
    to?: string | null;
    prop?: {
      from?: {
        day?: number;
        month?: number;
        year?: number;
      };
      to?: {
        day?: number;
        month?: number;
        year?: number;
      };
    };
    string?: string;
  };
  premiere?: string;
  broadcast?: {
    day?: string;
    time?: string;
    timezone?: string;
    string?: string;
  };
  producers?: Array<{
    mal_id: number;
    type: string;
    name: string;
    url: string;
  }>;
  licensors?: Array<{
    mal_id: number;
    type: string;
    name: string;
    url: string;
  }>;
  studios?: JikanStudio[];
  genres: JikanGenre[];
  explicit_genres?: JikanGenre[];
  themes?: JikanGenre[];
  demographics?: JikanGenre[];
  score?: number;
  scored_by?: number;
  rank?: number;
  popularity?: number;
  members?: number;
  favorites?: number;
  synopsis?: string;
  background?: string;
  season?: string;
  year?: number;
  broadcast_day?: string;
  broadcast_timezone?: string;
}

interface JikanEpisode {
  mal_id: number;
  url: string;
  title: string;
  title_romanji?: string;
  title_japanese?: string;
  aired?: string;
  filler: boolean;
  recap: boolean;
  forum_url: string;
  episode_id?: number;
}

interface JikanEpisodeResponse {
  data: JikanEpisode[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    current_page: number;
    items_per_page: number;
  };
}

interface JikanAnimeResponse {
  data: JikanAnime;
}

interface JikanTopAnimeResponse {
  data: JikanAnime[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    current_page: number;
    items_per_page: number;
  };
}

interface AnimeListsMapping {
  mal_id?: number;
  kitsu_id?: number;
  imdb_id?: string;
  anidb_id?: number;
  episodes?: number;
  season_offset?: number;
  title?: string;
}

interface SeasonMetadata {
  season: number;
  episode_start: number;
  episode_end: number;
  absolute_offset: number;
  episode_count: number;
}

interface StreamioMetadata {
  id: string;
  type: "series" | "movie";
  name: string;
  genre?: string[];
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  year?: number;
  imdbRating?: string;
  duration?: string;
  links?: Array<{ title: string; url: string }>;
  videos?: StreamioVideo[];
  cast?: string[];
  director?: string[];
  writer?: string[];
  created?: string;
}

interface StreamioVideo {
  id: string;
  season?: number;
  episode?: number;
  absoluteNumber?: number;
  title?: string;
  released?: string;
  thumbnail?: string;
  overview?: string;
  rating?: string;
}

interface StreamioCatalogItem {
  id: string;
  type: "series" | "movie";
  name: string;
  poster: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  genre?: string[];
  country?: string[];
  created?: string;
}

interface ManifestResource {
  name?: string;
  types: string[];
  idPrefixes: string[];
  catalogs?: Array<{
    id: string;
    name: string;
    type: string;
    extra?: Array<{ name: string; isRequired?: boolean }>;
  }>;
}

interface StreamioManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  types: string[];
  idPrefixes: string[];
  resources: ManifestResource[];
  catalogs?: Array<{
    id: string;
    name: string;
    type: string;
    extra?: Array<{ name: string; isRequired?: boolean }>;
  }>;
  background?: string;
  logo?: string;
  contactEmail?: string;
}

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const JIKAN_BASE_URL = "https://api.jikan.moe/v4";
const KITSU_BASE_URL = "https://kitsu.io/api/edge";
const ANIME_OFFLINE_DB_URL =
  "https://raw.githubusercontent.com/manami-project/anime-offline-database/master/anime-offline-database-minified.json";

const MANIFEST: StreamioManifest = {
  id: "community.advanced.anime.koyeb",
  version: "1.0.0",
  name: "Advanced Anime Metadata Addon",
  description:
    "Comprehensive anime metadata with MAL/Kitsu/IMDb cross-referencing and absolute episode numbering for Nuvio/Torrentio compatibility",
  types: ["series", "movie"],
  idPrefixes: ["mal", "kitsu"],
  resources: [
    {
      name: "catalog",
      types: ["series"],
      idPrefixes: [],
      catalogs: [
        {
          id: "trending_anime",
          name: "Trending Anime",
          type: "series",
          extra: [
            {
              name: "skip",
              isRequired: false,
            },
          ],
        },
        {
          id: "top_rated_anime",
          name: "Top Rated Anime",
          type: "series",
          extra: [
            {
              name: "skip",
              isRequired: false,
            },
          ],
        },
        {
          id: "upcoming_anime",
          name: "Upcoming Anime",
          type: "series",
          extra: [
            {
              name: "skip",
              isRequired: false,
            },
          ],
        },
      ],
    },
    {
      name: "meta",
      types: ["series", "movie"],
      idPrefixes: ["mal", "kitsu"],
    },
    {
      name: "stream",
      types: ["series", "movie"],
      idPrefixes: ["mal", "kitsu"],
    },
  ],
  catalogs: [
    {
      id: "trending_anime",
      name: "Trending Anime",
      type: "series",
    },
    {
      id: "top_rated_anime",
      name: "Top Rated Anime",
      type: "series",
    },
    {
      id: "upcoming_anime",
      name: "Upcoming Anime",
      type: "series",
    },
  ],
  contactEmail: "support@advanced-anime.local",
};

// ============================================================================
// CACHING SYSTEM
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class CacheManager {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly DEFAULT_TTL_MS = 3600000; // 1 hour

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl: ttlMs || this.DEFAULT_TTL_MS,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

const cacheManager = new CacheManager();

// ============================================================================
// ANIME DATABASE & MAPPING ENGINE
// ============================================================================

class AnimeListsDatabase {
  private malToKitsu: Map<number, number> = new Map();
  private malToImdb: Map<number, string> = new Map();
  private kitsuToMal: Map<number, number> = new Map();
  private imdbToMal: Map<string, number> = new Map();
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this._performInitialization();
    return this.initializationPromise;
  }

  private async _performInitialization(): Promise<void> {
    try {
      console.log("[AnimeDB] Initializing anime mapping database...");

      let mappingCount = 0;

      try {
        const response = await axios.get(ANIME_OFFLINE_DB_URL, {
          timeout: 30000,
        });

        const dbData = response.data as {
          data?: Array<{
            sources: string[];
            relations?: Array<{ id: string; relation: string }>;
          }>;
        };

        const mappingData = dbData.data || [];

        for (const entry of mappingData) {
          if (!entry.sources || entry.sources.length === 0) continue;

          let malId: number | undefined;
          let kitsuId: number | undefined;
          let imdbId: string | undefined;

          // Parse sources to extract IDs
          for (const source of entry.sources) {
            if (source.startsWith("myanimelist/anime/")) {
              const id = source.replace("myanimelist/anime/", "");
              malId = parseInt(id, 10);
            } else if (source.startsWith("kitsu/anime/")) {
              const id = source.replace("kitsu/anime/", "");
              kitsuId = parseInt(id, 10);
            } else if (source.startsWith("imdb/title/")) {
              imdbId = source.replace("imdb/title/", "");
            }
          }

          // Store bidirectional mappings
          if (malId) {
            if (kitsuId) {
              this.malToKitsu.set(malId, kitsuId);
              this.kitsuToMal.set(kitsuId, malId);
            }
            if (imdbId) {
              this.malToImdb.set(malId, imdbId);
              this.imdbToMal.set(imdbId, malId);
            }
            mappingCount++;
          }
        }

        console.log(
          `[AnimeDB] Successfully loaded ${mappingCount} anime mappings`
        );
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.warn(
            `[AnimeDB] Failed to fetch anime-offline-database: ${error.message}`
          );
        } else {
          console.warn("[AnimeDB] Failed to fetch anime-offline-database");
        }
        console.log("[AnimeDB] Continuing with dynamic mapping fallback...");
      }

      this.initialized = true;
    } catch (error) {
      console.error("[AnimeDB] Initialization error:", error);
      this.initialized = true;
    }
  }

  getMalToKitsu(malId: number): number | null {
    return this.malToKitsu.get(malId) || null;
  }

  getMalToImdb(malId: number): string | null {
    return this.malToImdb.get(malId) || null;
  }

  getKitsuToMal(kitsuId: number): number | null {
    return this.kitsuToMal.get(kitsuId) || null;
  }

  getImdbToMal(imdbId: string): number | null {
    return this.imdbToMal.get(imdbId) || null;
  }

  addMapping(malId: number, kitsuId?: number, imdbId?: string): void {
    if (kitsuId) {
      this.malToKitsu.set(malId, kitsuId);
      this.kitsuToMal.set(kitsuId, malId);
    }
    if (imdbId) {
      this.malToImdb.set(malId, imdbId);
      this.imdbToMal.set(imdbId, malId);
    }
  }

  getStats(): { malCount: number; kitsuCount: number; imdbCount: number } {
    return {
      malCount: this.malToKitsu.size + this.malToImdb.size,
      kitsuCount: this.kitsuToMal.size,
      imdbCount: this.imdbToMal.size,
    };
  }
}

const animeDatabase = new AnimeListsDatabase();

// ============================================================================
// ABSOLUTE EPISODE NUMBERING ENGINE
// ============================================================================

class EpisodeNumberingEngine {
  private seasonMetadataCache: Map<number, SeasonMetadata[]> = new Map();

  /**
   * Calculate season boundaries and absolute episode offsets
   * Handles multi-season anime with dynamic episode count detection
   */
  async calculateSeasonMetadata(
    malId: number,
    totalEpisodes: number
  ): Promise<SeasonMetadata[]> {
    const cacheKey = `season_meta_${malId}`;
    const cached = this.seasonMetadataCache.get(malId);
    if (cached) return cached;

    try {
      const anime = await fetchJikanAnimeById(malId);
      if (!anime) {
        // Fallback: assume single season
        return [
          {
            season: 1,
            episode_start: 1,
            episode_end: totalEpisodes,
            absolute_offset: 0,
            episode_count: totalEpisodes,
          },
        ];
      }

      // Heuristic: Most anime seasons are 12-13 episodes
      // Multi-cour shows (24-26 eps) might still be season 1
      const estimatedSeasons = Math.max(1, Math.ceil(totalEpisodes / 13));
      const episodesPerSeason = Math.ceil(totalEpisodes / estimatedSeasons);

      const seasonData: SeasonMetadata[] = [];
      let absoluteOffset = 0;

      for (let season = 1; season <= estimatedSeasons; season++) {
        const episodeStart = (season - 1) * episodesPerSeason + 1;
        let episodeEnd = season * episodesPerSeason;

        // Adjust final season to match total episode count
        if (season === estimatedSeasons) {
          episodeEnd = totalEpisodes;
        }

        const episodeCount = episodeEnd - episodeStart + 1;

        seasonData.push({
          season,
          episode_start: episodeStart,
          episode_end: episodeEnd,
          absolute_offset: absoluteOffset,
          episode_count: episodeCount,
        });

        absoluteOffset += episodeCount;
      }

      this.seasonMetadataCache.set(malId, seasonData);
      return seasonData;
    } catch (error) {
      console.error(
        `[EpisodeEngine] Error calculating seasons for MAL ID ${malId}:`,
        error
      );
      // Fallback
      return [
        {
          season: 1,
          episode_start: 1,
          episode_end: totalEpisodes,
          absolute_offset: 0,
          episode_count: totalEpisodes,
        },
      ];
    }
  }

  /**
   * Calculate absolute episode number from season and episode
   * Accounts for multi-season offset
   */
  calculateAbsoluteNumber(
    season: number,
    episode: number,
    seasonMetadata: SeasonMetadata[]
  ): number {
    const seasonInfo = seasonMetadata.find((s) => s.season === season);
    if (!seasonInfo) {
      // Fallback: assume linear progression
      return episode;
    }

    return seasonInfo.absolute_offset + episode;
  }

  clearCache(): void {
    this.seasonMetadataCache.clear();
  }
}

const episodeEngine = new EpisodeNumberingEngine();

// ============================================================================
// JIKAN API FUNCTIONS
// ============================================================================

async function fetchJikanAnimeById(malId: number): Promise<JikanAnime | null> {
  const cacheKey = `jikan_anime_${malId}`;
  const cached = cacheManager.get<JikanAnime>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get<JikanAnimeResponse>(
      `${JIKAN_BASE_URL}/anime/${malId}/full`,
      {
        timeout: 12000,
        headers: {
          "Accept-Encoding": "gzip, deflate",
        },
      }
    );

    const anime = response.data.data;
    if (anime) {
      cacheManager.set(cacheKey, anime, 3600000); // 1 hour cache
    }
    return anime;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        console.warn(`[Jikan] Anime not found: MAL ID ${malId}`);
      } else {
        console.error(`[Jikan] Error fetching anime ${malId}:`, error.message);
      }
    }
    return null;
  }
}

async function fetchJikanEpisodes(
  malId: number,
  page: number = 1
): Promise<JikanEpisode[]> {
  const cacheKey = `jikan_episodes_${malId}_${page}`;
  const cached = cacheManager.get<JikanEpisode[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get<JikanEpisodeResponse>(
      `${JIKAN_BASE_URL}/anime/${malId}/episodes?page=${page}`,
      {
        timeout: 12000,
        headers: {
          "Accept-Encoding": "gzip, deflate",
        },
      }
    );

    const episodes = response.data.data || [];
    if (episodes.length > 0) {
      cacheManager.set(cacheKey, episodes, 3600000);
    }
    return episodes;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status !== 404) {
        console.error(
          `[Jikan] Error fetching episodes for MAL ID ${malId}, page ${page}:`,
          error.message
        );
      }
    }
    return [];
  }
}

async function fetchAllJikanEpisodes(malId: number): Promise<JikanEpisode[]> {
  const cacheKey = `jikan_all_episodes_${malId}`;
  const cached = cacheManager.get<JikanEpisode[]>(cacheKey);
  if (cached) return cached;

  const allEpisodes: JikanEpisode[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 100) {
    const episodes = await fetchJikanEpisodes(malId, page);

    if (episodes.length === 0) {
      hasMore = false;
      break;
    }

    allEpisodes.push(...episodes);

    if (episodes.length < 25) {
      hasMore = false;
    }

    page++;

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (allEpisodes.length > 0) {
    cacheManager.set(cacheKey, allEpisodes, 3600000);
  }

  return allEpisodes;
}

async function fetchTrendingAnime(page: number = 1): Promise<JikanAnime[]> {
  const cacheKey = `jikan_trending_${page}`;
  const cached = cacheManager.get<JikanAnime[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get<JikanTopAnimeResponse>(
      `${JIKAN_BASE_URL}/top/anime?filter=airing&page=${page}&limit=25`,
      {
        timeout: 12000,
        headers: {
          "Accept-Encoding": "gzip, deflate",
        },
      }
    );

    const anime = response.data.data || [];
    if (anime.length > 0) {
      cacheManager.set(cacheKey, anime, 1800000); // 30 min cache for trending
    }
    return anime;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`[Jikan] Error fetching trending anime:`, error.message);
    }
    return [];
  }
}

async function fetchTopRatedAnime(page: number = 1): Promise<JikanAnime[]> {
  const cacheKey = `jikan_top_rated_${page}`;
  const cached = cacheManager.get<JikanAnime[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get<JikanTopAnimeResponse>(
      `${JIKAN_BASE_URL}/top/anime?type=tv&page=${page}&limit=25`,
      {
        timeout: 12000,
        headers: {
          "Accept-Encoding": "gzip, deflate",
        },
      }
    );

    const anime = response.data.data || [];
    if (anime.length > 0) {
      cacheManager.set(cacheKey, anime, 1800000);
    }
    return anime;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `[Jikan] Error fetching top rated anime:`,
        error.message
      );
    }
    return [];
  }
}

async function fetchUpcomingAnime(page: number = 1): Promise<JikanAnime[]> {
    const cacheKey = `jikan_upcoming_${page}`;
    const cached = cacheManager.get<JikanAnime[]>(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios.get<JikanTopAnimeResponse>(
            `${JIKAN_BASE_URL}/seasons/upcoming?page=${page}&limit=25`,
            {
                timeout: 12000,
                headers: { "Accept-Encoding": "gzip, deflate" }
            }
        );

        const anime = response.data.data || [];
        if (anime.length > 0) {
            cacheManager.set(cacheKey, anime, 1800000);
        }
        return anime;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('[Jikan] Error fetching upcoming anime:', error.message);
        }
        return [];
    }
}

const port: number = parseInt(process.env.PORT || '8000', 10);
serveHTTP(addon.getInterface(), { port });
console.log(`Anime Addon running on cloud port ${port}`);
