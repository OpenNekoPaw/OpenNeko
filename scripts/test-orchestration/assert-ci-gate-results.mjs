const SUPPORTED_RESULTS = new Set(['success', 'failure', 'cancelled', 'skipped']);

export function assertCiGateResults({ gateName, jobs, requiredSuccess }) {
  if (typeof gateName !== 'string' || gateName.trim().length === 0) {
    throw new Error('CI gate name must be a non-empty string.');
  }
  if (jobs === null || typeof jobs !== 'object' || Array.isArray(jobs)) {
    throw new Error(`${gateName}: CI job results must be an object.`);
  }
  if (!Array.isArray(requiredSuccess) || requiredSuccess.length === 0) {
    throw new Error(`${gateName}: at least one required-success job must be configured.`);
  }

  const diagnostics = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    const result = job?.result;
    if (!SUPPORTED_RESULTS.has(result)) {
      diagnostics.push(`${jobName}=unknown(${String(result)})`);
      continue;
    }
    if (result === 'failure' || result === 'cancelled') {
      diagnostics.push(`${jobName}=${result}`);
    }
  }

  for (const jobName of new Set(requiredSuccess)) {
    const job = jobs[jobName];
    if (job === undefined) {
      diagnostics.push(`${jobName}=missing`);
      continue;
    }
    if (job.result !== 'success') {
      diagnostics.push(`${jobName}=required-${String(job.result)}`);
    }
  }

  if (diagnostics.length > 0) {
    throw new Error(`${gateName} failed: ${[...new Set(diagnostics)].join(', ')}`);
  }

  return Object.freeze({
    gateName,
    observedJobs: Object.keys(jobs).length,
    requiredJobs: new Set(requiredSuccess).size,
  });
}

function runCli() {
  const [gateName, ...requiredSuccess] = process.argv.slice(2);
  const encodedJobs = process.env.CI_GATE_RESULTS;
  if (encodedJobs === undefined) {
    throw new Error('CI_GATE_RESULTS is required.');
  }

  let jobs;
  try {
    jobs = JSON.parse(encodedJobs);
  } catch (error) {
    throw new Error(`CI_GATE_RESULTS must be valid JSON: ${error.message}`);
  }

  const summary = assertCiGateResults({ gateName, jobs, requiredSuccess });
  process.stdout.write(
    `${summary.gateName} passed (${summary.requiredJobs} required, ${summary.observedJobs} observed).\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
