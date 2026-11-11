// The Mac mini and the MacBook Pro each build the developer app from the same commit.
// These checks read the workflow files only. They do not install an app or call GitHub.
const test = require('node:test');
const assert = require('node:assert/strict');
const {read, parseYaml, workflow, step, unquote} = require('./workflow-yaml');

function mustache(expr) {
 const match = String(expr).match(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/);
 assert.ok(match, expr);
 return match[1];
}

function isTruthy(value) {
 return value !== null && value !== undefined && value !== false && value !== '' && value !== 0;
}

function splitOps(expr, op) {
 const parts = [];
 let current = '';
 let quote = null;
 for (let i = 0; i < expr.length; i++) {
  const c = expr[i];
  if (quote) {
   current += c;
   if (c === quote) quote = null;
   continue;
  }
  if (c === "'" || c === '"') {
   quote = c;
   current += c;
   continue;
  }
  if (expr.startsWith(op, i)) {
   parts.push(current);
   current = '';
   i += op.length - 1;
   continue;
  }
  current += c;
 }
 parts.push(current);
 return parts;
}

// GitHub's || returns the first truthy operand. Missing objects yield null, as in workflow expressions.
function evalExpr(expr, ctx) {
 const parts = splitOps(expr.trim(), '||');
 if (parts.length > 1) {
  let last;
  for (const part of parts) {
   last = evalExpr(part, ctx);
   if (isTruthy(last)) return last;
  }
  return last;
 }
 const eq = splitOps(expr.trim(), '==');
 if (eq.length === 2) return String(evalAtom(eq[0], ctx)) === String(evalAtom(eq[1], ctx));
 return evalAtom(expr, ctx);
}

function evalAtom(expr, ctx) {
 expr = expr.trim();
 if ((expr.startsWith("'") && expr.endsWith("'")) || (expr.startsWith('"') && expr.endsWith('"'))) return unquote(expr);
 if (/\s/.test(expr)) throw new Error(`unsupported expression: ${expr}`);
 let cur = ctx;
 for (const key of expr.split('.')) {
  if (cur == null) return null;
  cur = cur[key];
 }
 return cur === undefined ? null : cur;
}

function contextFor(event) {
 const github = {event_name: event.name, sha: event.sha, event: {}};
 if (event.name === 'workflow_run') github.event.workflow_run = {conclusion: event.conclusion, head_sha: event.head_sha};
 return {github, inputs: event.inputs || {}};
}

function evalMustache(expr, event) {
 return evalExpr(mustache(expr), contextFor(event));
}

const MINI_RUNNER = ['self-hosted', 'macOS', 'ARM64', 'assetboard-mini', 'mac-build'];
const MBP_RUNNER = ['self-hosted', 'macOS', 'ARM64', 'assetboard-mbp'];
const RELEASE_SHA = '0123456789abcdef0123456789abcdef01234567';
const DEFAULT_BRANCH_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function runnerAccepts(runnerLabels, runsOn) {
 return runsOn.every((label) => runnerLabels.includes(label));
}

function placement(doc, event, runnerOnline) {
 const job = doc.jobs.install;
 const requested = job.if ? Boolean(evalMustache(job.if, event)) : true;
 const group = doc.concurrency.group;
 if (!requested) {
  return {requestsRunner: false, queue: 'not-queued', concurrencyGroup: group, holdsReleaseGroup: group === 'app-production-release', appliesExecutionTimeout: false};
 }
 return {
  requestsRunner: true,
  queue: runnerOnline ? 'accepted' : 'waiting-for-runner',
  concurrencyGroup: group,
  holdsReleaseGroup: group === 'app-production-release',
  appliesExecutionTimeout: runnerOnline,
  timeoutMinutes: job['timeout-minutes']
 };
}

const mini = workflow('.github/workflows/mini-dev.yml');
const release = workflow('.github/workflows/release-app.yml');
const releaseText = read('.github/workflows/release-app.yml');
const devInstall = read('desktop/dev-install.sh');

test('the workflow parser reads the mini install that is already on main', () => {
 assert.equal(mini.name, 'mini-dev');
 assert.deepEqual(Object.keys(mini.on), ['workflow_call', 'workflow_dispatch']);
 assert.equal(mini.on.workflow_call.secrets.PRO_REPO_TOKEN.required, false);
 assert.equal(mini.on.workflow_call.inputs.ref.required, true);
 assert.deepEqual(mini.permissions, {contents: 'read'});
 assert.equal(mini.concurrency.group, 'mini-dev-install');
 assert.equal(mini.concurrency['cancel-in-progress'], false);
 assert.deepEqual(mini.jobs.install['runs-on'], ['self-hosted', 'macOS', 'ARM64', 'assetboard-mini']);
 assert.equal(mini.jobs.install['timeout-minutes'], 30);
 assert.equal(step(mini.jobs.install, 'actions/checkout@v4').with.ref, '${{ inputs.ref || github.sha }}');
 assert.equal(step(mini.jobs.install, 'actions/checkout@v4').with['persist-credentials'], false);
 assert.match(step(mini.jobs.install, 'Main only').run, /git merge-base --is-ancestor HEAD FETCH_HEAD/);
 assert.equal(step(mini.jobs.install, 'Pro modules (private checkout beside the board)').env.PRO_REPO_TOKEN, '${{ secrets.PRO_REPO_TOKEN }}');
 assert.equal(step(mini.jobs.install, 'Build and install the developer build').run.trim(), 'zsh desktop/dev-install.sh | tee "$RUNNER_TEMP/dev-install.log"');
});

