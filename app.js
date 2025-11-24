// RSS Web Reader - Main Application
// Vanilla JavaScript SPA with IndexedDB storage

// =============================================================================
// IndexedDB Setup
// =============================================================================

const DB_NAME = 'RSSReaderDB';
const DB_VERSION = 2; // Incremented for full content cache
let db = null;

// Initialize IndexedDB
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object stores
      if (!db.objectStoreNames.contains('feeds')) {
        const feedStore = db.createObjectStore('feeds', { keyPath: 'id', autoIncrement: true });
        feedStore.createIndex('url', 'url', { unique: true });
        feedStore.createIndex('group', 'group', { unique: false });
      }

      if (!db.objectStoreNames.contains('articles')) {
        const articleStore = db.createObjectStore('articles', { keyPath: 'id', autoIncrement: true });
        articleStore.createIndex('feedId', 'feedId', { unique: false });
        articleStore.createIndex('guid', 'guid', { unique: true });
        articleStore.createIndex('pubDate', 'pubDate', { unique: false });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('readStatus')) {
        const readStore = db.createObjectStore('readStatus', { keyPath: 'articleId' });
        readStore.createIndex('feedId', 'feedId', { unique: false });
      }

      // Store for cached full content
      if (!db.objectStoreNames.contains('fullContent')) {
        const fullContentStore = db.createObjectStore('fullContent', { keyPath: 'articleId' });
        fullContentStore.createIndex('fetchedAt', 'fetchedAt', { unique: false });
      }
    };
  });
}

// Generic DB operations
async function dbGet(storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(storeName, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function dbGetByIndex(storeName, indexName, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// =============================================================================
// Application State
// =============================================================================

let appState = {
  feeds: [],
  articles: [],
  readStatus: new Set(),
  settings: {
    amoledMode: true,
    hideRead: false,
    fetchFullContent: false // New setting for full content fetching
  },
  selectedFeedId: null,
  selectedArticleId: null,
  currentGroup: null,
  groupStates: {}, // Track expanded/collapsed state of groups
  isSidebarCollapsed: false
};

// =============================================================================
// Default Feeds Configuration
// =============================================================================

const DEFAULT_FEEDS = [
  {
    url: 'https://redlib.perennialte.ch/r/gadgets.rss',
    group: 'tech',
    title: 'Reddit - Gadgets',
    description: 'Tech gadgets news from Reddit'
  },
  {
    url: 'https://www.jagatreview.com/feed/',
    group: 'country',
    title: 'Jagat Review',
    description: 'Indonesian tech news'
  },
  {
    url: 'https://www.rssrssrssrss.com/api/merge?feeds=NoIgFgLhAODOBcB6R0A2BLAdgawHQENMBPAMwFMyATMgJ1wGMB7AW0QnWbJABpwo4kKDDgLFyVWgxaIARjPqyArrCxlYsEAF0gA',
    group: 'news',
    title: 'Merged News Feeds',
    description: 'Multiple news sources merged'
  }
];

const GROUPS = ['country', 'finance', 'news', 'others', 'tech']; // Alphabetical order

// Mapping of feed URLs to pre-fetched JSON filenames
const PREFETCHED_FEEDS = {
  'https://redlib.perennialte.ch/r/gadgets.rss': 'feeds/tech-reddit-gadgets.json',
  'https://www.jagatreview.com/feed/': 'feeds/country-jagat-review.json',
  'https://www.rssrssrssrss.com/api/merge?feeds=NoIgFgLhAODOBcB6R0A2BLAdgawHQENMBPAMwFMyATMgJ1wGMB7AW0QnWbJABpwo4kKDDgLFyVWgxaIARjPqyArrCxlYsEAF0gA': 'feeds/news-merged.json'
};

// =============================================================================
// RSS Fetching
// =============================================================================

// Try to load pre-fetched feed from JSON, fall back to live fetching
async function fetchFeed(url) {
  // Strategy 0: Try pre-fetched JSON file first
  if (PREFETCHED_FEEDS[url]) {
    try {
      const response = await fetch(PREFETCHED_FEEDS[url]);
      if (response.ok) {
        const data = await response.json();
        console.log(`Loaded pre-fetched feed from ${PREFETCHED_FEEDS[url]}`);
        return data;
      }
    } catch (error) {
      console.log('Pre-fetched feed not available, falling back to live fetch:', error);
    }
  }
  // Strategy 1: Try CORS proxy
  try {
    const corsProxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(corsProxyUrl);

    if (response.ok) {
      const text = await response.text();
      return parseFeed(text, url);
    }
  } catch (error) {
    console.error('CORS proxy failed, trying direct fetch:', error);
  }

  // Strategy 2: Try direct fetch
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });

    if (response.ok) {
      const text = await response.text();
      return parseFeed(text, url);
    }
  } catch (error) {
    console.error('Direct fetch failed, trying RSS2JSON:', error);
  }

  // Strategy 3: Fallback to RSS2JSON (without api_key parameter)
  try {
    const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=50`;
    const response = await fetch(rss2jsonUrl);
    
    if (!response.ok) {
      throw new Error(`RSS2JSON API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status !== 'ok') {
      throw new Error(data.message || 'RSS2JSON parsing failed');
    }

    return {
      title: data.feed.title,
      description: data.feed.description,
      link: data.feed.link,
      items: data.items.map(item => ({
        title: item.title,
        link: item.link,
        guid: item.guid || item.link,
        pubDate: item.pubDate,
        description: item.description,
        content: item.content || item.description,
        thumbnail: item.thumbnail || extractThumbnail(item.description || item.content)
      }))
    };
  } catch (error) {
    console.error('All fetch strategies failed:', error);
    throw new Error(`Failed to fetch feed: ${error.message}`);
  }
}

