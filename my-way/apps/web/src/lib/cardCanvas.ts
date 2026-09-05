import type { CardData } from '@/features/card/types'
import { CARD_THEMES } from '@/features/card/themes'

/** 명함 규격: 90 x 50 mm 비율을 300dpi 기준으로 그려요. */
export const CARD_WIDTH = 1063
export const CARD_HEIGHT = 591

function themeOf(themeId: string) {
  return CARD_THEMES.find((theme) => theme.id === themeId) ?? CARD_THEMES[0]
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

/**
 * 가상 명함을 canvas에 그려요. 실제 PNG 생성은 이 함수 하나로 끝나요.
 *
 * @param aiMark AI 칭호 앞에 붙일 마크. 이미지 로딩이 비동기라 **호출부가 미리 받아**
 *               넘겨줍니다. 없으면 마크 없이 그려요.
 */
export function drawCard(
  canvas: HTMLCanvasElement,
  card: CardData,
  aiMark?: CanvasImageSource | null,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const theme = themeOf(card.themeId)
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT

  // 배경 그라데이션
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
  gradient.addColorStop(0, theme.from)
  gradient.addColorStop(1, theme.to)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // 우측 하단 장식 원
  ctx.save()
  ctx.globalAlpha = theme.id === 'paper' ? 0.06 : 0.12
  ctx.fillStyle = theme.fg
  ctx.beginPath()
  ctx.arc(CARD_WIDTH - 90, CARD_HEIGHT - 60, 260, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const padding = 84
  ctx.fillStyle = theme.fg
  ctx.textBaseline = 'alphabetic'

  /*
   * 배치는 기획 시안(`카드.png`)을 따릅니다. 위에서 아래로 이렇게 쌓여요.
   *
   *   칭호            작게
   *   이름            크게
   *   ────────        구분선
   *   직무            작게
   *   #취미 #취미     태그 두 개
   *
   * 전부 좌측 정렬이고, 오른쪽은 비워 둡니다(장식 원과 워터마크 자리).
   */

  // 1) 칭호. AI가 만든 것이면 앞에 마크를 붙여 출처를 드러냅니다. (CLAUDE.md §7)
  ctx.save()
  ctx.globalAlpha = 0.8
  ctx.font = '400 34px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'

  const taglineY = 132
  let taglineX = padding
  if (card.taglineFromAi && aiMark) {
    const size = 36
    ctx.drawImage(aiMark, padding, taglineY - size + 6, size, size)
    taglineX = padding + size + 10
  }
  ctx.fillText(card.tagline, taglineX, taglineY)
  ctx.restore()

  // 2) 이름
  ctx.font = 'bold 82px "Toss Product Sans", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  const nameWidth = ctx.measureText(card.name).width
  ctx.fillText(card.name, padding, 232)

  // 3) 구분선 — 이름 폭에 맞추되 최소·최대를 둬요.
  ctx.save()
  ctx.globalAlpha = 0.45
  ctx.fillStyle = theme.fg
  const ruleWidth = Math.min(Math.max(nameWidth + 60, 260), CARD_WIDTH - padding * 2)
  ctx.fillRect(padding, 266, ruleWidth, 4)
  ctx.restore()

  // 4) 직무 (없으면 "진로 탐색 중")
  ctx.save()
  ctx.globalAlpha = 0.86
  ctx.font = '400 36px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  ctx.fillText(card.title, padding, 330)
  ctx.restore()

  // 5) 특기 · 취미 태그. **한 줄에 하나씩** 쌓아요.
  ctx.font = '500 32px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  const tagRowHeight = 68
  let tagY = 400
  for (const tag of card.tags) {
    const label = `#${tag}`
    const width = ctx.measureText(label).width + 44

    ctx.save()
    ctx.globalAlpha = theme.id === 'paper' ? 0.08 : 0.2
    ctx.fillStyle = theme.fg
    roundRect(ctx, padding, tagY - 34, Math.min(width, CARD_WIDTH - padding * 2), 54, 27)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = theme.fg
    ctx.fillText(label, padding + 22, tagY + 3)
    tagY += tagRowHeight
  }

  // 워터마크
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.font = '600 26px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  const mark = 'MY WAY'
  const markWidth = ctx.measureText(mark).width
  ctx.fillText(mark, CARD_WIDTH - padding - markWidth, CARD_HEIGHT - padding)
  ctx.restore()
}

export function toPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}
