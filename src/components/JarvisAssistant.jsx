import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings, Volume2, Loader, Brain } from 'lucide-react';
import { usePorcupine } from '@picovoice/porcupine-react';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ROKU_COMMAND_TYPES } from './rokuTypes';
import SmartMirrorUI from './SmartMirrorUI';
import useRokuControl from './RokuController';

const BULB_API_BASE = 'http://127.0.0.1:8000';

// Initialize API clients
const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
});

const anthropic = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true
});

// Initialize Gemini client
const gemini = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

class JSONBuffer {
    constructor() {
        this.buffer = '';
        this.bracketCount = 0;
        this.isCollecting = false;
    }

    append(chunk) {
        if (!this.isCollecting && chunk.includes('{')) {
            this.isCollecting = true;
            this.buffer = '';
            this.bracketCount = 0;
        }

        if (this.isCollecting) {
            this.buffer += chunk;
            for (const char of chunk) {
                if (char === '{') this.bracketCount++;
                if (char === '}') this.bracketCount--;
            }

            if (this.bracketCount === 0 && this.buffer.includes('}')) {
                const jsonStr = this.extractJSON();
                if (jsonStr) {
                    this.reset();
                    return jsonStr;
                }
            }
        }
        return null;
    }

    extractJSON() {
        try {
            const match = this.buffer.match(/{[^]*}/);
            if (match) {
                const jsonStr = match[0];
                JSON.parse(jsonStr);
                return jsonStr;
            }
        } catch (e) {
            console.error('Failed to extract JSON:', e);
        }
        return null;
    }

    reset() {
        this.buffer = '';
        this.bracketCount = 0;
        this.isCollecting = false;
    }
}

const LLM_CONFIGS = {
    sonar: {
        name: 'Sonar',
        color: 'bg-blue-600',
        description: 'Real-time internet access'
    },
    gemini: {
        name: 'Gemini',
        color: 'bg-red-600',
        description: 'Multimodal capabilities'
    }
};

const DEFAULT_MODEL = 'gemini';

// Optimized Audio Processing
const AudioProcessor = {
    context: null,
    analyserNode: null,
    source: null,

    async initialize() {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.analyserNode = this.context.createAnalyser();
        this.analyserNode.fftSize = 1024;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    sampleSize: 16,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            stream.getTracks().forEach(track => track.stop());
        } catch (error) {
            console.error('Failed to initialize audio:', error);
        }


    }
};

class ParallelAudioPlayer {
    constructor() {
        this.audioQueue = [];
        this.currentAudio = null;
        this.audioCache = new Map();
        this.ttsQueue = [];
        this.isProcessing = false;
        this.isPlaying = false;
    }

    async queueSentence(sentence) {
        if (!sentence.trim()) return;

        try {
            if (this.audioCache.has(sentence)) {
                const url = this.audioCache.get(sentence);
                console.log('Using cached audio for:', sentence);
                this.audioQueue.push({
                    url: url,
                    text: sentence
                });
                console.log('Audio queue after adding from cache:', this.audioQueue);

                if (!this.isPlaying) {
                    this.playNextInQueue();
                }
                return;
            }

            console.log('Queueing TTS request for:', sentence);
            await this.queueTTSRequest(sentence);
        } catch (error) {
            console.error('Failed to queue sentence:', error);
        }
    }

