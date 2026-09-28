import { TopBar } from '../../components/TopBar';
import { deleteDraft } from '../../api/endpoints/wizard';
import { useDraft } from '../../api/hooks/useDraft';
import { ResumeDraftPrompt } from './ResumeDraftPrompt';
import { ServerDraftsPrompt } from './ServerDraftsPrompt';
import { useState } from 'react';
import { Step1Upload } from './Step1Upload';
import { Step2Coherence } from './Step2Coherence';
import { Step3Topics } from './Step3Topics';
import { Step4Calibrate } from './Step4Calibrate';

const STEPS: { n: number; label: string }[] = [
  { n: 1, label: 'SEEDS' },
  { n: 2, label: 'COHERENCE' },
  { n: 3, label: 'CONCEPTS' },
  { n: 4, label: 'CALIBRATE' },
];

interface Props {
  onDone: (slug: string) => void;
  onCancel: () => void;
}

export function ProfileWizard({ onDone, onCancel }: Props) {
  const { state, setStep, reset, resume, adopt } = useDraft();
  const step = state.step;
  // With no local draft, ask the server once whether one was left behind
  // elsewhere. Reset whenever a draft appears so a later "start over"
  // (slug back to null) asks again.
  const [checkedServer, setCheckedServer] = useState(false);
  if (state.slug && checkedServer) setCheckedServer(false);

  const discard = () => {
    const slug = state.slug;
    if (slug) {
      deleteDraft(slug).catch(() => {
        /* already gone or committed — nothing to clean up */
      });
    }
    reset();
  };

  const goNext = () => setStep(Math.min(4, step + 1));
  const goPrev = () => setStep(Math.max(1, step - 1));

  return (
    <div className="view">
      <TopBar
        crumbs={['Topics', 'New topic', state.name || '…']}
        right={
          <button
            className="btn"
            onClick={() => {
              // App's navigation guard asks keep / discard / stay when a
              // draft exists; with no draft this just leaves.
              onCancel();
            }}
          >
            CANCEL
          </button>
        }
      />

      {!state.slug && !checkedServer ? (
        <ServerDraftsPrompt
          onAdopt={(d) =>
            adopt({
              slug: d.slug,
              name: d.name,
              orcid: d.orcid,
              nSeeds: d.n_seeds,
              importing: d.importing,
              importRunId: d.import_run_id,
              rp: d.rp,
              phase: d.phase,
            })
          }
          onNone={() => setCheckedServer(true)}
        />
      ) : state.slug && state.parked ? (
        <ResumeDraftPrompt
          name={state.name}
          step={step}
          nSeeds={state.seeds.length}
          onResume={resume}
          onStartNew={discard}
        />
      ) : (
        <>
      <div className="section">
        {/* Progress only. Moving between steps happens through each
            step's own BACK / NEXT buttons, so nothing here is clickable. */}
        <ol className="steps" aria-label="Wizard progress">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className={s.n === step ? 'current' : s.n < step ? 'done' : ''}
              aria-current={s.n === step ? 'step' : undefined}
            >
              {s.n}. {s.label}
            </li>
          ))}
        </ol>
      </div>

      {step === 1 && <Step1Upload onNext={goNext} />}
      {step === 2 && <Step2Coherence onPrev={goPrev} onNext={goNext} />}
      {step === 3 && <Step3Topics onPrev={goPrev} onNext={goNext} />}
      {step === 4 && (
        <Step4Calibrate
          onPrev={goPrev}
          onDone={(slug) => {
            reset();
            onDone(slug);
          }}
        />
      )}
        </>
      )}
    </div>
  );
}
