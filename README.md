# RSS Web Reader

A modern, progressive web application (PWA) for reading RSS feeds with smart features.

## Features

✨ **Smart Full-Text Extraction**: Automatically converts truncated RSS feeds into full-text articles  
🎨 **Clean, Ad-Free Interface**: Minimalist, distraction-free design focused on content  
📱 **Cross-Platform Support (PWA)**: Works on desktop and mobile with offline support  
👁️ **Hide Read Feature**: Option to automatically hide items you've already viewed  
📦 **OPML Support**: Import and export your feeds using OPML format  

## Getting Started

1. **Open the app**: Simply open `index.html` in a modern web browser
2. **Add feeds**: Click "Add Feed" and enter an RSS feed URL
3. **Read articles**: Click on any article to view it in a clean reading interface
4. **Manage feeds**: Refresh, delete feeds, or import/export your feed list

## Usage

### Adding Feeds
- Click the "Add Feed" button
- Enter the RSS feed URL (e.g., `https://example.com/feed.xml`)
- The feed will be fetched and added to your sidebar

### Reading Articles
- Click on any article in the list to view it
- The app will attempt to extract the full text for better readability
- Articles you've read are automatically marked and can be hidden

### Hide Read Articles
- Toggle the "Hide Read" checkbox to show/hide articles you've already viewed
- Your reading history is saved locally in your browser

### OPML Import/Export
- **Import**: Click "Import" to load feeds from an OPML file
- **Export**: Click "Export" to download your current feeds as OPML

## Technical Details

### Technologies Used
- Pure HTML, CSS, and JavaScript (no frameworks required)
- LocalStorage for data persistence
- Service Worker for PWA functionality
- RSS2JSON API for RSS feed parsing (CORS proxy)

### PWA Features
- Installable on desktop and mobile devices
- Offline support via Service Worker
- Responsive design for all screen sizes
- Fast loading and caching

### Browser Compatibility
- Chrome/Edge (recommended)
- Firefox
- Safari
- Any modern browser with ES6+ support

## Local Development

No build process required! Simply:

1. Clone the repository
2. Open `index.html` in your browser
3. Start reading!

For local testing with PWA features:
```bash
# Using Python's built-in server
python3 -m http.server 8000

# Using Node.js http-server
npx http-server
```

Then visit `http://localhost:8000`

## Data Storage

All data is stored locally in your browser:
- **Feeds**: List of RSS feeds you've subscribed to
- **Read Articles**: IDs of articles you've already read
- **Preferences**: Settings like "Hide Read" toggle

No data is sent to external servers except:
- RSS feed fetching (via RSS2JSON API)
- Original article links when clicked

## Privacy

- No tracking or analytics
- No user accounts required
- All data stored locally in your browser
- You can export your data anytime via OPML

**Important Privacy Note**: This application uses the RSS2JSON API (a third-party service) to fetch and parse RSS feeds due to browser CORS restrictions. Your feed URLs are sent to rss2json.com for processing. For enhanced privacy in production deployments, consider implementing server-side RSS parsing or using a self-hosted CORS proxy.

## Sample RSS Feeds to Try

- NPR News: `https://feeds.npr.org/1001/rss.xml`
- BBC World: `https://feeds.bbci.co.uk/news/world/rss.xml`
- TechCrunch: `https://techcrunch.com/feed/`
- HackerNews: `https://news.ycombinator.com/rss`

## License

This project is open source and available for anyone to use and modify.

## Future Enhancements

- Enhanced full-text extraction with custom parser
- Keyboard shortcuts for navigation
- Search functionality
- Feed categories and folders
- Dark mode
- Multiple themes
- Article bookmarks
- Reading time estimates