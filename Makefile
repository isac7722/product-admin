.DEFAULT_GOAL := help

UV ?= uv

.PHONY: dev server status reload stop help

dev: ## 서버와 클라이언트 전체 실행
	@$(UV) run --project server --locked python scripts/dev.py dev

server: ## FastAPI 서버만 실행
	@$(UV) run --project server --locked python scripts/dev.py server

status: ## 실행 상태와 접속 주소 확인
	@$(UV) run --project server --locked python scripts/dev.py status

reload: ## 실행 중인 서비스 재시작
	@$(UV) run --project server --locked python scripts/dev.py reload

stop: ## 이 프로젝트의 개발 서비스 종료
	@$(UV) run --project server --locked python scripts/dev.py stop

help: ## 사용 가능한 명령 확인
	@printf '%s\n' '제품 관리 어드민 — 로컬 개발' ''
	@awk 'BEGIN {FS = ":.*## "} /^[a-z][a-z0-9-]*:.*## / {printf "  make %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf '%s\n' '' '  Docker:     http://localhost:8080 (PRODUCT_ADMIN_PORT로 변경)' '  개발 UI:    http://127.0.0.1:5173' '  개발 API:   http://127.0.0.1:8000/docs' '' 'Docker 실행: Docker Compose 필요' '개발 실행: uv, Node.js 22.12+ 또는 24+, npm 필요'

.PHONY: up docker-down docker-status docker-logs

up: ## Docker 빌드·실행 및 준비 상태 확인
	@docker compose up -d --build --wait

docker-down: ## Docker 종료 (DB·업로드 유지)
	@docker compose down

docker-status: ## Docker 실행·건강 상태 확인
	@docker compose ps

docker-logs: ## Docker 로그 실시간 확인 (Ctrl+C로 나가기)
	@docker compose logs -f --tail=100

.PHONY: check test test-server test-e2e

check: ## Python 검사 및 프론트 타입 검사·빌드
	@$(UV) run --project server --locked ruff check --config server/pyproject.toml server/app server/tests scripts
	@$(UV) run --project server --locked ruff format --check --config server/pyproject.toml server/app server/tests scripts
	@npm --prefix client run build

test: test-server test-e2e ## 서버·브라우저 전체 테스트 (실제 DB와 격리)

test-server: ## API·계산·실제 엑셀 통합 테스트
	@$(UV) run --project server --locked pytest -c server/pyproject.toml server/tests -q

test-e2e: ## Playwright 브라우저 업무·접근성 테스트
	@npm --prefix client run test:e2e
