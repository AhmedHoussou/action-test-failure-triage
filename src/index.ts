import 'dotenv/config';
import * as core from './core.js';
import { parsePlaywrightReport } from './parser.js';
import { triageTestFailure, TriageResult } from './triage.js';
import { buildMarkdownComment, postOrUpdatePRComment } from './commenter.js';

async function run(): Promise<void> {
  try {
    const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN;
    const geminiApiKey = core.getInput('gemini-api-key') || process.env.GEMINI_API_KEY;
    const reportPath = core.getInput('report-path') || process.env.REPORT_PATH || 'test-results.json';

    if (!githubToken) {
      throw new Error('Input "github-token" is required.');
    }

    if (!geminiApiKey) {
      throw new Error('Input "gemini-api-key" is required.');
    }

    core.info(`[Triage Action] Reading report from: ${reportPath}`);

    const failures = parsePlaywrightReport(reportPath);

    if (failures.length === 0) {
      core.info('[Triage Action] No test failures detected in report. Exiting cleanly.');
      return;
    }

    core.info(`[Triage Action] Found ${failures.length} failure(s). Triaging with Gemini Flash Lite...`);

    const triageResults: TriageResult[] = [];
    for (const failure of failures) {
      core.info(`[Triage Action] Analyzing: "${failure.testTitle}"...`);
      const result = await triageTestFailure(failure, geminiApiKey);
      triageResults.push(result);
    }

    const commentBody = buildMarkdownComment(triageResults);

    await postOrUpdatePRComment(githubToken, commentBody);

    core.info('[Triage Action] Triage process completed successfully.');
  } catch (error: any) {
    core.setFailed(`[Triage Action] Error executing triage: ${error.message}`);
  }
}

run();