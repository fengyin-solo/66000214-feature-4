import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { BRAILLE_MAP, dotsToUnicode } from '../utils/braille'
import type {
  LearnMode, TrainPhase, TrainMode, TrainSettings,
  QuizRecord, SlowChar, RoundSummary,
} from '../types'

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const DEFAULT_SETTINGS: TrainSettings = { startChar: 'A', endChar: 'Z', groupSize: 10 }
export const MIN_GROUP_SIZE = 1
export const MAX_GROUP_SIZE = 50
export const MAX_SUMMARIES = 10
const STORAGE_KEY = 'braille-train-v1'

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function isLetter(c: unknown): c is string {
  return typeof c === 'string' && ALPHABET.includes(c)
}

function isRecord(v: unknown): v is QuizRecord {
  const r = v as Record<string, unknown>
  return !!r && isLetter(r.char) && typeof r.correct === 'boolean' && typeof r.ms === 'number'
}

function isSummary(v: unknown): v is RoundSummary {
  const s = v as Record<string, unknown>
  if (!s || typeof s.total !== 'number' || typeof s.correct !== 'number') return false
  if (s.mode !== 'practice' && s.mode !== 'retry') return false
  if (typeof s.accuracy !== 'number' || typeof s.createdAt !== 'number') return false
  return Array.isArray(s.slowest) && Array.isArray(s.wrongChars)
}

/** 校验配置；合法返回 null，否则返回中文提示语 */
export function validateSettings(s: TrainSettings): string | null {
  const charsOk = isLetter(s.startChar) && isLetter(s.endChar)
  if (!charsOk) return '字母范围无效，已恢复默认范围 A–Z'
  const start = ALPHABET.indexOf(s.startChar)
  const end = ALPHABET.indexOf(s.endChar)
  if (start > end) return '字母范围为空（起始字母晚于结束字母），已恢复默认范围 A–Z'
  if (!Number.isInteger(s.groupSize) || s.groupSize < MIN_GROUP_SIZE || s.groupSize > MAX_GROUP_SIZE) {
    return `每组题数需为 ${MIN_GROUP_SIZE}–${MAX_GROUP_SIZE} 之间的整数，已恢复默认值 ${DEFAULT_SETTINGS.groupSize}`
  }
  return null
}

