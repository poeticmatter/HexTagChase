import type { HexCoord, TurnPlan, ResolutionSummary, TurnSchema, UIStep, GamePhase } from '../types'

export interface DraftPlan {
  moveDest: HexCoord | null
  predictDest: HexCoord | null
  bonusMove: HexCoord | null
}

/** select_bonus is optional — the player may confirm without choosing a bonus hex. */
export function isDraftComplete(draft: DraftPlan, schema: TurnSchema): boolean {
  for (const step of schema.requiredSteps) {
    if (step === 'select_movement' && !draft.moveDest) return false
    if (step === 'select_prediction' && !draft.predictDest) return false
    // select_bonus is intentionally not required for completion
  }
  return true
}

export function draftToTurnPlan(
  draft: DraftPlan,
  schema: TurnSchema,
  turn: number,
  phase: GamePhase,
  isChaser: boolean,
): TurnPlan | null {
  if (!isDraftComplete(draft, schema)) return null

  if (phase === 'bonus_phase') {
    return { type: 'bonus', turn, phase: 'bonus_phase', bonusMove: draft.bonusMove }
  }

  if (isChaser) {
    if (!draft.moveDest || !draft.predictDest) return null
    return {
      type: 'chaser',
      turn,
      phase,
      moveDest: draft.moveDest,
      predictDest: draft.predictDest,
      ...(draft.bonusMove !== null ? { bonusMove: draft.bonusMove } : {}),
    }
  }

  if (!draft.moveDest) return null
  return {
    type: 'evader',
    turn,
    phase,
    moveDest: draft.moveDest,
    ...(draft.bonusMove !== null ? { bonusMove: draft.bonusMove } : {}),
  }
}

// ── Resolution banner ─────────────────────────────────────────────────────

interface ResolutionBannerProps {
  resolution: ResolutionSummary
  isChaser: boolean
}

function ResolutionBanner({ resolution, isChaser }: ResolutionBannerProps) {
  const { chaserPredHit, bonusUsedBy } = resolution

  const predLabel = chaserPredHit ? 'Hit' : 'Miss'
  const predColor = chaserPredHit ? 'text-green-400' : 'text-neutral-500'

  const bonusLabel = bonusUsedBy === null
    ? 'No bonus'
    : bonusUsedBy === 'chaser'
      ? isChaser ? 'You used bonus' : 'Opponent used bonus'
      : isChaser ? 'Opponent used bonus' : 'You used bonus'

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-3 text-xs flex flex-col gap-2">
      <p className="text-neutral-400 font-semibold text-center uppercase tracking-wider">Last turn</p>
      <div className="flex justify-between">
        <span className="text-neutral-500">Chaser prediction:</span>
        <span className={predColor}>{predLabel}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-neutral-500">Bonus:</span>
        <span className="text-neutral-400">{bonusLabel}</span>
      </div>
    </div>
  )
}

// ── Planning steps display ─────────────────────────────────────────────────

const STEP_LABELS: Record<UIStep | 'ready', string> = {
  select_movement:  'Click your destination',
  select_prediction: 'Predict opponent destination',
  select_bonus:     'Select bonus move (optional)',
  ready:            'Ready to confirm',
}

interface StepIndicatorProps {
  label: string
  done: boolean
  active: boolean
}

function StepIndicator({ label, done, active }: StepIndicatorProps) {
  return (
    <div className={`flex items-center gap-2 text-xs ${
      active ? 'text-white' : done ? 'text-neutral-400' : 'text-neutral-600'
    }`}>
      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
        done   ? 'bg-green-700 text-green-200' :
        active ? 'bg-blue-600 text-white' :
                 'bg-neutral-700 text-neutral-500'
      }`}>
        {done ? '✓' : '·'}
      </div>
      {label}
    </div>
  )
}

function buildSteps(
  draft: DraftPlan,
  schema: TurnSchema,
  currentStep: UIStep | 'ready',
): { label: string; done: boolean; active: boolean }[] {
  return schema.requiredSteps.map(step => {
    let done = false
    if (step === 'select_movement')  done = !!draft.moveDest
    if (step === 'select_prediction') done = !!draft.predictDest
    if (step === 'select_bonus')     done = !!draft.bonusMove

    return { label: STEP_LABELS[step], done, active: currentStep === step }
  })
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  isChaser: boolean
  turn: number
  maxTurns: number
  phase: GamePhase
  draft: DraftPlan
  schema: TurnSchema
  currentStep: UIStep | 'ready'
  lastResolution: ResolutionSummary | null
  waitingForPartner: boolean
  onConfirm: (plan: TurnPlan) => void
  onReset: () => void
}

export function PlanningPanel({
  isChaser,
  turn,
  maxTurns,
  phase,
  draft,
  schema,
  currentStep,
  lastResolution,
  waitingForPartner,
  onConfirm,
  onReset,
}: Props) {
  const steps = buildSteps(draft, schema, currentStep)
  const role = isChaser ? 'Chaser' : 'Evader'
  const roleColor = isChaser ? 'text-red-400' : 'text-blue-400'
  const goal = isChaser
    ? 'Tag the evader (end adjacent)'
    : `Survive ${maxTurns} turns`

  const isComplete = isDraftComplete(draft, schema)

  if (waitingForPartner) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-6 px-4 bg-neutral-800/40 rounded-xl border border-neutral-700">
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        <p className="text-neutral-400 text-sm">Waiting for opponent…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Role + goal */}
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${roleColor}`}>{role}</span>
        <span className="text-xs text-neutral-500">{goal}</span>
      </div>

      {/* Last resolution */}
      {lastResolution && (
        <ResolutionBanner resolution={lastResolution} isChaser={isChaser} />
      )}

      {/* Planning steps */}
      <div className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-3 flex flex-col gap-2">
        <p className="text-xs text-neutral-400 font-semibold text-center uppercase tracking-wider mb-1">
          {phase === 'bonus_phase' ? 'Bonus Move' : STEP_LABELS[currentStep]}
        </p>
        {steps.map(s => (
          <div key={s.label}>
            <StepIndicator label={s.label} done={s.done} active={s.active} />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onReset}
          className="flex-1 py-2 bg-neutral-700 hover:bg-neutral-600 active:bg-neutral-800 rounded-lg text-sm text-neutral-300 transition-colors"
        >
          Reset
        </button>
        <button
          onClick={() => {
            const plan = draftToTurnPlan(draft, schema, turn, phase, isChaser)
            if (plan) onConfirm(plan)
          }}
          disabled={!isComplete}
          className={`flex-[2] py-2 rounded-lg text-sm font-bold transition-colors ${
            isComplete
              ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white'
              : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
          }`}
        >
          {currentStep === 'select_bonus' && draft.bonusMove === null ? 'Skip Bonus' : 'Confirm'}
        </button>
      </div>
    </div>
  )
}
