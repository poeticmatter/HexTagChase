import type { HexCoord, TurnPlan, ResolutionSummary } from '../types'
import { MAX_TURNS } from '../types'

export type PlanningPhase =
  | 'move_dest'
  | 'predict_dest'
  | 'bonus_move'
  | 'ready'

export interface DraftPlan {
  moveDest: HexCoord | null
  predictDest: HexCoord | null
  bonusMove: HexCoord | null
}

export function isDraftComplete(draft: DraftPlan): boolean {
  if (!draft.moveDest || !draft.predictDest || !draft.bonusMove) return false
  return true
}

export function draftToTurnPlan(draft: DraftPlan): TurnPlan | null {
  if (!isDraftComplete(draft)) return null
  return {
    moveDest: draft.moveDest!,
    predictDest: draft.predictDest!,
    bonusMove: draft.bonusMove!,
  }
}

// ── Resolution banner ─────────────────────────────────────────────────────

function hitLabel(hit: boolean): { text: string; color: string } {
  if (hit) return { text: 'Hit!', color: 'text-green-400' }
  return { text: 'Miss', color: 'text-neutral-500' }
}

interface ResolutionBannerProps {
  resolution: ResolutionSummary
  isChaser: boolean
}

function ResolutionBanner({ resolution, isChaser }: ResolutionBannerProps) {
  const { chaserPredHit, evaderPredHit, chaserBonusUsed, evaderBonusUsed } = resolution

  const myPredHit  = isChaser ? chaserPredHit  : evaderPredHit
  const oppPredHit = isChaser ? evaderPredHit  : chaserPredHit
  const myBonusUsed = isChaser ? chaserBonusUsed : evaderBonusUsed
  const oppBonusUsed = isChaser ? evaderBonusUsed : chaserBonusUsed

  const myLabel  = hitLabel(myPredHit)
  const oppLabel = hitLabel(oppPredHit)

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-3 text-xs flex flex-col gap-2">
      <p className="text-neutral-400 font-semibold text-center uppercase tracking-wider">Last turn</p>

      {/* My prediction row */}
      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between">
          <span className="text-neutral-500">Your prediction:</span>
          <span className={myLabel.color}>{myLabel.text}</span>
        </div>
        {myPredHit && (
          <p className="text-neutral-400 text-right">
            {myBonusUsed ? 'Bonus move triggered' : 'Bonus move blocked'}
          </p>
        )}
      </div>

      {/* Opponent prediction row */}
      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between">
          <span className="text-neutral-500">Opp prediction:</span>
          <span className={oppLabel.color}>{oppLabel.text}</span>
        </div>
        {oppPredHit && (
          <p className="text-neutral-400 text-right">
            {oppBonusUsed ? 'Opponent used bonus move' : 'Opponent bonus blocked'}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Planning steps display ─────────────────────────────────────────────────

const DEST_PHASE_LABELS: Record<PlanningPhase, string> = {
  move_dest:    'Click your destination',
  predict_dest: 'Predict opponent destination',
  bonus_move:   'Pre-commit bonus move',
  ready:        'Ready to confirm',
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
  planningPhase: PlanningPhase,
): { label: string; done: boolean; active: boolean }[] {
  return [
    { label: 'Move destination', done: !!draft.moveDest, active: planningPhase === 'move_dest' },
    { label: 'Predict opp destination', done: !!draft.predictDest, active: planningPhase === 'predict_dest' },
    { label: 'Bonus move (if hit)', done: !!draft.bonusMove, active: planningPhase === 'bonus_move' },
  ]
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  isChaser: boolean
  turn: number
  draft: DraftPlan
  planningPhase: PlanningPhase
  lastResolution: ResolutionSummary | null
  waitingForPartner: boolean
  onConfirm: (plan: TurnPlan) => void
  onReset: () => void
}

export function PlanningPanel({
  isChaser,
  turn,
  draft,
  planningPhase,
  lastResolution,
  waitingForPartner,
  onConfirm,
  onReset,
}: Props) {
  const steps = buildSteps(draft, planningPhase)
  const role = isChaser ? 'Chaser' : 'Evader'
  const roleColor = isChaser ? 'text-red-400' : 'text-blue-400'
  const goal = isChaser
    ? 'Tag the evader (end adjacent)'
    : `Survive ${MAX_TURNS} turns`

  const isComplete = isDraftComplete(draft)

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
          {DEST_PHASE_LABELS[planningPhase]}
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
            const plan = draftToTurnPlan(draft)
            if (plan) onConfirm(plan)
          }}
          disabled={!isComplete}
          className={`flex-[2] py-2 rounded-lg text-sm font-bold transition-colors ${
            isComplete
              ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white'
              : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
          }`}
        >
          Confirm
        </button>
      </div>
    </div>
  )
}
