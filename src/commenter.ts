import * as fs from 'fs';
import { TriageResult } from './triage.js';

const COMMENT_HEADER = '<!-- @playwright-failure-triage-bot -->';

function getCategoryBadge(category: string): string {
  switch (category) {
    case 'FLAKE_OR_RACE_CONDITION':
      return '⚠️ **FLAKE / RACE CONDITION**';
    case 'APPLICATION_BUG':
      return '🚨 **APPLICATION BUG**';
    case 'SELECTOR_DRIFT':
      return '🔍 **SELECTOR DRIFT**';
    case 'INFRASTRUCTURE_OR_BACKEND_FAILURE':
      return '🌐 **INFRASTRUCTURE / BACKEND**';
    case 'ENVIRONMENT_MISCONFIGURATION':
      return '⚙️ **ENVIRONMENT CONFIG**';
    default:
      return '❓ **UNKNOWN**';
  }
}

export function buildMarkdownComment(results: TriageResult[]): string {
  let markdown = `${COMMENT_HEADER}\n`;
  markdown += `## 🤖 Playwright CI Failure Root-Cause Triage\n\n`;
  markdown += `Gemini analyzed **${results.length}** test failure(s) in this pipeline run:\n\n`;

  results.forEach((res, index) => {
    markdown += `### ${index + 1}. \`${res.testTitle}\`\n\n`;
    markdown += `| Metric | Details |\n`;
    markdown += `| :--- | :--- |\n`;
    markdown += `| **Category** | ${getCategoryBadge(res.category)} |\n`;
    markdown += `| **Confidence** | \`${Math.round(res.confidence * 100)}%\` |\n`;
    markdown += `| **Spec File** | \`${res.filePath}\` |\n\n`;

    markdown += `> **Root Cause:**\n> ${res.rootCause}\n\n`;
    markdown += `**Recommended Action:**\n${res.recommendedAction}\n\n`;

    if (res.suggestedPatch) {
      markdown += `<details><summary><b>Suggested Patch / Fix</b></summary>\n\n`;
      markdown += `\`\`\`typescript\n${res.suggestedPatch}\n\`\`\`\n\n`;
      markdown += `</details>\n\n`;
    }

    markdown += `---\n`;
  });

  markdown += `*Generated automatically by [Playwright Test Failure Triage Bot](https://github.com/AhmedHoussou/action-test-failure-triage)*`;

  return markdown;
}

interface GitHubComment {
  id: number;
  body: string;
}

export async function postOrUpdatePRComment(
  token: string,
  markdownBody: string
): Promise<void> {
  const isCI = Boolean(process.env.GITHUB_ACTIONS && process.env.GITHUB_REPOSITORY);

  if (!isCI) {
    console.log('\n[Triage Commenter] Local environment detected (skipping remote GitHub PR comment).');
    console.log('\n================ Generated PR Comment ================\n');
    console.log(markdownBody);
    console.log('======================================================\n');
    return;
  }

  const repo = process.env.GITHUB_REPOSITORY; // e.g. "AhmedHoussou/action-test-failure-triage"
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!repo || !eventPath || !fs.existsSync(eventPath)) {
    console.log('[Triage Commenter] GITHUB_EVENT_PATH not available. Skipping PR comment.');
    return;
  }

  const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const prNumber = eventData.pull_request?.number || eventData.issue?.number;

  if (!prNumber) {
    console.log('[Triage Commenter] Event is not attached to a PR. Skipping PR comment.');
    return;
  }

  const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'playwright-failure-triage-bot',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // 1. Fetch existing comments to prevent spam
  const commentsUrl = `${apiBase}/repos/${repo}/issues/${prNumber}/comments`;
  const listRes = await fetch(commentsUrl, { headers });

  if (!listRes.ok) {
    throw new Error(`Failed to fetch PR comments: ${listRes.status} ${listRes.statusText}`);
  }

  const comments = (await listRes.json()) as GitHubComment[];
  const existing = comments.find((c) => c.body?.includes(COMMENT_HEADER));

  if (existing) {
    console.log(`[Triage Commenter] Updating existing comment ID: ${existing.id}`);
    const updateRes = await fetch(`${apiBase}/repos/${repo}/issues/comments/${existing.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: markdownBody }),
    });

    if (!updateRes.ok) {
      throw new Error(`Failed to update comment: ${updateRes.status} ${updateRes.statusText}`);
    }
  } else {
    console.log(`[Triage Commenter] Creating new comment on PR #${prNumber}`);
    const createRes = await fetch(commentsUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: markdownBody }),
    });

    if (!createRes.ok) {
      throw new Error(`Failed to create comment: ${createRes.status} ${createRes.statusText}`);
    }
  }
}