// Parse RSS/Atom feed
function parseFeed(xmlText, feedUrl) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  // Check for parser errors
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('XML parsing error');
  }

  // Determine feed type
  const isAtom = xmlDoc.querySelector('feed');
  const isRSS = xmlDoc.querySelector('rss');

  if (isAtom) {
    return parseAtomFeed(xmlDoc);
  } else if (isRSS) {
    return parseRSSFeed(xmlDoc);
  } else {
    throw new Error('Unknown feed format');
  }
}

function parseRSSFeed(xmlDoc) {
  const channel = xmlDoc.querySelector('channel');
  const items = Array.from(xmlDoc.querySelectorAll('item'));

  return {
    title: getElementText(channel, 'title'),
    description: getElementText(channel, 'description'),
    link: getElementText(channel, 'link'),
    items: items.map(item => ({
      title: getElementText(item, 'title'),
      link: getElementText(item, 'link'),
      guid: getElementText(item, 'guid') || getElementText(item, 'link'),
      pubDate: getElementText(item, 'pubDate'),
      description: getElementText(item, 'description'),
      content: getElementTextNS(item, 'encoded', 'http://purl.org/rss/1.0/modules/content/') || getElementText(item, 'description'),
      thumbnail: extractThumbnailFromItem(item)
    }))
  };
}

function parseAtomFeed(xmlDoc) {
  const feed = xmlDoc.querySelector('feed');
  const entries = Array.from(xmlDoc.querySelectorAll('entry'));

  return {
    title: getElementText(feed, 'title'),
    description: getElementText(feed, 'subtitle'),
    link: feed.querySelector('link[rel="alternate"]')?.getAttribute('href') || '',
    items: entries.map(entry => {
      const link = entry.querySelector('link[rel="alternate"]')?.getAttribute('href') || '';
      return {
        title: getElementText(entry, 'title'),
        link: link,
        guid: getElementText(entry, 'id') || link,
        pubDate: getElementText(entry, 'updated') || getElementText(entry, 'published'),
        description: getElementText(entry, 'summary'),
        content: getElementText(entry, 'content') || getElementText(entry, 'summary'),
        thumbnail: extractThumbnailFromItem(entry)
      };
    })
  };
}

function getElementText(parent, tagName) {
  const element = parent.querySelector(tagName);
  return element ? element.textContent.trim() : '';
}

function getElementTextNS(parent, localName, namespaceURI) {
  const element = parent.getElementsByTagNameNS(namespaceURI, localName)[0];
  return element ? element.textContent.trim() : '';
}

function extractThumbnailFromItem(item) {
  // Try media:thumbnail
  const mediaThumbnail = item.querySelector('thumbnail');
  if (mediaThumbnail) {
    return mediaThumbnail.getAttribute('url');
  }

  // Try enclosure
  const enclosure = item.querySelector('enclosure[type^="image"]');
  if (enclosure) {
    return enclosure.getAttribute('url');
  }

  // Try to extract from content
  const content = getElementText(item, 'description') || getElementTextNS(item, 'encoded', 'http://purl.org/rss/1.0/modules/content/');
  return extractThumbnail(content);
}