test('release-app still calls mini-dev with the release commit and the existing token input', () => {
 assert.equal(release.concurrency.group, 'app-production-release');
 assert.equal(release.concurrency['cancel-in-progress'], false);
 assert.deepEqual(release.permissions, {contents: 'write'});
 assert.deepEqual(Object.keys(release.jobs), ['release', 'mini-dev']);
 const called = release.jobs['mini-dev'];
 assert.equal(called.uses, './.github/workflows/mini-dev.yml');
 assert.equal(called.with.ref, '${{ github.sha }}');
 assert.equal(called.secrets.PRO_REPO_TOKEN, '${{ secrets.PRO_REPO_TOKEN }}');
 assert.equal(called.needs, 'release');
 for (const job of Object.values(release.jobs)) assert.notEqual(job.uses, './.github/workflows/mbp-dev.yml');
 assert.match(releaseText, /mbp-dev\.yml/);
});

test('dev-install keeps the local bundle id and does not touch the board data', () => {
 assert.match(devInstall, /^bundle_id=studio\.assetboard\.local$/m);
 assert.match(devInstall, /^ASSETBOARD_PRO_DEV=1 zsh desktop\/build\.sh$/m);
 const support = devInstall.split('\n').filter((line) => line.includes('Application Support'));
 assert.deepEqual(support, ['# installed. The replaced app is kept for rollback; the board\'s data (~/Library/Application Support/Assetboard) is never touched.']);
 assert.equal(devInstall.includes('PRO_REPO_TOKEN'), false);
 assert.equal(devInstall.includes('GH_TOKEN'), false);
 assert.match(devInstall, /mini-dev\.yml or mbp-dev\.yml/);
});

test('mbp-dev installs on assetboard-mbp only, from the same ref, with the token used in that job', () => {
 const text = read('.github/workflows/mbp-dev.yml');
 const doc = parseYaml(text);
 const job = doc.jobs.install;
 assert.equal(doc.name, 'mbp-dev');
 assert.deepEqual(Object.keys(doc.on), ['workflow_run', 'workflow_dispatch']);
 assert.equal(doc.on.workflow_call, undefined);
 assert.deepEqual(doc.on.workflow_run.workflows, ['release-app']);
 assert.deepEqual(doc.on.workflow_run.types, ['completed']);
 assert.equal(doc.on.workflow_run.branches, undefined, 'a tag push is not the main branch; branches would drop the release that mini already installs');
 assert.deepEqual(doc.permissions, {contents: 'read'});
 assert.equal(Object.keys(doc.permissions).length, 1);
 assert.equal(doc.concurrency.group, 'mbp-dev-install');
 assert.equal(doc.concurrency['cancel-in-progress'], false);
 assert.equal(doc.defaults.run.shell, 'bash');
 assert.deepEqual(job['runs-on'], ['self-hosted', 'macOS', 'ARM64', 'assetboard-mbp']);
 assert.equal(job['timeout-minutes'], 30);
 assert.equal(job.if, "${{ github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success' }}");
 assert.equal(Object.keys(doc.jobs).length, 1);

 const checkout = step(job, 'actions/checkout@v4');
 assert.equal(checkout.with.ref, '${{ github.event.workflow_run.head_sha || github.sha }}');
 assert.equal(checkout.with['persist-credentials'], false);
 assert.equal(checkout.with.token, undefined);

 const names = job.steps.map((item) => item.name || item.uses);
 assert.deepEqual(names, [
  'actions/checkout@v4',
  'Main only',
  'Pro modules (private checkout beside the board)',
  'Build and install the developer build',
  'Summary'
 ]);
 assert.equal(step(job, 'Main only').run, step(mini.jobs.install, 'Main only').run);
 const pro = step(job, 'Pro modules (private checkout beside the board)');
 const miniPro = step(mini.jobs.install, 'Pro modules (private checkout beside the board)');
 assert.equal(pro.run, miniPro.run);
 assert.deepEqual(pro.env, {PRO_REPO_TOKEN: '${{ secrets.PRO_REPO_TOKEN }}'});
 assert.doesNotMatch(pro.run, /echo[^\n]*(PRO_REPO_TOKEN|GH_TOKEN)/);
 assert.doesNotMatch(pro.run, /GITHUB_ENV/);
 assert.equal(step(job, 'Build and install the developer build').run, step(mini.jobs.install, 'Build and install the developer build').run);
 assert.equal(step(job, 'Summary').if, '${{ always() }}');
 assert.match(step(job, 'Summary').run, /rm -rf pro dist/);
 assert.equal(step(job, 'Summary').run.replaceAll('MBP', 'Mini'), step(mini.jobs.install, 'Summary').run);

 for (const item of job.steps) {
  if (item === pro) continue;
  assert.equal(JSON.stringify(item).includes('PRO_REPO_TOKEN'), false);
  assert.equal(JSON.stringify(item).includes('GH_TOKEN'), false);
 }
 assert.equal(text.includes('upload-artifact'), false);
 assert.equal(text.includes('download-artifact'), false);
 assert.equal(text.includes('assetboard-dev'), false);
 assert.equal(text.includes('pull_request'), false);
 assert.match(text, /timeout-minutes does not limit/);
 assert.match(text, /app-production-release/);
 assert.match(text, /\/actions\/runners/);
 assert.match(text, /administration/);
 assert.match(text, /actions: read/);
 assert.match(pro.run, /hippone-labs\/assetboard-pro/);
});

