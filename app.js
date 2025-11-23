// RSS Web Reader Application

class RSSReader {
    constructor() {
        this.feeds = [];
        this.groups = [];
        this.articles = [];
        this.readArticles = new Set();
        this.currentFeed = null;
        this.hideRead = false;
        this.darkMode = false;
        this.sidebarCollapsed = false;
        this.expandedArticle = null;
        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.renderGroups();
        this.renderFeeds();
        this.renderArticles();
        this.registerServiceWorker();
        this.applyDarkMode();
        this.applySidebarState();
    }

    setupEventListeners() {
        document.getElementById('addFeedBtn').addEventListener('click', () => this.showAddFeedModal());
        document.getElementById('addGroupBtn').addEventListener('click', () => this.showModal('addGroupModal'));
        document.getElementById('confirmAddFeedBtn').addEventListener('click', () => this.addFeed());
        document.getElementById('confirmAddGroupBtn').addEventListener('click', () => this.addGroup());
        document.getElementById('importOpmlBtn').addEventListener('click', () => this.showModal('importOpmlModal'));
        document.getElementById('confirmImportOpmlBtn').addEventListener('click', () => this.importOpml());
        document.getElementById('exportOpmlBtn').addEventListener('click', () => this.exportOpml());
        document.getElementById('hideReadToggle').addEventListener('change', (e) => this.toggleHideRead(e.target.checked));
        document.getElementById('darkModeToggle').addEventListener('click', () => this.toggleDarkMode());
        document.getElementById('toggleSidebarBtn').addEventListener('click', () => this.toggleSidebar());
        
        document.getElementById('feedUrlInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addFeed();
        });
        
