import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { BRAILLE_MAP, textToBraille, brailleToText, dotsToUnicode } from '../utils/braille'
import type {
  LearnMode, QuizConfig, QuizRecord, QuizPhase, QuizRound,
  GroupSummary, SlowChar, QuizSession,
} from '../types'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const MIN_GROUP_SIZE = 5
export const MAX_GROUP_SIZE = 50
export const MAX_SUMMARIES = 5
export const SLOWEST_COUNT = 3

const DEFAULT_CONFIG: QuizConfig = { rangeStart: 'A', rangeEnd: 'Z', groupSize: 10 }

const CONFIG_KEY = 'braille-quiz-config'
const SESSION_KEY = 'braille-quiz-session'
const SUMMARIES_KEY = 'braille-quiz-summaries'

function parseJSON<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// 返回清洗后的配置；问题类型（空范围 / 超上限）通过 issue 返回，用于提示
function sanitizeConfig(raw: unknown): { config: QuizConfig; issue: 'empty-range' | 'group-size' | null } {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<QuizConfig>
  const letters = typeof c.rangeStart === 'string' && typeof c.rangeEnd === 'string'
    ? rangeLetters(c.rangeStart, c.rangeEnd)
    : []
  const size = typeof c.groupSize === 'number' && Number.isInteger(c.groupSize) ? c.groupSize : NaN

  let issue: 'empty-range' | 'group-size' | null = null
  if (letters.length === 0) issue = 'empty-range'
  if (!(size >= MIN_GROUP_SIZE && size <= MAX_GROUP_SIZE)) {
    issue = issue || 'group-size'
  }
  return {
    config: issue ? { ...DEFAULT_CONFIG } : { rangeStart: c.rangeStart as string, rangeEnd: c.rangeEnd as string, groupSize: size },
    issue,
  }
}

export function rangeLetters(start: string, end: string): string[] {
  const a = ALPHABET.indexOf(start.toUpperCase())
  const b = ALPHABET.indexOf(end.toUpperCase())
  if (a < 0 || b < 0 || a > b) return []
  return ALPHABET.slice(a, b + 1).split('')
}

function loadConfig(): { config: QuizConfig; issue: 'empty-range' | 'group-size' | null } {
  const raw = parseJSON<unknown>(localStorage.getItem(CONFIG_KEY))
  if (raw === null) return { config: { ...DEFAULT_CONFIG }, issue: null }
  return sanitizeConfig(raw)
}

function restoreSession(): QuizSession | null {
  const s = parseJSON<QuizSession>(localStorage.getItem(SESSION_KEY))
  if (!s || typeof s !== 'object') return null
  const { config, issue } = sanitizeConfig(s.config)
  if (issue) return null
  if (!Array.isArray(s.queue) || !s.queue.length) return null
  if (typeof s.index !== 'number' || s.index < 0 || s.index > s.queue.length) return null
  if (!['idle', 'asking', 'feedback', 'summary'].includes(s.phase)) return null
  if (!['main', 'review'].includes(s.round)) return null

  const records = Array.isArray(s.records)
    ? s.records.filter(r => r && typeof r.char === 'string'
      && typeof r.correct === 'boolean' && typeof r.durationMs === 'number')
    : []
  const retryQueue = Array.isArray(s.retryQueue)
    ? s.retryQueue.filter(ch => typeof ch === 'string' && ALPHABET.includes(ch))
    : []
  const queue = s.queue.filter(ch => typeof ch === 'string' && ALPHABET.includes(ch))
  if (!queue.length) return null

  const phase: QuizPhase = s.phase === 'feedback'
    // 离开期间反馈计时已失真，退回提问态并重新计时
    ? 'asking'
    : (s.phase as QuizPhase)
  const feedback = phase === 'feedback' && s.feedback
    ? s.feedback
    : null

  return {
    config,
    phase,
    round: s.round as QuizRound,
    queue,
    index: Math.min(s.index, queue.length - 1),
    currentChar: typeof s.currentChar === 'string' && ALPHABET.includes(s.currentChar)
      ? s.currentChar
      : queue[Math.min(s.index, queue.length - 1)],
    selectedDots: phase === 'asking' && Array.isArray(s.selectedDots)
      ? s.selectedDots.filter(d => d >= 1 && d <= 6)
      : [],
    records,
    retryQueue: [...new Set(retryQueue)],
    feedback,
    questionStartedAt: Date.now(),
  }
}

