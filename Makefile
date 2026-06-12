.PHONY: up down check_ts test-up test-down test

up:
	docker compose up -d --build

up_watch:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f --tail 100 | sed -u 's/^[^|]*[^ ]* //';


check_ts:
	npx tsc --noEmit;


test-up:
	docker compose -f docker-compose.test.yml up -d


test-down:
	docker compose -f docker-compose.test.yml down


test: test-up
	docker compose -f docker-compose.test.yml run --rm tester
	$(MAKE) test-down

setup-env:
	@if [ -z "$(API_TOKEN)" ]; then \
		echo "API_TOKEN is not set. Please provide it by running: make setup-env API_TOKEN=your_token_here"; \
		exit 1; \
	fi
	@echo "Creating .env file from .env.default..."
	@cp .env.default .env
	@sed -i.bak 's|<YOUR_API_TOKEN_HERE>|'$(API_TOKEN)'|g' .env
	@rm .env.bak
	@echo ".env file created successfully."
