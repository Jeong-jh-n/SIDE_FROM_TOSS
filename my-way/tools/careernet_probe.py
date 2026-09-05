#!/usr/bin/env python3
"""
커리어넷 진로심리검사 Open API 스펙 확인 스크립트

매뉴얼 v4.1.1 기준. 실제 응답을 찍어서 아래를 확정한다.
  1) 코드표의 검사들이 실제로 열려 있는가
  2) 각 검사의 문항 수 (v1에는 문항수 필드가 없어 직접 세야 함)
  3) relm(영역) 필드로 하위영역 매핑이 오는가  <- 자체 결과 화면의 관건
  4) answerScore 배점 구조 - 원점수 자체 계산 가능한가
  5) report 응답이 URL만 주는가

사용법:
    export CAREERNET_KEY="발급받은키"
    python3 careernet_probe.py          # 전체 탐색 + 조합별 문항 수
    python3 careernet_probe.py 8        # 상세 덤프 (8 = 진로개발준비도검사)

주의: 인증키를 코드에 하드코딩하지 마세요.
"""

import os, sys, json, time
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from collections import Counter

KEY = os.environ.get("CAREERNET_KEY", "").strip()
BASE = "https://www.career.go.kr/inspct/openapi/test"
OUT = "careernet_raw"

# 매뉴얼 v4.1.1 §1.5 심리검사 코드표
KNOWN = {
    6:  ("직업가치관검사 - 일반·대학생", "대학생/일반"),
    8:  ("진로개발준비도검사",           "대학생/일반"),
    9:  ("이공계전공적합도검사",         "대학생/일반"),
    10: ("주요능력효능감검사",           "대학생/일반"),
    17: ("직업흥미검사(H) - 중학생",     "중학생"),
    18: ("직업흥미검사(H) - 고등학생",   "고등학생"),
    19: ("진로흥미탐색",                 "초등학생"),
    20: ("직업적성검사 - 중학생",        "중학생"),
    21: ("직업적성검사 - 고등학생",      "고등학생"),
    24: ("직업가치관검사 - 중학생",      "중학생"),
    25: ("직업가치관검사 - 고등학생",    "고등학생"),
    26: ("진로개발역량검사 - 중학생",    "중학생"),
    27: ("진로개발역량검사 - 고등학생",  "고등학생"),
    30: ("직업흥미검사(K) - 중학생",     "중학생"),
    31: ("직업흥미검사(K) - 고등학생",   "고등학생"),
    32: ("진로개발역량검사 - 초등학생",  "초등학생"),
    35: ("진로성숙도검사 - 중학생",      "중학생"),
    36: ("진로성숙도검사 - 고등학생",    "고등학생"),
}

V2_ONLY = {33: "직업흥미검사(H) 145문항", 34: "직업흥미검사(H) 146문항"}

TRGET = {"100205": "초등학생", "100206": "중학생", "100207": "고등학생",
         "100208": "대학생", "100209": "일반", "100214": "교사"}

CANDIDATES = [6, 8, 25, 36, 24, 35]          # 이 프로젝트의 1차 후보

QUIRKS = {
    24: "49번 문항은 3개 선택을 쉼표로 구분 (예: 49=8,1,4)",
    25: "49번 문항은 3개 선택을 쉼표로 구분 (예: 49=8,1,4)",
    35: "13번 문항은 순위 2개. 답변 8(기타)은 주관식 필요 (예: 13=1,8:방송계열)",
    36: "13번 문항은 순위 2개. 답변 9(기타)는 주관식 필요 (예: 13=1,9:예체능)",
    32: "1,6,11,16,21,26,31,36,41,46,51,56번은 규준 미반영이나 전송 필수",
}

COMBOS = [
    ((6, 8),   "대학생  : 직업가치관 + 진로개발준비도"),
    ((25, 36), "고등학생: 직업가치관 + 진로성숙도"),
    ((24, 35), "중학생  : 직업가치관 + 진로성숙도"),
]


