// ============================================================
//  AIO ANIME HUB  –  index.js  (single-file edition)
//  Nuvio / Stremio-compatible add-on
//
//  SECTIONS (use Ctrl+F on the section title to jump):
//    1. IMPORTS & BOOTSTRAP
//    2. ANIME MAPPING MATRIX      ← add new series here
//    3. MAPPER ENGINE             ← season → absolute logic
//    4. ANILIST GRAPHQL HELPERS
//    5. MANIFEST ROUTE
//    6. CATALOG ROUTE  (trending + search)
//    7. META ROUTE     (movie / series layout switcher)
//    8. HEALTH + ERROR HANDLERS
//    9. SERVER STARTUP
// ============================================================


// ============================================================
// 1. IMPORTS & BOOTSTRAP
// ============================================================

const express  = require('express');
const axios    = require('axios');
const NodeCache = require('node-cache');

const app   = express();
const PORT  = process.env.PORT || 7070;

// 24-hour cache; checked every hour — shields AniList's 90 req/min limit
const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

// Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin',  '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});


// ============================================================
// 2. ANIME MAPPING MATRIX
//
//  Each key is an AniList ID.  seasonOffsets maps season number
//  to the absolute-episode count that precedes it, so:
//    absoluteEp = seasonOffsets[season] + episodeWithinSeason
//
//  To add a new series, copy the template block at the bottom
//  of this section and fill in the values.
//  Great source for kitsuId ↔ aniListId cross-refs:
//    https://github.com/Fribb/anime-lists
// ============================================================

const ANIME_MAPPING_MATRIX = {

  // ----------------------------------------------------------
  // ONE PIECE  (AniList 21 → Kitsu 431)
  // Long-runner example: Season 13 Ep 1 = Absolute Ep 892
  // ----------------------------------------------------------
  21: {
    kitsuId: 431,
    format: 'TV',
    title: 'One Piece',
    seasonOffsets: {
      1:  0,     // East Blue Arc          eps   1 –  61
      2:  61,    // Alabasta Arc           eps  62 – 130
      3:  130,   // Jaya Arc               eps 131 – 143
      4:  143,   // Skypiea Arc            eps 144 – 195
      5:  195,   // Water 7 Arc            eps 196 – 312
      6:  312,   // Thriller Bark Arc      eps 313 – 381
      7:  381,   // Summit War Arc         eps 382 – 516
      8:  516,   // Fish-Man Island Arc    eps 517 – 574
      9:  574,   // Punk Hazard Arc        eps 575 – 629
      10: 629,   // Dressrosa Arc          eps 630 – 745
      11: 745,   // Zou Arc                eps 746 – 779
      12: 779,   // Whole Cake Island Arc  eps 780 – 891
      13: 891,   // Wano Country Arc       eps 892 – 1085
      14: 1085,  // Egghead Arc            eps 1086+
    },
    totalEpisodes: 1122,
    notes: 'Fribb anime-lists; canonical arc-based numbering',
  },

  // ----------------------------------------------------------
  // NARUTO  (AniList 20 → Kitsu 430)
  // ----------------------------------------------------------
  20: {
    kitsuId: 430,
    format: 'TV',
    title: 'Naruto',
    seasonOffsets: {
      1: 0,
      2: 220,
      3: 380,
      4: 500,
    },
    totalEpisodes: 500,
    notes: 'Original series only. Use AniList 16498 for Shippuden.',
  },

  // ----------------------------------------------------------
  // NARUTO: SHIPPUDEN  (AniList 16498 → Kitsu 11617)
  // ----------------------------------------------------------
  16498: {
    kitsuId: 11617,
    format: 'TV',
    title: 'Naruto: Shippuden',
    seasonOffsets: {
      1: 0,
      2: 24,
      3: 56,
      4: 100,
      5: 160,
    },
    totalEpisodes: 500,
    notes: 'Direct continuation of AniList 20',
  },

  // ----------------------------------------------------------
  // JOJO'S BIZARRE ADVENTURE – Part 1  (AniList 14719 → Kitsu 9989)
  // Each JoJo part is a separate AniList entry.
  // ----------------------------------------------------------
  14719: {
    kitsuId: 9989,
    format: 'TV',
    title: "JoJo's Bizarre Adventure",
    seasonOffsets: {
      1: 0,   // Phantom Blood + Battle Tendency, eps 1-26
    },
    totalEpisodes: 26,
    notes: 'Part 1 & 2 combined. Separate AniList IDs exist for Parts 3-6.',
  },

  // ----------------------------------------------------------
  // ADD MORE SERIES BELOW — copy this template:
  //
  // 999999: {
  //   kitsuId: 0,            // look up on https://kitsu.io
  //   format: 'TV',          // TV | MOVIE | OVA | SPECIAL
  //   title: 'Series Name',
  //   seasonOffsets: {
  //     1: 0,                // season 1 starts at absolute ep 0
  //     2: 13,               // season 2 starts at absolute ep 13
  //   },
  //   totalEpisodes: 26,
  //   notes: 'Source: Fribb / manual',
  // },
  // ----------------------------------------------------------
};


