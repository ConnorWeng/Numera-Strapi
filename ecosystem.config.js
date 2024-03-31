module.exports = {
  apps: [
    {
      name: "Numera-Strapi",
      script: "yarn",
      args: "start",
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],

  deploy: {
    production: {
      user: "root",
      host: ["106.14.190.250", "10.168.1.103"],
      ref: "origin/main",
      repo: "git@github.com:ConnorWeng/Numera-Strapi.git",
      path: "/root/production/Numera-Strapi",
      "post-deploy":
        "source ~/.profile && yarn && NODE_ENV=production yarn build && pm2 startOrRestart ecosystem.config.js --env production",
    },
  },
};
