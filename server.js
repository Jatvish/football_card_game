import {createApp} from './game-server.js';
createApp().listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Final Whistle v2 ready'));
