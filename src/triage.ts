import 'dotenv/config';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { ParsedTestFailure } from './parser.js';

export type FailureCategory =
  | 'FLAKE_OR_RACE_CONDITION'
  | 'APPLICATION_BUG'
  | 'SELECTOR_DRIFT'
  | 'INFRASTRUCTURE_OR_BACKEND_FAILURE'
  | 'ENVIRONMENT_MISCONFIGURATION';

export interface TriageResult {
  testTitle: string;
  filePath: string;
  category: FailureCategory;
  confidence: number;
  rootCause: string;
  recommendedAction: string;
  suggestedPatch?: string;
}

const triageSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      enum: [
        'FLAKE_OR_RACE_CONDITION',
        'APPLICATION_BUG',
        'SELECTOR_DRIFT',
        'INFRASTRUCTURE_OR_BACKEND_FAILURE',
        'ENVIRONMENT_MISCONFIGURATION',
      ],
      description: 'The technical categorization of why this automated test failed.',
    },
    confidence: {
      type: Type.NUMBER,
      description: 'Confidence score from 0.0 to 1.0.',
    },
    rootCause: {
      type: Type.STRING,
      description: 'Concise explanation (1-2 sentences) of the exact root cause based on error logs and code snippets.',
    },
    recommendedAction: {
      type: Type.STRING,
      description: 'Actionable step-by-step guidance for the engineer to resolve the issue.',
    },
    suggestedPatch: {
      type: Type.STRING,
      description: 'Optional git diff or code fix snippet if applicable, otherwise empty string.',
    },
  },
  required: ['category', 'confidence', 'rootCause', 'recommendedAction'],
};

export async function triageTestFailure(
  failure: ParsedTestFailure,
  apiKey?: string
): Promise<TriageResult> {
  const resolvedKey = apiKey || process.env.GEMINI_API_KEY;
  if (!resolvedKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables or inputs.');
  }

  const ai = new GoogleGenAI({ apiKey: resolvedKey });

  const prompt = `
You are an expert Staff SDET and Site Reliability Engineer analyzing a failed Playwright end-to-end test execution in CI/CD.

### Test Metadata:
- Test Title: "${failure.testTitle}"
- File Location: "${failure.filePath}${failure.line ? `:${failure.line}` : ''}"
- Failure Status: "${failure.status}"

### Error Log:
\`\`\`
${failure.errorMessage}
\`\`\`

### Code Snippet at Failure:
\`\`\`typescript
${failure.codeSnippet || 'No snippet available'}
\`\`\`

Diagnose the root cause accurately:
1. Distinguish between frontend DOM changes (SELECTOR_DRIFT), backend/network timeouts (INFRASTRUCTURE_OR_BACKEND_FAILURE), timing/async issues (FLAKE_OR_RACE_CONDITION), or genuine application logic regressions (APPLICATION_BUG).
2. Provide a concrete, technical root cause.
3. Suggest the exact remediation steps.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: triageSchema,
      temperature: 0.1,
    },
  });

  const parsed = JSON.parse(response.text || '{}');

  return {
    testTitle: failure.testTitle,
    filePath: failure.filePath,
    category: parsed.category,
    confidence: parsed.confidence,
    rootCause: parsed.rootCause,
    recommendedAction: parsed.recommendedAction,
    suggestedPatch: parsed.suggestedPatch || undefined,
  };
}