# pro/

Part of this repository and under its licence (GPL-3.0). This folder holds the modules for:

- external tools changing, deleting and tidying up existing records in bulk (the agent methods; without these modules the core refuses those writes);
- the weekly registry check;
- the 12-hour Cloudflare sync;
- live status (probes, SSH readings, platform state).

They are on in every build. `desktop/build.sh` bundles them; `ASSETBOARD_EDITION=free` leaves them out of a build, into `dist/free/`.

- `web/`: the page modules, loaded by `pro-load.js` through `web/pro.js` (the ordered list). In the browser, add `?pro` to the address; the Mac app injects `__ASSETBOARD_NATIVE__.pro`. `web/en.js` holds their English, and `web/pro-panel.js` shows the edition in 设置 › 关于.
- `tests/`: browser tests and unit tests. `node tools/browser-tests.js` runs `tests/` and `pro/tests/`; `node --test` runs the unit tests with the rest.

No personal data, real domains, addresses or secrets go in here; the tests use `example.*` names and reserved address ranges.