function extractThumbnail(html) {
  if (!html) return null;
  const imgMatch = html.match(/<img[^>]+src="([^">]+)"/);
  return imgMatch ? imgMatch[1] : null;
}

// =============================================================================
// Feed Management
// =============================================================================

async function addFeed(url, group = 'others') {
  try {
    // Check if feed already exists
    const existingFeeds = await dbGetAll('feeds');
    if (existingFeeds.some(f => f.url === url)) {
      throw new Error('Feed already exists');
    }

    // Fetch and parse feed
    const feedData = await fetchFeed(url);

    // Save feed to DB
    const feed = {
      url: url,
      group: group,
      title: feedData.title,
      description: feedData.description,
      link: feedData.link,
      lastFetched: Date.now()
    };

    const feedId = await dbPut('feeds', feed);
    feed.id = feedId;

    // Save articles
    await saveFeedArticles(feedId, feedData.items);

    // Update app state
    appState.feeds.push(feed);

    return feed;
  } catch (error) {
    console.error('Error adding feed:', error);
    throw error;
  }
}

async function deleteFeed(feedId) {
  try {
    // Delete feed
    await dbDelete('feeds', feedId);

    // Delete associated articles
    const articles = await dbGetByIndex('articles', 'feedId', feedId);
    for (const article of articles) {
      await dbDelete('articles', article.id);
      await dbDelete('readStatus', article.id);
    }

    // Update app state
    appState.feeds = appState.feeds.filter(f => f.id !== feedId);
    appState.articles = appState.articles.filter(a => a.feedId !== feedId);
  } catch (error) {
    console.error('Error deleting feed:', error);
    throw error;
  }
}

async function refreshFeed(feedId) {
  try {
    const feed = appState.feeds.find(f => f.id === feedId);
    if (!feed) return;

    const feedData = await fetchFeed(feed.url);

    // Update feed metadata
    feed.title = feedData.title;
    feed.description = feedData.description;
    feed.link = feedData.link;
    feed.lastFetched = Date.now();
    await dbPut('feeds', feed);

    // Save new articles
    await saveFeedArticles(feedId, feedData.items);
  } catch (error) {
    console.error('Error refreshing feed:', error);
    throw error;
  }
}

async function refreshAllFeeds() {
  try {
    for (const feed of appState.feeds) {
      try {
        await refreshFeed(feed.id);
      } catch (error) {
        console.error(`Failed to refresh feed ${feed.title}:`, error);
      }
    }
  } catch (error) {
    console.error('Error refreshing all feeds:', error);
  }
}

async function saveFeedArticles(feedId, items) {
  const existingArticles = await dbGetByIndex('articles', 'feedId', feedId);
  const existingGuids = new Set(existingArticles.map(a => a.guid));

  // Add new articles
  for (const item of items) {
    if (!existingGuids.has(item.guid)) {
      const article = {
        feedId: feedId,
        guid: item.guid,
        title: item.title,
        link: item.link,
        pubDate: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
        description: item.description,
        content: item.content,
        thumbnail: item.thumbnail
      };

      try {
        const articleId = await dbPut('articles', article);
        article.id = articleId;
        appState.articles.push(article);
      } catch (error) {
        // Skip duplicates
        if (error.name !== 'ConstraintError') {
          console.error('Error saving article:', error);
        }
      }
    }
  }

  // Enforce 50 unread article limit per feed
  await enforceArticleLimit(feedId);
}

async function enforceArticleLimit(feedId) {
  const articles = await dbGetByIndex('articles', 'feedId', feedId);
  const readStatusSet = new Set(appState.readStatus);

  // Get unread articles sorted by date
  const unreadArticles = articles
    .filter(a => !readStatusSet.has(a.id))
    .sort((a, b) => b.pubDate - a.pubDate);

  // Delete excess unread articles
  if (unreadArticles.length > 50) {
    const toDelete = unreadArticles.slice(50);
    for (const article of toDelete) {
      await dbDelete('articles', article.id);
      appState.articles = appState.articles.filter(a => a.id !== article.id);
    }
  }
}

// =============================================================================
// Read Status Management
// =============================================================================

