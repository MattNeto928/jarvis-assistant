// rokuTypes.js
export const ROKU_COMMAND_TYPES = {
    LAUNCH_APP: 'LAUNCH_APP',
    NAVIGATION: 'NAVIGATION',
    PLAYBACK: 'PLAYBACK',
    VOLUME: 'VOLUME',
    SEARCH: 'SEARCH' 
  };
  
  export const ROKU_APPS = {
    NETFLIX: { id: '12', name: 'Netflix' },
    YOUTUBE: { id: '837', name: 'YouTube' },
    PRIME: { id: '13', name: 'Prime Video' },
    DISNEY_PLUS: { id: '291097', name: 'Disney Plus' },
    HULU: { id: '2285', name: 'Hulu' },
    HBO_MAX: { id: '61322', name: 'HBO Max' },
    SPOTIFY: { id: '20710', name: 'Spotify' },
    PANDORA: { id: '28', name: 'Pandora' },
    APPLE_TV: { id: '551012', name: 'Apple TV' }
  };
  
  export const ROKU_ACTIONS = {
    // Navigation
    UP: 'Up',
    DOWN: 'Down',
    LEFT: 'Left',
    RIGHT: 'Right',
    SELECT: 'Select',
    BACK: 'Back',
    HOME: 'Home',
    
    // Volume
    VOLUME_UP: 'VolumeUp',
    VOLUME_DOWN: 'VolumeDown',
    VOLUME_MUTE: 'VolumeMute',
    
    // Playback
    PLAY_PAUSE: 'Play',
    FORWARD: 'Forward',
    REVERSE: 'Reverse'
  };