const strapiUtils = require("@strapi/utils");
const crypto = require('crypto');

/**
 * Validates a device fingerprint string.
 * The fingerprint is expected to be a 17-character string, where the first 15 characters
 * are the base fingerprint and the last 2 characters are the SHA-1 based checksum.
 *
 * @param {string} fingerprint The 17-character device fingerprint to validate.
 * @returns {boolean} True if the fingerprint is valid, false otherwise.
 */
function validateDeviceFingerprint(fingerprint) {
  if (typeof fingerprint !== 'string' || fingerprint.length !== 17) {
    console.error("Invalid input: Fingerprint must be a 17-character string.");
    return false;
  }

  // 1. Split the fingerprint into its two parts
  const baseFingerprint = fingerprint.substring(0, 15);
  const providedChecksum = fingerprint.substring(15);

  try {
    // 2. Calculate the expected checksum from the base fingerprint
    const sha1Hash = crypto.createHash('sha1');
    sha1Hash.update(baseFingerprint, 'utf8');
    const calculatedHash = sha1Hash.digest('hex');

    const expectedChecksum = calculatedHash.substring(0, 2);

    // 3. Compare the provided checksum with the calculated one
    return providedChecksum === expectedChecksum;
  } catch (error) {
    console.error("Error during checksum calculation:", error);
    return false;
  }
}

module.exports = (plugin) => {
  plugin.controllers.auth.callback = async (ctx) => {
    const params = ctx.request.body;
    const { identifier, imei } = params;

    strapi.log.info(
      `Someone is trying to login with identifier: ${identifier} and imei: ${imei}`,
    );

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

    if (user.blocked === true) {
      throw new strapiUtils.errors.ApplicationError(
        "Your account has been blocked by an administrator",
      );
    }

    if (imei && (!user.IMEIs || !user.IMEIs.includes(imei))) {
      throw new strapiUtils.errors.ValidationError("Invalid device imei");
    }

    if (imei && imei.length == 17 && !validateDeviceFingerprint(imei)) {
      throw new strapiUtils.errors.ValidationError("Invalid device imei cause of checksum");
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
