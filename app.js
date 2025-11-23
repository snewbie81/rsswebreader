// RSS Web Reader Application

// Default settings constants
const DEFAULT_HIDE_READ = true; // Default state for hiding read articles

// Supabase error codes
const SUPABASE_ERROR_CODES = {
    NO_ROWS: 'PGRST116', // No rows returned from query
    INVALID_CREDENTIALS: 'invalid_grant',
    EMAIL_NOT_CONFIRMED: 'email_not_confirmed'
};

class RSSReader {
    constructor() {
        this.feeds = [];
        this.groups = [];
        this.articles = [];
        this.readArticles = new Set();
        this.currentFeed = null;
        this.currentGroup = null;
        this.currentArticle = null;
        this.collapsedGroups = new Set();
        this.hideRead = DEFAULT_HIDE_READ; // Default to hiding read articles
        this.darkMode = false;
        this.sidebarCollapsed = false;
        this.contentSource = 'feed'; // 'feed', 'webpage', or 'inline'
        this.user = null;
        this.syncEnabled = false;
        this.INLINE_TEXT_MAX_LENGTH = 500; // Maximum length for inline text preview
        this.supabaseReady = false;
        this.supabaseSubscription = null; // Store the subscription for real-time sync
        this.syncDebounceTimer = null; // Timer for debouncing sync
        this.SYNC_DEBOUNCE_DELAY = 1000; // Debounce delay in ms (1 second)
        this.INITIAL_SYNC_DELAY = 1000; // Delay before initial feed sync in ms (1 second)
        this.supabaseListenerFirstEvent = true; // Track first event in real-time listener
        this.isSyncing = false; // Flag to prevent concurrent sync operations
        this.initialSyncTimeout = null; // Store timeout ID for cleanup
        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.renderFeeds();
        this.renderArticles();
        this.registerServiceWorker();
        this.initializeSupabase();
        
        // Automatically sync all feeds on initialization if feeds exist
        if (this.feeds.length > 0) {
            // Delay to avoid blocking initial render
            this.initialSyncTimeout = setTimeout(() => {
                // Check if still valid before syncing
                if (this.feeds && this.feeds.length > 0) {
                    this.syncAllFeeds();
                }
            }, this.INITIAL_SYNC_DELAY);
        }
    }

    initializeSupabase() {
        // Wait for Supabase to be ready
        if (window.supabaseClient) {
            this.supabaseReady = true;
            this.setupSupabaseAuth();
        } else {
            window.addEventListener('supabase-ready', () => {
                this.supabaseReady = true;
                this.setupSupabaseAuth();
            });
        }
    }

