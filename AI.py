import os
import sys
import json
import inspect
import torch
from pathlib import Path
from datasets import Dataset

# 콘솔/리다이렉션 모두에서 이모지·한글이 깨지지 않도록 UTF-8 강제
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ------------------------------------------------------------------
# 0. EXAONE 원격 코드 <-> transformers 5.x 호환성 패치
#    exaone_model/modeling_exaone.py 는 create_causal_mask 를
#    (input_embeds=..., cache_position=...) 로 호출하지만,
#    transformers 5.x 의 시그니처는 (inputs_embeds=...) 이고
#    cache_position 인자는 존재하지 않는다.
#    -> 원격 코드가 import 되기 전에 masking_utils 쪽을 감싸 준다.
# ------------------------------------------------------------------
import transformers.masking_utils as masking_utils

_orig_create_causal_mask = masking_utils.create_causal_mask
_ACCEPTED_MASK_KWARGS = set(inspect.signature(_orig_create_causal_mask).parameters)


def _patched_create_causal_mask(*args, **kwargs):
    if "input_embeds" in kwargs and "inputs_embeds" not in kwargs:
        kwargs["inputs_embeds"] = kwargs.pop("input_embeds")
    # 신버전에서 사라진 인자(cache_position 등)는 조용히 제거
    kwargs = {k: v for k, v in kwargs.items() if k in _ACCEPTED_MASK_KWARGS}
    return _orig_create_causal_mask(*args, **kwargs)


masking_utils.create_causal_mask = _patched_create_causal_mask


def _repatch_remote_modules():
    """이미 import 된 원격 모듈에도 패치된 함수를 다시 바인딩한다."""
    for name, module in list(sys.modules.items()):
        if "transformers_modules" not in name or module is None:
            continue
        if getattr(module, "create_causal_mask", None) is _orig_create_causal_mask:
            module.create_causal_mask = _patched_create_causal_mask


from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)
from transformers.trainer_utils import get_last_checkpoint
from peft import LoraConfig, prepare_model_for_kbit_training
from trl import SFTTrainer, SFTConfig

# ------------------------------------------------------------------
# 1. 오프라인 환경 및 경로 설정
# ------------------------------------------------------------------
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_DATASETS_OFFLINE"] = "1"

# TOSS_project 내부의 EXAONE 모델 경로
LOCAL_MODEL_PATH = "./exaone_model"

# Downloads 폴더의 AI Hub 학습 데이터 경로
TRAIN_DIR = r"C:\Users\dotbl\Downloads\108.진로문장완성검사 텍스트 데이터\3.개방데이터\1.데이터\Training"

# 학습 결과(LoRA 가중치) 저장 폴더
OUTPUT_DIR = "./exaone_career_lora"

# ------------------------------------------------------------------
# 2. 진로문장완성검사 JSON 데이터 로드
# ------------------------------------------------------------------
def load_aihub_dataset(target_dir):
    print(f"📂 [{target_dir}] 하위 라벨링 JSON 탐색 및 파싱 시작...\n")
    
    root_path = Path(target_dir)
    if not root_path.exists():
        raise FileNotFoundError(f"❌ 경로를 찾을 수 없습니다: {target_dir}")

    all_jsons = list(root_path.rglob("*.json"))
    labeled_jsons = [
        p for p in all_jsons 
        if "02.라벨링데이터" in str(p) or "TL" in str(p) or "라벨링" in str(p)
    ]
    
    target_files = labeled_jsons if labeled_jsons else all_jsons
    print(f"🔍 총 {len(target_files)}개의 라벨링 JSON 파일을 처리합니다.")

    formatted_data = []
    success_files = 0
    failed_files = 0

    for file_path in target_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)

            if not isinstance(raw_data, dict):
                failed_files += 1
                continue

            user_text = ""
            assistant_text = ""

            if "comment" in raw_data and isinstance(raw_data["comment"], dict):
                c_obj = raw_data["comment"]
                user_text = str(c_obj.get("question", "")).strip()
                assistant_text = str(c_obj.get("answer_1", "") or c_obj.get("answer_full", "")).strip()

            elif "test" in raw_data and isinstance(raw_data["test"], list):
                meta = raw_data.get("meta", {})
                q_map = {}
                for k, v in meta.items():
                    if "question_meta" in k and isinstance(v, list):
                        for q_item in v:
                            q_id = q_item.get("question_id")
                            q_content = q_item.get("question_content")
                            if q_id and q_content:
                                q_map[q_id] = q_content

                for item in raw_data["test"]:
                    q_id = item.get("question_id")
                    u_t = q_map.get(q_id, "")
                    a_t = item.get("answer_1") or item.get("answer_full", "")
                    if u_t and a_t:
                        formatted_data.append({
                            "messages": [
                                {"role": "system", "content": "너는 전문 커리어 컨설턴트 및 진로 분석 AI 분석관이야."},
                                {"role": "user", "content": f"다음 제시어를 이어 문장을 완성해 주세요: {u_t}"},
                                {"role": "assistant", "content": a_t}
                            ]
                        })
                success_files += 1
                continue

            else:
                user_text = str(raw_data.get("question", "") or raw_data.get("prompt", "")).strip()
                assistant_text = str(raw_data.get("answer_1", "") or raw_data.get("answer_full", "") or raw_data.get("response", "")).strip()

            if user_text and assistant_text:
                formatted_data.append({
                    "messages": [
                        {"role": "system", "content": "너는 전문 커리어 컨설턴트 및 진로 분석 AI 분석관이야."},
                        {"role": "user", "content": f"다음 제시어를 이어 문장을 완성해 주세요: {user_text}"},
                        {"role": "assistant", "content": assistant_text}
                    ]
                })
                success_files += 1
            else:
                failed_files += 1

        except Exception:
            failed_files += 1

    print("\n" + "=" * 55)
    print(f"📊 데이터 수집 결과 요약")
    print(f"  - 성공 처리 파일: {success_files} 개")
    print(f"  - 실패/건너뛴 파일: {failed_files} 개")
    print(f"  - 총 추출된 학습 샘플 수: {len(formatted_data)} 개")
    print("=" * 55 + "\n")

    if not formatted_data:
        raise ValueError("❌ 학습 가능한 데이터 샘플을 단 하나도 찾지 못했습니다.")

    return Dataset.from_list(formatted_data)

