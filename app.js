// ============================================================================
// RSS Web Reader - Main Application
// ============================================================================

// ============================================================================
// Global State
// ============================================================================
const APP_STATE = {
    currentUser: null,
    feeds: [],
    groups: [],
    articles: [],
    currentFeed: null,
    currentGroup: null,
    currentArticle: null,
    hideRead: false,
    supabase: null,
    db: null // IndexedDB instance
};

// ============================================================================
// Initialize Application
// ============================================================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Initializing RSS Web Reader...');
    
    // Initialize IndexedDB
    await initIndexedDB();
    
    // Initialize Supabase
    initSupabase();
    
    // Load stored data
    await loadFromLocalStorage();
    
    // Check for existing session
    checkAuthStatus();
    
    // Register Service Worker for PWA
    registerServiceWorker();
    
    // Apply dark mode preference
    applyDarkModePreference();
    
    // Render initial UI
    renderFeedList();
    renderArticles();
});

// ============================================================================
// IndexedDB Setup
// ============================================================================
async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('RSSReaderDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            APP_STATE.db = request.result;
            resolve();
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create object stores
            if (!db.objectStoreNames.contains('articles')) {
                const articlesStore = db.createObjectStore('articles', { keyPath: 'id' });
                articlesStore.createIndex('feedUrl', 'feedUrl', { unique: false });
                articlesStore.createIndex('read', 'read', { unique: false });
                articlesStore.createIndex('pubDate', 'pubDate', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('feeds')) {
                const feedsStore = db.createObjectStore('feeds', { keyPath: 'url' });
                feedsStore.createIndex('groupId', 'groupId', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('groups')) {
                db.createObjectStore('groups', { keyPath: 'id' });
            }
        };
    });
}

// ============================================================================
// Supabase Initialization
// ============================================================================
function initSupabase() {
    // For demo purposes, using a placeholder. In production, use environment variables
    const SUPABASE_URL = localStorage.getItem('supabaseUrl') || 'https://jkvzsclozkkqrmmdjnll.supabase.co';
    const SUPABASE_KEY = localStorage.getItem('supabaseKey') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprdnpzY2xvemtrcXJtbWRqbmxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4OTcwMDYsImV4cCI6MjA3OTQ3MzAwNn0.Su-w_N2clSpy7LIXuYNpPxa8olDvYTJBX096rjPTflc';
    
    try {
        if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
            APP_STATE.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            setupSupabaseListener();
        }
    } catch (error) {
        console.warn('Supabase initialization failed:', error);
    }
}

