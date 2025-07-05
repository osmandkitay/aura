// packages/reference-client/src/crawler.ts
import axios from 'axios';
import { AuraManifest } from '@aura/protocol';

/**
 * This script demonstrates how a search engine or indexer could crawl an AURA-enabled site.
 * Instead of just indexing text content, it indexes the site's semantic capabilities.
 */
async function crawlSiteForCapabilities(baseUrl: string) {
    console.log(`Crawling ${baseUrl} for AURA capabilities...`);
    try {
        const manifestUrl = `${baseUrl}/.well-known/aura.json`;
        const response = await axios.get<AuraManifest>(manifestUrl);
        const manifest = response.data;

        const indexedData = {
            crawledUrl: baseUrl,
            timestamp: new Date().toISOString(),
            site: {
                name: manifest.site.name,
                description: manifest.site.description,
            },
            // Indexing the actions the site offers
            capabilities: Object.values(manifest.capabilities).map(cap => ({
                id: cap.id,
                description: cap.description,
                // A real crawler could index parameter schemas for deep linking
                parameters: Object.keys(cap.parameters?.properties || {}),   
            })),
        };

        console.log("\n--- AURA Site Index ---");
        console.log("A crawler has discovered the following structured capabilities:");
        console.log(JSON.stringify(indexedData, null, 2));
        console.log("-----------------------\n");
        console.log("This structured data allows search engines to understand what a user can *do* on a site, not just what they can *read*.");

    } catch (error) {
        console.error(`Failed to crawl ${baseUrl}. Is it an AURA-enabled site with a valid manifest?`);
        console.error((error as Error).message);
    }
}

// Main execution flow
const url = process.argv[2];
if (!url) {
    console.error('Usage: npm run crawler <url>');
    process.exit(1);
}
crawlSiteForCapabilities(url); 