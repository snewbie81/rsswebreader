# Firestore Security Rules

This document provides the security rules for Firebase Firestore to ensure users can only read and write their own data.

## Security Rules Configuration

To set up security rules in Firebase:

1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project
3. Navigate to **Build** > **Firestore Database**
4. Click on the **Rules** tab
5. Replace the existing rules with the rules below
6. Click **Publish**

## Recommended Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - each user can only read/write their own document
    match /users/{userId} {
      // Allow read/write only if the authenticated user's UID matches the document ID
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Deny all other access by default
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Explanation

### User Data Protection
- **`match /users/{userId}`**: Defines rules for documents in the "users" collection
- **`request.auth != null`**: Ensures the user is authenticated
- **`request.auth.uid == userId`**: Ensures users can only access documents where the document ID matches their User ID (UID)

### Default Deny
- **`match /{document=**}`**: Matches any document not covered by other rules
- **`allow read, write: if false`**: Denies all access to any other collections or documents

## Data Structure

Each user's document in Firestore will have the following structure:

```json
{
  "feeds": [
    {
      "url": "https://example.com/feed.xml",
      "title": "Example Feed",
      "description": "Feed description",
      "link": "https://example.com",
      "items": [...]
    }
  ],
  "groups": [
    {
      "id": "group-id",
      "name": "Group Name",
      "feedUrls": ["https://example.com/feed.xml"]
    }
  ],
  "readArticles": ["article-guid-1", "article-guid-2"],
  "hideRead": false,
  "darkMode": false,
  "contentSource": "feed",
  "sidebarCollapsed": false,
  "lastSync": "2024-01-01T00:00:00.000Z"
}
```

## Testing Security Rules

After publishing the rules, you can test them in the Firebase Console:

1. Go to the **Rules** tab in Firestore Database
2. Click **Rules Playground** at the top
3. Test scenarios:
   - **Authenticated user accessing their own document**: Should succeed
   - **Authenticated user accessing another user's document**: Should fail
   - **Unauthenticated access**: Should fail

## Best Practices

1. **Never disable security rules in production**: Always require authentication
2. **Use the principle of least privilege**: Only grant the minimum necessary permissions
3. **Validate data structure**: Consider adding validation rules for data types and required fields
4. **Monitor access patterns**: Review Firestore logs regularly for suspicious activity
5. **Keep rules updated**: As your app evolves, update security rules accordingly

## Advanced Rules (Optional)

For more advanced scenarios, you can add data validation:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      
      allow write: if request.auth != null 
                   && request.auth.uid == userId
                   && request.resource.data.keys().hasAll(['feeds', 'groups', 'readArticles'])
                   && request.resource.data.feeds is list
                   && request.resource.data.groups is list
                   && request.resource.data.readArticles is list;
    }
    
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

This advanced rule ensures that:
- The document contains required fields (feeds, groups, readArticles)
- Each field has the correct data type (array/list)
- Only authenticated users can access their own data

## Troubleshooting

If you encounter permission errors:

1. Verify the user is logged in (check browser console)
2. Confirm the security rules are published
3. Check that the document ID matches the user's UID
4. Review the Firestore logs in Firebase Console
5. Use the Rules Playground to test specific scenarios

## Resources

- [Firebase Security Rules Documentation](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices)