// ============================================================================
// Authentication Functions
// ============================================================================
async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!APP_STATE.supabase) {
        alert('Supabase is not configured. Using local mode.');
        APP_STATE.currentUser = { email, mode: 'local' };
        closeModal('loginModal');
        await syncFromSupabase();
        return;
    }
    
    showLoading(true);
    try {
        const { data, error } = await APP_STATE.supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        APP_STATE.currentUser = data.user;
        closeModal('loginModal');
        await syncFromSupabase();
        alert('Login successful!');
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function register() {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    if (!APP_STATE.supabase) {
        alert('Supabase is not configured. Using local mode.');
        APP_STATE.currentUser = { email, mode: 'local' };
        closeModal('registerModal');
        return;
    }
    
    showLoading(true);
    try {
        const { data, error } = await APP_STATE.supabase.auth.signUp({
            email,
            password
        });
        
        if (error) throw error;
        
        alert('Registration successful! Please check your email to verify your account.');
        closeModal('registerModal');
    } catch (error) {
        console.error('Registration error:', error);
        alert('Registration failed: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function signInWithGoogle() {
    if (!APP_STATE.supabase) {
        alert('Supabase is not configured.');
        return;
    }
    
    try {
        const { data, error } = await APP_STATE.supabase.auth.signInWithOAuth({
            provider: 'google'
        });
        
        if (error) throw error;
    } catch (error) {
        console.error('Google sign-in error:', error);
        alert('Google sign-in failed: ' + error.message);
    }
}

async function logout() {
    if (APP_STATE.supabase && APP_STATE.currentUser?.mode !== 'local') {
        try {
            await APP_STATE.supabase.auth.signOut();
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
    
    APP_STATE.currentUser = null;
    clearLocalData();
    document.getElementById('loginModal').style.display = 'block';
    closeModal('settingsModal');
}

function checkAuthStatus() {
    if (APP_STATE.supabase) {
        APP_STATE.supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                APP_STATE.currentUser = session.user;
                syncFromSupabase();
            } else {
                document.getElementById('loginModal').style.display = 'block';
            }
        });
    } else {
        // Local mode - check if user has local data
        const hasLocalData = localStorage.getItem('rss_feeds');
        if (!hasLocalData) {
            document.getElementById('loginModal').style.display = 'block';
        }
    }
}

// ============================================================================
// Feed Management Functions
// ============================================================================
async function loadFeedArticles(feedUrl) {
    console.log('Loading articles from feed:', feedUrl);
    showLoading(true);
    
    try {
        // Use a CORS proxy for fetching RSS feeds
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const response = await fetch(proxyUrl + encodeURIComponent(feedUrl));
        const xmlText = await response.text();
        
        // Parse the RSS/Atom feed
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // Check for parsing errors
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            throw new Error('Invalid feed format');
        }
        
        // Detect feed type (RSS or Atom)
        const isAtom = xmlDoc.querySelector('feed');
        const articles = [];
        
        if (isAtom) {
            // Parse Atom feed
            const entries = xmlDoc.querySelectorAll('entry');
            entries.forEach((entry, index) => {
                const article = {
                    id: generateId(feedUrl, index),
                    feedUrl: feedUrl,
                    title: getTextContent(entry, 'title'),
                    link: entry.querySelector('link')?.getAttribute('href') || '',
                    content: getTextContent(entry, 'content') || getTextContent(entry, 'summary'),
                    pubDate: getTextContent(entry, 'published') || getTextContent(entry, 'updated'),
                    author: getTextContent(entry, 'author > name'),
                    read: false,
                    source: 'feed'
                };
                articles.push(article);
            });
        } else {
            // Parse RSS feed
            const items = xmlDoc.querySelectorAll('item');
            items.forEach((item, index) => {
                const article = {
                    id: generateId(feedUrl, index),
                    feedUrl: feedUrl,
                    title: getTextContent(item, 'title'),
                    link: getTextContent(item, 'link'),
                    content: getTextContent(item, 'content\\encoded') || 
                             getTextContent(item, 'description'),
                    pubDate: getTextContent(item, 'pubDate') || getTextContent(item, 'dc\\date'),
                    author: getTextContent(item, 'author') || getTextContent(item, 'dc\\creator'),
                    read: false,
                    source: 'feed'
                };
                articles.push(article);
            });
        }
        
        // Store articles in IndexedDB
        await storeArticles(articles);
        
        // Merge with existing articles (preserve read status)
        articles.forEach(newArticle => {
            const existingIndex = APP_STATE.articles.findIndex(a => a.id === newArticle.id);
            if (existingIndex >= 0) {
                newArticle.read = APP_STATE.articles[existingIndex].read;
                APP_STATE.articles[existingIndex] = newArticle;
            } else {
                APP_STATE.articles.push(newArticle);
            }
        });
        
        return articles;
    } catch (error) {
        console.error('Error loading feed articles:', error);
        alert('Failed to load feed: ' + error.message);
        return [];
    } finally {
        showLoading(false);
    }
}

function getTextContent(parent, selector) {
    const element = parent.querySelector(selector);
    return element ? element.textContent.trim() : '';
}

function generateId(feedUrl, index) {
    return btoa(feedUrl + '_' + index).replace(/[^a-zA-Z0-9]/g, '');
}

async function addFeed() {
    const feedUrl = document.getElementById('feedUrl').value;
    const groupId = document.getElementById('feedGroup').value;
    
    if (!feedUrl) return;
    
    // Check if feed already exists
    if (APP_STATE.feeds.find(f => f.url === feedUrl)) {
        alert('This feed is already added.');
        return;
    }
    
    showLoading(true);
    
    try {
        // Try to load articles to verify feed is valid
        const articles = await loadFeedArticles(feedUrl);
        
        if (articles.length === 0) {
            throw new Error('No articles found in feed');
        }
        
        // Extract feed title from first article or use URL
        const feedTitle = articles[0]?.title?.split('-')[0]?.trim() || new URL(feedUrl).hostname;
        
        const feed = {
            url: feedUrl,
            title: feedTitle,
            groupId: groupId || null,
            unreadCount: articles.length
        };
        
        APP_STATE.feeds.push(feed);
        await storeFeed(feed);
        await syncToSupabase();
        
        renderFeedList();
        closeModal('addFeedModal');
        document.getElementById('feedUrl').value = '';
        
        alert('Feed added successfully!');
    } catch (error) {
        console.error('Error adding feed:', error);
        alert('Failed to add feed: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function assignFeedToGroup(feedUrl, groupId) {
    const feed = APP_STATE.feeds.find(f => f.url === feedUrl);
    if (feed) {
        feed.groupId = groupId;
        await storeFeed(feed);
        await syncToSupabase();
        renderFeedList();
    }
}

function createGroup() {
    const groupName = prompt('Enter group name:');
    if (!groupName) return;
    
    const group = {
        id: 'group_' + Date.now(),
        name: groupName,
        collapsed: false
    };
    
    APP_STATE.groups.push(group);
    storeGroup(group);
    syncToSupabase();
    renderFeedList();
    updateGroupSelector();
}

function toggleGroup(groupId) {
    const group = APP_STATE.groups.find(g => g.id === groupId);
    if (group) {
        group.collapsed = !group.collapsed;
        storeGroup(group);
        renderFeedList();
    }
}

async function loadGroupArticles(groupId) {
    APP_STATE.currentGroup = groupId;
    APP_STATE.currentFeed = null;
    
    const groupFeeds = APP_STATE.feeds.filter(f => f.groupId === groupId);
    const feedUrls = groupFeeds.map(f => f.url);
    
    // Load articles from all feeds in the group
    const allArticles = APP_STATE.articles.filter(a => feedUrls.includes(a.feedUrl));
    
    renderArticles(allArticles);
}

function moveFeed() {
    // This would implement drag-and-drop or move functionality
    // For now, it's a placeholder
    console.log('Move feed functionality');
}

// ============================================================================
// Article Display & Reading Functions
// ============================================================================
function renderArticles(articlesToRender = null) {
    const articlesList = document.getElementById('articlesList');
    const articles = articlesToRender || APP_STATE.articles;
    
    // Sort articles by date (newest first)
    const sortedArticles = [...articles].sort((a, b) => {
        const dateA = new Date(a.pubDate);
        const dateB = new Date(b.pubDate);
        return dateB - dateA;
    });
    
    articlesList.innerHTML = '';
    
    if (sortedArticles.length === 0) {
        articlesList.innerHTML = '<div class="article-item"><p>No articles to display. Add a feed to get started!</p></div>';
        return;
    }
    
    sortedArticles.forEach(article => {
        const articleEl = document.createElement('div');
        articleEl.className = 'article-item';
        if (article.read) articleEl.classList.add('read');
        if (APP_STATE.hideRead && article.read) articleEl.classList.add('hidden');
        if (APP_STATE.currentArticle?.id === article.id) articleEl.classList.add('active');
        
        const unreadIndicator = article.read ? '' : '<span class="unread-indicator"></span>';
        const excerpt = stripHtml(article.content).substring(0, 150) + '...';
        const date = formatDate(article.pubDate);
        
        articleEl.innerHTML = `
            <div class="article-item-title">
                ${unreadIndicator}${escapeHtml(article.title)}
            </div>
            <div class="article-item-meta">
                <span>${escapeHtml(article.author || 'Unknown')}</span>
                <span>${date}</span>
            </div>
            <div class="article-item-excerpt">${escapeHtml(excerpt)}</div>
        `;
        
        articleEl.onclick = () => displayArticle(article.id);
        articlesList.appendChild(articleEl);
    });
}

function renderArticlesListPanel() {
    renderArticles();
}

async function displayArticle(articleId) {
    const article = APP_STATE.articles.find(a => a.id === articleId);
    if (!article) return;
    
    APP_STATE.currentArticle = article;
    
    // Mark as read
    if (!article.read) {
        article.read = true;
        await storeArticle(article);
        await syncToSupabase();
    }
    
    // Update UI
    document.querySelector('.reading-pane-empty').style.display = 'none';
    document.getElementById('articleContent').style.display = 'block';
    
    document.getElementById('articleTitle').textContent = article.title;
    document.getElementById('articleSource').textContent = article.author || 'Unknown';
    document.getElementById('articleDate').textContent = formatDate(article.pubDate);
    document.getElementById('articleLink').href = article.link;
    document.getElementById('articleBody').innerHTML = sanitizeHtml(article.content);
    document.getElementById('contentSourceSelector').value = article.source || 'feed';
    
    // Update articles list to show active state
    renderArticles();
    
    // Mobile: show reading pane
    if (window.innerWidth <= 768) {
        document.querySelector('.reading-pane').classList.add('open');
    }
}

async function changeContentSource(source) {
    if (!APP_STATE.currentArticle) return;
    
    const article = APP_STATE.currentArticle;
    article.source = source;
    
    showLoading(true);
    
    try {
        if (source === 'webpage') {
            // Extract full text from webpage
            const fullText = await extractFullText(article.link, article.content);
            document.getElementById('articleBody').innerHTML = sanitizeHtml(fullText);
        } else if (source === 'feed') {
            // Show original feed content
            document.getElementById('articleBody').innerHTML = sanitizeHtml(article.content);
        } else if (source === 'inline') {
            // Show inline/embedded view
            document.getElementById('articleBody').innerHTML = `
                <iframe src="${article.link}" style="width: 100%; height: 600px; border: none;"></iframe>
            `;
        }
        
        await storeArticle(article);
    } catch (error) {
        console.error('Error changing content source:', error);
        alert('Failed to load content: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function extractFullText(url, fallbackContent) {
    console.log('Extracting full text from:', url);
    
    try {
        // Use a content extraction service (example using Mercury Parser API alternative)
        // In production, you might want to use a server-side service
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const response = await fetch(proxyUrl + encodeURIComponent(url));
        const html = await response.text();
        
        // Simple content extraction - in production, use a proper library
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Remove unwanted elements
        const unwanted = doc.querySelectorAll('script, style, nav, header, footer, aside, .ad, .advertisement');
        unwanted.forEach(el => el.remove());
        
        // Try to find main content
        const article = doc.querySelector('article') || 
                       doc.querySelector('.article') ||
                       doc.querySelector('.content') ||
                       doc.querySelector('main') ||
                       doc.body;
        
        return article ? article.innerHTML : fallbackContent;
    } catch (error) {
        console.error('Full text extraction failed:', error);
        return fallbackContent;
    }
}

function toggleArticleRead() {
    if (!APP_STATE.currentArticle) return;
    
    APP_STATE.currentArticle.read = !APP_STATE.currentArticle.read;
    storeArticle(APP_STATE.currentArticle);
    syncToSupabase();
    renderArticles();
    
    document.getElementById('markReadBtn').textContent = 
        APP_STATE.currentArticle.read ? 'Mark as Unread' : 'Mark as Read';
}

function toggleHideRead(hide) {
    APP_STATE.hideRead = hide;
    localStorage.setItem('hideRead', hide);
    renderArticles();
}

// ============================================================================
// Feed List Rendering
// ============================================================================
function renderFeedList() {
    const feedList = document.getElementById('feedList');
    feedList.innerHTML = '';
    
    // Render ungrouped feeds first
    const ungroupedFeeds = APP_STATE.feeds.filter(f => !f.groupId);
    ungroupedFeeds.forEach(feed => {
        feedList.appendChild(createFeedElement(feed));
    });
    
    // Render grouped feeds
    APP_STATE.groups.forEach(group => {
        const groupEl = createGroupElement(group);
        feedList.appendChild(groupEl);
    });
    
    updateGroupSelector();
}

function createFeedElement(feed) {
    const feedEl = document.createElement('div');
    feedEl.className = 'feed-item';
    if (APP_STATE.currentFeed === feed.url) feedEl.classList.add('active');
    
    const unreadCount = APP_STATE.articles.filter(a => 
        a.feedUrl === feed.url && !a.read
    ).length;
    
    feedEl.innerHTML = `
        <span>${escapeHtml(feed.title)}</span>
        ${unreadCount > 0 ? `<span class="unread-count">${unreadCount}</span>` : ''}
    `;
    
    feedEl.onclick = async () => {
        APP_STATE.currentFeed = feed.url;
        APP_STATE.currentGroup = null;
        
        // Load articles for this feed
        const feedArticles = APP_STATE.articles.filter(a => a.feedUrl === feed.url);
        if (feedArticles.length === 0) {
            await loadFeedArticles(feed.url);
        }
        
        renderFeedList();
        renderArticles(APP_STATE.articles.filter(a => a.feedUrl === feed.url));
        document.getElementById('panelTitle').textContent = feed.title;
    };
    
    return feedEl;
}

function createGroupElement(group) {
    const groupEl = document.createElement('div');
    groupEl.className = 'feed-group';
    
    const groupFeeds = APP_STATE.feeds.filter(f => f.groupId === group.id);
    const unreadCount = APP_STATE.articles.filter(a => 
        groupFeeds.some(f => f.url === a.feedUrl) && !a.read
    ).length;
    
    const headerEl = document.createElement('div');
    headerEl.className = 'group-header';
    if (group.collapsed) headerEl.classList.add('collapsed');
    
    headerEl.innerHTML = `
        <span>${escapeHtml(group.name)} ${unreadCount > 0 ? `(${unreadCount})` : ''}</span>
        <span class="arrow">▼</span>
    `;
    
    headerEl.onclick = () => toggleGroup(group.id);
    groupEl.appendChild(headerEl);
    
    if (!group.collapsed) {
        const feedsEl = document.createElement('div');
        feedsEl.className = 'group-feeds';
        
        groupFeeds.forEach(feed => {
            feedsEl.appendChild(createFeedElement(feed));
        });
        
        groupEl.appendChild(feedsEl);
    }
    
    return groupEl;
}

function updateGroupSelector() {
    const selector = document.getElementById('feedGroup');
    selector.innerHTML = '<option value="">No Group</option>';
    
    APP_STATE.groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        selector.appendChild(option);
    });
}

// ============================================================================
// Synchronization Functions
// ============================================================================
async function syncToSupabase() {
    if (!APP_STATE.supabase || !APP_STATE.currentUser || APP_STATE.currentUser.mode === 'local') {
        console.log('Sync to Supabase skipped (local mode or not configured)');
        return;
    }
    
    try {
        // Sync feeds
        await APP_STATE.supabase
            .from('feeds')
            .upsert(APP_STATE.feeds.map(f => ({
                user_id: APP_STATE.currentUser.id,
                url: f.url,
                title: f.title,
                group_id: f.groupId
            })));
        
        // Sync groups
        await APP_STATE.supabase
            .from('groups')
            .upsert(APP_STATE.groups.map(g => ({
                user_id: APP_STATE.currentUser.id,
                id: g.id,
                name: g.name,
                collapsed: g.collapsed
            })));
        
        // Sync read status
        const readArticles = APP_STATE.articles.filter(a => a.read);
        await APP_STATE.supabase
            .from('read_articles')
            .upsert(readArticles.map(a => ({
                user_id: APP_STATE.currentUser.id,
                article_id: a.id,
                feed_url: a.feedUrl
            })));
        
        console.log('Synced to Supabase successfully');
    } catch (error) {
        console.error('Error syncing to Supabase:', error);
    }
}

async function syncFromSupabase() {
    if (!APP_STATE.supabase || !APP_STATE.currentUser || APP_STATE.currentUser.mode === 'local') {
        console.log('Sync from Supabase skipped (local mode or not configured)');
        return;
    }
    
    showLoading(true);
    
    try {
        // Sync feeds
        const { data: feeds } = await APP_STATE.supabase
            .from('feeds')
            .select('*')
            .eq('user_id', APP_STATE.currentUser.id);
        
        if (feeds) {
            APP_STATE.feeds = feeds.map(f => ({
                url: f.url,
                title: f.title,
                groupId: f.group_id
            }));
        }
        
        // Sync groups
        const { data: groups } = await APP_STATE.supabase
            .from('groups')
            .select('*')
            .eq('user_id', APP_STATE.currentUser.id);
        
        if (groups) {
            APP_STATE.groups = groups.map(g => ({
                id: g.id,
                name: g.name,
                collapsed: g.collapsed
            }));
        }
        
        // Load articles for all feeds
        for (const feed of APP_STATE.feeds) {
            await loadFeedArticles(feed.url);
        }
        
        // Sync read status
        const { data: readArticles } = await APP_STATE.supabase
            .from('read_articles')
            .select('*')
            .eq('user_id', APP_STATE.currentUser.id);
        
        if (readArticles) {
            readArticles.forEach(ra => {
                const article = APP_STATE.articles.find(a => a.id === ra.article_id);
                if (article) {
                    article.read = true;
                }
            });
        }
        
        renderFeedList();
        renderArticles();
        
        console.log('Synced from Supabase successfully');
    } catch (error) {
        console.error('Error syncing from Supabase:', error);
    } finally {
        showLoading(false);
    }
}

async function syncAllFeeds(silent = false) {
    if (!silent) showLoading(true);
    
    try {
        for (const feed of APP_STATE.feeds) {
            await loadFeedArticles(feed.url);
        }
        
        renderFeedList();
        renderArticles();
        
        if (!silent) {
            alert('All feeds synced successfully!');
        }
    } catch (error) {
        console.error('Error syncing feeds:', error);
        if (!silent) {
            alert('Failed to sync some feeds');
        }
    } finally {
        if (!silent) showLoading(false);
    }
}

function setupSupabaseListener() {
    if (!APP_STATE.supabase || !APP_STATE.currentUser) return;
    
    // Listen for changes in feeds
    APP_STATE.supabase
        .channel('feeds')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'feeds' },
            () => syncFromSupabase()
        )
        .subscribe();
    
    // Listen for changes in groups
    APP_STATE.supabase
        .channel('groups')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'groups' },
            () => syncFromSupabase()
        )
        .subscribe();
}

