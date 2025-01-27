import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings, Volume2, Loader, Brain } from 'lucide-react';
import { usePorcupine } from '@picovoice/porcupine-react';
import OpenAI from 'openai';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';

// Initialize OpenAI with Vite environment variable
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
  },
  claude: {
    name: 'Claude',
    color: 'bg-purple-600',
  },
  deepseek: {
    name: 'DeepSeek',
    color: 'bg-green-600',
  },
  gpt4: {
    name: 'GPT-4',
    color: 'bg-yellow-600',
  }
};


// Function to handle text-to-speech using ElevenLabs
const speakWithElevenLabs = async (text) => {
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${import.meta.env.VITE_ELEVENLABS_VOICE_ID}`,
      {
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': import.meta.env.VITE_ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(response.data);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
  } catch (error) {
    console.error('Text-to-speech failed:', error);
    throw error;
  }
};

const JarvisAssistant = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState('sonar');

  const cycleModel = () => {
    const models = Object.keys(LLM_CONFIGS);
    const currentIndex = models.indexOf(selectedModel);
    const nextIndex = (currentIndex + 1) % models.length;
    setSelectedModel(models[nextIndex]);
  };

  const recordedChunks = useRef([]);
  const isRecording = useRef(false);

  const {
    keywordDetection,
    isLoaded,
    isListening: isPorcupineListening,
    error,
    init,
    start,
    stop,
    release
  } = usePorcupine();

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
    initPorcupine();

    return () => {
      release();
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

  const startRecording = async () => {
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

      recordedChunks.current = [];
      isRecording.current = true;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(recordedChunks.current, { type: 'audio/webm' });
        await processAudioCommand(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      console.log('Started recording');

      setTimeout(() => {
        if (isRecording.current) {
          mediaRecorder.stop();
          isRecording.current = false;
          setStatus('processing');
        }
      }, 5000);

    } catch (error) {
      console.error('Recording failed:', error);
      setErrorMessage('Failed to start recording: ' + error.message);
      setStatus('error');
    }
  };

  const convertAudioToMp3 = async (audioBlob) => {
    // Convert WebM to MP3 format that Whisper can accept
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Create offline context for rendering
    const offlineContext = new OfflineAudioContext(
      1, // mono
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();

    const renderedBuffer = await offlineContext.startRendering();

    // Convert to WAV format
    const wavBlob = await new Promise(resolve => {
      const length = renderedBuffer.length * 2;
      const buffer = new ArrayBuffer(44 + length);
      const view = new DataView(buffer);

      // Write WAV header
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

      // Write audio data
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

    // Convert to File object that OpenAI's API expects
    return new File([wavBlob], 'audio.wav', { type: 'audio/wav' });
  };

  const writeUTFBytes = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const processWithSonar = async (text) => {
    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro',
          messages: [
            {
              role: 'system',
              content: `You are Jarvis, an advanced AI assistant inspired by Iron Man's AI.
                       Use your real-time internet access to provide current information.
                       Use a professional yet friendly tone, similar to J.A.R.V.I.S. from Iron Man.
                       Keep your responses very consise, yet informative. Keep in mind that 
                       a text-to-speech service will be reading your response, so do not use unreadable
                       notations. Your responses should only be a sentence or two, unless a complex question
                       is asked that requires more comprehensive information. 
                       
                       Keep the messages brief, and do not cite sources.`
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 1024,
          return_related_questions: false
        },
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
  
      // Handle citations if they exist
      let formattedResponse = response.data.choices[0].message.content;
      /*if (response.data.citations && response.data.citations.length > 0) {
        formattedResponse += '\n\nSources:';
        response.data.citations.forEach((citation, index) => {
          formattedResponse += `\n${index + 1}. ${citation}`;
        });
      }*/
  
      return formattedResponse;
    } catch (error) {
      console.error('Perplexity API error:', error);
      throw new Error(`Perplexity API error: ${error.message}`);
    }
  };

  const processWithClaude = async (text) => {
    const message = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: `You are Jarvis, an advanced AI assistant inspired by Iron Man's AI.
                   Use a professional yet friendly tone, similar to J.A.R.V.I.S. from Iron Man.
                   Keep responses concise but informative.`
        },
        {
          role: 'user',
          content: text
        }
      ]
    });
    return message.content;
  };

  const processWithDeepseek = async (text) => {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat-v3-32k',
        messages: [
          {
            role: 'system',
            content: `You are Jarvis, an advanced AI assistant inspired by Iron Man's AI.
                     Use a professional yet friendly tone, similar to J.A.R.V.I.S. from Iron Man.
                     Keep responses concise but informative.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 250,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content;
  };

  const processWithGPT4 = async (text) => {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are Jarvis, an advanced AI assistant inspired by Iron Man's AI.
                   Use a professional yet friendly tone, similar to J.A.R.V.I.S. from Iron Man.
                   Keep responses concise but informative.`
        },
        {
          role: 'user',
          content: text
        }
      ]
    });
    return completion.choices[0].message.content;
  };

  const processAudioCommand = async (audioBlob) => {
    try {
      setStatus('processing');
      
      const audioFile = await convertAudioToMp3(audioBlob);
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'en'
      });

      setTranscript(transcription.text);

      // Process with selected model
      let aiResponse;
      switch (selectedModel) {
        case 'sonar':
          aiResponse = await processWithSonar(transcription.text);
          break;
        case 'claude':
          aiResponse = await processWithClaude(transcription.text);
          break;
        case 'deepseek':
          aiResponse = await processWithDeepseek(transcription.text);
          break;
        case 'gpt4':
          aiResponse = await processWithGPT4(transcription.text);
          break;
        default:
          throw new Error('Invalid model selected');
      }

      setResponse(aiResponse);
      await speakWithElevenLabs(aiResponse);
      setStatus('idle');
    } catch (error) {
      console.error('Command processing failed:', error);
      setErrorMessage(`Failed to process command: ${error.message}`);
      setStatus('error');
    }
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-gray-900">
      <div className="w-full max-w-2xl bg-gray-800 rounded-lg shadow-xl p-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Jarvis Assistant</h1>
          <div className="flex items-center space-x-4">
            <button 
              onClick={cycleModel}
              className={`px-4 py-2 rounded-lg ${LLM_CONFIGS[selectedModel].color} hover:opacity-90 text-white flex items-center gap-2 transition-all duration-200`}
            >
              <Brain className="w-5 h-5" />
              <span className="text-sm font-medium">{LLM_CONFIGS[selectedModel].name}</span>
            </button>
            
            {isListening ? (
              <button className="p-2 rounded-full bg-green-600 hover:bg-green-700 text-white">
                <Mic className="w-6 h-6" />
              </button>
            ) : (
              <button 
                className="p-2 rounded-full bg-red-600 hover:bg-red-700 text-white"
                onClick={retryInitialization}
              >
                <MicOff className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-700 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-white mb-2">Status</h2>
            <div className="flex items-center text-gray-300">
              {status === 'processing' && <Loader className="w-4 h-4 mr-2 animate-spin" />}
              <p>
                {status === 'idle' && 'Waiting for wake word "Jarvis"...'}
                {status === 'listening' && 'Listening for command...'}
                {status === 'processing' && 'Processing...'}
                {status === 'error' && (
                  <span className="text-red-400">
                    Error: {errorMessage}
                    <button
                      onClick={retryInitialization}
                      className="ml-2 text-blue-400 hover:text-blue-300 underline"
                    >
                      Retry
                    </button>
                  </span>
                )}
              </p>
            </div>
          </div>

          {transcript && (
            <div className="bg-gray-700 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-white mb-2">You said:</h2>
              <p className="text-gray-300">{transcript}</p>
            </div>
          )}

          {response && (
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="w-5 h-5 text-white" />
                <h2 className="text-lg font-semibold text-white">Jarvis responds:</h2>
              </div>
              <p className="text-gray-300">{response}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default JarvisAssistant;