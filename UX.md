# 파이썬 3.14 → 3.12 이전 절차

작성 2026-08-30. **명령 프롬프트(cmd) 기준.** 위에서 아래로 순서대로 실행하면 됩니다.

## 왜 옮기는가

- 3.14용 CUDA 휠이 아직 없어 **`torch`가 CPU 전용(`2.13.0+cpu`)으로 깔려 있습니다.**
  RTX 5060 Ti(8GB)가 놀고 있고, `bitsandbytes`는 CUDA 전용이라 아예 동작하지 않습니다.
- 3.12는 ML 생태계 휠 지원이 가장 두텁습니다. AI허브 데이터 학습을 쓰기로 한 이상 이쪽이 유리합니다.

프로젝트 코드에는 영향이 없습니다. `tools/careernet_probe.py`는 표준 라이브러리만 쓰고,
`apps/web`·`apps/api`는 Node라 파이썬과 무관합니다. npm 의존성 중 네이티브 빌드도 없습니다.

---

## 0. 백업 (완료됨)

이미 만들어 두었습니다. 지우기 전에 이 두 파일이 있는지 확인만 하세요.

```
requirements-py314.txt     60개 — 원본 기록용. 손대지 마세요
requirements-restore.txt   58개 — 복구용. torch·setuptools 제외
```

`torch`를 뺀 이유는, 복구할 때 CUDA 빌드를 따로 깔고 나서 이 파일을 쓰기 위해서입니다.
그대로 두면 pip이 CPU 빌드로 덮어씁니다.

---

## 1. 기존 파이썬 제거

```cmd
where python
```

`C:\Python314\python.exe` 가 나올 겁니다.

제어판 → 앱 → **Python 3.14.7** 제거. 또는:

```cmd
winget uninstall Python.Python.3.14
```

제거 후 폴더가 남아 있으면 지웁니다 (site-packages 1.2GB).

```cmd
rmdir /s /q C:\Python314
```

### Microsoft Store 별칭 정리

PATH에 스토어 스텁이 잡혀 있습니다.

```
C:\Users\dotbl\AppData\Local\Microsoft\WindowsApps\python.exe
```

새로 설치한 파이썬을 가릴 수 있으니 꺼두세요.
**설정 → 앱 → 고급 앱 설정 → 앱 실행 별칭** 에서 `python.exe`·`python3.exe` 끄기.

---

## 2. 파이썬 3.12 설치

```cmd
winget install Python.Python.3.12
```

설치 관리자를 쓸 경우 **"Add python.exe to PATH"** 를 반드시 체크하세요.

```cmd
REM 새 cmd 창을 열고 확인
python --version
python -m pip --version
```

`Python 3.12.x` 가 나와야 합니다.

---

## 3. 가상환경 만들기 (권장)

전역 설치라서 이번에 파이썬을 지울 때 1.2GB가 통째로 날아갔습니다.
가상환경을 쓰면 파이썬을 다시 갈아도 프로젝트 환경이 분리됩니다.

```cmd
cd /d C:\Users\dotbl\Downloads\TOSS_project
python -m venv .venv
.venv\Scripts\activate.bat
```

활성화되면 프롬프트 앞에 `(.venv)` 가 붙습니다. **이후 명령은 모두 활성화 상태에서 실행하세요.**
빠져나올 때는 `deactivate` 입니다.

`.gitignore`에 `.venv` 를 추가해 두세요.

전역에 그대로 깔고 싶으면 이 단계를 건너뛰면 됩니다. 나머지 명령은 동일합니다.

---

## 4. pip 최신화

```cmd
python -m pip install --upgrade pip setuptools wheel
```

---

## 5. torch — CUDA 빌드로 먼저 설치

**순서가 중요합니다.** torch를 먼저 깔아야 다른 패키지가 CPU 빌드를 끌어오지 않습니다.

RTX 5060 Ti는 Blackwell 세대(sm_120)라 **CUDA 12.8 이상** 빌드가 필요합니다.

```cmd
pip install torch --index-url https://download.pytorch.org/whl/cu128
```

