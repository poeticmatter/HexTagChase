import type { HexCoord, TurnPlan, ResolutionSummary, PredictionQuality, GameSettings } from '../types'
import { MAX_TURNS } from '../lib/hexGameLogic'

export type PlanningPhase =
  | 'move_step1'
  | 'move_step2'
  | 'predict_step1'
  | 'predict_step2'
  | 'bonus_move'
  | 'ready'

export interface DraftPlan {
  moveStep1: HexCoord | null
  moveStep2: HexCoord | null
  predictStep1: HexCoord | null
  predictStep2: HexCoord | null
  bonusMove: HexCoord | null
}

export function isDraftComplete(draft: DraftPlan, settings: GameSettings, isChaser: boolean): boolean {
  const useStep2 = settings.moveSteps === 2 && settings.predictionTarget !== 'destination'
  if (!draft.moveStep1 || !draft.predictStep1) return false
  if (useStep2 && (!draft.moveStep2 || !draft.predictStep2)) return false
  const needsBonus = settings.predictionOutcome === 'bonus-both'
    || (settings.predictionOutcome === 'freeze-and-bonus' && !isChaser)
  if (needsBonus && !draft.bonusMove) return false
  return true
}

export function draftToTurnPlan(draft: DraftPlan, settings: GameSettings, isChaser: boolean): TurnPlan | null {
  if (!isDraftComplete(draft, settings, isChaser)) return null
  const useStep2 = settings.moveSteps === 2 && settings.predictionTarget !== 'destination'
  return {
    moveStep1: draft.moveStep1!,
    ...(useStep2 && draft.moveStep2 ? { moveStep2: draft.moveStep2 } : {}),
    predictStep1: draft.predictStep1!,
    ...(useStep2 && draft.predictStep2 ? { predictStep2: draft.predictStep2 } : {}),
    ...(( settings.predictionOutcome === 'bonus-both'
         || (settings.predictionOutcome === 'freeze-and-bonus' && !isChaser)
       ) && draft.bonusMove
      ? { bonusMove: draft.bonusMove }
      : {}),
  }
}

// ── Resolution banner ─────────────────────────────────────────────────────

function qualityLabel(q: PredictionQuality): { text: string; color: string } {
  switch (q) {
    case 'full':    return { text: 'Fully predicted', color: 'text-green-400' }
    case 'partial': return { text: 'Partially predicted', color: 'text-yellow-400' }
    case 'none':    return { text: 'Not predicted', color: 'text-neutral-500' }
  }
}

function cancelledDesc(cancelled: [boolean, boolean], settings: GameSettings): string {
  if (settings.moveSteps === 1 || settings.predictionTarget === 'destination') {
    return cancelled[0] ? 'Fully predicted — no movement' : 'Not predicted — full movement'
  }
  if (cancelled[0] && cancelled[1]) return 'Fully predicted — no movement'
  if (cancelled[0]) return 'Step 1 cancelled — only step 2 moved'
  if (cancelled[1]) return 'Step 2 cancelled — only step 1 moved'
  return 'Not predicted — full movement'
}

interface ResolutionBannerProps {
  resolution: ResolutionSummary
  isChaser: boolean
  settings: GameSettings
}

function myPredOutcomeText(
  resolution: ResolutionSummary,
  isChaser: boolean,
  settings: GameSettings,
  oppCancelled: [boolean, boolean],
): string {
  const { predictionOutcome } = settings
  if (predictionOutcome === 'bonus-both') {
    const bonusUsed = isChaser ? resolution.chaserBonusUsed : resolution.evaderBonusUsed
    return bonusUsed ? 'Bonus move triggered' : 'Bonus move blocked'
  }
  if (predictionOutcome === 'freeze-and-bonus' && !isChaser) {
    return resolution.evaderBonusUsed ? 'Bonus move triggered' : 'Bonus move blocked'
  }
  return cancelledDesc(oppCancelled, settings)
}

function oppPredOutcomeText(
  resolution: ResolutionSummary,
  isChaser: boolean,
  settings: GameSettings,
  myCancelled: [boolean, boolean],
): string {
  const { predictionOutcome } = settings
  if (predictionOutcome === 'bonus-both') {
    const bonusUsed = isChaser ? resolution.evaderBonusUsed : resolution.chaserBonusUsed
    return bonusUsed ? 'Opponent used bonus move' : 'Opponent bonus blocked'
  }
  if (predictionOutcome === 'freeze-and-bonus' && isChaser) {
    return resolution.evaderBonusUsed ? 'Evader used bonus move' : 'Evader bonus blocked'
  }
  return cancelledDesc(myCancelled, settings)
}

