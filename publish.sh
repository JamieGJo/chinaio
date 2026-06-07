#!/bin/bash
# One-shot: create public GitHub repo from this folder and push.
cd "$(dirname "$0")" || exit 1
gh repo create chinaio --public --source=. --remote=origin --push