train_dataset = load_aihub_dataset(TRAIN_DIR)

# ------------------------------------------------------------------
# 3. 토크나이저 및 QLoRA 4-bit 모델 로드
# ------------------------------------------------------------------
print("🚀 EXAONE 모델 및 토크나이저 로딩 중...")
tokenizer = AutoTokenizer.from_pretrained(
    LOCAL_MODEL_PATH, 
    local_files_only=True,
    trust_remote_code=True
)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

tokenizer.model_max_length = 1024

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
    bnb_4bit_use_double_quant=True,
)

model = AutoModelForCausalLM.from_pretrained(
    LOCAL_MODEL_PATH,
    quantization_config=bnb_config,
    device_map={"": 0},
    local_files_only=True,
    trust_remote_code=True
)

_repatch_remote_modules()

# EXAONE 원격 코드는 입력 임베딩을 self.wte 로 두면서 _input_embed_layer 를
# 지정하지 않아 transformers 5.x 가 임베딩을 찾지 못한다(기본값 "embed_tokens").
# 이 상태로는 enable_input_require_grads() 가 무시되어
# gradient checkpointing 사용 시 LoRA 로 그래디언트가 흐르지 않는다.
_exaone_module = sys.modules.get(type(model).__module__)
_exaone_base = getattr(_exaone_module, "ExaonePreTrainedModel", None)
if _exaone_base is not None and getattr(_exaone_base, "_input_embed_layer", None) != "wte":
    _exaone_base._input_embed_layer = "wte"

# k-bit 학습 준비 및 임베딩 그래디언트 전달 허용 설정
model = prepare_model_for_kbit_training(
    model, use_gradient_checkpointing=True
)
model.config.use_cache = False
model.enable_input_require_grads()

# ------------------------------------------------------------------
# 4. LoRA 어댑터 설정
# ------------------------------------------------------------------
peft_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

# ------------------------------------------------------------------
# 5. SFTTrainer 설정 및 파인튜닝 실행
# ------------------------------------------------------------------
training_args = SFTConfig(
    output_dir=OUTPUT_DIR,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=1,
    learning_rate=2e-4,
    num_train_epochs=1,
    logging_steps=10,
    save_strategy="steps",
    save_steps=500,
    save_total_limit=3,
    fp16=not torch.cuda.is_bf16_supported(),
    bf16=torch.cuda.is_bf16_supported(),
    optim="paged_adamw_8bit",
    max_length=128,
    gradient_checkpointing=True,
    gradient_checkpointing_kwargs={"use_reentrant": False},
)

trainer = SFTTrainer(
    model=model,
    train_dataset=train_dataset,
    peft_config=peft_config,
    processing_class=tokenizer,
    args=training_args,
)

# 이전 실행이 중단된 경우 마지막 체크포인트에서 이어서 학습
last_checkpoint = get_last_checkpoint(OUTPUT_DIR) if os.path.isdir(OUTPUT_DIR) else None

if last_checkpoint:
    print(f"\n>>> [체크포인트 발견] {last_checkpoint} 에서 학습을 재개합니다.")
else:
    print("\n>>> [오프라인 QLoRA 파인튜닝 시작]")

trainer.train(resume_from_checkpoint=last_checkpoint)

# ------------------------------------------------------------------
# 6. final LoRA 가중치 저장
# ------------------------------------------------------------------
trainer.model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
print(f"\n🎉 [학습 완료] LoRA 결과가 [{OUTPUT_DIR}] 폴더에 성공적으로 저장되었습니다.")