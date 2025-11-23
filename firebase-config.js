// Firebase Configuration
// =====================
// This file initializes Firebase for the RSS Web Reader application.
// 
// SETUP INSTRUCTIONS:
// 1. Go to Firebase Console: https://console.firebase.google.com/
// 2. Create a new project or select an existing one
// 3. Go to Project Settings > General
// 4. Scroll down to "Your apps" and click "Web" (</>) to register your app
// 5. Copy the configuration values and replace the placeholders below
// 6. Enable Authentication: Go to Build > Authentication > Get Started
//    - Enable Email/Password sign-in method
//    - (Optional) Enable Google sign-in method for social authentication
// 7. Enable Firestore: Go to Build > Firestore Database > Create Database
//    - Start in production mode
//    - Choose a location close to your users
// 8. Set up Security Rules (see SECURITY_RULES.md or README)

// IMPORTANT: For production deployment, move these credentials to environment variables
// and never commit real Firebase credentials to public repositories.

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
let app, auth, db;

// Wait for Firebase modules to be loaded
window.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure Firebase modules are loaded
    setTimeout(() => {
        if (window.firebaseModules && window.firebaseModules.initializeApp) {
            try {
                // Initialize Firebase
                app = window.firebaseModules.initializeApp(firebaseConfig);
                auth = window.firebaseModules.getAuth(app);
                db = window.firebaseModules.getFirestore(app);
                
                // Make Firebase instances available globally
                window.firebaseApp = app;
                window.firebaseAuth = auth;
                window.firebaseDb = db;
                
                console.log('Firebase initialized successfully');
                
                // Notify app that Firebase is ready
                window.dispatchEvent(new Event('firebase-ready'));
            } catch (error) {
                console.error('Firebase initialization error:', error);
                console.warn('Firebase is not configured. Please update firebase-config.js with your Firebase credentials.');
                console.warn('The app will work in offline mode without sync capabilities.');
                
                // Set flag to indicate Firebase is not available
                window.firebaseAvailable = false;
            }
        }
    }, 100);
});

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { firebaseConfig };
}
