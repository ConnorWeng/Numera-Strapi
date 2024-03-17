module.exports = {
  apps: [
    {
      name: 'Numera-Strapi',
      script: 'yarn',
      args: 'start',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],

  deploy : {
    production : {
       "user" : "root",
       "host" : ["106.14.190.250"],
       "ref"  : "origin/main",
       "repo" : "git@github.com:ConnorWeng/Numera-Strapi.git",
       "path" : "/root/production/Numera-Strapi",
       "post-deploy" : "yarn && pm2 startOrRestart ecosystem.config.js --env production"
    }
  }
};