// ============================================================================
// OPML Import/Export
// ============================================================================
async function importOPML(file) {
    if (!file) return;
    
    showLoading(true);
    
    try {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        
        const outlines = xmlDoc.querySelectorAll('outline[xmlUrl], outline[type="rss"]');
        
        for (const outline of outlines) {
            const feedUrl = outline.getAttribute('xmlUrl');
            const title = outline.getAttribute('title') || outline.getAttribute('text');
            const category = outline.parentElement.getAttribute('title') || 
                           outline.parentElement.getAttribute('text');
            
            if (feedUrl && !APP_STATE.feeds.find(f => f.url === feedUrl)) {
                let groupId = null;
                
                // Create group if needed
                if (category && category !== 'feeds') {
                    let group = APP_STATE.groups.find(g => g.name === category);
                    if (!group) {
                        group = {
                            id: 'group_' + Date.now() + '_' + Math.random(),
                            name: category,
                            collapsed: false
                        };
                        APP_STATE.groups.push(group);
                        await storeGroup(group);
                    }
                    groupId = group.id;
                }
                
                const feed = {
                    url: feedUrl,
                    title: title || new URL(feedUrl).hostname,
                    groupId: groupId
                };
                
                APP_STATE.feeds.push(feed);
                await storeFeed(feed);
                await loadFeedArticles(feedUrl);
            }
        }
        
        await syncToSupabase();
        renderFeedList();
        renderArticles();
        
        alert('OPML imported successfully!');
    } catch (error) {
        console.error('OPML import error:', error);
        alert('Failed to import OPML: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function exportOPML() {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>RSS Web Reader Feeds</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${APP_STATE.groups.map(group => `    <outline text="${escapeXml(group.name)}" title="${escapeXml(group.name)}">
${APP_STATE.feeds.filter(f => f.groupId === group.id).map(feed => 
`      <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"/>`
).join('\n')}
    </outline>`).join('\n')}
${APP_STATE.feeds.filter(f => !f.groupId).map(feed => 
`    <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"/>`
).join('\n')}
  </body>
</opml>`;
    
    const blob = new Blob([opml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rss-feeds.opml';
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================================
// UI Functions
// ============================================================================
function toggleSettings() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showLoading(show) {
    document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
}

function toggleDarkMode() {
    const isDark = document.getElementById('darkModeToggle').checked;
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('darkMode', isDark);
}

function applyDarkModePreference() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    document.body.classList.toggle('dark-mode', isDark);
    document.getElementById('darkModeToggle').checked = isDark;
}

// ============================================================================
// PWA Service Worker
// ============================================================================
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('Service Worker registered:', registration);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }
}

// ============================================================================
// Storage Functions
// ============================================================================
async function storeArticle(article) {
    if (!APP_STATE.db) return;
    
    return new Promise((resolve, reject) => {
        const transaction = APP_STATE.db.transaction(['articles'], 'readwrite');
        const store = transaction.objectStore('articles');
        const request = store.put(article);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function storeArticles(articles) {
    if (!APP_STATE.db) return;
    
    return new Promise((resolve, reject) => {
        const transaction = APP_STATE.db.transaction(['articles'], 'readwrite');
        const store = transaction.objectStore('articles');
        
        articles.forEach(article => store.put(article));
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

async function storeFeed(feed) {
    if (!APP_STATE.db) return;
    
    return new Promise((resolve, reject) => {
        const transaction = APP_STATE.db.transaction(['feeds'], 'readwrite');
        const store = transaction.objectStore('feeds');
        const request = store.put(feed);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function storeGroup(group) {
    if (!APP_STATE.db) return;
    
    return new Promise((resolve, reject) => {
        const transaction = APP_STATE.db.transaction(['groups'], 'readwrite');
        const store = transaction.objectStore('groups');
        const request = store.put(group);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function loadFromLocalStorage() {
    try {
        // Load from IndexedDB
        if (APP_STATE.db) {
            // Load feeds
            const feedsTransaction = APP_STATE.db.transaction(['feeds'], 'readonly');
            const feedsStore = feedsTransaction.objectStore('feeds');
            const feedsRequest = feedsStore.getAll();
            
            feedsRequest.onsuccess = () => {
                APP_STATE.feeds = feedsRequest.result || [];
            };
            
            // Load groups
            const groupsTransaction = APP_STATE.db.transaction(['groups'], 'readonly');
            const groupsStore = groupsTransaction.objectStore('groups');
            const groupsRequest = groupsStore.getAll();
            
            groupsRequest.onsuccess = () => {
                APP_STATE.groups = groupsRequest.result || [];
            };
            
            // Load articles
            const articlesTransaction = APP_STATE.db.transaction(['articles'], 'readonly');
            const articlesStore = articlesTransaction.objectStore('articles');
            const articlesRequest = articlesStore.getAll();
            
            articlesRequest.onsuccess = () => {
                APP_STATE.articles = articlesRequest.result || [];
                renderFeedList();
                renderArticles();
            };
        }
        
        // Load preferences
        APP_STATE.hideRead = localStorage.getItem('hideRead') === 'true';
        document.getElementById('hideReadToggle').checked = APP_STATE.hideRead;
    } catch (error) {
        console.error('Error loading from storage:', error);
    }
}

function clearLocalData() {
    APP_STATE.feeds = [];
    APP_STATE.groups = [];
    APP_STATE.articles = [];
    APP_STATE.currentFeed = null;
    APP_STATE.currentGroup = null;
    APP_STATE.currentArticle = null;
    
    if (APP_STATE.db) {
        const transaction = APP_STATE.db.transaction(['feeds', 'groups', 'articles'], 'readwrite');
        transaction.objectStore('feeds').clear();
        transaction.objectStore('groups').clear();
        transaction.objectStore('articles').clear();
    }
    
    renderFeedList();
    renderArticles();
}

// ============================================================================
// Utility Functions
// ============================================================================
function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function sanitizeHtml(html) {
    // Basic sanitization - in production use DOMPurify or similar
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    
    // Remove dangerous elements
    const scripts = tmp.querySelectorAll('script, iframe[src^="javascript:"], object, embed');
    scripts.forEach(s => s.remove());
    
    return tmp.innerHTML;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeXml(text) {
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&apos;');
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown date';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) {
        return diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`;
    } else if (diffHours < 24) {
        return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    } else if (diffDays < 7) {
        return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString();
    }
}
