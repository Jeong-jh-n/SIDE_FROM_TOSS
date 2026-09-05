import type { CardData } from '../types'
import { CARD_THEMES } from '../data/questions'

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

/** 가상 명함을 canvas에 그려요. 실제 PNG 생성은 이 함수 하나로 끝나요. */
export function drawCard(canvas: HTMLCanvasElement, card: CardData): void {
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

  // 이름
  ctx.font = 'bold 78px "Toss Product Sans", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  ctx.fillText(card.name, padding, 214)

  // 희망 진로 (직함 자리)
  ctx.save()
  ctx.globalAlpha = 0.86
  ctx.font = '400 40px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  ctx.fillText(card.title, padding, 274)
  ctx.restore()

  // 구분선
  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.fillStyle = theme.fg
  ctx.fillRect(padding, 316, 120, 5)
  ctx.restore()

  // 태그 (특기 / 취미)
  ctx.font = '500 32px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  let tagX = padding
  const tagY = 382
  for (const tag of card.tags) {
    const label = `#${tag}`
    const width = ctx.measureText(label).width + 44

    if (tagX + width > CARD_WIDTH - padding) break

    ctx.save()
    ctx.globalAlpha = theme.id === 'paper' ? 0.08 : 0.2
    ctx.fillStyle = theme.fg
    roundRect(ctx, tagX, tagY - 34, width, 54, 27)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = theme.fg
    ctx.fillText(label, tagX + 22, tagY + 3)
    tagX += width + 16
  }

  // 한 줄 소개
  ctx.save()
  ctx.globalAlpha = 0.8
  ctx.font = '400 34px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  ctx.fillText(card.tagline, padding, CARD_HEIGHT - padding)
  ctx.restore()

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