// ============================================================
// 3. MAPPER ENGINE
//
//  getKitsuMapping(aniListId, season, episode)
//    → { kitsuId, absoluteNumber, fallback, ... }
// ============================================================

function getKitsuMapping(aniListId, season, episode) {
  const mapping = ANIME_MAPPING_MATRIX[aniListId];

  // No matrix entry → fallback to raw season/episode
  if (!mapping) {
    console.warn(`[MAPPER] No entry for AniList ${aniListId}. Fallback mode.`);
    return {
      kitsuId:        null,
      episodeId:      `${season}x${episode}`,
      absoluteNumber: null,
      fallback:       true,
      format:         'unknown',
    };
  }

  const offsets = mapping.seasonOffsets;

  // Season not in matrix → extrapolate from highest known season
  if (offsets[season] === undefined) {
    const lastSeason  = Math.max(...Object.keys(offsets).map(Number));
    const absoluteNumber = offsets[lastSeason] + episode;
    console.warn(
      `[MAPPER] Season ${season} not in matrix for ${mapping.title}. ` +
      `Extrapolating from season ${lastSeason} → absolute ep ${absoluteNumber}.`
    );
    return {
      kitsuId:        mapping.kitsuId,
      episodeId:      `${season}x${episode}`,
      absoluteNumber: absoluteNumber,
      fallback:       true,
      format:         mapping.format,
    };
  }

  // Normal path: offset + episode-within-season = absolute episode
  const absoluteNumber = offsets[season] + episode;

  if (mapping.totalEpisodes && absoluteNumber > mapping.totalEpisodes) {
    console.warn(
      `[MAPPER] Absolute ep ${absoluteNumber} exceeds declared total ` +
      `${mapping.totalEpisodes} for ${mapping.title}.`
    );
  }

  return {
    kitsuId:        mapping.kitsuId,
    episodeId:      `${season}x${episode}`,
    absoluteNumber: absoluteNumber,
    fallback:       false,
    format:         mapping.format,
    title:          mapping.title,
  };
}


// ============================================================
// 4. ANILIST GRAPHQL HELPERS
// ============================================================

const ANILIST_API = 'https://graphql.anilist.co';

// GraphQL: trending anime (50 results, safe-content only)
const TRENDING_QUERY = `
  query {
    Page(page: 1, perPage: 50) {
      media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
        id
        title { english romaji }
        coverImage { large medium }
        format
        episodes
        status
      }
    }
  }
`;

// GraphQL: title search
const SEARCH_QUERY = `
  query SearchAnime($search: String!) {
    Page(page: 1, perPage: 25) {
      media(type: ANIME, search: $search, isAdult: false) {
        id
        title { english romaji }
        coverImage { large medium }
        format
        episodes
        status
      }
    }
  }
`;

// GraphQL: full metadata for a single entry
const META_QUERY = `
  query GetAnime($id: Int!) {
    Media(id: $id, type: ANIME) {
      id
      title { english romaji native }
      format
      episodes
      duration
      seasonYear
      status
      description
      coverImage { large medium }
      bannerImage
      genres
      averageScore
      favourites
      studios { edges { node { name } } }
    }
  }
`;

/**
 * POST a GraphQL query to AniList with unified error handling.
 * Throws on 429, 5xx, timeout, or GraphQL-level errors.
 */
async function queryAniList(query, variables = {}) {
  try {
    const res = await axios.post(
      ANILIST_API,
      { query, variables },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );

    if (res.data.errors) {
      throw new Error(res.data.errors.map(e => e.message).join('; '));
    }
    return res.data.data;

  } catch (err) {
    if (err.response?.status === 429)     throw new Error('RATE_LIMITED');
    if (err.response?.status >= 500)      throw new Error(`ANILIST_SERVER_${err.response.status}`);
    if (err.code === 'ECONNABORTED')      throw new Error('TIMEOUT');
    throw err;
  }
}

/**
 * Convert an AniList media object into the catalog meta shape
 * (used by both trending and search responses).
 */
function mediaToCatalogMeta(media) {
  return {
    id:     `anilist:${media.id}`,
    name:   media.title.english || media.title.romaji,
    poster: media.coverImage?.large || media.coverImage?.medium,
    type:   media.format === 'MOVIE' ? 'movie' : 'series',
    ...(media.episodes && { episodeCount: media.episodes }),
    ...(media.status   && { status: media.status }),
  };
}


// ============================================================
// 5. MANIFEST ROUTE
//    GET /manifest.json
// ============================================================

