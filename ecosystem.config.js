module.exports = {
  apps: [
    {
      name: 'school-backend',
      script: './server.js',
      instances: 'max', // will automatically detect available cores (2 on KVM 2)
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
