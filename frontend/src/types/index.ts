export interface BrailleChar {
  char: string
  dots: number[]  // 1-6 active dots
  unicode: string
}

export type LearnMode = 'charToBraille' | 'brailleToChar' | 'dictation'

export interface QuizConfig {
  rangeStart: string // 字母范围起点，A-Z
  rangeEnd: string   // 字母范围终点，A-Z
  groupSize: number  // 每组题数
}

export interface QuizRecord {
  char: string
  correct: boolean
  durationMs: number
}

export type QuizPhase = 'idle' | 'asking' | 'feedback' | 'summary'
export type QuizRound = 'main' | 'review'

export interface SlowChar {
  char: string
  durationMs: number
}

export interface GroupSummary {
  id: number
  round: QuizRound
  size: number
  correctCount: number
  accuracy: number // 0-100
  slowest: SlowChar[]
  retryQueue: string[]
  completedAt: number
}

export interface QuizSession {
  config: QuizConfig
  phase: QuizPhase
  round: QuizRound
  queue: string[]
  index: number
  currentChar: string
  selectedDots: number[]
  records: QuizRecord[]
  retryQueue: string[]
  feedback: { correct: boolean; durationMs: number } | null
  questionStartedAt: number
}
