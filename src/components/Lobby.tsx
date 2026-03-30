interface Props {
  onCreateGame: () => void
}

// ── Lobby screen ──────────────────────────────────────────────────────────

export function Lobby({ onCreateGame }: Props) {
  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white font-sans gap-6">
      <h1 className="text-5xl font-bold tracking-tight">Hex Tag</h1>
      <p className="text-neutral-400 text-center max-w-sm leading-relaxed text-sm">
        Two-player tag on a hex grid. Both players secretly pre-commit their full plan
        — moves plus a prediction of what the opponent will do. Correct predictions block
        the opponent's bonus move and trigger your own.
      </p>
      <button
        onClick={onCreateGame}
        className="mt-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-lg transition-colors"
      >
        Create Game
      </button>
    </div>
  )
}
