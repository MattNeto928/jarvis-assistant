// src/components/SmartMirrorUI.jsx
import React, { useState, useEffect } from 'react';
import { Activity, Mic } from 'lucide-react';
import { AreaChart, Area, XAxis, ResponsiveContainer } from 'recharts';

// Voice Wave Animation Component
const VoiceWaves = ({ isActive, mode = 'listening' }) => {
  const waveCount = 4;
  
  return (
    <div className="flex items-center gap-0.5 h-4">
      {[...Array(waveCount)].map((_, i) => (
        <div
          key={i}
          className={`w-0.5 rounded-full transition-all duration-300 ${
            isActive ? 'bg-green-400' : 'bg-white/20'
          }`}
          style={{
            height: isActive ? `${Math.random() * 100}%` : '20%',
            animation: isActive ? `wave 600ms ease infinite` : 'none',
            animationDelay: `${i * 100}ms`
          }}
        />
      ))}
      <style jsx>{`
        @keyframes wave {
          0% { height: 20%; }
          50% { height: 100%; }
          100% { height: 20%; }
        }
      `}</style>
    </div>
  );
};

// LLM Toggle Component
const LLMToggle = ({ selectedModel, onModelChange }) => {
  const models = [
    { id: 'sonar', name: 'Sonar', description: 'Real-time web' },
    { id: 'claude', name: 'Claude', description: 'Fast responses' },
    { id: 'deepseek', name: 'DeepSeek', description: 'Advanced reasoning' },
    { id: 'gpt4', name: 'GPT-4', description: 'General knowledge' }
  ];

  return (
    <div className="relative group">
      <button
        className="bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full text-sm flex items-center gap-2 transition-all duration-200 font-thin"
        onClick={() => {
          const currentIndex = models.findIndex(m => m.id === selectedModel);
          const nextIndex = (currentIndex + 1) % models.length;
          onModelChange(models[nextIndex].id);
        }}
      >
        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
        {models.find(m => m.id === selectedModel)?.name}
      </button>
      <div className="absolute hidden group-hover:block top-full right-0 mt-2 bg-black/80 backdrop-blur-sm rounded-lg p-2 w-48">
        {models.map(model => (
          <div key={model.id} className="px-3 py-2 text-sm">
            <div className="font-thin">{model.name}</div>
            <div className="text-white/60 text-xs font-thin">{model.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const SmartMirrorUI = ({
  isListening,
  selectedModel,
  onModelChange,
  status,
  isSpeaking,
  transcript,
  response
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Mock data for the chart
  const stockData = Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    value: 4900 + Math.random() * 50 + (i < 12 ? i * 2 : (24 - i) * 2)
  }));

  const mockNews = [
    'Fed Signals Commitment to Data-Driven Rate Decisions',
    'Tech Sector Rally Continues on Strong Earnings',
    'Global Markets Respond to Economic Data',
    'Treasury Yields Steady After Recent Volatility'
  ];

  return (
    <div className="h-screen bg-black text-white p-16 flex flex-col font-thin">
      {/* Top Bar */}
      <div className="flex justify-end items-center gap-6 mb-8">
        <div className="bg-white/5 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-green-400" />
            <VoiceWaves isActive={isListening} />
          </div>
          <span className="text-sm text-white/80">
            {status === 'idle' && 'Listening for "Jarvis"...'}
            {status === 'listening' && 'Listening...'}
            {status === 'processing' && 'Processing...'}
          </span>
        </div>
        <LLMToggle selectedModel={selectedModel} onModelChange={onModelChange} />
      </div>

      {/* Time Section */}
      <div className="text-center mb-20">
        <h1 style={{ fontSize: '10vh' }} className="font-thin tracking-tight leading-none">
          {currentTime.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          })}
        </h1>
        <p className="text-4xl text-white/60 mt-6 font-thin">
          {currentTime.toLocaleDateString([], { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-2 gap-32 mb-20">
        {/* Market Data */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Activity className="w-6 h-6" />
              <span className="text-2xl font-thin">S&P 500</span>
            </div>
            <div className="text-right">
              <div className="text-5xl font-thin">4,927.16</div>
              <div className="text-xl text-green-400 mt-1 font-thin">+22.43 (+0.46%)</div>
            </div>
          </div>

          <div className="h-48 mb-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stockData}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fff" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#fff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="time" 
                  stroke="#ffffff20"
                  interval={4}
                  tick={{ fill: '#ffffff60', fontSize: 12 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#ffffff" 
                  fill="url(#chartGradient)"
                  strokeWidth={1}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-white/60 mb-1 font-thin">Open</div>
              <div className="text-3xl font-thin">4,903.25</div>
            </div>
            <div>
              <div className="text-white/60 mb-1 font-thin">Day Range</div>
              <div className="text-3xl font-thin">4,898 - 4,931</div>
            </div>
            <div>
              <div className="text-white/60 mb-1 font-thin">Volume</div>
              <div className="text-3xl font-thin">2.1B</div>
            </div>
            <div>
              <div className="text-white/60 mb-1 font-thin">P/E Ratio</div>
              <div className="text-3xl font-thin">24.8</div>
            </div>
          </div>
        </div>

        {/* Weather */}
        <div>
          <div className="text-8xl font-thin mb-4">72°</div>
          <div className="text-3xl text-white/60 mb-12 font-thin">Partly Cloudy</div>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-white/60 mb-2 font-thin">Today</div>
              <div className="text-2xl font-thin">74° / 65°</div>
            </div>
            <div>
              <div className="text-white/60 mb-2 font-thin">Wed</div>
              <div className="text-2xl font-thin">76° / 63°</div>
            </div>
            <div>
              <div className="text-white/60 mb-2 font-thin">Thu</div>
              <div className="text-2xl font-thin">71° / 62°</div>
            </div>
            <div>
              <div className="text-white/60 mb-2 font-thin">Fri</div>
              <div className="text-2xl font-thin">73° / 64°</div>
            </div>
          </div>
        </div>
      </div>

      {/* Full-width News Section */}
      <div className="mt-auto">
        <div className="text-2xl mb-6 font-thin">Market News</div>
        <div className="grid grid-cols-2 gap-x-32 gap-y-6">
          {mockNews.map((headline, i) => (
            <div key={i} className="text-xl text-white/80 font-thin">
              {headline}
            </div>
          ))}
        </div>
      </div>

      {/* Voice Interaction Overlay */}
      {(transcript || response) && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
          <div className="bg-black/80 backdrop-blur-sm rounded-2xl p-6 flex flex-col items-center gap-4">
            {transcript && (
              <div className="flex items-center gap-3">
                <VoiceWaves isActive={isListening} />
                <span className="text-white/80 font-thin">{transcript}</span>
              </div>
            )}
            {response && (
              <div className="flex items-center gap-3">
                <VoiceWaves isActive={isSpeaking} mode="speaking" />
                <span className="text-white/80 font-thin">{response}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartMirrorUI;