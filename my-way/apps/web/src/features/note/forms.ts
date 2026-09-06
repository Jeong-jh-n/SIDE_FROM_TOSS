/**
 * 메모지 양식 다섯 종.
 *
 * 대화가 끝나면 하나가 **무작위로** 뽑힙니다. 같은 이야기라도 종이가 달라지면
 * 다시 해볼 이유가 생겨요.
 *
 * ## id 를 바꾸지 마세요
 *
 * 뽑힌 양식은 저장됩니다. 저장 안 하면 결과지를 다시 열 때마다 모양이 바뀌어서,
 * **이미지로 저장해둔 것과 화면이 달라져요.** 없는 id 를 만나면 첫 번째로 떨어집니다.
 */

export interface NoteForm {
  id: string
  label: string
  /** 바탕 종이 색. */
  paper: string
  /** 글자색. 종이 위에서 읽혀야 해요. */
  ink: string
  /** 제목·서명에 쓰는 옅은 색. */
  faint: string
  /**
   * 붙는 쪽지 색.
   *
   * 롤링페이퍼처럼 여러 사람이 쓴 것처럼 보이게 **칸마다 다른 색**을 돌려 써요.
   * 종이 위에서 글자가 읽혀야 하니 바탕과 대비가 크지 않은 톤으로 골랐습니다.
   */
  tints: string[]
  /** 위쪽 장식. */
  deco: 'tape' | 'clip' | 'punch' | 'fold' | 'none'
}

export const NOTE_FORMS: NoteForm[] = [
  {
    id: 'memo',
    label: '메모지',
    paper: '#FFFDF5',
    ink: '#2B2B28',
    faint: '#9C9683',
    tints: ['#FFF3C4', '#FFE0E9', '#DFF3E4', '#E4ECFF', '#FFE8D1'],
    deco: 'tape',
  },
  {
    id: 'grid',
    label: '모눈종이',
    paper: '#F7FAFF',
    ink: '#1F2937',
    faint: '#94A3B8',
    tints: ['#E3EDFF', '#E8F7F0', '#FFF1E6', '#F1E9FF', '#FFECEF'],
    deco: 'clip',
  },
  {
    id: 'kraft',
    label: '크라프트',
    paper: '#E8D9C0',
    ink: '#3B2F22',
    faint: '#8C7A5F',
    tints: ['#F5EBD8', '#DCE7D5', '#F2DDD2', '#E0DCE9', '#F0E4C8'],
    deco: 'punch',
  },
  {
    id: 'mint',
    label: '민트지',
    paper: '#EDF9F3',
    ink: '#14452F',
    faint: '#6FA88E',
    tints: ['#DFF3E4', '#E4F1FB', '#FBF3DA', '#FBE4EC', '#E9E7FA'],
    deco: 'fold',
  },
  {
    id: 'night',
    label: '밤편지',
    paper: '#232733',
    ink: '#F2F4F6',
    faint: '#7A8496',
    // 어두운 종이라 쪽지도 어둡게. 밝게 하면 글자가 안 읽혀요.
    tints: ['#333A4A', '#2E3C42', '#3B3547', '#2F3A4E', '#3A3630'],
    deco: 'none',
  },
]

export function formById(id: string): NoteForm {
  return NOTE_FORMS.find((form) => form.id === id) ?? NOTE_FORMS[0]!
}

/** 무작위로 하나. 뽑은 결과는 **반드시 저장**하세요. */
export function pickForm(): NoteForm {
  return NOTE_FORMS[Math.floor(Math.random() * NOTE_FORMS.length)]!
}

/**
 * 쪽지가 앉을 자리.
 *
 * `rot` 은 라디안이에요. 조금씩 기울여야 손으로 붙인 것처럼 보입니다.
 */
export interface Slot {
  x: number
  y: number
  w: number
  rot: number
}

/**
 * 개수별 배치.
 *
 * **자리를 무작위로 뽑지 않습니다.** 뽑으면 씨앗을 저장해야 하고, 안 하면 다시 열
 * 때마다 배치가 바뀌어요. 변화는 양식 다섯 종이 맡습니다.
 *
 * 겹치지 않게 손으로 잡은 좌표예요. 800×1000 기준입니다.
 */
const LAYOUTS: Record<number, Slot[]> = {
  1: [{ x: 150, y: 380, w: 500, rot: -0.03 }],
  2: [
    { x: 90, y: 270, w: 400, rot: -0.05 },
    { x: 310, y: 580, w: 400, rot: 0.04 },
  ],
  3: [
    { x: 80, y: 240, w: 380, rot: -0.06 },
    { x: 370, y: 450, w: 350, rot: 0.05 },
    { x: 110, y: 680, w: 390, rot: -0.03 },
  ],
  4: [
    { x: 70, y: 230, w: 340, rot: -0.05 },
    { x: 410, y: 350, w: 320, rot: 0.06 },
    { x: 90, y: 530, w: 350, rot: 0.03 },
    { x: 390, y: 700, w: 330, rot: -0.04 },
  ],
  5: [
    { x: 60, y: 215, w: 310, rot: -0.06 },
    { x: 400, y: 270, w: 310, rot: 0.05 },
    { x: 100, y: 440, w: 320, rot: 0.03 },
    { x: 420, y: 545, w: 300, rot: -0.05 },
    { x: 140, y: 715, w: 340, rot: 0.04 },
  ],
}

/** 개수에 맞는 배치. 범위를 벗어나면 가장 가까운 쪽으로 떨어집니다. */
export function layoutFor(count: number): Slot[] {
  const clamped = Math.min(Math.max(count, 1), 5)
  return LAYOUTS[clamped]!
}
