// Disabled — reviews are now added directly via the add-review function.
// Kept as a no-op so it doesn't process form events.
exports.handler = async () => ({ statusCode: 200, body: 'noop' });
