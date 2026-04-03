// slidepal/lib/ai.ts
import { generateText, type LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'

// ── プロバイダー切り替え ────────────────────────────────────
// AI_PROVIDER=ollama  → Ollama ローカル LLM (OpenAI互換API経由)
// AI_PROVIDER=vercel  → Vercel AI Gateway (デフォルト)

function getModel(): LanguageModel {
  const provider = process.env.AI_PROVIDER ?? 'vercel'

  if (provider === 'ollama') {
    const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1'
    const modelName = process.env.LOCAL_LLM_MODEL ?? 'gemma4:e4b'
    const ollama = createOpenAI({ baseURL, apiKey: 'ollama' })
    return ollama(modelName)
  }

  const { createGatewayProvider } = require('@ai-sdk/gateway') as typeof import('@ai-sdk/gateway')
  const gateway = createGatewayProvider()
  return gateway(process.env.AI_GATEWAY_MODEL ?? 'anthropic/claude-sonnet-4.6')
}

// Ollama ネイティブ API で JSON Schema を使い構造化出力を強制する
// format に JSON Schema を渡すと Ollama の制約デコーディングが有効になり、
// モデルの命令遵守能力に依存せずスキーマに準拠した出力が保証される
async function ollamaGenerateJson<T>(
  system: string,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const baseURL = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1')
    .replace(/\/v1\/?$/, '')
  const modelName = process.env.LOCAL_LLM_MODEL ?? 'gemma4:e4b'

  const res = await fetch(`${baseURL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      format: schema,
      stream: false,
    }),
  })
  if (!res.ok) throw new Error(`Ollama API error: ${res.status} ${await res.text()}`)
  const data = await res.json() as { message: { content: string } }
  return parseJson<T>(data.message.content)
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

// ── JSON パーサー (ローカルLLMはmarkdown付きで返すことがあるため) ──

function parseJson<T>(text: string): T {
  // ```json ... ``` や ``` ... ``` フェンスを除去
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  // 最初の { から最後の } を抽出
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`JSONが見つかりません: ${stripped.slice(0, 100)}`)
  return JSON.parse(stripped.slice(start, end + 1)) as T
}

// ── 関数 ──────────────────────────────────────────────────────

export async function explainTerm(term: string): Promise<TermExplanation> {
  const system = 'あなたは学術・科学分野の専門用語を説明するアシスタントです。必ず日本語で回答してください。'
  const prompt = `次の用語を日本語で説明してください。
{"explanation":"用語の定義と背景を2〜3文","relatedTerms":["関連用語1","関連用語2"]}
というJSONフォーマットで返してください。

用語: "${term}"`

  if ((process.env.AI_PROVIDER ?? 'vercel') === 'ollama') {
    return ollamaGenerateJson<TermExplanation>(system, prompt, {
      type: 'object',
      properties: {
        explanation: { type: 'string' },
        relatedTerms: { type: 'array', items: { type: 'string' } },
      },
      required: ['explanation', 'relatedTerms'],
    })
  }
  const { text } = await generateText({ model: getModel(), system, prompt })
  return parseJson<TermExplanation>(text)
}

const QUESTION_PROMPTS = {
  progress: '手法選択の根拠、結果の解釈・妥当性、次のステップ、対照実験の有無、予想外の結果への対応',
  journal:  '論文の新規性・貢献、実験デザインの妥当性、限界・批判点、他手法との比較、自分たちの研究への応用可能性',
}

export async function analyzePresentation(
  pdfText: string,
  type: 'progress' | 'journal'
): Promise<PresentationAnalysis> {
  const system = 'あなたは学術発表のアシスタントです。必ず日本語で回答してください。'
  const prompt = `以下の発表テキストを分析してください。
{"terms":[{"term":"専門用語","page":1}],"questions":["質問1","質問2"]}
というJSONフォーマットで返してください。

発表タイプ: ${type === 'progress' ? '進捗報告' : '抄読'}
質問観点: ${QUESTION_PROMPTS[type]}

--- 発表テキスト ---
${pdfText.slice(0, 8000)}`

  if ((process.env.AI_PROVIDER ?? 'vercel') === 'ollama') {
    return ollamaGenerateJson<PresentationAnalysis>(system, prompt, {
      type: 'object',
      properties: {
        terms: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              term: { type: 'string' },
              page: { type: 'number' },
            },
            required: ['term'],
          },
        },
        questions: { type: 'array', items: { type: 'string' } },
      },
      required: ['terms', 'questions'],
    })
  }
  const { text } = await generateText({ model: getModel(), system, prompt })
  return parseJson<PresentationAnalysis>(text)
}
