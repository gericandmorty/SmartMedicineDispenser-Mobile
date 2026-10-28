// Allows plain HTTP (cleartext) requests in release APKs.
// Required because the ESP32 / Arduino devices serve http://192.168.x.x on the LAN,
// and Android 9+ blocks cleartext traffic by default in release builds.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
};
