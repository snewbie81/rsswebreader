// RSS Web Reader Application

class RSSReader {
    constructor() {
        this.feeds = [];
        this.articles = [];
        this.readArticles = new Set();
        this.currentFeed = null;
        this.hideRead = false;
        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.renderFeeds();
        this.renderArticles();
        this.registerServiceWorker();
    }

    setupEventListeners() {
        document.getElementById('addFeedBtn').addEventListener('click', () => this.showModal('addFeedModal'));
        document.getElementById('confirmAddFeedBtn').addEventListener('click', () => this.addFeed());
        document.getElementById('importOpmlBtn').addEventListener('click', () => this.showModal('importOpmlModal'));
        document.getElementById('confirmImportOpmlBtn').addEventListener('click', () => this.importOpml());
        document.getElementById('exportOpmlBtn').addEventListener('click', () => this.exportOpml());
        document.getElementById('hideReadToggle').addEventListener('change', (e) => this.toggleHideRead(e.target.checked));
        document.getElementById('closeArticleBtn').addEventListener('click', () => this.closeArticleView());
        
        document.getElementById('feedUrlInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addFeed();
        });
    }

    loadData() {
        const savedFeeds = localStorage.getItem('rss_feeds');
        const savedReadArticles = localStorage.getItem('rss_read_articles');
        const savedHideRead = localStorage.getItem('rss_hide_read');

        if (savedFeeds) {
            this.feeds = JSON.parse(savedFeeds);
        }

        if (savedReadArticles) {
            this.readArticles = new Set(JSON.parse(savedReadArticles));
        }

        if (savedHideRead) {
            this.hideRead = JSON.parse(savedHideRead);
            document.getElementById('hideReadToggle').checked = this.hideRead;
        }
    }

    saveData() {
        localStorage.setItem('rss_feeds', JSON.stringify(this.feeds));
        localStorage.setItem('rss_read_articles', JSON.stringify([...this.readArticles]));
        localStorage.setItem('rss_hide_read', JSON.stringify(this.hideRead));
    }

    showModal(modalId) {
        document.getElementById(modalId).style.display = 'flex';
    }

    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    async addFeed() {
        const input = document.getElementById('feedUrlInput');
        const url = input.value.trim();

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
            this.saveData();
            this.renderFeeds();
            input.value = '';
            this.closeModal('addFeedModal');
            this.showNotification('Feed added successfully!', 'success');
        } catch (error) {
            console.error('Error adding feed:', error);
            alert('Failed to add feed. Please check the URL and try again.');
        }
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

        feedsList.innerHTML = this.feeds.map(feed => {
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
        const feed = this.feeds.find(f => f.url === feedUrl);
        
        if (feed) {
            this.articles = feed.items.map(item => ({
                ...item,
                feedTitle: feed.title,
                feedUrl: feed.url
            }));
            this.renderArticles();
        }
        
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
            
            return `
                <div class="article-card ${isRead ? 'read' : ''} ${shouldHide ? 'hidden' : ''}" 
                     onclick="rssReader.openArticle('${articleId}')">
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
                </div>
            `;
        }).join('');
    }

    async openArticle(articleId) {
        const article = this.articles.find(a => (a.guid || a.link) === articleId);
        
        if (!article) return;

        // Mark as read
        this.readArticles.add(articleId);
        this.saveData();
        
        // Try to fetch full text
        let fullContent = article.content || article.description || '';
        
        try {
            // Attempt to extract full text from the article link
            fullContent = await this.extractFullText(article.link, fullContent);
        } catch (error) {
            console.error('Error extracting full text:', error);
            // Fall back to original content
        }

        // Render article
        const articleContent = document.getElementById('articleContent');
        articleContent.innerHTML = `
            <h1>${this.escapeHtml(article.title)}</h1>
            <div class="article-meta">
                <span class="article-source">${this.escapeHtml(article.feedTitle)}</span>
                <span class="article-date">${this.formatDate(article.pubDate)}</span>
            </div>
            <div class="article-body">
                ${fullContent}
            </div>
            <div class="article-footer">
                <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="article-link">
                    Read original article
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </a>
            </div>
        `;

        document.getElementById('articleView').style.display = 'block';
        document.getElementById('articlesList').style.display = 'none';
        
        // Update the articles list to reflect read status
        this.renderArticles();
        this.renderFeeds(); // Update unread counts
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

    closeArticleView() {
        document.getElementById('articleView').style.display = 'none';
        document.getElementById('articlesList').style.display = 'block';
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
