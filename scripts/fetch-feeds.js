const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');
const { JSDOM } = require('jsdom');

// Configuration constants
const MAX_ARTICLES_PER_FEED = 50;  // Matches the limit in app.js
const MAX_ARTICLES_WITH_FULL_CONTENT = 10;  // Limit full content fetching to first N articles
const ENABLE_FULL_CONTENT_FETCH = true;  // Toggle full content fetching
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const REQUEST_DELAY_MS = 1000;  // Delay between feed requests
const FULL_CONTENT_DELAY_MS = 1500;  // Delay between full content requests
const MIN_CONTENT_LENGTH = 200;  // Minimum characters for valid content (filters out nav/menu fragments)
const MAX_LINK_DENSITY = 0.5;  // Maximum ratio of link text to total text (0.5 = 50% links allowed)

// Default feeds configuration - matches app.js
const DEFAULT_FEEDS = [
  // Country group
  {
    url: 'https://redlib.perennialte.ch/r/indonesia.rss',
    group: 'country',
    filename: 'country-reddit-indonesia.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/askSingapore.rss',
    group: 'country',
    filename: 'country-reddit-asksingapore.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/finansial.rss',
    group: 'country',
    filename: 'country-reddit-finansial.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/indonesiabebas.rss',
    group: 'country',
    filename: 'country-reddit-indonesiabebas.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/jualbeliindonesia.rss',
    group: 'country',
    filename: 'country-reddit-jualbeliindonesia.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/indotech.rss',
    group: 'country',
    filename: 'country-reddit-indotech.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/judisaham.rss',
    group: 'country',
    filename: 'country-reddit-judisaham.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/Perempuan.rss',
    group: 'country',
    filename: 'country-reddit-perempuan.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/pria.rss',
    group: 'country',
    filename: 'country-reddit-pria.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/Jakarta.rss',
    group: 'country',
    filename: 'country-reddit-jakarta.json'
  },
  {
    url: 'https://mothership.sg/feed/',
    group: 'country',
    filename: 'country-mothership-sg.json'
  },
  {
    url: 'https://www.jagatreview.com/feed/',
    group: 'country',
    filename: 'country-jagat-review.json'
  },
  // Finance group
  {
    url: 'https://redlib.perennialte.ch/r/business.rss',
    group: 'finance',
    filename: 'finance-reddit-business.json'
  },
  // Others group
  {
    url: 'https://redlib.perennialte.ch/r/foss.rss',
    group: 'others',
    filename: 'others-reddit-foss.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/fossdroid.rss',
    group: 'others',
    filename: 'others-reddit-fossdroid.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/FREE.rss',
    group: 'others',
    filename: 'others-reddit-free.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/freesoftware.rss',
    group: 'others',
    filename: 'others-reddit-freesoftware.json'
  },
  {
    url: 'https://www.sciencenews.org/feed',
    group: 'others',
    filename: 'others-sciencenews.json'
  },
  // Tech group
  {
    url: 'https://redlib.perennialte.ch/r/gadgets.rss',
    group: 'tech',
    filename: 'tech-reddit-gadgets.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/MicrosoftEdge.rss',
    group: 'tech',
    filename: 'tech-reddit-microsoftedge.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/browsers.rss',
    group: 'tech',
    filename: 'tech-reddit-browsers.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/software.rss',
    group: 'tech',
    filename: 'tech-reddit-software.json'
  },
  {
    url: 'https://redlib.perennialte.ch/r/technews.rss',
    group: 'tech',
    filename: 'tech-reddit-technews.json'
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

// =============================================================================
// Full Content Extraction
// =============================================================================

// Extract main content from HTML using JSDOM
// Extract main content from HTML using JSDOM
function extractMainContent(html) {
  if (!html) return null;

  try {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // **NEW: Special handling for Redlib content**
    // Look for the specific div with class "md" that contains the actual article
    const redlibContent = doc.querySelector('.md');
    if (redlibContent) {
      console.log('  ✓ Found Redlib content (.md class)');
      
      // Remove unwanted elements from Redlib content
      const unwantedSelectors = [
        'script', 'style', '.advertisement', '.ads'
      ];
      
      unwantedSelectors.forEach(selector => {
        try {
          redlibContent.querySelectorAll(selector).forEach(el => el.remove());
        } catch (e) {
          console.error(`  Warning: Failed to remove elements with selector '${selector}': ${e.message}`);
        }
      });

      const textLength = redlibContent.textContent.trim().length;
      if (textLength > MIN_CONTENT_LENGTH) {
        return {
          content: redlibContent.innerHTML,
          textLength: textLength,
          title: extractTitleFromDoc(doc),
          images: extractImages(redlibContent)
        };
      }
    }

    // Remove unwanted elements
    const unwantedSelectors = [
      'script', 'style', 'nav', 'header', 'footer', 'aside',
      '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
      '.advertisement', '.ads', '.sidebar', '.menu', '.nav',
      '.social', '.share', '.comments', '.related', '.footer',
      '#sidebar', '#nav', '#header', '#footer', '#comments',
      '.cookie-banner', '.newsletter', '.popup', '.modal',
      // **NEW: Add Redlib-specific unwanted elements**
      '#nbc_intro', '#nbc_topb', '#nbc_skys', '#nbc_leftb',
      '#nbc_breadcrumb', '.tx-nbc2fe-incontent-column',
      '.tx-nbc2fe-intro', '#nbc_forum_comments', '.prev_next_news',
      '.journalist_bottom', '.socialarea', '#nbc_belowcontent'
    ];

    unwantedSelectors.forEach(selector => {
      try {
        doc.querySelectorAll(selector).forEach(el => el.remove());
      } catch (e) {
        console.error(`  Warning: Failed to remove elements with selector '${selector}': ${e.message}`);
      }
    });

    // Find main content candidates
    const candidates = [];

    // Look for common article containers
    const articleSelectors = [
      '.md',  // **NEW: Add Redlib's markdown content class first**
      'article',
      '[role="main"]',
      'main',
      '.article',
      '.post',
      '.content',
      '.entry-content',
      '.post-content',
      '.article-content',
      '#content',
      '#article',
      '#main',
      // **NEW: Add other common content selectors**
      '.bodytext',
      '.post-body',
      '.article-body'
    ];

    for (const selector of articleSelectors) {
      try {
        const elements = doc.querySelectorAll(selector);
        elements.forEach(el => {
          const text = el.textContent || '';
          const textLength = text.trim().length;
          const linkDensity = calculateLinkDensity(el);
          
          // Score based on text length and link density
          if (textLength > MIN_CONTENT_LENGTH && linkDensity < MAX_LINK_DENSITY) {
            candidates.push({
              element: el,
              score: textLength * (1 - linkDensity),
              selector: selector
            });
          }
        });
      } catch (e) {
        console.error(`  Warning: Failed to query elements with selector '${selector}': ${e.message}`);
      }
    }

    // If no candidates found, try body paragraphs
    if (candidates.length === 0) {
      const paragraphs = doc.querySelectorAll('p');
      const contentDiv = doc.createElement('div');
      
      paragraphs.forEach(p => {
        const text = p.textContent || '';
        if (text.trim().length > 50) {
          contentDiv.appendChild(p.cloneNode(true));
        }
      });

      if (contentDiv.textContent.trim().length > MIN_CONTENT_LENGTH) {
        return {
          content: contentDiv.innerHTML,
          textLength: contentDiv.textContent.trim().length,
          title: extractTitleFromDoc(doc),
          images: extractImages(contentDiv)
        };
      }
      return null;
    }

    // Sort by score and get the best candidate
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    return {
      content: best.element.innerHTML,
      textLength: best.element.textContent.trim().length,
      title: extractTitleFromDoc(doc),
      images: extractImages(best.element)
    };
  } catch (error) {
    console.error('Error extracting content:', error.message);
    return null;
  }
}

function calculateLinkDensity(element) {
  const textLength = (element.textContent || '').length;
  if (textLength === 0) return 1;

  const links = element.querySelectorAll('a');
  let linkLength = 0;
  links.forEach(link => {
    linkLength += (link.textContent || '').length;
  });

  return linkLength / textLength;
}

function extractTitleFromDoc(doc) {
  // Try Open Graph title
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  if (ogTitle) return ogTitle.getAttribute('content');

  // Try Twitter title
  const twitterTitle = doc.querySelector('meta[name="twitter:title"]');
  if (twitterTitle) return twitterTitle.getAttribute('content');

  // Try page title
  const title = doc.querySelector('title');
  if (title) return title.textContent;

  // Try h1
  const h1 = doc.querySelector('h1');
  if (h1) return h1.textContent;

  return null;
}

function extractImages(element) {
  const images = [];
  const imgElements = element.querySelectorAll('img');
  
  imgElements.forEach(img => {
    const src = img.getAttribute('src') || img.getAttribute('data-src');
    if (src && !src.startsWith('data:')) {
      images.push(src);
    }
  });

  return images;
}

// Fetch full content for an article
async function fetchFullContent(articleUrl) {
  try {
    console.log(`  Fetching full content from ${articleUrl}`);
    const html = await fetchUrl(articleUrl);
    const extracted = extractMainContent(html);
    
    if (extracted && extracted.textLength > MIN_CONTENT_LENGTH) {
      console.log(`  ✓ Extracted ${extracted.textLength} chars of content`);
      return extracted;
    } else {
      console.log(`  ✗ Content too short or extraction failed`);
      return null;
    }
  } catch (error) {
    console.error(`  ✗ Error fetching full content: ${error.message}`);
    return null;
  }
}

// Fetch and save a feed
async function fetchAndSaveFeed(feedConfig) {
  console.log(`Fetching ${feedConfig.url}...`);
  
  try {
    const xmlText = await fetchUrl(feedConfig.url);
    const feedData = await parseFeed(xmlText);
    
    // Fetch full content for first N articles if enabled
    if (ENABLE_FULL_CONTENT_FETCH) {
      const articlesToFetch = Math.min(feedData.items.length, MAX_ARTICLES_WITH_FULL_CONTENT);
      console.log(`Fetching full content for ${articlesToFetch} of ${feedData.items.length} articles...`);
      
      for (let i = 0; i < articlesToFetch; i++) {
        const item = feedData.items[i];
        
        if (item.link) {
          try {
            const fullContent = await fetchFullContent(item.link);
            if (fullContent) {
              item.fullContent = fullContent;
            }
            
            // Add delay between requests to be respectful
            if (i < articlesToFetch - 1) {
              await new Promise(resolve => setTimeout(resolve, FULL_CONTENT_DELAY_MS));
            }
          } catch (error) {
            console.error(`  Error fetching content for ${item.link}: ${error.message}`);
            // Continue with next article
          }
        }
      }
    }
    
    const output = {
      ...feedData,
      group: feedConfig.group,
      url: feedConfig.url,
      lastFetched: new Date().toISOString()
    };
    
    const outputPath = path.join(feedsDir, feedConfig.filename);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    
    const articlesWithContent = output.items.filter(item => item.fullContent).length;
    console.log(`✓ Saved ${feedConfig.filename} (${output.items.length} articles, ${articlesWithContent} with full content)`);
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
  
  // Don't fail the workflow if some feeds fail - just log it
  // This ensures the workflow continues even with partial failures
  if (failCount > 0) {
    console.log(`Warning: ${failCount} feed(s) failed to fetch but continuing...`);
  }
  
  // Only exit with error if ALL feeds failed
  if (successCount === 0) {
    console.error('Error: All feeds failed to fetch');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
