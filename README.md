# 2A Trivia + Separate Line Judge Topic

This repository now keeps **2A Trivia** as the main topic and hosts the line-call prototype as a **separate topic**.

## Routes

- `http://localhost:3000/` → Topic selector home
- `http://localhost:3000/trivia.html` → 2A Trivia topic (main)
- `http://localhost:3000/line-judge/` → FairCall Line Judge topic (separate)

## Why this change

The line-call analyzer is no longer mixed into the main 2A Trivia page.
It has been isolated under its own folder and route so the two projects are clearly separated.

## Run

```bash
npm start
```
