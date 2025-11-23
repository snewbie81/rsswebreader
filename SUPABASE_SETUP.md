# Supabase Setup Guide

This document provides detailed instructions for setting up Supabase with the RSS Web Reader application.

## Overview

Supabase is an open-source alternative to Firebase that provides:
- **Postgres Database** with Row Level Security (RLS)
- **Authentication** with Email/Password, OAuth (Google, GitHub, etc.)
- **Real-time subscriptions** for instant data sync across devices
- **Direct database queries** from the client (secured by RLS policies)

## Prerequisites

- A Supabase account (sign up at https://supabase.com)
- Basic understanding of SQL and database concepts

## Step 1: Create a Supabase Project

1. Go to https://supabase.com/dashboard
2. Click **"New Project"**
3. Fill in the project details:
   - **Name**: Choose a name (e.g., "RSS Web Reader")
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Select the region closest to your users
4. Click **"Create new project"**
5. Wait for the project to be provisioned (1-2 minutes)

## Step 2: Get Your API Credentials

1. In your Supabase project dashboard, go to **Settings** > **API**
2. You'll need two values:
   - **Project URL** (e.g., `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon/public key** (a long JWT token)
3. Copy these values - you'll need them for the configuration

## Step 3: Configure the Application

1. Open `supabase-config.js` in your RSS Web Reader project
2. Replace the placeholder values:

```javascript
const supabaseConfig = {
    url: "https://xxxxxxxxxxxxx.supabase.co", // Your Project URL
    anonKey: "your-anon-key-here" // Your anon/public key
};
```

3. Save the file

## Step 4: Create the Database Table

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **"New query"**
3. Paste the following SQL and click **"Run"**:

```sql
-- Create the user_settings table
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    feeds JSONB DEFAULT '[]'::jsonb,
    groups JSONB DEFAULT '[]'::jsonb,
    read_articles JSONB DEFAULT '[]'::jsonb,
    hide_read BOOLEAN DEFAULT false,
    dark_mode BOOLEAN DEFAULT false,
    content_source TEXT DEFAULT 'feed',
    sidebar_collapsed BOOLEAN DEFAULT false,
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only read their own data
CREATE POLICY "Users can read own settings"
    ON user_settings
    FOR SELECT
    USING (auth.uid() = user_id);

-- Create policy: Users can insert their own data
CREATE POLICY "Users can insert own settings"
    ON user_settings
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own data
CREATE POLICY "Users can update own settings"
    ON user_settings
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can delete their own data
CREATE POLICY "Users can delete own settings"
    ON user_settings
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## Step 5: Enable Authentication

### Email/Password Authentication

1. In Supabase dashboard, go to **Authentication** > **Providers**
2. **Email** is enabled by default
3. Configure email templates (optional):
   - Go to **Authentication** > **Email Templates**
   - Customize the confirmation and password reset emails

### Google OAuth (Optional)

1. Go to **Authentication** > **Providers**
2. Find **Google** in the list and click **"Enable"**
3. You'll need to create a Google OAuth application:
   - Go to https://console.cloud.google.com
   - Create a new project or select an existing one
   - Go to **APIs & Services** > **Credentials**
   - Click **"Create Credentials"** > **"OAuth client ID"**
   - Choose **"Web application"**
   - Add authorized redirect URI: `https://your-project-id.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client Secret**
4. Back in Supabase, paste the Google Client ID and Client Secret
5. Click **"Save"**

## Step 6: Enable Realtime

1. In Supabase dashboard, go to **Database** > **Replication**
2. Find the **user_settings** table
3. Toggle **"Enable Realtime"** to ON
4. This allows instant sync across devices

## Step 7: Test Your Setup

1. Open your RSS Web Reader application
2. Click **"Login"** and then **"Register"**
3. Create a new account with email and password
4. Check your email for a confirmation link (if email confirmation is enabled)
5. Add some feeds and test the sync functionality
6. Open the app in another browser or device
7. Login with the same account - your feeds should sync automatically!

## Row Level Security (RLS) Explained

Row Level Security is a powerful feature that allows you to query the database directly from JavaScript while ensuring users can only access their own data.

**How it works:**
- When a user makes a request, Supabase checks their JWT token
- The RLS policies verify that the user can only access/modify rows where `user_id` matches their `auth.uid()`
- This happens at the database level, not in your application code
- It's impossible for users to access other users' data, even if they try to manipulate the client code

## Security Best Practices

1. **Never commit your Supabase credentials** to public repositories
2. **Use environment variables** for production deployments
3. **Keep the anon key public** - it's designed to be public and is protected by RLS
4. **Never expose your service_role key** - it bypasses RLS
5. **Regularly review your RLS policies** to ensure they're correct
6. **Enable email confirmation** for production apps
7. **Set up rate limiting** in Supabase dashboard to prevent abuse

## Troubleshooting

### "Invalid API key" error
- Check that you've copied the correct anon key from Supabase dashboard
- Verify there are no extra spaces in the configuration

### Users can't login after registration
- Check if email confirmation is required
- Look in Supabase dashboard **Authentication** > **Users** to see if the user exists
- Check the browser console for error messages

### Data not syncing
- Verify that Realtime is enabled for the user_settings table
- Check browser console for subscription errors
- Ensure RLS policies are correctly configured

### "row level security policy violation" error
- Verify that the user is logged in
- Check that the RLS policies are created correctly
- Ensure `auth.uid()` matches the `user_id` in the data

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Authentication Guide](https://supabase.com/docs/guides/auth)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Realtime Guide](https://supabase.com/docs/guides/realtime)

## Need Help?

- [Supabase Discord Community](https://discord.supabase.com/)
- [Supabase GitHub Discussions](https://github.com/supabase/supabase/discussions)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/supabase)
