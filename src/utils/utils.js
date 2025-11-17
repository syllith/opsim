// Auth helpers only
export const handleLogin = async (username, password) => {
    const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error('Login failed: ' + data.error);
    }

    return data;
};

export const handleRegister = async (username, password, confirmPassword) => {
    // Validate passwords match
    if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
    }
    
    const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
            username,
            password,
            passwordConfirm: confirmPassword
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error('Registration failed: ' + data.error);
    }

    return data;
};
