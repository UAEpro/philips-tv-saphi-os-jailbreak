/* Public defaults. Copy to config.local.js for personal settings; that file
   is ignored by Git and is embedded instead of this file at build/install time. */
var HomeConfig = {
    utcOffsetMinutes: 0, // Clock defaults to UTC. Set a fixed local offset.
    prayers: {
        enabled: false, // No calendar requests until explicitly configured.
        latitude: null,
        longitude: null,
        timezone: 'UTC',
        method: 3,
        location: 'Your location',
        region: '',
        source: 'AlAdhan'
    }
};
