# 제품 관리 어드민

개인 PC에서 실행하는 FastAPI + SQLite / React + TypeScript MVP 프로젝트입니다.
제품·기술서·촬영구성·판매구성·자료·단가·원가 관리와 엑셀 비교·선택 반영을 지원합니다.
빈 DB로 시작하며 참고 자료는 사용자가 엑셀 가져오기에서 선택하기 전까지 이관하지 않습니다.

## Docker로 실행

Docker Desktop을 실행한 뒤 프로젝트 폴더에서 아래 명령을 실행합니다. 호스트에 Python·uv·Node.js를 설치할 필요는 없습니다.

```sh
make up
```

- 화면: <http://localhost:8080>
- 상태 확인: <http://localhost:8080/api/health> (`status: ok`)
- API 문서: <http://localhost:8080/docs>

`make up`은 `docker compose up -d --build --wait`를 실행합니다. make가 없는 환경에서는 이 Docker 명령을 직접 사용할 수 있습니다.

처음에는 이미지와 의존성을 내려받아 빌드하므로 인터넷 연결이 필요합니다. 준비가 끝나면 브라우저에서 제품 등록·조회와 파일 업로드를 확인할 수 있습니다. 이후 소스 변경은 같은 실행 명령으로 다시 빌드하여 반영합니다.

```sh
docker compose ps                   # 두 서비스의 healthy 상태 확인
docker compose logs -f --tail=100    # 로그 확인, Ctrl+C로 나가기
docker compose down                 # 종료 (데이터 유지)
```

make가 있다면 `make docker-status`, `make docker-logs`, `make docker-down`도 동일하게 사용할 수 있습니다.

**기존 데이터는 그대로 사용합니다.** `.local/`의 SQLite DB·업로드 파일을 컨테이너에 연결하므로 종료·재빌드·컨테이너 재생성 후에도 남습니다. 개발 서버를 사용하던 경우 `make stop`으로 종료하고 Docker로 전환하면 됩니다. 백업은 두 실행 방식 모두 종료한 다음 `.local/` 전체를 복사합니다.

원가계산서 출력에는 제공된 `data/원가계산서-*.xlsx`가 필요합니다. `data/`는 컨테이너에 읽기 전용으로 연결하며 이미지에 포함하거나 자동 이관하지 않습니다. 다른 PC로 옮길 때는 코드와 함께 `data/` 및 필요한 `.local/`을 복사합니다. 경로가 없으면 Compose가 실행 오류를 표시합니다.

포트나 저장 경로를 바꾸려면 `.env.example`을 `.env`로 복사하고 수정합니다. 기본값이면 복사하지 않아도 됩니다.

```dotenv
PRODUCT_ADMIN_PORT=8080
PRODUCT_ADMIN_STORAGE_PATH=./.local
PRODUCT_ADMIN_DATA_PATH=./data
```

Docker는 이 PC의 `127.0.0.1`에만 포트를 열고, 화면과 API를 같은 주소에서 제공합니다. `PRODUCT_ADMIN_STORAGE_PATH`는 호스트 경로이며 컨테이너 안에서는 `/app/.local`로 연결됩니다. 아래 개발 실행 전용 `PRODUCT_ADMIN_STORAGE`와 구분합니다.

## 개발 서버로 실행

필수 도구는 **uv**, **Node.js 22.12 이상**, **npm**, **make**입니다.
Python 3.12는 uv가 관리합니다. 시스템 Python이나 전역 pip에 패키지를 설치하지 않습니다.

```sh
make dev      # 서버 + 클라이언트 백그라운드 실행
make server   # 서버만 실행
make status   # 프로세스 및 HTTP 응답 확인
make reload   # 실행 중인 서비스만 재시작
make help     # 명령 안내
make stop     # 개발 서비스 종료
```

최초 실행 시 `uv run --project server --locked`가 Python 환경을 준비합니다.
클라이언트는 처음 전체 실행할 때, 또는 package/lockfile이 바뀌었을 때 `npm ci`를 실행합니다.
의존성 설치에는 인터넷 연결이 필요합니다. 명령이 반환되어도 서비스는 백그라운드에서 실행됩니다.

