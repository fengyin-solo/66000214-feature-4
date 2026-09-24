# solo-6600021: 盲文翻译与触觉学习器

## 技术栈
- Vue 3 + TypeScript + Vite + Pinia + Tailwind CSS + SVG + Vibration API

## 核心特性
1. **中英文→盲文实时翻译**：Braille Grade 1 编码，Unicode 盲文字符输出
2. **6 点阵 SVG 大尺寸渲染**：可交互点击选择盲文点阵
3. **Vibration API 触觉模拟**：答对/答错不同振动模式
4. **训练模式**：可配置字母范围与每组题数；答错字母自动进入待重练队列，支持只练这些字母；本组结束给出正确率与最慢字母小结（保留最近 10 次回看）；选择、进度与队列自动保存，重开可恢复
5. **速查表**：26 字母 + 数字完整盲文对照
6. **可打印 PDF 导出**：翻译结果导出为文本文件

## 启动
```bash
cd frontend && npm install && npm run dev
```
