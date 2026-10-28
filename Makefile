# Usage:  make ship m="Your commit message"
#   1. saves (commits) your changes   2. pulls what the bot added on GitHub
#   3. pushes to GitHub (site updates in ~1 min)   4. redeploys the Telegram bot only if bot/ changed
.PHONY: ship deploy-bot

ship:
	cd ~/Desktop/shubhkaprateek
	@test -n "$(m)" || { echo "Add a message:  make ship m=\"What you changed\""; exit 1; }
	git add -A
	@if git diff --cached --quiet; then echo "Nothing new to commit — just syncing."; else git commit -m "$(m)"; fi
	git pull --no-rebase --no-edit
	@BOT_CHANGED=$$(git diff --name-only origin/main HEAD -- bot/); \
	git push && \
	if [ -n "$$BOT_CHANGED" ]; then echo "Bot changed → deploying it"; cd bot && npx --yes wrangler@4 deploy; else echo "Bot unchanged → no deploy needed"; fi
	@echo "✅ Done. Site updates in about a minute."

deploy-bot:
	cd bot && npx --yes wrangler@4 deploy
