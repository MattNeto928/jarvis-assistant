import { useState, useEffect } from 'react';
import { PowerIcon, SunIcon, ThermometerIcon, CheckIcon } from 'lucide-react';
//import { Alert, AlertDescription } from '@/components/ui/alert';

const API_BASE = 'http://127.0.0.1:8000';

const SmartBulbControl = () => {
  const [bulbs, setBulbs] = useState([]);
  const [status, setStatus] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedBulbs, setSelectedBulbs] = useState([]);

  // Fetch bulb configurations
  useEffect(() => {
    const fetchBulbs = async () => {
      try {
        const response = await fetch(`${API_BASE}/bulbs`);
        const data = await response.json();
        setBulbs(data);
        setSelectedBulbs(data.map(bulb => bulb.device_id));
      } catch (err) {
        setError('Failed to fetch bulb configurations');
      }
    };
    fetchBulbs();
  }, []);

  // Fetch status periodically
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/status`);
        const data = await response.json();
        setStatus(data);
        setError(null);
      } catch (err) {
        setError('Failed to fetch bulb status');
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (endpoint, value = '') => {
    if (selectedBulbs.length === 0) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}${endpoint}${value}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bulb_ids: selectedBulbs }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail);
      }
      
      setError(null);
    } catch (err) {
      setError('Failed to control bulbs: ' + err.message);
    }
    setLoading(false);
  };

  const handleColorChange = async (h, s, v) => {
    if (selectedBulbs.length === 0) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/color`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          h, s, v,
          bulb_ids: selectedBulbs
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail);
      }
      
      setError(null);
    } catch (err) {
      setError('Failed to set color: ' + err.message);
    }
    setLoading(false);
  };

  const toggleBulbSelection = (deviceId) => {
    setSelectedBulbs(prev => 
      prev.includes(deviceId) 
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">Smart Bulb Control</h2>
      
      
      {/* Bulb Selection */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Select Bulbs</h3>
        <div className="flex flex-wrap gap-2">
          {bulbs.map(bulb => (
            <button
              key={bulb.device_id}
              onClick={() => toggleBulbSelection(bulb.device_id)}
              className={`px-4 py-2 rounded-md transition-colors ${
                selectedBulbs.includes(bulb.device_id)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {bulb.name}
              {selectedBulbs.includes(bulb.device_id) && (
                <CheckIcon className="w-4 h-4 ml-2 inline" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {/* Power Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <PowerIcon className="w-5 h-5" />
            <span>Power</span>
          </div>
          <button
            onClick={() => handleAction('/power/on')}
            disabled={loading}
            className="px-4 py-2 rounded-md bg-green-500 hover:bg-green-600 text-white transition-colors"
          >
            ON
          </button>
          <button
            onClick={() => handleAction('/power/off')}
            disabled={loading}
            className="px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 text-white transition-colors"
          >
            OFF
          </button>
        </div>

        {/* Brightness Control */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SunIcon className="w-5 h-5" />
            <span>Brightness</span>
          </div>
          <input
            type="range"
            min="10"
            max="1000"
            defaultValue="500"
            onChange={(e) => handleAction('/brightness/', e.target.value)}
            disabled={loading}
            className="w-full"
          />
        </div>

        {/* Temperature Control */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ThermometerIcon className="w-5 h-5" />
            <span>Temperature</span>
          </div>
          <input
            type="range"
            min="0"
            max="1000"
            defaultValue="500"
            onChange={(e) => handleAction('/temperature/', e.target.value)}
            disabled={loading}
            className="w-full"
          />
        </div>

        {/* Mode Selection */}
        <div className="space-y-2">
          <label className="block">Mode</label>
          <select
            onChange={(e) => handleAction('/mode/', e.target.value)}
            disabled={loading}
            className="w-full p-2 border rounded-md"
          >
            <option value="white">White</option>
            <option value="colour">Color</option>
            <option value="scene">Scene</option>
            <option value="music">Music</option>
          </select>
        </div>

        {/* Color Control */}
        <div className="space-y-4">
          <h3 className="font-medium">Color Control</h3>
          
          {/* Hue */}
          <div className="space-y-1">
            <label className="block text-sm">Hue (0-360)</label>
            <input
              type="range"
              min="0"
              max="360"
              defaultValue="0"
              onChange={(e) => handleColorChange(
                parseInt(e.target.value),
                1000,  // Full saturation
                1000   // Full brightness
              )}
              disabled={loading}
              className="w-full"
            />
          </div>

          {/* Saturation */}
          <div className="space-y-1">
            <label className="block text-sm">Saturation (0-1000)</label>
            <input
              type="range"
              min="0"
              max="1000"
              defaultValue="1000"
              onChange={(e) => handleColorChange(
                0,    // Keep current hue
                parseInt(e.target.value),
                1000  // Full brightness
              )}
              disabled={loading}
              className="w-full"
            />
          </div>

          {/* Value */}
          <div className="space-y-1">
            <label className="block text-sm">Value (0-1000)</label>
            <input
              type="range"
              min="0"
              max="1000"
              defaultValue="1000"
              onChange={(e) => handleColorChange(
                0,    // Keep current hue
                1000, // Full saturation
                parseInt(e.target.value)
              )}
              disabled={loading}
              className="w-full"
            />
          </div>
        </div>

        {/* Status Display */}
        <div className="mt-8">
          <h3 className="font-medium mb-2">Bulb Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bulbs.map(bulb => {
              const bulbStatus = status[bulb.device_id];
              return (
                <div 
                  key={bulb.device_id} 
                  className={`p-4 rounded-lg border ${
                    selectedBulbs.includes(bulb.device_id) 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200'
                  }`}
                >
                  <h4 className="font-medium mb-2">{bulb.name}</h4>
                  {bulbStatus ? (
                    <div className="space-y-1 text-sm">
                      <p>Power: {bulbStatus['20'] ? 'ON' : 'OFF'}</p>
                      <p>Mode: {bulbStatus['21']}</p>
                      <p>Brightness: {bulbStatus['22']}</p>
                      <p>Temperature: {bulbStatus['23']}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Status unavailable</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartBulbControl;