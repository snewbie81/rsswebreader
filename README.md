# RSS Web Reader

A privacy-focused, lightweight RSS feed reader built as a Progressive Web App (PWA) with offline support.

## Features

### Core Functionality
- **IndexedDB Storage**: All data stored locally (feeds, articles, groups, settings, read status)
- **Pre-fetched RSS Feeds**: GitHub Actions automatically fetch default feeds every 6 hours (eliminates CORS issues)
- **Smart RSS Fetching**: Pre-fetched JSON files first, then direct fetch with automatic RSS2JSON API fallback for CORS issues
- **Article Management**: Keeps last 50 unread articles per feed automatically
- **Manual Refresh**: Refresh all feeds on startup, manual refresh only (no auto-refresh)
- **Offline Support**: Service Worker for offline caching of application files

### UI/UX
- **3-Panel Layout**: Sidebar (280px) → Article List (400px) → Content Viewer (flex)
- **Collapsible Sidebar**: Hamburger menu for mobile/tablet
- **Collapsible Groups**: Organize feeds by tech, news, country, finance, others (alphabetical)
- **Collapsible Settings**: AMOLED mode, Hide Read articles toggle
- **Unread Indicators**: Purple dot indicators for unread articles
- **Relative Timestamps**: Human-readable time (2h ago, 1d ago, etc.)
- **Active Highlighting**: Visual feedback for selected feed/article
- **AMOLED Dark Mode**: Pure black (#000000) background for battery efficiency

### Feed Management
- **Pre-configured Feeds**: Tech, Country, and News feeds included by default
- **Add/Delete Feeds**: Easy feed management with group assignment
- **OPML Import/Export**: Full subscription portability
- **Feed Metadata**: Automatic extraction of title, description, link
- **Thumbnail Support**: Extract and display article thumbnails

### Performance Optimizations
- **Pre-fetched Feeds**: Default feeds fetched by GitHub Actions to reduce client-side requests
- **Lazy Loading Images**: Intersection Observer for efficient image loading
- **Targeted Updates**: Minimal DOM manipulation when marking articles as read
- **Event Delegation**: Reduced memory footprint with delegated event handlers
- **Page Visibility API**: Pause activity when tab is not active
- **Efficient Scrolling**: Intersection Observer ready for virtual scrolling

### Security
- **XSS Protection**: Smart HTML sanitization removes scripts, iframes, dangerous tags
- **Safe Link Handling**: External links open in new tab with rel="noopener noreferrer"
- **Content Filtering**: Removes event handlers and dangerous attributes

## Getting Started

### Deployment
This is a static web application that can be deployed to:
- GitHub Pages
- Netlify
- Vercel
- Any static web hosting service

Simply upload all files to your hosting service. No build process required.

### Local Development
1. Clone the repository
2. Serve the files using any HTTP server:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js (using npx)
   npx http-server
   ```
3. Open http://localhost:8000 in your browser

### Installing as PWA
1. Open the app in a supported browser (Chrome, Edge, Safari, Firefox)
2. Look for the "Install" prompt or option in your browser menu
3. Click "Install" to add to your home screen/desktop

## File Structure

```
├── .github/
│   └── workflows/
│       ├── static.yml      # GitHub Pages deployment
│       └── fetch-rss.yml   # RSS feed fetcher (runs every 6 hours)
├── feeds/                  # Pre-fetched RSS feeds as JSON
│   ├── tech-reddit-gadgets.json
│   ├── country-jagat-review.json
│   └── news-merged.json
├── scripts/
│   ├── fetch-feeds.js      # Node.js script to fetch RSS feeds
│   └── package.json        # Dependencies for fetch script
├── index.html              # Main HTML structure
├── app.js                  # Core application logic (~1,200 LOC)
├── styles.css              # CSS with theming variables (~930 LOC)
├── sw.js                   # Service worker for offline caching
├── manifest.json           # PWA manifest configuration
└── README.md               # This file
```

## GitHub Actions Automation

This project uses GitHub Actions to periodically fetch RSS feeds and commit them as JSON files, eliminating CORS issues and improving performance.

### How It Works
1. **Scheduled Fetching**: GitHub Action runs every 6 hours (can also be triggered manually)
2. **Feed Processing**: Node.js script fetches default feeds and parses them to JSON
3. **Automatic Commit**: Updated JSON files are committed to the `feeds/` directory
4. **Client Loading**: The web app loads pre-fetched JSON files first, falling back to live fetching if needed

### Benefits
- **No CORS Issues**: Default feeds are pre-fetched server-side
- **Improved Performance**: Reduces client-side network requests
- **Better Reliability**: Cached feeds available even if source is temporarily down
- **Bandwidth Savings**: Users download JSON instead of full RSS XML

### Manual Trigger
You can manually trigger the RSS feed fetch workflow from the GitHub Actions tab.

## Default Feeds

The application comes pre-configured with these feeds:

- **Tech**: Reddit Gadgets - `https://redlib.perennialte.ch/r/gadgets.rss`
- **Country**: Jagat Review - `https://www.jagatreview.com/feed/`
- **News**: Merged News Sources - Multiple news feeds combined

## Browser Compatibility

- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
- Opera 67+

Requires support for:
- IndexedDB
- Service Workers
- Intersection Observer
- Page Visibility API
- ES6+ JavaScript

## Privacy

### Third-Party Services
- **RSS2JSON API** (`api.rss2json.com`): Used as fallback when direct RSS fetching fails due to CORS
  - Only used when direct fetch fails
  - No tracking or analytics
  - Public API (no authentication required)

### Data Storage
- All data stored locally in your browser using IndexedDB
- No data sent to external servers except:
  - RSS feed fetching (from original sources or RSS2JSON fallback)
  - External links when you click "Read Original Article"

### No Tracking
- No analytics
- No cookies
- No user tracking
- No advertising

## Technical Details

### Architecture
- **Vanilla JavaScript**: No framework dependencies (~2,200 LOC total)
- **Single Page Application**: No page reloads, smooth transitions
- **Progressive Enhancement**: Works without JavaScript for basic HTML
- **Mobile-First**: Responsive design for all screen sizes

### Browser APIs Used
- IndexedDB API (local database)
- Fetch API (RSS feed retrieval)
- Intersection Observer API (lazy loading)
- Page Visibility API (pause when inactive)
- Service Worker API (offline caching)
- DOMParser API (RSS/Atom feed parsing)
- File API (OPML import)

### Performance Features
- Batch IndexedDB operations
- Debounced event handlers
- Lazy image loading
- Efficient DOM updates
- Virtual scrolling ready
- Memory cleanup on unload

## Customization

### Adding Groups
Edit the `GROUPS` array in `app.js`:
```javascript
const GROUPS = ['country', 'finance', 'news', 'others', 'tech'];
```

### Changing Article Limit
Modify the limit in the `enforceArticleLimit()` function:
```javascript
if (unreadArticles.length > 50) {  // Change 50 to your preferred limit
```

### Theme Customization
Edit CSS variables in `styles.css`:
```css
:root {
  --accent-primary: #ff6600;  /* Change accent color */
  --unread-indicator: #a855f7; /* Change unread dot color */
  /* ... other variables */
}
```

## Keyboard Shortcuts

Currently, keyboard shortcuts are not implemented but can be added as a future enhancement.

## Known Limitations

1. **CORS Restrictions**: Some RSS feeds may not work with direct fetch due to CORS policies. Default feeds use pre-fetched JSON files to avoid this issue. Custom feeds automatically fall back to RSS2JSON API.
2. **Article Limit**: Only keeps last 50 unread articles per feed to manage storage.
3. **No Full-Text Search**: Search functionality not yet implemented.
4. **No Feed Discovery**: Cannot auto-discover feeds from websites.

## Future Enhancements

Potential features for future versions:
- Keyboard shortcuts
- Article search
- Custom feed categories
- Article tagging/favorites
- Reading statistics
- Feed health monitoring
- Dark/Light theme toggle
- Custom accent colors

## Contributing

This is an open-source project. Contributions are welcome!

## License

MIT License - Feel free to use, modify, and distribute.

## Support

For issues or questions, please open an issue on the GitHub repository.

---

**Built with ❤️ using Vanilla JavaScript**
