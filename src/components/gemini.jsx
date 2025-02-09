import React, { useState } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY; // Replace with your actual API key

const GeminiChat = () => {
  const [inputText, setInputText] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Initialize the Gemini model
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite-preview-02-05' });

  const handleInputChange = (e) => {
    setInputText(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setIsLoading(true);
    setResponse('');

    try {
      // Stream the response from Gemini
      const stream = await model.generateContentStream(inputText);
      let fullResponse = '';

      // Process each chunk of the stream
      for await (const chunk of stream.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
        setResponse(fullResponse); // Update the response in real-time
      }
    } catch (error) {
      setResponse(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h1>Gemini Chat Interface</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          value={inputText}
          onChange={handleInputChange}
          placeholder="Type your message..."
          style={styles.input}
          disabled={isLoading}
        />
        <button type="submit" style={styles.button} disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </form>

      {response && (
        <div style={styles.response}>
          <h2>Response:</h2>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
};

// Basic styles for the component
const styles = {
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
  },
  form: {
    display: 'flex',
    marginBottom: '20px',
  },
  input: {
    flex: 1,
    padding: '10px',
    fontSize: '16px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    marginRight: '10px',
  },
  button: {
    padding: '10px 20px',
    fontSize: '16px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  response: {
    backgroundColor: '#f9f9f9',
    padding: '15px',
    borderRadius: '4px',
    border: '1px solid #ddd',
  },
};

export default GeminiChat;