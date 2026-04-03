// slidepal/lib/ai.ts
import { generateText, Output, type LanguageModel } from 'ai'
import { createOllama } from 'ollama-ai-provider'
import { z } from 'zod'

// ── プロバイダー切り替え ────────────────────────────────────
// AI_PROVIDER=ollama  → Ollama ローカル LLM
// AI_PROVIDER=vercel  → Vercel AI Gateway (デフォルト)

function getModel(): LanguageModel {
  const provider = process.env.AI_PROVIDER ?? 'vercel'

  if (provider === 'ollama') {
    const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api'
    const modelName = process.env.LOCAL_LLM_MODEL ?? 'gemma3:4b'
    const ollama = createOllama({ baseURL })
    return ollama(modelName) as unknown as LanguageModel
  }

  const { createGatewayProvider } = require('@ai-sdk/gateway') as typeof import('@ai-sdk/gateway')
  const gateway = createGatewayProvider()
  return gateway(process.env.AI_GATEWAY_MODEL ?? 'anthropic/claude-sonnet-4.6')
}

// ── スキーマ定義 ──────────────────────────────────────────────

const ExplanationSchema = z.object({
  explanation: z.string().describe('用語の定義と背景を日本語で2〜3文'),
  relatedTerms: z.array(z.string()).describe('関連する専門用語のリスト'),
})

export type TermExplanation = z.infer<typeof ExplanationSchema>

const AnalysisSchema = z.object({
  terms: z.array(z.object({
    term: z.string().describe('難解な専門用語'),
    page: z.number().optional().describe('登場ページ番号'),
  })),
  questions: z.array(z.string()).describe('発表者への質問候補'),
})

export type PresentationAnalysis = z.infer<typeof AnalysisSchema>

// ── 関数 ──────────────────────────────────────────────────────

export async function explainTerm(term: string): Promise<TermExplanation> {
  const { output } = await generateText({
    model: getModel(),
    output: Output.object({ schema: ExplanationSchema }),
    system: 'あなたは学術・科学分野の専門用語を分かりやすく説明するアシスタントです。必ず日本語で回答してください。',
    prompt: `次の用語を日本語で説明してください: "${term}"`,
  })
  return output
}

const QUESTION_PROMPTS = {
  progress: '手法選択の根拠、結果の解釈・妥当性、次のステップ、対照実験の有無、予想外の結果への対応',
  journal:  '論文の新規性・貢献、実験デザインの妥当性、限界・批判点、他手法との比較、自分たちの研究への応用可能性',
}

export async function analyzePresentation(
  pdfText: string,
  type: 'progress' | 'journal'
): Promise<PresentationAnalysis> {
  const { output } = await generateText({
    model: getModel(),
    output: Output.object({ schema: AnalysisSchema }),
    system: 'あなたは学術発表のアシスタントです。必ず日本語で回答してください。',
    prompt: `以下の発表テキストを分析してください。
発表タイプ: ${type === 'progress' ? '進捗報告' : '抄読'}
質問観点: ${QUESTION_PROMPTS[type]}

--- 発表テキスト ---
${pdfText.slice(0, 8000)}`,
  })
  return output
}
