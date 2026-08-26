# Task 2 Report: Script de migración de usuarios (Admin SDK, un solo uso)

## Summary
Task 2 has been successfully completed. All required files have been created with exact content matching the brief, `.gitignore` and `firebase.json` have been properly updated to exclude sensitive migration files from git and Firebase Hosting deployment, and the changes have been committed.

## What Was Implemented

### 1. Modified `.gitignore`
Added the following lines at the end of the file:
```
# Migración de usuarios a Firebase Auth (script de un solo uso)
migration-scripts/service-account-key.json
migration-scripts/usuarios-email.json
migration-scripts/node_modules
```

This ensures that:
- The service account key (Firebase Admin SDK credentials) is never accidentally committed
- The user email mapping file is never accidentally committed
- Node modules installed in the migration-scripts directory are not tracked

### 2. Modified `firebase.json`
Added `"migration-scripts/**"` to the `hosting.ignore` array (alongside `"docs/**"`):
```json
"ignore": [
  "firebase.json",
  "firestore.rules",
  ".env",
  ".env.example",
  "generate-config.js",
  "README.md",
  ".gitignore",
  "node_modules",
  "**/.*",
  "**/.*/**",
  "docs/**",
  "migration-scripts/**"
]
```

This ensures that the entire migration-scripts directory is excluded from Firebase Hosting deployment.

### 3. Created `migration-scripts/package.json`
Created the package manifest with exact content:
- Name: `dgfis-gcaba-migracion-usuarios`
- Version: `1.0.0`
- Private: `true`
- Dependency: `firebase-admin: ^12.0.0`
- Description provides clear context about the script's purpose

### 4. Created `migration-scripts/migrar-usuarios.js`
Created the migration script with complete functionality:
- Reads service account credentials and user email mappings from local files
- Validates that required files exist before proceeding
- Connects to Firebase Authentication and Firestore using Admin SDK
- Handles single user testing via `--solo=username` parameter
- Migrates users by:
  - Creating users in Firebase Authentication with existing SHA-256 password hashes (single-pass algorithm)
  - Writing new profile document structure to `usuarios/{uid}`
  - Creating login lookup entries in `login_lookup/{username}` for email resolution
- Implements smart heuristics to avoid reprocessing already-migrated users
- Provides clear logging output with status indicators (✅, ⚠️, ↷, ❌)

### 5. Staged and Committed Changes
Successfully staged and committed the following files:
- `.gitignore` (modified)
- `firebase.json` (modified)
- `migration-scripts/package.json` (new file)
- `migration-scripts/migrar-usuarios.js` (new file)

**Commit SHA:** `a119d10`
**Commit Message:** "Agregar script de migración de usuarios a Firebase Authentication"

## Verification Checklist

✅ `.gitignore` modifications are correct and match the brief exactly  
✅ `firebase.json` hosting.ignore array includes `"migration-scripts/**"` in the correct position  
✅ `migration-scripts/package.json` created with exact content from brief  
✅ `migration-scripts/migrar-usuarios.js` created with exact content from brief (121 lines)  
✅ Files staged correctly without including sensitive files (service-account-key.json, usuarios-email.json)  
✅ Git status shows no sensitive files in "Changes to be committed"  
✅ Commit successfully created  
✅ Script NOT executed (as per instructions)  
✅ No `npm install` executed (as per instructions)  
✅ No secret files created (service-account-key.json, usuarios-email.json don't exist)  

## Files Changed

1. **Modified:** `.gitignore` - Added 4 lines for migration script exclusions
2. **Modified:** `firebase.json` - Added 1 entry to hosting.ignore array
3. **Created:** `migration-scripts/package.json` - 9 lines
4. **Created:** `migration-scripts/migrar-usuarios.js` - 121 lines

## Self-Review Findings

### No Issues Found
- All content matches the brief exactly
- Line endings handled correctly (CRLF warning on Windows is expected)
- Sensitive files are properly gitignored
- Script structure and comments are complete and clear
- Dependencies in package.json are correct (firebase-admin ^12.0.0)
- The script is properly executable with `#!/usr/bin/env node` shebang

### Architecture Compliance
- Script correctly interfaces with the migration system as described in the brief
- Consumes old `usuarios/{username}` collection with SHA-256 hashes
- Produces new schema: `usuarios/{uid}` profiles and `login_lookup/{username}` entries
- Admin SDK credential handling matches Firebase security best practices
- Error handling and validation are appropriate for a one-time migration script

## Conclusion

Task 2 is **COMPLETE**. All requirements from the brief have been implemented correctly:
- Security: Sensitive files excluded from git and deployment ✅
- Code: Migration script created and ready for future use ✅
- Infrastructure: Firebase configuration updated to exclude migration directory ✅
- Process: Changes properly committed with verification ✅

The migration infrastructure is now in place and ready for the next phases of the Firebase Authentication migration plan.

## Fix: Task review findings

### Issues Fixed

Two critical findings from the task review have been addressed:

#### 1. Ambiguous "Already Migrated" Detection (Finding 1)
**Problem:** The original heuristic (`if (!datos.passHash) { skip }`) could not distinguish between:
- A genuinely-already-migrated profile (new schema doc with id = uid)
- A legacy doc missing `passHash` due to data corruption

This caused silently and permanently skipping corrupted user records during migration.

**Solution:** Implemented a two-stage check:
- **First check:** `if (datos.username)` — new schema docs (created by this script) always have the `username` field; old docs never do. This cleanly identifies already-migrated profiles.
- **Second check:** `if (!datos.passHash)` — legacy docs without `passHash` (after confirming they're not already migrated) are flagged as errors requiring manual review, not silently skipped.

The improved logic now correctly handles three distinct cases:
```javascript
if (datos.username) {
  // Already migrated (new schema) → skip normally
  contador.ya_migrado++;
} else if (!datos.passHash) {
  // Legacy doc with missing hash → flag as error, skip with warning
  contador.sin_hash++;
} else {
  // Normal legacy doc → proceed with migration
  await migrarUsuario(username, datos);
}
```

#### 2. Missing Summary and Exit Code (Finding 2)
**Problem:** The script had no aggregate summary or non-zero exit code on partial failures. An operator could run the script against real accounts and miss failures by not manually scanning all console output lines.

**Solution:** 
- Added a `contador` object tracking all outcomes: `migrado`, `ya_migrado`, `sin_email`, `sin_hash`, `fallo_import`
- Added aggregate summary line at the end listing all counts:
  ```
  Listo. {X} migrados, {Y} ya migrados (salteo normal), {Z} sin email, {W} sin passHash (revisar), {V} fallos de importación.
  ```
- Added exit code logic: `process.exitCode = 1` if any errors occurred (`sin_email > 0 || sin_hash > 0 || fallo_import > 0`)
- This ensures operators can safely check the script's exit code and scripts/CI can programmatically detect failures

### Changes Made

**File:** `migration-scripts/migrar-usuarios.js` (140 lines total)

Key changes:
- `migrarUsuario()` function now returns status strings (`'sin_email'`, `'sin_hash'`, `'fallo_import'`, `'migrado'`) instead of `undefined`
- Added `contador` object initialization and per-case increments in `main()`
- Replaced simple passHash check with two-stage check distinguishing migration status
- Added comprehensive summary log and exit code check at end of `main()`

### Verification

✅ File content matches exact specification  
✅ Both findings directly addressed  
✅ Existing functionality preserved  
✅ Script still single-use, requires service account credentials  
✅ No npm install or execution performed  
✅ Changes ready for when real Firebase credentials are available
