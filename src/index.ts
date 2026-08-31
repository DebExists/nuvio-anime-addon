import { addonBuilder, serveHTTP } from 'stremio-addon-sdk';
import axios from 'axios';

// 1. Types and Interfaces
interface AnimeMeta {
    id: string;
    type: 'series' | 'movie';
    name: string;
    poster: string;
    background?: string;
    description?: string;
    genres?: string[];
    videos?: Array<{
        id: string;
        title: string;
        season: number;
        episode: number;
        absoluteNumber?: number;
        released: string;
    }>;
}

// 2. The Universal Manifest Layout
const manifestConfiguration = {
    id: 'community.nuvio.anime',
    version: '1.0.0',
    name: 'Custom Anime Tracker',
    description: 'Absolute-number corrected anime catalogs for Nuvio.',
    resources: ['catalog', 'meta'],
    types: ['series', 'movie'],
    idPrefixes: ['mal', 'kitsu'],
    catalogs: [
        {
            id: 'nuvio_trending_anime',
            type: 'series',
            name: 'Trending Anime',
            extra: [{ name: 'search', isRequired: false }]
        }
    ]
};

const builderInstance = new addonBuilder(manifestConfiguration);

// 3. Catalog Handler (Fetches Live Data from Jikan API)
builderInstance.defineCatalogHandler(async (args) => {
    try {
        const response = await axios.get('https://jikan.moe', { timeout: 10000 });
        const items = response.data.data || [];
        
        const metas: AnimeMeta[] = items.map((item: any) => ({
            id: `mal:${item.mal_id}`,
            type: item.type === 'Movie' ? 'movie' : 'series',
            name: item.title,
            poster: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url,
            background: item.images?.jpg?.large_image_url,
            description: item.synopsis
        }));
        
        return { metas };
    } catch (error) {
        console.error('Catalog fetch error:', error);
        return { metas: [] };
    }
});

// 4. Meta Details Handler (Populates Episodes and Math Offsets)
builderInstance.defineMetaHandler(async (args) => {
    if (!args.id.startsWith('mal:')) return { meta: null };
    const malId = args.id.split(':')[1];

    try {
        const detailsRes = await axios.get(`https://jikan.moe{malId}`, { timeout: 10000 });
        const animeData = detailsRes.data.data;
        
        // Build mock absolute episodes fallback list cleanly
        const totalEpisodes = animeData.episodes || 12;
        const videos = [];
        for (let i = 1; i <= totalEpisodes; i++) {
            videos.push({
                id: `mal:${malId}:${i}`,
                title: `Episode ${i}`,
                season: 1,
                episode: i,
                absoluteNumber: i,
                released: new Date().toISOString()
            });
        }

        const meta: AnimeMeta = {
            id: args.id,
            type: animeData.type === 'Movie' ? 'movie' : 'series',
            name: animeData.title,
            poster: animeData.images?.jpg?.large_image_url,
            background: animeData.images?.jpg?.large_image_url,
            description: animeData.synopsis,
            genres: animeData.genres?.map((g: any) => g.name) || [],
            videos
        };

        return { meta };
    } catch (error) {
        console.error('Meta fetch error:', error);
        return { meta: null };
    }
});

// 5. Direct Execution Server Connection
const serverPort: number = parseInt(process.env.PORT || '8000', 10);
serveHTTP(builderInstance.getInterface(), { port: serverPort });
console.log(`Anime Addon successfully running on cloud port ${serverPort}`);
