# Usage:  make ship m="Your commit message"
#   1. saves (commits) your changes   2. pulls what the bot added on GitHub
#   3. pushes to GitHub (site updates in ~1 min)   4. deploys the Telegram bot
# The steps are joined with `\` into ONE command, so the single `cd` at the top applies to all of them
# (make runs each separate line in its own shell). `&&` stops at the first step that fails.
.PHONY: ship deploy-bot

ship:
	@test -n "$(m)" || { echo "Add a message:  make ship m=\"What you changed\""; exit 1; }
	cd ~/Desktop/shubhkaprateek && \
	perl -pi -e 's/\?v=\d+/?v='"$$(date +%s)"'/g' index.html 404.html && \
	git add -A && \
	{ git diff --cached --quiet && echo "Nothing new to commit — just syncing." || git commit -m "$(m)"; } && \
	git pull --no-rebase --no-edit && \
	git push && \
	cd bot && npx --yes wrangler@4 deploy && \
	echo "✅ Done. Site updates in about a minute; the bot is live now."

deploy-bot:
	cd ~/Desktop/shubhkaprateek/bot && npx --yes wrangler@4 deploy