async function markAsRead(articleId) {
  if (!appState.readStatus.has(articleId)) {
    appState.readStatus.add(articleId);
    const article = appState.articles.find(a => a.id === articleId);
    if (article) {
      await dbPut('readStatus', {
        articleId: articleId,
        feedId: article.feedId,
        timestamp: Date.now()
      });
    }
  }
}

async function loadReadStatus() {
  const readItems = await dbGetAll('readStatus');
  appState.readStatus = new Set(readItems.map(r => r.articleId));
}

// =============================================================================
// Settings Management
// =============================================================================

async function loadSettings() {
  const amoledSetting = await dbGet('settings', 'amoledMode');
  const hideReadSetting = await dbGet('settings', 'hideRead');
  const fetchFullContentSetting = await dbGet('settings', 'fetchFullContent');

  appState.settings.amoledMode = amoledSetting ? amoledSetting.value : true;
  appState.settings.hideRead = hideReadSetting ? hideReadSetting.value : false;
  appState.settings.fetchFullContent = fetchFullContentSetting ? fetchFullContentSetting.value : false;
}

async function saveSetting(key, value) {
  await dbPut('settings', { key, value });
  appState.settings[key] = value;
}

// =============================================================================
// OPML Import/Export
// =============================================================================

async function exportOPML() {
  const feeds = await dbGetAll('feeds');
  
  let opml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  opml += '<opml version="2.0">\n';
  opml += '  <head>\n';
  opml += '    <title>RSS Web Reader Subscriptions</title>\n';
  opml += `    <dateCreated>${new Date().toUTCString()}</dateCreated>\n`;
  opml += '  </head>\n';
  opml += '  <body>\n';

  // Group feeds by group
  const groupedFeeds = {};
  for (const feed of feeds) {
    if (!groupedFeeds[feed.group]) {
      groupedFeeds[feed.group] = [];
    }
    groupedFeeds[feed.group].push(feed);
  }

  // Write feeds by group
  for (const group of GROUPS) {
    if (groupedFeeds[group] && groupedFeeds[group].length > 0) {
      opml += `    <outline text="${group}" title="${group}">\n`;
      for (const feed of groupedFeeds[group]) {
        opml += `      <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}" htmlUrl="${escapeXml(feed.link || '')}" />\n`;
      }
      opml += '    </outline>\n';
    }
  }

  opml += '  </body>\n';
  opml += '</opml>';

  return opml;
}

async function importOPML(opmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(opmlText, 'text/xml');

  const outlines = xmlDoc.querySelectorAll('outline[type="rss"], outline[xmlUrl]');
  const feedsToAdd = [];

  for (const outline of outlines) {
    const url = outline.getAttribute('xmlUrl');
    if (!url) continue;

    // Try to determine group from parent
    let group = 'others';
    const parent = outline.parentElement;
    if (parent && parent.tagName === 'outline') {
      const parentText = parent.getAttribute('text') || parent.getAttribute('title');
      if (parentText && GROUPS.includes(parentText.toLowerCase())) {
        group = parentText.toLowerCase();
      }
    }

    feedsToAdd.push({ url, group });
  }

  // Add feeds
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const { url, group } of feedsToAdd) {
    try {
      await addFeed(url, group);
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push(`${url}: ${error.message}`);
    }
  }

  return results;
}

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// =============================================================================
// Content Sanitization
// =============================================================================

function sanitizeHTML(html) {
  if (!html) return '';

  // First, normalize incomplete tags to prevent injection
  // Replace any incomplete opening tags at the end
  html = html.replace(/<[^>]*$/, '');
  
  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Remove dangerous elements
  const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'style', 'base'];
  dangerousTags.forEach(tag => {
    const elements = temp.querySelectorAll(tag);
    elements.forEach(el => el.remove());
  });

  // Remove dangerous attributes
  const allElements = temp.querySelectorAll('*');
  allElements.forEach(el => {
    const attributes = Array.from(el.attributes);
    attributes.forEach(attr => {
      // Remove event handlers
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
      // Remove dangerous URL schemes (case-insensitive)
      if (attr.name === 'href' || attr.name === 'src') {
        const lowerValue = attr.value.toLowerCase().trim();
        // Block javascript: and vbscript: completely
        if (lowerValue.startsWith('javascript:') || lowerValue.startsWith('vbscript:')) {
          el.removeAttribute(attr.name);
        }
        // For data: URLs, only allow safe image types
        if (lowerValue.startsWith('data:')) {
          if (!lowerValue.startsWith('data:image/')) {
            el.removeAttribute(attr.name);
          }
        }
      }
    });
  });

  return temp.innerHTML;
}