test('the release commit is the commit both machines check out', () => {
 const callerRef = evalMustache(release.jobs['mini-dev'].with.ref, {name: 'push', sha: RELEASE_SHA});
 const miniRef = evalMustache(step(mini.jobs.install, 'actions/checkout@v4').with.ref, {
  name: 'workflow_call',
  sha: DEFAULT_BRANCH_SHA,
  inputs: {ref: callerRef}
 });
 const doc = workflow('.github/workflows/mbp-dev.yml');
 const refExpr = step(doc.jobs.install, 'actions/checkout@v4').with.ref;
 const mbpRef = evalMustache(refExpr, {name: 'workflow_run', sha: DEFAULT_BRANCH_SHA, conclusion: 'success', head_sha: RELEASE_SHA});
 const manualRef = evalMustache(refExpr, {name: 'workflow_dispatch', sha: RELEASE_SHA});
 assert.equal(callerRef, RELEASE_SHA);
 assert.equal(miniRef, RELEASE_SHA);
 assert.equal(mbpRef, RELEASE_SHA);
 assert.equal(manualRef, RELEASE_SHA);
 assert.notEqual(mbpRef, DEFAULT_BRANCH_SHA);
});

test('runner labels select the MacBook Pro and do not select the mini or the release job', () => {
 const doc = workflow('.github/workflows/mbp-dev.yml');
 const mbpRunsOn = doc.jobs.install['runs-on'];
 const miniRunsOn = mini.jobs.install['runs-on'];
 const releaseRunsOn = release.jobs.release['runs-on'];
 assert.equal(runnerAccepts(MBP_RUNNER, mbpRunsOn), true);
 assert.equal(runnerAccepts(MINI_RUNNER, mbpRunsOn), false);
 assert.equal(runnerAccepts(MBP_RUNNER, miniRunsOn), false);
 assert.equal(runnerAccepts(MINI_RUNNER, miniRunsOn), true);
 // The release job runs on a GitHub-hosted Mac: no self-hosted runner takes it.
 assert.equal(releaseRunsOn, 'macos-26');
 assert.equal(runnerAccepts(MBP_RUNNER, [releaseRunsOn]), false);
 assert.equal(runnerAccepts(MINI_RUNNER, [releaseRunsOn]), false);
 assert.equal(runnerAccepts(['self-hosted', 'macOS', 'ARM64', 'mac-build'], mbpRunsOn), false);
 const labels = parseYaml(read('.github/actionlint.yaml'))['self-hosted-runner'].labels;
 assert.ok(labels.includes('assetboard-mini'));
 assert.ok(labels.includes('assetboard-mbp'));
});

test('a failed release does not queue the MacBook Pro, and an offline one does not hold the release group', () => {
 const doc = workflow('.github/workflows/mbp-dev.yml');
 for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', 'neutral', 'action_required']) {
  const missed = placement(doc, {name: 'workflow_run', conclusion, sha: RELEASE_SHA, head_sha: RELEASE_SHA}, false);
  assert.equal(missed.requestsRunner, false, conclusion);
  assert.equal(missed.queue, 'not-queued', conclusion);
  assert.equal(missed.holdsReleaseGroup, false, conclusion);
 }
 const offline = placement(doc, {name: 'workflow_run', conclusion: 'success', sha: DEFAULT_BRANCH_SHA, head_sha: RELEASE_SHA}, false);
 assert.equal(offline.requestsRunner, true);
 assert.equal(offline.queue, 'waiting-for-runner');
 assert.equal(offline.concurrencyGroup, 'mbp-dev-install');
 assert.equal(offline.holdsReleaseGroup, false);
 assert.equal(offline.appliesExecutionTimeout, false);
 assert.equal(offline.timeoutMinutes, 30);
 assert.notEqual(offline.queue, 'skipped-by-timeout');

 const online = placement(doc, {name: 'workflow_run', conclusion: 'success', sha: DEFAULT_BRANCH_SHA, head_sha: RELEASE_SHA}, true);
 assert.equal(online.queue, 'accepted');
 assert.equal(online.appliesExecutionTimeout, true);
 assert.equal(online.holdsReleaseGroup, false);

 const byHand = placement(doc, {name: 'workflow_dispatch', sha: RELEASE_SHA}, true);
 assert.equal(byHand.requestsRunner, true);
});
