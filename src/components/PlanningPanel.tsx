import { useMemo, useState } from 'react'
import type { HexCoord, TurnPlan, ResolutionSummary, TurnSchema, UIStep, PowerName } from '../types'
import { getPowerStrategy } from '../lib/powers/PowerFactory'

export interface DraftPlan {
  declaration: HexCoord | null
  moveDest1: HexCoord | null
  moveDest2: HexCoord | null
  predictDest: HexCoord | null
  bonusMove: HexCoord | null
  reactionExecute: boolean | null
  idleConfirmed: boolean | null
}

export function isDraftComplete(draft: DraftPlan, schema: TurnSchema): boolean {
  for (const step of schema.requiredSteps) {
    if (step === 'select_declaration' && !draft.declaration) return false
    if (step === 'select_movement_1' && !draft.moveDest1) return false
    if (step === 'select_movement_2' && !draft.moveDest2) return false
    if (step === 'select_prediction' && !draft.predictDest) return false
    if (step === 'select_bonus' && !draft.bonusMove) return false
    if (step === 'select_reaction' && draft.reactionExecute === null) return false
    if (step === 'idle_confirmation' && !draft.idleConfirmed) return false
  }
  return true
}

export function draftToTurnPlan(draft: DraftPlan, schema: TurnSchema, turn: number, phase: any): TurnPlan | null {
  if (!isDraftComplete(draft, schema)) return null

  // Construct based on schema requirements
  if (schema.requiredSteps.includes('select_declaration')) {
    return { type: 'declaration', declaredDest: draft.declaration!, turn, phase }
  }
  if (schema.requiredSteps.includes('select_reaction')) {
    return { type: 'reaction', executeMove: draft.reactionExecute!, turn, phase }
  }
  if (schema.requiredSteps.includes('idle_confirmation')) {
    return { type: 'idle', moveDest: null, predictDest: draft.predictDest!, bonusMove: draft.bonusMove || undefined, turn, phase }
  }
  if (schema.requiredSteps.includes('select_movement_2')) {
    return { type: 'line', moveDest: [draft.moveDest1!, draft.moveDest2!], predictDest: draft.predictDest!, bonusMove: draft.bonusMove || undefined, turn, phase }
  }

  return {
    type: 'standard',
    moveDest: draft.moveDest1!,
    predictDest: draft.predictDest!,
    bonusMove: draft.bonusMove || undefined,
    turn,
    phase
  }
}

// ── Power info card ───────────────────────────────────────────────────────

interface PowerInfoCardProps {
  powerName: PowerName
  label: string
  accentClass: string
}

function PowerInfoCard({ powerName, label, accentClass }: PowerInfoCardProps) {
  const [expanded, setExpanded] = useState(false)
  const description = useMemo(() => getPowerStrategy(powerName).description, [powerName])

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 text-xs overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-700/30 transition-colors"
      >
        <span className="text-neutral-500 uppercase tracking-wider">{label}</span>
        <span className="flex items-center gap-2">
          <span className={`font-semibold ${accentClass}`}>{powerName}</span>
          <span className="text-neutral-600">{expanded ? '▲' : '▼'}</span>
        </span>
      </button>
      {expanded && (
        <p className="px-3 pb-2 text-neutral-400 leading-relaxed border-t border-neutral-700/60 pt-2">
          {description}
        </p>
      )}
    </div>
  )
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

const DEST_PHASE_LABELS: Record<UIStep | 'ready', string> = {
  select_declaration: 'Declare your destination',
  select_movement_1: 'Click your first destination',
  select_movement_2: 'Click your second destination',
  select_prediction: 'Predict opponent destination',
  select_bonus:      'Pre-commit bonus move',
  select_reaction:   'React to opponent move',
  idle_confirmation: 'Confirm Idle Action',
  ready:             'Ready to confirm',
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
    if (step === 'select_declaration') done = !!draft.declaration
    if (step === 'select_movement_1') done = !!draft.moveDest1
    if (step === 'select_movement_2') done = !!draft.moveDest2
    if (step === 'select_prediction') done = !!draft.predictDest
    if (step === 'select_bonus') done = !!draft.bonusMove
    if (step === 'select_reaction') done = draft.reactionExecute !== null
    if (step === 'idle_confirmation') done = !!draft.idleConfirmed

    return { label: DEST_PHASE_LABELS[step], done, active: currentStep === step }
  })
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  isChaser: boolean
  turn: number
  maxTurns: number
  phase: any
  draft: DraftPlan
  schema: TurnSchema
  currentStep: UIStep | 'ready'
  lastResolution: ResolutionSummary | null
  waitingForPartner: boolean
  myPowerName: PowerName
  oppPowerName: PowerName
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
  myPowerName,
  oppPowerName,
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

      {/* Power info */}
      <div className="flex flex-col gap-1">
        <PowerInfoCard
          powerName={myPowerName}
          label="Your power"
          accentClass={isChaser ? 'text-red-400' : 'text-blue-400'}
        />
        <PowerInfoCard
          powerName={oppPowerName}
          label="Opponent"
          accentClass={isChaser ? 'text-blue-400' : 'text-red-400'}
        />
      </div>

      {/* Last resolution */}
      {lastResolution && (
        <ResolutionBanner resolution={lastResolution} isChaser={isChaser} />
      )}

      {/* Planning steps */}
      <div className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-3 flex flex-col gap-2">
        <p className="text-xs text-neutral-400 font-semibold text-center uppercase tracking-wider mb-1">
          {DEST_PHASE_LABELS[currentStep]}
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
            const plan = draftToTurnPlan(draft, schema, turn, phase)
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
