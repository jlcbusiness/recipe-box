$scriptPath = Join-Path $PSScriptRoot 'lint-recipe-json.mjs'
& node $scriptPath @args
exit $LASTEXITCODE
