export interface BrailleChar {
  char: string
  dots: number[]  // 1-6 active dots
  unicode: string
}

export type LearnMode = 'charToBraille' | 'brailleToChar' | 'dictation'

/** 训练所处的阶段：配置 / 答题中 / 本组结束小结 */
export type TrainPhase = 'config' | 'active' | 'roundEnd'

/** 本轮类型：正常练习 / 待重练队列重练 */
export type TrainMode = 'practice' | 'retry'

/** 单次作答记录（训练区与小结面板共用的唯一数据源） */
export interface QuizRecord {
  char: string
  correct: boolean
  /** 本题用时（毫秒） */
  ms: number
}

/** 小结中“最慢字母”条目 */
export interface SlowChar {
  char: string
  avgMs: number
  count: number
}

/** 一组练习的小结 */
export interface RoundSummary {
  id: number
  mode: TrainMode
  total: number
  correct: number
  accuracy: number
  slowest: SlowChar[]
  wrongChars: string[]
  createdAt: number
}

/** 训练配置：字母范围 + 每组题数 */
export interface TrainSettings {
  startChar: string
  endChar: string
  groupSize: number
}
