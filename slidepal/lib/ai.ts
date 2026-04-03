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

// Ollama ネイティブ API 呼び出し
async function ollamaChat(system: string, prompt: string): Promise<string> {
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
      stream: false,
    }),
  })
  if (!res.ok) throw new Error(`Ollama API error: ${res.status} ${await res.text()}`)
  const data = await res.json() as { message: { content: string } }
  return data.message.content
}

// 区切り文字形式のテキストから用語リストを抽出
// 例: "用語1\n用語2\n用語3" → [{term:"用語1"}, ...]
function parseTermLines(text: string): Array<{ term: string }> {
  return text
    .split(/\n|、|,/)
    .map(s => s.replace(/^\s*[-・*\d.]+\s*/, '').trim())
    .filter(s => s.length > 0 && s.length < 60)
    .map(term => ({ term }))
}

// 区切り文字形式のテキストから質問リストを抽出
function parseQuestionLines(text: string): string[] {
  return text
    .split('\n')
    .map(s => s.replace(/^\s*[-・*\d.]+\s*/, '').trim())
    .filter(s => s.length > 5)
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
  if ((process.env.AI_PROVIDER ?? 'vercel') === 'ollama') {
    // Ollama向け: セクション区切りの平文で返してもらい手動パース
    const text = await ollamaChat(
      'あなたは学術・科学分野の専門用語を説明するアシスタントです。必ず日本語で回答してください。',
      `次の用語を日本語で説明してください。

【説明】
（用語の定義と背景を2〜3文で書く）

【関連用語】
（関連する専門用語を1行に1つ、3〜5個書く）

用語: "${term}"`,
    )
    const explanationMatch = text.match(/【説明】\s*([\s\S]*?)(?=【関連用語】|$)/)
    const relatedMatch = text.match(/【関連用語】\s*([\s\S]*)$/)
    return {
      explanation: explanationMatch?.[1]?.trim() ?? text.trim(),
      relatedTerms: relatedMatch ? parseTermLines(relatedMatch[1]) .map(t => t.term) : [],
    }
  }

  const system = 'あなたは学術・科学分野の専門用語を説明するアシスタントです。必ず日本語で回答してください。'
  const prompt = `次の用語を日本語で説明し、{"explanation":"定義2〜3文","relatedTerms":["関連用語1"]}のJSONで返してください。用語: "${term}"`
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
  if ((process.env.AI_PROVIDER ?? 'vercel') === 'ollama') {
    // Ollama向け: セクション区切りの平文で返してもらい手動パース
    const text = await ollamaChat(
      'あなたは学術発表のアシスタントです。必ず日本語で回答してください。',
      `以下の発表テキストを分析してください。

【専門用語】
（発表中の難解な専門用語を1行に1つ列挙する）

【質問】
（発表者への質問を1行に1つ列挙する）
質問観点: ${QUESTION_PROMPTS[type]}

発表タイプ: ${type === 'progress' ? '進捗報告' : '抄読'}

--- 発表テキスト ---
${pdfText.slice(0, 6000)}`,
    )
    // gemmaはフォーマット指示を無視するため、マークダウンの構造から直接抽出する
    // **用語** パターンから専門用語を抽出（重複除去）
    const boldTerms = [...new Set(
      [...text.matchAll(/\*\*([^*\n]{2,30})\*\*/g)]
        .map(m => m[1].replace(/[：:（）()]/g, '').trim())
        .filter(s => s.length >= 2 && s.length <= 25 && !/^[0-9\s]+$/.test(s))
    )].map(term => ({ term }))

    // 番号付きリストや箇条書きから質問候補を抽出
    const listLines = text
      .split('\n')
      .map(l => l.replace(/^\s*[-*・\d.]+\s*/, '').replace(/\*\*/g, '').trim())
      .filter(l => l.length > 10 && l.includes('（') || l.includes('例：') || l.endsWith('。') || l.endsWith('か？'))
      .slice(0, 8)

    return {
      terms: boldTerms.slice(0, 20),
      questions: listLines.length > 0 ? listLines : ['発表内容の質問は手動で作成してください'],
    }
  }

  const system = 'あなたは学術発表のアシスタントです。必ず日本語で回答してください。'
  const prompt = `以下の発表テキストを分析し、{"terms":[{"term":"用語"}],"questions":["質問"]}のJSONで返してください。
発表タイプ: ${type === 'progress' ? '進捗報告' : '抄読'}、質問観点: ${QUESTION_PROMPTS[type]}
--- 発表テキスト ---
${pdfText.slice(0, 8000)}`
  const { text } = await generateText({ model: getModel(), system, prompt })
  return parseJson<PresentationAnalysis>(text)
}
