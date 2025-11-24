const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');

// Configuration constants
const MAX_ARTICLES_PER_FEED = 50;  // Matches the limit in app.js
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const REQUEST_DELAY_MS = 1000;  // Delay between feed requests

// Default feeds configuration - matches app.js
const DEFAULT_FEEDS = [
  {
    url: 'https://redlib.perennialte.ch/r/gadgets.rss',
    group: 'tech',
    filename: 'tech-reddit-gadgets.json'
  },
  {
    url: 'https://www.jagatreview.com/feed/',
    group: 'country',
    filename: 'country-jagat-review.json'
  }
];

// Create feeds directory if it doesn't exist
const feedsDir = path.join(__dirname, '..', 'feeds');
if (!fs.existsSync(feedsDir)) {
  fs.mkdirSync(feedsDir, { recursive: true });
}

// Fetch a URL with retries
function fetchUrl(url, maxRetries = MAX_RETRIES) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    let retries = 0;
    
    const attemptFetch = () => {
      const request = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSS-Feed-Fetcher/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml'
        },
        timeout: REQUEST_TIMEOUT_MS
      }, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`Following redirect to ${response.headers.location}`);
          fetchUrl(response.headers.location, maxRetries).then(resolve).catch(reject);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      });
      
      request.on('error', (error) => {
        if (retries < maxRetries) {
          retries++;
          console.log(`Retry ${retries}/${maxRetries} for ${url}`);
          setTimeout(attemptFetch, RETRY_DELAY_MS * retries);
        } else {
          reject(error);
        }
      });
      
      request.on('timeout', () => {
        request.destroy();
        if (retries < maxRetries) {
          retries++;
          console.log(`Timeout retry ${retries}/${maxRetries} for ${url}`);
          setTimeout(attemptFetch, RETRY_DELAY_MS * retries);
        } else {
          reject(new Error('Request timeout'));
        }
      });
    };
    
    attemptFetch();
  });
}

// Parse RSS/Atom feed
async function parseFeed(xmlText) {
  const result = await parseStringPromise(xmlText, {
    trim: true,
    explicitArray: false,
    mergeAttrs: true
  });
  
  // Check if it's RSS or Atom
  if (result.rss) {
    return parseRSSFeed(result.rss);
  } else if (result.feed) {
    return parseAtomFeed(result.feed);
  } else {
    throw new Error('Unknown feed format');
  }
}

function parseRSSFeed(rss) {
  const channel = rss.channel;
  const items = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
  
  return {
    title: channel.title || '',
    description: channel.description || '',
    link: channel.link || '',
    items: items.slice(0, MAX_ARTICLES_PER_FEED).map(item => ({
      title: item.title || '',
      link: item.link || '',
      guid: item.guid?._ || item.guid || item.link || '',
      pubDate: item.pubDate || new Date().toISOString(),
      description: item.description || '',
      content: item['content:encoded'] || item.description || '',
      thumbnail: extractThumbnail(item)
    }))
  };
}

function parseAtomFeed(feed) {
  const entries = Array.isArray(feed.entry) ? feed.entry : (feed.entry ? [feed.entry] : []);
  
  return {
    title: feed.title?._ || feed.title || '',
    description: feed.subtitle?._ || feed.subtitle || '',
    link: Array.isArray(feed.link) ? 
      (feed.link.find(l => l.rel === 'alternate')?.href || feed.link[0]?.href || '') :
      (feed.link?.href || ''),
    items: entries.slice(0, MAX_ARTICLES_PER_FEED).map(entry => {
      const link = Array.isArray(entry.link) ? 
        (entry.link.find(l => l.rel === 'alternate')?.href || entry.link[0]?.href || '') :
        (entry.link?.href || '');
      
      return {
        title: entry.title?._ || entry.title || '',
        link: link,
        guid: entry.id || link,
        pubDate: entry.updated || entry.published || new Date().toISOString(),
        description: entry.summary?._ || entry.summary || '',
        content: entry.content?._ || entry.content || entry.summary?._ || entry.summary || '',
        thumbnail: extractThumbnail(entry)
      };
    })
  };
}

function extractThumbnail(item) {
  // Try media:thumbnail
  if (item['media:thumbnail']?.url) {
    return item['media:thumbnail'].url;
  }
  
  // Try enclosure
  if (item.enclosure?.url && item.enclosure?.type?.startsWith('image')) {
    return item.enclosure.url;
  }
  
  // Try to extract from description/content
  const content = item['content:encoded'] || item.description || item.content?._ || item.content || '';
  if (typeof content === 'string') {
    const imgMatch = content.match(/<img[^>]+src=["']([^"'>]+)["']/i);
    if (imgMatch) {
      return imgMatch[1];
    }
  }
  
  return null;
}

// Fetch and save a feed
async function fetchAndSaveFeed(feedConfig) {
  console.log(`Fetching ${feedConfig.url}...`);
  
  try {
    const xmlText = await fetchUrl(feedConfig.url);
    const feedData = await parseFeed(xmlText);
    
    const output = {
      ...feedData,
      group: feedConfig.group,
      url: feedConfig.url,
      lastFetched: new Date().toISOString()
    };
    
    const outputPath = path.join(feedsDir, feedConfig.filename);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    
    console.log(`✓ Saved ${feedConfig.filename} (${output.items.length} articles)`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to fetch ${feedConfig.url}:`, error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('Starting RSS feed fetch...');
  console.log(`Fetching ${DEFAULT_FEEDS.length} feeds\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const feedConfig of DEFAULT_FEEDS) {
    const success = await fetchAndSaveFeed(feedConfig);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    // Add delay between requests to be respectful
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
  }
  
  console.log(`\nCompleted: ${successCount} succeeded, ${failCount} failed`);
  
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
