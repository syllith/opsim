// AuthContext.jsx
// Provides authentication state and user settings to the app via React Context API
import React, { createContext, useState, useEffect } from 'react';

// Create the AuthContext object
export const AuthContext = createContext();

// AuthProvider wraps the app and provides auth state and actions to all children
export const AuthProvider = ({ children }) => {
    // Tracks if the user is logged in. Starts as undefined until status is checked.
    const [isLoggedIn, setIsLoggedIn] = useState(undefined);
    // Stores the username of the logged-in user, or null if not logged in.
    const [user, setUser] = useState(null);
    // Stores user-specific settings, such as theme. Defaults to light theme.
    const [userSettings, setUserSettings] = useState({ theme: 'light' });
    // Indicates if the app is still loading authentication info.
    const [loading, setLoading] = useState(true);

    // On initial mount, check if the user is already logged in (e.g., via cookie/session)
    useEffect(() => {
        checkLoginStatus();
    }, []);

    /**
     * Checks if the user is logged in by calling the backend API.
     * Updates state with user info and settings if logged in, or resets if not.
     * Always sets loading to false at the end.
     */
    const checkLoginStatus = async () => {
        try {
            // Call backend to check login status (expects session cookie)
            const response = await fetch('/api/checkLoginStatus', {
                method: 'GET',
                credentials: 'include'
            });

            if (response.ok) {
                // If logged in, update user info and settings
                const data = await response.json();
                setIsLoggedIn(!!data.isLoggedIn);
                setUser(data.username);
                setUserSettings(data.settings || { theme: 'light' });
            } else {
                // Not logged in: reset state
                setIsLoggedIn(false);
                setUser(null);
                setUserSettings({ theme: 'light' });
            }
        } catch (error) {
            // Network or server error: treat as logged out
            console.error('Error checking login status:', error);
            setIsLoggedIn(false);
            setUser(null);
            setUserSettings({ theme: 'light' });
        } finally {
            setLoading(false);
        }
    };

    /**
     * Logs out the user by calling the backend API, then resets auth state.
     */
    const logout = async () => {
        try {
            // Call backend to log out (clears session cookie)
            const response = await fetch('/api/logout', {
                method: 'GET',
                credentials: 'include'
            });

            if (response.ok) {
                // On success, clear user info and settings
                setIsLoggedIn(false);
                setUser(null);
                setUserSettings({ theme: 'light' });
            }
        } catch (error) {
            // Log error but do not throw
            console.error('Error during logout:', error);
        }
    };

    /**
     * Updates user settings (e.g., theme) by sending them to the backend API.
     * Updates local state if successful, or returns error info if not.
     * @param {Object} newSettings - The new settings to save
     * @returns {Object} - { success: boolean, error?: string }
     */
    const updateUserSettings = async (newSettings) => {
        try {
            // Send updated settings to backend
            const response = await fetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ settings: newSettings })
            });

            if (response.ok) {
                // Update local state with new settings
                const data = await response.json();
                setUserSettings(data.settings);
                return { success: true };
            } else {
                // Backend returned error
                const errorData = await response.json();
                return { success: false, error: errorData.error || 'Failed to update settings' };
            }
        } catch (error) {
            // Network error
            console.error('Error updating settings:', error);
            return { success: false, error: 'Network error' };
        }
    };

    // All state and actions provided to context consumers
    const contextValue = {
        isLoggedIn,      // boolean | undefined
        setIsLoggedIn,   // function to manually set login state
        user,            // username or null
        setUser,         // function to manually set user
        userSettings,    // user preferences object
        setUserSettings, // function to manually set settings
        updateUserSettings, // async function to update settings via API
        loading,         // true if auth info is still loading
        logout           // async function to log out
    };

    // Provide context to all children
    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};