def get_json(url, timeout=15):
    req = Request(url, headers={"User-Agent": "spec-probe/1.0"})
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_questions(q):
    return get_json(BASE + "/questions?" + urlencode({"apikey": KEY, "q": q}))


def items_of(d):
    items = d.get("RESULT") or d.get("result") or []
    if isinstance(items, dict):
        items = items.get("items", [])
    return items if isinstance(items, list) else []


def discover(lo=1, hi=40):
    print("검사 번호 %d~%d 탐색 중... (v1에는 문항수 필드가 없어 직접 셈)" % (lo, hi))
    print()
    found = {}
    for q in range(lo, hi + 1):
        name, tgt = KNOWN.get(q, ("", ""))
        try:
            n = len(items_of(fetch_questions(q)))
            if n:
                mark = "  <= 후보" if q in CANDIDATES else ""
                print("  q=%-3d %3d문항  %-26s %s%s"
                      % (q, n, name or "(코드표에 없음)", tgt, mark))
                found[q] = n
            elif q in V2_ONLY:
                print("  q=%-3d   -      %s (v2 엔드포인트 전용)" % (q, V2_ONLY[q]))
        except HTTPError as e:
            if q in KNOWN:
                print("  q=%-3d HTTP %s  %s  <- 코드표에 있는데 실패" % (q, e.code, name))
        except (URLError, json.JSONDecodeError):
            if q in KNOWN:
                print("  q=%-3d 실패      %s" % (q, name))
        time.sleep(0.3)

    print()
    print("열려 있는 검사: %d개 / 코드표 등재 %d개" % (len(found), len(KNOWN)))

    print()
    print("=== 대학생·일반용 ===")
    uni = [q for q in (6, 8, 9, 10) if q in found]
    if uni:
        for q in uni:
            print("  q=%-3d %3d문항  %s" % (q, found[q], KNOWN[q][0]))
        print("  -> 대학생 트랙도 커리어넷으로 커버됩니다.")
    else:
        print("  응답 없음. 커리어넷에 대학생·일반용 개방을 문의하세요.")

    print()
    print("=== 조합 시 총 문항 수 ===")
    for combo, label in COMBOS:
        if all(c in found for c in combo):
            parts = " + ".join(str(found[c]) for c in combo)
            print("  %-36s %s = %d문항" % (label, parts, sum(found[c] for c in combo)))
        else:
            missing = [c for c in combo if c not in found]
            print("  %-36s 미확인 (q=%s)" % (label, missing))

    quirky = [q for q in QUIRKS if q in found]
    if quirky:
        print()
        print("=== 전송 시 특수 처리 필요 ===")
        for q in quirky:
            print("  q=%d %s" % (q, KNOWN[q][0]))
            print("     %s" % QUIRKS[q])

    if found:
        print()
        print("상세를 보려면:  python3 %s <검사번호>" % os.path.basename(sys.argv[0]))
    return found


