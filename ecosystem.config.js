module.exports = {
  apps: [
    {
      name: 'aljo-chat-backend',
      script: './dist/index.js',
      // Call state (mediasoup rooms, 1-on-1 call registry) and Socket.IO rooms
      // live in process memory, so the app must run as a single instance until
      // a Redis adapter + sticky sessions are added.
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
}