export const useBrailleStore = defineStore('braille', () => {
  // —— 翻译模式 ——
  const inputText = ref('')
  const brailleOutput = ref<number[][]>([])
  const learnMode = ref<LearnMode>('charToBraille')

  // —— 训练配置（跨会话保留） ——
  const settings = ref<TrainSettings>({ ...DEFAULT_SETTINGS })
  /** 配置屏上的草稿值（开始时才提交到 settings） */
  const draftSettings = ref<TrainSettings>({ ...DEFAULT_SETTINGS })
  const notice = ref<{ type: 'error' | 'info'; text: string } | null>(null)

  // —— 本轮会话状态（重开训练屏时恢复） ——
  const phase = ref<TrainPhase>('config')
  const mode = ref<TrainMode>('practice')
  const quizChar = ref('')
  const selectedDots = ref<number[]>([])
  const questionStartAt = ref(0)
  const roundQueue = ref<string[]>([])
  const roundIdx = ref(0)
  const roundRecords = ref<QuizRecord[]>([])
  /** 答错字母待重练队列（去重） */
  const retryQueue = ref<string[]>([])

  // —— 累计统计与历史小结 ——
  const history = ref<QuizRecord[]>([])
  const summaries = ref<RoundSummary[]>([])

  const brailleUnicode = computed(() =>
    brailleOutput.value.map(d => dotsToUnicode(d)).join('')
  )

  /** 当前配置覆盖到的字母列表 */
  const rangeChars = computed(() => {
    const start = ALPHABET.indexOf(settings.value.startChar)
    const end = ALPHABET.indexOf(settings.value.endChar)
    if (start < 0 || end < 0 || start > end) return []
    return ALPHABET.slice(start, end + 1).split('')
  })

  /** 本组实时进度 */
  const roundScore = computed(() => {
    const correct = roundRecords.value.filter(r => r.correct).length
    return { correct, total: roundRecords.value.length }
  })

  /** 累计条数：训练区与小结/统计面板共用，保证两边看到的条数一致 */
  const score = computed(() => {
    const correct = history.value.filter(r => r.correct).length
    return { correct, total: history.value.length }
  })

  const queueList = computed(() => retryQueue.value)

  function translate() {
    brailleOutput.value = inputText.value
      .toUpperCase()
      .split('')
      .map(c => BRAILLE_MAP[c] || [])
  }

  function reverseTranslate() {
    for (const [char, d] of Object.entries(BRAILLE_MAP)) {
      if (JSON.stringify([...d].sort()) === JSON.stringify([...selectedDots.value].sort())) return char
    }
    return '?'
  }

  // —— 配置与流程控制 ——

  function dismissNotice() {
    notice.value = null
  }

  /** 开始前校验选择；非法时提示并回到默认值 */
  function startTraining() {
    const err = validateSettings(draftSettings.value)
    if (err) {
      settings.value = { ...DEFAULT_SETTINGS }
      draftSettings.value = { ...DEFAULT_SETTINGS }
      notice.value = { type: 'error', text: err }
      return
    }
    settings.value = { ...draftSettings.value }
    startPracticeRound()
  }

  function startPracticeRound() {
    const pool = rangeChars.value
    if (!pool.length) {
      settings.value = { ...DEFAULT_SETTINGS }
      draftSettings.value = { ...DEFAULT_SETTINGS }
      notice.value = { type: 'error', text: '字母范围为空，已恢复默认范围 A–Z' }
      return
    }
    mode.value = 'practice'
    retryQueue.value = []
    roundRecords.value = []
    roundIdx.value = 0
    roundQueue.value = Array.from({ length: settings.value.groupSize }, () =>
      pool[Math.floor(Math.random() * pool.length)]
    )
    phase.value = 'active'
    presentQuestion()
  }

  function startRetryRound() {
    if (!retryQueue.value.length) return
    mode.value = 'retry'
    roundRecords.value = []
    roundIdx.value = 0
    roundQueue.value = shuffle(retryQueue.value)
    phase.value = 'active'
    presentQuestion()
  }

  function nextGroup() {
    startPracticeRound()
  }

  function backToConfig() {
    phase.value = 'config'
    quizChar.value = ''
    selectedDots.value = []
    roundQueue.value = []
    roundIdx.value = 0
    roundRecords.value = []
  }

  /** 答题中途放弃本组：已答错的字母仍留在重练队列里 */
  function abortRound() {
    backToConfig()
  }

  function presentQuestion() {
    quizChar.value = roundQueue.value[roundIdx.value] ?? ''
    selectedDots.value = []
    questionStartAt.value = Date.now()
  }

  function nextQuestion() {
    roundIdx.value += 1
    if (roundIdx.value >= roundQueue.value.length) {
      finishRound()
    } else {
      presentQuestion()
    }
  }

  function toggleDot(dot: number) {
    const idx = selectedDots.value.indexOf(dot)
    if (idx >= 0) selectedDots.value.splice(idx, 1)
    else selectedDots.value.push(dot)
  }

  function checkQuizAnswer() {
    if (phase.value !== 'active' || !quizChar.value) return
    const expected = [...(BRAILLE_MAP[quizChar.value] || [])].sort()
    const correct = JSON.stringify([...selectedDots.value].sort()) === JSON.stringify(expected)
    const ms = Math.max(0, Date.now() - questionStartAt.value)
    const record: QuizRecord = { char: quizChar.value, correct, ms }

    roundRecords.value.push(record)
    history.value.unshift(record)
    if (history.value.length > 500) history.value.length = 500

    if (mode.value === 'retry') {
      // 重练轮：答对移出队列，答错继续留下
      const q = retryQueue.value.indexOf(quizChar.value)
      if (correct) {
        if (q >= 0) retryQueue.value.splice(q, 1)
      } else if (q < 0) {
        retryQueue.value.push(quizChar.value)
      }
    } else if (!correct && !retryQueue.value.includes(quizChar.value)) {
      retryQueue.value.push(quizChar.value)
    }

    if (navigator.vibrate) navigator.vibrate(correct ? 100 : [100, 50, 100])
    nextQuestion()
  }

  function buildSlowest(records: QuizRecord[]): SlowChar[] {
    const agg = new Map<string, { total: number; count: number }>()
    for (const r of records) {
      const cur = agg.get(r.char) ?? { total: 0, count: 0 }
      cur.total += r.ms
      cur.count += 1
      agg.set(r.char, cur)
    }
    return [...agg.entries()]
      .map(([char, v]) => ({ char, avgMs: Math.round(v.total / v.count), count: v.count }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 3)
  }

  function finishRound() {
    const records = roundRecords.value
    const correct = records.filter(r => r.correct).length
    const wrongChars = [...new Set(records.filter(r => !r.correct).map(r => r.char))]
    const summary: RoundSummary = {
      id: Date.now(),
      mode: mode.value,
      total: records.length,
      correct,
      accuracy: records.length ? Math.round((correct / records.length) * 100) : 0,
      slowest: buildSlowest(records),
      wrongChars,
      createdAt: Date.now(),
    }
    summaries.value.unshift(summary)
    if (summaries.value.length > MAX_SUMMARIES) summaries.value.length = MAX_SUMMARIES
    phase.value = 'roundEnd'
    quizChar.value = ''
    selectedDots.value = []
  }

  function resetScore() {
    history.value = []
  }

  function exportPDF(): string {
    const lines = inputText.value.toUpperCase().split('')
    let out = '盲文翻译输出\n\n'
    for (const ch of lines) {
      const dots = BRAILLE_MAP[ch] || []
      out += `${ch} → [${dots.join(',')}] ${dotsToUnicode(dots)}\n`
    }
    return out
  }

  // —— 持久化：选择、进度、答对条数、待重练队列、小结全部恢复 ——

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        settings: settings.value,
        phase: phase.value,
        mode: mode.value,
        quizChar: quizChar.value,
        selectedDots: selectedDots.value,
        roundQueue: roundQueue.value,
        roundIdx: roundIdx.value,
        roundRecords: roundRecords.value,
        retryQueue: retryQueue.value,
        history: history.value,
        summaries: summaries.value,
      }))
    } catch {
      // localStorage 不可用时静默降级为内存态
    }
  }

  function loadState() {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(STORAGE_KEY)
    } catch {
      return
    }
    if (!raw) return
    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }

    const savedSettings = data.settings as TrainSettings
    if (savedSettings && validateSettings(savedSettings) === null) {
      settings.value = { ...savedSettings }
      draftSettings.value = { ...savedSettings }
    } else {
      settings.value = { ...DEFAULT_SETTINGS }
      draftSettings.value = { ...DEFAULT_SETTINGS }
      notice.value = {
        type: 'error',
        text: validateSettings(savedSettings ?? { ...DEFAULT_SETTINGS }) ?? '上次的训练选择无效，已恢复默认值',
      }
    }

    history.value = Array.isArray(data.history) ? (data.history as unknown[]).filter(isRecord) as QuizRecord[] : []
    summaries.value = Array.isArray(data.summaries)
      ? (data.summaries as unknown[]).filter(isSummary) as RoundSummary[]
      : []

    const savedPhase = data.phase
    if (savedPhase !== 'active' && savedPhase !== 'roundEnd') return

    const queue = Array.isArray(data.roundQueue)
      ? (data.roundQueue as unknown[]).filter(isLetter)
      : []
    const records = Array.isArray(data.roundRecords)
      ? (data.roundRecords as unknown[]).filter(isRecord) as QuizRecord[]
      : []
    const queueLetters = Array.isArray(data.retryQueue)
      ? [...new Set((data.retryQueue as unknown[]).filter(isLetter))]
      : []

    if (savedPhase === 'active') {
      // 进行中的会话要求队列/当前题完整，否则视为损坏直接回到配置
      const idx = typeof data.roundIdx === 'number' ? data.roundIdx : -1
      const current = data.quizChar
      if (!queue.length || !isLetter(current) || idx < 0 || idx >= queue.length) {
        phase.value = 'config'
        retryQueue.value = queueLetters
        return
      }
      phase.value = 'active'
      mode.value = data.mode === 'retry' ? 'retry' : 'practice'
      roundQueue.value = queue
      roundIdx.value = idx
      roundRecords.value = records.slice(0, idx)
      retryQueue.value = queueLetters
      quizChar.value = current
      selectedDots.value = []
      questionStartAt.value = Date.now() // 重开后当前题重新计时
    } else {
      phase.value = 'roundEnd'
      mode.value = data.mode === 'retry' ? 'retry' : 'practice'
      roundRecords.value = records
      retryQueue.value = queueLetters
      quizChar.value = ''
      selectedDots.value = []
    }
  }

  loadState()

  watch(
    [settings, phase, mode, quizChar, selectedDots, roundQueue, roundIdx, roundRecords, retryQueue, history, summaries],
    saveState,
    { deep: true }
  )

  return {
    // 翻译
    inputText, brailleOutput, learnMode, brailleUnicode, translate, reverseTranslate, exportPDF,
    // 配置
    settings, draftSettings, notice, dismissNotice, startTraining,
    rangeChars, validateSettings,
    // 会话
    phase, mode, quizChar, selectedDots, roundQueue, roundIdx, roundRecords, roundScore,
    retryQueue, queueList, toggleDot, checkQuizAnswer,
    startPracticeRound, startRetryRound, nextGroup, backToConfig, abortRound,
    // 统计 / 小结
    score, history, summaries, resetScore,
  }
})
