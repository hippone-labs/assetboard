// The release, notarize and build Mac jobs run on GitHub-hosted macOS 26 with a pinned Xcode; the signing jobs take their keys
// from the release environment into a temporary keychain (tools/ci-mac.sh). These checks read the files only.
const test = require('node:test');
const assert = require('node:assert/strict');
const {read, workflow, step} = require('./workflow-yaml');

const build = workflow('.github/workflows/build.yml');
const notarize = workflow('.github/workflows/notarize.yml');
const release = workflow('.github/workflows/release-app.yml');
const releaseText = read('.github/workflows/release-app.yml');
const notarizeText = read('.github/workflows/notarize.yml');
const helper = read('tools/ci-mac.sh');

const RELEASE_SECRETS = ['DEVELOPER_ID_P12_BASE64', 'DEVELOPER_ID_P12_PASSWORD', 'NOTARY_KEY_P8_BASE64', 'NOTARY_KEY_ID', 'NOTARY_ISSUER_ID', 'SITE_PUSH_TOKEN'];

function jobsUsing(doc, secret) {
 return Object.entries(doc.jobs).filter(([, job]) => JSON.stringify(job).includes(`secrets.${secret}`)).map(([name]) => name);
}

test('the Mac jobs run on GitHub-hosted macOS 26 with one pinned Xcode', () => {
 assert.equal(build.jobs.mac['runs-on'], "${{ inputs.min_os && 'macos-15' || 'macos-26' }}");
 assert.equal(build.jobs.icon['runs-on'], 'macos-26');
 assert.equal(notarize.jobs.notarize['runs-on'], 'macos-26');
 assert.equal(release.jobs.release['runs-on'], 'macos-26');
 const version = build.env.XCODE_VERSION;
 assert.match(version, /^\d+\.\d+(\.\d+)?$/);
 assert.equal(notarize.env.XCODE_VERSION, version);
 assert.equal(release.env.XCODE_VERSION, version);
 assert.equal(step(build.jobs.mac, 'Select Xcode').run, 'bash tools/ci-mac.sh xcode');
 assert.equal(step(build.jobs.mac, 'Select Xcode').if, '${{ !inputs.min_os }}');
 assert.equal(step(build.jobs.icon, 'Select Xcode').run, 'bash tools/ci-mac.sh xcode');
 assert.equal(step(release.jobs.release, 'Select Xcode').run, 'bash tools/ci-mac.sh xcode');
 assert.equal(step(notarize.jobs.notarize, 'Select Xcode').run, 'bash .ci/tools/ci-mac.sh xcode');
 assert.match(helper, /local app="\/Applications\/Xcode_\$\{XCODE_VERSION\}\.app"/);
 assert.match(helper, /sudo xcode-select --switch "\$app\/Contents\/Developer"/);
});

test('build.yml reads no secret and needs no environment', () => {
 assert.equal(read('.github/workflows/build.yml').includes('secrets.'), false);
 for (const job of Object.values(build.jobs)) assert.equal(job.environment, undefined);
});

test('every job that uses a release secret runs in the release environment', () => {
 for (const doc of [notarize, release, build, workflow('.github/workflows/mini-dev.yml'), workflow('.github/workflows/mbp-dev.yml'), workflow('.github/workflows/site-screenshots.yml')]) {
  for (const secret of RELEASE_SECRETS) {
   for (const name of jobsUsing(doc, secret)) assert.equal(doc.jobs[name].environment, 'release', `${doc.name}.${name} uses ${secret}`);
  }
 }
 assert.deepEqual(jobsUsing(release, 'SITE_PUSH_TOKEN'), ['release']);
 assert.deepEqual(jobsUsing(notarize, 'NOTARY_KEY_P8_BASE64'), ['notarize']);
 assert.equal(notarize.jobs.notarize.environment, 'release');
 assert.equal(release.jobs.release.environment, 'release');
});

test('a temporary keychain is made at the start and deleted at the end', () => {
 for (const [job, script] of [[release.jobs.release, 'tools/ci-mac.sh'], [notarize.jobs.notarize, '.ci/tools/ci-mac.sh']]) {
  const names = job.steps.map((item) => item.name || item.uses);
  const make = names.indexOf('Temporary signing keychain and notary profile');
  const remove = names.indexOf('Delete the temporary keychain');
  assert.ok(make > 0 && remove > make);
  // Made before anything is built or signed.
  const firstBuild = names.findIndex((name) => /^(Build|Prepare release)/.test(name));
  assert.ok(make < firstBuild, names.join(', '));
  const makeStep = job.steps[make];
  assert.equal(makeStep.run, `bash ${script} keychain`);
  for (const secret of RELEASE_SECRETS.slice(0, 5)) assert.equal(makeStep.env[secret], `\${{ secrets.${secret} }}`);
  assert.equal(job.steps[remove].if, '${{ always() }}');
  assert.equal(job.steps[remove].run, `bash ${script} cleanup`);
 }
 // The signing secrets are given to that one step, not to the whole workflow.
 for (const doc of [release, notarize]) {
  for (const secret of RELEASE_SECRETS.slice(0, 5)) assert.equal(JSON.stringify(doc.env).includes(secret), false);
 }
 for (const text of [releaseText, notarizeText]) {
  assert.equal(text.includes('secrets.NOTARY_PROFILE'), false);
  assert.equal(text.includes('SIGNING_KEYCHAIN_PASSWORD'), false);
  assert.equal(text.includes('mac-build'), false);
 }
});

