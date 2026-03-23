# How to Remove Large Files from Git History

If you accidentally commit a large file and GitHub rejects your push with:

```
remote: error: File path/to/bigfile.exe is 108.38 MB; this exceeds GitHub's file size limit of 100.00 MB
remote: error: GH001: Large files detected.
```

Follow these steps to completely erase the file from all history.

---

## Step 1 — Fix Your .gitignore First

Before rewriting history, make sure the file will never be committed again.

Add the offending path or pattern to `.gitignore`:

```gitignore
# Example: ignore all build output
**/build/

# Or ignore a specific binary type
*.exe
*.dll
*.bin
```

Commit the `.gitignore` fix:

```bash
git add .gitignore
git commit -m "Fix gitignore to exclude large build artifacts"
```

---

## Step 2 — Find Which Commits Contain the File

```bash
git log --all --full-history -- "path/to/bigfile.exe"
```

If you see commits listed, the file is in your history and must be rewritten.

---

## Step 3 — Rewrite History with filter-branch

This rewrites every local commit that hasn't been pushed yet, removing the
file (or entire folder) from all of them.

**Remove a single file:**

```bash
git filter-branch --index-filter \
  "git rm -rf --cached --ignore-unmatch path/to/bigfile.exe" \
  --prune-empty -- LAST_PUSHED_COMMIT..HEAD
```

**Remove an entire folder (recommended for build directories):**

```bash
git filter-branch --index-filter \
  "git rm -rf --cached --ignore-unmatch packages/desktop/build/" \
  --prune-empty -- LAST_PUSHED_COMMIT..HEAD
```

> **Where is `LAST_PUSHED_COMMIT`?**
> Run `git log --oneline` and find the last commit that already exists on
> `origin/main` (shown as `(origin/main)`). Use that commit hash.

**Windows PowerShell note:** wrap the filter command in double quotes, not single:

```powershell
git filter-branch --index-filter "git rm -rf --cached --ignore-unmatch packages/desktop/build/" --prune-empty -- 91a565d..HEAD
```

---

## Step 4 — Clean Up Backup Refs and Loose Objects

`filter-branch` saves backups under `refs/original/`. Delete them and run
garbage collection to actually purge the large blobs from the local repo:

```bash
# Delete the backup ref
git update-ref -d refs/original/refs/heads/main

# Expire all reflogs immediately
git reflog expire --expire=now --all

# Garbage collect and prune all unreachable objects
git gc --prune=now
```

Verify the file is truly gone:

```bash
git log --all --full-history -- "path/to/bigfile.exe"
# Should print nothing
```

---

## Step 5 — Force Push

Because you rewrote history, a normal push is rejected. You must force push:

```bash
git push --force
```

Or, safer if collaborators exist (fails if someone else pushed in the meantime):

```bash
git push --force-with-lease
```

---

## Alternative: git-filter-repo (Faster & Safer)

`git filter-repo` is the modern replacement for `filter-branch`. It's faster,
safer, and doesn't leave backup refs.

**Install:**

```bash
pip install git-filter-repo
# or: winget install git-filter-repo
```

**Remove a file from all history:**

```bash
git filter-repo --path path/to/bigfile.exe --invert-paths
```

**Remove a folder from all history:**

```bash
git filter-repo --path packages/desktop/build/ --invert-paths
```

Then force push:

```bash
git push --force
```

> Note: `git filter-repo` rewrites **all** history, not just unpushed commits.
> Use it when the large file was pushed to a shared repo (e.g. a colleague
> already has the bad history).

---

## Quick Reference

| Situation | Command |
|---|---|
| Find large files in history | `git log --all --full-history -- "file"` |
| Rewrite only unpushed commits | `git filter-branch --index-filter "git rm -rf --cached --ignore-unmatch FILE" --prune-empty -- HASH..HEAD` |
| Rewrite entire repo history | `git filter-repo --path FILE --invert-paths` |
| Clean up after filter-branch | `git update-ref -d refs/original/refs/heads/main` then `git gc --prune=now` |
| Push rewritten history | `git push --force` |
| Verify file is gone | `git log --all --full-history -- "file"` (no output = success) |

---

## Prevention Checklist

- [ ] Add `**/build/`, `dist/`, `node_modules/` to `.gitignore` **before** first commit
- [ ] Add large binary types: `*.exe`, `*.dll`, `*.bin`, `*.iso`, `*.zip`
- [ ] Run `git status` before committing — scan for unexpected large files
- [ ] Use `git add -p` (patch mode) to stage changes selectively
- [ ] Consider [Git LFS](https://git-lfs.github.com/) if you genuinely need to version large binaries
