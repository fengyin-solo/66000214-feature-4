<template>
  <div class="min-h-screen p-4 flex flex-col gap-4 max-w-6xl mx-auto">
    <h1 class="text-3xl font-bold text-purple-400">盲文翻译与触觉学习器</h1>

    <div class="flex gap-2">
      <button v-for="t in tabs" :key="t.id" @click="activeTab = t.id"
        class="px-4 py-2 rounded text-sm"
        :class="activeTab === t.id ? 'bg-purple-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'">
        {{ t.label }}
      </button>
    </div>

    <!-- Translate -->
    <div v-if="activeTab === 'translate'" class="grid grid-cols-2 gap-4">
      <div class="bg-gray-900 rounded-xl p-4">
        <h3 class="text-purple-300 font-bold mb-2">文本输入</h3>
        <textarea v-model="store.inputText" @input="store.translate()"
          class="w-full h-32 bg-gray-800 rounded p-3 text-white resize-none" placeholder="输入英文文本..." />
      </div>
      <div class="bg-gray-900 rounded-xl p-4">
        <h3 class="text-purple-300 font-bold mb-2">盲文输出</h3>
        <div class="text-4xl tracking-wider text-purple-300 h-16">{{ store.brailleUnicode }}</div>
        <div class="flex flex-wrap gap-2 mt-3">
          <BrailleCell v-for="(dots, i) in store.brailleOutput" :key="i" :dots="dots" :size="40" />
        </div>
      </div>
    </div>

    <!-- Learn -->
    <div v-if="activeTab === 'learn'" class="grid grid-cols-2 gap-4">
      <!-- 左侧：配置 / 答题 / 小结 -->
      <div class="bg-gray-900 rounded-xl p-4 flex flex-col items-center gap-4">
        <h3 class="text-purple-300 font-bold self-start">猜盲文</h3>

        <div v-if="store.notice"
          class="w-full bg-yellow-900/40 border border-yellow-600 text-yellow-200 text-sm rounded p-2 flex justify-between items-center gap-2">
          <span>{{ store.notice }}</span>
          <button @click="store.clearNotice()" class="text-yellow-400 hover:text-yellow-200">✕</button>
        </div>

        <!-- 配置阶段 -->
        <div v-if="!store.session" class="w-full flex flex-col gap-5 py-2">
          <div class="flex flex-col gap-2">
            <label class="text-sm text-gray-300">练习字母范围</label>
            <div class="flex items-center gap-2">
              <select v-model="rangeStart" class="bg-gray-800 text-white rounded p-2">
                <option v-for="ch in letters" :key="'s'+ch" :value="ch">{{ ch }}</option>
              </select>
              <span class="text-gray-400">至</span>
              <select v-model="rangeEnd" class="bg-gray-800 text-white rounded p-2">
                <option v-for="ch in letters" :key="'e'+ch" :value="ch">{{ ch }}</option>
              </select>
            </div>
            <div class="text-xs text-gray-500">
              当前范围（{{ selectedRange.length }} 个字母）：{{ selectedRange.join(' ') || '空' }}
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm text-gray-300">
              每组题数（{{ MIN_GROUP_SIZE }}–{{ MAX_GROUP_SIZE }}）
            </label>
            <input v-model.number="groupSize" type="number"
              :min="MIN_GROUP_SIZE" :max="MAX_GROUP_SIZE"
              class="bg-gray-800 text-white rounded p-2 w-32" />
          </div>

          <button @click="store.startQuiz()"
            class="bg-purple-500 px-6 py-3 rounded-lg text-lg hover:bg-purple-400 self-start">
            开始训练
          </button>
        </div>

        <!-- 答题阶段 -->
        <template v-else-if="store.session.phase !== 'summary'">
          <div class="w-full flex justify-between text-sm text-gray-400">
            <span>{{ store.session.round === 'review' ? '重练轮' : '本轮' }}
              第 {{ store.session.index + 1 }} / {{ store.session.queue.length }} 题</span>
            <span>已答 {{ store.currentRecords.length }} 条</span>
          </div>

          <!-- 提问 -->
          <template v-if="store.session.phase === 'asking'">
            <div class="text-7xl font-bold text-purple-400">{{ store.session.currentChar }}</div>
            <div class="text-sm text-gray-400">点击下方 6 点阵选择对应盲文</div>
          </template>

          <!-- 反馈 -->
          <template v-else>
            <div class="text-6xl font-bold" :class="store.session.feedback?.correct ? 'text-green-400' : 'text-red-400'">
              {{ store.session.feedback?.correct ? '✓ 答对了' : '✗ 答错了' }}
            </div>
            <div class="flex items-center gap-4">
              <div class="flex flex-col items-center">
                <div class="text-4xl font-bold text-purple-400">{{ store.session.currentChar }}</div>
                <BrailleCell :dots="correctDots" :size="56" />
                <div class="text-xs text-gray-500">正确：{{ correctDots.join(',') || '空' }}</div>
              </div>
              <div v-if="!store.session.feedback?.correct" class="flex flex-col items-center">
                <div class="text-4xl font-bold text-gray-500">?</div>
                <BrailleCell :dots="store.session.selectedDots" :size="56" />
                <div class="text-xs text-gray-500">你的：{{ [...store.session.selectedDots].sort((a,b)=>a-b).join(',') || '空' }}</div>
              </div>
            </div>
            <div class="text-xs text-gray-500">用时 {{ formatDuration(store.session.feedback?.durationMs ?? 0) }}</div>
          </template>

          <div class="grid grid-cols-2 gap-2 p-4 bg-gray-800 rounded-xl">
            <button v-for="d in 6" :key="d" @click="store.toggleDot(d)"
              :disabled="store.session.phase !== 'asking'"
              class="w-14 h-14 rounded-full border-2 transition-all disabled:opacity-60"
              :class="store.session.selectedDots.includes(d) ? 'bg-purple-500 border-purple-400 scale-110' : 'bg-gray-700 border-gray-600 hover:border-purple-400'">
              <span class="text-xs">{{ d }}</span>
            </button>
          </div>

          <button v-if="store.session.phase === 'asking'" @click="store.checkQuizAnswer()"
            class="bg-purple-500 px-6 py-2 rounded hover:bg-purple-400">确认</button>
          <button v-else @click="store.nextQuestion()"
            class="bg-purple-500 px-6 py-2 rounded hover:bg-purple-400">
            {{ store.session.index + 1 >= store.session.queue.length ? '查看小结' : '下一题' }}
          </button>

          <button @click="store.endQuiz()" class="text-xs text-gray-500 hover:underline">
            结束本组并回到设置
          </button>
        </template>

        <!-- 小结阶段 -->
        <div v-else class="w-full flex flex-col gap-4 py-2">
          <div class="flex items-center justify-between">
            <h4 class="text-lg font-bold text-purple-300">
              {{ store.session.round === 'review' ? '重练轮小结' : '本组小结' }}
            </h4>
            <span class="text-xs text-gray-500">{{ formatTime(store.latestSummary?.completedAt ?? Date.now()) }}</span>
          </div>

          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="bg-gray-800 rounded p-2">
              <div class="text-2xl font-bold text-purple-400">{{ store.currentRecords.length }}</div>
              <div class="text-xs text-gray-400">本组条数</div>
            </div>
            <div class="bg-gray-800 rounded p-2">
              <div class="text-2xl font-bold text-green-400">{{ store.currentCorrect }}</div>
              <div class="text-xs text-gray-400">答对</div>
            </div>
            <div class="bg-gray-800 rounded p-2">
              <div class="text-2xl font-bold text-yellow-400">{{ store.currentAccuracy }}%</div>
              <div class="text-xs text-gray-400">正确率</div>
            </div>
          </div>

          <div>
            <div class="text-sm text-gray-300 mb-1">最慢的几个字母</div>
            <div v-if="store.currentSlowest.length" class="flex flex-wrap gap-2">
              <span v-for="s in store.currentSlowest" :key="s.char"
                class="bg-gray-800 rounded px-2 py-1 text-sm">
                <span class="text-purple-400 font-bold">{{ s.char }}</span>
                <span class="text-gray-500 ml-1">{{ formatDuration(s.durationMs) }}</span>
              </span>
            </div>
            <div v-else class="text-xs text-gray-500">暂无记录</div>
          </div>

          <div>
            <div class="text-sm text-gray-300 mb-1">
              待重练字母（{{ store.retryQueue.length }}）
            </div>
            <div v-if="store.retryQueue.length" class="flex flex-wrap gap-2">
              <span v-for="ch in store.retryQueue" :key="ch"
                class="bg-red-900/50 border border-red-700 rounded px-2 py-1 text-sm text-red-200">{{ ch }}</span>
            </div>
            <div v-else class="text-sm text-green-400">🎉 全部掌握，没有待重练字母</div>
          </div>

          <div class="flex flex-wrap gap-2 pt-2">
            <button v-if="store.retryQueue.length" @click="store.startReview()"
              class="bg-red-600 px-4 py-2 rounded hover:bg-red-500 text-sm">
              重练这些字母（{{ store.retryQueue.length }}）
            </button>
            <button @click="store.nextGroup()"
              class="bg-purple-500 px-4 py-2 rounded hover:bg-purple-400 text-sm">下一组</button>
            <button @click="store.endQuiz()"
              class="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600 text-sm">回到设置</button>
          </div>
        </div>
      </div>

      <!-- 右侧：进度 / 实时数据 / 历史小结 -->
      <div class="flex flex-col gap-4">
        <div class="bg-gray-900 rounded-xl p-4">
          <h3 class="text-purple-300 font-bold mb-2">训练进度</h3>
          <div v-if="store.session">
            <div class="text-sm text-gray-400 mb-2">
              {{ store.session.round === 'review' ? '重练轮' : '正常轮' }}：
              {{ store.session.phase === 'summary'
                ? `已完成 ${store.session.queue.length} / ${store.session.queue.length} 题`
                : `已答 ${store.currentRecords.length} / ${store.session.queue.length} 题` }}
            </div>
            <div class="grid grid-cols-3 gap-2 text-center mb-3">
              <div class="bg-gray-800 rounded p-2">
                <div class="text-2xl font-bold text-purple-400">{{ store.currentRecords.length }}</div>
                <div class="text-xs text-gray-400">条数</div>
              </div>
              <div class="bg-gray-800 rounded p-2">
                <div class="text-2xl font-bold text-green-400">{{ store.currentCorrect }}</div>
                <div class="text-xs text-gray-400">答对</div>
              </div>
              <div class="bg-gray-800 rounded p-2">
                <div class="text-2xl font-bold text-yellow-400">{{ store.currentAccuracy }}%</div>
                <div class="text-xs text-gray-400">正确率</div>
              </div>
            </div>
            <div class="text-sm text-gray-300 mb-1">待重练队列（{{ store.retryQueue.length }}）</div>
            <div class="flex flex-wrap gap-1 min-h-[1.75rem]">
              <span v-for="ch in store.retryQueue" :key="'q'+ch"
                class="bg-red-900/50 border border-red-700 rounded px-2 py-0.5 text-xs text-red-200">{{ ch }}</span>
              <span v-if="!store.retryQueue.length" class="text-xs text-gray-600">暂无</span>
            </div>
          </div>
          <div v-else class="text-sm text-gray-500">尚未开始训练。上次选择的范围与题数会自动记住。</div>
        </div>

        <div class="bg-gray-900 rounded-xl p-4 flex-1">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-purple-300 font-bold">小结</h3>
            <button v-if="store.summaries.length" @click="store.clearSummaries()"
              class="text-red-400 text-xs hover:underline">清空小结</button>
          </div>

          <!-- 正在回看某次历史小结 -->
          <div v-if="store.viewingSummary" class="mb-3 bg-gray-800 rounded p-3 flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <span class="text-sm font-bold text-purple-300">
                {{ store.viewingSummary.round === 'review' ? '重练轮' : '正常轮' }}小结
              </span>
              <button @click="store.closeSummaryView()" class="text-xs text-gray-400 hover:text-white">关闭回看 ✕</button>
            </div>
            <div class="text-xs text-gray-500">{{ formatTime(store.viewingSummary.completedAt) }}</div>
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="bg-gray-900 rounded p-2">
                <div class="text-xl font-bold text-purple-400">{{ store.viewingSummary.size }}</div>
                <div class="text-xs text-gray-400">条数</div>
              </div>
              <div class="bg-gray-900 rounded p-2">
                <div class="text-xl font-bold text-green-400">{{ store.viewingSummary.correctCount }}</div>
                <div class="text-xs text-gray-400">答对</div>
              </div>
              <div class="bg-gray-900 rounded p-2">
                <div class="text-xl font-bold text-yellow-400">{{ store.viewingSummary.accuracy }}%</div>
                <div class="text-xs text-gray-400">正确率</div>
              </div>
            </div>
            <div class="text-xs text-gray-400">最慢：
              <span v-if="store.viewingSummary.slowest.length">
                <span v-for="(s, i) in store.viewingSummary.slowest" :key="s.char">
                  {{ s.char }}({{ formatDuration(s.durationMs) }}){{ i < store.viewingSummary.slowest.length - 1 ? '、' : '' }}
                </span>
              </span>
              <span v-else>无</span>
            </div>
            <div class="text-xs text-gray-400">待重练：
              <span v-if="store.viewingSummary.retryQueue.length">{{ store.viewingSummary.retryQueue.join(' ') }}</span>
              <span v-else class="text-green-400">无</span>
            </div>
          </div>

          <div v-if="store.summaries.length" class="space-y-1">
            <button v-for="s in store.summaries" :key="s.id" @click="store.viewSummary(s.id)"
              class="w-full flex justify-between items-center bg-gray-800 hover:bg-gray-700 rounded p-2 text-sm text-left"
              :class="{ 'ring-1 ring-purple-500': store.viewingSummaryId === s.id }">
              <span>
                <span class="text-gray-400 mr-2">{{ formatTime(s.completedAt) }}</span>
                <span :class="s.round === 'review' ? 'text-red-300' : 'text-purple-300'">
                  {{ s.round === 'review' ? '重练' : '本轮' }}
                </span>
                <span class="text-gray-400 ml-2">{{ s.correctCount }}/{{ s.size }} 条</span>
              </span>
              <span :class="s.accuracy === 100 ? 'text-green-400' : 'text-yellow-400'">{{ s.accuracy }}%</span>
            </button>
          </div>
          <div v-else class="text-sm text-gray-500">完成一组后会在这里看到小结，最近 {{ MAX_SUMMARIES }} 次可回看。</div>
        </div>
      </div>
    </div>

    <!-- Reference -->
    <div v-if="activeTab === 'ref'" class="bg-gray-900 rounded-xl p-4">
      <h3 class="text-purple-300 font-bold mb-3">盲文速查表</h3>
      <div class="grid grid-cols-6 md:grid-cols-9 gap-3">
        <div v-for="(dots, char) in brailleMap" :key="char" class="flex flex-col items-center">
          <div class="text-xl font-bold text-purple-400">{{ char }}</div>
          <BrailleCell :dots="dots" :size="30" />
          <div class="text-xs text-gray-500">{{ dots.join(',') }}</div>
        </div>
      </div>
    </div>

    <button @click="doExport" class="bg-green-700 px-4 py-2 rounded self-start hover:bg-green-600 text-sm">
      导出翻译文本
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useBrailleStore, rangeLetters, MIN_GROUP_SIZE, MAX_GROUP_SIZE, MAX_SUMMARIES } from './store/braille'
import { BRAILLE_MAP } from './utils/braille'
import BrailleCell from './components/BrailleCell.vue'

const store = useBrailleStore()
const brailleMap = BRAILLE_MAP
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const tabs = [
  { id: 'translate', label: '翻译模式' },
  { id: 'learn', label: '训练模式' },
  { id: 'ref', label: '速查表' },
]
const activeTab = ref('translate')

// 配置表单与 store.config 双向绑定（Pinia 会解包 ref，直接操作 store.config）
const rangeStart = computed({
  get: () => store.config.rangeStart,
  set: v => { store.config.rangeStart = v },
})
const rangeEnd = computed({
  get: () => store.config.rangeEnd,
  set: v => { store.config.rangeEnd = v },
})
const groupSize = computed({
  get: () => store.config.groupSize,
  set: v => { store.config.groupSize = Number(v) },
})

const selectedRange = computed(() => rangeLetters(rangeStart.value, rangeEnd.value))

const correctDots = computed(() => BRAILLE_MAP[store.session?.currentChar ?? ''] ?? [])

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} 秒` : `${Math.round(ms)} 毫秒`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function doExport() {
  const text = store.exportPDF()
  const blob = new Blob([text], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'braille-output.txt'
  a.click()
}
</script>
