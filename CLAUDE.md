# Vimperium

## Comments

The owner never reads the code. Comments exist only for the agent that works here next, which remembers nothing between sessions.

- Write a comment only for what the code can't say: why it is this way, a constraint or trap that isn't visible at the call site, what breaks if it's changed, what was tried and failed.
- No restating what the code does, no section banners, no change history ("was X", "v12 moved…") — git has that. No prose polish: terse notes, one or two lines.
- A file header is one or two lines on what the file owns and where its other half lives, if it has one.
- When editing a file, delete comments there that break these rules and fix ones the change made stale. Don't run comment-only passes over files the task doesn't touch.
- Not comments, leave alone: the `"` lines inside `DEFAULT_VIM_KEYMAP` (shown to the user in Settings → Keyboard Shortcuts), directive comments (`eslint-disable`, `@ts-expect-error`), and text inside injected script strings.

## Changing a default Vim key

Defaults live in `src/shared/vim-default-keymap.ts`; saved keymaps are migrated, so a changed default needs all of:

1. Edit `DEFAULT_VIM_KEYMAP` (the binding and the `"` help text around it).
2. Add `V<old>_DEFAULT_KEYS` with the previous defaults of the commands that moved, and wire it into `oldDefault`, `movedInV13`, `bringsKeys` and the `fromVersion` union in `migrateVimKeymap`. New commands go into a `NEW_IN_V<new>` set wired into `existed` and `bringsKeys`.
3. In `src/main/settings-store.ts`: bump `VIM_KEYMAP_VERSION`, the `marker`, `byMarker`, and add the previous marker to the `migrated.add` list; new commands also go into `VIM_KEYMAP_VERSION_MARKS`.

There are no tests: check a migration by running `migrateVimKeymap` on a hand-made old text with `npx tsx`.

## Checks

All three must be clean before a change is done — a type error is fixed, never listed as known:

- `npx tsc --noEmit -p tsconfig.node.json`
- `npx tsc --noEmit -p tsconfig.web.json`
- `npx electron-vite build`