// =============================================================================
// Full Content Extraction
// =============================================================================

// Rate limiting for content fetching
const contentFetchQueue = [];
let isFetchingContent = false;
const FETCH_DELAY_MS = 1000; // 1 second between requests
const FETCH_TIMEOUT_MS = 10000; // 10 second timeout

// Content extraction thresholds
const MIN_CONTENT_LENGTH = 200; // Minimum characters for valid content
const MAX_LINK_DENSITY = 0.5; // Maximum ratio of link text to total text

// Simple readability-style content extraction
function extractMainContent(html, url) {
  if (!html) return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove unwanted elements
  const unwantedSelectors = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
    '.advertisement', '.ads', '.sidebar', '.menu', '.nav',
    '.social', '.share', '.comments', '.related', '.footer',
    '#sidebar', '#nav', '#header', '#footer', '#comments',
    '.cookie-banner', '.newsletter', '.popup', '.modal'
  ];

  unwantedSelectors.forEach(selector => {
    try {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    } catch (e) {
      // Ignore selector errors
    }
  });

  // Find main content candidates
  const candidates = [];

  // Look for common article containers
  const articleSelectors = [
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
    '#main'
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
      // Ignore selector errors
    }
  }

  // If no candidates found, try body paragraphs
  if (candidates.length === 0) {
    const paragraphs = doc.querySelectorAll('p');
    let contentDiv = doc.createElement('div');
    
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

// Fetch full content with timeout
async function fetchWithTimeout(url, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html'
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Fetch and extract full content for an article
async function fetchFullContent(articleUrl) {
  try {
    // Use CORS proxy
    const corsProxyUrl = `https://corsproxy.io/?${encodeURIComponent(articleUrl)}`;
    
    const response = await fetchWithTimeout(corsProxyUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const html = await response.text();
    const extracted = extractMainContent(html, articleUrl);

    return extracted;
  } catch (error) {
    console.error('Error fetching full content:', error);
    return null;
  }
}

// Process fetch queue with rate limiting
async function processFetchQueue() {
  if (isFetchingContent || contentFetchQueue.length === 0) {
    return;
  }

  isFetchingContent = true;

  while (contentFetchQueue.length > 0) {
    const { articleId, articleUrl, resolve } = contentFetchQueue.shift();

    try {
      // Check cache first
      const cached = await dbGet('fullContent', articleId);
      if (cached) {
        resolve(cached);
      } else {
        const extracted = await fetchFullContent(articleUrl);
        
        if (extracted) {
          const fullContent = {
            articleId: articleId,
            content: extracted.content,
            textLength: extracted.textLength,
            title: extracted.title,
            images: extracted.images,
            fetchedAt: Date.now()
          };

          // Cache in IndexedDB
          await dbPut('fullContent', fullContent);
          resolve(fullContent);
        } else {
          resolve(null);
        }
      }
    } catch (error) {
      console.error('Error processing full content fetch:', error);
      resolve(null);
    }

    // Rate limiting delay
    if (contentFetchQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, FETCH_DELAY_MS));
    }
  }

  isFetchingContent = false;
}

// Queue a full content fetch
function queueFullContentFetch(articleId, articleUrl) {
  return new Promise((resolve) => {
    contentFetchQueue.push({ articleId, articleUrl, resolve });
    processFetchQueue();
  });
}

// Get full content (from cache or fetch)
async function getFullContent(articleId, articleUrl) {
  // Check cache first
  const cached = await dbGet('fullContent', articleId);
  if (cached) {
    return cached;
  }

  // Queue fetch if setting is enabled
  if (appState.settings.fetchFullContent) {
    return await queueFullContentFetch(articleId, articleUrl);
  }

  return null;
}

// =============================================================================
// UI Rendering
// =============================================================================

function renderGroups() {
  const container = document.getElementById('groups-container');
  container.innerHTML = '';

  for (const groupName of GROUPS) {
    const groupFeeds = appState.feeds.filter(f => f.group === groupName);
    if (groupFeeds.length === 0) continue;

    const isExpanded = appState.groupStates[groupName] !== false; // Default expanded

    const groupDiv = document.createElement('div');
    groupDiv.className = 'group';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';
    groupHeader.onclick = () => toggleGroup(groupName);

    const groupTitle = document.createElement('div');
    groupTitle.className = 'group-title';

    const groupNameEl = document.createElement('h3');
    groupNameEl.textContent = groupName;
    groupTitle.appendChild(groupNameEl);

    const unreadCount = getGroupUnreadCount(groupName);
    const unreadBadge = document.createElement('span');
    unreadBadge.className = `group-unread-count${unreadCount > 0 ? ' has-unread' : ''}`;
    unreadBadge.textContent = unreadCount;
    groupTitle.appendChild(unreadBadge);

    groupHeader.appendChild(groupTitle);

    const collapseIcon = document.createElement('span');
    collapseIcon.className = `collapse-icon${isExpanded ? ' expanded' : ''}`;
    collapseIcon.textContent = '▶';
    groupHeader.appendChild(collapseIcon);

    groupDiv.appendChild(groupHeader);

    const feedList = document.createElement('div');
    feedList.className = `feed-list${isExpanded ? ' expanded' : ''}`;

    for (const feed of groupFeeds) {
      const feedItem = document.createElement('div');
      feedItem.className = 'feed-item';
      if (appState.selectedFeedId === feed.id) {
        feedItem.classList.add('active');
      }
      feedItem.onclick = () => selectFeed(feed.id);

      const feedName = document.createElement('span');
      feedName.className = 'feed-name';
      feedName.textContent = feed.title || feed.url;
      feedItem.appendChild(feedName);

      const feedUnreadCount = getFeedUnreadCount(feed.id);
      const feedUnreadBadge = document.createElement('span');
      feedUnreadBadge.className = `feed-unread-count${feedUnreadCount > 0 ? ' has-unread' : ''}`;
      feedUnreadBadge.textContent = feedUnreadCount;
      feedItem.appendChild(feedUnreadBadge);

      feedList.appendChild(feedItem);
    }

    groupDiv.appendChild(feedList);
    container.appendChild(groupDiv);
  }
}

function toggleGroup(groupName) {
  appState.groupStates[groupName] = !appState.groupStates[groupName];
  renderGroups();
}

function getGroupUnreadCount(groupName) {
  const groupFeeds = appState.feeds.filter(f => f.group === groupName);
  let count = 0;
  for (const feed of groupFeeds) {
    count += getFeedUnreadCount(feed.id);
  }
  return count;
}

function getFeedUnreadCount(feedId) {
  const articles = appState.articles.filter(a => a.feedId === feedId);
  return articles.filter(a => !appState.readStatus.has(a.id)).length;
}

function updateFeedUnreadCounts() {
  // Simply re-render groups to update counts
  // This is more reliable than trying to update individual elements
  renderGroups();
}

function renderArticles(feedId = null) {
  const container = document.getElementById('article-list-content');
  container.innerHTML = '';

  let articles = feedId 
    ? appState.articles.filter(a => a.feedId === feedId)
    : appState.articles;

  // Filter by hide read setting
  if (appState.settings.hideRead) {
    articles = articles.filter(a => !appState.readStatus.has(a.id));
  }

  // Sort by date
  articles.sort((a, b) => b.pubDate - a.pubDate);

  if (articles.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No articles to display</div>';
    return;
  }

  for (const article of articles) {
    const articleItem = document.createElement('div');
    articleItem.className = 'article-item';
    
    if (!appState.readStatus.has(article.id)) {
      articleItem.classList.add('unread');
    }

    if (appState.selectedArticleId === article.id) {
      articleItem.classList.add('active');
    }

    articleItem.onclick = () => selectArticle(article.id);

    const title = document.createElement('div');
    title.className = 'article-title';
    title.textContent = article.title;
    articleItem.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'article-meta';

    const feed = appState.feeds.find(f => f.id === article.feedId);
    const source = document.createElement('span');
    source.className = 'article-source';
    source.textContent = feed ? feed.title : 'Unknown';
    meta.appendChild(source);

    meta.appendChild(document.createTextNode(' • '));

    const timestamp = document.createElement('span');
    timestamp.textContent = getRelativeTime(article.pubDate);
    meta.appendChild(timestamp);

    articleItem.appendChild(meta);

    if (article.description) {
      const excerpt = document.createElement('div');
      excerpt.className = 'article-excerpt';
      // Use textContent extraction from DOM to safely strip HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = article.description;
      const plainText = tempDiv.textContent || tempDiv.innerText || '';
      excerpt.textContent = plainText;
      articleItem.appendChild(excerpt);
    }

    container.appendChild(articleItem);
  }
}

async function renderArticleContent(articleId) {
  const article = appState.articles.find(a => a.id === articleId);
  if (!article) return;

  const feed = appState.feeds.find(f => f.id === article.feedId);

  // Hide placeholder, show content
  document.getElementById('content-placeholder').style.display = 'none';
  document.getElementById('article-content-wrapper').classList.add('visible');

  // Set header
  document.getElementById('article-header-title').textContent = article.title;
  document.getElementById('article-header-source').textContent = feed ? feed.title : 'Unknown';
  document.getElementById('article-header-date').textContent = new Date(article.pubDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Set content - try full content first if enabled
  const contentDiv = document.getElementById('article-body-content');
  
  if (appState.settings.fetchFullContent) {
    // Show loading indicator
    contentDiv.innerHTML = '<div style="padding: 20px; text-align: center;"><span class="loading-spinner"></span> Fetching full content...</div>';
    
    try {
      const fullContent = await getFullContent(article.id, article.link);
      
      if (fullContent && fullContent.content) {
        // Use extracted full content
        contentDiv.innerHTML = sanitizeHTML(fullContent.content);
      } else {
        // Fallback to RSS description
        contentDiv.innerHTML = sanitizeHTML(article.content || article.description);
      }
    } catch (error) {
      console.error('Error loading full content:', error);
      // Fallback to RSS description
      contentDiv.innerHTML = sanitizeHTML(article.content || article.description);
    }
  } else {
    // Use RSS content
    contentDiv.innerHTML = sanitizeHTML(article.content || article.description);
  }

  // Setup lazy loading for images
  setupLazyLoading(contentDiv);

  // Set link
  const link = document.getElementById('article-link');
  link.href = article.link;

  // Show on mobile if needed
  if (window.innerWidth <= 768) {
    document.getElementById('content-viewer').classList.add('mobile-visible');
  }
}

function setupLazyLoading(container) {
  const images = container.querySelectorAll('img');
  
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
        observer.unobserve(img);
      }
    });
  });

  images.forEach(img => {
    if (img.src) {
      img.dataset.src = img.src;
      img.src = '';
    }
    imageObserver.observe(img);
  });
}

