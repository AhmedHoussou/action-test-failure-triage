import * as fs from 'fs';
import * as path from 'path';

export interface ParsedTestFailure {
  testTitle: string;
  filePath: string;
  status: string;
  errorMessage: string;
  codeSnippet?: string;
  line?: number;
}

interface PlaywrightError {
  message?: string;
  snippet?: string;
  location?: {
    file: string;
    line: number;
    column: number;
  };
}

interface PlaywrightTestResult {
  status: string;
  errors?: PlaywrightError[];
}

interface PlaywrightSpec {
  title: string;
  ok: boolean;
  tests: {
    status: string;
    results: PlaywrightTestResult[];
  }[];
}

interface PlaywrightSuite {
  title: string;
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightJsonReport {
  suites?: PlaywrightSuite[];
  errors?: PlaywrightError[];
}

function extractFailuresFromSuites(suites: PlaywrightSuite[], failures: ParsedTestFailure[] = []): ParsedTestFailure[] {
  for (const suite of suites) {
    if (suite.specs) {
      for (const spec of suite.specs) {
        if (!spec.ok) {
          for (const test of spec.tests) {
            for (const result of test.results) {
              if (result.status === 'unexpected' || result.status === 'timedOut' || result.status === 'failed') {
                const primaryError = result.errors?.[0];
                failures.push({
                  testTitle: spec.title,
                  filePath: suite.file || primaryError?.location?.file || 'unknown',
                  status: result.status,
                  errorMessage: primaryError?.message ? cleanErrorMessage(primaryError.message) : 'Unknown failure',
                  codeSnippet: primaryError?.snippet,
                  line: primaryError?.location?.line,
                });
              }
            }
          }
        }
      }
    }

    if (suite.suites && suite.suites.length > 0) {
      extractFailuresFromSuites(suite.suites, failures);
    }
  }

  return failures;
}

function cleanErrorMessage(rawMessage: string): string {
  return rawMessage
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim();
}

export function parsePlaywrightReport(reportPath: string): ParsedTestFailure[] {
  const resolvedPath = path.resolve(process.cwd(), reportPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Report file not found at: ${resolvedPath}`);
  }

  const rawData = fs.readFileSync(resolvedPath, 'utf-8');
  const report: PlaywrightJsonReport = JSON.parse(rawData);

  if (!report.suites || report.suites.length === 0) {
    return [];
  }

  return extractFailuresFromSuites(report.suites);
}