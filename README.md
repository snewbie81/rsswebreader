# RSS Web Reader

A modern, full-featured RSS feed reader with cloud synchronization, dark mode, and PWA support.

## Features

### Article Management & Reading
- **Smart Full-Text Extraction**: Automatically converts truncated feeds into full articles
- **Multiple Content Views**: Toggle between Feed Text, Webpage Text, or Inline display
- **Read/Unread Management**: Mark articles as read and optionally hide read articles
- **Clean, Ad-Free Interface**: Focus on content without distractions

### Feed Organization
- **Feed Groups**: Organize feeds into collapsible folders
- **Drag & Drop**: Reorder feeds and move them between groups
- **Unread Counts**: Track unread articles per feed and group
- **OPML Support**: Import and export your feed subscriptions

### Synchronization & Authentication
- **Supabase Integration**: Cloud sync across all your devices
- **Multiple Auth Options**: Email/password or Google Sign-In
- **Real-time Updates**: Changes sync automatically across devices
- **Offline Support**: Full functionality even without internet

### User Interface
- **AMOLED Dark Mode**: Pure black theme for OLED screens
- **Responsive Design**: Works on desktop, tablet, and mobile
- **PWA Support**: Install as a native app on any platform
- **Keyboard Navigation**: Efficient keyboard shortcuts

## Getting Started

### Online Demo
Visit the live demo at: [Your GitHub Pages URL]

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/snewbie81/rsswebreader.git
cd rsswebreader
```

2. Serve the files using a local web server:
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server

# Using PHP
php -S localhost:8000
```

3. Open http://localhost:8000 in your browser

### Supabase Setup (Optional)

For cloud sync functionality:

1. Create a free account at [supabase.com](https://supabase.com)

2. Create a new project

3. Run the following SQL in the SQL Editor:

```sql
-- Create feeds table
CREATE TABLE feeds (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  group_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, url)
);

-- Create groups table
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  collapsed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, id)
);

-- Create read_articles table
CREATE TABLE read_articles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  article_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, article_id)
);

-- Enable Row Level Security
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE read_articles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own feeds" ON feeds
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own groups" ON groups
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own read articles" ON read_articles
  FOR ALL USING (auth.uid() = user_id);
```

4. Get your Project URL and Anon Key from Settings > API

5. In the app, store them in localStorage:
```javascript
localStorage.setItem('supabaseUrl', 'YOUR_PROJECT_URL');
localStorage.setItem('supabaseKey', 'YOUR_ANON_KEY');
```

## Usage

### Adding Feeds
1. Click the "+ Add Feed" button in the sidebar
2. Enter the RSS/Atom feed URL
3. Optionally select a group
4. Click "Add Feed"

### Creating Groups
1. Click the "+ New Group" button
2. Enter a group name
3. Drag feeds into the group or assign when adding new feeds

### Reading Articles
1. Click on a feed or group to view articles
2. Click on an article to read it
3. Use the content source selector to switch between:
   - **Feed Text**: Original feed content
   - **Webpage Text**: Extracted full article
   - **Inline**: Embedded webpage view

### Import/Export
1. Click the Settings icon (⚙️)
2. Use "Import OPML" to import feeds from other readers
3. Use "Export OPML" to back up your feeds

### Dark Mode
1. Click the Settings icon
2. Toggle "Dark Mode (AMOLED)"
3. Preference is saved automatically

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Storage**: IndexedDB for local data persistence
- **Sync**: Supabase for cloud synchronization
- **PWA**: Service Workers for offline functionality
- **Feed Parsing**: Native XML parsing with DOMParser

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers with PWA support

## Architecture

### Core Functions

#### Article Management
- `loadFeedArticles(feedUrl)` - Fetches and parses RSS feeds
- `renderArticles()` - Renders the article list
- `displayArticle(articleId)` - Shows article in reading pane
- `extractFullText(url, fallbackContent)` - Extracts full article text
- `changeContentSource(source)` - Toggles content display mode
- `toggleHideRead(hide)` - Shows/hides read articles

#### Feed Organization
- `assignFeedToGroup(feedUrl, groupId)` - Moves feed to group
- `loadGroupArticles(groupId)` - Loads group articles
- `toggleGroup(groupId)` - Expands/collapses groups
- `moveFeed()` - Reorders feeds

#### Authentication & Sync
- `login()` - User authentication
- `register()` - New user registration
- `signInWithGoogle()` - OAuth Google Sign-In
- `logout()` - Clears session and data
- `syncToSupabase()` - Pushes local changes to cloud
- `syncFromSupabase()` - Pulls remote data
- `syncAllFeeds(silent)` - Refreshes all feeds
- `setupSupabaseListener()` - Real-time sync listeners

#### UI & System
- `toggleSettings()` - Opens/closes settings modal
- `registerServiceWorker()` - Initializes PWA
- `renderArticlesListPanel()` - Updates article list
- `closeModal(modalId)` - Closes modal dialogs

## Privacy & Security

- No tracking or analytics
- All data stored locally by default
- Cloud sync is optional and user-controlled
- Open source and transparent

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Credits

Built with ❤️ by the RSS Web Reader team

## Support

For issues, questions, or suggestions, please open an issue on GitHub.