function selectFeed(feedId) {
  appState.selectedFeedId = feedId;
  appState.currentGroup = null;
  renderGroups();
  renderArticles(feedId);

  const feed = appState.feeds.find(f => f.id === feedId);
  document.getElementById('article-list-title').textContent = feed ? feed.title : 'Articles';
}

async function selectArticle(articleId) {
  appState.selectedArticleId = articleId;
  await renderArticleContent(articleId);
  
  // Mark as read
  markAsRead(articleId);
  
  // Re-render articles to update unread status
  renderArticles(appState.selectedFeedId);
}

function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

// =============================================================================
// Event Handlers
// =============================================================================

function setupEventListeners() {
  // Hamburger menu
  document.getElementById('hamburger-btn').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    appState.isSidebarCollapsed = !appState.isSidebarCollapsed;
  });

  // Settings toggle
  document.getElementById('settings-toggle').addEventListener('click', () => {
    const content = document.getElementById('settings-content');
    const icon = document.querySelector('#settings-toggle .collapse-icon');
    content.classList.toggle('expanded');
    icon.classList.toggle('expanded');
  });

  // AMOLED mode toggle
  document.getElementById('amoled-toggle').addEventListener('change', (e) => {
    saveSetting('amoledMode', e.target.checked);
    applyTheme();
  });

  // Hide read toggle
  document.getElementById('hide-read-toggle').addEventListener('change', (e) => {
    saveSetting('hideRead', e.target.checked);
    renderArticles(appState.selectedFeedId);
  });

  // Fetch full content toggle
  document.getElementById('fetch-full-content-toggle').addEventListener('change', async (e) => {
    saveSetting('fetchFullContent', e.target.checked);
    // Re-render current article if one is selected
    if (appState.selectedArticleId) {
      await renderArticleContent(appState.selectedArticleId);
    }
  });

  // Add feed button
  document.getElementById('add-feed-btn').addEventListener('click', () => {
    showAddFeedModal();
  });

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    const btn = document.getElementById('refresh-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span>';
    
    try {
      await refreshAllFeeds();
      await loadArticles();
      renderArticles(appState.selectedFeedId);
      renderGroups();
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄';
    }
  });

  // Import OPML button
  document.getElementById('import-opml-btn').addEventListener('click', () => {
    document.getElementById('opml-file-input').click();
  });

  // OPML file input
  document.getElementById('opml-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const results = await importOPML(event.target.result);
        alert(`Import complete!\nSuccess: ${results.success}\nFailed: ${results.failed}`);
        
        await loadFeeds();
        await loadArticles();
        renderGroups();
        renderArticles();
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  });

  // Export OPML button
  document.getElementById('export-opml-btn').addEventListener('click', async () => {
    try {
      const opml = await exportOPML();
      const blob = new Blob([opml], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rss-subscriptions-${Date.now()}.opml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(`Export failed: ${error.message}`);
    }
  });

  // Modal handlers
  document.getElementById('close-add-feed-modal').addEventListener('click', hideAddFeedModal);
  document.getElementById('cancel-add-feed').addEventListener('click', hideAddFeedModal);
  document.getElementById('submit-add-feed').addEventListener('click', handleAddFeed);

  // Article link click handler with capture phase
  document.addEventListener('click', (e) => {
    if (e.target.closest('.article-link')) {
      // Link clicks will open in new tab (handled by HTML target="_blank")
      // Just ensure it happens in background
      e.target.closest('.article-link').rel = 'noopener noreferrer';
    }
  }, true);

  // Page Visibility API - pause when not visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log('Page hidden - pausing activity');
    } else {
      console.log('Page visible - resuming activity');
    }
  });
}

