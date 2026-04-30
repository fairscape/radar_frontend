import { TopBar } from '../../components/TopBar';
import { useDraft } from '../../api/hooks/useDraft';
import { Step1Upload } from './Step1Upload';
import { Step2Coherence } from './Step2Coherence';
import { Step3Topics } from './Step3Topics';
import { Step4Calibrate } from './Step4Calibrate';

const STEPS: { n: number; label: string }[] = [
  { n: 1, label: 'SEEDS' },
  { n: 2, label: 'COHERENCE' },
  { n: 3, label: 'TOPICS' },
  { n: 4, label: 'CALIBRATE' },
];

interface Props {
  onDone: (slug: string) => void;
  onCancel: () => void;
}

export function ProfileWizard({ onDone, onCancel }: Props) {
  const { state, setStep, reset } = useDraft();
  const step = state.step;

  const goNext = () => setStep(Math.min(4, step + 1));
  const goPrev = () => setStep(Math.max(1, step - 1));

  return (
    <div className="view">
      <TopBar
        crumbs={['Profiles', 'New profile', state.name || '…']}
        right={
          <button
            className="btn"
            onClick={() => {
              reset();
              onCancel();
            }}
          >
            CANCEL
          </button>
        }
      />

      <div className="section">
        <div className="opts" style={{ display: 'flex', gap: 4 }}>
          {STEPS.map((s) => (
            <button
              key={s.n}
              className={step === s.n ? 'on' : ''}
              onClick={() => {
                // Only allow stepping back; forward steps gate on data.
                if (s.n <= step) setStep(s.n);
              }}
            >
              {s.n}. {s.label}
            </button>
          ))}
        </div>
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
    </div>
  );
}
