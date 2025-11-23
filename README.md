# RSS Web Reader

A modern, progressive web application (PWA) for reading RSS feeds with smart features.

## Features

✨ **Smart Full-Text Extraction**: Automatically converts truncated RSS feeds into full-text articles  
🎨 **Clean, Ad-Free Interface**: Minimalist, distraction-free design focused on content  
📱 **Cross-Platform Support (PWA)**: Works on desktop and mobile with offline support  
👁️ **Hide Read Feature**: Option to automatically hide items you've already viewed  
📦 **OPML Support**: Import and export your feeds using OPML format  
🔐 **Login & Sync**: User authentication with cross-device feed synchronization  
🌑 **AMOLED Dark Mode**: True black dark mode (#000000) for OLED displays  
📄 **Content Source Selection**: Choose between Feed Text, Webpage Text, or Inline Text display  
📁 **Feed Groups**: Organize feeds into custom groups  

## Getting Started

### Quick Start (Without Firebase)
1. **Open the app**: Simply open `index.html` in a modern web browser
2. **Add feeds**: Click "Add Feed" and enter an RSS feed URL
3. **Read articles**: Click on any article to view it in a clean reading interface
4. **Manage feeds**: Refresh, delete feeds, or import/export your feed list

### Firebase Setup (For Real-time Sync)

To enable real-time cross-device synchronization with Firebase:

#### 1. Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the wizard
3. Once created, go to Project Settings (gear icon)

#### 2. Enable Authentication
1. Navigate to **Build** > **Authentication**
2. Click "Get Started"
3. Enable **Email/Password** sign-in method
4. (Optional) Enable **Google** sign-in for social authentication

#### 3. Enable Firestore Database
1. Navigate to **Build** > **Firestore Database**
2. Click "Create database"
3. Start in **production mode**
4. Choose a location close to your users
5. Go to the **Rules** tab and set up security rules (see `FIRESTORE_SECURITY_RULES.md`)

#### 4. Get Firebase Configuration
1. In Project Settings > General, scroll to "Your apps"
2. Click the Web icon `</>` to register a web app
3. Copy the `firebaseConfig` object
4. Open `firebase-config.js` in your project
5. Replace the placeholder values with your configuration:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

#### 5. Set Up Security Rules
1. Copy the security rules from `FIRESTORE_SECURITY_RULES.md`
2. In Firebase Console, go to **Firestore Database** > **Rules**
3. Paste the rules and click **Publish**

#### 6. Test Your Setup
1. Open `index.html` in your browser
2. Click "Login" and register a new account
3. Add some feeds and make changes
4. Open the app on another device or browser
5. Login with the same account
6. Your feeds and settings should sync automatically!

### Without Firebase
The app works perfectly fine without Firebase configuration:
- All data is stored locally in your browser
- No cross-device sync
- Authentication uses a simple demo mode with localStorage

## Usage

### Adding Feeds
- Click the "Add Feed" button
- Enter the RSS feed URL (e.g., `https://example.com/feed.xml`)
- The feed will be fetched and added to your sidebar

### Reading Articles
- Click on any article in the list to view it
- The app will extract content based on your selected content source (Feed Text, Webpage Text, or Inline Text)
- Articles you've read are automatically marked and can be hidden

### User Authentication & Sync

#### With Firebase (Recommended)
- Real-time cross-device synchronization
- Secure authentication via Firebase Auth
- Changes sync instantly across all your devices
- Supports Email/Password and Google Sign-In
- Data protected by Firestore Security Rules

#### Without Firebase (Demo Mode)
- Click "Login" in the sidebar to create an account or sign in
- Simple localStorage-based authentication for testing
- Your feeds and settings sync locally on the same browser
- No real-time sync or cross-device support

### Content Source Selection
Choose how articles are displayed:
- **Feed Text**: Uses the content provided in the RSS feed (default)
- **Webpage Text**: Extracts full text from the article webpage (when supported)
- **Inline Text**: Shows only the inline content from the feed

### AMOLED Dark Mode
- Toggle "AMOLED Mode" for a true black dark theme (#000000)
- Perfect for OLED displays to save battery and reduce eye strain

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
- Firebase SDK (optional) for Authentication and Firestore real-time sync
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
- **Groups**: Custom feed organization
- **Read Articles**: IDs of articles you've already read
- **User Account**: Login credentials for sync (hashed)
- **Preferences**: Settings like "Hide Read", "AMOLED Mode", and content source
- **Sync Data**: When logged in, data is synced for cross-device access

No data is sent to external servers except:
- RSS feed fetching (via RSS2JSON API)
- Original article links when clicked
- User sync data (stored locally in this demo; would use a server in production)

## Privacy

- No tracking or analytics
- No user accounts required (unless you want Firebase sync)
- All data stored locally in your browser (or securely in Firestore if using Firebase)
- You can export your data anytime via OPML

**Important Privacy Note**: This application uses the RSS2JSON API (a third-party service) to fetch and parse RSS feeds due to browser CORS restrictions. Your feed URLs are sent to rss2json.com for processing. For enhanced privacy in production deployments, consider implementing server-side RSS parsing or using a self-hosted CORS proxy.

**Firebase Note**: When using Firebase, your data is stored in Google's Firestore database and protected by security rules. Firebase is GDPR compliant and offers enterprise-grade security. Your authentication is handled by Firebase Auth with industry-standard security practices.

**Authentication Note (Demo Mode)**: In demo mode without Firebase, authentication is handled client-side using localStorage. This is for demonstration purposes only. For production use, Firebase Authentication is strongly recommended for secure password hashing, JWT tokens, and proper user management.

## Sample RSS Feeds to Try

- NPR News: `https://feeds.npr.org/1001/rss.xml`
- BBC World: `https://feeds.bbci.co.uk/news/world/rss.xml`
- TechCrunch: `https://techcrunch.com/feed/`
- HackerNews: `https://news.ycombinator.com/rss`

## License

This project is open source and available for anyone to use and modify.

## Future Enhancements

- Enhanced full-text extraction with custom parser
- Additional Firebase authentication providers (Apple, Microsoft, GitHub)
- Advanced webpage text extraction (Mercury Parser, Readability)
- Keyboard shortcuts for navigation
- Search functionality
- Multiple themes beyond AMOLED mode
- Article bookmarks
- Reading time estimates
- Push notifications for new articles
- Offline article caching