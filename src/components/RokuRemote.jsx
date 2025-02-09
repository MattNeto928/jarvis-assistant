import React, { useState } from 'react';

function RokuTVRemote() {
  const [rokuIP, setRokuIP] = useState('192.168.1.4');

  const sendKeyPress = async (key) => {
    try {
      const response = await fetch(`http://${rokuIP}:8060/keypress/${key}`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to send key press');
      }
      console.log(`Key press "${key}" sent successfully`);
    } catch (error) {
      console.error('Error sending key press:', error);
    }
  };

  const launchApp = async (appId) => {
    try {
      const response = await fetch(`http://${rokuIP}:8060/launch/${appId}`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to launch app');
      }
      console.log(`App "${appId}" launched successfully`);
    } catch (error) {
      console.error('Error launching app:', error);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Roku Remote Control</h1>
        <div>
          <label>
            Roku IP Address:
            <input
              type="text"
              value={rokuIP}
              onChange={(e) => setRokuIP(e.target.value)}
            />
          </label>
        </div>
        <div className="controls">
          <button onClick={() => sendKeyPress('Home')}>Home</button>
          <button onClick={() => sendKeyPress('Back')}>Back</button>
          <button onClick={() => sendKeyPress('Up')}>Up</button>
          <button onClick={() => sendKeyPress('Down')}>Down</button>
          <button onClick={() => sendKeyPress('Left')}>Left</button>
          <button onClick={() => sendKeyPress('Right')}>Right</button>
          <button onClick={() => sendKeyPress('Select')}>Select</button>
        </div>
        <div className="apps">
          <h2>Launch Apps</h2>
          <button onClick={() => launchApp('11')}>Netflix</button>
          <button onClick={() => launchApp('12')}>YouTube</button>
          <button onClick={() => launchApp('13')}>Amazon Prime Video</button>
          {/* Add more app IDs as needed */}
        </div>
      </header>
    </div>
  );
}

export default RokuTVRemote;