def dump(q):
    d = fetch_questions(q)
    os.makedirs(OUT, exist_ok=True)
    path = "%s/questions_q%d.json" % (OUT, q)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print("원본 저장: %s" % path)

    name = KNOWN.get(q, ("(코드표에 없음)", ""))[0]
    items = items_of(d)
    if not items:
        print("문항이 비어 있습니다. 최상위 키: %s" % list(d.keys()))
        return

    print()
    print("=== q=%d  %s  /  %d문항 ===" % (q, name, len(items)))
    print()

    keys = sorted({k for it in items for k in it})
    print("응답 필드:")
    for k in keys:
        sample = next((it[k] for it in items if it.get(k) not in (None, "")), "")
        s = str(sample)
        print("  %-18s 예: %s%s" % (k, s[:52], "..." if len(s) > 52 else ""))

    # 하위영역 매핑 - relm 이 핵심
    print()
    print("=== 하위영역 매핑 (relm) ===")
    cand = [k for k in keys if k.lower() == "relm" or any(
        t in k.lower() for t in ("area", "sect", "cat", "fact", "sub", "group", "code"))]
    if cand:
        for k in cand:
            vals = Counter(str(it.get(k)) for it in items if it.get(k) not in (None, ""))
            print("  %s: %d종" % (k, len(vals)))
            for v, c in vals.most_common():
                print("     %-28s %d문항" % (v, c))
        print("  -> 영역별 원점수를 자체 계산할 수 있습니다.")
    else:
        print("  없음. 매뉴얼상 relm(영역) 필드가 있어야 정상입니다.")
        print("  응답 원본(%s)을 직접 확인하세요." % path)

    # 배점
    print()
    print("=== 선택지 / 배점 ===")
    n_ans, scores = [], set()
    for it in items:
        n_ans.append(sum(1 for i in range(1, 11) if it.get("answer%02d" % i)))
        for i in range(1, 11):
            v = it.get("answerScore%02d" % i)
            if v not in (None, ""):
                scores.add(str(v))
    print("  문항당 선택지 수: %s" % dict(Counter(n_ans)))
    print("  배점 값: %s" % sorted(scores))
    print("  -> %s" % ("배점 제공. 원점수 자체 계산 가능" if scores
                       else "배점 없음. report API에 의존해야 함"))

    rev = []
    for it in items:
        ss = [it.get("answerScore%02d" % i) for i in range(1, 11)]
        ss = [int(x) for x in ss if str(x).lstrip("-").isdigit()]
        if len(ss) >= 2 and ss == sorted(ss, reverse=True):
            rev.append(it.get("qitemNo"))
    print("  역채점 추정 문항: %s" % (rev if rev else "없음"))

    # 문항 미리보기
    print()
    print("=== 문항 미리보기 (앞 5개) ===")
    for it in items[:5]:
        print("  [%s] (%s) %s" % (it.get("qitemNo"), it.get("relm", "-"),
                                  it.get("qestn") or it.get("question")))
        opts = [it.get("answer%02d" % i) for i in range(1, 11)]
        print("       %s" % [o for o in opts if o])

    tips = [k for k in keys if k.lower().startswith("tip")]
    if tips:
        print()
        print("=== 해설 필드 %s ===" % tips)
        for it in items[:2]:
            for k in tips:
                if it.get(k):
                    print("  [%s] %s: %s" % (it.get("qitemNo"), k, str(it[k])[:80]))
        print("  -> 보기 설명 문구를 API가 제공합니다. 결과 화면에 활용 가능.")

    if q in QUIRKS:
        print()
        print("=== 전송 시 주의 ===")
        print("  %s" % QUIRKS[q])

    print()
    print("=== report API (POST) ===")
    print("  POST https://www.career.go.kr/inspct/openapi/test/report")
    print("  필수: apikey, qestrnSeq, trgetSe, gender, grade, startDtm, answers")
    print('  answers 형식: "1=5 2=7 3=4 ..." (공백 구분, 문항번호=선택값)')
    print()
    print("  매뉴얼상 응답은 { inspctSeq, url } 뿐입니다. 점수 데이터가 아니라")
    print("  커리어넷 결과 페이지 링크입니다. 따라서 결과 화면은")
    print("    (a) 웹뷰로 그 URL을 띄운다 - T점수·규준 그대로, UI는 커리어넷 것")
    print("    (b) relm + answerScore 로 원점수를 자체 계산 - UI는 우리 것,")
    print("        단 T점수 규준이 없어 높음/보통/낮음 판정 불가")
    print("  둘을 병행하는 구성을 권장합니다.")


if __name__ == "__main__":
    if not KEY:
        sys.exit('CAREERNET_KEY 환경변수가 없습니다.\n  export CAREERNET_KEY="발급받은키"')
    try:
        if len(sys.argv) > 1:
            dump(int(sys.argv[1]))
        else:
            discover()
    except KeyboardInterrupt:
        print("\n중단됨")