function showAddFeedModal() {
  document.getElementById('add-feed-modal').classList.add('visible');
  document.getElementById('feed-url').value = '';
  document.getElementById('feed-url').focus();
}

function hideAddFeedModal() {
  document.getElementById('add-feed-modal').classList.remove('visible');
}

async function handleAddFeed(e) {
  e.preventDefault();
  
  const url = document.getElementById('feed-url').value.trim();
  const group = document.getElementById('feed-group').value;

  if (!url) {
    alert('Please enter a feed URL');
    return;
  }

  const submitBtn = document.getElementById('submit-add-feed');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';

  try {
    await addFeed(url, group);
    await loadArticles();
    renderGroups();
    renderArticles();
    hideAddFeedModal();
  } catch (error) {
    alert(`Failed to add feed: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Feed';
  }
}

function applyTheme() {
  if (appState.settings.amoledMode) {
    document.documentElement.style.setProperty('--bg-primary', '#000000');
  } else {
    document.documentElement.style.setProperty('--bg-primary', '#121212');
  }
}

// =============================================================================
// Initialization
// =============================================================================

async function loadFeeds() {
  appState.feeds = await dbGetAll('feeds');
}

async function loadArticles() {
  appState.articles = await dbGetAll('articles');
}

async function initializeDefaultFeeds() {
  const feeds = await dbGetAll('feeds');
  
  if (feeds.length === 0) {
    console.log('Adding default feeds...');
    for (const feedConfig of DEFAULT_FEEDS) {
      try {
        await addFeed(feedConfig.url, feedConfig.group);
      } catch (error) {
        console.error(`Failed to add default feed ${feedConfig.url}:`, error);
      }
    }
  }
}

async function init() {
  try {
    // Initialize IndexedDB
    await initDB();

    // Load data
    await loadSettings();
    await loadReadStatus();
    await initializeDefaultFeeds();
    await loadFeeds();
    await loadArticles();

    // Apply theme
    document.getElementById('amoled-toggle').checked = appState.settings.amoledMode;
    document.getElementById('hide-read-toggle').checked = appState.settings.hideRead;
    document.getElementById('fetch-full-content-toggle').checked = appState.settings.fetchFullContent;
    applyTheme();

    // Setup UI
    setupEventListeners();
    renderGroups();
    renderArticles();

    // Refresh all feeds on startup
    console.log('Refreshing all feeds...');
    await refreshAllFeeds();
    await loadArticles();
    renderGroups();
    renderArticles();

    console.log('App initialized successfully');
  } catch (error) {
    console.error('Initialization error:', error);
    alert('Failed to initialize app. Please refresh the page.');
  }
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('Service Worker registered:', registration);
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
      });
  });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  console.log('Cleaning up...');
});

// Start the app
init();