test('the helper stores the notary profile from the API key and exports what release.sh reads', () => {
 assert.match(helper, /security create-keychain -p "\$password" "\$kc"/);
 assert.match(helper, /kc="\$RUNNER_TEMP\/assetboard-signing\.keychain-db"/);
 assert.match(helper, /security import "\$secret_dir\/developer-id\.p12" -k "\$kc" -f pkcs12/);
 assert.match(helper, /security set-key-partition-list /);
 assert.match(helper, /notarytool store-credentials "\$profile" --key "\$key" --key-id "\$NOTARY_KEY_ID" --issuer "\$NOTARY_ISSUER_ID" --keychain "\$kc"/);
 assert.match(helper, /echo "NOTARY_PROFILE=\$profile" >> "\$GITHUB_ENV"/);
 assert.match(helper, /echo "NOTARY_KEYCHAIN=\$kc" >> "\$GITHUB_ENV"/);
 assert.match(helper, /security delete-keychain "\$kc"/);
 assert.match(helper, /::add-mask::\$password/);
 // Decoded key files are removed right after use, and no secret is echoed.
 assert.match(helper, /rm -f "\$secret_dir\/developer-id\.p12"/);
 assert.match(helper, /rm -f "\$key"/);
 assert.doesNotMatch(helper, /set -x|echo[^\n]*\$(DEVELOPER_ID_P12|NOTARY_KEY_P8|NOTARY_KEY_ID|NOTARY_ISSUER_ID)/);
 const releaseSh = read('desktop/release.sh');
 assert.match(releaseSh, /--keychain-profile "\$NOTARY_PROFILE" "\$\{notary_kc\[@\]\}"/);
 assert.match(releaseSh, /notary_kc=\(--keychain "\$NOTARY_KEYCHAIN"\)/);
});

test('the site is cloned, pushed and watched with SITE_PUSH_TOKEN', () => {
 const prepare = step(release.jobs.release, 'Prepare release and check publishing access');
 assert.equal(prepare.env.SITE_PUSH_TOKEN, '${{ secrets.SITE_PUSH_TOKEN }}');
 assert.match(prepare.run, /git "\$\{site_auth\[@\]\}" clone --depth=1 https:\/\/github\.com\/hippone\/assetboard-site\.git/);
 assert.match(prepare.run, /push --dry-run origin HEAD:main/);
 const publish = step(release.jobs.release, 'Publish site commit and wait for deployment');
 assert.equal(publish.env.GH_TOKEN, '${{ secrets.SITE_PUSH_TOKEN }}');
 assert.equal(publish.env.SITE_PUSH_TOKEN, '${{ secrets.SITE_PUSH_TOKEN }}');
 assert.match(publish.run, /password=\$SITE_PUSH_TOKEN"; \}; f' push origin HEAD:main/);
 assert.match(publish.run, /gh run watch "\$run_id" --repo hippone\/assetboard-site/);
 // The token reaches git through the helper's environment, never in a URL.
 assert.doesNotMatch(releaseText, /https:\/\/[^\s"']*\$\{?\{?\s*(secrets\.)?SITE_PUSH_TOKEN/);
 assert.doesNotMatch(releaseText, /echo[^\n]*\$SITE_PUSH_TOKEN[^"\n]*$/m);
 // The site is never pushed with the runner's own gh login.
 assert.doesNotMatch(publish.run, /gh auth git-credential/);
 assert.doesNotMatch(prepare.run, /assetboard-site[^\n]*gh auth git-credential|gh auth git-credential[^\n]*assetboard-site/);
 // The GitHub Release uses the run's own token.
 assert.equal(step(release.jobs.release, 'GitHub Release').env.GH_TOKEN, '${{ github.token }}');
});

test('notarize runs the helper of its own commit, whatever ref it builds', () => {
 const helperCheckout = step(notarize.jobs.notarize, "CI helper of this workflow's commit");
 assert.equal(helperCheckout.with.path, '.ci');
 assert.equal(helperCheckout.with.ref, undefined);
 assert.equal(helperCheckout.with['sparse-checkout'], 'tools/ci-mac.sh');
 assert.equal(step(notarize.jobs.notarize, 'actions/checkout@v4').with.ref, '${{ inputs.ref }}');
});

test('the Pro checkout steps are unchanged in the hosted jobs', () => {
 for (const job of [release.jobs.release, notarize.jobs.notarize]) {
  const pro = step(job, 'Pro modules (private checkout beside the board)');
  assert.deepEqual(pro.env, {PRO_REPO_TOKEN: '${{ secrets.PRO_REPO_TOKEN }}'});
  assert.match(pro.run, /gh repo clone/);
 }
 assert.equal(release.jobs['mini-dev'].uses, './.github/workflows/mini-dev.yml');
});

test('site-screenshots stays on the Mac mini', () => {
 const doc = workflow('.github/workflows/site-screenshots.yml');
 assert.deepEqual(doc.jobs.screenshots['runs-on'], ['self-hosted', 'assetboard-mini']);
 assert.deepEqual(doc.jobs.publish['runs-on'], ['self-hosted', 'macOS', 'ARM64', 'mac-build']);
});