    async queueTTSRequest(text) {
        return new Promise((resolve, reject) => {
            console.log('Adding TTS request to queue:', text);
            this.ttsQueue.push({ text, resolve, reject });
            console.log('TTS queue:', this.ttsQueue);

            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    async processQueue() {
      if (this.ttsQueue.length === 0) {
          this.isProcessing = false;
          console.log('TTS queue is empty, stopping processing.');
          return;
      }
  
      this.isProcessing = true;
      const batchSize = 5;  // Adjust this based on ElevenLabs API limits
      const batch = this.ttsQueue.splice(0, batchSize); // Take a batch of TTS requests
      console.log('Processing TTS batch:', batch.map(item => item.text));
  
      try {
          const audioUrls = await Promise.all(batch.map(async ({ text }) => {
              try {
                  const audioUrl = await this.fetchTTSAudio(text);
                  this.audioCache.set(text, audioUrl);
                  console.log('Cached audio for:', text, 'URL:', audioUrl);
                  return { text, url: audioUrl };
              } catch (error) {
                  console.error(`TTS processing failed for "${text}":`, error);
                  return { text, error }; // Propagate the error
              }
          }));
  
          // Process the results of the batch
          audioUrls.forEach(({ text, url, error }) => {
              if (url) {
                  this.audioQueue.push({ url: url, text: text });
                  console.log('Audio queue after adding TTS audio:', this.audioQueue);
              } else {
                  const { reject } = batch.find(item => item.text === text);
                  reject(error); // Reject the promise for this sentence if TTS failed
              }
          });
  
          if (!this.isPlaying && this.audioQueue.length > 0) {
              this.playNextInQueue();
          }
      } catch (error) {
          console.error('Batch TTS processing failed:', error);
          batch.forEach(({ reject }) => reject(error)); // Reject all promises in the batch
      }
  
      this.isProcessing = false;  // Reset after processing the batch
      this.processQueue(); // Continue processing the queue recursively
  }

    async playNextInQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            console.log('TTS queue is empty, stopping processing.');
            return;
        }

        this.isPlaying = true;
        const { url, text } = this.audioQueue.shift();
        console.log('Playing from audio queue:', text, 'URL:', url);
        console.log('Audio queue after shift:', this.audioQueue);

        try {
            if (this.currentAudio) {
                this.currentAudio.pause();
                URL.revokeObjectURL(this.currentAudio.src);
                console.log('Paused previous audio and revoked URL.');
            }

            this.currentAudio = new Audio(url);
            await this.currentAudio.play();
            console.log('Started playing audio.');

            this.currentAudio.addEventListener('ended', () => {
                console.log('Audio ended:', text);

                if (this.audioCache.size > 50) {
                    const firstKey = this.audioCache.keys().next().value;
                    URL.revokeObjectURL(this.audioCache.get(firstKey));
                    this.audioCache.delete(firstKey);
                    console.log('Removed oldest audio from cache:', firstKey);
                }

                this.playNextInQueue();
            }, { once: true });

        } catch (error) {
            console.error('Failed to play audio:', error);
            this.playNextInQueue();
        }
    }

    async fetchTTSAudio(text) {
        const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${import.meta.env.VITE_ELEVENLABS_VOICE_ID}/stream`,
            {
                method: 'POST',
                headers: {
                    'xi-api-key': import.meta.env.VITE_ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg'
                },
                body: JSON.stringify({
                    text: text.trim(),
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`TTS API error: ${response.status}`);
        }

        const blob = await response.blob();
        return URL.createObjectURL(blob);
    }

    stop() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            URL.revokeObjectURL(this.currentAudio.src);
            this.currentAudio = null;
        }
        this.audioQueue = [];
        this.isPlaying = false;
        console.log('Stopped audio playback.');
    }
}

class SoundEffectsManager {
    constructor() {
        this.audioContext = null;
        this.startBuffer = null;
        this.stopBuffer = null;
        this.isLoaded = false;
    }

    async initialize() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const [startSound, stopSound] = await Promise.all([
                this.loadSound('/sounds/start_listening.wav'),
                this.loadSound('/sounds/stop_listening.mp3')
            ]);
            this.startBuffer = startSound;
            this.stopBuffer = stopSound;
            this.isLoaded = true;
            console.log('Sound effects loaded successfully');
        } catch (error) {
            console.error('Failed to load sound effects:', error);
        }
    }

    async loadSound(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await this.audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error(`Failed to load sound from ${url}:`, error);
            throw error;
        }
    }

    async playSound(buffer) {
        if (!this.isLoaded || !this.audioContext) return;
        try {
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);
        } catch (error) {
            console.error('Failed to play sound:', error);
        }
    }

    async playStartSound() {
        await this.playSound(this.startBuffer);
    }

    async playStopSound() {
        await this.playSound(this.stopBuffer);
    }

    async resume() {
        if (this.audioContext?.state === 'suspended') {
            await this.audioContext.resume();
        }
    }
}

const JarvisAssistant = () => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [response, setResponse] = useState('');
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [selectedModel, setDefaultModel] = useState(DEFAULT_MODEL);

    const jsonBuffer = useRef(new JSONBuffer());
    const soundEffects = useRef(new SoundEffectsManager());

    //NEW STATE VARIABLES
    const [availableBulbs, setAvailableBulbs] = useState([]);
    const [selectedBulbs, setSelectedBulbs] = useState([]); // State to hold selected bulb IDs

     // Import the executeCommand function from useRokuControl
    const { executeCommand } = useRokuControl();

    useEffect(() => {
        soundEffects.current.initialize();
    }, []);

    useEffect(() => {
        const fetchBulbs = async () => {
            try {
                const response = await fetch(`${BULB_API_BASE}/bulbs`);
                const data = await response.json();
                setAvailableBulbs(data);

                // Optionally, pre-select all bulbs on initial load
                setSelectedBulbs(data.map(bulb => bulb.device_id));

            } catch (err) {
                console.error('Failed to fetch bulb configurations', err);
                setErrorMessage('Failed to fetch bulb configurations');
                setStatus('error');
            }
        };
        fetchBulbs();
    }, []);

    const audioPlayer = useRef(new ParallelAudioPlayer());
    const isRecording = useRef(false);
    const recordedChunks = useRef([]);
    const silenceStart = useRef(null);

    const SILENCE_THRESHOLD = 0.01;
    const SILENCE_DURATION = 1000;

    const {
        keywordDetection,
        isLoaded,
        error,
        init,
        start,
        stop,
        release
    } = usePorcupine();

    const getGeminiSystemPrompt = () => `You are Jarvis, an AI assistant. You are based in Atlanta, Georgia. Your primary responsibility is to assist the user with daily tasks, process commands, and provide helpful information.  You MUST ALWAYS provide information relevant to Atlanta, Georgia unless the user explicitly asks for another location.  Do NOT include any citations in your responses. Keep your answers as brief as possible, under 50 words, unless user specified, to reduce API bandwith. Make sure your output could 100% be parsed by text-to-speech so do not include anything not heard in natural language.

If the user's request explicitly asks for information from the internet (e.g., current weather, sports scores, latest news, definitions, stock prices), or if the request cannot be fulfilled without real-time information, preface your query with "SEARCH:" This will trigger the use of a search engine.  When searching for weather, ALWAYS default to Atlanta, Georgia unless the user specifies otherwise. Do NOT include any citations, or anything that can not be parsed into NLP, such as [1][2], in your response as it will be turned into TTS.

You can control two device types: BULB_CONTROL and ROKU_CONTROL.

For BULB_CONTROL, output a JSON blob formatted like this:
{
"type": "command",
"payload": {
    "deviceType": "BULB_CONTROL",
    "action": "POWER_ON" or "POWER_OFF" or "SET_BRIGHTNESS" or "SET_COLOR",
    "bulbs": ["eba55e6d0822d5ad2edwv7", "eb506e78c700b185a2ppjq", "ebf9a11b3323926dac7jmt"],
    "parameters": {
        "brightness": 500,
        "h":0,
        "s":100,
        "v":100
    }
}
}

For ROKU_CONTROL, output a JSON blob formatted like this:
{
"type": "command",
"payload": {
"deviceType": "ROKU_CONTROL",
"action": "VOLUME_UP" or "VOLUME_DOWN" or "CHANNEL_UP" or "LAUNCH_APP",
 "app": "Plex",
}
}

If the user does not want to change anything locally, or access the internet, then respond conversationally in natural language.
`;

    const isCompleteJSON = (str) => {
        try {
            JSON.parse(str);
            return true;
        } catch (e) {
            return false;
        }
    };

    const extractJSONFromText = (text) => {
        const matches = text.match(/{[^]*}/);
        return matches ? matches[0] : null;
    };

    const processCommand = async (text) => {
        try {
            console.log('Processing command:', text);
            setStatus('processing');

             // First try with Gemini
            let geminiResponse = await callGemini(text);
            console.log('Gemini Response:', geminiResponse);

           //NEW ADDED CODE - check gemini repsonse. Only make a sounder call if necesary
            const locationCheck = text.toLowerCase().includes("where am i located");

            if (locationCheck && geminiResponse.toLowerCase().includes("atlanta, georgia")) {
                processResponseSentences(geminiResponse);
                return;
            }


            // Check for JSON command
            if (geminiResponse.includes('{')) {
                const jsonStr = geminiResponse.match(/\{[^]*\}/)[0];
                if (jsonStr && isCompleteJSON(jsonStr)) {
                    const parsedCommand = JSON.parse(jsonStr);
                    if (parsedCommand.type === 'command' && parsedCommand.payload) {
                        // Add verbal confirmation before executing the local command
                        let commandConfirmation = "Acknowledged. Executing the local command.";
                        await audioPlayer.current.queueSentence(commandConfirmation);
                        setResponse(commandConfirmation);
                        await handleCommandExecution(parsedCommand.payload);
                        return;
                    }
                }
            }

            // Check for internet request
            if (geminiResponse.startsWith('SEARCH: ')) {
                const searchQuery = geminiResponse.replace('SEARCH: ', '');
                const sonarResponse = await callSonar(searchQuery);
                processResponseSentences(sonarResponse);
                return;
            }

            // If Gemini did not find a SEARCH, but the command still requires it, force search, and handle Sonar
            const requiresSearch = text.toLowerCase().includes("search") ||
                text.toLowerCase().includes("weather") ||
                text.toLowerCase().includes("news");
            if (requiresSearch) {
                const searchResponse = [
                    "Allow me to search this for you.",
                    "Sure, I'll get that information for you.",
                    "One moment while I look that up.",
                    "Let me quickly check the web for you.",
                    "I will search this for you."
                ];
                const index = Math.floor(Math.random() * searchResponse.length);
                const searchString = searchResponse[index];
                await audioPlayer.current.queueSentence(searchString);
                setResponse(searchString);

                const sonarResponse = await callSonar(text);
                processResponseSentences(sonarResponse);
                return;
            }

            // If no special command, output the gemini string
            processResponseSentences(geminiResponse)

        } catch (error) {
            console.error('Command processing failed:', error);
            setErrorMessage(`Failed to process command: ${error.message}`);
            setStatus('error');
        }
    };

    const delay = ms => new Promise(res => setTimeout(res, ms));

    const processResponseSentences = async (fullResponse) => {
        setResponse(fullResponse);
        // Updated regex
        const sentences = fullResponse.split(/(?<!\w\.\w\.)(?<![A-Z][a-z]\.)(?<=[.?!])\s/);

        console.log('Split sentences:', sentences);

        // Asynchronously queue and process each sentence
        sentences.forEach(async (sentence, index) => {
            if (sentence.trim()) {
                console.log('Queueing sentence:', sentence.trim());
                await audioPlayer.current.queueSentence(sentence.trim());
            }
        });
        console.log('All sentences queued.');
    };

   const handleCommandExecution = async (payload) => {
         console.log('handleCommandExecution payload:', payload); // Debugging line

        if (payload.deviceType === 'BULB_CONTROL') {
            // Verbal Confirmation Before Bulb Command
            let bulbCommandDesc = generateBulbCommandDescription(payload);
            await audioPlayer.current.queueSentence(bulbCommandDesc);
            setResponse(bulbCommandDesc);

            const success = await executeBulbCommand(payload);
            if (success) {
                const confirmationMessage = generateBulbConfirmation(payload);
                processResponseSentences(confirmationMessage);
            }
        } else if (payload.deviceType === 'ROKU_CONTROL') { // Fix: Use correct deviceType
            // Verbal Confirmation Before Roku Command
            let rokuCommandDesc = generateRokuCommandDescription(payload);
            await audioPlayer.current.queueSentence(rokuCommandDesc);
            setResponse(rokuCommandDesc);

            // Execute Roku command with error handling
             try {
                const success = await executeRokuCommand(payload);
                if (!success) {
                  console.warn("Roku command execution returned false/undefined, check Roku command for execution");
                }
              } catch (error) {
                console.error("Failed to execute Roku command:", error);
                setErrorMessage(`Failed to execute Roku command: ${error.message}`);
                setStatus('error');
                return;
              }
        } else {
            console.warn("Unknown deviceType:", payload.deviceType)
        }
    };


    //New Description functions to not repeat code
    const generateBulbCommandDescription = (command) => {
        const { action, bulbs, parameters } = command;
        const bulbText = bulbs[0] === 'all' ? 'all bulbs' :
            command.bulbs.length > 1 ? `bulbs ${command.bulbs.join(', ')}` :
                `${command.bulbs[0]}`;

        switch (action) {
            case 'POWER_ON':
                return `Turning on ${bulbText}.`;
            case 'POWER_OFF':
                return `Turning off ${bulbText}.`;
            case 'SET_BRIGHTNESS':
                return `Setting brightness to ${parameters.brightness} for ${bulbText}.`;
            case 'SET_TEMPERATURE':
                return `Setting temperature to ${parameters.temperature} for ${bulbText}.`;
            case 'SET_COLOR':
                return `Setting color to hue ${parameters.color.h}, saturation ${parameters.color.s}, value ${parameters.color.v} for ${bulbText}.`;
            case 'SET_MODE':
                return `Setting mode to ${parameters.mode} for ${bulbText}.`;
            default:
                return `Executing command for ${bulbText}.`;
        }
    };

    const generateRokuCommandDescription = (command) => {
        switch (command.deviceType) {
            case ROKU_COMMAND_TYPES.LAUNCH_APP:
                return `Launching ${command.app} on Roku.`;
            default:
                return `Executing ${command.action.toLowerCase().replace('_', ' ')} on Roku.`;
        }
    };



   const executeBulbCommand = async (command) => {
    const { action, bulbs, parameters } = command;

    try {
        let endpoint = '';
        let value = '';  // For actions that require a value (e.g., brightness, temperature)
        let bulbIds = bulbs; // Use the device IDs directly from the JSON payload

        switch (action) {
            case 'POWER_ON':
                endpoint = '/power/on';
                break;
            case 'POWER_OFF':
                endpoint = '/power/off';
                break;
            case 'SET_BRIGHTNESS':
                endpoint = '/brightness/';
                value = parameters.brightness;
                break;
            case 'SET_TEMPERATURE':
                endpoint = '/temperature/';
                value = parameters.temperature;
                break;
            case 'SET_MODE':
                endpoint = '/mode/';
                value = parameters.mode;
                break;
            case 'SET_COLOR':
              return await handleColorChange(parameters.h, parameters.s, parameters.v, bulbIds);
            default:
                throw new Error(`Unknown action: ${action}`);
        }
        console.log("Bulb API call:", `${endpoint}${value}`); // Log the API call URL
        return await handleAction(`${endpoint}${value}`, bulbIds);

    } catch (error) {
        console.error('Failed to execute bulb command:', error);
        setErrorMessage(`Failed to execute bulb command: ${error.message}`);
         setStatus('error');
        return false;
    }
};

const handleColorChange = async (h, s, v, bulbIds) => {
        // Make sure h, s, v are numbers
        h = Number(h);
        s = Number(s);
        v = Number(v);

        try {
            const response = await fetch(`${BULB_API_BASE}/color`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    h, s, v,
                    bulb_ids: bulbIds // Use deviceIds parameter
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail);
            }

            return true;
        } catch (err) {
            console.error('Failed to set color: ' + err.message);
             setErrorMessage(`Failed to set color: ${err.message}`);
            setStatus('error');
            return false;
        }

    };

    const handleAction = async (endpoint, bulbIds) => {  // Remove the loop
      try {
          const response = await fetch(`${BULB_API_BASE}${endpoint}`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({ bulb_ids: bulbIds }), // Pass the entire list
          });
  
          if (!response.ok) {
              const data = await response.json();
              throw new Error(data.detail);
          }
  
          return true;
      } catch (err) {
          console.error('Failed to control bulbs: ' + err.message);
            setErrorMessage(`Failed to control bulbs: ${err.message}`);
          setStatus('error');
          return false;
      }
  };

    const generateBulbConfirmation = (command) => {
        const bulbText = command.bulbs[0] === 'all' ? 'all bulbs' :
            command.bulbs.length > 1 ? `bulbs ${command.bulbs.join(', ')}` :
                `${command.bulbs[0]}`;
        switch (command.action) {
            case 'POWER_ON': return `Turning on ${bulbText}.`;
            case 'POWER_OFF': return `Turning off ${bulbText}.`;
            case 'SET_BRIGHTNESS': return `Brightness set to ${command.parameters.brightness}.`;
            case 'SET_TEMPERATURE': return `Temperature set to ${command.parameters.temperature} degrees.`;
            case 'SET_COLOR': return `Color updated for ${bulbText}.`;
            case 'SET_MODE': return `Mode set to ${command.parameters.mode}.`;
            default: return `Command executed for ${bulbText}.`;
        }
    };

     // Update the executeRokuCommand function to call executeCommand from the hook
    const executeRokuCommand = async (command) => {
        try {
            if (command && command.action) {
                 const success = await executeCommand(command); // Pass the action directly
                  if (!success) {
                    console.warn("Roku command execution returned false/undefined, check Roku command for execution");
                  }
            } else {
                console.error('Invalid Roku command:', command);
            }
        } catch (error) {
            console.error('Failed to execute Roku command:', error);
              setErrorMessage(`Failed to execute Roku command: ${error.message}`);
              setStatus('error');
        }
    };

    const callGemini = async (text) => {
        try {
            const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash-lite-preview-02-05" });

            const result = await model.generateContent(getGeminiSystemPrompt() + "\n\n" + text);
            const fullResponse = result.response.text();

            return fullResponse;
        } catch (error) {
            console.error('Gemini API error:', error);
            throw error;
        }
    };

    const callSonar = async (text) => {
        // Witty intro before calling Sonar
        const sonarIntros = [
            `Ah, let me peruse the web for you using Sonar.`,
            `Let me leverage the vastness of the internet with Sonar.`,
            `I will check with Sonar for you now.`,
            `Summoning Sonar to the task!`,
            `Time to tap into the web with Sonar.`
        ];

        const intro = sonarIntros[Math.floor(Math.random() * sonarIntros.length)];
        await audioPlayer.current.queueSentence(intro);
        setResponse(intro);

        try {
            const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${import.meta.env.VITE_PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'sonar-pro',
                    messages: [{ role: 'user', content: text }],
                    max_tokens: 250,
                    temperature: 0.7
                })
            });
            const data = await response.json();
            // ADDED CODE - Remove citations
            const sonarResponse = data.choices[0].message.content.replace(/\[\d+]/g, '');
            return sonarResponse;
        } catch (error) {
            console.error('Sonar API error:', error);
            throw error;
        }
    };

    const porcupineKeyword = {
        publicPath: './jarvis.ppn',
        label: 'jarvis'
    };

    const porcupineModel = {
        publicPath: '/porcupine_params.pv'
    };

    const initPorcupine = async () => {
        try {
            await init(
                import.meta.env.VITE_PICOVOICE_API_KEY,
                porcupineKeyword,
                porcupineModel
            );
        } catch (error) {
            console.error('Init error:', error);
            setErrorMessage(error.message);
            setStatus('error');
        }
    };

    const startRecording = async () => {
        try {
            await soundEffects.current.resume();
            await soundEffects.current.playStartSound();
            setStatus('listening');

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    sampleSize: 16,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Float32Array(bufferLength);

            recordedChunks.current = [];
            isRecording.current = true;
            silenceStart.current = null;

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            const SILENCE_THRESHOLD = 0.01;
            const MIN_RECORDING_TIME = 1000;
            const MAX_SILENCE_TIME = 1500;
            const MAX_RECORDING_TIME = 10000;
            let recordingStartTime = Date.now();

            const checkAudioLevel = () => {
                if (!isRecording.current) return;

                analyser.getFloatTimeDomainData(dataArray);
                const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + val * val, 0) / bufferLength);
                const currentTime = Date.now();
                const recordingDuration = currentTime - recordingStartTime;

                console.log('Audio level:', rms, 'Recording duration:', recordingDuration);

                if (recordingDuration < MIN_RECORDING_TIME) {
                    requestAnimationFrame(checkAudioLevel);
                    return;
                }

                if (recordingDuration >= MAX_RECORDING_TIME) {
                    console.log('Reached maximum recording time');
                    mediaRecorder.stop();
                    isRecording.current = false;
                    return;
                }

                if (rms < SILENCE_THRESHOLD) {
                    if (!silenceStart.current) {
                        silenceStart.current = currentTime;
                    } else if (currentTime - silenceStart.current > MAX_SILENCE_TIME) {
                        console.log('Detected silence, stopping recording');
                        mediaRecorder.stop();
                        isRecording.current = false;
                        return;
                    }
                } else {
                    silenceStart.current = null;
                }

                requestAnimationFrame(checkAudioLevel);
            };

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                soundEffects.current.playStopSound();
                stream.getTracks().forEach(track => track.stop());
                audioContext.close();
                processRecordedAudio();
            };

            mediaRecorder.start(100);
            checkAudioLevel();
            console.log('Started recording with silence detection');

        } catch (error) {
            console.error('Recording failed:', error);
            setErrorMessage('Failed to start recording: ' + error.message);
            setStatus('error');
        }
    };

    const processRecordedAudio = async () => {
        try {
            console.log('Starting to process recorded audio');
            setStatus('processing');

            const audioBlob = new Blob(recordedChunks.current, { type: 'audio/webm' });
            console.log('Created audio blob:', audioBlob.size, 'bytes');
            const audioFile = await convertAudioToMp3(audioBlob);
            console.log('Converted to MP3 file');            console.log('Sending to Whisper for transcription...');
            const transcription = await openai.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-1',
                language: 'en'
            });

            console.log('Received transcription:', transcription.text);
            setTranscript(transcription.text);
            await processCommand(transcription.text);
            setStatus('idle');
        } catch (error) {
            console.error('Processing failed:', error);
            setErrorMessage('Failed to process command: ' + error.message);
            setStatus('error');
        }
    };

    const convertAudioToMp3 = async (audioBlob) => {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const offlineContext = new OfflineAudioContext(
            1,
            audioBuffer.length,
            audioBuffer.sampleRate
        );

        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start();

        const renderedBuffer = await offlineContext.startRendering();

        const wavBlob = await new Promise(resolve => {
            const length = renderedBuffer.length * 2;
            const buffer = new ArrayBuffer(44 + length);
            const view = new DataView(buffer);

            writeUTFBytes(view, 0, 'RIFF');
            view.setUint32(4, 36 + length, true);
            writeUTFBytes(view, 8, 'WAVE');
            writeUTFBytes(view, 12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, renderedBuffer.sampleRate, true);
            view.setUint32(28, renderedBuffer.sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeUTFBytes(view, 36, 'data');
            view.setUint32(40, length, true);

            const data = new Float32Array(renderedBuffer.length);
            renderedBuffer.copyFromChannel(data, 0);
            let offset = 44;
            for (let i = 0; i < data.length; i++) {
                const sample = Math.max(-1, Math.min(1, data[i]));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }

            resolve(new Blob([buffer], { type: 'audio/wav' }));
        });

        return new File([wavBlob], 'audio.wav', { type: 'audio/wav' });
    };

    const writeUTFBytes = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    const handleWakeWordDetection = async () => {
        if (isRecording.current) return;
        console.log('Wake word detected!');
        await soundEffects.current.resume();
        await soundEffects.current.playStartSound();
        setStatus('listening');
        startRecording();
    };
    // Debug Mode and Text Input
    const [debugMode, setDebugMode] = useState(false);
    const [textInput, setTextInput] = useState('');

    const handleTextInputSubmit = async () => {
        if (textInput.trim() !== '') {
            setTranscript(textInput);
            await processCommand(textInput);
            setTextInput('');
        }
    };

    useEffect(() => {
        AudioProcessor.initialize().catch(console.error);
        initPorcupine();

        return () => {
            release();
            audioPlayer.current.stop();
        };
    }, []);

    useEffect(() => {
        if (error) {
            console.error('Porcupine error:', error);
            setErrorMessage(error.message);
            setStatus('error');
            setIsListening(false);
        }
    }, [error]);

    useEffect(() => {
        if (isLoaded) {
            console.log('Porcupine loaded successfully');
            start();
            setIsListening(true);
            setStatus('idle');
        }
    }, [isLoaded]);

    useEffect(() => {
        if (keywordDetection) {
            console.log('Wake word detected:', keywordDetection);
            handleWakeWordDetection();
        }
    }, [keywordDetection]);

    return (
        <>
            <SmartMirrorUI
                isListening={isListening}
                transcript={transcript}
                response={response}
                status={status}
                selectedModel={selectedModel}
                onModelChange={setDefaultModel}
                errorMessage={errorMessage}
                rokuStatus={true}
                isSpeaking={audioPlayer.current?.isPlaying}
                 availableBulbs={availableBulbs}
            selectedBulbs={selectedBulbs}
            onBulbSelectionChange={setSelectedBulbs} // Pass the selection handler
            />
            {/* Debug UI - Conditionally rendered */}
            {debugMode && (
                <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', background: 'rgba(0,0,0,0.8)', padding: '10px', color: 'white', zIndex: 1000 }}>
                    <input
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        style={{ width: '70%', padding: '5px', color: 'black' }}
                        placeholder="Enter text command"
                    />
                    <button onClick={handleTextInputSubmit} style={{ padding: '5px 10px', background: 'green', color: 'white', border: 'none', cursor: 'pointer' }}>
                        Submit Text
                    </button>
                </div>
            )}
        </>
    );
};

export default JarvisAssistant;