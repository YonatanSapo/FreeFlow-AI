export model=qwen3.5:9b
prompts=(
    "how to insal npm"
    "how to install npm"
    "revert 2 last commits"
    "how to install npm *concise response*"
    "does ollama support listing the top models and thier cpu memory consupmtion"
)
npm run manual -- health
npm run manual -- ps
npm run manual -- list
npm run manual -- pull $model

for prompt in "${prompts[@]}"; do
    npm run manual -- chat $model "$prompt"
done

npm run manual -- rm $model