- 클라이언트: <http://127.0.0.1:5173>
- 서버 상태: <http://127.0.0.1:8000/api/health>
- API 문서: <http://127.0.0.1:8000/docs>
- 클라이언트의 `/api` 요청은 Vite 개발 프록시로 FastAPI에 연결됩니다.

소스 수정은 Uvicorn reload와 Vite HMR로 자동 반영됩니다.
`make reload`는 명시적인 프로세스 재시작이며, DB나 파일을 초기화하지 않습니다.
서비스가 모두 꺼져 있으면 `make reload`는 실행 안내만 표시합니다.
이미 실행 중인 서비스를 다시 시작하는 명령은 중복 프로세스를 만들지 않습니다.
포트 충돌 시 다른 앱을 종료하지 않고 오류를 표시합니다.

## 파일 구조

```text
server/          FastAPI 앱, pyproject.toml, uv.lock, .python-version
client/          React + TypeScript + Vite, package-lock.json
compose.yaml     Docker 서버·화면 실행, 데이터 연결, 상태 점검
scripts/dev.py   로컬 프로세스 시작·상태 확인·재시작·종료
data/            제공된 업무 참고 자료 (자동 이관하지 않음)
.local/          SQLite DB와 uploads/ 원본·미리보기 (Git 제외)
.run/            실행 상태 및 server.log / client.log (Git 제외)
```

## 개발 명령

```sh
uv sync --project server --locked
uv run --project server --locked ruff check --config server/pyproject.toml server/app scripts
uv run --project server --locked ruff format --check --config server/pyproject.toml server/app scripts
npm --prefix client run build
```

서버 패키지는 `uv add --project server 패키지명`으로 관리합니다.
`uv.lock`과 `client/package-lock.json`은 저장소에 함께 관리합니다.
서비스 시작·상태 명령은 macOS/Linux용입니다.

## 요구사항

- [REQUIREMENTS.md](./REQUIREMENTS.md): 대화에서 확정한 최신 개발 요구사항
- [PRD.md](./PRD.md): 초기 업무 요구사항
- [DESIGN.md](./DESIGN.md): 화면·디자인 기준

문서가 충돌하면 후속 합의를 기록한 REQUIREMENTS.md를 우선합니다.

## 첫 업무 흐름

1. `make up` 후 <http://localhost:8080>에 접속합니다. 개발 모드에서는 `make dev`와 5173 포트를 사용합니다.
2. **설정 → 사이즈 관리**에서 사용할 사이즈를 추가한 뒤 제품을 등록합니다. 디자인·종류·prefix·색상을 입력하고 사이즈를 선택합니다. 기술서는 디자인+종류별로 생성됩니다.
3. 기술서·색상별 촬영구성을 작성하고 컬러칩 메뉴에서 JPG·PSD를 등록합니다.
4. 단가를 등록하고 제품의 원가·판매가에서 단가·소요량·택배비·포장비를 연결합니다.
5. 기술서의 판매구성에서 판매처별 단품·세트·추가옵션을 작성합니다.

기존 자료는 **엑셀 가져오기 → 초기 자료 이관**에서 옮깁니다. 단가표 → 상품기술서·제품 → 촬영구성 → 원가계산서 순서를 권장합니다. 신규 기술서 이관은 디자인·종류·prefix를 입력하고 제품 행을 기술서와 함께 선택합니다. 원가계산서는 색상과 연결할 실제 제품을 확인합니다.

## 컬러·사이즈 탐색

제품 목록은 ‘도즈’처럼 디자인별로 한 행에 모아 보여줍니다. 제품명을 누르면 종류를 선택하고, 해당 종류의 전체 컬러·사이즈를 확인할 수 있습니다. 등록된 조합의 **상세 보기**를 누르면 같은 페이지 아래에 제품정보·원가·판매가가 표시됩니다. 미등록 조합은 선택할 수 없습니다.

