"""
로컬 추론 서버.

EXAONE + 진로 LoRA 어댑터를 4bit로 올려 두고 텍스트 생성만 담당해요.
프롬프트를 어떻게 만들지는 여기서 정하지 않습니다. 그건 `apps/api` 쪽 책임이고,
이 서버는 "모델을 돌리는 기계"로만 두어 나중에 모델을 갈아끼우기 쉽게 했어요.

## 왜 파이썬 서버를 따로 두나

모델을 띄우는 데 1~2분, VRAM 7GB가 듭니다. 요청마다 새로 올릴 수 없어서
프로세스를 상주시키고 `apps/api`(Node)가 HTTP로 부릅니다.

## 지켜야 하는 것

- **127.0.0.1 에만 바인딩합니다.** AI허브 데이터로 학습한 모델이라 학습·추론 모두
  이 머신 밖으로 나가면 안 돼요. (PYTHON-MIGRATION.md §8 국외 반출)
- **프롬프트와 생성 결과를 로그에 남기지 않습니다.** 자유 서술에 실명·학교명이
  섞일 수 있어요. (CLAUDE.md §2.8) 로그에는 길이와 소요 시간만 남깁니다.
- **생성은 한 번에 하나씩.** 8GB VRAM이라 동시 실행하면 터집니다. 락으로 직렬화해요.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_DATASETS_OFFLINE", "1")

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

log = logging.getLogger("ai")

# ------------------------------------------------------------------
# EXAONE 원격 코드 <-> transformers 5.x 호환성 패치
#
# exaone_model/modeling_exaone.py 는 create_causal_mask 를
# (input_embeds=..., cache_position=...) 로 부르는데, transformers 5.x 는
# (inputs_embeds=...) 이고 cache_position 인자가 없어요.
# 원격 코드가 import 되기 전에 감싸 둡니다. AI.py 와 같은 패치예요.
# ------------------------------------------------------------------
import transformers.masking_utils as masking_utils  # noqa: E402

_orig_create_causal_mask = masking_utils.create_causal_mask
_ACCEPTED_MASK_KWARGS = set(inspect.signature(_orig_create_causal_mask).parameters)


def _patched_create_causal_mask(*args, **kwargs):
    if "input_embeds" in kwargs and "inputs_embeds" not in kwargs:
        kwargs["inputs_embeds"] = kwargs.pop("input_embeds")
    kwargs = {k: v for k, v in kwargs.items() if k in _ACCEPTED_MASK_KWARGS}
    return _orig_create_causal_mask(*args, **kwargs)


masking_utils.create_causal_mask = _patched_create_causal_mask

from transformers import (  # noqa: E402
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)

# ------------------------------------------------------------------
# 경로 · 설정
# ------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[3]  # TOSS_project/
MODEL_PATH = Path(os.environ.get("AI_MODEL_PATH", PROJECT_ROOT / "exaone_model"))
ADAPTER_PATH = Path(os.environ.get("AI_ADAPTER_PATH", PROJECT_ROOT / "exaone_career_lora"))

HOST = os.environ.get("AI_HOST", "127.0.0.1")
PORT = int(os.environ.get("AI_PORT", "8000"))

MAX_PROMPT_CHARS = 4000
MAX_NEW_TOKENS_CAP = 200

_state: dict = {"model": None, "tokenizer": None, "adapter": None, "error": None}
_gpu_lock = asyncio.Lock()


def _load() -> None:
    """모델을 올려요. 실패하면 _state['error'] 에 사유를 남기고 서버는 계속 뜹니다."""
    if not MODEL_PATH.is_dir():
        raise FileNotFoundError(f"베이스 모델 경로가 없어요: {MODEL_PATH}")

    tokenizer = AutoTokenizer.from_pretrained(
        str(MODEL_PATH), local_files_only=True, trust_remote_code=True
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16
        if torch.cuda.is_bf16_supported()
        else torch.float16,
        bnb_4bit_use_double_quant=True,
    )

    model = AutoModelForCausalLM.from_pretrained(
        str(MODEL_PATH),
        quantization_config=bnb,
        device_map={"": 0},
        local_files_only=True,
        trust_remote_code=True,
    )

    # EXAONE 원격 코드는 임베딩을 self.wte 로 두면서 _input_embed_layer 를 지정하지
    # 않아 transformers 5.x 가 못 찾아요. AI.py 와 같은 이유로 지정합니다.
    exaone_module = sys.modules.get(type(model).__module__)
    exaone_base = getattr(exaone_module, "ExaonePreTrainedModel", None)
    if exaone_base is not None:
        exaone_base._input_embed_layer = "wte"

    adapter = None
    if ADAPTER_PATH.is_dir() and (ADAPTER_PATH / "adapter_config.json").is_file():
        from peft import PeftModel

        model = PeftModel.from_pretrained(model, str(ADAPTER_PATH))
        adapter = str(ADAPTER_PATH)
    else:
        log.warning("LoRA 어댑터가 없어 베이스 모델로만 돕니다: %s", ADAPTER_PATH)

    model.eval()

    _state["tokenizer"] = tokenizer
    _state["model"] = model
    _state["adapter"] = adapter


@asynccontextmanager
async def lifespan(_app: FastAPI):
    started = time.perf_counter()
    try:
        await asyncio.to_thread(_load)
        log.info("모델 로딩 완료 (%.1f초)", time.perf_counter() - started)
    except Exception as exc:  # noqa: BLE001
        # 여기서 죽이면 왜 못 떴는지 확인하기 어려워요. /health 로 사유를 보여줍니다.
        _state["error"] = f"{type(exc).__name__}: {exc}"
        log.error("모델 로딩 실패: %s", _state["error"])
    yield


app = FastAPI(title="my-way ai", lifespan=lifespan)


class CompleteRequest(BaseModel):
    prompt: str = Field(min_length=1)
    system: str | None = None
    max_new_tokens: int = Field(default=60, ge=1, le=MAX_NEW_TOKENS_CAP)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)

    use_adapter: bool = True
    """LoRA 어댑터를 쓸지. False면 베이스 모델로만 생성해요.

    어댑터는 고등학생 말투(반말, 짧은 서술)를 입힙니다. 중·고등학생 트랙에는
    맞지만 취준생 트랙에는 오히려 방해예요. 베이스 모델은 해요체로 상담사처럼
    되묻습니다. 트랙에 따라 골라 쓰라고 열어 둔 스위치입니다.
    """


class CompleteResponse(BaseModel):
    text: str
    elapsed_ms: int
    # 요청대로 어댑터가 적용됐는지. 어댑터가 아예 없으면 요청과 무관하게 False 예요.
    adapter_used: bool


@app.get("/health")
async def health() -> dict:
    ready = _state["model"] is not None
    return {
        "status": "up" if ready else ("error" if _state["error"] else "loading"),
        "ready": ready,
        "model": MODEL_PATH.name,
        "adapter": Path(_state["adapter"]).name if _state["adapter"] else None,
        "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
        "error": _state["error"],
    }


@app.post("/complete", response_model=CompleteResponse)
async def complete(body: CompleteRequest) -> CompleteResponse:
    if _state["error"]:
        raise HTTPException(status_code=503, detail="모델을 불러오지 못했어요.")
    if _state["model"] is None:
        raise HTTPException(status_code=503, detail="모델을 아직 불러오는 중이에요.")
    if len(body.prompt) > MAX_PROMPT_CHARS:
        raise HTTPException(status_code=413, detail="프롬프트가 너무 길어요.")

    tokenizer = _state["tokenizer"]
    model = _state["model"]

    messages = []
    if body.system:
        messages.append({"role": "system", "content": body.system})
    messages.append({"role": "user", "content": body.prompt})

    text = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )

    has_adapter = _state["adapter"] is not None
    use_adapter = body.use_adapter and has_adapter

    def _run() -> str:
        inputs = tokenizer(text, return_tensors="pt").to(model.device)
        with torch.no_grad():
            out = model.generate(
                **inputs,
                max_new_tokens=body.max_new_tokens,
                do_sample=body.temperature > 0,
                temperature=body.temperature or None,
                top_p=body.top_p,
                pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
            )
        return tokenizer.decode(
            out[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True
        ).strip()

    def _generate() -> tuple[str, int]:
        started = time.perf_counter()
        if has_adapter and not use_adapter:
            # 어댑터를 잠깐 끄고 베이스 가중치로만 생성해요. 컨텍스트를 벗어나면
            # 다시 켜지므로 다음 요청에는 영향이 없습니다.
            with model.disable_adapter():
                generated = _run()
        else:
            generated = _run()
        return generated, int((time.perf_counter() - started) * 1000)

    # 8GB VRAM. 동시에 두 개 돌리면 공유메모리로 새면서 급격히 느려져요.
    async with _gpu_lock:
        try:
            generated, elapsed = await asyncio.to_thread(_generate)
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            raise HTTPException(status_code=503, detail="GPU 메모리가 부족해요.") from None

    # 생성 결과는 로그에 남기지 않아요. 길이와 시간만. (CLAUDE.md §2.8)
    log.info("complete: %d자 생성, %dms, adapter=%s", len(generated), elapsed, use_adapter)
    return CompleteResponse(text=generated, elapsed_ms=elapsed, adapter_used=use_adapter)


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    # 127.0.0.1 고정. 외부에 열지 마세요.
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
