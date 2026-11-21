import type { AiResult, NanoAvailability } from '../ai/label';

export type AiState =
  | { kind: 'checking' }
  | { kind: 'running' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'done' }
  | { kind: 'offer-download' }
  | { kind: 'off'; reason: NanoAvailability | 'error' };

const OFF_TEXT: Record<string, string> = {
  unsupported: 'On-device AI is not available in this Chrome version, so keyword labels are used.',
  unavailable:
    'On-device AI (Gemini Nano) is not available on this device, so keyword labels are used. It needs a recent Chrome, about 22 GB of free disk space, and a capable GPU or CPU.',
  error: 'On-device AI did not respond, so keyword labels are used.',
};

export function SummaryCard({ result, ai, onDownload }: { result: AiResult; ai: AiState; onDownload: () => void }) {
  return (
    <section class="card">
      <h2>Summary</h2>
      <p>{result.summary}</p>
      <p class="small muted">
        {result.summarySource === 'nano' ? 'Written by on-device AI from the test results.' : 'Template summary from the test results.'}
        {result.labelsApplied > 0 && ` Theme names by on-device AI (${result.labelsApplied}).`}
      </p>
      {result.rejected && (
        <details class="small muted">
          <summary>AI summary rejected: {result.rejected.reason}</summary>
          {result.rejected.draft && <p>“{result.rejected.draft}”</p>}
        </details>
      )}
      {ai.kind === 'checking' && <p class="small muted">Checking for on-device AI…</p>}
      {ai.kind === 'running' && <p class="small muted">On-device AI is naming themes…</p>}
      {ai.kind === 'downloading' && (
        <p class="small">
          Downloading Gemini Nano: {Math.round(ai.progress * 100)}%
          <progress max={1} value={ai.progress} style={{ width: '100%' }} />
        </p>
      )}
      {ai.kind === 'offer-download' && (
        <p class="small">
          <button type="button" class="primary" onClick={onDownload}>
            Use on-device AI
          </button>{' '}
          <span class="muted">Chrome downloads Gemini Nano once (a few GB); it then runs offline on this device.</span>
        </p>
      )}
      {ai.kind === 'off' && <p class="small muted">{OFF_TEXT[ai.reason] ?? OFF_TEXT.unavailable}</p>}
    </section>
  );
}
