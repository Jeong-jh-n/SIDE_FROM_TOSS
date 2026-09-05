/**
 * 검사 API 호출. **우리 백엔드만** 부릅니다.
 *
 * `career.go.kr`을 프론트에서 직접 호출하지 마세요 — CORS로 막히고 키도 노출돼요.
 * (CLAUDE.md §2.1)
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

/** 커리어넷 문항. 응답에 `relm`은 오지 않아요. (CLAUDE.md §0) */
export interface InspectQuestion {
  qitemNo: number
  question: string
  [key: string]: string | number
}

export interface ReportResponse {
  inspctSeq: number
  /** 결과표 URL. 전체를 그대로 보관하고 그대로 열어요. (CLAUDE.md §6) */
  url: string
}

export class InspectApiError extends Error {
  /** 서버에 아예 닿지 못한 경우. 재시도 안내를 다르게 해요. */
  readonly offline: boolean

  constructor(message: string, offline = false) {
    super(message)
    this.name = 'InspectApiError'
    this.offline = offline
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response

  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    // fetch 자체가 실패하면 서버가 안 떠 있거나 네트워크가 끊긴 거예요.
    // 브라우저가 주는 "Failed to fetch"는 사용자에게 아무 정보가 안 되므로 바꿔줍니다.
    throw new InspectApiError('검사 서버에 연결하지 못했어요.', true)
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new InspectApiError(body.error ?? '요청에 실패했어요.')
  }

  return (await res.json()) as T
}

export function fetchQuestions(q: number): Promise<InspectQuestion[]> {
  return call<InspectQuestion[]>(`/api/inspect/questions?q=${q}`)
}

export interface ReportRequest {
  qestrnSeq: string
  trgetSe: string
  gender: string
  grade?: string
  startDtm: number
  answers: string
}

export function createReport(body: ReportRequest): Promise<ReportResponse> {
  return call<ReportResponse>('/api/inspect/report', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export interface Choice {
  label: string
  score: number
  /** 선택지에 딸린 설명. 검사에 따라 없을 수 있어요. */
  description?: string
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

/**
 * 문항의 선택지를 `answerNN`/`answerScoreNN` 쌍으로 뽑아요.
 *
 * 검사마다 구조가 달라요.
 * - 진로개발준비도(q=8): 5점 척도. `answer01~05`에 각각 점수가 붙어요.
 * - 직업가치관(q=6): 양자택일. `answer01·02`가 선택지이고
 *   `answer03·04`는 **그 둘의 설명**이라 `answerScore`가 `null`입니다.
 *
 * 그래서 **점수가 있는 것만 선택지**로 보고, 점수 없는 라벨은 설명으로 취급해요.
 * 빈 칸은 `null`로 오기도 해서 `String(null)` = `"null"` 이 화면에 찍히지 않도록 걸러냅니다.
 */
export function choicesOf(question: InspectQuestion): Choice[] {
  const scored: Choice[] = []
  const unscored: string[] = []

  for (let index = 1; index <= 10; index += 1) {
    const suffix = String(index).padStart(2, '0')
    const label = question[`answer${suffix}`]
    const score = question[`answerScore${suffix}`]

    if (isBlank(label)) continue

    if (isBlank(score)) {
      unscored.push(String(label))
      continue
    }

    scored.push({ label: String(label), score: Number(score) })
  }

  // 설명 개수가 선택지 개수와 같으면 순서대로 짝지어요. (q=6 패턴)
  if (unscored.length === scored.length) {
    return scored.map((choice, index) => ({ ...choice, description: unscored[index] }))
  }

  return scored
}
