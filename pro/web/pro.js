// The Pro modules of the official build, written here in order (pro-load.js in the public board loads this file when Pro is
// there). English first, then the features; each registers its slots with proRegister (pro-slots.js) and runs before app.js.
for(const name of ['en','probe-data','probe-pro','probe-ssh-data','probe-ssh-pro','platform-data','platform-pro','agent-pro','pro-panel'])
 document.write(`<script src="pro/web/${name}.js"><\/script>`);
