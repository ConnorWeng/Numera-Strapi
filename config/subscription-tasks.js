module.exports = {
  "0 0 0 * * *": async ({ strapi }) => {
    await strapi.db.connection.raw(
      "update subscriptions set daily_remaining = daily_quota;",
    );
  },
};