### 확인 — 이게 제일 중요합니다

```cmd
python -c "import torch; print(torch.__version__); print('CUDA:', torch.cuda.is_available())"
```

기대 출력:

```
2.x.x+cu128
CUDA: True
```

GPU 이름까지 보려면:

```cmd
python -c "import torch; print(torch.cuda.get_device_name(0))"
```

**`CUDA: False` 이거나 버전에 `+cpu` 가 붙으면 멈추고 아래를 시도하세요.**

```cmd
REM 1) 잘못 깔린 것 제거
pip uninstall -y torch

REM 2) 최신 안정 빌드가 아직 5060 Ti를 지원하지 않으면 nightly
pip install --pre torch --index-url https://download.pytorch.org/whl/nightly/cu128
```

그래도 안 되면 `cu126`·`cu129` 등 다른 CUDA 버전을 시도합니다.
드라이버(610.88)는 최신이라 문제가 아니고, **세대 지원 여부**가 관건입니다.

---

## 6. 나머지 패키지 복구

torch가 CUDA로 잡힌 것을 확인한 **뒤에** 실행하세요.

```cmd
cd /d C:\Users\dotbl\Downloads\TOSS_project
pip install -r requirements-restore.txt
```

설치 후 torch가 그대로인지 다시 확인합니다. 의존성 해결 과정에서 덮일 수 있습니다.

```cmd
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
```

`+cpu` 로 바뀌었다면 5번을 다시 실행하세요.

---

## 7. 동작 확인

```cmd
REM ML 스택
python -c "import transformers, peft, trl, datasets, accelerate; print('ok')"

REM bitsandbytes — CUDA가 잡혀야 의미가 있습니다
python -c "import bitsandbytes; print('bnb ok')"
```

`careernet_probe.py`는 인증키가 필요합니다. `.env`에서 꺼내 쓰려면:

```cmd
for /f "tokens=2 delims==" %i in ('findstr /b "CAREERNET_API_KEY=" my-way\apps\api\.env') do set CAREERNET_KEY=%i
python my-way\tools\careernet_probe.py
```

> `.bat` 파일 안에 넣을 때는 `%i` 를 `%%i` 로 바꿔야 합니다.
> 직접 넣어도 됩니다: `set CAREERNET_KEY=발급받은키`

---

## 8. 주의할 점

| 항목 | 내용 |
|---|---|
| 버전 고정 | `requirements-restore.txt`는 3.14 시점 버전입니다. 3.12에 휠이 없는 패키지가 있으면 그 줄의 `==x.y.z` 를 지우고 다시 시도하세요 |
| `bitsandbytes` | Windows 지원이 버전마다 다릅니다. 실패하면 최신 버전으로 올려보세요 |
| 8GB VRAM | 5060 Ti는 8GB입니다. 파인튜닝은 QLoRA(4bit) 기준으로 잡으세요. 이래서 `bitsandbytes`가 필요합니다 |
| 국외 반출 | AI허브 데이터를 쓰기로 했으므로 **학습·추론 모두 이 로컬 머신 또는 국내 인프라에서만** 하세요. 해외 API 금지 (`db-plan.md` 참조) |
| Node 쪽 | 전혀 영향 없습니다. `npm install` 다시 할 필요 없습니다 |

---

## 요약 — 명령만

```cmd
REM 1. 제거
winget uninstall Python.Python.3.14
rmdir /s /q C:\Python314
REM    설정 → 앱 실행 별칭에서 python.exe 끄기

REM 2. 설치 (새 cmd 창)
winget install Python.Python.3.12
python --version

REM 3. 가상환경
cd /d C:\Users\dotbl\Downloads\TOSS_project
python -m venv .venv
.venv\Scripts\activate.bat

REM 4. pip
python -m pip install --upgrade pip setuptools wheel

REM 5. torch (CUDA 먼저!)
pip install torch --index-url https://download.pytorch.org/whl/cu128
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"

REM 6. 나머지
pip install -r requirements-restore.txt
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"

REM 7. 확인
python -c "import transformers, peft, trl, datasets, accelerate; print('ok')"
```
