const express = require('express');
const Samsung = require('samsung-tv-control').default;
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = 3001;

// Path for storing the token
const TOKEN_PATH = path.join(__dirname, 'tv_token.json');

// Base configuration without token
const baseConfig = {
    debug: true,
    ip: '192.168.1.9',
    mac: '8C:79:F5:80:93:AF',
    nameApp: 'Jarvis',
    port: 8002
};

let control = null;
let isInitializing = false;
let currentToken = null;

// Function to read saved token
async function getSavedToken() {
    try {
        const data = await fs.readFile(TOKEN_PATH, 'utf8');
        const parsed = JSON.parse(data);
        return parsed.token;
    } catch (error) {
        console.log('No saved token found');
        return null;
    }
}

// Function to save token
async function saveToken(token) {
    try {
        if (token && token !== currentToken) {
            await fs.writeFile(TOKEN_PATH, JSON.stringify({ token }));
            currentToken = token;
            console.log('New token saved successfully');
        }
    } catch (error) {
        console.error('Error saving token:', error);
    }
}

// Function to initialize Samsung TV control
async function initializeControl() {
    if (isInitializing) {
        console.log('Initialization already in progress');
        return control;
    }

    isInitializing = true;

    try {
        if (!currentToken) {
            currentToken = await getSavedToken();
        }

        const config = {
            ...baseConfig,
            token: currentToken
        };

        // Dispose of existing control instance if it exists
        if (control) {
            control.removeAllListeners();
            control = null;
        }

        control = new Samsung(config);

        // Set up token update listener
        control.on('token', async (token) => {
            console.log('New token received');
            if (token && token !== currentToken) {
                await saveToken(token);
                // No need to reinitialize here - just update the current token
                currentToken = token;
            }
        });

        // Test the connection
        await new Promise((resolve, reject) => {
            control.isAvailable((err, available) => {
                if (err || !available) {
                    reject(new Error('TV not available'));
                } else {
                    resolve();
                }
            });
        });

        return control;
    } catch (error) {
        console.error('Initialization error:', error);
        control = null;
        throw error;
    } finally {
        isInitializing = false;
    }
}

// Initialize the control when the server starts
app.listen(port, async () => {
    try {
        await initializeControl();
        console.log(`Samsung TV Proxy Server is running at http://localhost:${port}`);
    } catch (error) {
        console.error('Error initializing TV control:', error);
    }
});

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Middleware to ensure control is initialized
app.use(async (req, res, next) => {
    if (!control) {
        try {
            await initializeControl();
        } catch (error) {
            return res.status(500).send('Error initializing TV control');
        }
    }
    next();
});

app.get('/send-key/:key', async (req, res) => {
    const key = req.params.key;
    
    try {
        const result = await new Promise((resolve, reject) => {
            control.sendKey(key, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        
        console.log(`Command ${key} sent successfully`);
        res.send(`Command ${key} sent successfully`);
    } catch (error) {
        console.error('Error sending key:', error);
        
        // If the error might be due to an invalid token, try to reinitialize
        if (error.message.includes('401') || error.message.includes('unauthorized')) {
            try {
                console.log('Attempting to reinitialize due to authorization error');
                currentToken = null; // Clear the current token
                await initializeControl();
                
                // Retry the command
                const result = await new Promise((resolve, reject) => {
                    control.sendKey(key, (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });
                
                console.log(`Command ${key} sent successfully after reinitialization`);
                res.send(`Command ${key} sent successfully`);
            } catch (reinitError) {
                console.error('Reinitialization failed:', reinitError);
                res.status(500).send('Failed to reinitialize TV control');
            }
        } else {
            res.status(500).send('Error sending key');
        }
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send('Internal server error');
});