    setupSupabaseAuth() {
        // Listen for authentication state changes
        if (window.supabaseClient) {
            window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
                if (session && session.user) {
                    // User is signed in
                    this.user = { 
                        email: session.user.email,
                        uid: session.user.id 
                    };
                    this.syncEnabled = true;
                    
                    // First sync from Supabase to get latest data
                    await this.syncFromSupabase();
                    
                    // Save user and synced data to localStorage
                    localStorage.setItem('rss_user', JSON.stringify(this.user));
                    localStorage.setItem('rss_feeds', JSON.stringify(this.feeds));
                    localStorage.setItem('rss_groups', JSON.stringify(this.groups));
                    localStorage.setItem('rss_read_articles', JSON.stringify([...this.readArticles]));
                    localStorage.setItem('rss_hide_read', JSON.stringify(this.hideRead));
                    localStorage.setItem('rss_dark_mode', JSON.stringify(this.darkMode));
                    localStorage.setItem('rss_content_source', this.contentSource);
                    localStorage.setItem('rss_sidebar_collapsed', JSON.stringify(this.sidebarCollapsed));
                    
                    this.updateUserUI();
                    
                    // Set up real-time sync listener
                    this.setupSupabaseListener();
                } else {
                    // User is signed out
                    if (this.user) {
                        this.user = null;
                        this.syncEnabled = false;
                        this.updateUserUI();
                    }
                    
                    // Remove Supabase subscription if exists
                    if (this.supabaseSubscription) {
                        this.supabaseSubscription.unsubscribe();
                        this.supabaseSubscription = null;
                    }
                }
            });
        }
    }

    setupEventListeners() {
        document.getElementById('addFeedBtn').addEventListener('click', () => this.showModal('addFeedModal'));
        document.getElementById('confirmAddFeedBtn').addEventListener('click', () => this.addFeed());
        document.getElementById('importOpmlBtn').addEventListener('click', () => this.showModal('importOpmlModal'));
        document.getElementById('confirmImportOpmlBtn').addEventListener('click', () => this.importOpml());
        document.getElementById('exportOpmlBtn').addEventListener('click', () => this.exportOpml());
        
        const hideReadToggle = document.getElementById('hideReadToggle');
        if (hideReadToggle) {
            hideReadToggle.addEventListener('change', (e) => this.toggleHideRead(e.target.checked));
        }
        
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', (e) => this.toggleDarkMode(e.target.checked));
        }

        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }

        const floatingMenuToggle = document.getElementById('floatingMenuToggle');
        if (floatingMenuToggle) {
            floatingMenuToggle.addEventListener('click', () => this.toggleSidebar());
        }

        const settingsToggle = document.getElementById('settingsToggle');
        if (settingsToggle) {
            settingsToggle.addEventListener('click', () => this.toggleSettings());
        }

        const addGroupBtn = document.getElementById('addGroupBtn');
        if (addGroupBtn) {
            addGroupBtn.addEventListener('click', () => this.showModal('addGroupModal'));
        }

        const confirmAddGroupBtn = document.getElementById('confirmAddGroupBtn');
        if (confirmAddGroupBtn) {
            confirmAddGroupBtn.addEventListener('click', () => this.addGroup());
        }

        const syncAllBtn = document.getElementById('syncAllBtn');
        if (syncAllBtn) {
            syncAllBtn.addEventListener('click', () => this.syncAllFeeds());
        }

        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.showModal('loginModal'));
        }

        const confirmLoginBtn = document.getElementById('confirmLoginBtn');
        if (confirmLoginBtn) {
            confirmLoginBtn.addEventListener('click', () => this.login());
        }

        const confirmRegisterBtn = document.getElementById('confirmRegisterBtn');
        if (confirmRegisterBtn) {
            confirmRegisterBtn.addEventListener('click', () => this.register());
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        const contentSourceSelect = document.getElementById('contentSourceSelect');
        if (contentSourceSelect) {
            contentSourceSelect.addEventListener('change', (e) => this.changeContentSource(e.target.value));
        }
        
        document.getElementById('feedUrlInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addFeed();
        });

        const groupNameInput = document.getElementById('groupNameInput');
        if (groupNameInput) {
            groupNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.addGroup();
            });
        }

        const loginPasswordInput = document.getElementById('loginPasswordInput');
        if (loginPasswordInput) {
            loginPasswordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.login();
            });
        }

        const googleSignInBtn = document.getElementById('googleSignInBtn');
        if (googleSignInBtn) {
            googleSignInBtn.addEventListener('click', () => this.signInWithGoogle());
        }

        // Rename and move feed/group event listeners
        const confirmRenameFeedBtn = document.getElementById('confirmRenameFeedBtn');
        if (confirmRenameFeedBtn) {
            confirmRenameFeedBtn.addEventListener('click', () => this.renameFeed());
        }

        const confirmRenameGroupBtn = document.getElementById('confirmRenameGroupBtn');
        if (confirmRenameGroupBtn) {
            confirmRenameGroupBtn.addEventListener('click', () => this.renameGroup());
        }

        const confirmMoveFeedBtn = document.getElementById('confirmMoveFeedBtn');
        if (confirmMoveFeedBtn) {
            confirmMoveFeedBtn.addEventListener('click', () => this.moveFeed());
        }

        const renameFeedInput = document.getElementById('renameFeedInput');
        if (renameFeedInput) {
            renameFeedInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.renameFeed();
            });
        }

        const renameGroupInput = document.getElementById('renameGroupInput');
        if (renameGroupInput) {
            renameGroupInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.renameGroup();
            });
        }
        
        // Add event delegation for article links to ensure they work properly
        // This prevents any potential interference from parent click handlers
        // Only add once - check if already added
        if (!this._articleLinkHandlerAdded) {
            document.addEventListener('click', (e) => {
                const articleLink = e.target.closest('a.article-link');
                if (articleLink && articleLink.hasAttribute('href')) {
                    // Let the browser handle the link normally (target="_blank" will work)
                    // We just ensure no parent handlers interfere
                    e.stopPropagation();
                }
            }, true); // Use capture phase to catch it early
            this._articleLinkHandlerAdded = true;
        }
    }

    loadData() {
        const savedFeeds = localStorage.getItem('rss_feeds');
        const savedGroups = localStorage.getItem('rss_groups');
        const savedReadArticles = localStorage.getItem('rss_read_articles');
        const savedHideRead = localStorage.getItem('rss_hide_read');
        const savedDarkMode = localStorage.getItem('rss_dark_mode');
        const savedSidebarCollapsed = localStorage.getItem('rss_sidebar_collapsed');
        const savedContentSource = localStorage.getItem('rss_content_source');
        const savedUser = localStorage.getItem('rss_user');

        if (savedFeeds) {
            this.feeds = JSON.parse(savedFeeds);
        }

        if (savedGroups) {
            this.groups = JSON.parse(savedGroups);
        }

        if (savedReadArticles) {
            this.readArticles = new Set(JSON.parse(savedReadArticles));
        }

        if (savedHideRead) {
            this.hideRead = JSON.parse(savedHideRead);
        } else {
            // Default to true if no saved preference exists
            this.hideRead = DEFAULT_HIDE_READ;
        }
        // Update the checkbox to reflect the current state
        const hideReadToggle = document.getElementById('hideReadToggle');
        if (hideReadToggle) {
            hideReadToggle.checked = this.hideRead;
        }

        if (savedDarkMode) {
            this.darkMode = JSON.parse(savedDarkMode);
            if (this.darkMode) {
                document.body.classList.add('dark-mode');
            }
            const darkModeToggle = document.getElementById('darkModeToggle');
            if (darkModeToggle) {
                darkModeToggle.checked = this.darkMode;
            }
        }

        if (savedSidebarCollapsed) {
            this.sidebarCollapsed = JSON.parse(savedSidebarCollapsed);
            if (this.sidebarCollapsed) {
                document.querySelector('.sidebar')?.classList.add('collapsed');
                // Show floating menu toggle if sidebar is collapsed on load
                const floatingToggle = document.getElementById('floatingMenuToggle');
                if (floatingToggle) {
                    floatingToggle.style.display = 'flex';
                }
            }
        }

        if (savedContentSource) {
            this.contentSource = savedContentSource;
            const contentSourceSelect = document.getElementById('contentSourceSelect');
            if (contentSourceSelect) {
                contentSourceSelect.value = this.contentSource;
            }
        }

        if (savedUser) {
            this.user = JSON.parse(savedUser);
            this.updateUserUI();
        }
    }

    saveData() {
        localStorage.setItem('rss_feeds', JSON.stringify(this.feeds));
        localStorage.setItem('rss_groups', JSON.stringify(this.groups));
        localStorage.setItem('rss_read_articles', JSON.stringify([...this.readArticles]));
        localStorage.setItem('rss_hide_read', JSON.stringify(this.hideRead));
        localStorage.setItem('rss_dark_mode', JSON.stringify(this.darkMode));
        localStorage.setItem('rss_sidebar_collapsed', JSON.stringify(this.sidebarCollapsed));
        localStorage.setItem('rss_content_source', this.contentSource);
        if (this.user) {
            localStorage.setItem('rss_user', JSON.stringify(this.user));
        }
        
        // Debounced sync to Supabase if logged in
        if (this.user && this.syncEnabled && this.supabaseReady) {
            this.debouncedSyncToSupabase();
        } else if (this.user && this.syncEnabled) {
            // Fallback to localStorage sync (demo mode)
            this.syncToServer();
        }
    }

    debouncedSyncToSupabase() {
        // Clear existing timer
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
        }
        
        // Set new timer
        this.syncDebounceTimer = setTimeout(async () => {
            await this.syncToSupabase();
        }, this.SYNC_DEBOUNCE_DELAY);
    }

    showModal(modalId) {
        // Populate group select dropdown if it's the add feed modal
        if (modalId === 'addFeedModal') {
            const groupSelect = document.getElementById('feedGroupSelect');
            if (groupSelect) {
                groupSelect.innerHTML = '<option value="">No Group</option>' + 
                    this.groups.map(group => 
                        `<option value="${group.id}">${this.escapeHtml(group.name)}</option>`
                    ).join('');
            }
        }
        document.getElementById(modalId).style.display = 'flex';
    }

    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    async addFeed() {
        const input = document.getElementById('feedUrlInput');
        const url = input.value.trim();
        const groupSelect = document.getElementById('feedGroupSelect');

        if (!url) {
            alert('Please enter a feed URL');
            return;
        }

        // Show loading state
        const addButton = document.getElementById('confirmAddFeedBtn');
        if (!addButton) {
            console.error('Add Feed button not found');
            return;
        }
        
        const originalButtonText = addButton.textContent;
        addButton.disabled = true;
        addButton.textContent = 'Adding...';

        // Check if feed already exists before trying to fetch
        if (this.feeds.some(f => f.url === url)) {
            addButton.disabled = false;
            addButton.textContent = originalButtonText;
            alert('This feed is already added');
            return;
        }

        try {
            const feed = await this.fetchFeed(url);

            this.feeds.push(feed);

            // Assign to group if selected
            if (groupSelect && groupSelect.value) {
                this.assignFeedToGroup(url, groupSelect.value);
            } else {
                // Only call saveData and renderFeeds if not assigning to group
                // (assignFeedToGroup already calls these methods)
                this.saveData();
                this.renderFeeds();
            }

            input.value = '';
            if (groupSelect) groupSelect.value = '';
            this.closeModal('addFeedModal');
            this.showNotification('Feed added successfully!', 'success');
        } catch (error) {
            console.error('Error adding feed:', error);
            let errorMessage = 'Failed to add feed. ';
            
            if (error.message.includes('Invalid feed URL')) {
                errorMessage += 'Please check the URL format.';
            } else if (error.name === 'TypeError' || error.message.includes('Failed to fetch')) {
                errorMessage += 'Unable to connect to the feed. Please check the URL or try again later.';
            } else if (error.name === 'AbortError') {
                errorMessage += 'The request timed out. The feed may be too slow or unavailable.';
            } else if (error.message.includes('Failed to parse feed') || error.message.includes('Invalid feed data')) {
                errorMessage += 'The URL does not appear to be a valid RSS feed, or the RSS parser service is having trouble processing it. ';
                errorMessage += 'This can happen with complex feeds that use multiple XML namespaces (xmlns:content, xmlns:dc, etc.). ';
                errorMessage += 'If this is a valid RSS feed, it may work after retrying.';
            } else {
                errorMessage += error.message || 'Please try again.';
            }
            
            // Show error in console for debugging
            console.error('Feed addition error details:', {
                url,
                error: error.message,
                fullError: error
            });
            
            alert(errorMessage);
        } finally {
            // Restore button state
            addButton.disabled = false;
            addButton.textContent = originalButtonText;
        }
    }

    async fetchFeed(url, retryCount = 0) {
        const MAX_RETRIES = 2;
        const RETRY_DELAY = 1000; // 1 second
        const REQUEST_TIMEOUT = 15000; // 15 seconds
        
        // Validate URL before sending to third-party service
        try {
            const parsedUrl = new URL(url);
            // Only allow http and https protocols
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                throw new Error('Only HTTP and HTTPS URLs are allowed');
            }
            // Block private IP ranges and localhost to prevent SSRF
            const hostname = parsedUrl.hostname.toLowerCase();
            if (hostname === 'localhost' || 
                hostname === '127.0.0.1' ||
                hostname.match(/^192\.168\./) ||
                hostname.match(/^10\./) ||
                hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
                throw new Error('Private network addresses are not allowed');
            }
        } catch (error) {
            throw new Error('Invalid feed URL: ' + error.message);
        }

        // Create AbortController for timeout handling (better browser support)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            // Using RSS2JSON service as a CORS proxy
            // Note: This sends feed URLs to a third-party service (rss2json.com)
            // For production use, consider implementing server-side RSS parsing for better privacy
            const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch feed: HTTP ${response.status}`);
            }

            const data = await response.json();
            
            // Log the API response for debugging
            console.log('RSS2JSON API response:', data);
            
            if (data.status !== 'ok') {
                // Provide more detailed error message
                const errorDetail = data.message || 'Failed to parse feed';
                console.error('RSS2JSON error:', errorDetail);
                throw new Error(errorDetail);
            }

            // Validate that we have feed data
            if (!data.feed) {
                throw new Error('Invalid feed data received from RSS parser');
            }

            return {
                url: url,
                title: data.feed.title || 'Untitled Feed',
                description: data.feed.description || '',
                link: data.feed.link || '',
                items: data.items || []
            };
        } catch (error) {
            clearTimeout(timeoutId);
            
            // Retry logic for transient failures (network errors, temporary unavailability)
            // Note: We do NOT retry timeout errors (AbortError) as they indicate the server 
            // is unresponsive or the request is taking too long
            if (retryCount < MAX_RETRIES && 
                (error.name === 'TypeError' || error.message.includes('Failed to fetch'))) {
                console.log(`Retrying feed fetch (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
                // Exponential backoff: 1s after first failure, 2s after second failure
                const delay = RETRY_DELAY * Math.pow(2, retryCount);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.fetchFeed(url, retryCount + 1);
            }
            throw error;
        }
    }

    async refreshFeed(feedUrl) {
        try {
            const updatedFeed = await this.fetchFeed(feedUrl);
            const feedIndex = this.feeds.findIndex(f => f.url === feedUrl);
            
            if (feedIndex !== -1) {
                this.feeds[feedIndex] = updatedFeed;
                this.saveData();
                this.renderFeeds();
                
                if (this.currentFeed === feedUrl) {
                    this.loadFeedArticles(feedUrl);
                }
                
                this.showNotification('Feed refreshed!', 'success');
            }
        } catch (error) {
            console.error('Error refreshing feed:', error);
            this.showNotification('Failed to refresh feed', 'error');
        }
    }

    deleteFeed(feedUrl) {
        if (confirm('Are you sure you want to delete this feed?')) {
            this.feeds = this.feeds.filter(f => f.url !== feedUrl);
            this.saveData();
            this.renderFeeds();
            
            if (this.currentFeed === feedUrl) {
                this.currentFeed = null;
                this.renderArticles();
            }
            
            this.showNotification('Feed deleted', 'success');
        }
    }

    renderFeeds() {
        const feedsList = document.getElementById('feedsList');
        
        if (this.feeds.length === 0) {
            feedsList.innerHTML = '<p class="empty-state">No feeds added yet. Click "Add Feed" to get started!</p>';
            return;
        }

        let html = '';

        // Get feeds that are not in any group
        const feedsInGroups = new Set();
        this.groups.forEach(group => {
            group.feedUrls.forEach(url => feedsInGroups.add(url));
        });

        const ungroupedFeeds = this.feeds.filter(feed => !feedsInGroups.has(feed.url));

        // Render groups
        this.groups.forEach(group => {
            const groupFeeds = this.feeds.filter(f => group.feedUrls.includes(f.url));
            const totalUnread = groupFeeds.reduce((sum, feed) => {
                return sum + feed.items.filter(item => !this.readArticles.has(item.guid || item.link)).length;
            }, 0);
            const isGroupActive = this.currentGroup === group.id;
            const isCollapsed = this.collapsedGroups.has(group.id);

            html += `
                <div class="feed-group">
                    <div class="group-header ${isGroupActive ? 'active' : ''} ${isCollapsed ? '' : 'expanded'}" onclick="rssReader.toggleGroup('${group.id}')">
                        <div class="group-info">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <span class="group-name">${this.escapeHtml(group.name)}</span>
                        </div>
                        ${totalUnread > 0 ? `<span class="feed-unread">${totalUnread}</span>` : ''}
                        <button class="btn-icon" onclick="event.stopPropagation(); rssReader.showRenameGroupModal('${group.id}')" title="Rename Group">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn-icon" onclick="event.stopPropagation(); rssReader.deleteGroup('${group.id}')" title="Delete Group">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="group-feeds ${isCollapsed ? 'collapsed' : ''}">
            `;

            groupFeeds.forEach(feed => {
                const unreadCount = feed.items.filter(item => !this.readArticles.has(item.guid || item.link)).length;
                const isActive = this.currentFeed === feed.url;
                
                html += `
                    <div class="feed-item ${isActive ? 'active' : ''}" onclick="rssReader.loadFeedArticles('${feed.url}')">
                        <div class="feed-info">
                            <div class="feed-title">${this.escapeHtml(feed.title)}</div>
                        </div>
                        ${unreadCount > 0 ? `<span class="feed-unread">${unreadCount}</span>` : ''}
                        <div class="feed-actions">
                            <button class="btn-icon" onclick="event.stopPropagation(); rssReader.showRenameFeedModal('${feed.url}')" title="Rename">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon" onclick="event.stopPropagation(); rssReader.showMoveFeedModal('${feed.url}')" title="Move to Group">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon" onclick="event.stopPropagation(); rssReader.refreshFeed('${feed.url}')" title="Refresh">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="23 4 23 10 17 10"></polyline>
                                    <polyline points="1 20 1 14 7 14"></polyline>
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                                </svg>
                            </button>
                            <button class="btn-icon" onclick="event.stopPropagation(); rssReader.deleteFeed('${feed.url}')" title="Delete">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        // Render ungrouped feeds
        if (ungroupedFeeds.length > 0) {
            if (this.groups.length > 0) {
                html += '<div class="feeds-divider">Ungrouped</div>';
            }
            
            ungroupedFeeds.forEach(feed => {
                const unreadCount = feed.items.filter(item => !this.readArticles.has(item.guid || item.link)).length;
                const isActive = this.currentFeed === feed.url;
                
                html += `
                    <div class="feed-item ${isActive ? 'active' : ''}" onclick="rssReader.loadFeedArticles('${feed.url}')">
                        <div class="feed-info">
                            <div class="feed-title">${this.escapeHtml(feed.title)}</div>
                        </div>
                        ${unreadCount > 0 ? `<span class="feed-unread">${unreadCount}</span>` : ''}
                        <div class="feed-actions">
                            <button class="btn-icon" onclick="event.stopPropagation(); rssReader.showRenameFeedModal('${feed.url}')" title="Rename">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon" onclick="event.stopPropagation(); rssReader.showMoveFeedModal('${feed.url}')" title="Move to Group">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon" onclick="event.stopPropagation(); rssReader.refreshFeed('${feed.url}')" title="Refresh">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="23 4 23 10 17 10"></polyline>
                                    <polyline points="1 20 1 14 7 14"></polyline>
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                                </svg>
                            </button>
                            <button class="btn-icon" onclick="event.stopPropagation(); rssReader.deleteFeed('${feed.url}')" title="Delete">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        feedsList.innerHTML = html;
    }

    updateFeedUnreadCounts() {
        // Efficiently update unread counts without full re-render
        // Update group unread counts
        this.groups.forEach(group => {
            const groupFeeds = this.feeds.filter(f => group.feedUrls.includes(f.url));
            const totalUnread = groupFeeds.reduce((sum, feed) => {
                return sum + feed.items.filter(item => !this.readArticles.has(item.guid || item.link)).length;
            }, 0);
            
            // Find and update the group header unread badge
            const groupHeader = document.querySelector(`.group-header[onclick*="'${group.id}'"]`);
            if (groupHeader) {
                const existingBadge = groupHeader.querySelector('.feed-unread');
                if (totalUnread > 0) {
                    if (existingBadge) {
                        existingBadge.textContent = totalUnread;
                    } else {
                        // Insert badge after group-info
                        const groupInfo = groupHeader.querySelector('.group-info');
                        if (groupInfo) {
                            groupInfo.insertAdjacentHTML('afterend', `<span class="feed-unread">${totalUnread}</span>`);
                        }
                    }
                } else if (existingBadge) {
                    existingBadge.remove();
                }
            }
        });
        
        // Update individual feed unread counts
        this.feeds.forEach(feed => {
            const unreadCount = feed.items.filter(item => !this.readArticles.has(item.guid || item.link)).length;
            
            // Find all feed items with this URL (could be in groups or ungrouped)
            const feedItems = document.querySelectorAll(`.feed-item[onclick*="'${feed.url}'"]`);
            feedItems.forEach(feedItem => {
                const existingBadge = feedItem.querySelector('.feed-unread');
                if (unreadCount > 0) {
                    if (existingBadge) {
                        existingBadge.textContent = unreadCount;
                    } else {
                        // Insert badge after feed-info
                        const feedInfo = feedItem.querySelector('.feed-info');
                        if (feedInfo) {
                            feedInfo.insertAdjacentHTML('afterend', `<span class="feed-unread">${unreadCount}</span>`);
                        }
                    }
                } else if (existingBadge) {
                    existingBadge.remove();
                }
            });
        });
    }

    loadFeedArticles(feedUrl) {
        this.currentFeed = feedUrl;
        this.currentGroup = null;
        this.currentArticle = null;
        const feed = this.feeds.find(f => f.url === feedUrl);
        
        if (feed) {
            this.articles = feed.items.map(item => ({
                ...item,
                feedTitle: feed.title,
                feedUrl: feed.url
            }));
            this.renderArticlesListPanel();
            
            // Reset content viewer
            const contentViewer = document.getElementById('contentViewer');
            contentViewer.innerHTML = `
                <div class="no-selection">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <p>No selection</p>
                    <span>Select an article to read</span>
                </div>
            `;
        }
        
        this.renderFeeds(); // Re-render to update active state
    }

    renderArticles() {
        // This method is now replaced by renderArticlesListPanel for compatibility
        this.renderArticlesListPanel();
    }

    async toggleArticle(articleId) {
        const article = this.articles.find(a => (a.guid || a.link) === articleId);
        if (!article) return;

        const articleCard = document.querySelector(`.article-card[data-article-id="${articleId}"]`);
        if (!articleCard) return;

        const expandedContent = articleCard.querySelector('.article-expanded-content');
        const expandIcon = articleCard.querySelector('.expand-icon');
        const excerpt = articleCard.querySelector('.article-excerpt');

        // Mark as read
        this.readArticles.add(articleId);
        this.saveData();
        articleCard.classList.add('read');

        // Toggle expansion
        if (expandedContent.style.display === 'none') {
            // Expand
            expandedContent.style.display = 'block';
            excerpt.style.display = 'none';
            articleCard.classList.add('expanded');
            expandIcon.style.transform = 'rotate(180deg)';

            // Load full content if not already loaded or cached
            if (expandedContent.querySelector('.loading')) {
                // Check if we have cached content
                if (article._cachedFullContent) {
                    expandedContent.innerHTML = article._cachedFullContent;
                } else {
                    try {
                        let fullContent = article.content || article.description || '';
                        fullContent = await this.extractFullText(article.link, fullContent);
                        
                        // Sanitize the content to prevent XSS
                        fullContent = this.sanitizeHtml(fullContent);

                        const contentHtml = `
                            <div class="article-body">
                                ${fullContent}
                            </div>
                            <div class="article-footer">
                                <a href="${this.escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer" class="article-link">
                                    Read original article
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                        <polyline points="15 3 21 3 21 9"></polyline>
                                        <line x1="10" y1="14" x2="21" y2="3"></line>
                                    </svg>
                                </a>
                            </div>
                        `;

                        // Cache the content
                        article._cachedFullContent = contentHtml;
                        expandedContent.innerHTML = contentHtml;
                    } catch (error) {
                        console.error('Error loading full content:', error);
                        const fallbackContent = this.sanitizeHtml(article.content || article.description || 'Failed to load content');
                        const fallbackHtml = `
                            <div class="article-body">
                                ${fallbackContent}
                            </div>
                            <div class="article-footer">
                                <a href="${this.escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer" class="article-link">
                                    Read original article
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                        <polyline points="15 3 21 3 21 9"></polyline>
                                        <line x1="10" y1="14" x2="21" y2="3"></line>
                                    </svg>
                                </a>
                            </div>
                        `;
                        article._cachedFullContent = fallbackHtml;
                        expandedContent.innerHTML = fallbackHtml;
                    }
                }
            }
        } else {
            // Collapse
            expandedContent.style.display = 'none';
            excerpt.style.display = 'block';
            articleCard.classList.remove('expanded');
            expandIcon.style.transform = 'rotate(0deg)';
        }

        // Update feed list unread counts more efficiently without full re-render
        this.updateFeedUnreadCounts();
    }

    toggleHideRead(hide) {
        this.hideRead = hide;
        this.saveData();
        this.renderArticles();
    }

    async extractFullText(url, fallbackContent) {
        // Full-text extraction based on content source setting
        if (this.contentSource === 'inline') {
            // Use inline text - strip HTML and return plain text summary
            const stripped = this.stripHtml(fallbackContent);
            const maxLength = this.INLINE_TEXT_MAX_LENGTH;
            return stripped.substring(0, maxLength) + (stripped.length > maxLength ? '...' : '');
        } else if (this.contentSource === 'feed') {
            // Use feed text (default - full content from RSS feed)
            return fallbackContent;
        } else if (this.contentSource === 'webpage') {
            // Extract from webpage - would require a service or API
            // For now, indicate this feature and fall back to feed content
            // In production, integrate with services like:
            // - Mercury Parser
            // - Mozilla Readability
            // - Custom extraction service
            return '<p><em>Note: Webpage text extraction requires additional service integration. Showing feed content.</em></p>' + fallbackContent;
        }
        
        return fallbackContent;
    }

    changeContentSource(source) {
        this.contentSource = source;
        this.saveData();
        this.showNotification(`Content source changed to ${source}`, 'success');
        
        // Clear cached content so it will be re-extracted with new source
        this.articles.forEach(article => {
            delete article._cachedFullContent;
        });
    }

    async login() {
        const emailInput = document.getElementById('loginEmailInput');
        const passwordInput = document.getElementById('loginPasswordInput');
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            alert('Please enter both email and password');
            return;
        }

        if (password.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }

        try {
            // Use Supabase Authentication if available
            if (this.supabaseReady && window.supabaseClient) {
                const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (error) throw error;
                
                this.user = { 
                    email: data.user.email,
                    uid: data.user.id
                };
                this.syncEnabled = true;
                this.saveData();
                this.updateUserUI();
                
                emailInput.value = '';
                passwordInput.value = '';
                this.closeModal('loginModal');
                
                this.showNotification('Logged in successfully!', 'success');
                
                // Sync from Supabase after login
                await this.syncFromSupabase();
            } else {
                // Fallback to localStorage-based authentication (demo mode)
                const storedUsers = JSON.parse(localStorage.getItem('rss_users') || '{}');
                
                if (!storedUsers[email]) {
                    alert('User not found. Please register first or configure Supabase.');
                    return;
                }

                if (storedUsers[email].password !== this.hashPassword(password)) {
                    alert('Invalid password');
                    return;
                }

                this.user = { email };
                this.syncEnabled = true;
                this.saveData();
                this.updateUserUI();
                
                emailInput.value = '';
                passwordInput.value = '';
                this.closeModal('loginModal');
                
                this.showNotification('Logged in successfully (offline mode)!', 'success');
                
                // Sync from localStorage after login
                await this.syncFromServer();
            }
        } catch (error) {
            console.error('Login error:', error);
            // Use error codes or status when available, fallback to message matching
            const errorMsg = error.message || '';
            const errorCode = error.code || error.status;
            
            if (errorCode === SUPABASE_ERROR_CODES.INVALID_CREDENTIALS || 
                errorMsg.toLowerCase().includes('invalid login') || 
                errorMsg.toLowerCase().includes('invalid credentials')) {
                alert('Invalid email or password');
            } else if (errorCode === SUPABASE_ERROR_CODES.EMAIL_NOT_CONFIRMED || 
                       errorMsg.toLowerCase().includes('email not confirmed')) {
                alert('Please confirm your email address before logging in');
            } else {
                alert('Login failed: ' + (errorMsg || 'Please try again.'));
            }
        }
    }

    async register() {
        const emailInput = document.getElementById('loginEmailInput');
        const passwordInput = document.getElementById('loginPasswordInput');
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            alert('Please enter both email and password');
            return;
        }

        if (password.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }

        if (!email.includes('@') || !email.includes('.')) {
            alert('Please enter a valid email address');
            return;
        }

        try {
            // Use Supabase Authentication if available
            if (this.supabaseReady && window.supabaseClient) {
                const { data, error } = await window.supabaseClient.auth.signUp({
                    email: email,
                    password: password
                });
                
                if (error) throw error;
                
                this.user = { 
                    email: data.user.email,
                    uid: data.user.id
                };
                this.syncEnabled = true;
                this.saveData();
                this.updateUserUI();
                
                emailInput.value = '';
                passwordInput.value = '';
                this.closeModal('loginModal');
                
                this.showNotification('Registered successfully! Please check your email to confirm.', 'success');
                
                // Initial sync to Supabase
                await this.syncToSupabase();
            } else {
                // Fallback to localStorage-based registration (demo mode)
                const storedUsers = JSON.parse(localStorage.getItem('rss_users') || '{}');
                
                if (storedUsers[email]) {
                    alert('User already exists. Please login instead or configure Supabase.');
                    return;
                }

                storedUsers[email] = {
                    password: this.hashPassword(password),
                    createdAt: new Date().toISOString()
                };

                localStorage.setItem('rss_users', JSON.stringify(storedUsers));

                this.user = { email };
                this.syncEnabled = true;
                this.saveData();
                this.updateUserUI();
                
                emailInput.value = '';
                passwordInput.value = '';
                this.closeModal('loginModal');
                
                this.showNotification('Registered successfully (offline mode)!', 'success');
            }
        } catch (error) {
            console.error('Registration error:', error);
            // Use error codes or status when available, fallback to message matching
            const errorMsg = error.message || '';
            const errorCode = error.code || error.status;
            
            if (errorMsg.toLowerCase().includes('already registered') || 
                errorMsg.toLowerCase().includes('already exists') ||
                errorCode === '23505') { // Postgres unique constraint violation
                alert('User already exists. Please login instead.');
            } else if (errorMsg.toLowerCase().includes('invalid email')) {
                alert('Invalid email address');
            } else {
                alert('Registration failed: ' + (errorMsg || 'Please try again.'));
            }
        }
    }

    async signInWithGoogle() {
        try {
            // Use Supabase Google Sign-In if available
            if (this.supabaseReady && window.supabaseClient) {
                const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: window.location.origin
                    }
                });
                
                if (error) throw error;
                
                // The user will be redirected to Google for authentication
                // After authentication, they'll be redirected back to the app
                // The onAuthStateChange listener will handle the rest
                this.showNotification('Redirecting to Google...', 'success');
            } else {
                alert('Supabase is not configured. Please configure Supabase to use Google Sign-In.');
            }
        } catch (error) {
            console.error('Google Sign-In error:', error);
            alert('Google Sign-In failed: ' + (error.message || 'Please try again.'));
        }
    }

    async logout() {
        if (confirm('Are you sure you want to logout?')) {
            try {
                // Use Supabase signOut if available
                if (this.supabaseReady && window.supabaseClient) {
                    await window.supabaseClient.auth.signOut();
                }
                
                this.user = null;
                this.syncEnabled = false;
                localStorage.removeItem('rss_user');
                
                // Remove Supabase subscription if exists
                if (this.supabaseSubscription) {
                    this.supabaseSubscription.unsubscribe();
                    this.supabaseSubscription = null;
                }
                
                this.updateUserUI();
                this.showNotification('Logged out successfully', 'success');
            } catch (error) {
                console.error('Logout error:', error);
                this.showNotification('Logout failed', 'error');
            }
        }
    }

    updateUserUI() {
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const userEmail = document.getElementById('userEmail');

        if (this.user) {
            if (loginBtn) loginBtn.style.display = 'none';
            if (userInfo) userInfo.style.display = 'flex';
            if (userEmail) userEmail.textContent = this.user.email;
        } else {
            if (loginBtn) loginBtn.style.display = 'flex';
            if (userInfo) userInfo.style.display = 'none';
        }
    }

    hashPassword(password) {
        // WARNING: This is a DEMO implementation only!
        // DO NOT use in production. Use bcrypt, Argon2, or PBKDF2 with proper salting.
        // This simple hash is for demonstration purposes to show the concept.
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }

    async syncToSupabase() {
        // Sync data to Supabase for real-time cross-device sync
        if (!this.user || !this.user.uid || !window.supabaseClient) {
            return;
        }

        try {
            const syncData = {
                user_id: this.user.uid,
                feeds: this.feeds,
                groups: this.groups,
                read_articles: [...this.readArticles],
                hide_read: this.hideRead,
                dark_mode: this.darkMode,
                content_source: this.contentSource,
                sidebar_collapsed: this.sidebarCollapsed,
                last_sync: new Date().toISOString()
            };

            // Upsert to Supabase - creates/updates row for the user
            const { error } = await window.supabaseClient
                .from('user_settings')
                .upsert(syncData, { onConflict: 'user_id' });
            
            if (error) throw error;
            
            console.log('Data synced to Supabase');
        } catch (error) {
            console.error('Error syncing to Supabase:', error);
        }
    }

    async syncFromSupabase() {
        // Load data from Supabase
        if (!this.user || !this.user.uid || !window.supabaseClient) {
            return;
        }

        try {
            const { data, error } = await window.supabaseClient
                .from('user_settings')
                .select('*')
                .eq('user_id', this.user.uid)
                .single();

            if (error && error.code !== SUPABASE_ERROR_CODES.NO_ROWS) {
                throw error;
            }

            if (data) {
                // Merge feeds from both sources to prevent data loss
                // Keep local feeds and add any feeds from Supabase that aren't already present
                // Note: When URLs match, local version takes precedence to preserve recent changes
                if (data.feeds && Array.isArray(data.feeds)) {
                    const localFeedUrls = new Set(this.feeds.map(f => f?.url).filter(Boolean));
                    const supabaseFeeds = data.feeds.filter(f => f?.url && !localFeedUrls.has(f.url));
                    this.feeds = [...this.feeds, ...supabaseFeeds];
                }
                
                // Merge groups from both sources
                if (data.groups && Array.isArray(data.groups)) {
                    const localGroupIds = new Set(this.groups.map(g => g?.id).filter(Boolean));
                    const supabaseGroups = data.groups.filter(g => g?.id && !localGroupIds.has(g.id));
                    this.groups = [...this.groups, ...supabaseGroups];
                }
                
                // Merge read articles (union of both sets)
                if (data.read_articles && Array.isArray(data.read_articles)) {
                    data.read_articles.forEach(id => id != null && this.readArticles.add(id));
                }
                
                // Keep other settings from Supabase only if not already set locally
                this.hideRead = data.hide_read !== undefined ? data.hide_read : this.hideRead;
                this.darkMode = data.dark_mode !== undefined ? data.dark_mode : this.darkMode;
                this.contentSource = data.content_source ?? this.contentSource;
                this.sidebarCollapsed = data.sidebar_collapsed !== undefined ? data.sidebar_collapsed : this.sidebarCollapsed;

                // Update localStorage
                localStorage.setItem('rss_feeds', JSON.stringify(this.feeds));
                localStorage.setItem('rss_groups', JSON.stringify(this.groups));
                localStorage.setItem('rss_read_articles', JSON.stringify([...this.readArticles]));
                localStorage.setItem('rss_hide_read', JSON.stringify(this.hideRead));
                localStorage.setItem('rss_dark_mode', JSON.stringify(this.darkMode));
                localStorage.setItem('rss_content_source', this.contentSource);
                localStorage.setItem('rss_sidebar_collapsed', JSON.stringify(this.sidebarCollapsed));

                this.renderFeeds();
                this.renderArticles();
                
                this.showNotification('Synced from Supabase!', 'success');
            }
        } catch (error) {
            console.error('Error syncing from Supabase:', error);
        }
    }

    setupSupabaseListener() {
        // Set up real-time listener for instant updates across devices
        if (!this.user || !this.user.uid || !window.supabaseClient) {
            return;
        }

        try {
            // Unsubscribe from previous listener if exists
            if (this.supabaseSubscription) {
                this.supabaseSubscription.unsubscribe();
            }

            // Reset first event flag
            this.supabaseListenerFirstEvent = true;

            // Listen for real-time updates
            this.supabaseSubscription = window.supabaseClient
                .channel('user_settings_changes')
                .on('postgres_changes', 
                    { 
                        event: '*', 
                        schema: 'public', 
                        table: 'user_settings',
                        filter: `user_id=eq.${this.user.uid}`
                    }, 
                    (payload) => {
                        // Skip the first event (initial data load)
                        if (this.supabaseListenerFirstEvent) {
                            this.supabaseListenerFirstEvent = false;
                            return;
                        }
                        
                        if (payload.new) {
                            const data = payload.new;
                            
                            // Update local state with Supabase data
                            this.feeds = data.feeds ?? this.feeds;
                            this.groups = data.groups ?? this.groups;
                            this.readArticles = new Set(data.read_articles ?? []);
                            this.hideRead = data.hide_read !== undefined ? data.hide_read : this.hideRead;
                            this.darkMode = data.dark_mode !== undefined ? data.dark_mode : this.darkMode;
                            this.contentSource = data.content_source ?? this.contentSource;
                            this.sidebarCollapsed = data.sidebar_collapsed !== undefined ? data.sidebar_collapsed : this.sidebarCollapsed;

                            // Update localStorage (without triggering another Supabase sync)
                            localStorage.setItem('rss_feeds', JSON.stringify(this.feeds));
                            localStorage.setItem('rss_groups', JSON.stringify(this.groups));
                            localStorage.setItem('rss_read_articles', JSON.stringify([...this.readArticles]));
                            localStorage.setItem('rss_hide_read', JSON.stringify(this.hideRead));
                            localStorage.setItem('rss_dark_mode', JSON.stringify(this.darkMode));
                            localStorage.setItem('rss_content_source', this.contentSource);
                            localStorage.setItem('rss_sidebar_collapsed', JSON.stringify(this.sidebarCollapsed));

                            // Update UI
                            this.renderFeeds();
                            this.renderArticles();
                            
                            console.log('Real-time update received from Supabase');
                        }
                    }
                )
                .subscribe();
        } catch (error) {
            console.error('Error setting up Supabase listener:', error);
        }
    }

    async syncToServer() {
        // Fallback localStorage-based sync (demo mode)
        if (!this.user) return;

        const syncData = {
            feeds: this.feeds,
            groups: this.groups,
            readArticles: [...this.readArticles],
            hideRead: this.hideRead,
            darkMode: this.darkMode,
            contentSource: this.contentSource,
            lastSync: new Date().toISOString()
        };

        localStorage.setItem(`rss_sync_${this.user.email}`, JSON.stringify(syncData));
    }

    async syncFromServer() {
        // Fallback localStorage-based sync (demo mode)
        if (!this.user) return;

        try {
            const syncData = localStorage.getItem(`rss_sync_${this.user.email}`);
            if (syncData) {
                const data = JSON.parse(syncData);
                
                // Merge data (prefer server data)
                this.feeds = data.feeds || this.feeds;
                this.groups = data.groups || this.groups;
                this.readArticles = new Set(data.readArticles || []);
                this.hideRead = data.hideRead !== undefined ? data.hideRead : this.hideRead;
                this.darkMode = data.darkMode !== undefined ? data.darkMode : this.darkMode;
                this.contentSource = data.contentSource || this.contentSource;

                this.saveData();
                this.renderFeeds();
                this.renderArticles();
                
                this.showNotification('Synced from local storage!', 'success');
            }
        } catch (error) {
            console.error('Sync error:', error);
        }
    }

    async importOpml() {
        const fileInput = document.getElementById('opmlFileInput');
        const file = fileInput.files[0];

        if (!file) {
            alert('Please select an OPML file');
            return;
        }

        try {
            const text = await file.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, 'text/xml');
            
            const outlines = xmlDoc.querySelectorAll('outline[xmlUrl], outline[xmlurl]');
            let imported = 0;

            for (const outline of outlines) {
                const url = outline.getAttribute('xmlUrl') || outline.getAttribute('xmlurl');
                if (url && !this.feeds.some(f => f.url === url)) {
                    try {
                        const feed = await this.fetchFeed(url);
                        this.feeds.push(feed);
                        imported++;
                    } catch (error) {
                        console.error(`Failed to import feed: ${url}`, error);
                    }
                }
            }

            this.saveData();
            this.renderFeeds();
            this.closeModal('importOpmlModal');
            this.showNotification(`Successfully imported ${imported} feeds!`, 'success');
        } catch (error) {
            console.error('Error importing OPML:', error);
            alert('Failed to import OPML file');
        }
    }

    exportOpml() {
        const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
    <head>
        <title>RSS Web Reader Feeds</title>
        <dateCreated>${new Date().toUTCString()}</dateCreated>
    </head>
    <body>
${this.feeds.map(feed => `        <outline type="rss" text="${this.escapeXml(feed.title)}" title="${this.escapeXml(feed.title)}" xmlUrl="${this.escapeXml(feed.url)}" htmlUrl="${this.escapeXml(feed.link)}"/>`).join('\n')}
    </body>
</opml>`;

        const blob = new Blob([opml], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rss-feeds-${Date.now()}.opml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showNotification('OPML exported successfully!', 'success');
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `${type}-message`;
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.top = '80px';
        notification.style.right = '20px';
        notification.style.zIndex = '1000';
        notification.style.maxWidth = '300px';
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    sanitizeHtml(html) {
        // Create a temporary div to parse HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;
        
        // Define allowed tags and attributes
        const allowedTags = ['p', 'br', 'strong', 'em', 'u', 'a', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'span', 'div'];
        const allowedAttributes = {
            'a': ['href', 'title', 'target', 'rel'],
            'img': ['src', 'alt', 'title', 'width', 'height'],
            '*': ['class']
        };

        // Recursively clean nodes
        const cleanNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.cloneNode();
            }
            
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return null;
            }

            const tagName = node.tagName.toLowerCase();
            
            // Remove disallowed tags
            if (!allowedTags.includes(tagName)) {
                // For disallowed tags, keep their text content
                const textNode = document.createTextNode(node.textContent);
                return textNode;
            }

            // Create clean element
            const cleanElement = document.createElement(tagName);
            
            // Copy allowed attributes
            const tagAttributes = allowedAttributes[tagName] || [];
            const globalAttributes = allowedAttributes['*'] || [];
            const allowedAttrs = [...tagAttributes, ...globalAttributes];
            
            for (const attr of node.attributes) {
                if (allowedAttrs.includes(attr.name)) {
                    // Additional validation for href and src
                    if (attr.name === 'href' || attr.name === 'src') {
                        const value = attr.value.trim();
                        // Only allow http and https URLs (no relative URLs for security)
                        if (value.match(/^https?:\/\//i)) {
                            cleanElement.setAttribute(attr.name, value);
                        }
                    } else {
                        cleanElement.setAttribute(attr.name, attr.value);
                    }
                }
            }

            // Ensure rel="noopener noreferrer" on external links
            if (tagName === 'a') {
                const existingRel = cleanElement.getAttribute('rel') || '';
                const relValues = new Set(existingRel.split(/\s+/).filter(v => v));
                relValues.add('noopener');
                relValues.add('noreferrer');
                cleanElement.setAttribute('rel', Array.from(relValues).join(' '));
            }

            // Recursively clean children
            for (const child of node.childNodes) {
                const cleanChild = cleanNode(child);
                if (cleanChild) {
                    cleanElement.appendChild(cleanChild);
                }
            }

            return cleanElement;
        };

        const cleaned = document.createElement('div');
        for (const child of temp.childNodes) {
            const cleanChild = cleanNode(child);
            if (cleanChild) {
                cleaned.appendChild(cleanChild);
            }
        }

        return cleaned.innerHTML;
    }

    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    stripHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 60) {
            return `${minutes}m ago`;
        } else if (hours < 24) {
            return `${hours}h ago`;
        } else if (days < 7) {
            return `${days}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    toggleDarkMode(enabled) {
        this.darkMode = enabled;
        if (enabled) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        this.saveData();
    }

    toggleSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        const sidebar = document.querySelector('.sidebar');
        const floatingToggle = document.getElementById('floatingMenuToggle');
        
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
        }
        
        // Show/hide floating menu toggle based on sidebar state
        if (floatingToggle) {
            if (this.sidebarCollapsed) {
                floatingToggle.style.display = 'flex';
            } else {
                floatingToggle.style.display = 'none';
            }
        }
        
        this.saveData();
    }

    addGroup() {
        const input = document.getElementById('groupNameInput');
        const name = input?.value.trim();

        if (!name) {
            alert('Please enter a group name');
            return;
        }

        // Check if group already exists
        if (this.groups.some(g => g.name === name)) {
            alert('A group with this name already exists');
            return;
        }

        // Generate robust UUID with fallback
        const id = crypto.randomUUID ? 
            crypto.randomUUID() : 
            'group-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);

        this.groups.push({
            id: id,
            name: name,
            feedUrls: []
        });

        this.saveData();
        this.renderFeeds();
        input.value = '';
        this.closeModal('addGroupModal');
        this.showNotification('Group created successfully!', 'success');
    }

    deleteGroup(groupId) {
        if (confirm('Are you sure you want to delete this group? Feeds in this group will not be deleted.')) {
            this.groups = this.groups.filter(g => g.id !== groupId);
            this.saveData();
            this.renderFeeds();
            this.showNotification('Group deleted', 'success');
        }
    }

    showRenameFeedModal(feedUrl) {
        const feed = this.feeds.find(f => f.url === feedUrl);
        if (!feed) return;
        
        const input = document.getElementById('renameFeedInput');
        if (input) {
            input.value = feed.title;
            input.dataset.feedUrl = feedUrl;
        }
        this.showModal('renameFeedModal');
    }

    renameFeed() {
        const input = document.getElementById('renameFeedInput');
        const newName = input.value.trim();
        const feedUrl = input.dataset.feedUrl;
        
        if (!newName) {
            alert('Please enter a feed name');
            return;
        }
        
        const feed = this.feeds.find(f => f.url === feedUrl);
        if (feed) {
            feed.title = newName;
            this.saveData();
            this.renderFeeds();
            this.closeModal('renameFeedModal');
            this.showNotification('Feed renamed successfully!', 'success');
        }
    }

    showRenameGroupModal(groupId) {
        const group = this.groups.find(g => g.id === groupId);
        if (!group) return;
        
        const input = document.getElementById('renameGroupInput');
        if (input) {
            input.value = group.name;
            input.dataset.groupId = groupId;
        }
        this.showModal('renameGroupModal');
    }

    renameGroup() {
        const input = document.getElementById('renameGroupInput');
        const newName = input.value.trim();
        const groupId = input.dataset.groupId;
        
        if (!newName) {
            alert('Please enter a group name');
            return;
        }
        
        // Check if another group with this name exists (excluding current group)
        if (this.groups.some(g => g.name === newName && g.id !== groupId)) {
            alert('A group with this name already exists');
            return;
        }
        
        const group = this.groups.find(g => g.id === groupId);
        if (group) {
            group.name = newName;
            this.saveData();
            this.renderFeeds();
            this.closeModal('renameGroupModal');
            this.showNotification('Group renamed successfully!', 'success');
        }
    }

    showMoveFeedModal(feedUrl) {
        const feed = this.feeds.find(f => f.url === feedUrl);
        if (!feed) return;
        
        // Populate the group select dropdown
        const groupSelect = document.getElementById('moveFeedGroupSelect');
        if (groupSelect) {
            groupSelect.innerHTML = '<option value="">No Group</option>' + 
                this.groups.map(group => 
                    `<option value="${group.id}">${this.escapeHtml(group.name)}</option>`
                ).join('');
            
            // Set current group as selected
            const currentGroup = this.groups.find(g => g.feedUrls.includes(feedUrl));
            if (currentGroup) {
                groupSelect.value = currentGroup.id;
            } else {
                groupSelect.value = '';
            }
            
            groupSelect.dataset.feedUrl = feedUrl;
        }
        this.showModal('moveFeedModal');
    }

    moveFeed() {
        const groupSelect = document.getElementById('moveFeedGroupSelect');
        const feedUrl = groupSelect.dataset.feedUrl;
        const newGroupId = groupSelect.value;
        
        this.assignFeedToGroup(feedUrl, newGroupId);
        this.closeModal('moveFeedModal');
        
        const groupName = newGroupId ? 
            this.groups.find(g => g.id === newGroupId)?.name : 'Ungrouped';
        this.showNotification(`Feed moved to ${groupName}`, 'success');
    }

    assignFeedToGroup(feedUrl, groupId) {
        // Remove feed from all groups first
        this.groups.forEach(group => {
            group.feedUrls = group.feedUrls.filter(url => url !== feedUrl);
        });

        // Add to new group if specified
        if (groupId) {
            const group = this.groups.find(g => g.id === groupId);
            if (group && !group.feedUrls.includes(feedUrl)) {
                group.feedUrls.push(feedUrl);
            }
        }

        this.saveData();
        this.renderFeeds();
    }

    loadGroupArticles(groupId) {
        this.currentGroup = groupId;
        this.currentFeed = null;
        this.currentArticle = null;
        
        const group = this.groups.find(g => g.id === groupId);
        if (group) {
            // Collect all articles from feeds in this group
            this.articles = [];
            group.feedUrls.forEach(feedUrl => {
                const feed = this.feeds.find(f => f.url === feedUrl);
                if (feed) {
                    const feedArticles = feed.items.map(item => ({
                        ...item,
                        feedTitle: feed.title,
                        feedUrl: feed.url
                    }));
                    this.articles.push(...feedArticles);
                }
            });

            // Sort by date
            this.articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
            this.renderArticlesListPanel();
            
            // Reset content viewer
            const contentViewer = document.getElementById('contentViewer');
            contentViewer.innerHTML = `
                <div class="no-selection">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <p>No selection</p>
                    <span>Select an article to read</span>
                </div>
            `;
        }
        
        this.renderFeeds(); // Re-render to update active state
    }

    async syncAllFeeds() {
        if (this.feeds.length === 0) {
            this.showNotification('No feeds to sync', 'error');
            return;
        }
        
        // Prevent concurrent sync operations
        if (this.isSyncing) {
            console.log('Sync already in progress, skipping...');
            return;
        }
        
        this.isSyncing = true;

        const syncButton = document.getElementById('syncAllBtn');
        if (syncButton) {
            syncButton.disabled = true;
            syncButton.textContent = 'Syncing...';
        }

        // Add rate limiting: batch feeds into groups of 5 with 1 second delay between batches
        const batchSize = 5;
        const batchDelay = 1000; // 1 second between batches
        const results = [];

        for (let i = 0; i < this.feeds.length; i += batchSize) {
            const batch = this.feeds.slice(i, i + batchSize);
            const batchPromises = batch.map(feed => this.fetchFeed(feed.url));
            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults);

            // Add delay between batches (except for the last batch)
            if (i + batchSize < this.feeds.length) {
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }
        }

        let successCount = 0;
        let errorCount = 0;

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                this.feeds[index] = result.value;
                successCount++;
            } else {
                console.error(`Failed to sync feed: ${this.feeds[index].url}`, result.reason);
                errorCount++;
            }
        });

        this.saveData();
        this.renderFeeds();
        
        // Refresh current view if needed
        if (this.currentFeed) {
            this.loadFeedArticles(this.currentFeed);
        } else if (this.currentGroup) {
            this.loadGroupArticles(this.currentGroup);
        }

        if (syncButton) {
            syncButton.disabled = false;
            syncButton.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                Sync All
            `;
        }
        
        this.isSyncing = false; // Reset sync flag

        if (errorCount === 0) {
            this.showNotification(`Successfully synced ${successCount} feeds!`, 'success');
        } else {
            this.showNotification(`Synced ${successCount} feeds, ${errorCount} failed`, 'error');
        }
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('/service-worker.js');
                console.log('Service Worker registered');
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    toggleGroup(groupId) {
        if (this.collapsedGroups.has(groupId)) {
            this.collapsedGroups.delete(groupId);
        } else {
            this.collapsedGroups.add(groupId);
        }
        this.renderFeeds();
    }

    toggleSettings() {
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) {
            settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
        }
    }

    renderArticlesListPanel() {
        const articlesList = document.getElementById('articlesList');
        const articlesTitle = document.getElementById('articlesPanelTitle');
        
        if (this.feeds.length === 0) {
            articlesList.innerHTML = '<div class="welcome-message-compact"><p>Add feeds to get started</p></div>';
            articlesTitle.textContent = 'Select a feed';
            return;
        }

        if (this.articles.length === 0) {
            articlesList.innerHTML = '<div class="welcome-message-compact"><p>Select a feed to view articles</p></div>';
            articlesTitle.textContent = 'Select a feed';
            return;
        }

        // Update title
        if (this.currentFeed) {
            const feed = this.feeds.find(f => f.url === this.currentFeed);
            articlesTitle.textContent = feed ? feed.title : 'Articles';
        } else if (this.currentGroup) {
            const group = this.groups.find(g => g.id === this.currentGroup);
            articlesTitle.textContent = group ? group.name : 'Articles';
        } else {
            articlesTitle.textContent = 'Articles';
        }

        // Render article items
        articlesList.innerHTML = this.articles.map(article => {
            const articleId = article.guid || article.link;
            const isRead = this.readArticles.has(articleId);
            const shouldHide = this.hideRead && isRead;
            const isActive = this.currentArticle === articleId;
            
            if (shouldHide) return '';

            return `
                <div class="article-item ${isRead ? 'read' : 'unread'} ${isActive ? 'active' : ''}" onclick="rssReader.displayArticle('${this.escapeHtml(articleId).replace(/'/g, "\\'")}')">
                    <div class="article-item-title">${this.escapeHtml(article.title)}</div>
                    <div class="article-item-meta">
                        <span class="article-item-source">${this.escapeHtml(article.feedTitle || '')}</span>
                        <span class="article-item-date">${this.formatDate(article.pubDate)}</span>
                    </div>
                    <div class="article-item-excerpt">${this.stripHtml(article.description || '').substring(0, 100)}...</div>
                </div>
            `;
        }).join('');
    }

    async displayArticle(articleId) {
        const article = this.articles.find(a => (a.guid || a.link) === articleId);
        if (!article) return;

        this.currentArticle = articleId;
        
        // Mark as read
        this.readArticles.add(articleId);
        this.saveData();
        
        // Update UI more efficiently - only update the specific article item and unread counts
        const articleItems = document.querySelectorAll('.article-item');
        articleItems.forEach(item => {
            const itemArticleId = item.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (itemArticleId === articleId) {
                item.classList.add('read');
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Update unread counts efficiently
        this.updateFeedUnreadCounts();

        // Display content
        const contentViewer = document.getElementById('contentViewer');
        
        // Show loading state
        contentViewer.innerHTML = '<div class="loading">Loading article...</div>';

        try {
            let fullContent = article.content || article.description || '';
            fullContent = await this.extractFullText(article.link, fullContent);
            
            // Sanitize the content to prevent XSS
            fullContent = this.sanitizeHtml(fullContent);

            const contentHtml = `
                <div class="article-content">
                    <div class="article-content-header">
                        <h1 class="article-content-title">${this.escapeHtml(article.title)}</h1>
                        <div class="article-content-meta">
                            <span class="article-content-source">${this.escapeHtml(article.feedTitle)}</span>
                            <span class="article-content-date">${this.formatDate(article.pubDate)}</span>
                        </div>
                    </div>
                    <div class="article-body">
                        ${fullContent}
                    </div>
                    <div class="article-footer">
                        <a href="${this.escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer" class="article-link">
                            Read original article
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </a>
                    </div>
                </div>
            `;

            contentViewer.innerHTML = contentHtml;
        } catch (error) {
            console.error('Error loading article:', error);
            const fallbackContent = this.sanitizeHtml(article.content || article.description || 'Failed to load content');
            contentViewer.innerHTML = `
                <div class="article-content">
                    <div class="article-content-header">
                        <h1 class="article-content-title">${this.escapeHtml(article.title)}</h1>
                        <div class="article-content-meta">
                            <span class="article-content-source">${this.escapeHtml(article.feedTitle)}</span>
                            <span class="article-content-date">${this.formatDate(article.pubDate)}</span>
                        </div>
                    </div>
                    <div class="article-body">
                        ${fallbackContent}
                    </div>
                    <div class="article-footer">
                        <a href="${this.escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer" class="article-link">
                            Read original article
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </a>
                    </div>
                </div>
            `;
        }
    }
}

// Global function for modal closing
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Initialize the RSS Reader
const rssReader = new RSSReader();