function loadSummaries(): GroupSummary[] {
  const list = parseJSON<GroupSummary[]>(localStorage.getItem(SUMMARIES_KEY))
  if (!Array.isArray(list)) return []
  return list.filter(s => s && typeof s.id === 'number'
    && typeof s.size === 'number' && typeof s.correctCount === 'number')
    .slice(0, MAX_SUMMARIES)
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const useBrailleStore = defineStore('braille', () => {
  const inputText = ref('')
  const brailleOutput = ref<number[][]>([])
  const learnMode = ref<LearnMode>('charToBraille')

  // ---- 训练状态 ----
  const initial = loadConfig()
  const config = ref<QuizConfig>(initial.config)
  const notice = ref<string | null>(initial.issue
    ? (initial.issue === 'empty-range'
      ? '上次保存的字母范围为空，已恢复为默认范围 A–Z。'
      : `上次保存的每组题数超出 ${MIN_GROUP_SIZE}–${MAX_GROUP_SIZE}，已恢复为默认每组 ${DEFAULT_CONFIG.groupSize} 题。`)
    : null)
  const session = ref<QuizSession | null>(restoreSession())
  const summaries = ref<GroupSummary[]>(loadSummaries())
  const viewingSummaryId = ref<number | null>(null)

  const brailleUnicode = computed(() =>
    brailleOutput.value.map(d => dotsToUnicode(d)).join('')
  )

  // 当前轮已答题记录（小结面板与训练屏共用同一数据源，保证条数一致）
  const currentRecords = computed<QuizRecord[]>(() => session.value?.records ?? [])
  const currentCorrect = computed(() => currentRecords.value.filter(r => r.correct).length)
  const currentAccuracy = computed(() =>
    currentRecords.value.length
      ? Math.round(currentCorrect.value / currentRecords.value.length * 100)
      : 0
  )
  const currentSlowest = computed<SlowChar[]>(() =>
    [...currentRecords.value]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, SLOWEST_COUNT)
      .map(r => ({ char: r.char, durationMs: r.durationMs }))
  )
  const retryQueue = computed<string[]>(() => session.value?.retryQueue ?? [])
  const latestSummary = computed<GroupSummary | null>(() =>
    summaries.value.length ? summaries.value[0] : null
  )
  const viewingSummary = computed<GroupSummary | null>(() => {
    if (viewingSummaryId.value == null) return null
    return summaries.value.find(s => s.id === viewingSummaryId.value) ?? null
  })

  function persistSession() {
    if (session.value) localStorage.setItem(SESSION_KEY, JSON.stringify(session.value))
    else localStorage.removeItem(SESSION_KEY)
  }

  function persistSummaries() {
    localStorage.setItem(SUMMARIES_KEY, JSON.stringify(summaries.value))
  }

  function persistConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config.value))
  }

  function translate() {
    brailleOutput.value = textToBraille(inputText.value)
  }

  function reverseTranslate() {
    return brailleToText(session.value?.selectedDots ?? [])
  }

  // 校验配置；不合法时回到默认值并给出提示
  function validateConfig(c: QuizConfig): boolean {
    const { config: clean, issue } = sanitizeConfig(c)
    if (issue) {
      config.value = clean
      persistConfig()
      notice.value = issue === 'empty-range'
        ? '选择的字母范围为空，已恢复为默认范围 A–Z。'
        : `每组题数需在 ${MIN_GROUP_SIZE}–${MAX_GROUP_SIZE} 之间，已恢复为默认每组 ${DEFAULT_CONFIG.groupSize} 题。`
      return false
    }
    config.value = clean
    return true
  }

  function clearNotice() {
    notice.value = null
  }

  function buildMainQueue(c: QuizConfig): string[] {
    const letters = rangeLetters(c.rangeStart, c.rangeEnd)
    const queue: string[] = []
    let prev = ''
    for (let i = 0; i < c.groupSize; i++) {
      let ch = letters[Math.floor(Math.random() * letters.length)]
      let guard = 0
      while (letters.length > 1 && ch === prev && guard++ < 10) {
        ch = letters[Math.floor(Math.random() * letters.length)]
      }
      queue.push(ch)
      prev = ch
    }
    return queue
  }

  function startRound(round: QuizRound, queue: string[], cfg: QuizConfig) {
    session.value = {
      config: cfg,
      phase: 'asking',
      round,
      queue,
      index: 0,
      currentChar: queue[0],
      selectedDots: [],
      records: [],
      retryQueue: round === 'review' ? queue : [],
      feedback: null,
      questionStartedAt: Date.now(),
    }
    persistSession()
  }

  function startQuiz() {
    if (!validateConfig(config.value)) return
    persistConfig()
    startRound('main', buildMainQueue(config.value), { ...config.value })
  }

  function nextGroup() {
    if (!validateConfig(config.value)) return
    persistConfig()
    startRound('main', buildMainQueue(config.value), { ...config.value })
  }

  function startReview() {
    if (!session.value || session.value.retryQueue.length === 0) return
    startRound('review', shuffle([...new Set(session.value.retryQueue)]), { ...session.value.config })
  }

  function endQuiz() {
    session.value = null
    viewingSummaryId.value = null
    persistSession()
  }

  function toggleDot(dot: number) {
    if (!session.value || session.value.phase !== 'asking') return
    const dots = session.value.selectedDots
    const idx = dots.indexOf(dot)
    if (idx >= 0) dots.splice(idx, 1)
    else dots.push(dot)
    persistSession()
  }

  function isAnswerCorrect(char: string, dots: number[]): boolean {
    const target = [...(BRAILLE_MAP[char] || [])].sort().join(',')
    return [...dots].sort().join(',') === target
  }

  function checkQuizAnswer() {
    const s = session.value
    if (!s || s.phase !== 'asking') return
    const durationMs = Date.now() - s.questionStartedAt
    const correct = isAnswerCorrect(s.currentChar, s.selectedDots)

    s.records.push({ char: s.currentChar, correct, durationMs })
    if (!correct) {
      if (!s.retryQueue.includes(s.currentChar)) s.retryQueue.push(s.currentChar)
    } else if (s.round === 'review') {
      // 重练轮：答对即出队；正常轮中同一字母再次答对不抹消此前的答错记录
      const qi = s.retryQueue.indexOf(s.currentChar)
      if (qi >= 0) s.retryQueue.splice(qi, 1)
    }
    s.feedback = { correct, durationMs }
    s.phase = 'feedback'
    if (navigator.vibrate) navigator.vibrate(correct ? 100 : [100, 50, 100])
    persistSession()
  }

  function nextQuestion() {
    const s = session.value
    if (!s || s.phase !== 'feedback') return
    if (s.index + 1 >= s.queue.length) {
      finishRound()
      return
    }
    s.index++
    s.currentChar = s.queue[s.index]
    s.selectedDots = []
    s.feedback = null
    s.phase = 'asking'
    s.questionStartedAt = Date.now()
    persistSession()
  }

  function finishRound() {
    const s = session.value
    if (!s) return
    const records = s.records
    const correctCount = records.filter(r => r.correct).length
    const slowest: SlowChar[] = [...records]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, SLOWEST_COUNT)
      .map(r => ({ char: r.char, durationMs: r.durationMs }))

    const summary: GroupSummary = {
      id: Date.now(),
      round: s.round,
      size: records.length,
      correctCount,
      accuracy: records.length ? Math.round(correctCount / records.length * 100) : 0,
      slowest,
      retryQueue: [...s.retryQueue],
      completedAt: Date.now(),
    }
    summaries.value.unshift(summary)
    summaries.value = summaries.value.slice(0, MAX_SUMMARIES)
    persistSummaries()

    s.phase = 'summary'
    s.feedback = null
    viewingSummaryId.value = summary.id
    persistSession()
  }

  function viewSummary(id: number) {
    viewingSummaryId.value = id
  }

  function closeSummaryView() {
    viewingSummaryId.value = null
  }

  function clearSummaries() {
    summaries.value = []
    viewingSummaryId.value = null
    persistSummaries()
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

  return {
    inputText, brailleOutput, learnMode, brailleUnicode,
    // 训练
    config, session, summaries, notice, viewingSummaryId,
    currentRecords, currentCorrect, currentAccuracy, currentSlowest,
    retryQueue, latestSummary, viewingSummary,
    translate, reverseTranslate, toggleDot,
    validateConfig, clearNotice, startQuiz, nextGroup, startReview,
    endQuiz, checkQuizAnswer, nextQuestion,
    viewSummary, closeSummaryView, clearSummaries,
    exportPDF,
  }
})
