import { useState, useCallback } from 'react';
import { ROKU_COMMAND_TYPES, ROKU_APPS, ROKU_ACTIONS } from './rokuTypes';

const LOADING_DELAYS = {
    APP_LAUNCH: 5000,    // Wait 5 seconds for app to launch
    MENU_NAVIGATION: 1500, // Wait 1.5 seconds between menu movements
    SEARCH_LOAD: 2000,    // Wait 2 seconds for search interface
    KEY_PRESS: 200,       // Wait 200ms between key presses
    SEARCH_RESULTS: 3000  // Wait 3 seconds for search results
};

const useRokuControl = () => {
    const [rokuIP, setRokuIP] = useState('192.168.1.4');
    const [lastError, setLastError] = useState(null);
    const [isExecuting, setIsExecuting] = useState(false);

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const sendRequest = useCallback(async (endpoint) => {
        try {
            console.log(`Sending Roku request to: http://${rokuIP}:8060/${endpoint}`);

            const response = await fetch(`http://${rokuIP}:8060/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            console.log('Roku response status:', response.status);

            if (!response.ok) {
                throw new Error(`Roku request failed: ${response.status} ${response.statusText}`);
            }

            setLastError(null);
            return true;
        } catch (error) {
            console.error('Roku request failed:', error);
            setLastError(error.message);
            return false;
        }
    }, [rokuIP]);

    const typeText = useCallback(async (text) => {
        console.log('Typing text:', text);
        const encodedText = encodeURIComponent(text);
        for (const char of text) {
            await sendRequest(`keypress/Lit_${encodeURIComponent(char)}`);
            await delay(LOADING_DELAYS.KEY_PRESS);
        }
    }, [sendRequest]);

    const searchInApp = useCallback(async (appId, searchTerm) => {
        try {
            if (isExecuting) {
                console.log('Already executing a command, skipping');
                return false;
            }

            setIsExecuting(true);
            console.log(`Searching for "${searchTerm}" in app ${appId}`);

            // First launch the app
            console.log('Launching app...');
            await sendRequest(`launch/${appId}`);
            console.log(`Waiting ${LOADING_DELAYS.APP_LAUNCH}ms for app to load...`);
            await delay(LOADING_DELAYS.APP_LAUNCH);

            // App-specific search patterns
            if (appId === ROKU_APPS.YOUTUBE.id) {
                // Navigate to search (usually up from home screen)
                console.log('Navigating to YouTube search...');
                await sendRequest('keypress/Up');
                await sendRequest('keypress/Right');
                await delay(LOADING_DELAYS.MENU_NAVIGATION);

                await sendRequest('keypress/Select');
                console.log(`Waiting ${LOADING_DELAYS.SEARCH_LOAD}ms for search to load...`);
                await delay(LOADING_DELAYS.SEARCH_LOAD);

                // Type the search term
                console.log('Typing search term...');
                await typeText(searchTerm);
                await sendRequest('keypress/Down');
                await sendRequest('keypress/Down');
                await sendRequest('keypress/Down');
                await sendRequest('keypress/Down');
                await sendRequest('keypress/Right');
                await sendRequest('keypress/Right');
                await sendRequest('keypress/Select');

                // Wait for search results
                console.log(`Waiting ${LOADING_DELAYS.SEARCH_RESULTS}ms for results...`);
                await delay(LOADING_DELAYS.SEARCH_RESULTS);

                const presses = Math.floor(Math.random() * 4) + 3;
                for (let i = 0; i < presses; i++) {
                    await sendRequest('keypress/Right');
                }

                await delay(LOADING_DELAYS.SEARCH_RESULTS);

                // Select search
                console.log('Selecting search...');
                await sendRequest('keypress/Select');
                await delay(LOADING_DELAYS.MENU_NAVIGATION);

            }
            // Add other app-specific search implementations here

            setIsExecuting(false);
            return true;
        } catch (error) {
            console.error('Search failed:', error);
            setLastError(error.message);
            setIsExecuting(false);
            return false;
        }
    }, [sendRequest, typeText, isExecuting]);

    const executeCommand = useCallback(async (command) => {
        if (isExecuting) {
            console.log('Already executing a command, skipping');
            return false;
        }

        console.log('Executing Roku command:', command);
        setIsExecuting(true);

        try {
            let result = false;

            switch (command.type) {
                case ROKU_COMMAND_TYPES.LAUNCH_APP: {
                    const appInfo = Object.values(ROKU_APPS).find(app =>
                        app.name.toLowerCase() === command.app.toLowerCase()
                    );
                    if (!appInfo) {
                        throw new Error(`Unknown app: ${command.app}`);
                    }
                    result = await sendRequest(`launch/${appInfo.id}`);
                    await delay(LOADING_DELAYS.APP_LAUNCH);
                    break;
                }

                case ROKU_COMMAND_TYPES.SEARCH: {
                    const appInfo = Object.values(ROKU_APPS).find(app =>
                        app.name.toLowerCase() === command.app.toLowerCase()
                    );
                    if (!appInfo) {
                        throw new Error(`Unknown app: ${command.app}`);
                    }
                    result = await searchInApp(appInfo.id, command.searchTerm);
                    break;
                }

                case ROKU_COMMAND_TYPES.NAVIGATION:
                case ROKU_COMMAND_TYPES.PLAYBACK:
                case ROKU_COMMAND_TYPES.VOLUME: {
                    const action = ROKU_ACTIONS[command.action];
                    if (!action) {
                        throw new Error(`Unknown action: ${command.action}`);
                    }
                    result = await sendRequest(`keypress/${action}`);
                    await delay(LOADING_DELAYS.MENU_NAVIGATION);
                    break;
                }

                default:
                    throw new Error(`Unknown command type: ${command.type}`);
            }

            setIsExecuting(false);
            return result;
        } catch (error) {
            console.error('Failed to execute Roku command:', error);
            setLastError(error.message);
            setIsExecuting(false);
            return false;
        }
    }, [sendRequest, searchInApp, isExecuting]);

    return {
        executeCommand,
        setRokuIP,
        lastError,
        currentIP: rokuIP,
        isExecuting
    };
};

export default useRokuControl;