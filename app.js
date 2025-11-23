// RSS Web Reader Application

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
        this.hideRead = false;
        this.darkMode = false;
        this.sidebarCollapsed = false;
        this.contentSource = 'feed'; // 'feed', 'webpage', or 'inline'
        this.user = null;
        this.syncEnabled = false;
        this.INLINE_TEXT_MAX_LENGTH = 500; // Maximum length for inline text preview
        this.firebaseReady = false;
        this.firestoreUnsubscribe = null; // Store the unsubscribe function for Firestore listener
        this.syncDebounceTimer = null; // Timer for debouncing Firestore sync
        this.SYNC_DEBOUNCE_DELAY = 1000; // Debounce delay in ms (1 second)
        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.renderFeeds();
        this.renderArticles();
        this.registerServiceWorker();
        this.initializeFirebase();
    }

    initializeFirebase() {
        // Wait for Firebase to be ready
        if (window.firebaseAuth) {
            this.firebaseReady = true;
            this.setupFirebaseAuth();
        } else {
            window.addEventListener('firebase-ready', () => {
                this.firebaseReady = true;
                this.setupFirebaseAuth();
            });
        }
    }

    setupFirebaseAuth() {
        // Listen for authentication state changes
        if (window.firebaseModules && window.firebaseAuth) {
            window.firebaseModules.onAuthStateChanged(window.firebaseAuth, async (user) => {
                if (user) {
                    // User is signed in
                    this.user = { 
                        email: user.email,
                        uid: user.uid 
                    };
                    this.syncEnabled = true;
                    
                    // First sync from Firestore to get latest data
                    await this.syncFromFirestore();
                    
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
                    this.setupFirestoreListener();
                } else {
                    // User is signed out
                    if (this.user) {
                        this.user = null;
                        this.syncEnabled = false;
                        this.updateUserUI();
                    }
                    
                    // Remove Firestore listener if exists
                    if (this.firestoreUnsubscribe) {
                        this.firestoreUnsubscribe();
                        this.firestoreUnsubscribe = null;
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
        document.getElementById('hideReadToggle').addEventListener('change', (e) => this.toggleHideRead(e.target.checked));
        
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', (e) => this.toggleDarkMode(e.target.checked));
        }

        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => this.toggleSidebar());
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
            document.getElementById('hideReadToggle').checked = this.hideRead;
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
        
        // Debounced sync to Firestore if logged in with Firebase
        if (this.user && this.syncEnabled && this.firebaseReady) {
            this.debouncedSyncToFirestore();
        } else if (this.user && this.syncEnabled) {
            // Fallback to localStorage sync (demo mode)
            this.syncToServer();
        }
    }

    debouncedSyncToFirestore() {
        // Clear existing timer
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
        }
        
        // Set new timer
        this.syncDebounceTimer = setTimeout(async () => {
            await this.syncToFirestore();
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

        try {
            const feed = await this.fetchFeed(url);
            
            // Check if feed already exists
            if (this.feeds.some(f => f.url === url)) {
                alert('This feed is already added');
                return;
            }

            this.feeds.push(feed);

            // Assign to group if selected
            if (groupSelect && groupSelect.value) {
                this.assignFeedToGroup(url, groupSelect.value);
            }

            this.saveData();
            this.renderFeeds();
            input.value = '';
            if (groupSelect) groupSelect.value = '';
            this.closeModal('addFeedModal');
            this.showNotification('Feed added successfully!', 'success');
        } catch (error) {
            console.error('Error adding feed:', error);
            alert('Failed to add feed. Please check the URL and try again.');
        }
    }

    async fetchFeed(url) {
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

        // Using RSS2JSON service as a CORS proxy
        // Note: This sends feed URLs to a third-party service (rss2json.com)
        // For production use, consider implementing server-side RSS parsing for better privacy
        const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch feed');
        }

        const data = await response.json();
        
        if (data.status !== 'ok') {
            throw new Error(data.message || 'Failed to parse feed');
        }

        return {
            url: url,
            title: data.feed.title || 'Untitled Feed',
            description: data.feed.description || '',
            link: data.feed.link || '',
            items: data.items || []
        };
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

        // Update feed list to reflect read status
        this.renderFeeds();
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
            // Use Firebase Authentication if available
            if (this.firebaseReady && window.firebaseModules && window.firebaseAuth) {
                const userCredential = await window.firebaseModules.signInWithEmailAndPassword(
                    window.firebaseAuth, 
                    email, 
                    password
                );
                
                this.user = { 
                    email: userCredential.user.email,
                    uid: userCredential.user.uid
                };
                this.syncEnabled = true;
                this.saveData();
                this.updateUserUI();
                
                emailInput.value = '';
                passwordInput.value = '';
                this.closeModal('loginModal');
                
                this.showNotification('Logged in successfully!', 'success');
                
                // Sync from Firestore after login
                await this.syncFromFirestore();
            } else {
                // Fallback to localStorage-based authentication (demo mode)
                const storedUsers = JSON.parse(localStorage.getItem('rss_users') || '{}');
                
                if (!storedUsers[email]) {
                    alert('User not found. Please register first or configure Firebase.');
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
            if (error.code === 'auth/user-not-found') {
                alert('User not found. Please register first.');
            } else if (error.code === 'auth/wrong-password') {
                alert('Invalid password');
            } else if (error.code === 'auth/invalid-email') {
                alert('Invalid email address');
            } else {
                alert('Login failed: ' + (error.message || 'Please try again.'));
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
            // Use Firebase Authentication if available
            if (this.firebaseReady && window.firebaseModules && window.firebaseAuth) {
                const userCredential = await window.firebaseModules.createUserWithEmailAndPassword(
                    window.firebaseAuth, 
                    email, 
                    password
                );
                
                this.user = { 
                    email: userCredential.user.email,
                    uid: userCredential.user.uid
                };
                this.syncEnabled = true;
                this.saveData();
                this.updateUserUI();
                
                emailInput.value = '';
                passwordInput.value = '';
                this.closeModal('loginModal');
                
                this.showNotification('Registered successfully!', 'success');
                
                // Initial sync to Firestore
                await this.syncToFirestore();
            } else {
                // Fallback to localStorage-based registration (demo mode)
                const storedUsers = JSON.parse(localStorage.getItem('rss_users') || '{}');
                
                if (storedUsers[email]) {
                    alert('User already exists. Please login instead or configure Firebase.');
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
            if (error.code === 'auth/email-already-in-use') {
                alert('User already exists. Please login instead.');
            } else if (error.code === 'auth/invalid-email') {
                alert('Invalid email address');
            } else if (error.code === 'auth/weak-password') {
                alert('Password is too weak. Please use at least 6 characters.');
            } else {
                alert('Registration failed: ' + (error.message || 'Please try again.'));
            }
        }
    }

    async signInWithGoogle() {
        try {
            // Use Firebase Google Sign-In if available
            if (this.firebaseReady && window.firebaseModules && window.firebaseAuth) {
                const provider = new window.firebaseModules.GoogleAuthProvider();
                const result = await window.firebaseModules.signInWithPopup(window.firebaseAuth, provider);
                
                this.user = { 
                    email: result.user.email,
                    uid: result.user.uid,
                    displayName: result.user.displayName,
                    photoURL: result.user.photoURL
                };
                this.syncEnabled = true;
                this.saveData();
                this.updateUserUI();
                
                this.closeModal('loginModal');
                
                this.showNotification('Signed in with Google!', 'success');
                
                // Sync from Firestore after login
                await this.syncFromFirestore();
            } else {
                alert('Firebase is not configured. Please configure Firebase to use Google Sign-In.');
            }
        } catch (error) {
            console.error('Google Sign-In error:', error);
            if (error.code === 'auth/popup-closed-by-user') {
                // User closed the popup, do nothing
            } else if (error.code === 'auth/cancelled-popup-request') {
                // Another popup request was already made
            } else {
                alert('Google Sign-In failed: ' + (error.message || 'Please try again.'));
            }
        }
    }

    async logout() {
        if (confirm('Are you sure you want to logout?')) {
            try {
                // Use Firebase signOut if available
                if (this.firebaseReady && window.firebaseModules && window.firebaseAuth) {
                    await window.firebaseModules.signOut(window.firebaseAuth);
                }
                
                this.user = null;
                this.syncEnabled = false;
                localStorage.removeItem('rss_user');
                
                // Remove Firestore listener if exists
                if (this.firestoreUnsubscribe) {
                    this.firestoreUnsubscribe();
                    this.firestoreUnsubscribe = null;
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

    async syncToFirestore() {
        // Sync data to Firestore for real-time cross-device sync
        if (!this.user || !this.user.uid || !window.firebaseDb || !window.firebaseModules) {
            return;
        }

        try {
            const syncData = {
                feeds: this.feeds,
                groups: this.groups,
                readArticles: [...this.readArticles],
                hideRead: this.hideRead,
                darkMode: this.darkMode,
                contentSource: this.contentSource,
                sidebarCollapsed: this.sidebarCollapsed,
                lastSync: new Date().toISOString()
            };

            // Save to Firestore - creates/updates document named after User ID
            await window.firebaseModules.setDoc(
                window.firebaseModules.doc(window.firebaseDb, "users", this.user.uid),
                syncData
            );
            
            console.log('Data synced to Firestore');
        } catch (error) {
            console.error('Error syncing to Firestore:', error);
        }
    }

    async syncFromFirestore() {
        // Load data from Firestore
        if (!this.user || !this.user.uid || !window.firebaseDb || !window.firebaseModules) {
            return;
        }

        try {
            const docRef = window.firebaseModules.doc(window.firebaseDb, "users", this.user.uid);
            const docSnap = await window.firebaseModules.getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // Merge data (prefer Firestore data)
                this.feeds = data.feeds || this.feeds;
                this.groups = data.groups || this.groups;
                this.readArticles = new Set(data.readArticles || []);
                this.hideRead = data.hideRead !== undefined ? data.hideRead : this.hideRead;
                this.darkMode = data.darkMode !== undefined ? data.darkMode : this.darkMode;
                this.contentSource = data.contentSource || this.contentSource;
                this.sidebarCollapsed = data.sidebarCollapsed !== undefined ? data.sidebarCollapsed : this.sidebarCollapsed;

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
                
                this.showNotification('Synced from Firestore!', 'success');
            }
        } catch (error) {
            console.error('Error syncing from Firestore:', error);
        }
    }

    setupFirestoreListener() {
        // Set up real-time listener for instant updates across devices
        if (!this.user || !this.user.uid || !window.firebaseDb || !window.firebaseModules) {
            return;
        }

        try {
            const docRef = window.firebaseModules.doc(window.firebaseDb, "users", this.user.uid);
            
            // Unsubscribe from previous listener if exists
            if (this.firestoreUnsubscribe) {
                this.firestoreUnsubscribe();
            }

            // Track if this is the first snapshot (to avoid initial update on listener setup)
            let isFirstSnapshot = true;

            // Listen for real-time updates
            this.firestoreUnsubscribe = window.firebaseModules.onSnapshot(docRef, (doc) => {
                // Skip the first snapshot (initial data load)
                if (isFirstSnapshot) {
                    isFirstSnapshot = false;
                    return;
                }
                
                if (doc.exists()) {
                    const data = doc.data();
                    
                    // Update local state with Firestore data
                    this.feeds = data.feeds || this.feeds;
                    this.groups = data.groups || this.groups;
                    this.readArticles = new Set(data.readArticles || []);
                    this.hideRead = data.hideRead !== undefined ? data.hideRead : this.hideRead;
                    this.darkMode = data.darkMode !== undefined ? data.darkMode : this.darkMode;
                    this.contentSource = data.contentSource || this.contentSource;
                    this.sidebarCollapsed = data.sidebarCollapsed !== undefined ? data.sidebarCollapsed : this.sidebarCollapsed;

                    // Update localStorage (without triggering another Firestore sync)
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
                    
                    console.log('Real-time update received from Firestore');
                }
            }, (error) => {
                console.error('Error listening to Firestore updates:', error);
            });
        } catch (error) {
            console.error('Error setting up Firestore listener:', error);
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
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
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
        
        // Update UI
        this.renderArticlesListPanel();
        this.renderFeeds();

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
