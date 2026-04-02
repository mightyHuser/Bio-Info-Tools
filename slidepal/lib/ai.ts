// slidepal/lib/ai.ts
import { generateText } from 'ai'
import { z } from 'zod'

const MODEL = 'anthropic/claude-sonnet-4.6'

const ExplanationSchema = z.object({
  explanation: z.string(),
  relatedTerms: z.array(z.string()),
})

export type TermExplanation = z.infer<typeof ExplanationSchema>

export async function explainTerm(term: string): Promise<TermExplanation> {
  const result = await generateText({
    model: MODEL,
    system: `あなたは学術・科学分野の専門用語を分かりやすく説明するアシスタントです。
必ず日本語で回答し、以下の JSON 形式のみで返してください。`,
    prompt: `次の用語を日本語で説明してください: "${term}"
JSON形式: { "explanation": "定義と背景を2〜3文で", "relatedTerms": ["関連用語1", "関連用語2"] }`,
  })

  const raw = result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const parsed = ExplanationSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    return { explanation: raw, relatedTerms: [] }
  }
  return parsed.data
}

const AnalysisSchema = z.object({
  terms: z.array(z.object({ term: z.string(), page: z.number().optional() })),
  questions: z.array(z.string()),
})

export type PresentationAnalysis = z.infer<typeof AnalysisSchema>

const QUESTION_PROMPTS = {
  progress: `質問候補の観点: 手法選択の根拠、結果の解釈・妥当性、次のステップ、対照実験の有無、予想外の結果への対応`,
  journal:  `質問候補の観点: 論文の新規性・貢献、実験デザインの妥当性、限界・批判点、他手法との比較、自分たちの研究への応用可能性`,
}

export async function analyzePresentation(
  pdfText: string,
  type: 'progress' | 'journal'
): Promise<PresentationAnalysis> {
  const result = await generateText({
    model: MODEL,
    system: `あなたは学術発表のアシスタントです。
PDFテキストを分析し、必ず日本語の JSON 形式のみで返してください。`,
    prompt: `以下の発表テキストを分析してください。
発表タイプ: ${type === 'progress' ? '進捗報告' : '抄読'}
${QUESTION_PROMPTS[type]}

出力JSON形式:
{
  "terms": [{ "term": "難解な専門用語", "page": ページ番号 }],
  "questions": ["発表者への質問1", "質問2"]
}

--- 発表テキスト ---
${pdfText.slice(0, 8000)}`,
  })

  const raw = result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const parsed = AnalysisSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) return { terms: [], questions: [] }
  return parsed.data
}
