import React, { useState } from 'react';

const SamsungRemote = () => {
  const [status, setStatus] = useState('');

  const sendKey = async (key) => {
    setStatus(`Sending ${key}...`);
    
    try {
      const response = await fetch(`http://localhost:3001/send-key/${key}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.text();
      setStatus(data);
      
      // Clear status after 2 seconds
      setTimeout(() => setStatus(''), 2000);
    } catch (error) {
      console.error('Error:', error);
      setStatus(`Error: ${error.message}`);
      
      // Clear error after 3 seconds
      setTimeout(() => setStatus(''), 3000);
    }
  };

  return (
    <div className="p-4 max-w-sm mx-auto">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => sendKey('KEY_POWER')}
            className="col-span-3 bg-red-500 hover:bg-red-600 text-white p-2 rounded"
          >
            Power
          </button>
          
          <button
            onClick={() => sendKey('KEY_VOLUP')}
            className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded"
          >
            Vol +
          </button>
          
          <button
            onClick={() => sendKey('KEY_MUTE')}
            className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded"
          >
            Mute
          </button>
          
          <button
            onClick={() => sendKey('KEY_VOLDOWN')}
            className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded"
          >
            Vol -
          </button>
        </div>
        
        {status && (
          <div className="mt-4 p-2 text-sm text-center rounded bg-gray-100">
            {status}
          </div>
        )}
      </div>
    </div>
  );
};

export default SamsungRemote;