컬러 JPG는 연결된 종류·색상에 맞게 표시합니다. 상품기술서·촬영구성·판매구성은 표 아래의 공통 자료 링크에서 확인합니다. **컬러·사이즈 추가**는 현재 디자인·종류·prefix를 채운 등록 화면을 엽니다. 선택 상태는 새로고침·뒤로가기에도 유지되며 기존 개별 제품 주소도 계속 사용할 수 있습니다.

## 엑셀 지원 양식

- 단가표: 원단·커튼원단, 침구·솜·소품·대량소품·커튼 공임, 솜 단가, 부자재, 택배·포장, 중국 생산의 현재 단가 열.
- 상품기술서: 제공된 `차렵이불-리뉴얼` 배치의 기술 필드와 색상·사이즈. 동일 규격의 Q/K는 하나의 후보로 표시합니다.
- 촬영구성: 제공된 색상별 앞뒤·베개·패드·매트리스커버 메모 배치.
- 원가계산서: 제공된 품목 D/E/F열, 생산 항목 17~39행, 일반 판매 영역. 현재 기준 시트는 사용자가 선택합니다.
- 양식 구조가 다르거나 참고용·판매구성·과거 전용 시트는 원본으로 보관합니다. 판매구성은 화면에서 직접 작성합니다. 범용 엑셀 변환기는 제공하지 않습니다.

외부 파일의 수식은 실행하지 않습니다. 단가표의 저장 계산값은 수식 출처와 함께 검토하며 원가 항목은 현재 단가에 연결합니다. 확인되지 않은 근거는 화면에서 해결하기 전까지 계산 확인 필요 상태입니다. 제공되지 않은 침대패드 원가 파일의 값을 임의로 이관하지 않습니다.

최신 원가계산서는 제공 템플릿의 병합·표·인쇄 설정을 보존합니다. 색상별 최대 3제품을 한 시트에 배치하고 추가 제품·근거는 동일 서식으로 이어집니다. 금액은 계산된 숫자로 내보내므로 외부 파일이나 Excel 재계산에 의존하지 않습니다. 세트·도매 금액은 비우고 미산출로 표시하며 과거 자료는 원본 다운로드로 확인합니다.

## 데이터 보관·계산

- `.local/product-admin.sqlite3`와 `.local/uploads/`를 함께 보관합니다. 백업은 서비스 종료 후 `.local/` 전체를 복사하면 됩니다.
- `PRODUCT_ADMIN_STORAGE`로 별도 저장소를 지정합니다. 테스트는 임시 디렉터리와 `.run/e2e-*`를 사용해 실제 업무 DB와 격리합니다.
- 내부 ID는 유지합니다. 디자인·종류·prefix 변경은 기술서 전체에, 색상명 변경은 해당 기술서의 동일 색상 전체에 적용합니다. 기존 이름으로 자동 병합하지 않습니다.
- 원단 로스금액은 `단가 × 소요량 × 0.07`이며 기본금액에 더합니다. VAT 별도 단가는 10%를 더합니다.
- 정상판매가는 `상시할인가 / 0.6`의 100원 단위 올림입니다. 단가 변경 시 상시할인가는 유지합니다.
- 저장 버전이 다르면 덮어쓰지 않습니다. 비교 이후 기준값이 바뀌면 다시 분석합니다. 반영·재계산·이력은 한 트랜잭션입니다.
- JPG 20MB, XLSX 50MB, PSD 500MB. 미리보기와 원본 다운로드는 구분합니다.

## 검증 명령

```sh
make check
make test-server
npm --prefix client exec playwright install chromium  # 최초 1회
make test-e2e
make test
```

브라우저 테스트는 8001·5174 포트를 사용합니다. 다른 프로그램이 사용 중이면 테스트를 중단합니다. 결과는 `client/playwright-report/`와 `client/test-results/`에 생성됩니다. [검증 기록](./VERIFICATION.md)에 구현·검증 범위를 정리합니다.

