const strapiUtils = require("@strapi/utils");

module.exports = (plugin) => {
  plugin.controllers.auth.callback = async (ctx) => {
    const params = ctx.request.body;
    const { identifier, imei } = params;

    // Check if the user exists.
    const user = await strapi.query("plugin::users-permissions.user").findOne({
      where: {
        provider: "local",
        $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
      },
    });

    if (!user) {
      throw new strapiUtils.errors.ValidationError(
        "Invalid identifier or password",
      );
    }

    if (!user.password) {
      throw new strapiUtils.errors.ValidationError(
        "Invalid identifier or password",
      );
    }

    const validPassword = await strapi
      .plugin("users-permissions")
      .service("user")
      .validatePassword(params.password, user.password);

    if (!validPassword) {
      throw new strapiUtils.errors.ValidationError(
        "Invalid identifier or password",
      );
    }

    if (imei && (!user.IMEIs || !user.IMEIs.includes(imei))) {
      throw new strapiUtils.errors.ValidationError("Invalid device imei");
    }

    ctx.send({
      jwt: strapi
        .plugin("users-permissions")
        .service("jwt")
        .issue({ id: user.id }),
      user: user,
    });
  };

  return plugin;
};
