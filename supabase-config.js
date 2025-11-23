// Supabase Configuration
// =====================
// This file initializes Supabase for the RSS Web Reader application.
// 
// SETUP INSTRUCTIONS:
// 1. Go to Supabase Console: https://supabase.com/dashboard
// 2. Create a new project or select an existing one
// 3. Go to Project Settings > API
// 4. Copy your Project URL and anon/public API key
// 5. Replace the placeholders below with your actual values
// 6. Enable Authentication: Go to Authentication in the sidebar
//    - Email/Password is enabled by default
//    - (Optional) Enable Google sign-in under Providers
// 7. Create a table for user data (see README for schema)
// 8. Set up Row Level Security (RLS) policies (see README)

// IMPORTANT: For production deployment, move these credentials to environment variables
// and never commit real Supabase credentials to public repositories.

// Configuration constants
const supabaseConfig = {
    url: "https://jkvzsclozkkqrmmdjnll.supabase.co", // e.g., https://xxxxxxxxxxxxx.supabase.co
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprdnpzY2xvemtrcXJtbWRqbmxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4OTcwMDYsImV4cCI6MjA3OTQ3MzAwNn0.Su-w_N2clSpy7LIXuYNpPxa8olDvYTJBX096rjPTflc" // Your public anon key
};

// Validate configuration to prevent accidental deployment with placeholder values
function validateConfig() {
    if (supabaseConfig.url === "https://jkvzsclozkkqrmmdjnll.supabase.co" || 
        supabaseConfig.anonKey === "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprdnpzY2xvemtrcXJtbWRqbmxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4OTcwMDYsImV4cCI6MjA3OTQ3MzAwNn0.Su-w_N2clSpy7LIXuYNpPxa8olDvYTJBX096rjPTflc" ||
        !supabaseConfig.url.startsWith('http')) {
        console.warn('Supabase configuration contains placeholder values. The app will run in offline mode.');
        return false;
    }
    return true;
}

// Initialize Supabase client
let supabaseClient = null;

// Wait for Supabase modules to be loaded
function initializeSupabaseWhenReady() {
    // Validate configuration first
    if (!validateConfig()) {
        window.supabaseAvailable = false;
        return;
    }
    
    // Check if the Supabase client library is loaded
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        try {
            // Initialize Supabase client
            supabaseClient = window.supabase.createClient(
                supabaseConfig.url,
                supabaseConfig.anonKey
            );
            
            // Make Supabase client available globally
            window.supabaseClient = supabaseClient;
            
            console.log('Supabase initialized successfully');
            
            // Notify app that Supabase is ready
            window.dispatchEvent(new Event('supabase-ready'));
        } catch (error) {
            console.error('Supabase initialization error:', error);
            console.warn('Supabase is not configured. Please update supabase-config.js with your Supabase credentials.');
            console.warn('The app will work in offline mode without sync capabilities.');
            
            // Set flag to indicate Supabase is not available
            window.supabaseAvailable = false;
        }
    } else {
        console.warn('Supabase client library not loaded. Please check your HTML includes.');
        console.warn('The app will work in offline mode without sync capabilities.');
        window.supabaseAvailable = false;
    }
}

// Start initialization when DOM is ready
window.addEventListener('DOMContentLoaded', initializeSupabaseWhenReady);

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { supabaseConfig };
}
