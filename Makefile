# Usage:  make ship m="Your commit message"
#   1. saves (commits) your changes   2. pulls what the bot added on GitHub
#   3. builds the latest data into index.html (after the pull, so it includes the bot's changes —
#      if the bot changed data at the same moment, the clash in index.html is fixed automatically)
#   4. pushes to GitHub (site updates in ~1 min)   5. deploys the Telegram bot
# The steps are joined with `\` into ONE command, so the single `cd` at the top applies to all of them
# (make runs each separate line in its own shell). `&&` stops at the first step that fails.
.PHONY: ship deploy-bot

ship:
	@test -n "$(m)" || { echo "Add a message:  make ship m=\"What you changed\""; exit 1; }
	cd ~/Desktop/shubhkaprateek && \
	git add -A && \
	{ git diff --cached --quiet && echo "Nothing new to commit — just syncing." || git commit -m "$(m)"; } && \
	{ git pull --no-rebase --no-edit || { \
	    if git diff --name-only --diff-filter=U | grep -qvx 'index.html'; then echo "❌ Conflict in a file other than index.html — fix it (or ask Claude), then run make ship again"; exit 1; fi; \
	    echo "↻ Bot changed data at the same time: rebuilding the products in index.html from both versions"; \
	    git checkout --ours index.html; }; } && \
	node tools/snapshot.mjs && \
	perl -pi -e 's/(styles\.css|app\.js)\?v=\d+/$$1?v='"$$(date +%s)"'/g' index.html 404.html && \
	git add -A && \
	{ git diff --cached --quiet || git commit --no-edit -m "Build latest data into the page"; } && \
	git push && \
	cd bot && npx --yes wrangler@4 deploy && \
	echo "✅ Done. Site updates in about a minute; the bot is live now."

deploy-bot:
	cd ~/Desktop/shubhkaprateek/bot && npx --yes wrangler@4 deploy