function ResolutionBanner({ resolution, isChaser, settings }: ResolutionBannerProps) {
  const {
    chaserPredQuality, evaderPredQuality,
    chaserCancelledSteps, evaderCancelledSteps,
  } = resolution

  const myPredQuality  = isChaser ? chaserPredQuality  : evaderPredQuality
  const oppPredQuality = isChaser ? evaderPredQuality  : chaserPredQuality
  const myCancelled    = isChaser ? chaserCancelledSteps : evaderCancelledSteps
  const oppCancelled   = isChaser ? evaderCancelledSteps : chaserCancelledSteps

  const myLabel  = qualityLabel(myPredQuality)
  const oppLabel = qualityLabel(oppPredQuality)

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-3 text-xs flex flex-col gap-2">
      <p className="text-neutral-400 font-semibold text-center uppercase tracking-wider">Last turn</p>

      {/* My prediction row */}
      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between">
          <span className="text-neutral-500">Your prediction:</span>
          <span className={myLabel.color}>{myLabel.text}</span>
        </div>
        {myPredQuality !== 'none' && (
          <p className="text-neutral-400 text-right">
            {myPredOutcomeText(resolution, isChaser, settings, oppCancelled)}
          </p>
        )}
      </div>

      {/* Opponent prediction row */}
      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between">
          <span className="text-neutral-500">Opp prediction:</span>
          <span className={oppLabel.color}>{oppLabel.text}</span>
        </div>
        {oppPredQuality !== 'none' && (
          <p className="text-neutral-400 text-right">
            {oppPredOutcomeText(resolution, isChaser, settings, myCancelled)}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Planning steps display ─────────────────────────────────────────────────

const PHASE_LABELS: Record<PlanningPhase, string> = {
  move_step1:    'Click your step 1',
  move_step2:    'Click your step 2',
  predict_step1: 'Predict opponent step 1',
  predict_step2: 'Predict opponent step 2',
  bonus_move:    'Pre-commit bonus move',
  ready:         'Ready to confirm',
}

const DEST_PHASE_LABELS: Partial<Record<PlanningPhase, string>> = {
  move_step1:    'Click your destination',
  predict_step1: 'Predict opponent destination',
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
  settings: GameSettings,
  isChaser: boolean,
  planningPhase: PlanningPhase,
): { label: string; done: boolean; active: boolean }[] {
  const isDestMode = settings.predictionTarget === 'destination'
  const useStep2 = settings.moveSteps === 2 && !isDestMode

  const steps: { label: string; done: boolean; active: boolean }[] = [
    { label: isDestMode ? 'Move destination' : 'Move step 1', done: !!draft.moveStep1, active: planningPhase === 'move_step1' },
  ]

  if (useStep2) {
    steps.push({ label: 'Move step 2', done: !!draft.moveStep2, active: planningPhase === 'move_step2' })
  }

  steps.push({ label: isDestMode ? 'Predict opp destination' : 'Predict opp step 1', done: !!draft.predictStep1, active: planningPhase === 'predict_step1' })

  if (useStep2) {
    steps.push({ label: 'Predict opp step 2', done: !!draft.predictStep2, active: planningPhase === 'predict_step2' })
  }

  const needsBonus = settings.predictionOutcome === 'bonus-both'
    || (settings.predictionOutcome === 'freeze-and-bonus' && !isChaser)
  if (needsBonus) {
    steps.push({ label: 'Bonus move (if prediction hits)', done: !!draft.bonusMove, active: planningPhase === 'bonus_move' })
  }

  return steps
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  isChaser: boolean
  turn: number
  draft: DraftPlan
  planningPhase: PlanningPhase
  lastResolution: ResolutionSummary | null
  waitingForPartner: boolean
  settings: GameSettings
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
  settings,
  onConfirm,
  onReset,
}: Props) {
  const steps = buildSteps(draft, settings, isChaser, planningPhase)
  const role = isChaser ? 'Chaser' : 'Evader'
  const roleColor = isChaser ? 'text-red-400' : 'text-blue-400'
  const goal = isChaser
    ? 'Tag the evader (end adjacent)'
    : `Survive ${MAX_TURNS} turns`

  const isComplete = isDraftComplete(draft, settings, isChaser)

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
        <ResolutionBanner resolution={lastResolution} isChaser={isChaser} settings={settings} />
      )}

      {/* Planning steps */}
      <div className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-3 flex flex-col gap-2">
        <p className="text-xs text-neutral-400 font-semibold text-center uppercase tracking-wider mb-1">
          {planningPhase === 'ready'
            ? 'Plan complete'
            : (settings.predictionTarget === 'destination' && DEST_PHASE_LABELS[planningPhase])
              || PHASE_LABELS[planningPhase]}
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
            const plan = draftToTurnPlan(draft, settings, isChaser)
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
