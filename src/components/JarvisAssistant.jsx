import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings, Volume2, Loader, Brain } from 'lucide-react';
import { usePorcupine } from '@picovoice/porcupine-react';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import SmartMirrorUI from './SmartMirrorUI';

// Initialize API clients
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true
});

const LLM_CONFIGS = {
  sonar: {
    name: 'Sonar',
    color: 'bg-blue-600',
    description: 'Real-time internet access'
  },
  claude: {
    name: 'Claude',
    color: 'bg-purple-600',
    description: 'Fast responses'
  },
  deepseek: {
    name: 'DeepSeek',
    color: 'bg-green-600',
    description: 'Advanced reasoning'
  },
  gpt4: {
    name: 'GPT-4',
    color: 'bg-yellow-600',
    description: 'General knowledge'
  }
};

// Optimized Audio Processing
const AudioProcessor = {
  context: null,
  analyserNode: null,
  source: null,

  async initialize() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.analyserNode = this.context.createAnalyser();
    this.analyserNode.fftSize = 1024; // Reduced for better performance

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

// Optimized Audio Player with caching
class ParallelAudioPlayer {
  constructor() {
    this.audioQueue = [];
    this.currentAudio = null;
    this.audioCache = new Map();
    this.ttsQueue = [];
    this.isProcessing = false;
    this.isPlaying = false;
  }

  // Queue a new sentence for TTS processing
  async queueSentence(sentence) {
    if (!sentence.trim()) return;

    try {
      // Check cache first
      if (this.audioCache.has(sentence)) {
        this.audioQueue.push({
          url: this.audioCache.get(sentence),
          text: sentence
        });

        if (!this.isPlaying) {
          this.playNextInQueue();
        }
        return;
      }

      // Add to TTS processing queue
      await this.queueTTSRequest(sentence);
    } catch (error) {
      console.error('Failed to queue sentence:', error);
    }
  }

  async queueTTSRequest(text) {
    return new Promise((resolve, reject) => {
      this.ttsQueue.push({ text, resolve, reject });
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  async processQueue() {
    if (this.ttsQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const { text, resolve, reject } = this.ttsQueue.shift();

    try {
      const audioUrl = await this.fetchTTSAudio(text);
      this.audioCache.set(text, audioUrl);

      this.audioQueue.push({
        url: audioUrl,
        text: text
      });

      if (!this.isPlaying) {
        this.playNextInQueue();
      }

      resolve();
    } catch (error) {
      reject(error);
    }

    // Process next in queue
    this.processQueue();
  }

  async playNextInQueue() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const { url, text } = this.audioQueue.shift();

    try {
      if (this.currentAudio) {
        this.currentAudio.pause();
        URL.revokeObjectURL(this.currentAudio.src);
      }

      this.currentAudio = new Audio(url);
      await this.currentAudio.play();

      // Set up handler for when audio finishes
      this.currentAudio.addEventListener('ended', () => {
        // Cleanup cache if it gets too large
        if (this.audioCache.size > 50) {
          const firstKey = this.audioCache.keys().next().value;
          URL.revokeObjectURL(this.audioCache.get(firstKey));
          this.audioCache.delete(firstKey);
        }

        // Play next audio in queue
        this.playNextInQueue();
      }, { once: true });

    } catch (error) {
      console.error('Failed to play audio:', error);
      this.playNextInQueue(); // Skip to next on error
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
  }
}

const JarvisAssistant = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState('sonar');

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

  const handleLLMResponse = async (text) => {
    setResponse(text);
    try {
      await audioPlayer.current.playResponse(text);
    } catch (error) {
      console.error('Failed to play audio:', error);
      setErrorMessage('Failed to play audio response');
    }
  };

  const callSonar = async (text, onChunk) => {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: getSonarSystemPrompt() },
          { role: 'user', content: text }
        ],
        max_tokens: 250,
        temperature: 0.7,
        stream: true // Enable streaming
      })
    });

    if (!response.ok) {
      throw new Error(`Sonar API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.choices?.[0]?.delta?.content) {
              onChunk(data.choices[0].delta.content);
            }
          } catch (e) {
            console.error('Error parsing streaming response:', e);
          }
        }
      }
    }
  };

  const callClaude = async (text, onChunk) => {
    const stream = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      system: getClaudeSystemPrompt(),
      messages: [{ role: 'user', content: text }],
      stream: true
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        onChunk(chunk.delta.text);
        fullResponse += chunk.delta.text;
      }
    }
    return fullResponse;
  };

  const callGPT4 = async (text, onChunk) => {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: getGPT4SystemPrompt() },
        { role: 'user', content: text }
      ],
      stream: true
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        const content = chunk.choices[0].delta.content;
        onChunk(content);
        fullResponse += content;
      }
    }
    return fullResponse;
  };

  const callDeepseek = async (text, onChunk) => {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: getDeepSeekSystemPrompt() },
          { role: 'user', content: text }
        ],
        max_tokens: 250,
        temperature: 0.7,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.choices?.[0]?.delta?.content) {
              onChunk(data.choices[0].delta.content);
            }
          } catch (e) {
            console.error('Error parsing streaming response:', e);
          }
        }
      }
    }
  };

  const processCommand = async (text) => {
    try {
      setStatus('processing');
      let currentSentence = '';
      let fullResponse = '';

      // Helper function to detect sentence boundaries
      const isSentenceEnd = (char) => {
        return ['.', '!', '?'].includes(char);
      };

      const handleChunk = (chunk) => {
        fullResponse += chunk;
        currentSentence += chunk;
        setResponse(fullResponse);

        // Check for sentence boundaries in the new chunk
        const lastChar = chunk[chunk.length - 1];
        if (isSentenceEnd(lastChar) && currentSentence.trim().length > 0) {
          // Queue the complete sentence for TTS
          audioPlayer.current.queueSentence(currentSentence.trim());
          currentSentence = '';
        }
      };

      switch (selectedModel) {
        case 'sonar':
          await callSonar(text, handleChunk);
          break;
        case 'claude':
          await callClaude(text, handleChunk);
          break;
        case 'deepseek':
          await callDeepseek(text, handleChunk);
          break;
        case 'gpt4':
          await callGPT4(text, handleChunk);
          break;
        default:
          throw new Error('Invalid model selected');
      }

      // Queue any remaining text as a sentence
      if (currentSentence.trim().length > 0) {
        audioPlayer.current.queueSentence(currentSentence.trim());
      }

      setStatus('idle');

    } catch (error) {
      console.error('Command processing failed:', error);
      setErrorMessage(`Failed to process command: ${error.message}`);
      setStatus('error');
    }
  };

  // System prompts - simplified for better performance
  const getSonarSystemPrompt = () => `You are Jarvis, an AI assistant with real-time internet access. Keep responses under 50 words. Do not include citations. You are also a quantitative financial expert. You know all about what has gone on in the news recently and its impact on market trends. Any questions about finance should be comprehensive and informed, as well as could go beyond 150 words.`;
  const getClaudeSystemPrompt = () => `You are Jarvis, an AI assistant. Provide concise responses under 100 words.`;
  const getDeepSeekSystemPrompt = () => `You are Jarvis, an AI assistant. Provide efficient responses under 100 words.`;
  const getGPT4SystemPrompt = () => `You are Jarvis, an AI assistant. Provide clear responses under 100 words.`;

  const startRecording = async () => {
    try {
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

      const source = AudioProcessor.context.createMediaStreamSource(stream);
      source.connect(AudioProcessor.analyserNode);

      recordedChunks.current = [];
      isRecording.current = true;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      const checkAudioLevel = () => {
        if (!isRecording.current) return;

        const dataArray = new Float32Array(AudioProcessor.analyserNode.fftSize);
        AudioProcessor.analyserNode.getFloatTimeDomainData(dataArray);

        const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + val * val, 0) / dataArray.length);

        if (rms < SILENCE_THRESHOLD) {
          if (!silenceStart.current) {
            silenceStart.current = Date.now();
          } else if (Date.now() - silenceStart.current > SILENCE_DURATION) {
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
        stream.getTracks().forEach(track => track.stop());
        processRecordedAudio();
      };

      mediaRecorder.start(1000);
      checkAudioLevel();

    } catch (error) {
      console.error('Recording failed:', error);
      setErrorMessage('Failed to start recording: ' + error.message);
      setStatus('error');
    }
  };

  const processRecordedAudio = async () => {
    try {
      setStatus('processing');

      const audioBlob = new Blob(recordedChunks.current, { type: 'audio/webm' });
      const audioFile = await convertAudioToMp3(audioBlob);

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'en'
      });

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

  const cycleModel = () => {
    const models = Object.keys(LLM_CONFIGS);
    const currentIndex = models.indexOf(selectedModel);
    const nextIndex = (currentIndex + 1) % models.length;
    setSelectedModel(models[nextIndex]);
  };

  // Porcupine wake word handling
  const porcupineKeyword = {
    publicPath: '/jarvis.ppn',
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

  useEffect(() => {
    // Initialize audio processor on component mount
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

  const handleWakeWordDetection = async () => {
    if (isRecording.current) return;
    console.log('Wake word detected!');
    setStatus('listening');
    startRecording();
  };

  const retryInitialization = async () => {
    try {
      setStatus('idle');
      setErrorMessage('');
      await initPorcupine();
    } catch (error) {
      console.error('Retry failed:', error);
      setErrorMessage(error.message);
      setStatus('error');
    }
  };

  // UI Component
  return (
    <SmartMirrorUI
      isListening={isListening}
      transcript={transcript}
      response={response}
      status={status}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
      errorMessage={errorMessage}
      startRecording={startRecording}
      isSpeaking={audioPlayer.current?.isPlaying}
    />
  );
};

export default JarvisAssistant;