app.get('/manifest.json', (req, res) => {
  console.log('[MANIFEST] Request received');
  res.json({
    id:          'org.animeaio.hub',
    version:     '1.0.0',
    name:        'AIO Anime Hub',
    description: 'Unified Anime Hub: Rich AniList metadata mapped seamlessly to Kitsu streaming IDs.',
    resources:   ['catalog', 'meta'],
    types:       ['series', 'movie', 'anime'],
    idPrefixes:  ['anilist', 'kitsu', 'mal'],
    catalogs: [
      {
        type: 'anime',
        id:   'aio_trending_anime',
        name: 'AIO: Trending Anime',
      },
      {
        type: 'anime',
        id:   'aio_search_anime',
        name: 'AIO: Search',
        extra: [{ name: 'search', isRequired: false }],
      },
    ],
    behaviorHints: { p2p: true, configurable: false, cacheable: true },
  });
});


// ==========================================
// 6. CATALOG ROUTE
// ==========================================
app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
    const { type, id, extra } = req.params;
    console.log(`Catalog Request - ID: ${id}, Extra: ${extra}`);

    try {
        let searchQuery = "";
        if (extra && extra.includes('search=')) {
            const splitParts = extra.split('search=');
            if (splitParts.length > 1) {
                searchQuery = decodeURIComponent(splitParts[1]).replace(/\+/g, ' ').trim();
            }
        }

        const query = `
          query ($search: String, $sort: [MediaSort]) {
            Page (page: 1, perPage: 20) {
              media (type: ANIME, search: $search, sort: $sort) {
                id
                title { romaji english }
                coverImage { large }
                format
              }
            }
          }
        `;

        const variables = searchQuery ? { search: searchQuery } : { sort: ["TRENDING_DESC"] };
        const response = await axios.post('https://anilist.co', { query, variables });
        const animeList = response.data?.data?.Page?.media || [];

        const metas = animeList.map(anime => ({
            id: `anilist:${anime.id}`,
            type: anime.format === 'MOVIE' ? 'movie' : 'series',
            name: anime.title.english || anime.title.romaji,
            poster: anime.coverImage.large
        }));

        res.json({ metas });
    } catch (error) {
        console.error("Catalog processing error:", error.message);
        res.json({ metas: [] });
    }
});

// ==========================================
// 7. META ROUTE (With Stream Provider Mapping)
// ==========================================
app.get('/meta/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    console.log(`Meta Request - Type: ${type}, ID: ${id}`);

    try {
        const rawId = id.includes(':') ? id.split(':').pop() : id;
        const aniListId = parseInt(rawId, 10);

        if (isNaN(aniListId)) {
            return res.status(400).json({ error: "Cannot parse AniList ID" });
        }

        // Check local cache shield first
        const cachedData = cache.get(`meta:${aniListId}`);
        if (cachedData) return res.json(cachedData);

        // Fetch rich data PLUS the idMal (MyAnimeList ID) needed by scrapers
        const query = `
          query ($id: Int) {
            Media (id: $id, type: ANIME) {
              id
              idMal
              title { romaji english }
              description
              bannerImage
              coverImage { large }
              format
              episodes
              genres
            }
          }
        `;

        const response = await axios.post('https://anilist.co', { query, variables: { id: aniListId } });
        const anime = response.data?.data?.Media;

        if (!anime) return res.status(404).json({ error: "Anime not found" });

        const isMovie = anime.format === 'MOVIE';
        
        // Loop through episodes and map them natively
        const videos = [];
        if (!isMovie && anime.episodes) {
            for (let i = 1; i <= anime.episodes; i++) {
                // Call our mapper helper to resolve long-runner absolute numbering
                const mapping = getKitsuMapping(aniListId, 1, i);
                
                videos.push({
                    id: `kitsu:${mapping.kitsuId}:${mapping.episode}`,
                    title: `Episode ${i}`,
                    season: 1,
                    episode: i
                });
            }
        }

        const metaResponse = {
            meta: {
                id: `anilist:${anime.id}`,
                type: isMovie ? 'movie' : 'series',
                name: anime.title.english || anime.title.romaji,
                genres: anime.genres,
                poster: anime.coverImage.large,
                background: anime.bannerImage || anime.coverImage.large,
                description: anime.description,
                videos: videos,
                // Tell stream providers what IDs to look for
                behaviorHints: {
                    defaultVideoId: `kitsu:${getKitsuMapping(aniListId, 1, 1).kitsuId}:1`,
                    hasStreams: false
                }
            }
        };

        // Cache for 24 hours
        cache.set(`meta:${aniListId}`, metaResponse);
        res.json(metaResponse);

    } catch (error) {
        console.error("Meta processing error:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ==========================================
// 8. HEALTH ROUTE & SERVER STARTUP
// ==========================================
app.get('/', (req, res) => res.json({ status: "ready", service: "AIO Anime Hub" }));
app.listen(PORT, () => console.log(`Server executing seamlessly on port ${PORT}`));
