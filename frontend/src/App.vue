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
    <div v-if="activeTab === 'learn'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- 左：配置 / 答题 / 本组小结 -->
      <div class="bg-gray-900 rounded-xl p-4 flex flex-col items-center gap-4">
        <!-- 配置 -->
        <template v-if="store.phase === 'config'">
          <h3 class="text-purple-300 font-bold text-lg">训练设置</h3>

          <div v-if="store.notice" class="w-full bg-red-900/60 border border-red-600 text-red-200 text-sm rounded-lg p-3 flex justify-between gap-2">
            <span>{{ store.notice.text }}</span>
            <button @click="store.dismissNotice()" class="text-red-300 hover:text-white shrink-0">✕</button>
          </div>

          <div class="w-full space-y-3">
            <div class="flex items-center gap-3">
              <label class="text-sm text-gray-300 w-24 shrink-0">字母范围</label>
              <select v-model="store.draftSettings.startChar"
                class="bg-gray-800 text-white rounded p-2 text-sm">
                <option v-for="c in letters" :key="'s'+c" :value="c">{{ c }}</option>
              </select>
              <span class="text-gray-500">至</span>
              <select v-model="store.draftSettings.endChar"
                class="bg-gray-800 text-white rounded p-2 text-sm">
                <option v-for="c in letters" :key="'e'+c" :value="c">{{ c }}</option>
              </select>
              <span class="text-xs" :class="draftRangeChars.length ? 'text-gray-400' : 'text-red-400'">
                共 {{ draftRangeChars.length }} 个字母
              </span>
            </div>
            <div class="flex items-center gap-3">
              <label class="text-sm text-gray-300 w-24 shrink-0">每组题数</label>
              <input type="number" v-model.number="store.draftSettings.groupSize"
                :min="minSize" :max="maxSize"
                class="bg-gray-800 text-white rounded p-2 text-sm w-24" />
              <span class="text-xs text-gray-400">{{ minSize }}–{{ maxSize }} 题</span>
            </div>
          </div>

          <button @click="store.startTraining()"
            class="bg-purple-500 px-6 py-3 rounded-lg text-lg hover:bg-purple-400">
            开始本组
          </button>

          <div v-if="store.queueList.length" class="w-full border-t border-gray-800 pt-3">
            <div class="text-sm text-gray-400 mb-2">待重练队列（{{ store.queueList.length }}）</div>
            <div class="flex flex-wrap gap-1 mb-3">
              <span v-for="c in store.queueList" :key="c"
                class="bg-red-900/60 text-red-200 text-sm rounded px-2 py-1">{{ c }}</span>
            </div>
            <button @click="store.startRetryRound()"
              class="bg-red-700 px-4 py-2 rounded text-sm hover:bg-red-600">
              只练这些字母
            </button>
          </div>
        </template>

        <!-- 答题中 -->
        <template v-else-if="store.phase === 'active'">
          <div class="w-full flex items-center justify-between">
            <span class="text-xs px-2 py-1 rounded"
              :class="store.mode === 'retry' ? 'bg-red-900/70 text-red-200' : 'bg-purple-900/60 text-purple-200'">
              {{ store.mode === 'retry' ? '重练轮' : '练习轮' }}
            </span>
            <span class="text-sm text-gray-400">
              第 {{ store.roundIdx + 1 }} / {{ store.roundQueue.length }} 题
            </span>
          </div>

          <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div class="h-full bg-purple-500 transition-all"
              :style="{ width: (store.roundIdx / store.roundQueue.length * 100) + '%' }" />
          </div>

          <div class="text-7xl font-bold text-purple-400">{{ store.quizChar }}</div>
          <div class="text-sm text-gray-400">点击下方 6 点阵选择对应盲文</div>
          <div class="grid grid-cols-2 gap-2 p-4 bg-gray-800 rounded-xl">
            <button v-for="d in 6" :key="d" @click="store.toggleDot(d)"
              class="w-14 h-14 rounded-full border-2 transition-all"
              :class="store.selectedDots.includes(d) ? 'bg-purple-500 border-purple-400 scale-110' : 'bg-gray-700 border-gray-600 hover:border-purple-400'">
              <span class="text-xs">{{ d }}</span>
            </button>
          </div>
          <button @click="store.checkQuizAnswer()" class="bg-purple-500 px-6 py-2 rounded hover:bg-purple-400">确认</button>

          <div class="w-full flex items-center justify-between text-sm border-t border-gray-800 pt-3">
            <span class="text-gray-300">
              本组答对 <span class="text-green-400 font-bold">{{ store.roundScore.correct }}</span>
              / {{ store.roundScore.total }} 题
            </span>
            <button @click="store.abortRound()" class="text-gray-500 hover:text-gray-300 text-xs">放弃本组</button>
          </div>

          <div v-if="store.queueList.length" class="w-full">
            <div class="text-xs text-gray-500 mb-1">待重练（{{ store.queueList.length }}）</div>
            <div class="flex flex-wrap gap-1">
              <span v-for="c in store.queueList" :key="c"
                class="bg-red-900/50 text-red-200 text-xs rounded px-2 py-0.5">{{ c }}</span>
            </div>
          </div>
        </template>

        <!-- 本组小结 -->
        <template v-else>
          <h3 class="text-purple-300 font-bold text-lg">本组小结</h3>
          <div v-if="latestSummary" class="w-full space-y-3">
            <span class="inline-block text-xs px-2 py-1 rounded"
              :class="latestSummary.mode === 'retry' ? 'bg-red-900/70 text-red-200' : 'bg-purple-900/60 text-purple-200'">
              {{ latestSummary.mode === 'retry' ? '重练轮' : '练习轮' }}
            </span>
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="bg-gray-800 rounded p-2">
                <div class="text-2xl font-bold">{{ latestSummary.total }}</div>
                <div class="text-xs text-gray-400">本组题数</div>
              </div>
              <div class="bg-gray-800 rounded p-2">
                <div class="text-2xl font-bold text-green-400">{{ latestSummary.correct }}</div>
                <div class="text-xs text-gray-400">答对</div>
              </div>
              <div class="bg-gray-800 rounded p-2">
                <div class="text-2xl font-bold text-purple-400">{{ latestSummary.accuracy }}%</div>
                <div class="text-xs text-gray-400">正确率</div>
              </div>
            </div>

            <div>
              <div class="text-sm text-gray-400 mb-1">最慢的几个字母</div>
              <div v-if="latestSummary.slowest.length" class="space-y-1">
                <div v-for="s in latestSummary.slowest" :key="s.char"
                  class="flex justify-between bg-gray-800 rounded p-2 text-sm">
                  <span class="font-bold text-purple-300">{{ s.char }}</span>
                  <span class="text-gray-400">平均 {{ formatMs(s.avgMs) }} · {{ s.count }} 次</span>
                </div>
              </div>
              <div v-else class="text-sm text-gray-500">暂无数据</div>
            </div>

            <div>
              <div class="text-sm text-gray-400 mb-1">待重练字母</div>
              <div v-if="store.queueList.length" class="flex flex-wrap gap-1">
                <span v-for="c in store.queueList" :key="c"
                  class="bg-red-900/60 text-red-200 text-sm rounded px-2 py-1">{{ c }}</span>
              </div>
              <div v-else class="text-sm text-green-400">全部答对，队列为空 🎉</div>
            </div>

            <div class="flex gap-2 pt-2 border-t border-gray-800">
              <button v-if="store.queueList.length" @click="store.startRetryRound()"
                class="bg-red-700 px-4 py-2 rounded text-sm hover:bg-red-600">
                重练待练字母（{{ store.queueList.length }}）
              </button>
              <button @click="store.nextGroup()"
                class="bg-purple-500 px-4 py-2 rounded text-sm hover:bg-purple-400">下一组</button>
              <button @click="store.backToConfig()"
                class="bg-gray-800 px-4 py-2 rounded text-sm text-gray-300 hover:bg-gray-700">返回设置</button>
            </div>
          </div>
        </template>
      </div>

      <!-- 右：统计 + 历史小结回看 -->
      <div class="bg-gray-900 rounded-xl p-4">
        <div class="flex justify-between mb-2">
          <h3 class="text-purple-300 font-bold">统计</h3>
          <button @click="store.resetScore()" class="text-red-400 text-xs hover:underline">重置</button>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center mb-3">
          <div class="bg-gray-800 rounded p-2">
            <div class="text-2xl font-bold text-green-400">{{ store.score.correct }}</div>
            <div class="text-xs text-gray-400">正确</div>
          </div>
          <div class="bg-gray-800 rounded p-2">
            <div class="text-2xl font-bold text-red-400">{{ store.score.total - store.score.correct }}</div>
            <div class="text-xs text-gray-400">错误</div>
          </div>
          <div class="bg-gray-800 rounded p-2">
            <div class="text-2xl font-bold text-purple-400">{{ store.score.total ? Math.round(store.score.correct / store.score.total * 100) : 0 }}%</div>
            <div class="text-xs text-gray-400">正确率</div>
          </div>
        </div>

        <div class="mb-3">
          <h4 class="text-purple-300 font-bold text-sm mb-2">最近小结（点击回看）</h4>
          <div v-if="store.summaries.length" class="flex flex-col gap-1 mb-2">
            <button v-for="s in store.summaries" :key="s.id" @click="selectedSummaryId = s.id"
              class="flex justify-between items-center bg-gray-800 rounded p-2 text-sm w-full text-left"
              :class="selectedSummary?.id === s.id ? 'ring-1 ring-purple-400' : ''">
              <span>
                <span :class="s.mode === 'retry' ? 'text-red-300' : 'text-purple-300'">
                  {{ s.mode === 'retry' ? '重练' : '练习' }}
                </span>
                <span class="text-gray-400 ml-2">{{ formatTime(s.createdAt) }}</span>
              </span>
              <span class="text-gray-300">{{ s.correct }}/{{ s.total }} · {{ s.accuracy }}%</span>
            </button>
          </div>
          <div v-else class="text-sm text-gray-500">还没有小结，完成一组后会出现在这里</div>

          <div v-if="selectedSummary" class="bg-gray-800/60 rounded-lg p-3 space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">本组条数</span>
              <span>{{ selectedSummary.correct }} 对 / {{ selectedSummary.total }} 题（{{ selectedSummary.accuracy }}%）</span>
            </div>
            <div>
              <div class="text-xs text-gray-500 mb-1">最慢字母</div>
              <div v-if="selectedSummary.slowest.length" class="flex flex-wrap gap-1">
                <span v-for="s in selectedSummary.slowest" :key="s.char"
                  class="bg-gray-700 rounded px-2 py-0.5 text-xs">
                  {{ s.char }} {{ formatMs(s.avgMs) }}
                </span>
              </div>
              <div v-else class="text-xs text-gray-500">无</div>
            </div>
            <div>
              <div class="text-xs text-gray-500 mb-1">本组答错字母</div>
              <div v-if="selectedSummary.wrongChars.length" class="flex flex-wrap gap-1">
                <span v-for="c in selectedSummary.wrongChars" :key="c"
                  class="bg-red-900/50 text-red-200 text-xs rounded px-2 py-0.5">{{ c }}</span>
              </div>
              <div v-else class="text-xs text-green-400">全对</div>
            </div>
          </div>
        </div>

        <div>
          <h4 class="text-purple-300 font-bold text-sm mb-2">最近作答</h4>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            <div v-for="(h, i) in store.history.slice(0, 20)" :key="i"
              class="flex justify-between bg-gray-800 rounded p-2 text-sm"
              :class="h.correct ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'">
              <span>{{ h.char }}</span>
              <span class="text-gray-400 text-xs">{{ formatMs(h.ms) }}</span>
              <span>{{ h.correct ? '✓' : '✗' }}</span>
            </div>
          </div>
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
import { useBrailleStore, ALPHABET, MIN_GROUP_SIZE, MAX_GROUP_SIZE } from './store/braille'
import { BRAILLE_MAP } from './utils/braille'
import BrailleCell from './components/BrailleCell.vue'

const store = useBrailleStore()
const brailleMap = BRAILLE_MAP
const letters = ALPHABET.split('')
const minSize = MIN_GROUP_SIZE
const maxSize = MAX_GROUP_SIZE
const tabs = [
  { id: 'translate', label: '翻译模式' },
  { id: 'learn', label: '训练模式' },
  { id: 'ref', label: '速查表' },
]
const activeTab = ref('translate')

const draftRangeChars = computed(() => {
  const s = ALPHABET.indexOf(store.draftSettings.startChar)
  const e = ALPHABET.indexOf(store.draftSettings.endChar)
  if (s < 0 || e < 0 || s > e) return []
  return ALPHABET.slice(s, e + 1).split('')
})

const latestSummary = computed(() => store.summaries[0] ?? null)

const selectedSummaryId = ref<number | null>(null)
const selectedSummary = computed(
  () => store.summaries.find(s => s.id === selectedSummaryId.value) ?? store.summaries[0] ?? null
)

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
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