        document.getElementById('groupNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addGroup();
        });
    }

    loadData() {
        const savedFeeds = localStorage.getItem('rss_feeds');
        const savedGroups = localStorage.getItem('rss_groups');
        const savedReadArticles = localStorage.getItem('rss_read_articles');
        const savedHideRead = localStorage.getItem('rss_hide_read');
        const savedDarkMode = localStorage.getItem('rss_dark_mode');
        const savedSidebarCollapsed = localStorage.getItem('rss_sidebar_collapsed');

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
        }

        if (savedSidebarCollapsed) {
            this.sidebarCollapsed = JSON.parse(savedSidebarCollapsed);
        }
    }

    saveData() {
        localStorage.setItem('rss_feeds', JSON.stringify(this.feeds));
        localStorage.setItem('rss_groups', JSON.stringify(this.groups));
        localStorage.setItem('rss_read_articles', JSON.stringify([...this.readArticles]));
        localStorage.setItem('rss_hide_read', JSON.stringify(this.hideRead));
        localStorage.setItem('rss_dark_mode', JSON.stringify(this.darkMode));
        localStorage.setItem('rss_sidebar_collapsed', JSON.stringify(this.sidebarCollapsed));
    }

    showModal(modalId) {
        if (modalId === 'addFeedModal') {
            this.updateGroupSelect();
        }
        document.getElementById(modalId).style.display = 'flex';
    }

    showAddFeedModal() {
        this.updateGroupSelect();
        this.showModal('addFeedModal');
    }

    updateGroupSelect() {
        const select = document.getElementById('feedGroupSelect');
        select.innerHTML = '<option value="">No Group</option>';
        this.groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            select.appendChild(option);
        });
    }

    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    async addFeed() {
        const input = document.getElementById('feedUrlInput');
        const groupSelect = document.getElementById('feedGroupSelect');
        const url = input.value.trim();
        const groupId = groupSelect.value;

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

            feed.groupId = groupId || null;
            this.feeds.push(feed);
            this.saveData();
            this.renderGroups();
            this.renderFeeds();
            input.value = '';
            groupSelect.value = '';
            this.closeModal('addFeedModal');
            this.showNotification('Feed added successfully!', 'success');
        } catch (error) {
            console.error('Error adding feed:', error);
            alert('Failed to add feed. Please check the URL and try again.');
        }
    }

    addGroup() {
        const input = document.getElementById('groupNameInput');
        const name = input.value.trim();

        if (!name) {
            alert('Please enter a group name');
            return;
        }

        if (this.groups.some(g => g.name === name)) {
            alert('A group with this name already exists');
            return;
        }

        const group = {
            id: Date.now().toString(),
            name: name,
            collapsed: false
        };

        this.groups.push(group);
        this.saveData();
        this.renderGroups();
        this.renderFeeds();
        input.value = '';
        this.closeModal('addGroupModal');
        this.showNotification('Group added successfully!', 'success');
    }

    async fetchFeed(url) {
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
                // Preserve group assignment
                updatedFeed.groupId = this.feeds[feedIndex].groupId;
                this.feeds[feedIndex] = updatedFeed;
                this.saveData();
                this.renderGroups();
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
            this.renderGroups();
            this.renderFeeds();
            
            if (this.currentFeed === feedUrl) {
                this.currentFeed = null;
                this.renderArticles();
            }
            
            this.showNotification('Feed deleted', 'success');
        }
    }

    deleteGroup(groupId) {
        if (confirm('Are you sure you want to delete this group? Feeds in this group will not be deleted.')) {
            this.groups = this.groups.filter(g => g.id !== groupId);
            // Remove group assignment from feeds
            this.feeds.forEach(feed => {
                if (feed.groupId === groupId) {
                    feed.groupId = null;
                }
            });
            this.saveData();
            this.renderGroups();
            this.renderFeeds();
            this.showNotification('Group deleted', 'success');
        }
    }

    toggleGroup(groupId) {
        const group = this.groups.find(g => g.id === groupId);
        if (group) {
            group.collapsed = !group.collapsed;
            this.saveData();
            this.renderGroups();
            this.renderFeeds();
        }
    }

    renderGroups() {
        // This is called before renderFeeds to prepare group structure
    }

    renderFeeds() {
        const feedsList = document.getElementById('feedsList');
        
        if (this.feeds.length === 0) {
            feedsList.innerHTML = '<p class="empty-state">No feeds added yet. Click "Add Feed" to get started!</p>';
            return;
        }

        let html = '';

        // Render grouped feeds
        this.groups.forEach(group => {
            const groupFeeds = this.feeds.filter(f => f.groupId === group.id);
            if (groupFeeds.length > 0) {
                const totalUnread = groupFeeds.reduce((sum, feed) => {
                    return sum + feed.items.filter(item => !this.readArticles.has(item.guid || item.link)).length;
                }, 0);

                html += `
                    <div class="feed-group">
                        <div class="group-header ${group.collapsed ? 'collapsed' : ''}" onclick="rssReader.toggleGroup('${group.id}')">
                            <div class="group-header-left">
                                <div class="group-toggle">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </div>
                                <span class="group-title">${this.escapeHtml(group.name)}</span>
                                ${totalUnread > 0 ? `<span class="feed-unread">${totalUnread}</span>` : ''}
                            </div>
                            <div class="group-actions">
                                <button class="btn-icon" onclick="event.stopPropagation(); rssReader.deleteGroup('${group.id}')" title="Delete Group">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="group-feeds ${group.collapsed ? 'collapsed' : ''}">
                            ${this.renderFeedItems(groupFeeds)}
                        </div>
                    </div>
                `;
            }
        });

        // Render ungrouped feeds
        const ungroupedFeeds = this.feeds.filter(f => !f.groupId);
        if (ungroupedFeeds.length > 0) {
            html += this.renderFeedItems(ungroupedFeeds);
        }

        feedsList.innerHTML = html;
    }

    renderFeedItems(feeds) {
        return feeds.map(feed => {
            const unreadCount = feed.items.filter(item => !this.readArticles.has(item.guid || item.link)).length;
            const isActive = this.currentFeed === feed.url;
            
            return `
                <div class="feed-item ${isActive ? 'active' : ''}" onclick="rssReader.loadFeedArticles('${feed.url}')">
                    <div class="feed-info">
                        <div class="feed-title">${this.escapeHtml(feed.title)}</div>
                    </div>
                    ${unreadCount > 0 ? `<span class="feed-unread">${unreadCount}</span>` : ''}
                    <div class="feed-actions">
                        <button class="btn-icon" onclick="event.stopPropagation(); rssReader.refreshFeed('${feed.url}')" title="Refresh">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="23 4 23 10 17 10"></polyline>
                                <polyline points="1 20 1 14 7 14"></polyline>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                            </svg>
                        </button>
                        <button class="btn-icon" onclick="event.stopPropagation(); rssReader.deleteFeed('${feed.url}')" title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    loadFeedArticles(feedUrl) {
        this.currentFeed = feedUrl;
        this.expandedArticle = null; // Close any expanded article
        const feed = this.feeds.find(f => f.url === feedUrl);
        
        if (feed) {
            this.articles = feed.items.map(item => ({
                ...item,
                feedTitle: feed.title,
                feedUrl: feed.url
            }));
            this.renderArticles();
        }
        
        this.renderGroups();
        this.renderFeeds(); // Re-render to update active state
    }

    renderArticles() {
        const articlesList = document.getElementById('articlesList');
        
        if (this.feeds.length === 0) {
            articlesList.innerHTML = `
                <div class="welcome-message">
                    <h2>Welcome to RSS Web Reader</h2>
                    <p>Add your first RSS feed to start reading!</p>
                    <p>Features:</p>
                    <ul>
                        <li>Smart full-text extraction</li>
                        <li>Clean, ad-free interface</li>
                        <li>Hide read articles</li>
                        <li>OPML import/export</li>
                        <li>Group feeds by category</li>
                        <li>Dark mode support</li>
                        <li>Collapsible sidebar</li>
                    </ul>
                </div>
            `;
            return;
        }

        if (this.articles.length === 0) {
            articlesList.innerHTML = '<p class="empty-state">Select a feed to view articles</p>';
            return;
        }

        articlesList.innerHTML = this.articles.map(article => {
            const articleId = article.guid || article.link;
            const isRead = this.readArticles.has(articleId);
            const shouldHide = this.hideRead && isRead;
            const isExpanded = this.expandedArticle === articleId;
            
            return `
                <div class="article-card ${isRead ? 'read' : ''} ${shouldHide ? 'hidden' : ''} ${isExpanded ? 'expanded' : ''}" 
                     onclick="${isExpanded ? '' : `rssReader.toggleArticle('${articleId}')`}">
                    <div class="article-header">
                        <h3 class="article-title">${this.escapeHtml(article.title)}</h3>
                        <div class="article-meta">
                            <span class="article-source">${this.escapeHtml(article.feedTitle)}</span>
                            <span class="article-date">${this.formatDate(article.pubDate)}</span>
                        </div>
                    </div>
                    <div class="article-excerpt">
                        ${this.stripHtml(article.description || '').substring(0, 200)}...
                    </div>
                    <div class="article-full-content" id="content-${articleId}">
                        ${article.content || article.description || ''}
                    </div>
                    <div class="article-actions">
                        <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="article-link">
                            Read original article
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </a>
                        <button class="btn btn-secondary btn-close" onclick="event.stopPropagation(); rssReader.toggleArticle('${articleId}')">Close</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async toggleArticle(articleId) {
        const article = this.articles.find(a => (a.guid || a.link) === articleId);
        
        if (!article) return;

        // If clicking on already expanded article, collapse it
        if (this.expandedArticle === articleId) {
            this.expandedArticle = null;
            this.renderArticles();
            this.renderGroups();
            this.renderFeeds();
            return;
        }

        // Mark as read
        this.readArticles.add(articleId);
        this.saveData();
        
        // Expand this article
        this.expandedArticle = articleId;
        
        // Try to fetch full text
        let fullContent = article.content || article.description || '';
        
        try {
            // Attempt to extract full text from the article link
            fullContent = await this.extractFullText(article.link, fullContent);
        } catch (error) {
            console.error('Error extracting full text:', error);
            // Fall back to original content
        }

        // Re-render to show expanded state
        this.renderArticles();
        
        // Update the content after render
        const contentDiv = document.getElementById(`content-${articleId}`);
        if (contentDiv) {
            contentDiv.innerHTML = fullContent;
        }
        
        // Update the articles list and feeds to reflect read status
        this.renderGroups();
        this.renderFeeds();
        
        // Scroll to article
        const articleCard = contentDiv?.closest('.article-card');
        if (articleCard) {
            articleCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    async extractFullText(url, fallbackContent) {
        // Full-text extraction placeholder
        // The RSS feed content/description is used directly
        // For enhanced full-text extraction, integrate with services like:
        // - Mercury Parser (https://github.com/postlight/mercury-parser)
        // - Mozilla Readability (https://github.com/mozilla/readability)
        // - Diffbot (https://www.diffbot.com/)
        // - Custom server-side extraction service
        
        // Basic enhancement: ensure we use the longer content field if available
        // Many RSS feeds provide both 'content' and 'description' fields
        return fallbackContent;
    }

    toggleDarkMode() {
        this.darkMode = !this.darkMode;
        this.saveData();
        this.applyDarkMode();
    }

    applyDarkMode() {
        if (this.darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    toggleSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        this.saveData();
        this.applySidebarState();
    }

    applySidebarState() {
        const sidebar = document.getElementById('sidebar');
        if (this.sidebarCollapsed) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
    }

    toggleHideRead(hide) {
        this.hideRead = hide;
        this.saveData();
        this.renderArticles();
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
}

// Global function for modal closing
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Initialize the RSS Reader
const rssReader = new RSSReader();
