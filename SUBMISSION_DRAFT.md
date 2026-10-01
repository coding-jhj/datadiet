# 마지막 B 제출 초안 (빈칸 [ ] 는 본인이 채움)

## 앱 한 문장 (BRB-C01)
소형 AI 모델을 미세조정하는 사람이 학습 예산이 제한될 때 어떤 예시를 쓸지 고르도록, 논문(Effects of Data Selection under a Fixed Token Budget)의 세 가지 선택 전략 비교 결과(신뢰구간·프로토콜별 수치)를 그대로 써서 목표별 추천과 신뢰도를 알려 주고 학습용 파일을 만들어 준다.

## 사용자가 할 일 세 가지 (BRB-C02)
1. 무엇을 잘하게 만들고 싶은지 목표를 고른다.
2. 예시 파일을 올리거나 샘플을 눌러 데이터 건강 검진을 본다.
3. 학습 규모를 정하고 세 전략의 선택을 비교해 학습 파일을 내려받는다.

## 제출물
- 결과물 URL: [ Vercel 주소 ]
- 실행 묶음: datadiet-submission.zip (비밀번호 없음)
- 12번 사이트 대표작 자리: [ 링크 ]
- 동료 한 줄 감상(이름 없이): [ ]

## 짧은 확인 방법 (BRB-C13)
- 위치: URL 첫 화면, 또는 ZIP 안 `dist/` 폴더 (`cd dist && python3 -m http.server 8080` → http://localhost:8080). 자세한 표는 README "Quick check".
- 해 보기: ① Try a sample → Reason through problems 선택 ② Continue 두 번 ③ Download 버튼.
- 통과: 첫 화면에 논문 제목과 한 문장 / 건강 검진 카드("We found N usable examples") / 결과 "We picked N examples for you."와 "Promising, not proven" / 내려받은 JSONL의 줄 수 = N / 목표를 Follow instructions로 바꾸면 "No gain seen" / 잘못된 입력(hello)에도 앱이 멈추지 않고 안내 문구.

## AI와 나의 판단 (BRB-C14)
① AI에게 맡긴 일: 논문 코드(select_data.py)의 TypeScript 이식, 화면·테스트 코드 작성, 논문 CSV에서 근거 수치 자동 추출, 접근성·모바일 점검.
② 내가 직접 판단한 일: 앱 주제(DataDiet)와 대상(처음 미세조정하는 사람), 영어 전용, 논문과 코드가 다른 부분은 코드 동작을 따르기, 3-seed 합산에 "mixed protocol" 표시, 사용성 테스트 대상과 결과 해석, [ ]
③ AI 제안을 따르지 않은 일: [ 실제로 거절·수정한 것을 적기. 없다면 왜 없었는지 ] (예: 처음 AI가 만든 임시 다양성 알고리즘은 논문과 달라 버림)