Docker 화면에 동일한 브라우저 테스트를 실행하려면 **빈 테스트 저장소**를 사용합니다. 테스트는 제품·단가·파일을 등록하므로 실제 업무 주소에 실행하지 않습니다. 이 검증에는 호스트의 Node.js·npm과 설치된 Playwright Chromium이 필요합니다.

```sh
npm --prefix client ci
npm --prefix client exec playwright install chromium
# 아래 명령은 같은 터미널에서 실행합니다 (macOS/Linux).
mkdir -p .run
docker_test_storage=$(mktemp -d "$PWD/.run/docker-e2e.XXXXXX")
PRODUCT_ADMIN_STORAGE_PATH="$docker_test_storage" PRODUCT_ADMIN_PORT=8081 \
  docker compose -p product-admin-test up -d --build --wait
E2E_BASE_URL=http://127.0.0.1:8081 npm --prefix client run test:e2e
PRODUCT_ADMIN_STORAGE_PATH="$docker_test_storage" PRODUCT_ADMIN_PORT=8081 \
  docker compose -p product-admin-test down
```

## 사이즈 설정

사이드바 **설정 → 사이즈 관리**에서 이름(SS, Q/K 등), 설명, 표시 순서, 사용 여부를 등록합니다. 시즌 설정은 제공하지 않습니다. 제품 등록·수정에서는 등록된 사이즈를 선택하고, 실제 치수는 아래 상세 규격 설정에서 관리합니다. 입력 중 **사이즈 설정**을 열어 추가한 후 닫아도 작성 중인 제품은 유지됩니다.

- 초기 선택값은 비어 있습니다. 신규 설치에서는 필요한 사이즈를 먼저 등록합니다.
- 기존 제품의 사이즈는 서버 시작 시 설정 항목으로 자동 이관됩니다. 제품 ID·코드·연결된 원가 및 자료는 유지됩니다.
- 이름은 중복 등록할 수 없고 하이픈(-)은 사용할 수 없습니다. Q/K 겸용은 한 항목으로 등록합니다.
- 표시 순서가 작은 항목부터 선택 목록에 표시합니다. 같은 순서는 이름순입니다.
- 사용 중지한 사이즈는 신규 선택 목록에서 제외합니다. 기존 제품의 사이즈를 유지한 채 다른 내용을 수정할 수 있고, 설정에서 사용 재개할 수 있습니다. 삭제 기능은 제공하지 않습니다.
- 사용 중인 사이즈 이름을 바꾸면 연결된 제품코드 변경 내용을 먼저 보여줍니다. 확인 후 저장하면 모든 연결 제품을 함께 갱신하며, 미리보기 이후 연결 제품이 바뀌면 다시 확인해야 합니다.
- **엑셀 가져오기**에서도 제품 행의 사이즈를 선택합니다. 미등록 값은 기존 사이즈에 연결하거나 **사이즈 설정**에서 추가한 다음 반영합니다. 등록되지 않은 사이즈는 API와 엑셀에서도 저장할 수 없습니다.

## 상세 규격 설정

**설정 → 상세 규격 관리**에서 `150 × 200`, `50 × 70` 같은 규격(cm)을 등록합니다. 설명·표시 순서·사용 여부를 사이즈와 동일하게 관리하며, 규격은 사이즈와 별도의 공통 목록입니다.

- 제품 등록·수정에서 규격을 선택합니다. 선택 사항이므로 `선택 안 함`으로 저장할 수도 있습니다. **상세 규격 설정** 창에서 항목을 추가한 후 닫아도 제품 입력은 유지됩니다.
- 기존 제품의 규격은 시작 시 자동으로 목록에 옮겨집니다. 제품코드·기존 규격 값과 자료·원가 연결은 유지됩니다.
- 사용 중지한 규격은 신규 선택에서 제외하지만 기존 제품에서는 유지할 수 있습니다. 규격 이름 변경 시 연결 제품의 변경 내용을 확인하고 일괄 저장합니다. 제품코드에는 영향을 주지 않습니다.
- 엑셀 변경 후보의 상세 규격도 등록된 항목을 선택합니다. 미등록 값은 설정에 추가하거나 기존 규격에 연결한 뒤 반영합니다.
