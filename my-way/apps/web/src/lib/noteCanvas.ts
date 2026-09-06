import { formById, layoutFor, type NoteForm, type Slot } from '@/features/note/forms'

/**
 * 결과지를 canvas 로 그려요.
 *
 * ## 롤링페이퍼처럼
 *
 * 줄을 위에서 아래로 쌓지 않고, **대화에서 나온 이야깃거리마다 쪽지를 하나씩**
 * 흩뿌립니다. 여러 사람이 한 장에 돌려가며 쓴 것처럼 보이게 색과 각도를 달리해요.
 *
 * 쪽지 개수는 대화에 따라 2~5개로 달라져서 **배치도 개수별로 따로** 잡아 뒀습니다.
 * (`features/note/forms.ts` 의 `layoutFor`)
 *
 * 저장 버튼이 내려주는 PNG 가 화면과 같아야 해서, DOM 을 캡처하지 않고 처음부터
 * canvas 에 그립니다. 명함(`cardCanvas.ts`)과 같은 방식이에요.
 */

const W = 800
const H = 1000
const PAD = 64

/** 쪽지 안쪽 여백과 줄 간격. */
const SLOT_PAD = 22
const LINE_H = 34
const FONT_SIZE = 25

/** 쪽지 하나에 넣을 수 있는 줄 수. 넘치면 잘라요. */
const MAX_SLOT_LINES = 4

/** 글자를 폭에 맞춰 쪼개요. 한국어는 단어 경계가 헐거워서 글자 단위로 봅니다. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  let line = ''

  for (const char of text) {
    const next = line + char
    if (ctx.measureText(next).width > maxWidth && line !== '') {
      out.push(line)
      line = char
      continue
    }
    line = next
  }
  if (line !== '') out.push(line)
  return out
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 위쪽 장식. 종이마다 성격을 만들어요. */
function drawDeco(ctx: CanvasRenderingContext2D, form: NoteForm) {
  ctx.save()

  if (form.deco === 'tape') {
    ctx.translate(W / 2, 32)
    ctx.rotate(-0.04)
    ctx.fillStyle = 'rgba(0,0,0,0.06)'
    ctx.fillRect(-90, -17, 180, 34)
  } else if (form.deco === 'clip') {
    ctx.strokeStyle = form.faint
    ctx.lineWidth = 6
    roundRect(ctx, 60, 14, 32, 86, 16)
    ctx.stroke()
  } else if (form.deco === 'punch') {
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    for (const y of [150, 500, 850]) {
      ctx.beginPath()
      ctx.arc(34, y, 12, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (form.deco === 'fold') {
    ctx.fillStyle = 'rgba(0,0,0,0.07)'
    ctx.beginPath()
    ctx.moveTo(W - 92, 0)
    ctx.lineTo(W, 0)
    ctx.lineTo(W, 92)
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()
}

/** 쪽지 하나. 기울여서 붙인 것처럼 그려요. */
function drawSlot(
  ctx: CanvasRenderingContext2D,
  form: NoteForm,
  slot: Slot,
  text: string,
  index: number,
) {
  ctx.save()
  ctx.translate(slot.x, slot.y)
  ctx.rotate(slot.rot)

  ctx.font = `${FONT_SIZE}px "Toss Product Sans", system-ui, sans-serif`
  const inner = slot.w - SLOT_PAD * 2
  const lines = wrap(ctx, text, inner).slice(0, MAX_SLOT_LINES)
  const h = SLOT_PAD * 2 + lines.length * LINE_H

  // 그림자를 옅게 넣어야 종이 위에 얹힌 것처럼 보여요.
  ctx.shadowColor = 'rgba(0,0,0,0.12)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 3
  ctx.fillStyle = form.tints[index % form.tints.length]!
  roundRect(ctx, 0, 0, slot.w, h, 10)
  ctx.fill()
  ctx.shadowColor = 'transparent'

  ctx.fillStyle = form.ink
  ctx.textBaseline = 'alphabetic'
  let y = SLOT_PAD + FONT_SIZE
  for (const line of lines) {
    ctx.fillText(line, SLOT_PAD, y)
    y += LINE_H
  }

  ctx.restore()
}

export function drawNote(
  canvas: HTMLCanvasElement,
  data: { formId: string; lines: string[]; from: string },
): void {
  const form = formById(data.formId)
  const ctx = canvas.getContext('2d')
  if (ctx === null) return

  canvas.width = W
  canvas.height = H

  ctx.fillStyle = form.paper
  ctx.fillRect(0, 0, W, H)

  drawDeco(ctx, form)

  ctx.fillStyle = form.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '600 36px "Toss Product Sans", system-ui, sans-serif'
  ctx.fillText('오늘 이야기', PAD, 150)

  // 배치는 개수에 맞춰 미리 잡아둔 자리를 씁니다. 무작위로 뽑지 않아요.
  const slots = layoutFor(data.lines.length)
  data.lines.slice(0, slots.length).forEach((text, index) => {
    drawSlot(ctx, form, slots[index]!, text, index)
  })

  // 서명. 누가 남긴 메모인지 알아야 해요.
  ctx.fillStyle = form.faint
  ctx.font = '26px "Toss Product Sans", system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`— ${data.from}`, W - PAD, H - 70)
  ctx.textAlign = 'left'
}

export function toPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}
